import type { AgentProfile, Domain, SlotDefinition, Tenant, WorkflowType } from "../../../../packages/contracts/src/index.ts";
import { authService } from "./auth.service.ts";
import { getCollection, stripId } from "../db/mongo.ts";

const PROFILES_COLLECTION = "agent_profiles";
const VERSIONS_COLLECTION = "agent_profile_versions";

const now = () => new Date().toISOString();

type AgentProfileSlotInput = Omit<SlotDefinition, "examples"> & { examples?: string[] | undefined };
type AgentProfileInput = Omit<AgentProfile, "id" | "createdAt" | "updatedAt" | "slots"> & { id?: string; slots: AgentProfileSlotInput[] };
type AgentProfileUpdateInput = Omit<AgentProfile, "id" | "createdAt" | "updatedAt" | "slots"> & { slots: AgentProfileSlotInput[] };

export type AdminRole = "viewer" | "editor" | "admin";

export interface AgentProfileTemplate {
  id: string;
  name: string;
  domain: Domain;
  workflow: WorkflowType;
  description: string;
  languages: AgentProfile["languages"];
  welcomeMessage: string;
  systemPrompt: string;
  completionMessageTemplate: string;
  escalationMessage: string;
  slots: SlotDefinition[];
  validationRules: string[];
  sampleUtterance: string;
}

export interface AgentProfileVersion {
  id: string;
  profileId: string;
  version: number;
  changedAt: string;
  changedBy: { id: string; name: string; role: AdminRole };
  changeSummary: string;
  profile: AgentProfile;
}

export class AgentProfileValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues[0] ?? "Agent profile validation failed.");
    this.name = "AgentProfileValidationError";
    this.issues = issues;
  }
}

/** Retained for backward compatibility with route error handling; no longer thrown (auth replaces RBAC). */
export class AgentProfileAccessError extends Error {
  readonly role: AdminRole;
  constructor(role: AdminRole, reason?: string) {
    super(reason ?? "Access denied.");
    this.name = "AgentProfileAccessError";
    this.role = role;
  }
}

function normalizeProfileSlots(slots: AgentProfileSlotInput[]): SlotDefinition[] {
  return slots.map((slot) => slot.examples && slot.examples.length > 0
    ? { key: slot.key, label: slot.label, prompt: slot.prompt, required: slot.required, examples: slot.examples }
    : { key: slot.key, label: slot.label, prompt: slot.prompt, required: slot.required });
}

const agentProfileTemplates: AgentProfileTemplate[] = [
  {
    id: "hospital-appointment-template",
    name: "Hospital Appointment Template",
    domain: "healthcare",
    workflow: "appointment_booking",
    description: "Collects appointment information for hospitals and clinics.",
    languages: ["en-IN", "hi-IN", "kn-IN"],
    welcomeMessage: "Hello, this is the hospital appointment assistant. I can help you book a consultation.",
    systemPrompt: "Be calm, clear, and brief. Collect the required healthcare appointment fields carefully and avoid medical advice.",
    completionMessageTemplate: "Thank you. I have captured your appointment request for {{patient_name}} with {{doctor_name}} regarding {{issue}} on {{preferred_date}} at {{preferred_time}}.",
    escalationMessage: "I am connecting you to a human hospital representative for safer assistance.",
    slots: [
      { key: "patient_name", label: "Patient name", prompt: "Please tell me the patient name.", required: true, examples: ["I am Asha"] },
      { key: "age", label: "Age", prompt: "Please tell me the patient age.", required: true, examples: ["Age 42"] },
      { key: "issue", label: "Health issue", prompt: "Please briefly describe the issue or symptom.", required: true, examples: ["Fever and cough"] },
      { key: "doctor_name", label: "Doctor or department", prompt: "Which doctor or department do you want?", required: true, examples: ["Dr Rao", "Cardiology"] },
      { key: "preferred_date", label: "Preferred date", prompt: "What date would you prefer?", required: true, examples: ["Tomorrow"] },
      { key: "preferred_time", label: "Preferred time", prompt: "What time would you prefer?", required: true, examples: ["10 am"] }
    ],
    validationRules: [
      "Include patient name, age, issue, doctor or department, preferred date, and preferred time as required fields.",
      "Use calm service language and avoid diagnosing or giving treatment advice.",
      "Completion message should include the patient name and booking summary placeholders."
    ],
    sampleUtterance: "I am Asha age 42 issue fever doctor Dr Rao tomorrow 10 am"
  },
  {
    id: "frontdesk-reception-template",
    name: "Front Desk Reception Template",
    domain: "frontdesk",
    workflow: "frontdesk_reception",
    description: "Routes visitors and callers for office and business reception desks.",
    languages: ["en-IN", "hi-IN"],
    welcomeMessage: "Hello, this is the front desk assistant. I can help route your request.",
    systemPrompt: "Sound helpful and efficient. Collect purpose and routing details clearly.",
    completionMessageTemplate: "Thank you. I have noted that {{visitor_name}} needs help with {{purpose}} for {{department}}. We will contact you at {{callback_number}} if needed.",
    escalationMessage: "I will connect you to the front desk team now.",
    slots: [
      { key: "visitor_name", label: "Visitor name", prompt: "May I have your name?", required: true },
      { key: "purpose", label: "Purpose", prompt: "What is the purpose of your visit or call?", required: true },
      { key: "department", label: "Department", prompt: "Which team or department do you need?", required: true },
      { key: "callback_number", label: "Callback number", prompt: "What callback number should we use?", required: true }
    ],
    validationRules: [
      "Include visitor name, purpose, department, and callback number as required fields.",
      "Keep wording short and operational so routing is fast.",
      "Completion message should confirm the department and callback number."
    ],
    sampleUtterance: "My name is Ravi purpose meeting department sales callback 9876543210"
  },
  {
    id: "education-reception-template",
    name: "Education Reception Template",
    domain: "education",
    workflow: "institution_reception",
    description: "Handles admissions, program, and campus enquiries for educational institutions.",
    languages: ["en-IN", "hi-IN", "kn-IN"],
    welcomeMessage: "Hello, this is the education reception assistant. I can help with admissions and campus enquiries.",
    systemPrompt: "Be welcoming and informative. Collect the caller name, program interest, and enquiry topic.",
    completionMessageTemplate: "Thank you. I have noted the enquiry from {{caller_name}} about {{program_interest}} and {{inquiry_topic}}. We will follow up on {{contact_number}}.",
    escalationMessage: "I am transferring this to an institution representative now.",
    slots: [
      { key: "caller_name", label: "Caller name", prompt: "May I know your name?", required: true },
      { key: "program_interest", label: "Program interest", prompt: "Which course or program are you interested in?", required: true },
      { key: "inquiry_topic", label: "Enquiry topic", prompt: "What would you like help with?", required: true },
      { key: "contact_number", label: "Contact number", prompt: "What contact number should we use for follow-up?", required: true }
    ],
    validationRules: [
      "Include caller name, program interest, enquiry topic, and contact number as required fields.",
      "Use welcoming language and mention admissions or campus support when relevant.",
      "Completion message should include at least caller name and program interest placeholders."
    ],
    sampleUtterance: "My name is Nisha interested in M.Tech inquiry admissions contact 9876543210"
  },
  {
    id: "hospital-enquiry-template",
    name: "Hospital Department Enquiry",
    domain: "healthcare",
    workflow: "general_enquiry",
    description: "Answers patient enquiries about departments, services, and timings, and logs the request.",
    languages: ["en-IN", "hi-IN", "kn-IN"],
    welcomeMessage: "Hello, this is the hospital help desk. I can answer your enquiry and note your details.",
    systemPrompt: "Be helpful, calm, and brief. Collect the caller name, what they are enquiring about, and a contact number. Never give medical advice or a diagnosis.",
    completionMessageTemplate: "Thank you {{caller_name}}. I have logged your enquiry about {{inquiry_topic}} and our team will reach you at {{contact_number}}.",
    escalationMessage: "Let me connect you to a hospital representative who can help further.",
    slots: [
      { key: "caller_name", label: "Caller name", prompt: "May I have your name?", required: true, examples: ["I am Asha"] },
      { key: "inquiry_topic", label: "Enquiry topic", prompt: "What would you like to know about?", required: true, examples: ["Cardiology consultation timings"] },
      { key: "contact_number", label: "Contact number", prompt: "What number should we use to follow up?", required: true, examples: ["number 9876543210"] }
    ],
    validationRules: [
      "Include caller name, enquiry topic, and contact number as required fields.",
      "Stay informational and never give medical advice or diagnosis.",
      "Completion message should reference the caller name and enquiry topic."
    ],
    sampleUtterance: "I am Asha I want to know cardiology timings number 9876543210"
  },
  {
    id: "hospital-reminder-template",
    name: "Hospital Payment Reminder",
    domain: "healthcare",
    workflow: "fee_reminder",
    description: "Reminds patients about a pending payment or report and records their acknowledgement.",
    languages: ["en-IN", "hi-IN", "kn-IN"],
    welcomeMessage: "Hello, this is a reminder call from the hospital billing desk.",
    systemPrompt: "Be polite and clear. Confirm the patient identity, remind them about the pending payment, and capture their acknowledgement and a callback number.",
    completionMessageTemplate: "Thank you {{patient_name}}. I have recorded your acknowledgement ({{acknowledgement_status}}) and we will call back on {{callback_number}} if needed.",
    escalationMessage: "I will connect you to the billing team now.",
    slots: [
      { key: "patient_name", label: "Patient name", prompt: "May I confirm the patient name?", required: true, examples: ["I am Asha"] },
      { key: "patient_id", label: "Patient ID", prompt: "What is the patient ID?", required: true, examples: ["id P12345"] },
      { key: "acknowledgement_status", label: "Acknowledgement", prompt: "Have you noted the pending payment reminder?", required: true, examples: ["yes received"] },
      { key: "callback_number", label: "Callback number", prompt: "What is a good callback number?", required: true, examples: ["callback 9876543210"] }
    ],
    validationRules: [
      "Include patient name, patient ID, acknowledgement, and callback number as required fields.",
      "Keep the reminder polite and never pressure the patient.",
      "Completion message should reference the patient name and acknowledgement."
    ],
    sampleUtterance: "I am Asha id P12345 yes received callback 9876543210"
  },
  {
    id: "hospital-followup-template",
    name: "Hospital Discharge Follow-up",
    domain: "healthcare",
    workflow: "follow_up_confirmation",
    description: "Confirms a post-discharge follow-up visit and the preferred date with the patient.",
    languages: ["en-IN", "hi-IN", "kn-IN"],
    welcomeMessage: "Hello, this is a follow-up call from the hospital care team.",
    systemPrompt: "Be warm and reassuring. Confirm the patient identity, ask whether they can attend the follow-up, and capture a preferred date. Avoid medical advice.",
    completionMessageTemplate: "Thank you {{patient_name}}. Your follow-up visit is {{confirmation_status}} for {{preferred_date}}.",
    escalationMessage: "Let me connect you to a member of the care team.",
    slots: [
      { key: "patient_name", label: "Patient name", prompt: "May I confirm the patient name?", required: true, examples: ["I am Asha"] },
      { key: "patient_id", label: "Patient ID", prompt: "What is the patient ID?", required: true, examples: ["id P12345"] },
      { key: "confirmation_status", label: "Confirmation", prompt: "Can you attend the follow-up visit?", required: true, examples: ["yes I can attend"] },
      { key: "preferred_date", label: "Preferred date", prompt: "Which date works best for the follow-up?", required: true, examples: ["tomorrow"] }
    ],
    validationRules: [
      "Include patient name, patient ID, confirmation, and preferred date as required fields.",
      "Keep wording warm and reassuring; do not give medical advice.",
      "Completion message should reference the patient name and confirmation."
    ],
    sampleUtterance: "I am Asha id P12345 yes I can attend tomorrow"
  },
  {
    id: "education-counseling-template",
    name: "Education Counseling Appointment",
    domain: "education",
    workflow: "appointment_booking",
    description: "Books a counseling or admissions appointment for a prospective student.",
    languages: ["en-IN", "hi-IN", "kn-IN"],
    welcomeMessage: "Hello, this is the admissions counseling assistant. I can book a counseling session for you.",
    systemPrompt: "Be welcoming and encouraging. Collect the caller name, the program of interest, and a preferred date and time for the counseling session.",
    completionMessageTemplate: "Thank you {{caller_name}}. Your counseling session for {{program_interest}} is set for {{preferred_date}} at {{preferred_time}}.",
    escalationMessage: "I am connecting you to an admissions counselor now.",
    slots: [
      { key: "caller_name", label: "Caller name", prompt: "May I know your name?", required: true, examples: ["I am Nisha"] },
      { key: "program_interest", label: "Program interest", prompt: "Which course or program are you interested in?", required: true, examples: ["program M.Tech"] },
      { key: "preferred_date", label: "Preferred date", prompt: "What date would you prefer for counseling?", required: true, examples: ["tomorrow"] },
      { key: "preferred_time", label: "Preferred time", prompt: "What time would you prefer?", required: true, examples: ["11 am"] }
    ],
    validationRules: [
      "Include caller name, program interest, preferred date, and preferred time as required fields.",
      "Use welcoming, encouraging language for prospective students.",
      "Completion message should reference the caller name and program interest."
    ],
    sampleUtterance: "I am Nisha program M.Tech tomorrow 11 am"
  },
  {
    id: "education-fee-reminder-template",
    name: "Education Fee Reminder",
    domain: "education",
    workflow: "fee_reminder",
    description: "Reminds a student about pending fees and records their acknowledgement.",
    languages: ["en-IN", "hi-IN", "kn-IN"],
    welcomeMessage: "Hello, this is a fee reminder call from the college accounts office.",
    systemPrompt: "Be polite and clear. Confirm the caller name and student ID, remind about the pending fee, and capture their acknowledgement and a callback number.",
    completionMessageTemplate: "Thank you {{caller_name}}. Acknowledgement recorded ({{acknowledgement_status}}) for student {{student_id}}; we will call {{callback_number}} if needed.",
    escalationMessage: "I will connect you to the accounts office now.",
    slots: [
      { key: "caller_name", label: "Caller name", prompt: "May I have your name?", required: true, examples: ["I am Nisha"] },
      { key: "student_id", label: "Student ID", prompt: "What is the student ID?", required: true, examples: ["id S2024"] },
      { key: "acknowledgement_status", label: "Acknowledgement", prompt: "Have you noted the pending fee reminder?", required: true, examples: ["yes received"] },
      { key: "callback_number", label: "Callback number", prompt: "What is a good callback number?", required: true, examples: ["callback 9876543210"] }
    ],
    validationRules: [
      "Include caller name, student ID, acknowledgement, and callback number as required fields.",
      "Keep the reminder polite and respectful.",
      "Completion message should reference the caller name and acknowledgement."
    ],
    sampleUtterance: "I am Nisha id S2024 yes received callback 9876543210"
  },
  {
    id: "education-followup-template",
    name: "Education Admission Follow-up",
    domain: "education",
    workflow: "follow_up_confirmation",
    description: "Confirms an admission or exam follow-up and the preferred date with the student.",
    languages: ["en-IN", "hi-IN", "kn-IN"],
    welcomeMessage: "Hello, this is an admissions follow-up call from the college.",
    systemPrompt: "Be encouraging and clear. Confirm the caller name and student ID, ask whether they will proceed with the next step, and capture a preferred date.",
    completionMessageTemplate: "Thank you {{caller_name}}. Your admission follow-up is {{confirmation_status}} for {{preferred_date}}.",
    escalationMessage: "Let me connect you to the admissions team.",
    slots: [
      { key: "caller_name", label: "Caller name", prompt: "May I know your name?", required: true, examples: ["I am Nisha"] },
      { key: "student_id", label: "Student ID", prompt: "What is the student ID or application number?", required: true, examples: ["id S2024"] },
      { key: "confirmation_status", label: "Confirmation", prompt: "Will you proceed with the next admission step?", required: true, examples: ["yes confirmed"] },
      { key: "preferred_date", label: "Preferred date", prompt: "Which date works for the next step?", required: true, examples: ["tomorrow"] }
    ],
    validationRules: [
      "Include caller name, student ID, confirmation, and preferred date as required fields.",
      "Use encouraging language for prospective students.",
      "Completion message should reference the caller name and confirmation."
    ],
    sampleUtterance: "I am Nisha id S2024 yes confirmed tomorrow"
  }
];

function cloneSlots(slots: SlotDefinition[]) {
  return slots.map((slot) => slot.examples ? { ...slot, examples: [...slot.examples] } : { ...slot });
}

function templateForUseCase(useCase: Domain): AgentProfileTemplate {
  return agentProfileTemplates.find((item) => item.domain === useCase) ?? agentProfileTemplates[0]!;
}

function templatesForUseCase(useCase: Domain): AgentProfileTemplate[] {
  const matches = agentProfileTemplates.filter((item) => item.domain === useCase);
  return matches.length > 0 ? matches : [templateForUseCase(useCase)];
}

function templateById(id: string): AgentProfileTemplate {
  const template = agentProfileTemplates.find((item) => item.id === id);
  if (!template) throw new Error(`Agent profile template not found: ${id}`);
  return template;
}

/** Short, human label for the use case a workflow represents (used to name provisioned agents). */
function useCaseLabel(workflow: WorkflowType): string {
  switch (workflow) {
    case "appointment_booking": return "Appointments";
    case "general_enquiry": return "Enquiries";
    case "institution_reception": return "Reception";
    case "fee_reminder": return "Reminders";
    case "follow_up_confirmation": return "Follow-ups";
    case "frontdesk_reception": return "Reception";
    default: return "Agent";
  }
}

function buildProfileFromTemplate(template: AgentProfileTemplate, accountId: string, customName?: string, status: AgentProfile["status"] = "deployed"): AgentProfile {
  const timestamp = now();
  const slug = accountId.replace(/[^a-z0-9]+/g, "-");
  return {
    id: `${slug}-${template.workflow}`,
    tenantId: accountId,
    name: customName ?? template.name,
    domain: template.domain,
    workflow: template.workflow,
    description: template.description,
    languages: [...template.languages],
    welcomeMessage: template.welcomeMessage,
    systemPrompt: template.systemPrompt,
    completionMessageTemplate: template.completionMessageTemplate,
    escalationMessage: template.escalationMessage,
    slots: cloneSlots(template.slots),
    status,
    ...(status === "deployed" ? { deployedAt: timestamp } : {}),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

const SYSTEM_ACTOR = { id: "system", name: "System", role: "admin" as AdminRole };

function accountActor(accountId: string): { id: string; name: string; role: AdminRole } {
  const account = authService.findAccount(accountId);
  return { id: accountId, name: account?.name ?? accountId, role: "admin" };
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

class AgentProfileService {
  private readonly profiles = new Map<string, AgentProfile>();
  private readonly versions = new Map<string, AgentProfileVersion[]>();
  private phoneSeq = 70000001;

  constructor() {
    const seeded = [
      // Hospital demo account: one deployed agent per healthcare use case.
      buildProfileFromTemplate(templateById("hospital-appointment-template"), "city-hospital", "City Hospital Appointment Desk"),
      buildProfileFromTemplate(templateById("hospital-enquiry-template"), "city-hospital", "City Hospital Enquiry Desk"),
      buildProfileFromTemplate(templateById("hospital-reminder-template"), "city-hospital", "City Hospital Billing Reminder"),
      buildProfileFromTemplate(templateById("hospital-followup-template"), "city-hospital", "City Hospital Discharge Follow-up"),
      // Education demo account: one deployed agent per education use case.
      buildProfileFromTemplate(templateById("education-reception-template"), "greenfield-college", "Greenfield Admissions Reception"),
      buildProfileFromTemplate(templateById("education-counseling-template"), "greenfield-college", "Greenfield Counseling Desk"),
      buildProfileFromTemplate(templateById("education-fee-reminder-template"), "greenfield-college", "Greenfield Fee Reminder"),
      buildProfileFromTemplate(templateById("education-followup-template"), "greenfield-college", "Greenfield Admission Follow-up"),
      // Front desk demo account.
      buildProfileFromTemplate(templateById("frontdesk-reception-template"), "northstar-frontdesk", "Northstar Reception Desk")
    ];
    for (const profile of seeded) {
      // Phone numbers are assigned in hydrate(), after any persisted numbers are loaded, so a seed
      // can never be issued a number that a previously-saved agent already owns.
      this.profiles.set(profile.id, profile);
      this.versions.set(profile.id, [this.createVersionSnapshot(profile, SYSTEM_ACTOR, "Initial demo seed")]);
    }
  }

  /** Generate the next unique inbound phone number (Indian mobile-style) for an agent. */
  private allocatePhoneNumber(): string {
    let number: string;
    do {
      number = `+9190${this.phoneSeq++}`;
    } while ([...this.profiles.values()].some((profile) => profile.phoneNumber === number));
    return number;
  }

  /** Resolve the deployed agent a caller dialed, by its phone number (ignoring spaces/formatting). */
  findByPhoneNumber(number: string) {
    const target = normalizePhone(number);
    return [...this.profiles.values()].find((profile) => profile.phoneNumber && normalizePhone(profile.phoneNumber) === target) ?? null;
  }

  getDefaultTenantId() {
    return authService.getDefaultAccountId();
  }

  /** Account presented in the legacy Tenant shape (id/name/description/domainFocus) for display call sites. */
  getTenant(id?: string): Tenant {
    const account = authService.getAccount(id ?? authService.getDefaultAccountId());
    return { id: account.id, name: account.name, description: `${account.name} workspace`, domainFocus: account.useCase ?? "education", createdAt: account.createdAt };
  }

  getAccount(id?: string) {
    return authService.getAccount(id ?? authService.getDefaultAccountId());
  }

  listTenants(): Tenant[] {
    return authService.listAccounts().map((account) => ({ id: account.id, name: account.name, description: `${account.name} workspace`, domainFocus: account.useCase ?? "education", createdAt: account.createdAt }));
  }

  /** Provision one draft agent per use case for a freshly onboarded account's domain. Returns the primary (first). */
  provisionStarterAgent(accountId: string, useCase: Domain, accountName?: string) {
    return this.provisionUseCaseAgents(accountId, useCase, accountName)[0]!;
  }

  /** Create a draft agent for every use case in the account's domain (e.g. hospital → appointments, enquiries, reminders, follow-ups). */
  provisionUseCaseAgents(accountId: string, useCase: Domain, accountName?: string): AgentProfile[] {
    const name = accountName ?? this.getAccount(accountId).name;
    const created: AgentProfile[] = [];
    for (const template of templatesForUseCase(useCase)) {
      const profile = buildProfileFromTemplate(template, accountId, `${name} · ${useCaseLabel(template.workflow)}`, "draft");
      profile.phoneNumber = this.allocatePhoneNumber();
      this.profiles.set(profile.id, profile);
      this.versions.set(profile.id, [this.createVersionSnapshot(profile, accountActor(accountId), "Use-case agent provisioned")]);
      created.push(profile);
    }
    return created;
  }

  setDeployment(profileId: string, deployed: boolean, accountId: string) {
    const existing = this.get(profileId, accountId);
    const timestamp = now();
    const profile: AgentProfile = {
      ...existing,
      status: deployed ? "deployed" : "draft",
      ...(deployed ? { deployedAt: timestamp } : {}),
      updatedAt: timestamp
    };
    this.profiles.set(profileId, profile);
    this.appendVersion(profile, accountActor(accountId), deployed ? "Agent deployed" : "Agent moved to draft");
    return profile;
  }

  isDeployed(profile: AgentProfile) {
    return profile.status !== "draft";
  }

  list(accountId?: string) {
    const scoped = accountId ?? authService.getDefaultAccountId();
    return [...this.profiles.values()].filter((profile) => profile.tenantId === scoped);
  }

  listTemplates() {
    return agentProfileTemplates;
  }

  getTemplate(id: string) {
    const template = agentProfileTemplates.find((item) => item.id === id);
    if (!template) throw new Error(`Agent profile template not found: ${id}`);
    return template;
  }

  createFromTemplate(id: string, accountId?: string) {
    const template = this.getTemplate(id);
    const scoped = accountId ?? authService.getDefaultAccountId();
    return {
      id: "",
      tenantId: scoped,
      name: template.name,
      domain: template.domain,
      workflow: template.workflow,
      description: template.description,
      languages: [...template.languages],
      welcomeMessage: template.welcomeMessage,
      systemPrompt: template.systemPrompt,
      completionMessageTemplate: template.completionMessageTemplate,
      escalationMessage: template.escalationMessage,
      slots: cloneSlots(template.slots)
    };
  }

  get(id: string, accountId?: string) {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error(`Agent profile not found: ${id}`);
    if (accountId && profile.tenantId !== accountId) throw new Error(`Agent profile not found: ${id}`);
    return profile;
  }

  listVersions(profileId: string, accountId?: string) {
    this.get(profileId, accountId);
    return [...(this.versions.get(profileId) ?? [])].sort((left, right) => right.version - left.version);
  }

  create(input: AgentProfileInput, accountId: string) {
    const normalizedInput = { ...input, tenantId: accountId, slots: normalizeProfileSlots(input.slots) };
    this.assertValid(normalizedInput);
    const timestamp = now();
    const id = input.id && input.id.trim().length > 0
      ? input.id
      : `${accountId.replace(/[^a-z0-9]+/g, "-")}-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const existing = this.profiles.get(id);
    const profile: AgentProfile = { ...normalizedInput, id, phoneNumber: existing?.phoneNumber ?? this.allocatePhoneNumber(), createdAt: timestamp, updatedAt: timestamp };
    this.profiles.set(profile.id, profile);
    this.appendVersion(profile, accountActor(accountId), "Agent created");
    return profile;
  }

  update(id: string, input: AgentProfileUpdateInput, accountId: string) {
    const existing = this.get(id, accountId);
    const normalizedInput = { ...input, tenantId: existing.tenantId, slots: normalizeProfileSlots(input.slots) };
    this.assertValid(normalizedInput);
    const profile: AgentProfile = { ...existing, ...normalizedInput, id, tenantId: existing.tenantId, phoneNumber: existing.phoneNumber ?? this.allocatePhoneNumber(), createdAt: existing.createdAt, updatedAt: now() };
    this.profiles.set(id, profile);
    this.appendVersion(profile, accountActor(accountId), "Agent updated");
    return profile;
  }

  restoreVersion(profileId: string, versionId: string, accountId: string) {
    const existing = this.get(profileId, accountId);
    const version = this.listVersions(profileId, existing.tenantId).find((item) => item.id === versionId);
    if (!version) throw new Error(`Profile version not found: ${versionId}`);
    const restored: AgentProfile = { ...version.profile, id: existing.id, tenantId: existing.tenantId, createdAt: existing.createdAt, updatedAt: now() };
    this.profiles.set(profileId, restored);
    this.appendVersion(restored, accountActor(accountId), `Restored version ${version.version}`);
    return restored;
  }

  findByWorkflow(workflow: WorkflowType, domain: Domain, accountId?: string) {
    const scoped = accountId ?? authService.getDefaultAccountId();
    const matches = this.list(scoped).filter((profile) => profile.workflow === workflow && profile.domain === domain);
    return matches.find((profile) => this.isDeployed(profile)) ?? matches[0] ?? null;
  }

  private appendVersion(profile: AgentProfile, actor: { id: string; name: string; role: AdminRole }, changeSummary: string) {
    const versions = this.versions.get(profile.id) ?? [];
    const snapshot = this.createVersionSnapshot(profile, actor, changeSummary, versions.length + 1);
    this.versions.set(profile.id, [snapshot, ...versions]);
    this.persistProfile(profile);
    this.persistVersion(snapshot);
  }

  /** Load persisted agents + versions from Mongo (when configured) and ensure the demo seeds exist. Called once at startup. */
  async hydrate() {
    const profilesCollection = await getCollection(PROFILES_COLLECTION);
    if (profilesCollection) {
      for (const doc of await profilesCollection.find({}).toArray()) {
        const profile = stripId<AgentProfile>(doc as Record<string, unknown>);
        if (profile) this.profiles.set(profile.id, profile);
      }
    }
    const versionsCollection = await getCollection(VERSIONS_COLLECTION);
    if (versionsCollection) {
      const grouped = new Map<string, AgentProfileVersion[]>();
      for (const doc of await versionsCollection.find({}).toArray()) {
        const version = stripId<AgentProfileVersion>(doc as Record<string, unknown>);
        if (version) {
          const list = grouped.get(version.profileId) ?? [];
          list.push(version);
          grouped.set(version.profileId, list);
        }
      }
      for (const [profileId, list] of grouped) this.versions.set(profileId, list.sort((a, b) => b.version - a.version));
    }
    // Advance the phone counter past any persisted numbers so we never reissue one.
    for (const profile of this.profiles.values()) {
      if (profile.phoneNumber) {
        const seq = Number(normalizePhone(profile.phoneNumber).replace(/^\+9190/, ""));
        if (Number.isFinite(seq) && seq >= this.phoneSeq) this.phoneSeq = seq + 1;
      }
    }
    if (profilesCollection) {
      for (const profile of this.profiles.values()) {
        if (!profile.phoneNumber) profile.phoneNumber = this.allocatePhoneNumber();
        this.persistProfile(profile);
        for (const version of this.versions.get(profile.id) ?? []) this.persistVersion(version);
      }
    } else {
      for (const profile of this.profiles.values()) {
        if (!profile.phoneNumber) profile.phoneNumber = this.allocatePhoneNumber();
      }
    }
  }

  private persistProfile(profile: AgentProfile) {
    void (async () => {
      try {
        const collection = await getCollection(PROFILES_COLLECTION);
        if (collection) await collection.replaceOne({ _id: profile.id }, { ...profile }, { upsert: true });
      } catch {
        // best-effort durable mirror; the in-memory Map remains authoritative in-process
      }
    })();
  }

  private persistVersion(version: AgentProfileVersion) {
    void (async () => {
      try {
        const collection = await getCollection(VERSIONS_COLLECTION);
        if (collection) await collection.replaceOne({ _id: version.id }, { ...version }, { upsert: true });
      } catch {
        // best-effort
      }
    })();
  }

  private createVersionSnapshot(profile: AgentProfile, actor: { id: string; name: string; role: AdminRole }, changeSummary: string, version = 1): AgentProfileVersion {
    return {
      id: `${profile.id}-v${version}`,
      profileId: profile.id,
      version,
      changedAt: now(),
      changedBy: { id: actor.id, name: actor.name, role: actor.role },
      changeSummary,
      profile: JSON.parse(JSON.stringify(profile)) as AgentProfile
    };
  }

  private assertValid(input: Omit<AgentProfile, "id" | "createdAt" | "updatedAt">) {
    const issues: string[] = [];
    const slotKeys = input.slots.map((slot) => slot.key.trim());
    const duplicateKeys = slotKeys.filter((key, index) => slotKeys.indexOf(key) !== index);
    if (duplicateKeys.length > 0) issues.push(`Slot keys must be unique. Duplicate keys: ${[...new Set(duplicateKeys)].join(", ")}.`);
    const invalidKeys = slotKeys.filter((key) => !/^[a-z][a-z0-9_]*$/.test(key));
    if (invalidKeys.length > 0) issues.push(`Slot keys must use snake_case and start with a letter. Invalid keys: ${invalidKeys.join(", ")}.`);
    const requiredSlots = input.slots.filter((slot) => slot.required).map((slot) => slot.key);
    if (requiredSlots.length === 0) issues.push("At least one required field is needed so the agent knows what to collect.");

    const template = agentProfileTemplates.find((item) => item.domain === input.domain && item.workflow === input.workflow);
    if (template) {
      const missingTemplateSlots = template.slots.filter((slot) => slot.required).map((slot) => slot.key).filter((key) => !requiredSlots.includes(key));
      if (missingTemplateSlots.length > 0) issues.push(`This ${input.domain} template expects these required fields: ${missingTemplateSlots.join(", ")}.`);
      const hasFieldPlaceholder = requiredSlots.some((key) => input.completionMessageTemplate.includes(`{{${key}}}`));
      if (requiredSlots.length > 0 && !hasFieldPlaceholder) {
        issues.push(`Completion message should reference at least one collected field, e.g. ${requiredSlots.slice(0, 2).map((key) => `{{${key}}}`).join(", ")}.`);
      }
    }

    if (issues.length > 0) throw new AgentProfileValidationError(issues);
  }
}

export const agentProfileService = new AgentProfileService();
