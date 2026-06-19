import type { AgentProfile, Domain, SlotDefinition, Tenant, WorkflowType } from "../../../../packages/contracts/src/index.ts";

const now = () => new Date().toISOString();

type AgentProfileSlotInput = Omit<SlotDefinition, "examples"> & { examples?: string[] | undefined };
type AgentProfileInput = Omit<AgentProfile, "id" | "createdAt" | "updatedAt" | "slots"> & { id?: string; slots: AgentProfileSlotInput[] };
type AgentProfileUpdateInput = Omit<AgentProfile, "id" | "createdAt" | "updatedAt" | "slots"> & { slots: AgentProfileSlotInput[] };

export type AdminRole = "viewer" | "editor" | "admin";

export interface AdminUser {
  id: string;
  name: string;
  role: AdminRole;
  scope: "all" | Domain;
  tenantId: string | "all";
}

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

export class AgentProfileAccessError extends Error {
  readonly role: AdminRole;

  constructor(role: AdminRole, reason?: string) {
    super(reason ?? `This action requires editor or admin access. Current role: ${role}.`);
    this.name = "AgentProfileAccessError";
    this.role = role;
  }
}

function normalizeProfileSlots(slots: AgentProfileSlotInput[]): SlotDefinition[] {
  return slots.map((slot) => slot.examples && slot.examples.length > 0
    ? { key: slot.key, label: slot.label, prompt: slot.prompt, required: slot.required, examples: slot.examples }
    : { key: slot.key, label: slot.label, prompt: slot.prompt, required: slot.required });
}

const seedTenants: Tenant[] = [
  {
    id: "city-hospital",
    name: "City Hospital",
    description: "Hospital operations workspace for appointments and patient intake.",
    domainFocus: "healthcare"
  },
  {
    id: "greenfield-college",
    name: "Greenfield College",
    description: "Admissions and enquiry workspace for education institution workflows.",
    domainFocus: "education"
  },
  {
    id: "northstar-frontdesk",
    name: "Northstar Business Center",
    description: "Front desk workspace for visitor routing and reception operations.",
    domainFocus: "frontdesk"
  }
];

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

const seedAdminUsers: AdminUser[] = [
  { id: "platform-admin", name: "Priya Menon", role: "admin", scope: "all", tenantId: "all" },
  { id: "ops-editor", name: "Rahul S", role: "editor", scope: "all", tenantId: "all" },
  { id: "city-hospital-editor", name: "Asha Clinic Ops", role: "editor", scope: "healthcare", tenantId: "city-hospital" },
  { id: "greenfield-viewer", name: "Nisha Admissions", role: "viewer", scope: "education", tenantId: "greenfield-college" },
  { id: "northstar-editor", name: "Ravi Front Desk", role: "editor", scope: "frontdesk", tenantId: "northstar-frontdesk" }
];

function cloneSlots(slots: SlotDefinition[]) {
  return slots.map((slot) => slot.examples ? { ...slot, examples: [...slot.examples] } : { ...slot });
}

function buildProfileFromTemplate(template: AgentProfileTemplate, tenantId: string, customName?: string, status: AgentProfile["status"] = "deployed"): AgentProfile {
  const timestamp = now();
  const tenantSlug = tenantId.replace(/[^a-z0-9]+/g, "-");
  return {
    id: `${tenantSlug}-${template.workflow}`,
    tenantId,
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

export interface RegisterTenantInput {
  name: string;
  description: string;
  domainFocus: Domain;
  adminContactName?: string | undefined;
  adminContactEmail?: string | undefined;
  useCaseTemplateId?: string | undefined;
}

class AgentProfileService {
  private readonly profiles = new Map<string, AgentProfile>();
  private readonly versions = new Map<string, AgentProfileVersion[]>();
  private readonly tenants: Tenant[] = [...seedTenants];
  private readonly adminUsers: AdminUser[] = [...seedAdminUsers];
  private readonly defaultTenantId = seedTenants[0]!.id;

  constructor() {
    const seededProfiles = [
      buildProfileFromTemplate(agentProfileTemplates[0]!, "city-hospital", "City Hospital Appointment Desk"),
      buildProfileFromTemplate(agentProfileTemplates[2]!, "greenfield-college", "Greenfield Admissions Reception"),
      buildProfileFromTemplate(agentProfileTemplates[1]!, "northstar-frontdesk", "Northstar Reception Desk")
    ];

    for (const profile of seededProfiles) {
      this.profiles.set(profile.id, profile);
      this.versions.set(profile.id, [this.createVersionSnapshot(profile, this.adminUsers[0]!, "Initial tenant profile seed")]);
    }
  }

  getDefaultTenantId() {
    return this.defaultTenantId;
  }

  listTenants() {
    return this.tenants;
  }

  getTenant(id?: string) {
    const tenantId = id ?? this.defaultTenantId;
    const tenant = this.tenants.find((item) => item.id === tenantId);
    if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);
    return tenant;
  }

  registerTenant(input: RegisterTenantInput) {
    const name = input.name.trim();
    if (name.length < 2) throw new AgentProfileValidationError(["Workspace name must be at least 2 characters."]);
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
    let slug = baseSlug;
    let suffix = 2;
    while (this.tenants.some((tenant) => tenant.id === slug)) slug = `${baseSlug}-${suffix++}`;

    const timestamp = now();
    const tenant: Tenant = {
      id: slug,
      name,
      description: input.description.trim() || `${name} workspace`,
      domainFocus: input.domainFocus,
      ...(input.adminContactName ? { adminContactName: input.adminContactName } : {}),
      ...(input.adminContactEmail ? { adminContactEmail: input.adminContactEmail } : {}),
      createdAt: timestamp
    };
    this.tenants.push(tenant);

    const adminUser: AdminUser = {
      id: `${slug}-admin`,
      name: input.adminContactName?.trim() || `${name} Admin`,
      role: "admin",
      scope: input.domainFocus,
      tenantId: slug
    };
    this.adminUsers.push(adminUser);

    const template = (input.useCaseTemplateId
      ? agentProfileTemplates.find((item) => item.id === input.useCaseTemplateId)
      : agentProfileTemplates.find((item) => item.domain === input.domainFocus))
      ?? agentProfileTemplates.find((item) => item.domain === input.domainFocus)
      ?? agentProfileTemplates[0]!;

    const profile = buildProfileFromTemplate(template, slug, `${name} Agent`, "draft");
    this.profiles.set(profile.id, profile);
    this.versions.set(profile.id, [this.createVersionSnapshot(profile, adminUser, "Workspace provisioned")]);

    return { tenant, adminUser, profile };
  }

  setDeployment(profileId: string, deployed: boolean, actorId: string, tenantId?: string) {
    const existing = this.get(profileId, tenantId);
    const actor = this.assertCanEdit(actorId, existing.domain, existing.tenantId);
    const timestamp = now();
    const profile: AgentProfile = {
      ...existing,
      status: deployed ? "deployed" : "draft",
      ...(deployed ? { deployedAt: timestamp } : {}),
      updatedAt: timestamp
    };
    this.profiles.set(profileId, profile);
    this.appendVersion(profile, actor, deployed ? "Profile deployed" : "Profile undeployed");
    return profile;
  }

  isDeployed(profile: AgentProfile) {
    return profile.status !== "draft";
  }

  list(tenantId?: string) {
    const scopedTenantId = tenantId ?? this.defaultTenantId;
    this.getTenant(scopedTenantId);
    return [...this.profiles.values()].filter((profile) => profile.tenantId === scopedTenantId);
  }

  listTemplates() {
    return agentProfileTemplates;
  }

  listUsers(tenantId?: string) {
    const scopedTenantId = tenantId ?? this.defaultTenantId;
    this.getTenant(scopedTenantId);
    return this.adminUsers.filter((user) => user.tenantId === "all" || user.tenantId === scopedTenantId);
  }

  getUser(id: string, tenantId?: string) {
    const user = this.adminUsers.find((item) => item.id === id);
    if (!user) throw new Error(`Admin user not found: ${id}`);
    if (tenantId && user.tenantId !== "all" && user.tenantId !== tenantId) {
      throw new AgentProfileAccessError(user.role, `This user cannot manage tenant ${tenantId}.`);
    }
    return user;
  }

  getTemplate(id: string) {
    const template = agentProfileTemplates.find((item) => item.id === id);
    if (!template) throw new Error(`Agent profile template not found: ${id}`);
    return template;
  }

  createFromTemplate(id: string, tenantId?: string) {
    const template = this.getTemplate(id);
    const tenant = this.getTenant(tenantId);
    return {
      id: "",
      tenantId: tenant.id,
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

  get(id: string, tenantId?: string) {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error(`Agent profile not found: ${id}`);
    if (tenantId && profile.tenantId !== tenantId) throw new Error(`Agent profile not found: ${id}`);
    return profile;
  }

  listVersions(profileId: string, tenantId?: string) {
    this.get(profileId, tenantId);
    return [...(this.versions.get(profileId) ?? [])].sort((left, right) => right.version - left.version);
  }

  create(input: AgentProfileInput, actorId: string, tenantId?: string) {
    const scopedTenantId = input.tenantId || tenantId || this.defaultTenantId;
    const actor = this.assertCanEdit(actorId, input.domain, scopedTenantId);
    const normalizedInput = { ...input, tenantId: scopedTenantId, slots: normalizeProfileSlots(input.slots) };
    this.assertValid(normalizedInput);
    const timestamp = now();
    const id = input.id && input.id.trim().length > 0
      ? input.id
      : `${scopedTenantId.replace(/[^a-z0-9]+/g, "-")}-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const profile: AgentProfile = { ...normalizedInput, id, createdAt: timestamp, updatedAt: timestamp };
    this.profiles.set(profile.id, profile);
    this.appendVersion(profile, actor, "Profile created");
    return profile;
  }

  update(id: string, input: AgentProfileUpdateInput, actorId: string, tenantId?: string) {
    const existing = this.get(id, tenantId);
    const actor = this.assertCanEdit(actorId, existing.domain, existing.tenantId);
    const normalizedInput = { ...input, tenantId: existing.tenantId, slots: normalizeProfileSlots(input.slots) };
    this.assertValid(normalizedInput);
    const profile: AgentProfile = { ...existing, ...normalizedInput, id, tenantId: existing.tenantId, createdAt: existing.createdAt, updatedAt: now() };
    this.profiles.set(id, profile);
    this.appendVersion(profile, actor, "Profile updated");
    return profile;
  }

  restoreVersion(profileId: string, versionId: string, actorId: string, tenantId?: string) {
    const existing = this.get(profileId, tenantId);
    const actor = this.assertCanEdit(actorId, existing.domain, existing.tenantId);
    const version = this.listVersions(profileId, existing.tenantId).find((item) => item.id === versionId);
    if (!version) throw new Error(`Profile version not found: ${versionId}`);
    const restored: AgentProfile = { ...version.profile, id: existing.id, tenantId: existing.tenantId, createdAt: existing.createdAt, updatedAt: now() };
    this.profiles.set(profileId, restored);
    this.appendVersion(restored, actor, `Restored version ${version.version}`);
    return restored;
  }

  findByWorkflow(workflow: WorkflowType, domain: Domain, tenantId?: string) {
    const scopedTenantId = tenantId ?? this.defaultTenantId;
    const matches = this.list(scopedTenantId).filter((profile) => profile.workflow === workflow && profile.domain === domain);
    return matches.find((profile) => this.isDeployed(profile)) ?? matches[0] ?? null;
  }

  private assertCanEdit(actorId: string, profileDomain: Domain, tenantId: string) {
    const actor = this.getUser(actorId, tenantId);
    if (actor.role === "viewer") throw new AgentProfileAccessError(actor.role);
    if (actor.scope !== "all" && actor.scope !== profileDomain) throw new AgentProfileAccessError(actor.role, `This user cannot edit the ${profileDomain} domain.`);
    if (actor.tenantId !== "all" && actor.tenantId !== tenantId) throw new AgentProfileAccessError(actor.role, `This user cannot edit tenant ${tenantId}.`);
    return actor;
  }

  private appendVersion(profile: AgentProfile, actor: AdminUser, changeSummary: string) {
    const versions = this.versions.get(profile.id) ?? [];
    const snapshot = this.createVersionSnapshot(profile, actor, changeSummary, versions.length + 1);
    this.versions.set(profile.id, [snapshot, ...versions]);
  }

  private createVersionSnapshot(profile: AgentProfile, actor: AdminUser, changeSummary: string, version = 1): AgentProfileVersion {
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
    this.getTenant(input.tenantId);
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
