import { spawn } from "node:child_process";

/**
 * Keeps the local LLM (Ollama) running so a call never silently falls back to the rule engine.
 *
 * `ensureLlmReady()` is idempotent and cheap on the happy path: if Ollama is already reachable it
 * returns immediately (and warms the model once in the background). If it is NOT reachable it spawns
 * `ollama serve` detached, polls until the server answers, then warms the configured model. When no
 * LLM is configured (rule-engine mode) it is a no-op.
 */

const QUICK_TIMEOUT_MS = 1500; // reachability probe
const START_TIMEOUT_MS = 25000; // how long to wait for a freshly-spawned server
const WARM_TIMEOUT_MS = 60000; // first model load can be slow
const POLL_INTERVAL_MS = 700;

let starting: Promise<boolean> | null = null;
let warmed = false;
let spawnAttempted = false;

interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

function config(): LlmConfig | null {
  const baseUrl = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL;
  if (!baseUrl || !model) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), model, apiKey: process.env.LLM_API_KEY ?? "" };
}

function authHeaders(cfg: LlmConfig): Record<string, string> {
  return cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isReachable(timeoutMs: number): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${cfg.baseUrl}/models`, { signal: controller.signal, headers: authHeaders(cfg) });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function trySpawnOllama(): void {
  if (spawnAttempted) return;
  spawnAttempted = true;
  try {
    // `shell: true` lets the OS resolve `ollama` from PATH (and find ollama.exe on Windows).
    const child = spawn("ollama", ["serve"], { detached: true, stdio: "ignore", windowsHide: true, shell: true });
    child.on("error", () => {
      console.warn("[llm] could not start Ollama automatically (is it installed and on PATH?). Falling back to the rule engine until it is reachable.");
    });
    child.unref();
    console.log("[llm] Ollama was not reachable — starting `ollama serve`…");
  } catch {
    console.warn("[llm] failed to spawn Ollama; continuing with the rule engine.");
  }
}

async function waitReachable(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReachable(QUICK_TIMEOUT_MS)) return true;
    await delay(POLL_INTERVAL_MS);
  }
  return isReachable(QUICK_TIMEOUT_MS);
}

/** Load the model into memory once so the first real turn isn't slow. Best-effort, runs in the background. */
async function warmOnce(): Promise<void> {
  if (warmed) return;
  const cfg = config();
  if (!cfg) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WARM_TIMEOUT_MS);
  try {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(cfg) },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: "ping" }], max_tokens: 1, temperature: 0 }),
      signal: controller.signal
    });
    if (response.ok) {
      warmed = true;
      console.log(`[llm] model ready: ${cfg.model}`);
    }
  } catch {
    // warming is best-effort; the first real turn will load the model if this didn't.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ensure the LLM is up before a call proceeds. Returns true when the model backend is reachable
 * (or becomes reachable after an auto-start), false in rule-engine mode or if it can't be started.
 */
export async function ensureLlmReady(): Promise<boolean> {
  if (!config()) return false; // rule-engine mode — nothing to start
  if (await isReachable(QUICK_TIMEOUT_MS)) {
    void warmOnce();
    return true;
  }
  if (!starting) {
    starting = (async () => {
      trySpawnOllama();
      return waitReachable(START_TIMEOUT_MS);
    })();
  }
  const ready = await starting;
  starting = null; // allow a fresh attempt if Ollama dies again later
  if (ready) void warmOnce();
  return ready;
}
