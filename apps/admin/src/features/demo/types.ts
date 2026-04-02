export interface DemoTenant {
  id: string;
  name: string;
  description: string;
  domainFocus: "education" | "healthcare" | "frontdesk";
}

export interface DemoScenario {
  id: string;
  tenantId: string;
  title: string;
  domain: "education" | "healthcare" | "frontdesk";
  workflow: "appointment_booking" | "fee_reminder" | "general_enquiry" | "follow_up_confirmation" | "frontdesk_reception" | "institution_reception";
  language: "en-IN" | "hi-IN" | "kn-IN" | "ta-IN" | "ml-IN";
  starterPrompt: string;
  sampleUtterance: string;
}

export interface DemoConfig {
  appName: string;
  mode: string;
  zeroCost: boolean;
  tenant: DemoTenant;
  supportedLanguages: Array<"en-IN" | "hi-IN" | "kn-IN" | "ta-IN" | "ml-IN">;
  scenarios: DemoScenario[];
  notes: string[];
  aiAdapters?: {
    asr: string;
    llm: string;
    tts: string;
  };
}

export interface DemoSession {
  id: string;
  tenantId: string;
  workflow: DemoScenario["workflow"];
  status: string;
  consentCaptured: boolean;
}

export type CallPhase =
  | "idle"
  | "dialing"
  | "ringing"
  | "consent"
  | "listening"
  | "thinking"
  | "speaking"
  | "completed"
  | "escalated";

export type VoiceState = "ready" | "speaking" | "unsupported";

export interface TranscriptMessage {
  id: string;
  role: "system" | "agent" | "user";
  title: string;
  text: string;
  pending?: boolean;
}

export interface SessionEvent {
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DemoMetrics {
  totalTurns: number;
  averageLatencyMs: number;
  averageAsrConfidence: number;
  averageNluConfidence: number;
  escalationRate: number;
  completionRate: number;
}
