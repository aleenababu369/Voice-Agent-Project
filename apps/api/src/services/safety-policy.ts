const safetyKeywords = ["emergency", "suicide", "collapse", "severe pain", "bleeding"];
const manualEscalationKeywords = ["human", "agent", "person", "representative"];

class SafetyPolicy {
  evaluate(transcript: string, confidence: number) {
    const lowered = transcript.toLowerCase();

    if (manualEscalationKeywords.some((keyword) => lowered.includes(keyword))) {
      return {
        trigger: "manual_request" as const,
        reason: "The caller asked to speak with a human representative.",
        recommendedAction: "Transfer the call to an operator with the conversation summary."
      };
    }

    if (safetyKeywords.some((keyword) => lowered.includes(keyword))) {
      return {
        trigger: "safety_keyword" as const,
        reason: "A safety-critical keyword was detected in the conversation.",
        recommendedAction: "Route to a trained human agent immediately and prioritize the call."
      };
    }

    if (confidence < 0.4) {
      return {
        trigger: "low_confidence" as const,
        reason: "ASR or NLU confidence is too low for safe automation.",
        recommendedAction: "Escalate to a human after providing the last transcript and collected slots."
      };
    }

    return null;
  }
}

export const safetyPolicy = new SafetyPolicy();
