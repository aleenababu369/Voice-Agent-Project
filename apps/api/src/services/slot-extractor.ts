import type { AgentProfile, WorkflowType } from "../../../../packages/contracts/src/index.ts";

/** A rule-extracted slot value plus a heuristic confidence reflecting how specific/reliable the matching pattern is. */
export interface ScoredSlot {
  value: string;
  confidence: number;
}

// Per-pattern reliability. Tight, unambiguous patterns (dates, ids, numbers) score high; loose
// free-text or greedy name/department captures score lower so the grounding policy confirms them.
const SCORE = {
  precise: 0.85, // age, ids, phone numbers, explicit dates/times
  moderate: 0.7, // keyword-anchored statuses
  loose: 0.62, // greedy name / doctor / department / program captures
  freeText: 0.5 // "whatever the caller said" dumped into a free-text slot
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
    const contactMatch = transcript.match(/\b(?:phone|number|contact|callback)\s*[:#-]?\s*(\+?\d[\d -]{7,})\b/i);
    const doctorMatch = transcript.match(/\b(?:doctor|dr\.?|department)\s*[:#-]?\s*([a-zA-Z ]{2,})\b/i);

    if (keys.includes("patient_name")) set("patient_name", nameMatch?.[1], SCORE.loose);
    if (keys.includes("visitor_name")) set("visitor_name", nameMatch?.[1], SCORE.loose);
    if (keys.includes("caller_name")) set("caller_name", nameMatch?.[1], SCORE.loose);
    if (keys.includes("preferred_date")) set("preferred_date", dateMatch?.[1], SCORE.precise);
    if (keys.includes("preferred_time")) set("preferred_time", timeMatch?.[1], SCORE.precise);
    if (keys.includes("age")) set("age", ageMatch?.[1], SCORE.precise);
    if (keys.includes("student_id")) set("student_id", genericIdMatch?.[1], SCORE.precise);
    if (keys.includes("patient_id")) set("patient_id", genericIdMatch?.[1], SCORE.precise);
    if (keys.includes("contact_number")) set("contact_number", contactMatch?.[1], SCORE.precise);
    if (keys.includes("callback_number")) set("callback_number", contactMatch?.[1], SCORE.precise);
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
