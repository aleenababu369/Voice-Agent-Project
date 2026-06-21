export type Domain = "education" | "healthcare" | "frontdesk";

export type WorkflowType =
  | "appointment_booking"
  | "fee_reminder"
  | "general_enquiry"
  | "follow_up_confirmation"
  | "frontdesk_reception"
  | "institution_reception";

export type LanguageCode = "en-IN" | "hi-IN" | "kn-IN" | "ta-IN" | "ml-IN";
export type AiProviderKind = "mock" | "openai-compatible" | "faster-whisper" | "coqui";

export type CallDirection = "inbound" | "outbound";

export interface Tenant {
  id: string;
  name: string;
  description: string;
  domainFocus: Domain;
  adminContactName?: string;
  adminContactEmail?: string;
  createdAt?: string;
}

/** A user account. One login credential = one account = one isolated org. `useCase` is null until onboarding. */
export interface Account {
  id: string;
  name: string;
  email: string;
  useCase: Domain | null;
  isDemo?: boolean;
  createdAt: string;
}

export type SessionStatus =
  | "initiated"
  | "consent_pending"
  | "active"
  | "clarification_required"
  | "escalated"
  | "completed"
  | "failed";

export type FollowUpStatus = "new" | "in_progress" | "contacted" | "resolved" | "closed";
export type SessionOutcomeType = "none" | "callback_scheduled" | "appointment_confirmed" | "enquiry_forwarded" | "visitor_routed" | "closed_no_action";

export interface CallParticipant {
  phoneNumber: string;
  displayName?: string;
  preferredLanguage?: LanguageCode;
}

export interface SlotDefinition {
  key: string;
  label: string;
  prompt: string;
  required: boolean;
  examples?: string[];
}

export type AgentDeploymentStatus = "draft" | "deployed";

export interface AgentProfile {
  id: string;
  tenantId: string;
  name: string;
  domain: Domain;
  workflow: WorkflowType;
  description: string;
  languages: LanguageCode[];
  welcomeMessage: string;
  systemPrompt: string;
  completionMessageTemplate: string;
  escalationMessage: string;
  slots: SlotDefinition[];
  /** Optional for backward compatibility: `undefined` is treated as "deployed" for seeded profiles. */
  status?: AgentDeploymentStatus;
  deployedAt?: string;
  /** Unique inbound phone number customers dial to reach this agent. */
  phoneNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  tenantId: string;
  name: string;
  phoneNumber: string;
  notes?: string;
  createdAt: string;
}

export type ProspectStatus = "new" | "queued" | "in_progress" | "contacted" | "completed" | "failed";

export interface Prospect {
  id: string;
  accountId: string;
  name: string;
  phoneNumber: string;
  email?: string;
  fields: Record<string, string>;
  status: ProspectStatus;
  campaignId?: string;
  lastSessionId?: string;
  lastOutcome?: string;
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface Campaign {
  id: string;
  accountId: string;
  name: string;
  direction: CallDirection;
  status: CampaignStatus;
  agentProfileId: string;
  prospectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type OperationType =
  | "appointment"
  | "enquiry"
  | "visitor_routing"
  | "reminder_ack"
  | "follow_up"
  | "generic";

export type OperationStatus = "created" | "scheduled" | "in_progress" | "completed" | "cancelled";

export interface Operation {
  id: string;
  tenantId: string;
  sessionId: string;
  agentProfileId?: string;
  prospectId?: string;
  campaignId?: string;
  type: OperationType;
  status: OperationStatus;
  payload: Record<string, string>;
  referenceId: string;
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDefinition {
  type: WorkflowType;
  domain: Domain;
  title: string;
  requiredSlots: string[];
  completionDescription: string;
}

export interface CallSlotState {
  required: string[];
  collected: Record<string, string>;
  missing: string[];
}

export interface EscalationSummary {
  trigger: "low_confidence" | "safety_keyword" | "manual_request";
  reason: string;
  lastTranscript: string;
  recommendedAction: string;
}

export interface SessionFollowUp {
  status: FollowUpStatus;
  assignee?: string;
  notes?: string;
  updatedAt: string;
}

export interface SessionOutcome {
  type: SessionOutcomeType;
  scheduledFor?: string;
  referenceId?: string;
  notes?: string;
  updatedAt: string;
}

export interface AiTurnMetadata {
  asrProvider: AiProviderKind;
  llmProvider: AiProviderKind;
  ttsProvider: AiProviderKind;
  normalizedTranscript: string;
  promptStyle: "consent" | "clarification" | "workflow" | "completion" | "escalation";
  synthesizedVoice: string;
}

export interface CallSession {
  id: string;
  tenantId: string;
  domain: Domain;
  workflow: WorkflowType;
  agentProfileId?: string;
  language: LanguageCode;
  status: SessionStatus;
  direction: CallDirection;
  contactId?: string;
  prospectId?: string;
  campaignId?: string;
  participant: CallParticipant;
  consentCaptured: boolean;
  slotState: CallSlotState;
  followUp: SessionFollowUp;
  outcome: SessionOutcome;
  turnCount: number;
  lastTranscript?: string;
  escalationSummary?: EscalationSummary;
  createdAt: string;
  updatedAt: string;
}

export interface OrchestratorDecision {
  action:
    | "ask_consent"
    | "ask_clarification"
    | "respond"
    | "execute_task"
    | "escalate_to_human"
    | "complete_call";
  reason: string;
  confidence: number;
  responseText: string;
  extractedSlots?: Record<string, string>;
  missingSlots?: string[];
  escalationSummary?: EscalationSummary;
  aiMetadata?: AiTurnMetadata;
}

export interface CallMetric {
  sessionId: string;
  turnSwitchLatencyMs: number;
  asrConfidence: number;
  nluConfidence: number;
  workflowCompleted: boolean;
  escalated: boolean;
}

export interface CallEvent {
  sessionId: string;
  type:
    | "session_created"
    | "consent_updated"
    | "turn_processed"
    | "escalation_triggered"
    | "workflow_completed"
    | "follow_up_updated"
    | "outcome_updated"
    | "operation_created"
    | "operation_updated";
  payload: Record<string, unknown>;
  createdAt: string;
}
