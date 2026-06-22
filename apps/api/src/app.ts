import Fastify from "fastify";
import { ZodError } from "zod";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerCallRoutes } from "./routes/calls.ts";
import { registerCallSocketRoutes } from "./routes/call-socket.ts";
import { registerCampaignRoutes } from "./routes/campaigns.ts";
import { registerDemoRoutes } from "./routes/demo.ts";
import { registerProspectRoutes } from "./routes/prospects.ts";
import { registerSystemRoutes } from "./routes/system.ts";
import { registerAuth } from "./plugins/auth.middleware.ts";
import { agentProfileService } from "./services/agent-profile.service.ts";
import { authService } from "./services/auth.service.ts";
import { callOrchestrator } from "./services/call-orchestrator.ts";
import { persistenceService } from "./services/persistence.service.ts";
import { workflowRegistry } from "./services/workflow-registry.ts";

export function buildApp() {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  });
  app.options("*", async (_request, reply) => reply.code(204).send());
  // Accept raw audio uploads (softphone -> Whisper ASR) as a Buffer instead of trying to JSON-parse them.
  app.addContentTypeParser(/^audio\//, { parseAs: "buffer" }, (_request, body, done) => done(null, body));
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
  // Request logger (morgan-style) so you can see traffic hitting the API in the terminal.
  if (process.env.LOG_REQUESTS !== "false") {
    app.addHook("onResponse", async (request, reply) => {
      if (request.method === "OPTIONS") return;
      const status = reply.statusCode;
      const color = status >= 500 ? 31 : status >= 400 ? 33 : status >= 300 ? 36 : 32;
      const ms = reply.elapsedTime.toFixed(1);
      console.log(`\x1b[90m${new Date().toLocaleTimeString()}\x1b[0m ${request.method} ${request.url} \x1b[${color}m${status}\x1b[0m ${ms} ms`);
    });
  }
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Validation failed.", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
    }
    const err = error as Error & { statusCode?: number };
    if (typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    console.error("[api] Unhandled error:", err);
    return reply.code(500).send({ error: "Internal Server Error" });
  });
  app.decorate("services", {
    orchestrator: callOrchestrator,
    persistence: persistenceService,
    workflows: workflowRegistry,
    agentProfiles: agentProfileService,
    auth: authService
  });
  registerAuth(app, { enforce: process.env.AUTH_ENFORCE === "true" });
  app.addHook("onClose", async () => { await persistenceService.close(); });
  registerAuthRoutes(app);
  registerSystemRoutes(app);
  registerCallRoutes(app);
  registerCallSocketRoutes(app);
  registerProspectRoutes(app);
  registerCampaignRoutes(app);
  registerDemoRoutes(app);
  return app;
}

/** Hydrate persisted accounts and agents from MongoDB (no-op when Mongo is not configured). Call before serving. */
export async function initServices() {
  await authService.hydrate();
  await agentProfileService.hydrate();
}

declare module "fastify" {
  interface FastifyInstance {
    services: {
      orchestrator: typeof callOrchestrator;
      persistence: typeof persistenceService;
      workflows: typeof workflowRegistry;
      agentProfiles: typeof agentProfileService;
      auth: typeof authService;
    };
  }
}
