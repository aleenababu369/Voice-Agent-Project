import type { AgentProfile, CallSession, Operation, OrchestratorDecision, WorkflowDefinition } from "../../../../packages/contracts/src/index.ts";
import { agentProfileService } from "./agent-profile.service.ts";
import { callOrchestrator } from "./call-orchestrator.ts";
import { ensureLlmReady } from "./ai/llm-runtime.ts";
import { operationLabel, operationTypeForWorkflow, outcomeTypeForOperation } from "./operations.helper.ts";
import { persistenceService } from "./persistence.service.ts";

function workflowFromProfile(profile: AgentProfile): WorkflowDefinition {
  return {
    type: profile.workflow,
    domain: profile.domain,
    title: profile.name,
    requiredSlots: profile.slots.filter((slot) => slot.required).map((slot) => slot.key),
    completionDescription: profile.description
  };
}

export interface TurnInput {
  session: CallSession;
  profile: AgentProfile;
  transcript: string;
  asrConfidence?: number;
  nluConfidence?: number;
  turnSwitchLatencyMs?: number;
}

export interface TurnOutput {
  decision: OrchestratorDecision;
  session: CallSession;
  profile: AgentProfile;
  operation: Operation | null;
  allSlotsCollected: boolean;
  missingSlots: string[];
}

/** Process a single conversation turn end to end. Shared by the REST turn route, the campaign dialer, and the softphone relay. */
export async function processCallTurn(input: TurnInput): Promise<TurnOutput> {
  const { session, profile } = input;
  const asrConfidence = input.asrConfidence ?? 0.9;
  const nluConfidence = input.nluConfidence ?? 0.88;
  // Rebuild a bounded dialogue window from durable turn events. The LLM previously saw only the latest
  // utterance and collected slots, which made it repeat questions and lose conversational references.
  const events = await persistenceService.listEvents(session.id);
  const history = events
    .filter((event) => event.type === "turn_processed" || event.type === "workflow_completed")
    .flatMap((event) => {
      const turns: Array<{ role: "agent" | "caller"; text: string }> = [];
      if (typeof event.payload.transcript === "string" && event.payload.transcript.trim()) turns.push({ role: "caller", text: event.payload.transcript.trim() });
      if (typeof event.payload.responseText === "string" && event.payload.responseText.trim()) turns.push({ role: "agent", text: event.payload.responseText.trim() });
      return turns;
    })
    .slice(-12);

  const result = await callOrchestrator.processTurn({
    session,
    transcript: input.transcript,
    asrConfidence,
    nluConfidence,
    workflow: workflowFromProfile(profile),
    profile,
    history
  });

  const updatedSession = await persistenceService.applyTurn(session.id, input.transcript, result);
  await persistenceService.recordMetric({
    sessionId: session.id,
    turnSwitchLatencyMs: input.turnSwitchLatencyMs ?? 500,
    asrConfidence,
    nluConfidence,
    workflowCompleted: result.decision.action === "complete_call",
    escalated: result.decision.action === "escalate_to_human",
    ...(result.decision.slotConfidence ? { slotConfidence: result.decision.slotConfidence } : {}),
    confirmationTurn: result.decision.action === "confirm_slot",
    repromptTurn: result.decision.action === "ask_clarification"
  });

  let operation: Operation | null = null;
  let responseSession = updatedSession ?? session;

  if (result.decision.action === "complete_call" && updatedSession) {
    const operationType = operationTypeForWorkflow(updatedSession.workflow);
    const collected = updatedSession.slotState.collected;
    const scheduledFor = [collected.preferred_date, collected.preferred_time].filter(Boolean).join(" ") || undefined;
    operation = await persistenceService.createOperation({
      tenantId: updatedSession.tenantId,
      sessionId: updatedSession.id,
      ...(updatedSession.agentProfileId ? { agentProfileId: updatedSession.agentProfileId } : {}),
      ...(updatedSession.prospectId ? { prospectId: updatedSession.prospectId } : {}),
      ...(updatedSession.campaignId ? { campaignId: updatedSession.campaignId } : {}),
      type: operationType,
      payload: collected,
      ...(scheduledFor ? { scheduledFor } : {})
    });
    responseSession = await persistenceService.updateOutcome(updatedSession.id, {
      type: outcomeTypeForOperation(operationType),
      referenceId: operation.referenceId,
      ...(scheduledFor ? { scheduledFor } : {}),
      notes: `Auto-created ${operationLabel(operationType)} from completed call.`
    }) ?? updatedSession;
    if (updatedSession.prospectId) {
      await persistenceService.updateProspect(updatedSession.prospectId, { status: "completed", lastSessionId: updatedSession.id, lastOutcome: operation.referenceId });
    }
  } else if (updatedSession?.prospectId && result.decision.action === "escalate_to_human") {
    await persistenceService.updateProspect(updatedSession.prospectId, { status: "failed", lastSessionId: updatedSession.id });
  }

  return {
    decision: result.decision,
    session: responseSession,
    profile,
    operation,
    allSlotsCollected: result.allSlotsCollected,
    missingSlots: result.missingSlots
  };
}

/** Create an outbound or inbound call session bound to a prospect/campaign, reusing agent resolution + deploy gating. */
export async function placeCall(input: {
  accountId: string;
  profileId?: string;
  prospect?: { id: string; phoneNumber: string; name: string };
  phoneNumber?: string;
  displayName?: string;
  direction: "inbound" | "outbound";
  campaignId?: string;
  language?: CallSession["language"];
}) {
  const profile = input.profileId
    ? agentProfileService.get(input.profileId, input.accountId)
    : null;
  if (!profile) throw new Error("No matching agent profile found");
  if (!agentProfileService.isDeployed(profile)) {
    const error = new Error("Agent is not deployed. Deploy the agent before taking calls.") as Error & { code?: string };
    error.code = "AGENT_NOT_DEPLOYED";
    throw error;
  }

  // Make sure the local LLM is up before the conversation starts (no-op in rule-engine mode).
  await ensureLlmReady().catch(() => undefined);

  const phoneNumber = input.prospect?.phoneNumber ?? input.phoneNumber ?? "+910000000000";
  const displayName = input.prospect?.name ?? input.displayName;
  const participant = displayName ? { phoneNumber, displayName } : { phoneNumber };
  const required = profile.slots.filter((slot) => slot.required).map((slot) => slot.key);

  const { randomUUID } = await import("node:crypto");
  const session = await persistenceService.createSession({
    id: randomUUID(),
    tenantId: profile.tenantId,
    agentProfileId: profile.id,
    domain: profile.domain,
    workflow: profile.workflow,
    language: input.language ?? "en-IN",
    direction: input.direction,
    ...(input.prospect ? { prospectId: input.prospect.id } : {}),
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    participant,
    slotState: { required, collected: {}, missing: [...required] }
  });

  if (input.prospect) {
    await persistenceService.updateProspect(input.prospect.id, { status: "in_progress", lastSessionId: session.id });
  }

  return { session, profile };
}
