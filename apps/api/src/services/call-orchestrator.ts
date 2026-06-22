import type {
  AgentProfile,
  CallSession,
  CallSlotState,
  EscalationSummary,
  LanguageCode,
  OrchestratorDecision,
  PendingConfirmation,
  WorkflowDefinition
} from "../../../../packages/contracts/src/index.ts";
import { aiAdapters } from "./ai/mock-adapters.ts";
import { getLlmTurnAdapter } from "./ai/openai-compatible-adapter.ts";
import { FREE_TEXT_SLOT_KEYS, normalizeSlotValue, slotExtractor } from "./slot-extractor.ts";
import { safetyPolicy } from "./safety-policy.ts";
import { bandFor, clamp01, combineConfidence, getUncertaintyThresholds, interpretConfirmation } from "./dialogue/uncertainty.ts";
import { acceptedPhrase, confirmPhrase, detectLanguage, detectLanguageCommand, localizedSlotPrompt, repromptPhrase, resolveCallLanguage, resolveLanguageCode, retryPhrase, switchAcknowledgmentPhrase } from "./dialogue/language.ts";

interface ProcessTurnInput {
  session: CallSession;
  transcript: string;
  asrConfidence: number;
  nluConfidence: number;
  workflow: WorkflowDefinition;
  profile: AgentProfile;
  history?: Array<{ role: "agent" | "caller"; text: string }>;
}

interface ProcessTurnResult {
  decision: OrchestratorDecision;
  slotState: CallSlotState;
  missingSlots: string[];
  allSlotsCollected: boolean;
  /** Set when the caller switched language mid-call; the session adopts this language for the rest of the call. */
  language?: LanguageCode;
}

/** Mutable belief carried across the turn while the grounding policy runs. */
interface BeliefState {
  confidence: Record<string, number>;
  attempts: Record<string, number>;
  confirmations: number;
  reprompts: number;
}

function containsUnsupportedLetterScript(text: string): boolean {
  const supportedLetter = /[\p{Script=Latin}\p{Script=Devanagari}\p{Script=Kannada}\p{Script=Tamil}\p{Script=Malayalam}]/u;
  return [...text].some((character) => /\p{L}/u.test(character) && !supportedLetter.test(character));
}

class CallOrchestrator {
  async processTurn(input: ProcessTurnInput): Promise<ProcessTurnResult> {
    const asrResult = await aiAdapters.asr.transcribe({ transcript: input.transcript, confidence: input.asrConfidence, language: input.session.language });
    const confidence = Math.min(asrResult.confidence, input.nluConfidence);
    const transcript = asrResult.transcript;
    const prior = input.session.slotState;

    if (!input.session.consentCaptured) {
      return this.buildDecision({ input, action: "ask_consent", confidence, slotState: prior, missingSlots: prior.missing, responseText: input.profile.welcomeMessage, reason: "Consent is required before the workflow can continue.", promptStyle: "consent" });
    }

    const safetyTrigger = safetyPolicy.evaluate(transcript, confidence);
    if (safetyTrigger) {
      const escalationSummary: EscalationSummary = { trigger: safetyTrigger.trigger, reason: safetyTrigger.reason, lastTranscript: transcript, recommendedAction: safetyTrigger.recommendedAction };
      return this.buildDecision({ input, action: "escalate_to_human", confidence, slotState: prior, missingSlots: prior.missing, responseText: input.profile.escalationMessage, reason: safetyTrigger.reason, promptStyle: "escalation", escalationSummary });
    }

    // Utterance-level floor: only re-prompt when the audio was genuinely unintelligible. Browser ASR confidence
    // is unreliable (often low even for clear speech), so keep this lenient and let the LLM do the understanding.
    if (confidence < 0.35) {
      return this.buildDecision({ input, action: "ask_clarification", confidence, slotState: prior, missingSlots: prior.missing, responseText: "I want to make sure I understood you. Could you please repeat that more clearly?", reason: "Recognition confidence is below the safe threshold.", promptStyle: "clarification" });
    }

    // IN-CALL LANGUAGE IDENTIFICATION — detect the caller's language (native script / romanized) up front.
    const supportedLanguages = input.profile.languages;
    const heuristic = detectLanguage(transcript, supportedLanguages);
    const languageCommand = detectLanguageCommand(transcript, supportedLanguages);
    const preResolvedLanguage = resolveCallLanguage({ current: input.session.language, supported: supportedLanguages, transcript, heuristic, commanded: languageCommand });
    let switchLanguage = preResolvedLanguage !== input.session.language ? preResolvedLanguage : undefined;

    const requiredSlots = input.profile.slots.filter((slot) => slot.required).map((slot) => slot.key);
    const thresholds = getUncertaintyThresholds();
    const belief: BeliefState = {
      confidence: { ...(prior.confidence ?? {}) },
      attempts: { ...(prior.attempts ?? {}) },
      confirmations: prior.confirmations ?? 0,
      reprompts: prior.reprompts ?? 0
    };

    // (1) GROUNDING — if a medium-confidence value is awaiting an explicit yes/no, resolve that first.
    const pending = prior.pendingConfirmation;
    if (pending) {
      const verdict = interpretConfirmation(transcript);
      if (verdict === "yes") {
        belief.confirmations += 1;
        const grounded = Math.max(pending.confidence, 0.99);
        const collected = { ...prior.collected, [pending.slotKey]: pending.value };
        belief.confidence[pending.slotKey] = grounded;
        const missingSlots = requiredSlots.filter((slot) => !collected[slot]);
        const slotState = this.composeSlotState(requiredSlots, collected, missingSlots, belief);
        return this.advanceAfterCollection({ input, confidence: grounded, slotState, missingSlots, justAccepted: [pending.slotKey], llmText: null, language: switchLanguage });
      }
      if (verdict === "no") {
        belief.reprompts += 1;
        belief.attempts[pending.slotKey] = (belief.attempts[pending.slotKey] ?? 0) + 1;
        const collected = { ...prior.collected };
        const missingSlots = requiredSlots.filter((slot) => !collected[slot]);
        const slotState = this.composeSlotState(requiredSlots, collected, missingSlots, belief);
        const responseText = retryPhrase(switchLanguage ?? input.session.language);
        return this.buildDecision({ input, action: "ask_clarification", confidence: input.nluConfidence, slotState, missingSlots, responseText, reason: `Caller rejected the proposed value for ${pending.slotKey}; re-prompting.`, promptStyle: "clarification", verbatim: true, slotConfidence: belief.confidence, uncertainty: { confirmations: belief.confirmations, reprompts: belief.reprompts }, language: switchLanguage });
      }
      // verdict "unknown" -> the caller likely restated the value instead of saying yes/no; fall through and re-extract.
    }

    // (2) EXTRACTION — rule + (optional) LLM, each value carrying its own confidence. The LLM is told the
    // caller's (already detected) language so it can reply in that language on the very same turn.
    const priorMissing = requiredSlots.filter((slot) => !prior.collected[slot]);
    const effectiveLanguage = switchLanguage ?? input.session.language;
    const ruleScored = slotExtractor.extractProfileScored(input.profile, transcript);
    let llmSlots: Record<string, string> = {};
    let llmFieldConfidence: Record<string, number> = {};
    let llmOverall = 0.85;
    let llmReply: string | null = null;
    let llmEscalate = false;
    let llmLanguageRaw: string | undefined;
    const adapter = getLlmTurnAdapter();
    if (adapter) {
      const turn = await adapter.runTurn({
        systemPrompt: input.profile.systemPrompt,
        welcomeMessage: input.profile.welcomeMessage,
        language: effectiveLanguage,
        supportedLanguages,
        slots: input.profile.slots,
        collected: prior.collected,
        missing: priorMissing,
        transcript,
        history: input.history ?? []
      });
      if (turn) {
        llmSlots = turn.extractedFields;
        llmFieldConfidence = turn.fieldConfidence ?? {};
        llmOverall = turn.confidence;
        llmReply = turn.reply;
        llmEscalate = turn.action === "escalate";
        llmLanguageRaw = turn.language;
      }
    }

    // Resolve the final language: native script always wins; otherwise prefer the LLM's judgment, then the keyword hint.
    const llmLanguage = resolveLanguageCode(llmLanguageRaw, supportedLanguages);
    const resolvedLanguage = resolveCallLanguage({ current: input.session.language, supported: supportedLanguages, transcript, heuristic, commanded: languageCommand, llm: llmLanguage });
    switchLanguage = resolvedLanguage !== input.session.language ? resolvedLanguage : undefined;

    // The model sometimes drifts into another language (e.g. replies in Hindi for an English caller because the
    // name sounds regional). If we are NOT switching, drop a reply written in a different script so the agent
    // never suddenly speaks a language we didn't switch to; deterministic phrasing fills in instead.
    if (llmReply && !switchLanguage) {
      const replyLanguage = detectLanguage(llmReply, supportedLanguages);
      // Unknown non-ASCII scripts (for example Chinese) are also invalid; detectLanguage only recognizes
      // the Indic scripts configured by this product.
      if ((replyLanguage && replyLanguage.language !== input.session.language) || containsUnsupportedLetterScript(llmReply)) llmReply = null;
    }

    // When switching to a non-English language, verify the LLM reply is actually in the target language's
    // script. Some models can't write in certain scripts and produce garbage (e.g. Chinese for Malayalam).
    // Fall back to a deterministic switch acknowledgment so the caller hears the correct language.
    if (llmReply && switchLanguage && switchLanguage !== "en-IN") {
      const replyLang = detectLanguage(llmReply, supportedLanguages);
      if (!replyLang || replyLang.language !== switchLanguage) {
        // Require the requested language rather than accepting unrelated or plain-English output.
        llmReply = null;
      }
    }

    if (llmEscalate) {
      const escalationSummary: EscalationSummary = { trigger: "manual_request", reason: "The caller asked to speak with a human representative.", lastTranscript: transcript, recommendedAction: "Transfer the call to an operator with the conversation summary." };
      const slotState = this.composeSlotState(requiredSlots, { ...prior.collected }, priorMissing, belief);
      return this.buildDecision({ input, action: "escalate_to_human", confidence, slotState, missingSlots: priorMissing, responseText: llmReply ?? input.profile.escalationMessage, reason: escalationSummary.reason, promptStyle: "escalation", escalationSummary, llmText: llmReply, language: switchLanguage });
    }

    // (3) GROUNDING POLICY — band every freshly extracted value: accept (high) / confirm (medium) / re-prompt (low).
    const collected = { ...prior.collected };
    const accepted: string[] = [];
    let confirmTarget: PendingConfirmation | null = null;
    let repromptTarget: string | null = null;

    for (const slot of input.profile.slots) {
      if (collected[slot.key] !== undefined) continue;
      let value: string | undefined;
      let nlu: number | undefined;
      const llmValue = llmSlots[slot.key];
      const scored = ruleScored[slot.key];
      let fromLlm = false;
      if (llmValue !== undefined && String(llmValue).trim()) {
        value = String(llmValue).trim();
        nlu = clamp01(llmFieldConfidence[slot.key] ?? llmOverall);
        fromLlm = true;
      } else if (scored) {
        value = scored.value;
        nlu = scored.confidence;
      }
      if (value === undefined || nlu === undefined) continue;
      // A free-text slot (issue / enquiry topic) must NOT swallow the answer to a different question. The rule
      // extractor dumps the whole utterance into it on every turn; only accept that when it's the field we just
      // asked for. Values the LLM extracted are fine (the LLM only fills what the caller actually stated).
      if (!fromLlm && FREE_TEXT_SLOT_KEYS.has(slot.key) && slot.key !== priorMissing[0]) continue;
      // Reduce the spoken phrase to the clean value ("my name is Leena" -> "Leena") so the agent never parrots filler back.
      value = normalizeSlotValue(slot.key, value);
      if (!value) continue;

      // When the value came from the LLM, trust the model's own certainty (it understood the meaning) and only
      // lightly factor in the browser's unreliable ASR score. Rule-extracted values lean on ASR more.
      const combined = fromLlm
        ? clamp01(0.85 * nlu + 0.15 * clamp01(asrResult.confidence))
        : combineConfidence(asrResult.confidence, nlu);
      const band = bandFor(combined, thresholds);
      const attemptsForSlot = belief.attempts[slot.key] ?? 0;

      // Loop guard: after repeated failed asks, accept the best value so the call can finish.
      if (attemptsForSlot >= thresholds.maxAttempts) {
        this.acceptValue(collected, belief, accepted, slot.key, value, combined);
      } else if (band === "high") {
        this.acceptValue(collected, belief, accepted, slot.key, value, combined);
      } else if (band === "medium") {
        if (slot.required) {
          if (!confirmTarget) confirmTarget = { slotKey: slot.key, value, confidence: combined };
        } else {
          // Optional fields are opportunistic — store medium-confidence values without blocking the flow.
          this.acceptValue(collected, belief, accepted, slot.key, value, combined);
        }
      } else if (slot.required && !repromptTarget) {
        repromptTarget = slot.key;
      }
    }

    const missingSlots = requiredSlots.filter((slot) => !collected[slot]);

    // The deterministic extractor may recognize a value (especially a spaced phone number) that the LLM
    // omitted from extractedFields. In that case the model's reply was composed from stale missing-slot state
    // and commonly asks for the same field again. Discard it and build the response from the reconciled state.
    if (accepted.some((slotKey) => llmSlots[slotKey] === undefined)) llmReply = null;

    // (3a) Explicit confirmation takes priority — the value is held OUT of `collected` until grounded.
    if (confirmTarget) {
      belief.attempts[confirmTarget.slotKey] = (belief.attempts[confirmTarget.slotKey] ?? 0) + 1;
      const slotState = this.composeSlotState(requiredSlots, collected, missingSlots, belief, confirmTarget);
      // Grounding is deterministic and localized so the yes/no question always fires in the caller's language.
      const responseText = confirmPhrase(switchLanguage ?? input.session.language, confirmTarget.value);
      return this.buildDecision({ input, action: "confirm_slot", confidence: confirmTarget.confidence, slotState, missingSlots, responseText, reason: `Medium confidence on ${confirmTarget.slotKey}; asking the caller to confirm.`, promptStyle: "clarification", verbatim: true, extractedSlots: this.pick(collected, accepted), slotConfidence: belief.confidence, confirming: confirmTarget, uncertainty: { confirmations: belief.confirmations, reprompts: belief.reprompts, pendingSlot: confirmTarget.slotKey }, language: switchLanguage });
    }

    // (3b) Re-prompt a required slot we heard but couldn't trust.
    if (repromptTarget) {
      belief.reprompts += 1;
      belief.attempts[repromptTarget] = (belief.attempts[repromptTarget] ?? 0) + 1;
      const slotState = this.composeSlotState(requiredSlots, collected, missingSlots, belief);
      const responseText = repromptPhrase(switchLanguage ?? input.session.language);
      return this.buildDecision({ input, action: "ask_clarification", confidence: input.nluConfidence, slotState, missingSlots, responseText, reason: `Low confidence on ${repromptTarget}; re-prompting.`, promptStyle: "clarification", verbatim: true, extractedSlots: this.pick(collected, accepted), slotConfidence: belief.confidence, uncertainty: { confirmations: belief.confirmations, reprompts: belief.reprompts }, language: switchLanguage });
    }

    // (3c) Nothing to confirm or re-prompt — proceed normally (complete or ask the next field).
    const slotState = this.composeSlotState(requiredSlots, collected, missingSlots, belief);
    return this.advanceAfterCollection({ input, confidence, slotState, missingSlots, justAccepted: accepted, llmText: llmReply, language: switchLanguage });
  }

  private acceptValue(collected: Record<string, string>, belief: BeliefState, accepted: string[], key: string, value: string, confidence: number) {
    collected[key] = value;
    belief.confidence[key] = confidence;
    accepted.push(key);
  }

  /** Shared tail for "no grounding action needed": either complete the call or ask for the next missing field. */
  private async advanceAfterCollection(args: { input: ProcessTurnInput; confidence: number; slotState: CallSlotState; missingSlots: string[]; justAccepted: string[]; llmText: string | null; language?: LanguageCode }): Promise<ProcessTurnResult> {
    const extractedSlots = this.pick(args.slotState.collected, args.justAccepted);
    const uncertainty = { confirmations: args.slotState.confirmations ?? 0, reprompts: args.slotState.reprompts ?? 0 };
    const slotConfidence = args.slotState.confidence ?? {};

    if (args.missingSlots.length === 0) {
      const responseText = args.llmText ?? this.buildCompletionMessage(args.input.profile, args.slotState.collected);
      return this.buildDecision({ input: args.input, action: "complete_call", confidence: args.confidence, slotState: args.slotState, missingSlots: args.missingSlots, responseText, reason: "All required workflow slots are collected.", promptStyle: "completion", extractedSlots, allSlotsCollected: true, llmText: args.llmText, slotConfidence, uncertainty, language: args.language });
    }

    // Implicit confirmation: read freshly accepted values back to the caller as part of the next question.
    let responseText: string;
    let verbatim = false;
    if (args.llmText) {
      responseText = args.llmText;
    } else {
      const firstAccepted = args.justAccepted[0];
      const readback = args.justAccepted.length === 1 && firstAccepted
        ? `Got it — ${this.labelForSlot(args.input.profile, firstAccepted)}: ${args.slotState.collected[firstAccepted] ?? ""}. `
        : args.justAccepted.length > 1 ? "Got those, thank you. " : "";
      const effectiveLanguage = args.language ?? args.input.session.language;
      const englishPrompt = this.buildNextPrompt(args.input.profile, args.missingSlots[0]);
      // When switching to a new language and the LLM couldn't produce a valid reply, lead with the
      // deterministic switch acknowledgment so the caller hears the correct language immediately.
      if (!readback && args.language) {
        // Do not append the profile's English slot prompt to a localized acknowledgment. The next caller
        // answer is still processed against the same missing slot, and the following model turn stays localized.
        responseText = switchAcknowledgmentPhrase(args.language);
        verbatim = true;
      } else if (effectiveLanguage !== "en-IN") {
        const acknowledgment = args.justAccepted.length > 0 ? `${acceptedPhrase(effectiveLanguage)} ` : "";
        responseText = `${acknowledgment}${localizedSlotPrompt(effectiveLanguage, args.missingSlots[0], englishPrompt)}`;
        verbatim = true;
      } else {
        responseText = `${readback}${englishPrompt}`;
        verbatim = readback.length > 0;
      }
    }
    const action: OrchestratorDecision["action"] = args.justAccepted.length > 0 ? "execute_task" : "respond";
    return this.buildDecision({ input: args.input, action, confidence: args.confidence, slotState: args.slotState, missingSlots: args.missingSlots, responseText, reason: "The workflow is still collecting required fields.", promptStyle: "workflow", extractedSlots, llmText: args.llmText, verbatim, slotConfidence, uncertainty, language: args.language });
  }

  private composeSlotState(required: string[], collected: Record<string, string>, missing: string[], belief: BeliefState, pendingConfirmation?: PendingConfirmation): CallSlotState {
    return {
      required,
      collected,
      missing,
      confidence: belief.confidence,
      attempts: belief.attempts,
      confirmations: belief.confirmations,
      reprompts: belief.reprompts,
      ...(pendingConfirmation ? { pendingConfirmation } : {})
    };
  }

  private pick(source: Record<string, string>, keys: string[]): Record<string, string> | undefined {
    if (keys.length === 0) return undefined;
    const out: Record<string, string> = {};
    for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
    return Object.keys(out).length ? out : undefined;
  }

  private labelForSlot(profile: AgentProfile, key: string): string {
    return profile.slots.find((slot) => slot.key === key)?.label ?? key.replace(/_/g, " ");
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
    verbatim?: boolean;
    slotConfidence?: Record<string, number>;
    confirming?: PendingConfirmation;
    uncertainty?: { confirmations: number; reprompts: number; pendingSlot?: string };
    language?: LanguageCode;
  }): Promise<ProcessTurnResult> {
    let replyText: string;
    let llmProvider: "mock" | "openai-compatible";
    if (args.llmText) {
      // The real LLM already phrased a natural reply (in the caller's language).
      replyText = args.llmText;
      llmProvider = "openai-compatible";
    } else if (args.verbatim) {
      // Grounding prompts (confirm / re-prompt / readback) must reach the caller exactly as written.
      replyText = args.responseText;
      llmProvider = "mock";
    } else {
      const llmContext = { session: args.input.session, workflow: args.input.workflow, action: args.promptStyle, collectedSlots: args.slotState.collected, missingSlots: args.missingSlots, fallbackText: args.responseText, ...(args.missingSlots[0] ? { nextSlot: args.missingSlots[0] } : {}) };
      const llmResult = await aiAdapters.llm.generate(llmContext);
      replyText = llmResult.text;
      llmProvider = llmResult.provider;
    }
    const replyLanguage = args.language ?? args.input.session.language;
    const ttsResult = await aiAdapters.tts.synthesize({ text: replyText, language: replyLanguage, domain: args.input.session.domain });
    const decision: OrchestratorDecision = {
      action: args.action,
      confidence: args.confidence,
      reason: args.reason,
      responseText: replyText,
      missingSlots: args.missingSlots,
      aiMetadata: { asrProvider: "mock", llmProvider, ttsProvider: ttsResult.provider, normalizedTranscript: args.input.transcript.replace(/\s+/g, " ").trim(), promptStyle: args.promptStyle, synthesizedVoice: ttsResult.voice },
      ...(args.extractedSlots ? { extractedSlots: args.extractedSlots } : {}),
      ...(args.slotConfidence ? { slotConfidence: args.slotConfidence } : {}),
      ...(args.confirming ? { confirming: args.confirming } : {}),
      ...(args.uncertainty ? { uncertainty: args.uncertainty } : {}),
      ...(args.escalationSummary ? { escalationSummary: args.escalationSummary } : {})
    };
    return { decision, slotState: args.slotState, missingSlots: args.missingSlots, allSlotsCollected: Boolean(args.allSlotsCollected), ...(args.language ? { language: args.language } : {}) };
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
