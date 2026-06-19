import type { AgentProfileDto, AgentProfileTemplateDto, DomainDto } from "./types";

export type DraftProfile = Omit<AgentProfileDto, "createdAt" | "updatedAt">;

export function workflowForDomain(domain: DomainDto): string {
  switch (domain) {
    case "healthcare": return "appointment_booking";
    case "frontdesk": return "frontdesk_reception";
    default: return "institution_reception";
  }
}

export function emptyProfile(tenantId: string, domain: DomainDto = "education"): DraftProfile {
  return {
    id: "",
    tenantId,
    name: "",
    domain,
    workflow: workflowForDomain(domain),
    description: "",
    languages: ["en-IN"],
    welcomeMessage: "",
    systemPrompt: "",
    completionMessageTemplate: "",
    escalationMessage: "",
    slots: [{ key: "caller_name", label: "Caller name", prompt: "May I know your name?", required: true, examples: [] }],
    status: "draft"
  };
}

export function templateToDraft(template: AgentProfileTemplateDto, tenantId: string, name?: string): DraftProfile {
  return {
    id: "",
    tenantId,
    name: name ?? template.name,
    domain: template.domain,
    workflow: template.workflow,
    description: template.description,
    languages: [...template.languages],
    welcomeMessage: template.welcomeMessage,
    systemPrompt: template.systemPrompt,
    completionMessageTemplate: template.completionMessageTemplate,
    escalationMessage: template.escalationMessage,
    slots: template.slots.map((slot) => (slot.examples ? { ...slot, examples: [...slot.examples] } : { ...slot })),
    status: "draft"
  };
}

export function profileToDraft(profile: AgentProfileDto): DraftProfile {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = profile;
  return draft;
}
