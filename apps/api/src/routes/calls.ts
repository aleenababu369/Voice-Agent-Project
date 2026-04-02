import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { agentProfileSchema, createSessionSchema, consentSchema, processTurnSchema } from "../schemas/call.schemas.ts";
import { AgentProfileAccessError, AgentProfileValidationError } from "../services/agent-profile.service.ts";
import { randomUUID } from "node:crypto";

const actorProfileSchema = z.object({ actorId: z.string().min(1), tenantId: z.string().min(1).optional(), profile: agentProfileSchema });
const restoreVersionSchema = z.object({ actorId: z.string().min(1), tenantId: z.string().min(1).optional(), versionId: z.string().min(1) });
const followUpSchema = z.object({
  status: z.enum(["new", "in_progress", "contacted", "resolved", "closed"]),
  assignee: z.string().trim().optional(),
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

  app.get("/v1/admin/users", async (request) => {
    const { tenantId } = request.query as { tenantId?: string };
    return { users: app.services.agentProfiles.listUsers(tenantId) };
  });

  app.get("/v1/agent-profile-templates", async () => ({ templates: app.services.agentProfiles.listTemplates() }));

  app.get("/v1/agent-profiles", async (request) => {
    const { tenantId } = request.query as { tenantId?: string };
    return { profiles: app.services.agentProfiles.list(tenantId) };
  });

  app.get("/v1/agent-profiles/:profileId", async (request, reply) => {
    const { profileId } = request.params as { profileId: string };
    const { tenantId } = request.query as { tenantId?: string };
    try {
      return { profile: app.services.agentProfiles.get(profileId, tenantId) };
    } catch {
      return reply.code(404).send({ error: "Agent profile not found" });
    }
  });

  app.get("/v1/agent-profiles/:profileId/versions", async (request, reply) => {
    const { profileId } = request.params as { profileId: string };
    const { tenantId } = request.query as { tenantId?: string };
    try {
      return { versions: app.services.agentProfiles.listVersions(profileId, tenantId) };
    } catch {
      return reply.code(404).send({ error: "Agent profile not found" });
    }
  });

  app.post("/v1/agent-profiles", async (request, reply) => {
    const body = actorProfileSchema.parse(request.body);
    try {
      const tenantId = body.tenantId ?? body.profile.tenantId;
      const profile = app.services.agentProfiles.create({ ...body.profile, tenantId, slots: normalizeSlots(body.profile.slots) }, body.actorId, tenantId);
      return reply.code(201).send({ profile, versions: app.services.agentProfiles.listVersions(profile.id, tenantId) });
    } catch (error) {
      return sendProfileError(reply, error);
    }
  });

  app.put("/v1/agent-profiles/:profileId", async (request, reply) => {
    const { profileId } = request.params as { profileId: string };
    const body = actorProfileSchema.parse(request.body);
    try {
      const tenantId = body.tenantId ?? body.profile.tenantId;
      const profile = app.services.agentProfiles.update(profileId, { ...body.profile, tenantId, slots: normalizeSlots(body.profile.slots) }, body.actorId, tenantId);
      return { profile, versions: app.services.agentProfiles.listVersions(profile.id, tenantId) };
    } catch (error) {
      if (error instanceof Error && error.name === "Error" && error.message.startsWith("Agent profile not found")) {
        return reply.code(404).send({ error: "Agent profile not found" });
      }
      return sendProfileError(reply, error);
    }
  });

  app.post("/v1/agent-profiles/:profileId/restore", async (request, reply) => {
    const { profileId } = request.params as { profileId: string };
    const body = restoreVersionSchema.parse(request.body);
    try {
      const profile = app.services.agentProfiles.restoreVersion(profileId, body.versionId, body.actorId, body.tenantId);
      return { profile, versions: app.services.agentProfiles.listVersions(profile.id, profile.tenantId) };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ error: error.message });
      }
      return sendProfileError(reply, error);
    }
  });

  app.get("/v1/calls/sessions", async (request) => {
    const { tenantId } = request.query as { tenantId?: string };
    return { sessions: await app.services.persistence.listSessions(tenantId) };
  });

  app.post("/v1/calls/session", async (request, reply) => {
    const body = createSessionSchema.parse(request.body);
    const requestedTenantId = body.tenantId ?? app.services.agentProfiles.getDefaultTenantId();
    const profile = body.profileId
      ? app.services.agentProfiles.get(body.profileId, body.tenantId)
      : app.services.agentProfiles.findByWorkflow(body.workflow!, body.domain!, requestedTenantId);
    if (!profile) return reply.code(400).send({ error: "No matching agent profile found" });
    const participant = body.displayName ? { phoneNumber: body.phoneNumber, displayName: body.displayName } : { phoneNumber: body.phoneNumber };
    const required = profile.slots.filter((slot) => slot.required).map((slot) => slot.key);
    const session = await app.services.persistence.createSession({
      id: randomUUID(),
      tenantId: profile.tenantId,
      agentProfileId: profile.id,
      domain: profile.domain,
      workflow: profile.workflow,
      language: body.language,
      participant,
      slotState: { required, collected: {}, missing: [...required] }
    });
    return reply.code(201).send({ session, profile });
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

  app.post("/v1/calls/session/:sessionId/consent", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = consentSchema.parse(request.body);
    const session = await app.services.persistence.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    const updated = await app.services.persistence.captureConsent(sessionId, body.consentGranted);
    if (!updated) return reply.code(500).send({ error: "Unable to update consent" });
    return { session: updated, message: body.consentGranted ? "Consent captured. The workflow can proceed." : "Consent denied. This call should be handed to a human or ended." };
  });

  app.post("/v1/calls/session/:sessionId/turn", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = processTurnSchema.parse(request.body);
    const session = await app.services.persistence.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    const profile = session.agentProfileId ? app.services.agentProfiles.get(session.agentProfileId, session.tenantId) : null;
    if (!profile) return reply.code(400).send({ error: "Agent profile not found for session" });
    const result = await app.services.orchestrator.processTurn({ session, transcript: body.transcript, asrConfidence: body.asrConfidence, nluConfidence: body.nluConfidence, workflow: app.services.workflows.get(session.workflow), profile });
    const updatedSession = await app.services.persistence.applyTurn(sessionId, body.transcript, result);
    await app.services.persistence.recordMetric({ sessionId, turnSwitchLatencyMs: body.turnSwitchLatencyMs, asrConfidence: body.asrConfidence, nluConfidence: body.nluConfidence, workflowCompleted: result.decision.action === "complete_call", escalated: result.decision.action === "escalate_to_human" });
    return { decision: result.decision, session: updatedSession, profile, workflow: { type: session.workflow, completionReady: result.allSlotsCollected, missingSlots: result.missingSlots, collectedData: updatedSession?.slotState.collected ?? {} } };
  });
}

