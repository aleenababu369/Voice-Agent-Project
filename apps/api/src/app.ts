import Fastify from "fastify";
import { registerCallRoutes } from "./routes/calls.ts";
import { registerDemoRoutes } from "./routes/demo.ts";
import { registerSystemRoutes } from "./routes/system.ts";
import { agentProfileService } from "./services/agent-profile.service.ts";
import { callOrchestrator } from "./services/call-orchestrator.ts";
import { persistenceService } from "./services/persistence.service.ts";
import { workflowRegistry } from "./services/workflow-registry.ts";

export function buildApp() {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
  });
  app.options("*", async (_request, reply) => reply.code(204).send());
  app.decorate("services", {
    orchestrator: callOrchestrator,
    persistence: persistenceService,
    workflows: workflowRegistry,
    agentProfiles: agentProfileService
  });
  app.addHook("onClose", async () => { await persistenceService.close(); });
  registerSystemRoutes(app);
  registerCallRoutes(app);
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
    };
  }
}
