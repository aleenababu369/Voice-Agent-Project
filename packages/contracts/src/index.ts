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

export interface Tenant {
  id: string;
  name: string;
  description: string;
  domainFocus: Domain;
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
  participant: CallParticipant;
  consentCaptured: boolean;
  slotState: CallSlotState;
  followUp: SessionFollowUp;
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
    | "follow_up_updated";
  payload: Record<string, unknown>;
  createdAt: string;
}
