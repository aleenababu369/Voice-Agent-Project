import type { AgentProfile, CallSession, Prospect } from "../../../../packages/contracts/src/index.ts";

/** Phrase a slot value so the rule-based extractor (and the LLM) can recognize it. Order matters: check specific keys before the generic name match. */
function phraseForSlot(key: string, value: string): string {
  if (/department/.test(key)) return `department ${value}`;
  if (/doctor/.test(key)) return `doctor ${value}`;
  if (/(program|course)/.test(key)) return `program ${value}`;
  if (/name/.test(key)) return `I am ${value}`;
  if (key === "age") return `age ${value}`;
  if (/date/.test(key)) return value;
  if (/time/.test(key)) return value;
  if (/(contact|callback|phone|number)/.test(key)) return `number ${value}`;
  if (/(student_id|patient_id|_id$)/.test(key)) return `id ${value}`;
  return value;
}

function defaultForSlot(key: string, prospect?: Prospect): string {
  if (/name/.test(key)) return prospect?.name ?? "Demo Prospect";
  if (/(contact|callback|phone|number)/.test(key)) return prospect?.phoneNumber ?? "9876543210";
  if (key === "age") return "35";
  if (/date/.test(key)) return "tomorrow";
  if (/time/.test(key)) return "10 am";
  if (/doctor|department/.test(key)) return "general";
  if (/(issue|purpose|inquiry_topic|program_interest)/.test(key)) return "general enquiry";
  return "yes";
}

/** Build a single natural utterance covering the required slots from a prospect's known data. */
export function buildProspectUtterance(profile: AgentProfile, prospect?: Prospect): string {
  const fields = prospect?.fields ?? {};
  const fragments = profile.slots
    .filter((slot) => slot.required)
    .map((slot) => phraseForSlot(slot.key, fields[slot.key] ?? defaultForSlot(slot.key, prospect)));
  return fragments.join(" ");
}

/** The next thing the simulated prospect says. For the hands-free dialer this answers everything in one turn. */
export function simulateProspectReply(input: { profile: AgentProfile; session: CallSession; prospect?: Prospect }): string {
  // If the agent asked the caller to confirm a medium-confidence value, the simulated prospect agrees.
  // This both exercises the uncertainty-aware confirmation flow and keeps the hands-free loop from stalling.
  if (input.session.slotState.pendingConfirmation) return "Yes, that's correct.";
  return buildProspectUtterance(input.profile, input.prospect);
}
