import type { FastifyInstance } from "fastify";
import { campaignProspectsSchema, createCampaignSchema, placeCallSchema, updateCampaignSchema } from "../schemas/campaign.schemas.ts";
import { resolveAccountId } from "../plugins/auth.middleware.ts";
import { placeCall, processCallTurn } from "../services/call-runner.ts";
import { simulateProspectReply } from "../services/prospect-simulator.ts";

export function registerCampaignRoutes(app: FastifyInstance) {
  app.get("/v1/campaigns", async (request) => {
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    return { campaigns: await app.services.persistence.listCampaigns(accountId) };
  });

  app.post("/v1/campaigns", async (request, reply) => {
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    const body = createCampaignSchema.parse(request.body);
    try {
      app.services.agentProfiles.get(body.agentProfileId, accountId);
    } catch {
      return reply.code(400).send({ error: "Agent not found for this account." });
    }
    const campaign = await app.services.persistence.createCampaign(accountId, body);
    return reply.code(201).send({ campaign });
  });

  app.get("/v1/campaigns/:campaignId", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const campaign = await app.services.persistence.getCampaign(campaignId);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found" });
    const prospects = await app.services.persistence.listProspects(campaign.accountId, campaign.id);
    return { campaign, prospects };
  });

  app.put("/v1/campaigns/:campaignId", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const body = updateCampaignSchema.parse(request.body);
    const updated = await app.services.persistence.updateCampaign(campaignId, body);
    if (!updated) return reply.code(404).send({ error: "Campaign not found" });
    return { campaign: updated };
  });

  app.post("/v1/campaigns/:campaignId/prospects", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const body = campaignProspectsSchema.parse(request.body);
    const campaign = await app.services.persistence.getCampaign(campaignId);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found" });
    const merged = [...new Set([...campaign.prospectIds, ...body.prospectIds])];
    const updated = await app.services.persistence.updateCampaign(campaignId, { prospectIds: merged });
    for (const prospectId of body.prospectIds) {
      await app.services.persistence.updateProspect(prospectId, { campaignId });
    }
    return { campaign: updated };
  });

  app.delete("/v1/campaigns/:campaignId/prospects/:prospectId", async (request, reply) => {
    const { campaignId, prospectId } = request.params as { campaignId: string; prospectId: string };
    const campaign = await app.services.persistence.getCampaign(campaignId);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found" });
    const updated = await app.services.persistence.updateCampaign(campaignId, { prospectIds: campaign.prospectIds.filter((id) => id !== prospectId) });
    return { campaign: updated };
  });

  app.post("/v1/campaigns/:campaignId/activate", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const campaign = await app.services.persistence.getCampaign(campaignId);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found" });
    const updated = await app.services.persistence.updateCampaign(campaignId, { status: "active" });
    for (const prospectId of campaign.prospectIds) {
      await app.services.persistence.updateProspect(prospectId, { status: "queued" });
    }
    return { campaign: updated, queued: campaign.prospectIds };
  });

  app.post("/v1/campaigns/:campaignId/pause", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const updated = await app.services.persistence.updateCampaign(campaignId, { status: "paused" });
    if (!updated) return reply.code(404).send({ error: "Campaign not found" });
    return { campaign: updated };
  });

  // Place a single call to a prospect in this campaign (manual or as a dialer step).
  app.post("/v1/campaigns/:campaignId/calls/place", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const body = placeCallSchema.parse(request.body);
    const campaign = await app.services.persistence.getCampaign(campaignId);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found" });
    const prospect = await app.services.persistence.getProspect(body.prospectId);
    if (!prospect) return reply.code(404).send({ error: "Prospect not found" });
    try {
      const { session, profile } = await placeCall({
        accountId: campaign.accountId,
        profileId: campaign.agentProfileId,
        prospect: { id: prospect.id, phoneNumber: prospect.phoneNumber, name: prospect.name },
        direction: campaign.direction,
        campaignId: campaign.id,
        ...(body.language ? { language: body.language } : {})
      });
      return reply.code(201).send({ session, profile });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "AGENT_NOT_DEPLOYED") return reply.code(409).send({ error: (error as Error).message });
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to place call." });
    }
  });

  // Hands-free auto-run: the simulated prospect answers and the agent processes the turn.
  app.post("/v1/campaigns/:campaignId/calls/:sessionId/auto-turn", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    let session = await app.services.persistence.getSession(sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    const profile = session.agentProfileId ? app.services.agentProfiles.get(session.agentProfileId, session.tenantId) : null;
    if (!profile) return reply.code(400).send({ error: "Agent profile not found for session" });
    if (!session.consentCaptured) {
      session = (await app.services.persistence.captureConsent(session.id, true)) ?? session;
    }
    const prospect = session.prospectId ? await app.services.persistence.getProspect(session.prospectId) : undefined;
    const prospectLine = simulateProspectReply({ profile, session, ...(prospect ? { prospect } : {}) });
    const result = await processCallTurn({ session, profile, transcript: prospectLine });
    const done = result.decision.action === "complete_call" || result.decision.action === "escalate_to_human";
    return { prospectLine, decision: result.decision, session: result.session, operation: result.operation, done };
  });
}
