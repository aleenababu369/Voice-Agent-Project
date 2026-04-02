export interface TenantDto {
  id: string;
  name: string;
  description: string;
  domainFocus: "education" | "healthcare" | "frontdesk";
}

export type FollowUpStatusDto = "new" | "in_progress" | "contacted" | "resolved" | "closed";

export interface SessionFollowUpDto {
  status: FollowUpStatusDto;
  assignee?: string;
  notes?: string;
  updatedAt: string;
}

export interface AgentProfileSlot {
  key: string;
  label: string;
  prompt: string;
  required: boolean;
  examples?: string[];
}

export interface AgentProfileDto {
  id: string;
  tenantId: string;
  name: string;
  domain: "education" | "healthcare" | "frontdesk";
  workflow: string;
  description: string;
  languages: string[];
  welcomeMessage: string;
  systemPrompt: string;
  completionMessageTemplate: string;
  escalationMessage: string;
  slots: AgentProfileSlot[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentProfileTemplateDto {
  id: string;
  name: string;
  domain: "education" | "healthcare" | "frontdesk";
  workflow: string;
  description: string;
  languages: string[];
  welcomeMessage: string;
  systemPrompt: string;
  completionMessageTemplate: string;
  escalationMessage: string;
  slots: AgentProfileSlot[];
  validationRules: string[];
  sampleUtterance: string;
}

export interface AdminUserDto {
  id: string;
  name: string;
  role: "viewer" | "editor" | "admin";
  scope: "all" | "education" | "healthcare" | "frontdesk";
  tenantId: string | "all";
}

export interface AgentProfileVersionDto {
  id: string;
  profileId: string;
  version: number;
  changedAt: string;
  changedBy: {
    id: string;
    name: string;
    role: "viewer" | "editor" | "admin";
  };
  changeSummary: string;
  profile: AgentProfileDto;
}

export interface SessionRecordDto {
  id: string;
  tenantId: string;
  agentProfileId?: string;
  domain: string;
  workflow: string;
  status: string;
  language: string;
  participant: { phoneNumber: string; displayName?: string };
  slotState: { collected: Record<string, string>; missing: string[]; required: string[] };
  followUp: SessionFollowUpDto;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTotalsDto {
  totalSessions: number;
  completedSessions: number;
  escalatedSessions: number;
  activeSessions: number;
  totalCollectedFields: number;
  openFollowUps: number;
  resolvedFollowUps: number;
  completionRate: number;
  escalationRate: number;
}

export interface DomainAnalyticsDto {
  domain: "education" | "healthcare" | "frontdesk";
  totalSessions: number;
  completionRate: number;
  escalationRate: number;
  collectedFields: number;
}

export interface FollowUpStatusAnalyticsDto {
  status: FollowUpStatusDto;
  totalSessions: number;
}

export interface ProfileAnalyticsDto {
  profileId: string;
  profileName: string;
  domain: "education" | "healthcare" | "frontdesk";
  workflow: string;
  totalSessions: number;
  completedSessions: number;
  escalatedSessions: number;
  completionRate: number;
  escalationRate: number;
  averageTurnCount: number;
  collectedFields: number;
}

export interface PlatformAnalyticsDto {
  tenant: TenantDto;
  totals: PlatformTotalsDto;
  domains: DomainAnalyticsDto[];
  followUpStatuses: FollowUpStatusAnalyticsDto[];
  profiles: ProfileAnalyticsDto[];
}
