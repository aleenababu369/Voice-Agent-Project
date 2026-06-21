import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authService } from "../services/auth.service.ts";

declare module "fastify" {
  interface FastifyRequest {
    account: { accountId: string } | null;
  }
}

// Routes that never require authentication.
const PUBLIC_PREFIXES = ["/health", "/v1/auth", "/v1/capabilities", "/v1/demo", "/v1/calls/ws", "/v1/calls/inbound", "/v1/calls/dial", "/v1/public"];

function isPublic(url: string) {
  const path = url.split("?")[0] ?? url;
  return PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`) || path === prefix);
}

export function registerAuth(app: FastifyInstance, options: { enforce: boolean } = { enforce: false }) {
  app.decorateRequest("account", null);
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (header && header.startsWith("Bearer ")) {
      const result = authService.verifyToken(header.slice(7));
      if (result) request.account = { accountId: result.accountId };
    }
    if (options.enforce && request.method !== "OPTIONS" && !isPublic(request.url) && !request.account) {
      return reply.code(401).send({ error: "Authentication required." });
    }
  });
}

/** Prefer the authenticated account; fall back to an explicit param (demo routes) or the default demo account. */
export function resolveAccountId(request: FastifyRequest, fallbackParam?: string): string {
  if (request.account) return request.account.accountId;
  if (fallbackParam && fallbackParam.trim()) return fallbackParam;
  return authService.getDefaultAccountId();
}
