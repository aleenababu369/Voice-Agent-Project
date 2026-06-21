/**
 * Uncertainty-aware dialogue management primitives.
 *
 * Each collected slot carries a *belief* confidence derived from BOTH the speech-recognition
 * confidence (did we hear the words?) and the NLU/extraction confidence (did we understand the
 * meaning?). A confidence-banded grounding policy then decides whether to accept a value silently,
 * ask the caller to explicitly confirm it, or reject it and re-prompt — the classic
 * accept / confirm / reject policy from the spoken-dialogue-systems literature.
 *
 * Thresholds are tunable via env so the behaviour can be demonstrated without code changes:
 *   UADM_ACCEPT_THRESHOLD  (default 0.70) — at/above this a value is taken as grounded.
 *   UADM_CONFIRM_THRESHOLD (default 0.40) — between this and accept we ask "did you say X?".
 *   UADM_MAX_ATTEMPTS      (default 3)    — after this many failed asks for one slot, give up and accept.
 */

export interface UncertaintyThresholds {
  /** >= accept -> high band: take the value as grounded. */
  accept: number;
  /** [confirm, accept) -> medium band: ask the caller to confirm before accepting. */
  confirm: number;
  /** After this many failed asks for one slot, accept the best value to avoid an infinite loop. */
  maxAttempts: number;
}

export type ConfidenceBand = "high" | "medium" | "low";
export type ConfirmationVerdict = "yes" | "no" | "unknown";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getUncertaintyThresholds(): UncertaintyThresholds {
  const accept = clamp01(numEnv("UADM_ACCEPT_THRESHOLD", 0.7));
  const confirm = clamp01(numEnv("UADM_CONFIRM_THRESHOLD", 0.4));
  const maxAttempts = Math.max(1, Math.round(numEnv("UADM_MAX_ATTEMPTS", 3)));
  // Guard against an inverted configuration (confirm must not exceed accept).
  return { accept, confirm: Math.min(confirm, accept), maxAttempts };
}

/**
 * Combine the ASR and NLU confidences into a single belief score. Treating the two as independent
 * evidence sources, the joint certainty is their product — conservative by design: a value reaches
 * the "high" band only when we both *heard* it and *understood* it well.
 */
export function combineConfidence(asrConfidence: number, nluConfidence: number): number {
  return clamp01(clamp01(asrConfidence) * clamp01(nluConfidence));
}

export function bandFor(confidence: number, thresholds: UncertaintyThresholds): ConfidenceBand {
  if (confidence >= thresholds.accept) return "high";
  if (confidence >= thresholds.confirm) return "medium";
  return "low";
}

// Multilingual (en / hi / kn) affirmations and negations a caller might give to a confirmation question.
const YES_PATTERN = /\b(yes|yeah|yep|yup|correct|right|exactly|sure|confirm(ed)?|perfect|sounds good|haan|haanji|sari|sahi|barabar)\b/i;
const NO_PATTERN = /\b(no|nope|nah|wrong|incorrect|change it|nahi|illa|alla)\b/i;

/** Interpret a caller's reply to an explicit confirmation question as yes / no / (anything else = a correction). */
export function interpretConfirmation(transcript: string): ConfirmationVerdict {
  const text = transcript.trim();
  if (!text) return "unknown";
  const saysYes = YES_PATTERN.test(text);
  const saysNo = NO_PATTERN.test(text);
  if (saysNo && !saysYes) return "no";
  if (saysYes && !saysNo) return "yes";
  return "unknown";
}
