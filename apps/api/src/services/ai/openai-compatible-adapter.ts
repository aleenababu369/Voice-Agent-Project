import type { LlmTurnAdapter, LlmTurnRequest, LlmTurnResult } from "./types.ts";
import { LANGUAGE_NAMES } from "../dialogue/language.ts";
import { ensureLlmReady } from "./llm-runtime.ts";

interface AdapterConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

function buildSystemPrompt(request: LlmTurnRequest): string {
  const slotLines = request.slots
    .map((slot) => `- ${slot.key} (${slot.label})${slot.required ? " [required]" : ""}: ${slot.prompt}`)
    .join("\n");
  const supported = request.supportedLanguages?.length ? request.supportedLanguages : [request.language];
  const supportedList = supported.map((code) => `${LANGUAGE_NAMES[code]} (${code})`).join(", ");
  const currentName = LANGUAGE_NAMES[request.language];
  return [
    request.systemPrompt,
    "",
    "You are a smart, warm phone agent. Genuinely understand what the caller means, acknowledge it briefly, and move the conversation forward naturally — never robotic, never repeating a question you already have the answer to. Collect the required fields conversationally, one or two at a time.",
    "Fields to collect:",
    slotLines,
    "",
    `Already collected: ${JSON.stringify(request.collected)}`,
    `Still missing: ${JSON.stringify(request.missing)}`,
    "",
    "Respond with ONLY a JSON object, no prose, in this exact shape:",
    '{"reply": string, "extractedFields": {"<field_key>": "<value>"}, "fieldConfidence": {"<field_key>": number}, "language": string, "action": "collect" | "complete" | "ask_clarification" | "escalate", "confidence": number}',
    "Rules:",
    "- Treat the conversation history and Already collected fields as authoritative memory. Never ask again for a field that is already collected unless the caller explicitly corrects it.",
    "- Ask only for fields listed under Still missing. Do not invent extra sub-questions or restart the conversation.",
    "- Put a field in extractedFields ONLY if the caller actually stated it in their latest message. Use the exact field keys above.",
    "- Extract the CLEAN value only, never the whole sentence: from \"my name is Leena\" set the name to \"Leena\"; from \"I want cardiology timings\" set the topic to \"cardiology timings\". Never include lead-in words like \"my name is\", \"I want\", \"I am interested in\".",
    "- Ignore filler and anything that repeats your own previous question; if the caller only echoed your words and gave no real answer, return empty extractedFields and ask again.",
    "- For every field you put in extractedFields, add the SAME key to fieldConfidence with your 0..1 certainty you heard that specific value correctly (lower it when the value was unclear, partial, spelled oddly, or ambiguous).",
    `- The agent can speak: ${supportedList}. DEFAULT to replying in ${currentName}.`,
    `- Only reply in a different supported language if the caller is CLEARLY speaking that language in their latest message — NOT just because their name or a word sounds regional. When unsure, stay in ${currentName}. Set "language" to the language code you actually replied in.`,
    "- action = \"complete\" only when every required field is collected. Otherwise \"collect\".",
    "- action = \"escalate\" if the caller asks for a human or there is a safety concern.",
    "- confidence is your 0..1 certainty in understanding the caller overall.",
    "- For phone number or contact number fields, remove spaces and dashes first. The value MUST then be a complete 10-digit Indian mobile number. If the caller gives fewer than 10 digits, do NOT put it in extractedFields — instead ask for the full number. Never read a phone number as a large number (lakhs, crores); always read it digit by digit.",
    "- reply is what you SAY next to the caller (short, spoken style)."
  ].join("\n");
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

class OpenAiCompatibleLlmAdapter implements LlmTurnAdapter {
  private readonly config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  async runTurn(request: LlmTurnRequest): Promise<LlmTurnResult | null> {
    const configuredAttempts = Number(process.env.LLM_TURN_ATTEMPTS ?? 3);
    const attempts = Number.isFinite(configuredAttempts) ? Math.max(1, Math.floor(configuredAttempts)) : 3;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      // This also waits for a local model cold-start/restart instead of immediately taking the rule path.
      if (await ensureLlmReady()) {
        const result = await this.requestTurn(request);
        if (result) return result;
      }
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
    console.error(`[llm] turn failed after ${attempts} attempts; real model did not return a usable response.`);
    return null;
  }

  private async requestTurn(request: LlmTurnRequest): Promise<LlmTurnResult | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          keep_alive: process.env.LLM_KEEP_ALIVE ?? "10m",
          messages: [
            { role: "system", content: buildSystemPrompt(request) },
            ...(request.history ?? []).map((turn) => ({ role: turn.role === "agent" ? "assistant" : "user", content: turn.text })),
            { role: "user", content: request.transcript }
          ]
        }),
        signal: controller.signal
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;
      const parsed = extractJson(content) as Partial<LlmTurnResult> | null;
      if (!parsed || typeof parsed.reply !== "string") return null;
      const extracted = parsed.extractedFields && typeof parsed.extractedFields === "object" ? parsed.extractedFields : {};
      const cleaned: Record<string, string> = {};
      for (const [key, value] of Object.entries(extracted)) {
        if (value !== null && value !== undefined && String(value).trim()) cleaned[key] = String(value).trim();
      }
      const rawFieldConfidence = parsed.fieldConfidence && typeof parsed.fieldConfidence === "object" ? parsed.fieldConfidence : {};
      const fieldConfidence: Record<string, number> = {};
      for (const key of Object.keys(cleaned)) {
        const raw = (rawFieldConfidence as Record<string, unknown>)[key];
        if (typeof raw === "number" && Number.isFinite(raw)) fieldConfidence[key] = Math.min(1, Math.max(0, raw));
      }
      const action = ["ask_clarification", "collect", "complete", "escalate"].includes(parsed.action as string)
        ? (parsed.action as LlmTurnResult["action"])
        : "collect";
      return {
        reply: parsed.reply,
        extractedFields: cleaned,
        fieldConfidence,
        ...(typeof parsed.language === "string" && parsed.language.trim() ? { language: parsed.language.trim() } : {}),
        action,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.85
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

let cached: { adapter: OpenAiCompatibleLlmAdapter | null } | null = null;

/** Returns a real LLM turn adapter when LLM_BASE_URL + LLM_MODEL are configured, else null (use the rule engine). */
export function getLlmTurnAdapter(): LlmTurnAdapter | null {
  if (cached) return cached.adapter;
  const baseUrl = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL;
  if (!baseUrl || !model) {
    cached = { adapter: null };
    return null;
  }
  const adapter = new OpenAiCompatibleLlmAdapter({
    baseUrl,
    apiKey: process.env.LLM_API_KEY ?? "",
    model,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 8000)
  });
  cached = { adapter };
  return adapter;
}
