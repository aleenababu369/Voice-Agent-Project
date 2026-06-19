export type DomainDto = "education" | "healthcare" | "frontdesk";
export type CallDirectionDto = "inbound" | "outbound";
export type AgentDeploymentStatusDto = "draft" | "deployed";

export interface AccountDto {
  id: string;
  name: string;
  email: string;
  useCase: DomainDto | null;
  isDemo?: boolean;
  createdAt: string;
}

export type ProspectStatusDto = "new" | "queued" | "in_progress" | "contacted" | "completed" | "failed";

export interface ProspectDto {
  id: string;
  accountId: string;
  name: string;
  phoneNumber: string;
  email?: string;
  fields: Record<string, string>;
  status: ProspectStatusDto;
  campaignId?: string;
  lastSessionId?: string;
  lastOutcome?: string;
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatusDto = "draft" | "active" | "paused" | "completed";

export interface CampaignDto {
  id: string;
  accountId: string;
  name: string;
  direction: CallDirectionDto;
  status: CampaignStatusDto;
  agentProfileId: string;
  prospectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CallTranscriptEntry {
  role: "agent" | "caller";
  text: string;
  at: string;
}

export interface CallDetailDto {
  sessionId: string;
  tenantId: string;
  agentProfileId?: string;
  prospectId?: string;
  campaignId?: string;
  direction: CallDirectionDto;
  status: string;
  durationMs: number;
  turnCount: number;
  averageLatencyMs: number;
  averageAsrConfidence: number;
  averageNluConfidence: number;
  participant: { phoneNumber: string; displayName?: string };
  language: string;
  collected: Record<string, string>;
  missing: string[];
  outcome: SessionOutcomeDto;
  followUp: SessionFollowUpDto;
  operations: OperationDto[];
  transcript: CallTranscriptEntry[];
  createdAt: string;
  updatedAt: string;
}

export type Screen =
  | "home"
  | "onboard"
  | "build"
  | "assign"
  | "call"
  | "records"
  | "operations"
  | "analytics"
  | "settings";

export interface TenantDto {
  id: string;
  name: string;
  description: string;
  domainFocus: DomainDto;
  adminContactName?: string;
  adminContactEmail?: string;
  createdAt?: string;
}

export interface ContactDto {
  id: string;
  tenantId: string;
  name: string;
  phoneNumber: string;
  notes?: string;
  createdAt: string;
}

export type OperationTypeDto = "appointment" | "enquiry" | "visitor_routing" | "reminder_ack" | "follow_up" | "generic";
export type OperationStatusDto = "created" | "scheduled" | "in_progress" | "completed" | "cancelled";

export interface OperationDto {
  id: string;
  tenantId: string;
  sessionId: string;
  agentProfileId?: string;
  type: OperationTypeDto;
  status: OperationStatusDto;
  payload: Record<string, string>;
  referenceId: string;
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
}

export type FollowUpStatusDto = "new" | "in_progress" | "contacted" | "resolved" | "closed";
export type SessionOutcomeTypeDto = "none" | "callback_scheduled" | "appointment_confirmed" | "enquiry_forwarded" | "visitor_routed" | "closed_no_action";

export interface SessionFollowUpDto {
  status: FollowUpStatusDto;
  assignee?: string;
  notes?: string;
  updatedAt: string;
}

export interface SessionOutcomeDto {
  type: SessionOutcomeTypeDto;
  scheduledFor?: string;
  referenceId?: string;
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
  status?: AgentDeploymentStatusDto;
  deployedAt?: string;
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
  direction: CallDirectionDto;
  contactId?: string;
  participant: { phoneNumber: string; displayName?: string };
  slotState: { collected: Record<string, string>; missing: string[]; required: string[] };
  followUp: SessionFollowUpDto;
  outcome: SessionOutcomeDto;
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
  scheduledOutcomes: number;
  completedOutcomes: number;
  completionRate: number;
  escalationRate: number;
  totalOperations: number;
  inboundSessions: number;
  outboundSessions: number;
  totalCampaigns: number;
  totalProspects: number;
}

export interface CampaignAnalyticsDto {
  id: string;
  name: string;
  direction: CallDirectionDto;
  status: CampaignStatusDto;
  prospectCount: number;
  totalCalls: number;
  completedCalls: number;
  completionRate: number;
}

export interface ProspectFunnelDto {
  status: ProspectStatusDto;
  total: number;
}

export interface OperationTypeAnalyticsDto {
  type: OperationTypeDto;
  total: number;
}

export interface OperationStatusAnalyticsDto {
  status: OperationStatusDto;
  total: number;
}

export interface ChannelMixDto {
  inbound: number;
  outbound: number;
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

export interface OutcomeTypeAnalyticsDto {
  type: SessionOutcomeTypeDto;
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
  outcomeTypes: OutcomeTypeAnalyticsDto[];
  operationTypes: OperationTypeAnalyticsDto[];
  operationStatuses: OperationStatusAnalyticsDto[];
  channelMix: ChannelMixDto;
  campaigns: CampaignAnalyticsDto[];
  prospectFunnel: ProspectFunnelDto[];
  profiles: ProfileAnalyticsDto[];
}

export interface DailyReportRecordDto {
  sessionId: string;
  profileName: string;
  domain: string;
  workflow: string;
  status: string;
  caller: string;
  phoneNumber: string;
  followUpStatus: FollowUpStatusDto;
  assignee: string | null;
  followUpNotes: string | null;
  outcomeType: SessionOutcomeTypeDto;
  scheduledFor: string | null;
  referenceId: string | null;
  outcomeNotes: string | null;
  collected: Record<string, string>;
  missing: string[];
  createdAt: string;
}

export interface TenantDailyReportDto {
  tenant: TenantDto;
  date: string;
  generatedAt: string;
  totals: {
    totalSessions: number;
    completedSessions: number;
    escalatedSessions: number;
    openFollowUps: number;
    scheduledOutcomes: number;
    completedOutcomes: number;
    totalCollectedFields: number;
  };
  followUpGroups: FollowUpStatusAnalyticsDto[];
  outcomeGroups: OutcomeTypeAnalyticsDto[];
  channelMix: ChannelMixDto;
  operations: OperationDto[];
  records: DailyReportRecordDto[];
  markdown: string;
}
