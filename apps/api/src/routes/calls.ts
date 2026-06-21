import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { agentProfileSchema, createContactSchema, createSessionSchema, consentSchema, deploymentSchema, dialCallSchema, inboundCallSchema, processTurnSchema, updateOperationStatusSchema } from "../schemas/call.schemas.ts";
import { AgentProfileAccessError, AgentProfileValidationError } from "../services/agent-profile.service.ts";
import { placeCall, processCallTurn } from "../services/call-runner.ts";
import { ensureLlmReady } from "../services/ai/llm-runtime.ts";
import { resolveAccountId } from "../plugins/auth.middleware.ts";
import { randomUUID } from "node:crypto";

const profileBodySchema = z.object({ profile: agentProfileSchema });
const restoreVersionSchema = z.object({ versionId: z.string().min(1) });
const followUpSchema = z.object({
  status: z.enum(["new", "in_progress", "contacted", "resolved", "closed"]),
  assignee: z.string().trim().optional(),
  notes: z.string().trim().optional()
});
const outcomeSchema = z.object({
  type: z.enum(["none", "callback_scheduled", "appointment_confirmed", "enquiry_forwarded", "visitor_routed", "closed_no_action"]),
  scheduledFor: z.string().trim().optional(),
  referenceId: z.string().trim().optional(),
  notes: z.string().trim().optional()
});

function normalizeSlots(slots: Array<{ key: string; label: string; prompt: string; required: boolean; examples?: string[] | undefined }>) {
  return slots.map((slot): { key: string; label: string; prompt: string; required: boolean; examples?: string[] } => {
    if (slot.examples && slot.examples.length > 0) {
      return { key: slot.key, label: slot.label, prompt: slot.prompt, required: slot.required, examples: slot.examples };
    }

    return { key: slot.key, label: slot.label, prompt: slot.prompt, required: slot.required };
  });
}

function sendProfileError(reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } }, error: unknown) {
  if (error instanceof AgentProfileValidationError) {
    return reply.code(400).send({ error: error.message, issues: error.issues });
  }

  if (error instanceof AgentProfileAccessError) {
    return reply.code(403).send({ error: error.message, role: error.role });
  }

  return reply.code(500).send({ error: "Unable to save agent profile" });
}

export function registerCallRoutes(app: FastifyInstance) {
  app.get("/v1/tenants", async () => ({ tenants: app.services.agentProfiles.listTenants() }));

  app.get("/v1/contacts", async (request) => {
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    return { contacts: await app.services.persistence.listContacts(accountId) };
  });

  app.post("/v1/contacts", async (request, reply) => {
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    const body = createContactSchema.parse(request.body);
    const contact = await app.services.persistence.createContact(accountId, body);
    return reply.code(201).send({ contact });
  });

  app.get("/v1/operations", async (request) => {
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    return { operations: await app.services.persistence.listOperations(accountId) };
  });

  app.put("/v1/operations/:operationId/status", async (request, reply) => {
    const { operationId } = request.params as { operationId: string };
    const body = updateOperationStatusSchema.parse(request.body);
    const updated = await app.services.persistence.updateOperationStatus(operationId, body.status);
    if (!updated) return reply.code(404).send({ error: "Operation not found" });
    return { operation: updated };
  });

  app.get("/v1/agent-profile-templates", async () => ({ templates: app.services.agentProfiles.listTemplates() }));

  app.get("/v1/agent-profiles", async (request) => {
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    return { profiles: app.services.agentProfiles.list(accountId) };
  });

  app.get("/v1/agent-profiles/:profileId", async (request, reply) => {
    const { profileId } = request.params as { profileId: string };
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    try {
      return { profile: app.services.agentProfiles.get(profileId, accountId) };
    } catch {
      return reply.code(404).send({ error: "Agent profile not found" });
    }
  });

  app.get("/v1/agent-profiles/:profileId/versions", async (request, reply) => {
    const { profileId } = request.params as { profileId: string };
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    try {
      return { versions: app.services.agentProfiles.listVersions(profileId, accountId) };
    } catch {
      return reply.code(404).send({ error: "Agent profile not found" });
    }
  });

  app.post("/v1/agent-profiles", async (request, reply) => {
    const accountId = resolveAccountId(request);
    const body = profileBodySchema.parse(request.body);
    try {
      const profile = app.services.agentProfiles.create({ ...body.profile, tenantId: accountId, slots: normalizeSlots(body.profile.slots) }, accountId);
      return reply.code(201).send({ profile, versions: app.services.agentProfiles.listVersions(profile.id, accountId) });
    } catch (error) {
      return sendProfileError(reply, error);
    }
  });

  app.put("/v1/agent-profiles/:profileId", async (request, reply) => {
    const { profileId } = request.params as { profileId: string };
    const accountId = resolveAccountId(request);
    const body = profileBodySchema.parse(request.body);
    try {
      const profile = app.services.agentProfiles.update(profileId, { ...body.profile, tenantId: accountId, slots: normalizeSlots(body.profile.slots) }, accountId);
      return { profile, versions: app.services.agentProfiles.listVersions(profile.id, accountId) };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Agent profile not found")) {
        return reply.code(404).send({ error: "Agent profile not found" });
      }
      return sendProfileError(reply, error);
    }
  });

  app.post("/v1/agent-profiles/:profileId/restore", async (request, reply) => {
    const { profileId } = request.params as { profileId: string };
    const accountId = resolveAccountId(request);
    const body = restoreVersionSchema.parse(request.body);
    try {
      const profile = app.services.agentProfiles.restoreVersion(profileId, body.versionId, accountId);
      return { profile, versions: app.services.agentProfiles.listVersions(profile.id, accountId) };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ error: error.message });
      }
      return sendProfileError(reply, error);
    }
  });

  app.post("/v1/agent-profiles/:profileId/deploy", async (request, reply) => {
    const { profileId } = request.params as { profileId: string };
    const accountId = resolveAccountId(request);
    const body = deploymentSchema.parse(request.body);
    try {
      const profile = app.services.agentProfiles.setDeployment(profileId, body.deployed, accountId);
      return { profile, versions: app.services.agentProfiles.listVersions(profile.id, accountId) };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Agent profile not found")) {
        return reply.code(404).send({ error: "Agent profile not found" });
      }
      return sendProfileError(reply, error);
    }
  });

  app.get("/v1/calls/sessions", async (request) => {
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    return { sessions: await app.services.persistence.listSessions(accountId) };
  });

  app.post("/v1/calls/session", async (request, reply) => {
    const body = createSessionSchema.parse(request.body);
    const accountId = resolveAccountId(request, body.tenantId);
    const profile = body.profileId
      ? app.services.agentProfiles.get(body.profileId, accountId)
      : app.services.agentProfiles.findByWorkflow(body.workflow!, body.domain!, accountId);
    if (!profile) return reply.code(400).send({ error: "No matching agent profile found" });
    if (!app.services.agentProfiles.isDeployed(profile)) {
      return reply.code(409).send({ error: "Agent is not deployed. Deploy the agent before taking calls." });
    }

    // Bring the local LLM up before the call begins (no-op when running on the rule engine).
    await ensureLlmReady().catch(() => undefined);

    let phoneNumber = body.phoneNumber;
    let displayName = body.displayName;
    if (body.prospectId) {
      const prospect = await app.services.persistence.getProspect(body.prospectId);
      if (!prospect) return reply.code(404).send({ error: "Prospect not found" });
      phoneNumber = prospect.phoneNumber;
      displayName = prospect.name;
    } else if (body.contactId) {
      const contact = await app.services.persistence.getContact(body.contactId);
      if (!contact) return reply.code(404).send({ error: "Contact not found" });
      phoneNumber = contact.phoneNumber;
      displayName = contact.name;
    }

    const participant = displayName ? { phoneNumber, displayName } : { phoneNumber };
    const required = profile.slots.filter((slot) => slot.required).map((slot) => slot.key);
    const session = await app.services.persistence.createSession({
      id: randomUUID(),
      tenantId: profile.tenantId,
      agentProfileId: profile.id,
      domain: profile.domain,
      workflow: profile.workflow,
      language: body.language,
      direction: body.direction,
      ...(body.contactId ? { contactId: body.contactId } : {}),
      ...(body.prospectId ? { prospectId: body.prospectId } : {}),
      ...(body.campaignId ? { campaignId: body.campaignId } : {}),
      participant,
      slotState: { required, collected: {}, missing: [...required] }
    });
    if (body.prospectId) {
      await app.services.persistence.updateProspect(body.prospectId, { status: "in_progress", lastSessionId: session.id });
    }
    return reply.code(201).send({ session, profile });
  });

  // Public: a prospect "dials in" to a deployed agent. Matches/creates a prospect by phone, opens an inbound session.
  app.post("/v1/calls/inbound", async (request, reply) => {
    const body = inboundCallSchema.parse(request.body);
    let profile;
    try {
      profile = app.services.agentProfiles.get(body.agentProfileId);
    } catch {
      return reply.code(404).send({ error: "Agent not found" });
    }
    if (!app.services.agentProfiles.isDeployed(profile)) {
      return reply.code(409).send({ error: "This agent is not available for calls." });
    }
    const accountId = profile.tenantId;
    const existing = (await app.services.persistence.listProspects(accountId)).find((prospect) => prospect.phoneNumber === body.phoneNumber);
    const prospect = existing ?? await app.services.persistence.createProspect(accountId, {
      name: body.displayName ?? "Inbound caller",
      phoneNumber: body.phoneNumber,
      status: "in_progress"
    });
    const { session } = await placeCall({
      accountId,
      profileId: profile.id,
      prospect: { id: prospect.id, phoneNumber: prospect.phoneNumber, name: prospect.name },
      direction: "inbound",
      ...(body.language ? { language: body.language } : {})
    });
    return reply.code(201).send({ session, profile, prospect });
  });

  // Public: look up which agent answers a dialed number (for the caller's dialer UI).
  app.get("/v1/public/agents/by-number/:number", async (request, reply) => {
    const { number } = request.params as { number: string };
    const profile = app.services.agentProfiles.findByPhoneNumber(decodeURIComponent(number));
    if (!profile) return reply.code(404).send({ error: "No agent found at that number." });
    const account = app.services.agentProfiles.getAccount(profile.tenantId);
    return { agent: { id: profile.id, name: profile.name, phoneNumber: profile.phoneNumber ?? null, accountName: account.name, useCase: profile.domain, deployed: app.services.agentProfiles.isDeployed(profile) } };
  });

  // Public: a caller dials an agent's number. The matching agent answers automatically and the session opens.
  app.post("/v1/calls/dial", async (request, reply) => {
    const body = dialCallSchema.parse(request.body);
    const profile = app.services.agentProfiles.findByPhoneNumber(body.agentNumber);
    if (!profile) return reply.code(404).send({ error: "No agent is reachable at that number." });
    if (!app.services.agentProfiles.isDeployed(profile)) return reply.code(409).send({ error: "This agent is not available for calls right now." });
    const accountId = profile.tenantId;
    const existing = (await app.services.persistence.listProspects(accountId)).find((prospect) => prospect.phoneNumber === body.callerPhone);
    const prospect = existing ?? await app.services.persistence.createProspect(accountId, {
      name: body.callerName ?? "Caller",
      phoneNumber: body.callerPhone,
      status: "in_progress"
    });
    const { session } = await placeCall({
      accountId,
      profileId: profile.id,
      prospect: { id: prospect.id, phoneNumber: prospect.phoneNumber, name: prospect.name },
      direction: "inbound",
      ...(body.language ? { language: body.language } : {})
    });
    return reply.code(201).send({ session, agent: { id: profile.id, name: profile.name, phoneNumber: profile.phoneNumber ?? null } });
  });

  app.get("/v1/calls/session/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await app.services.persistence.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    const profile = session.agentProfileId ? app.services.agentProfiles.get(session.agentProfileId, session.tenantId) : null;
    return { session, profile };
  });

  app.get("/v1/calls/session/:sessionId/events", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await app.services.persistence.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    return { sessionId, events: await app.services.persistence.listEvents(sessionId) };
  });

  app.put("/v1/calls/session/:sessionId/follow-up", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = followUpSchema.parse(request.body);
    const session = await app.services.persistence.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    const updated = await app.services.persistence.updateFollowUp(sessionId, { status: body.status, ...(body.assignee ? { assignee: body.assignee } : {}), ...(body.notes ? { notes: body.notes } : {}) });
    if (!updated) return reply.code(500).send({ error: "Unable to update follow-up" });
    return { session: updated };
  });

  app.put("/v1/calls/session/:sessionId/outcome", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = outcomeSchema.parse(request.body);
    const session = await app.services.persistence.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    const updated = await app.services.persistence.updateOutcome(sessionId, { type: body.type, ...(body.scheduledFor ? { scheduledFor: body.scheduledFor } : {}), ...(body.referenceId ? { referenceId: body.referenceId } : {}), ...(body.notes ? { notes: body.notes } : {}) });
    if (!updated) return reply.code(500).send({ error: "Unable to update outcome" });
    return { session: updated };
  });

  app.post("/v1/calls/session/:sessionId/consent", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = consentSchema.parse(request.body);
    const session = await app.services.persistence.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    const updated = await app.services.persistence.captureConsent(sessionId, body.consentGranted);
    if (!updated) return reply.code(500).send({ error: "Unable to update consent" });
    return { session: updated, message: body.consentGranted ? "Consent captured. The workflow can proceed." : "Consent denied. This call should be handed to a human or ended." };
  });

  app.get("/v1/calls/session/:sessionId/operations", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await app.services.persistence.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    return { sessionId, operations: await app.services.persistence.listOperationsBySession(sessionId) };
  });

  app.get("/v1/calls/session/:sessionId/analytics", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await app.services.persistence.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    const metrics = await app.services.persistence.listMetricsBySession(sessionId);
    const events = await app.services.persistence.listEvents(sessionId);
    const operations = await app.services.persistence.listOperationsBySession(sessionId);

    const transcript: Array<{ role: "agent" | "caller"; text: string; at: string }> = [];
    for (const event of events) {
      if (event.type === "turn_processed" || event.type === "workflow_completed") {
        const callerText = event.payload.transcript;
        const agentText = event.payload.responseText;
        if (typeof callerText === "string" && callerText.trim()) transcript.push({ role: "caller", text: callerText, at: event.createdAt });
        if (typeof agentText === "string" && agentText.trim()) transcript.push({ role: "agent", text: agentText, at: event.createdAt });
      }
    }

    const average = (values: number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);
    const round2 = (value: number) => Number(value.toFixed(2));

    // Uncertainty-aware dialogue management: final per-slot belief + grounding-action counts for this call.
    const slotConfidence = session.slotState.confidence ?? {};
    const slotConfidenceValues = Object.values(slotConfidence).map((value) => round2(value));
    const slotConfidenceRounded: Record<string, number> = {};
    for (const [key, value] of Object.entries(slotConfidence)) slotConfidenceRounded[key] = round2(value);
    const uncertainty = {
      confirmations: session.slotState.confirmations ?? 0,
      reprompts: session.slotState.reprompts ?? 0,
      confirmationTurns: metrics.filter((metric) => metric.confirmationTurn).length,
      repromptTurns: metrics.filter((metric) => metric.repromptTurn).length,
      slotConfidence: slotConfidenceRounded,
      averageSlotConfidence: slotConfidenceValues.length === 0 ? 0 : round2(average(slotConfidenceValues)),
      pendingConfirmation: session.slotState.pendingConfirmation ?? null
    };

    return {
      sessionId: session.id,
      tenantId: session.tenantId,
      uncertainty,
      ...(session.agentProfileId ? { agentProfileId: session.agentProfileId } : {}),
      ...(session.prospectId ? { prospectId: session.prospectId } : {}),
      ...(session.campaignId ? { campaignId: session.campaignId } : {}),
      direction: session.direction,
      status: session.status,
      durationMs: Math.max(0, new Date(session.updatedAt).getTime() - new Date(session.createdAt).getTime()),
      turnCount: session.turnCount,
      averageLatencyMs: Math.round(average(metrics.map((metric) => metric.turnSwitchLatencyMs))),
      averageAsrConfidence: Number(average(metrics.map((metric) => metric.asrConfidence)).toFixed(2)),
      averageNluConfidence: Number(average(metrics.map((metric) => metric.nluConfidence)).toFixed(2)),
      participant: session.participant,
      language: session.language,
      collected: session.slotState.collected,
      missing: session.slotState.missing,
      outcome: session.outcome,
      followUp: session.followUp,
      ...(session.escalationSummary ? { escalationSummary: session.escalationSummary } : {}),
      operations,
      transcript,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  });

  app.post("/v1/calls/session/:sessionId/turn", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = processTurnSchema.parse(request.body);
    const session = await app.services.persistence.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    const profile = session.agentProfileId ? app.services.agentProfiles.get(session.agentProfileId, session.tenantId) : null;
    if (!profile) return reply.code(400).send({ error: "Agent profile not found for session" });
    const result = await processCallTurn({ session, profile, transcript: body.transcript, asrConfidence: body.asrConfidence, nluConfidence: body.nluConfidence, turnSwitchLatencyMs: body.turnSwitchLatencyMs });
    return { decision: result.decision, session: result.session, profile, operation: result.operation, workflow: { type: session.workflow, completionReady: result.allSlotsCollected, missingSlots: result.missingSlots, collectedData: result.session.slotState.collected } };
  });
}
