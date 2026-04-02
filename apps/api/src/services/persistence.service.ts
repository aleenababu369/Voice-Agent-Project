import { Pool } from "pg";
import type { CallEvent, CallMetric, CallSession, FollowUpStatus, SessionFollowUp } from "../../../../packages/contracts/src/index.ts";
import type { PersistenceMetricsSummary, TurnApplicationResult } from "../domain/persistence.ts";

class PersistenceService {
  private readonly sessions = new Map<string, CallSession>();
  private readonly metrics: CallMetric[] = [];
  private readonly events: CallEvent[] = [];
  private pool: Pool | null = null;
  private dbUnavailable = false;

  async createSession(input: Omit<CallSession, "status" | "consentCaptured" | "turnCount" | "createdAt" | "updatedAt" | "followUp">) {
    const now = new Date().toISOString();
    const session: CallSession = {
      ...input,
      status: "consent_pending",
      consentCaptured: false,
      followUp: { status: "new", updatedAt: now },
      turnCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.sessions.set(session.id, session);
    await this.persistSession(session);
    await this.recordEvent({
      sessionId: session.id,
      type: "session_created",
      payload: {
        tenantId: session.tenantId,
        workflow: session.workflow,
        domain: session.domain,
        agentProfileId: session.agentProfileId ?? null,
        followUpStatus: session.followUp.status
      },
      createdAt: now
    });
    return session;
  }

  async getSession(id: string) {
    const pool = await this.getPool();
    if (pool) {
      const result = await pool.query("select * from call_sessions where id = $1", [id]);
      const row = result.rows[0];
      if (!row) return undefined;
      const session = this.mapSessionRow(row as Record<string, unknown>);
      this.sessions.set(session.id, session);
      return session;
    }
    return this.sessions.get(id);
  }

  async listSessions(tenantId?: string) {
    const pool = await this.getPool();
    if (pool) {
      const query = tenantId
        ? { text: "select * from call_sessions where tenant_id = $1 order by created_at desc limit 100", values: [tenantId] }
        : { text: "select * from call_sessions order by created_at desc limit 100", values: [] as string[] };
      const result = await pool.query(query.text, query.values);
      return result.rows.map((row) => this.mapSessionRow(row as Record<string, unknown>));
    }
    const sessions = [...this.sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return tenantId ? sessions.filter((session) => session.tenantId === tenantId) : sessions;
  }

  async captureConsent(id: string, granted: boolean) {
    const session = await this.getSession(id);
    if (!session) return undefined;
    const updated: CallSession = { ...session, consentCaptured: granted, status: granted ? "active" : "failed", updatedAt: new Date().toISOString() };
    this.sessions.set(id, updated);
    await this.persistSession(updated);
    await this.recordEvent({ sessionId: id, type: "consent_updated", payload: { tenantId: updated.tenantId, consentGranted: granted, status: updated.status }, createdAt: updated.updatedAt });
    return updated;
  }

  async applyTurn(id: string, transcript: string, result: TurnApplicationResult) {
    const session = await this.getSession(id);
    if (!session) return undefined;
    const statusMap: Record<TurnApplicationResult["decision"]["action"], CallSession["status"]> = {
      ask_consent: "consent_pending",
      ask_clarification: "clarification_required",
      respond: "active",
      execute_task: "active",
      escalate_to_human: "escalated",
      complete_call: "completed"
    };
    const base: CallSession = { ...session, status: statusMap[result.decision.action], slotState: result.slotState, lastTranscript: transcript, turnCount: session.turnCount + 1, updatedAt: new Date().toISOString() };
    const updated: CallSession = result.decision.escalationSummary ? { ...base, escalationSummary: result.decision.escalationSummary } : (() => { const { escalationSummary: _ignored, ...rest } = base; return rest; })();
    this.sessions.set(id, updated);
    await this.persistSession(updated);
    await this.recordEvent({
      sessionId: id,
      type: result.decision.action === "complete_call" ? "workflow_completed" : "turn_processed",
      payload: {
        tenantId: updated.tenantId,
        action: result.decision.action,
        reason: result.decision.reason,
        confidence: result.decision.confidence,
        missingSlots: result.decision.missingSlots ?? [],
        collected: updated.slotState.collected,
        aiMetadata: result.decision.aiMetadata ?? null
      },
      createdAt: updated.updatedAt
    });
    if (result.decision.escalationSummary) {
      await this.recordEvent({
        sessionId: id,
        type: "escalation_triggered",
        payload: { tenantId: updated.tenantId, ...result.decision.escalationSummary as unknown as Record<string, unknown> },
        createdAt: updated.updatedAt
      });
    }
    return updated;
  }

  async updateFollowUp(id: string, input: { status: FollowUpStatus; assignee?: string; notes?: string }) {
    const session = await this.getSession(id);
    if (!session) return undefined;
    const followUp: SessionFollowUp = {
      status: input.status,
      ...(input.assignee ? { assignee: input.assignee } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      updatedAt: new Date().toISOString()
    };
    const updated: CallSession = { ...session, followUp, updatedAt: followUp.updatedAt };
    this.sessions.set(id, updated);
    await this.persistSession(updated);
    await this.recordEvent({
      sessionId: id,
      type: "follow_up_updated",
      payload: {
        tenantId: updated.tenantId,
        followUpStatus: followUp.status,
        assignee: followUp.assignee ?? null,
        notes: followUp.notes ?? null
      },
      createdAt: followUp.updatedAt
    });
    return updated;
  }

  async recordMetric(metric: CallMetric) {
    this.metrics.push(metric);
    const pool = await this.getPool();
    if (!pool) return;
    await pool.query(
      `insert into call_metrics (session_id, turn_switch_latency_ms, asr_confidence, nlu_confidence, workflow_completed, escalated) values ($1, $2, $3, $4, $5, $6)`,
      [metric.sessionId, metric.turnSwitchLatencyMs, metric.asrConfidence, metric.nluConfidence, metric.workflowCompleted, metric.escalated]
    );
  }

  async getMetricsSummary(tenantId?: string): Promise<PersistenceMetricsSummary> {
    const pool = await this.getPool();
    if (pool) {
      const result = tenantId
        ? await pool.query(
          `select count(*)::int as total_turns,
                  coalesce(round(avg(m.turn_switch_latency_ms)), 0)::int as average_latency_ms,
                  coalesce(round(avg(m.asr_confidence)::numeric, 2), 0)::float as average_asr_confidence,
                  coalesce(round(avg(m.nlu_confidence)::numeric, 2), 0)::float as average_nlu_confidence,
                  coalesce(round(avg(case when m.escalated then 1 else 0 end)::numeric, 2), 0)::float as escalation_rate,
                  coalesce(round(avg(case when m.workflow_completed then 1 else 0 end)::numeric, 2), 0)::float as completion_rate
             from call_metrics m
             join call_sessions s on s.id = m.session_id
            where s.tenant_id = $1`,
          [tenantId]
        )
        : await pool.query(
          `select count(*)::int as total_turns,
                  coalesce(round(avg(turn_switch_latency_ms)), 0)::int as average_latency_ms,
                  coalesce(round(avg(asr_confidence)::numeric, 2), 0)::float as average_asr_confidence,
                  coalesce(round(avg(nlu_confidence)::numeric, 2), 0)::float as average_nlu_confidence,
                  coalesce(round(avg(case when escalated then 1 else 0 end)::numeric, 2), 0)::float as escalation_rate,
                  coalesce(round(avg(case when workflow_completed then 1 else 0 end)::numeric, 2), 0)::float as completion_rate
             from call_metrics`
        );
      return result.rows[0] as PersistenceMetricsSummary;
    }

    const scopedMetrics = tenantId
      ? this.metrics.filter((metric) => this.sessions.get(metric.sessionId)?.tenantId === tenantId)
      : this.metrics;
    const total = scopedMetrics.length;
    const averageLatency = total === 0 ? 0 : Math.round(scopedMetrics.reduce((sum, metric) => sum + metric.turnSwitchLatencyMs, 0) / total);
    const averageAsrConfidence = total === 0 ? 0 : Number((scopedMetrics.reduce((sum, metric) => sum + metric.asrConfidence, 0) / total).toFixed(2));
    const averageNluConfidence = total === 0 ? 0 : Number((scopedMetrics.reduce((sum, metric) => sum + metric.nluConfidence, 0) / total).toFixed(2));
    const escalations = scopedMetrics.filter((metric) => metric.escalated).length;
    const completions = scopedMetrics.filter((metric) => metric.workflowCompleted).length;
    return {
      total_turns: total,
      average_latency_ms: averageLatency,
      average_asr_confidence: averageAsrConfidence,
      average_nlu_confidence: averageNluConfidence,
      escalation_rate: total === 0 ? 0 : Number((escalations / total).toFixed(2)),
      completion_rate: total === 0 ? 0 : Number((completions / total).toFixed(2))
    };
  }

  async listEvents(sessionId: string) {
    const pool = await this.getPool();
    if (pool) {
      const result = await pool.query("select session_id, event_type, payload, created_at from call_events where session_id = $1 order by created_at asc", [sessionId]);
      return result.rows.map((row) => ({ sessionId: row.session_id as string, type: row.event_type as CallEvent["type"], payload: row.payload as Record<string, unknown>, createdAt: new Date(row.created_at as string).toISOString() }));
    }
    return this.events.filter((event) => event.sessionId === sessionId);
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  private async recordEvent(event: CallEvent) {
    this.events.push(event);
    const pool = await this.getPool();
    if (!pool) return;
    await pool.query("insert into call_events (session_id, event_type, payload, created_at) values ($1, $2, $3::jsonb, $4)", [event.sessionId, event.type, JSON.stringify(event.payload), event.createdAt]);
  }

  private async persistSession(session: CallSession) {
    const pool = await this.getPool();
    if (!pool) return;
    await pool.query(
      `insert into call_sessions (id, tenant_id, domain, workflow, agent_profile_id, status, language, phone_number, display_name, consent_captured, slot_state, follow_up, turn_count, last_transcript, escalation_summary, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15::jsonb, $16, $17)
       on conflict (id) do update
           set tenant_id = excluded.tenant_id,
               agent_profile_id = excluded.agent_profile_id,
               status = excluded.status,
               consent_captured = excluded.consent_captured,
               slot_state = excluded.slot_state,
               follow_up = excluded.follow_up,
               turn_count = excluded.turn_count,
               last_transcript = excluded.last_transcript,
               escalation_summary = excluded.escalation_summary,
               updated_at = excluded.updated_at`,
      [
        session.id,
        session.tenantId,
        session.domain,
        session.workflow,
        session.agentProfileId ?? null,
        session.status,
        session.language,
        session.participant.phoneNumber,
        session.participant.displayName ?? null,
        session.consentCaptured,
        JSON.stringify(session.slotState),
        JSON.stringify(session.followUp),
        session.turnCount,
        session.lastTranscript ?? null,
        JSON.stringify(session.escalationSummary ?? null),
        session.createdAt,
        session.updatedAt
      ]
    );
  }

  private mapSessionRow(row: Record<string, unknown>): CallSession {
    const participant = row.display_name ? { phoneNumber: row.phone_number as string, displayName: row.display_name as string } : { phoneNumber: row.phone_number as string };
    const followUp = (row.follow_up as SessionFollowUp | undefined) ?? { status: "new", updatedAt: new Date(row.updated_at as string).toISOString() };
    const sessionBase: CallSession = {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      domain: row.domain as CallSession["domain"],
      workflow: row.workflow as CallSession["workflow"],
      ...(row.agent_profile_id ? { agentProfileId: row.agent_profile_id as string } : {}),
      status: row.status as CallSession["status"],
      language: row.language as CallSession["language"],
      participant,
      consentCaptured: Boolean(row.consent_captured),
      slotState: row.slot_state as CallSession["slotState"],
      followUp,
      turnCount: Number(row.turn_count ?? 0),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString()
    };
    const withTranscript: CallSession = row.last_transcript ? { ...sessionBase, lastTranscript: row.last_transcript as string } : sessionBase;
    if (row.escalation_summary) return { ...withTranscript, escalationSummary: row.escalation_summary as NonNullable<CallSession["escalationSummary"]> };
    return withTranscript;
  }

  private async getPool() {
    if (this.dbUnavailable) return null;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return null;
    if (!this.pool) {
      this.pool = new Pool({ connectionString });
      try {
        await this.pool.query("select 1");
      } catch (error) {
        this.dbUnavailable = true;
        await this.pool.end();
        this.pool = null;
        console.warn("PostgreSQL unavailable, falling back to in-memory persistence.", error);
        return null;
      }
    }
    return this.pool;
  }
}

export const persistenceService = new PersistenceService();
