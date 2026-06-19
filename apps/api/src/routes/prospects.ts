import type { FastifyInstance } from "fastify";
import { createProspectSchema, updateProspectSchema } from "../schemas/prospect.schemas.ts";
import { resolveAccountId } from "../plugins/auth.middleware.ts";

export function registerProspectRoutes(app: FastifyInstance) {
  app.get("/v1/prospects", async (request) => {
    const query = request.query as { tenantId?: string; campaignId?: string };
    const accountId = resolveAccountId(request, query.tenantId);
    return { prospects: await app.services.persistence.listProspects(accountId, query.campaignId) };
  });

  app.post("/v1/prospects", async (request, reply) => {
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    const body = createProspectSchema.parse(request.body);
    const prospect = await app.services.persistence.createProspect(accountId, body);
    if (body.campaignId) {
      const campaign = await app.services.persistence.getCampaign(body.campaignId);
      if (campaign && !campaign.prospectIds.includes(prospect.id)) {
        await app.services.persistence.updateCampaign(campaign.id, { prospectIds: [...campaign.prospectIds, prospect.id] });
      }
    }
    return reply.code(201).send({ prospect });
  });

  app.get("/v1/prospects/:prospectId", async (request, reply) => {
    const { prospectId } = request.params as { prospectId: string };
    const prospect = await app.services.persistence.getProspect(prospectId);
    if (!prospect) return reply.code(404).send({ error: "Prospect not found" });
    const sessions = (await app.services.persistence.listSessions(prospect.accountId)).filter((session) => session.prospectId === prospect.id);
    const operations = (await app.services.persistence.listOperations(prospect.accountId)).filter((operation) => operation.prospectId === prospect.id);
    return { prospect, sessions, operations };
  });

  app.put("/v1/prospects/:prospectId", async (request, reply) => {
    const { prospectId } = request.params as { prospectId: string };
    const body = updateProspectSchema.parse(request.body);
    const updated = await app.services.persistence.updateProspect(prospectId, body);
    if (!updated) return reply.code(404).send({ error: "Prospect not found" });
    return { prospect: updated };
  });
}
