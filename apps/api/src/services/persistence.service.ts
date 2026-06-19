import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { Campaign, CampaignStatus, CallDirection, CallEvent, CallMetric, CallSession, Contact, FollowUpStatus, Operation, OperationStatus, OperationType, Prospect, ProspectStatus, SessionFollowUp, SessionOutcome, SessionOutcomeType } from "../../../../packages/contracts/src/index.ts";
import type { PersistenceMetricsSummary, TurnApplicationResult } from "../domain/persistence.ts";

const operationReferencePrefix: Record<OperationType, string> = {
  appointment: "APT",
  enquiry: "ENQ",
  visitor_routing: "VIS",
  reminder_ack: "REM",
  follow_up: "FUP",
  generic: "OPS"
};

class PersistenceService {
  private readonly sessions = new Map<string, CallSession>();
  private readonly metrics: CallMetric[] = [];
  private readonly events: CallEvent[] = [];
  private readonly contacts = new Map<string, Contact>();
  private readonly operations = new Map<string, Operation>();
  private readonly prospects = new Map<string, Prospect>();
  private readonly campaigns = new Map<string, Campaign>();
  private pool: Pool | null = null;
  private dbUnavailable = false;

  async createSession(input: Omit<CallSession, "status" | "consentCaptured" | "turnCount" | "createdAt" | "updatedAt" | "followUp" | "outcome">) {
    const now = new Date().toISOString();
    const session: CallSession = {
      ...input,
      direction: input.direction ?? "inbound",
      status: "consent_pending",
      consentCaptured: false,
      followUp: { status: "new", updatedAt: now },
      outcome: { type: "none", updatedAt: now },
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
        direction: session.direction,
        agentProfileId: session.agentProfileId ?? null,
        followUpStatus: session.followUp.status,
        outcomeType: session.outcome.type
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
        transcript,
        responseText: result.decision.responseText,
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

  async updateOutcome(id: string, input: { type: SessionOutcomeType; scheduledFor?: string; referenceId?: string; notes?: string }) {
    const session = await this.getSession(id);
    if (!session) return undefined;
    const outcome: SessionOutcome = {
      type: input.type,
      ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
      ...(input.referenceId ? { referenceId: input.referenceId } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      updatedAt: new Date().toISOString()
    };
    const updated: CallSession = { ...session, outcome, updatedAt: outcome.updatedAt };
    this.sessions.set(id, updated);
    await this.persistSession(updated);
    await this.recordEvent({
      sessionId: id,
      type: "outcome_updated",
      payload: {
        tenantId: updated.tenantId,
        outcomeType: outcome.type,
        scheduledFor: outcome.scheduledFor ?? null,
        referenceId: outcome.referenceId ?? null,
        notes: outcome.notes ?? null
      },
      createdAt: outcome.updatedAt
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

  async createContact(tenantId: string, input: { name: string; phoneNumber: string; notes?: string | undefined }) {
    const now = new Date().toISOString();
    const contact: Contact = {
      id: randomUUID(),
      tenantId,
      name: input.name,
      phoneNumber: input.phoneNumber,
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now
    };
    this.contacts.set(contact.id, contact);
    const pool = await this.getPool();
    if (pool) {
      await pool.query(
        "insert into contacts (id, tenant_id, name, phone_number, notes, created_at) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing",
        [contact.id, contact.tenantId, contact.name, contact.phoneNumber, contact.notes ?? null, contact.createdAt]
      );
    }
    return contact;
  }

  async getContact(id: string) {
    const pool = await this.getPool();
    if (pool) {
      const result = await pool.query("select * from contacts where id = $1", [id]);
      const row = result.rows[0];
      if (row) return this.mapContactRow(row as Record<string, unknown>);
    }
    return this.contacts.get(id);
  }

  async listContacts(tenantId: string) {
    const pool = await this.getPool();
    if (pool) {
      const result = await pool.query("select * from contacts where tenant_id = $1 order by created_at desc", [tenantId]);
      return result.rows.map((row) => this.mapContactRow(row as Record<string, unknown>));
    }
    return [...this.contacts.values()].filter((contact) => contact.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createOperation(input: { tenantId: string; sessionId: string; agentProfileId?: string; prospectId?: string; campaignId?: string; type: OperationType; payload: Record<string, string>; scheduledFor?: string; status?: OperationStatus }) {
    const now = new Date().toISOString();
    const id = randomUUID();
    const operation: Operation = {
      id,
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      ...(input.agentProfileId ? { agentProfileId: input.agentProfileId } : {}),
      ...(input.prospectId ? { prospectId: input.prospectId } : {}),
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
      type: input.type,
      status: input.status ?? "created",
      payload: input.payload,
      referenceId: `${operationReferencePrefix[input.type]}-${id.slice(0, 8).toUpperCase()}`,
      ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
      createdAt: now,
      updatedAt: now
    };
    this.operations.set(operation.id, operation);
    const pool = await this.getPool();
    if (pool) {
      await pool.query(
        `insert into operations (id, session_id, tenant_id, agent_profile_id, prospect_id, campaign_id, type, status, payload, reference_id, scheduled_for, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13) on conflict (id) do nothing`,
        [operation.id, operation.sessionId, operation.tenantId, operation.agentProfileId ?? null, operation.prospectId ?? null, operation.campaignId ?? null, operation.type, operation.status, JSON.stringify(operation.payload), operation.referenceId, operation.scheduledFor ?? null, operation.createdAt, operation.updatedAt]
      );
    }
    await this.recordEvent({
      sessionId: operation.sessionId,
      type: "operation_created",
      payload: { tenantId: operation.tenantId, operationId: operation.id, type: operation.type, referenceId: operation.referenceId, status: operation.status },
      createdAt: now
    });
    return operation;
  }

  async getOperation(id: string) {
    const pool = await this.getPool();
    if (pool) {
      const result = await pool.query("select * from operations where id = $1", [id]);
      const row = result.rows[0];
      if (row) return this.mapOperationRow(row as Record<string, unknown>);
    }
    return this.operations.get(id);
  }

  async listOperations(tenantId: string) {
    const pool = await this.getPool();
    if (pool) {
      const result = await pool.query("select * from operations where tenant_id = $1 order by created_at desc", [tenantId]);
      return result.rows.map((row) => this.mapOperationRow(row as Record<string, unknown>));
    }
    return [...this.operations.values()].filter((operation) => operation.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listOperationsBySession(sessionId: string) {
    const pool = await this.getPool();
    if (pool) {
      const result = await pool.query("select * from operations where session_id = $1 order by created_at desc", [sessionId]);
      return result.rows.map((row) => this.mapOperationRow(row as Record<string, unknown>));
    }
    return [...this.operations.values()].filter((operation) => operation.sessionId === sessionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateOperationStatus(id: string, status: OperationStatus) {
    const existing = await this.getOperation(id);
    if (!existing) return undefined;
    const updated: Operation = { ...existing, status, updatedAt: new Date().toISOString() };
    this.operations.set(id, updated);
    const pool = await this.getPool();
    if (pool) {
      await pool.query("update operations set status = $2, updated_at = $3 where id = $1", [id, updated.status, updated.updatedAt]);
    }
    await this.recordEvent({
      sessionId: updated.sessionId,
      type: "operation_updated",
      payload: { tenantId: updated.tenantId, operationId: updated.id, status: updated.status },
      createdAt: updated.updatedAt
    });
    return updated;
  }

  async createProspect(accountId: string, input: { name: string; phoneNumber: string; email?: string; fields?: Record<string, string>; status?: ProspectStatus; campaignId?: string }) {
    const timestamp = new Date().toISOString();
    const prospect: Prospect = {
      id: randomUUID(),
      accountId,
      name: input.name,
      phoneNumber: input.phoneNumber,
      ...(input.email ? { email: input.email } : {}),
      fields: input.fields ?? {},
      status: input.status ?? "new",
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.prospects.set(prospect.id, prospect);
    const pool = await this.getPool();
    if (pool) {
      await pool.query(
        `insert into prospects (id, tenant_id, name, phone_number, email, fields, status, campaign_id, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10) on conflict (id) do nothing`,
        [prospect.id, accountId, prospect.name, prospect.phoneNumber, prospect.email ?? null, JSON.stringify(prospect.fields), prospect.status, prospect.campaignId ?? null, prospect.createdAt, prospect.updatedAt]
      );
    }
    return prospect;
  }

  async getProspect(id: string) {
    const pool = await this.getPool();
    if (pool) {
      const result = await pool.query("select * from prospects where id = $1", [id]);
      const row = result.rows[0];
      if (row) return this.mapProspectRow(row as Record<string, unknown>);
    }
    return this.prospects.get(id);
  }

  async listProspects(accountId: string, campaignId?: string) {
    const pool = await this.getPool();
    if (pool) {
      const result = campaignId
        ? await pool.query("select * from prospects where tenant_id = $1 and campaign_id = $2 order by created_at desc", [accountId, campaignId])
        : await pool.query("select * from prospects where tenant_id = $1 order by created_at desc", [accountId]);
      return result.rows.map((row) => this.mapProspectRow(row as Record<string, unknown>));
    }
    return [...this.prospects.values()]
      .filter((prospect) => prospect.accountId === accountId && (!campaignId || prospect.campaignId === campaignId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateProspect(id: string, patch: Partial<Pick<Prospect, "name" | "phoneNumber" | "email" | "fields" | "status" | "campaignId" | "lastSessionId" | "lastOutcome">>) {
    const existing = await this.getProspect(id);
    if (!existing) return undefined;
    const updated: Prospect = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.prospects.set(id, updated);
    const pool = await this.getPool();
    if (pool) {
      await pool.query(
        `update prospects set name = $2, phone_number = $3, email = $4, fields = $5::jsonb, status = $6, campaign_id = $7, last_session_id = $8, last_outcome = $9, updated_at = $10 where id = $1`,
        [id, updated.name, updated.phoneNumber, updated.email ?? null, JSON.stringify(updated.fields), updated.status, updated.campaignId ?? null, updated.lastSessionId ?? null, updated.lastOutcome ?? null, updated.updatedAt]
      );
    }
    return updated;
  }

  async createCampaign(accountId: string, input: { name: string; direction: CallDirection; agentProfileId: string }) {
    const timestamp = new Date().toISOString();
    const campaign: Campaign = {
      id: randomUUID(),
      accountId,
      name: input.name,
      direction: input.direction,
      status: "draft",
      agentProfileId: input.agentProfileId,
      prospectIds: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.campaigns.set(campaign.id, campaign);
    const pool = await this.getPool();
    if (pool) {
      await pool.query(
        `insert into campaigns (id, tenant_id, name, direction, status, agent_profile_id, prospect_ids, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) on conflict (id) do nothing`,
        [campaign.id, accountId, campaign.name, campaign.direction, campaign.status, campaign.agentProfileId, JSON.stringify(campaign.prospectIds), campaign.createdAt, campaign.updatedAt]
      );
    }
    return campaign;
  }

  async getCampaign(id: string) {
    const pool = await this.getPool();
    if (pool) {
      const result = await pool.query("select * from campaigns where id = $1", [id]);
      const row = result.rows[0];
      if (row) return this.mapCampaignRow(row as Record<string, unknown>);
    }
    return this.campaigns.get(id);
  }

  async listCampaigns(accountId: string) {
    const pool = await this.getPool();
    if (pool) {
      const result = await pool.query("select * from campaigns where tenant_id = $1 order by created_at desc", [accountId]);
      return result.rows.map((row) => this.mapCampaignRow(row as Record<string, unknown>));
    }
    return [...this.campaigns.values()].filter((campaign) => campaign.accountId === accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateCampaign(id: string, patch: Partial<Pick<Campaign, "name" | "status" | "agentProfileId" | "prospectIds" | "direction">>) {
    const existing = await this.getCampaign(id);
    if (!existing) return undefined;
    const updated: Campaign = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.campaigns.set(id, updated);
    const pool = await this.getPool();
    if (pool) {
      await pool.query(
        `update campaigns set name = $2, direction = $3, status = $4, agent_profile_id = $5, prospect_ids = $6::jsonb, updated_at = $7 where id = $1`,
        [id, updated.name, updated.direction, updated.status, updated.agentProfileId, JSON.stringify(updated.prospectIds), updated.updatedAt]
      );
    }
    return updated;
  }

  async listMetricsBySession(sessionId: string): Promise<CallMetric[]> {
    const pool = await this.getPool();
    if (pool) {
      const result = await pool.query("select * from call_metrics where session_id = $1 order by recorded_at asc", [sessionId]);
      return result.rows.map((row) => ({
        sessionId: row.session_id as string,
        turnSwitchLatencyMs: Number(row.turn_switch_latency_ms ?? 0),
        asrConfidence: Number(row.asr_confidence ?? 0),
        nluConfidence: Number(row.nlu_confidence ?? 0),
        workflowCompleted: Boolean(row.workflow_completed),
        escalated: Boolean(row.escalated)
      }));
    }
    return this.metrics.filter((metric) => metric.sessionId === sessionId);
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  private mapProspectRow(row: Record<string, unknown>): Prospect {
    return {
      id: row.id as string,
      accountId: row.tenant_id as string,
      name: row.name as string,
      phoneNumber: row.phone_number as string,
      ...(row.email ? { email: row.email as string } : {}),
      fields: (row.fields as Record<string, string> | undefined) ?? {},
      status: row.status as ProspectStatus,
      ...(row.campaign_id ? { campaignId: row.campaign_id as string } : {}),
      ...(row.last_session_id ? { lastSessionId: row.last_session_id as string } : {}),
      ...(row.last_outcome ? { lastOutcome: row.last_outcome as string } : {}),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString()
    };
  }

  private mapCampaignRow(row: Record<string, unknown>): Campaign {
    return {
      id: row.id as string,
      accountId: row.tenant_id as string,
      name: row.name as string,
      direction: row.direction as CallDirection,
      status: row.status as CampaignStatus,
      agentProfileId: row.agent_profile_id as string,
      prospectIds: (row.prospect_ids as string[] | undefined) ?? [],
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString()
    };
  }

  private mapContactRow(row: Record<string, unknown>): Contact {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      name: row.name as string,
      phoneNumber: row.phone_number as string,
      ...(row.notes ? { notes: row.notes as string } : {}),
      createdAt: new Date(row.created_at as string).toISOString()
    };
  }

  private mapOperationRow(row: Record<string, unknown>): Operation {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      sessionId: row.session_id as string,
      ...(row.agent_profile_id ? { agentProfileId: row.agent_profile_id as string } : {}),
      ...(row.prospect_id ? { prospectId: row.prospect_id as string } : {}),
      ...(row.campaign_id ? { campaignId: row.campaign_id as string } : {}),
      type: row.type as OperationType,
      status: row.status as OperationStatus,
      payload: (row.payload as Record<string, string> | undefined) ?? {},
      referenceId: row.reference_id as string,
      ...(row.scheduled_for ? { scheduledFor: row.scheduled_for as string } : {}),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString()
    };
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
      `insert into call_sessions (id, tenant_id, domain, workflow, agent_profile_id, status, language, direction, contact_id, prospect_id, campaign_id, phone_number, display_name, consent_captured, slot_state, follow_up, outcome, turn_count, last_transcript, escalation_summary, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb, $18, $19, $20::jsonb, $21, $22)
       on conflict (id) do update
           set tenant_id = excluded.tenant_id,
               agent_profile_id = excluded.agent_profile_id,
               status = excluded.status,
               direction = excluded.direction,
               contact_id = excluded.contact_id,
               prospect_id = excluded.prospect_id,
               campaign_id = excluded.campaign_id,
               consent_captured = excluded.consent_captured,
               slot_state = excluded.slot_state,
               follow_up = excluded.follow_up,
               outcome = excluded.outcome,
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
        session.direction,
        session.contactId ?? null,
        session.prospectId ?? null,
        session.campaignId ?? null,
        session.participant.phoneNumber,
        session.participant.displayName ?? null,
        session.consentCaptured,
        JSON.stringify(session.slotState),
        JSON.stringify(session.followUp),
        JSON.stringify(session.outcome),
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
    const outcome = (row.outcome as SessionOutcome | undefined) ?? { type: "none", updatedAt: new Date(row.updated_at as string).toISOString() };
    const sessionBase: CallSession = {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      domain: row.domain as CallSession["domain"],
      workflow: row.workflow as CallSession["workflow"],
      ...(row.agent_profile_id ? { agentProfileId: row.agent_profile_id as string } : {}),
      status: row.status as CallSession["status"],
      language: row.language as CallSession["language"],
      direction: (row.direction as CallDirection | undefined) ?? "inbound",
      ...(row.contact_id ? { contactId: row.contact_id as string } : {}),
      ...(row.prospect_id ? { prospectId: row.prospect_id as string } : {}),
      ...(row.campaign_id ? { campaignId: row.campaign_id as string } : {}),
      participant,
      consentCaptured: Boolean(row.consent_captured),
      slotState: row.slot_state as CallSession["slotState"],
      followUp,
      outcome,
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
