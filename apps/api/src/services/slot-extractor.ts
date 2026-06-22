import type { AgentProfile, WorkflowType } from "../../../../packages/contracts/src/index.ts";

/** A rule-extracted slot value plus a heuristic confidence reflecting how specific/reliable the matching pattern is. */
export interface ScoredSlot {
  value: string;
  confidence: number;
}

// Free-text fields legitimately hold a whole phrase; everything else should be a tight value.
export const FREE_TEXT_SLOT_KEYS = new Set<string>(["issue", "purpose", "inquiry_topic"]);

// Phone/contact number slot keys that require a full 10-digit Indian mobile number.
const PHONE_SLOT_KEYS = new Set<string>(["contact_number", "callback_number", "phone_number"]);

// Conversational lead-ins a caller wraps the actual value in. Longer phrases first so they match before short ones.
const LEAD_IN = /^(?:i am interested in|i'?m interested in|interested in|i would like to know|i'?d like to know|i want to know|want to know|i would like to book|i want to book|i would like to|i'?d like to|i want to|i wanna|tell me about|know about|calling about|enquiring about|asking about|regarding|my spelling is|the spelling is|spelling is|it is spelled|it'?s spelled|that is spelled|spelled|spelt|my name is|patient name is|the patient is|the name is|name is|this is|i need|i want|i am|i'?m|it'?s|it is|its|please)\b[\s,:-]*/i;

/** Join a spelled-out value ("A - l - e - e - n - a" or "A l e e n a") into a single word ("Aleena"). */
function assembleSpelledOut(value: string): string {
  const tokens = value.split(/[\s.,_-]+/).filter(Boolean);
  if (tokens.length < 2) return value;
  const singles = tokens.filter((token) => /^[a-z0-9]$/i.test(token));
  if (singles.length >= 2 && singles.length / tokens.length >= 0.6) {
    const word = singles.join("");
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  return value;
}

/**
 * Pull the clean value out of a spoken phrase so the agent confirms/stores "Leena", not "my name is Leena".
 * Strips conversational lead-ins for every field, assembles spelled-out words, and drops trailing clauses
 * ("…and I want…") for structured fields.
 */
export function normalizeSlotValue(key: string, raw: string): string {
  const original = String(raw).trim();
  let value = original;
  let prev = "";
  while (value && value !== prev) { prev = value; value = value.replace(LEAD_IN, "").trim(); }
  if (!FREE_TEXT_SLOT_KEYS.has(key)) {
    value = assembleSpelledOut(value);
    value = value.replace(/[\s,]+(?:and|but|because|regarding)\b.*$/i, "").trim();
  }
  value = value.replace(/^[\s,."'?!-]+|[\s,."'?!-]+$/g, "").trim();
  // Phone/contact fields: only accept a complete 10-digit Indian mobile number.
  if (PHONE_SLOT_KEYS.has(key)) {
    const digitsOnly = value.replace(/[^\d]/g, "");
    // Strip leading country code "91" if present so we count the actual mobile digits.
    const mobile = digitsOnly.startsWith("91") && digitsOnly.length > 10 ? digitsOnly.slice(2) : digitsOnly;
    if (mobile.length < 10) return ""; // incomplete — force re-prompt
    // Return the clean 10-digit number (no spaces/dashes).
    value = mobile.slice(0, 10);
  }
  return value || original;
}

// Per-pattern reliability. Tight, unambiguous patterns (dates, ids, numbers) score high; the rest score
// "good enough to accept" so the agent doesn't pester the caller — the grounding policy only steps in for
// genuinely low-confidence values (or when the LLM itself reports it is unsure).
const SCORE = {
  precise: 0.92, // age, ids, phone numbers, explicit dates/times
  moderate: 0.82, // keyword-anchored statuses
  loose: 0.74, // greedy name / doctor / department / program captures
  freeText: 0.72 // "whatever the caller said" dumped into a free-text slot
} as const;

class SlotExtractor {
  extract(workflow: WorkflowType, transcript: string) {
    return this.extractByKeys(this.defaultKeysForWorkflow(workflow), transcript);
  }

  extractProfile(profile: AgentProfile, transcript: string) {
    return this.extractByKeys(profile.slots.map((slot) => slot.key), transcript);
  }

  /** Like {@link extractProfile} but each value carries a confidence for uncertainty-aware dialogue management. */
  extractProfileScored(profile: AgentProfile, transcript: string): Record<string, ScoredSlot> {
    return this.extractScored(profile.slots.map((slot) => slot.key), transcript);
  }

  private extractByKeys(keys: string[], transcript: string): Record<string, string> {
    const scored = this.extractScored(keys, transcript);
    const slots: Record<string, string> = {};
    for (const [key, entry] of Object.entries(scored)) slots[key] = entry.value;
    return slots;
  }

  private extractScored(keys: string[], transcript: string): Record<string, ScoredSlot> {
    const lowered = transcript.toLowerCase();
    const slots: Record<string, ScoredSlot> = {};
    const set = (key: string, value: string | undefined, confidence: number) => {
      const cleaned = value?.trim();
      if (cleaned) slots[key] = { value: cleaned, confidence };
    };

    const nameMatch = transcript.match(/(?:i am|this is|patient is|mera naam|my name is|hesaru|name is)\s+([a-zA-Z ]{2,}?)(?=\s+(?:and|for|need|want|on|at|ko|ge|age|issue|doctor|program|department|purpose)\b|$)/i);
    const dateMatch = transcript.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|tomorrow|today|kal|naale|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const timeMatch = transcript.match(/\b(\d{1,2}(?::\d{2})?\s?(?:am|pm)|morning|afternoon|evening|beligge|madhyahna)\b/i);
    const ageMatch = transcript.match(/\b(?:age|aged)\s*[:#-]?\s*(\d{1,3})\b/i);
    const genericIdMatch = transcript.match(/\b(?:id|student id|patient id|caller id)\s*[:#-]?\s*([a-zA-Z0-9-]+)\b/i);
    const contactMatch = transcript.match(/\b(?:phone|number|contact|callback)\s*[:#-]?\s*(\+?\d[\d -]{9,})\b/i);
    // A caller normally answers a contact-number question with digits only. Accept a bare spaced/dashed
    // number as well; normalizeSlotValue performs the final strict 10-digit validation.
    const bareContactMatch = transcript.match(/(?:^|\s)(\+?\d(?:[\d -]*\d)?)(?:\s|$)/);
    const bareContact = bareContactMatch?.[1];
    const contactCandidate = contactMatch?.[1] ?? ((bareContact?.replace(/\D/g, "").length ?? 0) >= 10 ? bareContact : undefined);
    const doctorMatch = transcript.match(/\b(?:doctor|dr\.?|department)\s*[:#-]?\s*([a-zA-Z ]{2,})\b/i);

    if (keys.includes("patient_name")) set("patient_name", nameMatch?.[1], SCORE.loose);
    if (keys.includes("visitor_name")) set("visitor_name", nameMatch?.[1], SCORE.loose);
    if (keys.includes("caller_name")) set("caller_name", nameMatch?.[1], SCORE.loose);
    if (keys.includes("preferred_date")) set("preferred_date", dateMatch?.[1], SCORE.precise);
    if (keys.includes("preferred_time")) set("preferred_time", timeMatch?.[1], SCORE.precise);
    if (keys.includes("age")) set("age", ageMatch?.[1], SCORE.precise);
    if (keys.includes("student_id")) set("student_id", genericIdMatch?.[1], SCORE.precise);
    if (keys.includes("patient_id")) set("patient_id", genericIdMatch?.[1], SCORE.precise);
    if (keys.includes("contact_number")) set("contact_number", contactCandidate, SCORE.precise);
    if (keys.includes("callback_number")) set("callback_number", contactCandidate, SCORE.precise);
    if (keys.includes("doctor_name")) set("doctor_name", doctorMatch?.[1], SCORE.loose);

    if (keys.includes("issue")) set("issue", transcript, SCORE.freeText);
    if (keys.includes("purpose")) set("purpose", transcript, SCORE.freeText);
    if (keys.includes("inquiry_topic")) set("inquiry_topic", transcript, SCORE.freeText);

    if (keys.includes("acknowledgement_status") && /(received|paid|okay|acknowledged|yes|haan|haanji|sari|got it)/i.test(lowered)) set("acknowledgement_status", "acknowledged", SCORE.moderate);
    if (keys.includes("confirmation_status") && /(yes|confirmed|can attend|available|haan|barteeni|confirm)/i.test(lowered)) set("confirmation_status", "confirmed", SCORE.moderate);
    if (keys.includes("confirmation_status") && /(no|cannot|can't attend|not available|nahi|baralla)/i.test(lowered)) set("confirmation_status", "not_confirmed", SCORE.moderate);

    if (keys.includes("department")) {
      const departmentMatch = transcript.match(/\b(?:department|team|office)\s*[:#-]?\s*([a-zA-Z ]{2,})\b/i);
      set("department", departmentMatch?.[1], SCORE.loose);
    }

    if (keys.includes("program_interest")) {
      const programMatch = transcript.match(/\b(?:program|course|admission for|interested in)\s*[:#-]?\s*([a-zA-Z .&-]{2,})\b/i);
      set("program_interest", programMatch?.[1], SCORE.loose);
    }

    return slots;
  }

  private defaultKeysForWorkflow(workflow: WorkflowType) {
    switch (workflow) {
      case "appointment_booking": return ["patient_name", "preferred_date", "preferred_time"];
      case "fee_reminder": return ["student_id", "acknowledgement_status"];
      case "follow_up_confirmation": return ["patient_id", "confirmation_status"];
      default: return ["topic"];
    }
  }
}

export const slotExtractor = new SlotExtractor();
