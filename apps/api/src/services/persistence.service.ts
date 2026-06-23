import { randomUUID } from "node:crypto";
import type { Sort } from "mongodb";
import type { Campaign, CallDirection, CallEvent, CallMetric, CallSession, Contact, FollowUpStatus, Operation, OperationStatus, OperationType, Prospect, ProspectStatus, SessionFollowUp, SessionOutcome, SessionOutcomeType } from "../../../../packages/contracts/src/index.ts";
import type { PersistenceMetricsSummary, TurnApplicationResult } from "../domain/persistence.ts";
import { closeMongo, getCollection, stripId } from "../db/mongo.ts";

type DbFilter = Record<string, unknown>;

const operationReferencePrefix: Record<OperationType, string> = {
  appointment: "APT",
  enquiry: "ENQ",
  visitor_routing: "VIS",
  reminder_ack: "REM",
  follow_up: "FUP",
  generic: "OPS"
};

const COLLECTIONS = {
  sessions: "call_sessions",
  metrics: "call_metrics",
  events: "call_events",
  contacts: "contacts",
  operations: "operations",
  prospects: "prospects",
  campaigns: "campaigns"
} as const;

type StoredMetric = CallMetric & { tenantId: string; recordedAt: string };

function computeSummary(metrics: CallMetric[]): PersistenceMetricsSummary {
  const total = metrics.length;
  if (total === 0) {
    return { total_turns: 0, average_latency_ms: 0, average_asr_confidence: 0, average_nlu_confidence: 0, escalation_rate: 0, completion_rate: 0 };
  }
  const round2 = (value: number) => Number(value.toFixed(2));
  return {
    total_turns: total,
    average_latency_ms: Math.round(metrics.reduce((sum, m) => sum + m.turnSwitchLatencyMs, 0) / total),
    average_asr_confidence: round2(metrics.reduce((sum, m) => sum + m.asrConfidence, 0) / total),
    average_nlu_confidence: round2(metrics.reduce((sum, m) => sum + m.nluConfidence, 0) / total),
    escalation_rate: round2(metrics.filter((m) => m.escalated).length / total),
    completion_rate: round2(metrics.filter((m) => m.workflowCompleted).length / total)
  };
}

class PersistenceService {
  private readonly sessions = new Map<string, CallSession>();
  private readonly metrics: StoredMetric[] = [];
  private readonly events: CallEvent[] = [];
  private readonly contacts = new Map<string, Contact>();
  private readonly operations = new Map<string, Operation>();
  private readonly prospects = new Map<string, Prospect>();
  private readonly campaigns = new Map<string, Campaign>();

  // --- Mongo document helpers (documents are the domain objects keyed by `id` as string `_id`) ---

  private async upsert(name: string, doc: { id: string }) {
    const collection = await getCollection(name);
    if (collection) await collection.replaceOne({ _id: doc.id }, doc as Record<string, unknown>, { upsert: true });
  }

  private async findById<T>(name: string, id: string): Promise<T | undefined> {
    const collection = await getCollection(name);
    if (!collection) return undefined;
    return stripId<T>(await collection.findOne({ _id: id }));
  }

  private async findMany<T>(name: string, filter: DbFilter, sort: Sort): Promise<T[] | null> {
    const collection = await getCollection(name);
    if (!collection) return null;
    const docs = await collection.find(filter).sort(sort).toArray();
    return docs.map((doc) => stripId<T>(doc) as T);
  }

  // Append-only documents (metrics, events) that have no stable `id`.
  private async insertDoc(name: string, doc: Record<string, unknown>) {
    const collection = await getCollection(name);
    if (collection) await collection.insertOne(doc);
  }

  private async findDocs<T>(name: string, filter: DbFilter, sort: Sort): Promise<T[] | null> {
    return this.findMany<T>(name, filter, sort);
  }

  // --- Sessions ---

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
    await this.persistSession(session);
    await this.recordEvent({
      sessionId: session.id,
      type: "session_created",
      payload: { tenantId: session.tenantId, workflow: session.workflow, domain: session.domain, direction: session.direction, agentProfileId: session.agentProfileId ?? null, followUpStatus: session.followUp.status, outcomeType: session.outcome.type },
      createdAt: now
    });
    return session;
  }

  async getSession(id: string) {
    const fromDb = await this.findById<CallSession>(COLLECTIONS.sessions, id);
    if (fromDb) {
      this.sessions.set(fromDb.id, fromDb);
      return fromDb;
    }
    return this.sessions.get(id);
  }

  async listSessions(tenantId?: string) {
    const fromDb = await this.findMany<CallSession>(COLLECTIONS.sessions, tenantId ? { tenantId } : {}, { createdAt: -1 });
    if (fromDb) return fromDb.slice(0, 200);
    const sessions = [...this.sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return tenantId ? sessions.filter((session) => session.tenantId === tenantId) : sessions;
  }

  async captureConsent(id: string, granted: boolean) {
    const session = await this.getSession(id);
    if (!session) return undefined;
    const updated: CallSession = { ...session, consentCaptured: granted, status: granted ? "active" : "failed", updatedAt: new Date().toISOString() };
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
      confirm_slot: "active",
      respond: "active",
      execute_task: "active",
      escalate_to_human: "escalated",
      complete_call: "completed"
    };
    const languageChanged = Boolean(result.language && result.language !== session.language);
    const base: CallSession = { ...session, status: statusMap[result.decision.action], slotState: result.slotState, ...(languageChanged ? { language: result.language! } : {}), lastTranscript: transcript, turnCount: session.turnCount + 1, updatedAt: new Date().toISOString() };
    const updated: CallSession = result.decision.escalationSummary ? { ...base, escalationSummary: result.decision.escalationSummary } : (() => { const { escalationSummary: _ignored, ...rest } = base; return rest; })();
    await this.persistSession(updated);
    if (languageChanged) {
      await this.recordEvent({ sessionId: id, type: "language_switched", payload: { tenantId: updated.tenantId, from: session.language, to: updated.language }, createdAt: updated.updatedAt });
    }
    await this.recordEvent({
      sessionId: id,
      type: result.decision.action === "complete_call" ? "workflow_completed" : "turn_processed",
      payload: { tenantId: updated.tenantId, action: result.decision.action, reason: result.decision.reason, confidence: result.decision.confidence, transcript, responseText: result.decision.responseText, missingSlots: result.decision.missingSlots ?? [], collected: updated.slotState.collected, slotConfidence: result.decision.slotConfidence ?? updated.slotState.confidence ?? null, confirming: result.decision.confirming ?? null, aiMetadata: result.decision.aiMetadata ?? null },
      createdAt: updated.updatedAt
    });
    if (result.decision.escalationSummary) {
      await this.recordEvent({ sessionId: id, type: "escalation_triggered", payload: { tenantId: updated.tenantId, ...result.decision.escalationSummary as unknown as Record<string, unknown> }, createdAt: updated.updatedAt });
    }
    return updated;
  }

  async updateFollowUp(id: string, input: { status: FollowUpStatus; assignee?: string; notes?: string }) {
    const session = await this.getSession(id);
    if (!session) return undefined;
    const followUp: SessionFollowUp = { status: input.status, ...(input.assignee ? { assignee: input.assignee } : {}), ...(input.notes ? { notes: input.notes } : {}), updatedAt: new Date().toISOString() };
    const updated: CallSession = { ...session, followUp, updatedAt: followUp.updatedAt };
    await this.persistSession(updated);
    await this.recordEvent({ sessionId: id, type: "follow_up_updated", payload: { tenantId: updated.tenantId, followUpStatus: followUp.status, assignee: followUp.assignee ?? null, notes: followUp.notes ?? null }, createdAt: followUp.updatedAt });
    return updated;
  }

  async updateOutcome(id: string, input: { type: SessionOutcomeType; scheduledFor?: string; referenceId?: string; notes?: string }) {
    const session = await this.getSession(id);
    if (!session) return undefined;
    const outcome: SessionOutcome = { type: input.type, ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}), ...(input.referenceId ? { referenceId: input.referenceId } : {}), ...(input.notes ? { notes: input.notes } : {}), updatedAt: new Date().toISOString() };
    const updated: CallSession = { ...session, outcome, updatedAt: outcome.updatedAt };
    await this.persistSession(updated);
    await this.recordEvent({ sessionId: id, type: "outcome_updated", payload: { tenantId: updated.tenantId, outcomeType: outcome.type, scheduledFor: outcome.scheduledFor ?? null, referenceId: outcome.referenceId ?? null, notes: outcome.notes ?? null }, createdAt: outcome.updatedAt });
    return updated;
  }

  /** Update the caller's display name on a session (used to backfill the name the agent captured mid-call). */
  async updateParticipantName(id: string, displayName: string) {
    const session = await this.getSession(id);
    if (!session) return undefined;
    const updated: CallSession = { ...session, participant: { ...session.participant, displayName }, updatedAt: new Date().toISOString() };
    await this.persistSession(updated);
    return updated;
  }

  private async persistSession(session: CallSession) {
    this.sessions.set(session.id, session);
    await this.upsert(COLLECTIONS.sessions, session);
  }

  // --- Metrics & events ---

  async recordMetric(metric: CallMetric) {
    const tenantId = this.sessions.get(metric.sessionId)?.tenantId ?? "";
    const stored: StoredMetric = { ...metric, tenantId, recordedAt: new Date().toISOString() };
    this.metrics.push(stored);
    await this.insertDoc(COLLECTIONS.metrics, { ...stored });
  }

  async getMetricsSummary(tenantId?: string): Promise<PersistenceMetricsSummary> {
    const fromDb = await this.findDocs<CallMetric>(COLLECTIONS.metrics, tenantId ? { tenantId } : {}, { recordedAt: 1 });
    if (fromDb) return computeSummary(fromDb);
    const scoped = tenantId ? this.metrics.filter((m) => m.tenantId === tenantId) : this.metrics;
    return computeSummary(scoped);
  }

  async listMetricsBySession(sessionId: string): Promise<CallMetric[]> {
    const fromDb = await this.findDocs<CallMetric>(COLLECTIONS.metrics, { sessionId }, { recordedAt: 1 });
    if (fromDb) return fromDb;
    return this.metrics.filter((metric) => metric.sessionId === sessionId);
  }

  async listEvents(sessionId: string) {
    const fromDb = await this.findDocs<CallEvent>(COLLECTIONS.events, { sessionId }, { createdAt: 1 });
    if (fromDb) return fromDb;
    return this.events.filter((event) => event.sessionId === sessionId);
  }

  private async recordEvent(event: CallEvent) {
    this.events.push(event);
    await this.insertDoc(COLLECTIONS.events, { ...event });
  }

  // --- Contacts ---

  async createContact(tenantId: string, input: { name: string; phoneNumber: string; notes?: string | undefined }) {
    const now = new Date().toISOString();
    const contact: Contact = { id: randomUUID(), tenantId, name: input.name, phoneNumber: input.phoneNumber, ...(input.notes ? { notes: input.notes } : {}), createdAt: now };
    this.contacts.set(contact.id, contact);
    await this.upsert(COLLECTIONS.contacts, contact);
    return contact;
  }

  async getContact(id: string) {
    return (await this.findById<Contact>(COLLECTIONS.contacts, id)) ?? this.contacts.get(id);
  }

  async listContacts(tenantId: string) {
    const fromDb = await this.findMany<Contact>(COLLECTIONS.contacts, { tenantId }, { createdAt: -1 });
    if (fromDb) return fromDb;
    return [...this.contacts.values()].filter((contact) => contact.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // --- Operations ---

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
    await this.upsert(COLLECTIONS.operations, operation);
    await this.recordEvent({ sessionId: operation.sessionId, type: "operation_created", payload: { tenantId: operation.tenantId, operationId: operation.id, type: operation.type, referenceId: operation.referenceId, status: operation.status }, createdAt: now });
    return operation;
  }

  async getOperation(id: string) {
    return (await this.findById<Operation>(COLLECTIONS.operations, id)) ?? this.operations.get(id);
  }

  async listOperations(tenantId: string) {
    const fromDb = await this.findMany<Operation>(COLLECTIONS.operations, { tenantId }, { createdAt: -1 });
    if (fromDb) return fromDb;
    return [...this.operations.values()].filter((operation) => operation.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listOperationsBySession(sessionId: string) {
    const fromDb = await this.findMany<Operation>(COLLECTIONS.operations, { sessionId }, { createdAt: -1 });
    if (fromDb) return fromDb;
    return [...this.operations.values()].filter((operation) => operation.sessionId === sessionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateOperationStatus(id: string, status: OperationStatus) {
    const existing = await this.getOperation(id);
    if (!existing) return undefined;
    const updated: Operation = { ...existing, status, updatedAt: new Date().toISOString() };
    this.operations.set(id, updated);
    await this.upsert(COLLECTIONS.operations, updated);
    await this.recordEvent({ sessionId: updated.sessionId, type: "operation_updated", payload: { tenantId: updated.tenantId, operationId: updated.id, status: updated.status }, createdAt: updated.updatedAt });
    return updated;
  }

  // --- Prospects ---

  async createProspect(accountId: string, input: { name: string; phoneNumber: string; email?: string; fields?: Record<string, string>; status?: ProspectStatus; campaignId?: string }) {
    const now = new Date().toISOString();
    const prospect: Prospect = {
      id: randomUUID(),
      accountId,
      name: input.name,
      phoneNumber: input.phoneNumber,
      ...(input.email ? { email: input.email } : {}),
      fields: input.fields ?? {},
      status: input.status ?? "new",
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
      createdAt: now,
      updatedAt: now
    };
    this.prospects.set(prospect.id, prospect);
    await this.upsert(COLLECTIONS.prospects, prospect);
    return prospect;
  }

  async getProspect(id: string) {
    return (await this.findById<Prospect>(COLLECTIONS.prospects, id)) ?? this.prospects.get(id);
  }

  async listProspects(accountId: string, campaignId?: string) {
    const filter: DbFilter = campaignId ? { accountId, campaignId } : { accountId };
    const fromDb = await this.findMany<Prospect>(COLLECTIONS.prospects, filter, { createdAt: -1 });
    if (fromDb) return fromDb;
    return [...this.prospects.values()].filter((prospect) => prospect.accountId === accountId && (!campaignId || prospect.campaignId === campaignId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateProspect(id: string, patch: Partial<Pick<Prospect, "name" | "phoneNumber" | "email" | "fields" | "status" | "campaignId" | "lastSessionId" | "lastOutcome">>) {
    const existing = await this.getProspect(id);
    if (!existing) return undefined;
    const updated: Prospect = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.prospects.set(id, updated);
    await this.upsert(COLLECTIONS.prospects, updated);
    return updated;
  }

  // --- Campaigns ---

  async createCampaign(accountId: string, input: { name: string; direction: CallDirection; agentProfileId: string }) {
    const now = new Date().toISOString();
    const campaign: Campaign = { id: randomUUID(), accountId, name: input.name, direction: input.direction, status: "draft", agentProfileId: input.agentProfileId, prospectIds: [], createdAt: now, updatedAt: now };
    this.campaigns.set(campaign.id, campaign);
    await this.upsert(COLLECTIONS.campaigns, campaign);
    return campaign;
  }

  async getCampaign(id: string) {
    return (await this.findById<Campaign>(COLLECTIONS.campaigns, id)) ?? this.campaigns.get(id);
  }

  async listCampaigns(accountId: string) {
    const fromDb = await this.findMany<Campaign>(COLLECTIONS.campaigns, { accountId }, { createdAt: -1 });
    if (fromDb) return fromDb;
    return [...this.campaigns.values()].filter((campaign) => campaign.accountId === accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateCampaign(id: string, patch: Partial<Pick<Campaign, "name" | "status" | "agentProfileId" | "prospectIds" | "direction">>) {
    const existing = await this.getCampaign(id);
    if (!existing) return undefined;
    const updated: Campaign = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.campaigns.set(id, updated);
    await this.upsert(COLLECTIONS.campaigns, updated);
    return updated;
  }

  async close() {
    await closeMongo();
  }
}

export const persistenceService = new PersistenceService();
