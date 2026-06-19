import type { AgentProfile, Domain, SlotDefinition, Tenant, WorkflowType } from "../../../../packages/contracts/src/index.ts";
import { authService } from "./auth.service.ts";

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
  }
];

function cloneSlots(slots: SlotDefinition[]) {
  return slots.map((slot) => slot.examples ? { ...slot, examples: [...slot.examples] } : { ...slot });
}

function templateForUseCase(useCase: Domain): AgentProfileTemplate {
  return agentProfileTemplates.find((item) => item.domain === useCase) ?? agentProfileTemplates[0]!;
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

class AgentProfileService {
  private readonly profiles = new Map<string, AgentProfile>();
  private readonly versions = new Map<string, AgentProfileVersion[]>();

  constructor() {
    const seeded = [
      buildProfileFromTemplate(agentProfileTemplates[0]!, "city-hospital", "City Hospital Appointment Desk"),
      buildProfileFromTemplate(agentProfileTemplates[2]!, "greenfield-college", "Greenfield Admissions Reception"),
      buildProfileFromTemplate(agentProfileTemplates[1]!, "northstar-frontdesk", "Northstar Reception Desk")
    ];
    for (const profile of seeded) {
      this.profiles.set(profile.id, profile);
      this.versions.set(profile.id, [this.createVersionSnapshot(profile, SYSTEM_ACTOR, "Initial demo seed")]);
    }
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

  /** Create the starter agent for a freshly onboarded account, from the use-case template. */
  provisionStarterAgent(accountId: string, useCase: Domain, accountName?: string) {
    const template = templateForUseCase(useCase);
    const profile = buildProfileFromTemplate(template, accountId, `${accountName ?? this.getAccount(accountId).name} Agent`, "draft");
    this.profiles.set(profile.id, profile);
    this.versions.set(profile.id, [this.createVersionSnapshot(profile, accountActor(accountId), "Starter agent provisioned")]);
    return profile;
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
    const profile: AgentProfile = { ...normalizedInput, id, createdAt: timestamp, updatedAt: timestamp };
    this.profiles.set(profile.id, profile);
    this.appendVersion(profile, accountActor(accountId), "Agent created");
    return profile;
  }

  update(id: string, input: AgentProfileUpdateInput, accountId: string) {
    const existing = this.get(id, accountId);
    const normalizedInput = { ...input, tenantId: existing.tenantId, slots: normalizeProfileSlots(input.slots) };
    this.assertValid(normalizedInput);
    const profile: AgentProfile = { ...existing, ...normalizedInput, id, tenantId: existing.tenantId, createdAt: existing.createdAt, updatedAt: now() };
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
      const requiredPlaceholders = template.slots.filter((slot) => slot.required).map((slot) => slot.key).slice(0, 2);
      const missingPlaceholders = requiredPlaceholders.filter((key) => !input.completionMessageTemplate.includes(`{{${key}}}`));
      if (missingPlaceholders.length > 0) issues.push(`Completion message should include these placeholders: ${missingPlaceholders.map((key) => `{{${key}}}`).join(", ")}.`);
    }

    if (issues.length > 0) throw new AgentProfileValidationError(issues);
  }
}

export const agentProfileService = new AgentProfileService();
