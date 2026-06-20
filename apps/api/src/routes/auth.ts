import type { FastifyInstance } from "fastify";
import { authService, AuthError } from "../services/auth.service.ts";
import { loginSchema, onboardSchema, signupSchema } from "../schemas/auth.schemas.ts";

export function registerAuthRoutes(app: FastifyInstance) {
  app.post("/v1/auth/signup", async (request, reply) => {
    const body = signupSchema.parse(request.body);
    try {
      const { account, token } = await authService.signup(body);
      const profile = account.useCase
        ? app.services.agentProfiles.provisionStarterAgent(account.id, account.useCase, account.name)
        : null;
      return reply.code(201).send({ account, token, profile });
    } catch (error) {
      if (error instanceof AuthError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    try {
      return authService.login(body);
    } catch (error) {
      if (error instanceof AuthError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });

  app.get("/v1/auth/me", async (request, reply) => {
    if (!request.account) return reply.code(401).send({ error: "Not authenticated." });
    return { account: authService.getAccount(request.account.accountId) };
  });

  app.post("/v1/accounts/onboard", async (request, reply) => {
    if (!request.account) return reply.code(401).send({ error: "Not authenticated." });
    const body = onboardSchema.parse(request.body);
    const account = await authService.setUseCase(request.account.accountId, body.useCase);
    const profile = app.services.agentProfiles.provisionStarterAgent(account.id, body.useCase, account.name);
    return { account, profile };
  });
}
