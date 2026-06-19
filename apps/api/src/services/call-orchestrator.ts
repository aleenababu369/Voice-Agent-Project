import type {
  AgentProfile,
  CallSession,
  CallSlotState,
  EscalationSummary,
  OrchestratorDecision,
  WorkflowDefinition
} from "../../../../packages/contracts/src/index.ts";
import { aiAdapters } from "./ai/mock-adapters.ts";
import { getLlmTurnAdapter } from "./ai/openai-compatible-adapter.ts";
import { slotExtractor } from "./slot-extractor.ts";
import { safetyPolicy } from "./safety-policy.ts";

interface ProcessTurnInput {
  session: CallSession;
  transcript: string;
  asrConfidence: number;
  nluConfidence: number;
  workflow: WorkflowDefinition;
  profile: AgentProfile;
}

interface ProcessTurnResult {
  decision: OrchestratorDecision;
  slotState: CallSlotState;
  missingSlots: string[];
  allSlotsCollected: boolean;
}

class CallOrchestrator {
  async processTurn(input: ProcessTurnInput): Promise<ProcessTurnResult> {
    const asrResult = await aiAdapters.asr.transcribe({ transcript: input.transcript, confidence: input.asrConfidence, language: input.session.language });
    const confidence = Math.min(asrResult.confidence, input.nluConfidence);
    const transcript = asrResult.transcript;

    if (!input.session.consentCaptured) {
      return this.buildDecision({ input, action: "ask_consent", confidence, slotState: input.session.slotState, missingSlots: input.session.slotState.missing, responseText: input.profile.welcomeMessage, reason: "Consent is required before the workflow can continue.", promptStyle: "consent" });
    }

    const safetyTrigger = safetyPolicy.evaluate(transcript, confidence);
    if (safetyTrigger) {
      const escalationSummary: EscalationSummary = { trigger: safetyTrigger.trigger, reason: safetyTrigger.reason, lastTranscript: transcript, recommendedAction: safetyTrigger.recommendedAction };
      return this.buildDecision({ input, action: "escalate_to_human", confidence, slotState: input.session.slotState, missingSlots: input.session.slotState.missing, responseText: input.profile.escalationMessage, reason: safetyTrigger.reason, promptStyle: "escalation", escalationSummary });
    }

    if (confidence < 0.6) {
      return this.buildDecision({ input, action: "ask_clarification", confidence, slotState: input.session.slotState, missingSlots: input.session.slotState.missing, responseText: "I want to make sure I understood you. Could you please repeat that more clearly?", reason: "Recognition confidence is below the safe threshold.", promptStyle: "clarification" });
    }

    const requiredSlots = input.profile.slots.filter((slot) => slot.required).map((slot) => slot.key);
    const priorMissing = requiredSlots.filter((slot) => !input.session.slotState.collected[slot]);

    // Real LLM turn (when configured) drives the reply + extraction; union with the rule extractor for recall.
    let extractedSlots = slotExtractor.extractProfile(input.profile, transcript);
    let llmReply: string | null = null;
    let llmEscalate = false;
    const adapter = getLlmTurnAdapter();
    if (adapter) {
      const turn = await adapter.runTurn({
        systemPrompt: input.profile.systemPrompt,
        welcomeMessage: input.profile.welcomeMessage,
        language: input.session.language,
        slots: input.profile.slots,
        collected: input.session.slotState.collected,
        missing: priorMissing,
        transcript
      });
      if (turn) {
        extractedSlots = { ...extractedSlots, ...turn.extractedFields };
        llmReply = turn.reply;
        llmEscalate = turn.action === "escalate";
      }
    }

    const collected = { ...input.session.slotState.collected, ...extractedSlots };
    const missingSlots = requiredSlots.filter((slot) => !collected[slot]);
    const slotState: CallSlotState = { required: requiredSlots, collected, missing: missingSlots };

    if (llmEscalate) {
      const escalationSummary: EscalationSummary = { trigger: "manual_request", reason: "The caller asked to speak with a human representative.", lastTranscript: transcript, recommendedAction: "Transfer the call to an operator with the conversation summary." };
      return this.buildDecision({ input, action: "escalate_to_human", confidence, slotState, missingSlots, responseText: llmReply ?? input.profile.escalationMessage, reason: escalationSummary.reason, promptStyle: "escalation", escalationSummary, llmText: llmReply });
    }

    if (missingSlots.length === 0) {
      return this.buildDecision({ input, action: "complete_call", confidence, slotState, missingSlots, responseText: llmReply ?? this.buildCompletionMessage(input.profile, collected), reason: "All required workflow slots are collected.", promptStyle: "completion", extractedSlots, allSlotsCollected: true, llmText: llmReply });
    }

    const nextPrompt = llmReply ?? this.buildNextPrompt(input.profile, missingSlots[0]);
    return this.buildDecision({ input, action: Object.keys(extractedSlots).length > 0 ? "execute_task" : "respond", confidence, slotState, missingSlots, responseText: nextPrompt, reason: "The workflow is still collecting required fields.", promptStyle: "workflow", extractedSlots, llmText: llmReply });
  }

  private async buildDecision(args: {
    input: ProcessTurnInput;
    action: OrchestratorDecision["action"];
    confidence: number;
    slotState: CallSlotState;
    missingSlots: string[];
    responseText: string;
    reason: string;
    promptStyle: "consent" | "clarification" | "workflow" | "completion" | "escalation";
    extractedSlots?: Record<string, string>;
    escalationSummary?: EscalationSummary;
    allSlotsCollected?: boolean;
    llmText?: string | null;
  }): Promise<ProcessTurnResult> {
    let replyText: string;
    let llmProvider: "mock" | "openai-compatible";
    if (args.llmText) {
      replyText = args.llmText;
      llmProvider = "openai-compatible";
    } else {
      const llmContext = { session: args.input.session, workflow: args.input.workflow, action: args.promptStyle, collectedSlots: args.slotState.collected, missingSlots: args.missingSlots, fallbackText: args.responseText, ...(args.missingSlots[0] ? { nextSlot: args.missingSlots[0] } : {}) };
      const llmResult = await aiAdapters.llm.generate(llmContext);
      replyText = llmResult.text;
      llmProvider = llmResult.provider;
    }
    const ttsResult = await aiAdapters.tts.synthesize({ text: replyText, language: args.input.session.language, domain: args.input.session.domain });
    const decisionBase: OrchestratorDecision = { action: args.action, confidence: args.confidence, reason: args.reason, responseText: replyText, missingSlots: args.missingSlots, aiMetadata: { asrProvider: "mock", llmProvider, ttsProvider: ttsResult.provider, normalizedTranscript: args.input.transcript.replace(/\s+/g, " ").trim(), promptStyle: args.promptStyle, synthesizedVoice: ttsResult.voice } };
    const decision: OrchestratorDecision = { ...decisionBase, ...(args.extractedSlots ? { extractedSlots: args.extractedSlots } : {}), ...(args.escalationSummary ? { escalationSummary: args.escalationSummary } : {}) };
    return { decision, slotState: args.slotState, missingSlots: args.missingSlots, allSlotsCollected: Boolean(args.allSlotsCollected) };
  }

  private buildNextPrompt(profile: AgentProfile, nextSlot?: string) {
    const slot = profile.slots.find((item) => item.key === nextSlot);
    return slot?.prompt ?? `Please tell me ${nextSlot ?? "the next required detail"}.`;
  }

  private buildCompletionMessage(profile: AgentProfile, collected: Record<string, string>) {
    return profile.completionMessageTemplate.replace(/\{\{(.*?)\}\}/g, (_match, key: string) => collected[key.trim()] ?? `[${key.trim()}]`);
  }
}

export const callOrchestrator = new CallOrchestrator();
