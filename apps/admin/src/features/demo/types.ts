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
  guide: DemoScenarioGuide;
}

export interface DemoScenarioGuide {
  persona: string;
  objective: string;
  sampleTurns: string[];
  expectedFields: Array<{ key: string; label: string; prompt: string }>;
  steps: Array<{ title: string; instruction: string; presenterTip: string }>;
  talkingPoints: string[];
  evaluatorChecklist: string[];
}

export interface DemoConfig {
  appName: string;
  mode: string;
  zeroCost: boolean;
  tenant: DemoTenant;
  supportedLanguages: Array<"en-IN" | "hi-IN" | "kn-IN" | "ta-IN" | "ml-IN">;
  scenarios: DemoScenario[];
  presentation?: {
    title: string;
    setupSteps: string[];
    zeroCostProof: string[];
  };
  notes: string[];
  aiAdapters?: {
    asr: string;
    llm: string;
    tts: string;
  };
}

export type CallDirection = "inbound" | "outbound";

export interface TargetContact {
  name: string;
  phoneNumber: string;
}

export interface DemoSession {
  id: string;
  tenantId: string;
  workflow: DemoScenario["workflow"];
  status: string;
  consentCaptured: boolean;
  direction?: CallDirection;
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

export interface DemoSeedResult {
  zeroCost: boolean;
  mode: string;
  seededCount: number;
  tenants: Array<{ id: string; name: string; domainFocus: "education" | "healthcare" | "frontdesk" }>;
  sessions: Array<{
    session: DemoSession;
    profile: { id: string; name: string; domain: DemoScenario["domain"]; workflow: DemoScenario["workflow"] };
    sampleUtterance: string;
    collected: Record<string, string>;
    createdAt: string;
  }>;
}
