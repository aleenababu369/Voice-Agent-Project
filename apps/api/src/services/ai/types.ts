import type { CallSession, WorkflowDefinition } from "../../../../../packages/contracts/src/index.ts";

export interface AsrResult {
  transcript: string;
  confidence: number;
  provider: "mock" | "faster-whisper";
}

export interface LlmPromptContext {
  session: CallSession;
  workflow: WorkflowDefinition;
  action: "consent" | "clarification" | "workflow" | "completion" | "escalation";
  nextSlot?: string;
  collectedSlots: Record<string, string>;
  missingSlots: string[];
  fallbackText: string;
}

export interface LlmResult {
  text: string;
  provider: "mock" | "openai-compatible";
  promptStyle: LlmPromptContext["action"];
}

export interface TtsResult {
  provider: "mock" | "coqui";
  voice: string;
  estimatedDurationMs: number;
}

export interface AsrAdapter {
  transcribe(input: { transcript: string; confidence: number; language: CallSession["language"] }): Promise<AsrResult>;
}

export interface LlmAdapter {
  generate(context: LlmPromptContext): Promise<LlmResult>;
}

export interface LlmTurnRequest {
  systemPrompt: string;
  welcomeMessage: string;
  domain: CallSession["domain"];
  workflow: CallSession["workflow"];
  language: CallSession["language"];
  /** Languages the agent can serve; the model may switch its reply to whichever of these the caller speaks. */
  supportedLanguages?: CallSession["language"][];
  slots: Array<{ key: string; label: string; prompt: string; required: boolean }>;
  collected: Record<string, string>;
  missing: string[];
  transcript: string;
  history?: Array<{ role: "agent" | "caller"; text: string }>;
  /** Current facts returned by the tenant's operational database for this utterance. */
  knowledge?: { handled: boolean; facts: string[]; fallbackText: string };
}

export interface LlmTurnResult {
  reply: string;
  extractedFields: Record<string, string>;
  /** Per-field 0..1 certainty the model has in each extracted value (uncertainty-aware dialogue management). */
  fieldConfidence?: Record<string, number>;
  /** The language the model detected the caller speaking (free-form label or code; resolved against supported langs). */
  language?: string;
  action: "ask_clarification" | "collect" | "complete" | "escalate";
  confidence: number;
}

/** A real (LLM-backed) turn engine: generates the agent's reply AND extracts fields in one call. */
export interface LlmTurnAdapter {
  runTurn(request: LlmTurnRequest): Promise<LlmTurnResult | null>;
}

export interface TtsAdapter {
  synthesize(input: { text: string; language: CallSession["language"]; domain: CallSession["domain"] }): Promise<TtsResult>;
}
