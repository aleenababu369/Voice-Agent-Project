import type { FastifyInstance } from "fastify";
import type { Domain } from "../../../../packages/contracts/src/index.ts";
import { resolveAccountId } from "../plugins/auth.middleware.ts";
import { knowledgeLookupService } from "../services/knowledge-lookup.service.ts";
import { agentProfileService } from "../services/agent-profile.service.ts";
import { createKnowledgeSchema, updateKnowledgeSchema } from "../schemas/knowledge.schemas.ts";

/** The operational knowledge table is scoped per (account, domain); the domain is the account's use case. */
function resolveDomain(accountId: string, override?: string): Domain {
  const useCase = agentProfileService.getAccount(accountId).useCase as Domain | undefined;
  return (override as Domain | undefined) ?? useCase ?? "education";
}

export function registerKnowledgeRoutes(app: FastifyInstance) {
  app.get("/v1/knowledge", async (request) => {
    const query = request.query as { tenantId?: string; domain?: string };
    const accountId = resolveAccountId(request, query.tenantId);
    const domain = resolveDomain(accountId, query.domain);
    return { items: await knowledgeLookupService.list(accountId, domain), domain };
  });

  app.post("/v1/knowledge", async (request, reply) => {
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    const body = createKnowledgeSchema.parse(request.body);
    const domain = resolveDomain(accountId, body.domain);
    const item = await knowledgeLookupService.create(accountId, domain, body);
    return reply.code(201).send({ item });
  });

  app.put("/v1/knowledge/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateKnowledgeSchema.parse(request.body);
    const item = await knowledgeLookupService.update(id, body);
    if (!item) return reply.code(404).send({ error: "Knowledge record not found" });
    return { item };
  });

  app.delete("/v1/knowledge/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await knowledgeLookupService.remove(id);
    if (!removed) return reply.code(404).send({ error: "Knowledge record not found" });
    return { ok: true };
  });
}
