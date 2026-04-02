import type { AgentProfile, WorkflowType } from "../../../../packages/contracts/src/index.ts";

class SlotExtractor {
  extract(workflow: WorkflowType, transcript: string) {
    return this.extractByKeys(this.defaultKeysForWorkflow(workflow), transcript);
  }

  extractProfile(profile: AgentProfile, transcript: string) {
    return this.extractByKeys(profile.slots.map((slot) => slot.key), transcript);
  }

  private extractByKeys(keys: string[], transcript: string) {
    const lowered = transcript.toLowerCase();
    const slots: Record<string, string> = {};

    const nameMatch = transcript.match(/(?:i am|this is|patient is|mera naam|my name is|hesaru|name is)\s+([a-zA-Z ]{2,}?)(?=\s+(?:and|for|need|want|on|at|ko|ge|age|issue|doctor|program|department|purpose)\b|$)/i);
    const dateMatch = transcript.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|tomorrow|today|kal|naale|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const timeMatch = transcript.match(/\b(\d{1,2}(?::\d{2})?\s?(?:am|pm)|morning|afternoon|evening|beligge|madhyahna)\b/i);
    const ageMatch = transcript.match(/\b(?:age|aged)\s*[:#-]?\s*(\d{1,3})\b/i);
    const genericIdMatch = transcript.match(/\b(?:id|student id|patient id|caller id)\s*[:#-]?\s*([a-zA-Z0-9-]+)\b/i);
    const contactMatch = transcript.match(/\b(?:phone|number|contact|callback)\s*[:#-]?\s*(\+?\d[\d -]{7,})\b/i);
    const doctorMatch = transcript.match(/\b(?:doctor|dr\.?|department)\s*[:#-]?\s*([a-zA-Z ]{2,})\b/i);

    if (keys.includes("patient_name") && nameMatch?.[1]) slots.patient_name = nameMatch[1].trim();
    if (keys.includes("visitor_name") && nameMatch?.[1]) slots.visitor_name = nameMatch[1].trim();
    if (keys.includes("caller_name") && nameMatch?.[1]) slots.caller_name = nameMatch[1].trim();
    if (keys.includes("preferred_date") && dateMatch?.[1]) slots.preferred_date = dateMatch[1].trim();
    if (keys.includes("preferred_time") && timeMatch?.[1]) slots.preferred_time = timeMatch[1].trim();
    if (keys.includes("age") && ageMatch?.[1]) slots.age = ageMatch[1].trim();
    if (keys.includes("student_id") && genericIdMatch?.[1]) slots.student_id = genericIdMatch[1];
    if (keys.includes("patient_id") && genericIdMatch?.[1]) slots.patient_id = genericIdMatch[1];
    if (keys.includes("contact_number") && contactMatch?.[1]) slots.contact_number = contactMatch[1].trim();
    if (keys.includes("callback_number") && contactMatch?.[1]) slots.callback_number = contactMatch[1].trim();
    if (keys.includes("doctor_name") && doctorMatch?.[1]) slots.doctor_name = doctorMatch[1].trim();

    if (keys.includes("issue") && transcript.trim()) slots.issue = transcript.trim();
    if (keys.includes("purpose") && transcript.trim()) slots.purpose = transcript.trim();
    if (keys.includes("inquiry_topic") && transcript.trim()) slots.inquiry_topic = transcript.trim();

    if (keys.includes("acknowledgement_status") && /(received|paid|okay|acknowledged|yes|haan|haanji|sari|got it)/i.test(lowered)) slots.acknowledgement_status = "acknowledged";
    if (keys.includes("confirmation_status") && /(yes|confirmed|can attend|available|haan|barteeni|confirm)/i.test(lowered)) slots.confirmation_status = "confirmed";
    if (keys.includes("confirmation_status") && /(no|cannot|can't attend|not available|nahi|baralla)/i.test(lowered)) slots.confirmation_status = "not_confirmed";

    if (keys.includes("department")) {
      const departmentMatch = transcript.match(/\b(?:department|team|office)\s*[:#-]?\s*([a-zA-Z ]{2,})\b/i);
      if (departmentMatch?.[1]) slots.department = departmentMatch[1].trim();
    }

    if (keys.includes("program_interest")) {
      const programMatch = transcript.match(/\b(?:program|course|admission for|interested in)\s*[:#-]?\s*([a-zA-Z .&-]{2,})\b/i);
      if (programMatch?.[1]) slots.program_interest = programMatch[1].trim();
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
