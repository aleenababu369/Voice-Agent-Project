import { buildApp, initServices } from "./app.ts";
import { ensureLlmReady } from "./services/ai/llm-runtime.ts";

const port = Number(process.env.PORT ?? 5005);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildApp();

try {
  await initServices();
  await app.listen({ port, host });
  console.log(`Voice agent API listening on http://${host}:${port}`);
  // Start + warm the local LLM in the background so the first call is fast (no-op in rule-engine mode).
  void ensureLlmReady();
} catch (error) {
  console.error(error);
  process.exit(1);
}
