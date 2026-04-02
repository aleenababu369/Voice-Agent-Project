import type { CallSession, OrchestratorDecision } from "../../../../packages/contracts/src/index.ts";

export interface TurnApplicationResult {
  decision: OrchestratorDecision;
  slotState: CallSession["slotState"];
}

export interface PersistenceMetricsSummary {
  total_turns: number;
  average_latency_ms: number;
  average_asr_confidence: number;
  average_nlu_confidence: number;
  escalation_rate: number;
  completion_rate: number;
}

export interface PersistencePort {
  createSession(input: Omit<CallSession, "status" | "consentCaptured" | "turnCount" | "createdAt" | "updatedAt">): Promise<CallSession>;
  getSession(id: string): Promise<CallSession | undefined>;
  listSessions(): Promise<CallSession[]>;
  captureConsent(id: string, granted: boolean): Promise<CallSession | undefined>;
  applyTurn(id: string, transcript: string, result: TurnApplicationResult): Promise<CallSession | undefined>;
  recordMetric(metric: { sessionId: string; turnSwitchLatencyMs: number; asrConfidence: number; nluConfidence: number; workflowCompleted: boolean; escalated: boolean }): Promise<void>;
  getMetricsSummary(): Promise<PersistenceMetricsSummary>;
  listEvents(sessionId: string): Promise<Array<{ sessionId: string; type: string; payload: Record<string, unknown>; createdAt: string }>>;
}
