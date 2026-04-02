import type { AsrAdapter, AsrResult, LlmAdapter, LlmPromptContext, LlmResult, TtsAdapter, TtsResult } from "./types.ts";

class MockAsrAdapter implements AsrAdapter {
  async transcribe(input: { transcript: string; confidence: number; language: "en-IN" | "hi-IN" | "kn-IN" | "ta-IN" | "ml-IN" }): Promise<AsrResult> {
    return { transcript: input.transcript.replace(/\s+/g, " ").trim(), confidence: input.confidence, provider: "mock" };
  }
}

class MockLlmAdapter implements LlmAdapter {
  async generate(context: LlmPromptContext): Promise<LlmResult> {
    const wrappers: Record<LlmPromptContext["action"], (text: string) => string> = {
      consent: (text) => text,
      clarification: (text) => `Let me make that simpler. ${text}`,
      workflow: (text) => `Here is the next best step. ${text}`,
      completion: (text) => `${text} This has been recorded in the system.`,
      escalation: (text) => `${text} I am also preparing a summary for the human team.`
    };
    return { text: wrappers[context.action](context.fallbackText), provider: "mock", promptStyle: context.action };
  }
}

class MockTtsAdapter implements TtsAdapter {
  async synthesize(input: { text: string; language: "en-IN" | "hi-IN" | "kn-IN" | "ta-IN" | "ml-IN"; domain: "education" | "healthcare" | "frontdesk" }): Promise<TtsResult> {
    return {
      provider: "mock",
      voice: input.domain === "healthcare" ? "calm_clinical_en_in" : input.domain === "frontdesk" ? "reception_clear_en_in" : "clear_campus_en_in",
      estimatedDurationMs: Math.max(900, input.text.length * 35)
    };
  }
}

export const aiAdapters = { asr: new MockAsrAdapter(), llm: new MockLlmAdapter(), tts: new MockTtsAdapter() };
