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

export interface TtsAdapter {
  synthesize(input: { text: string; language: CallSession["language"]; domain: CallSession["domain"] }): Promise<TtsResult>;
}
