import Fastify from "fastify";
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
