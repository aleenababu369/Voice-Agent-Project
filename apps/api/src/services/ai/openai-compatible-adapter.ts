import type { LlmTurnAdapter, LlmTurnRequest, LlmTurnResult } from "./types.ts";

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
  return [
    request.systemPrompt,
    "",
    "You are a phone agent. Collect the required fields from the caller through natural conversation, one or two at a time.",
    "Fields to collect:",
    slotLines,
    "",
    `Already collected: ${JSON.stringify(request.collected)}`,
    `Still missing: ${JSON.stringify(request.missing)}`,
    "",
    "Respond with ONLY a JSON object, no prose, in this exact shape:",
    '{"reply": string, "extractedFields": {"<field_key>": "<value>"}, "fieldConfidence": {"<field_key>": number}, "action": "collect" | "complete" | "ask_clarification" | "escalate", "confidence": number}',
    "Rules:",
    "- Put a field in extractedFields ONLY if the caller actually stated it in their latest message. Use the exact field keys above.",
    "- For every field you put in extractedFields, add the SAME key to fieldConfidence with your 0..1 certainty you heard that specific value correctly (lower it when the value was unclear, partial, spelled oddly, or ambiguous).",
    "- action = \"complete\" only when every required field is collected. Otherwise \"collect\".",
    "- action = \"escalate\" if the caller asks for a human or there is a safety concern.",
    "- confidence is your 0..1 certainty in understanding the caller overall.",
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
