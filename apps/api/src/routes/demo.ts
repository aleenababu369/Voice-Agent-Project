import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AgentProfile, CallDirection, FollowUpStatus, SessionOutcomeType } from "../../../../packages/contracts/src/index.ts";
import { operationTypeForWorkflow } from "../services/operations.helper.ts";

function sampleUtteranceForProfile(profile: AgentProfile) {
  switch (profile.workflow) {
    case "appointment_booking":
      return "I am Asha age 42 issue fever and cough doctor Dr Rao tomorrow 10 am";
    case "frontdesk_reception":
      return "My name is Ravi purpose vendor meeting department sales callback 9876543210";
    case "institution_reception":
      return "My name is Nisha interested in M.Tech inquiry admissions contact 9876543210";
    case "fee_reminder":
      return "Student ID S123 yes received";
    case "follow_up_confirmation":
      return "Patient ID P456 yes confirmed";
    default:
      return "My name is Demo Caller topic admission enquiry contact 9876543210";
  }
}

function guideForProfile(profile: AgentProfile) {
  const requiredFields = profile.slots.filter((slot) => slot.required);
  const persona = profile.domain === "healthcare"
    ? "A patient calling a hospital reception desk to book a consultation."
    : profile.domain === "frontdesk"
      ? "A visitor or caller asking an office front desk to route a request."
      : "A prospective student asking an institution reception desk about admissions.";
  const objective = profile.domain === "healthcare"
    ? "Show that the agent collects appointment details without giving medical advice."
    : profile.domain === "frontdesk"
      ? "Show that the agent captures visitor intent and routes the caller to the right team."
      : "Show that the agent collects enquiry details for admissions follow-up.";

  return {
    persona,
    objective,
    sampleTurns: [sampleUtteranceForProfile(profile)],
    expectedFields: requiredFields.map((slot) => ({ key: slot.key, label: slot.label, prompt: slot.prompt })),
    steps: [
      {
        title: "Select workspace and profile",
        instruction: `Choose ${profile.name} in the simulator so the call uses the tenant-specific behavior.`,
        presenterTip: "Point out that profiles are configurable from the dashboard, not hard-coded."
      },
      {
        title: "Start the browser call",
        instruction: "Click Start Demo Call, then Grant Consent. This keeps the demo fully no-cost.",
        presenterTip: "Mention that browser speech synthesis replaces paid telephony for the project demo."
      },
      {
        title: "Send the guided caller line",
        instruction: `Use the sample utterance: ${sampleUtteranceForProfile(profile)}`,
        presenterTip: "The agent should extract structured fields from this single caller response."
      },
      {
        title: "Show records and report",
        instruction: "Open Collected Records to show stored data, follow-up state, outcome action, and daily report export.",
        presenterTip: "This is the proof that the conversation becomes usable operational data."
      }
    ],
    talkingPoints: [
      "The same platform can run hospital, front desk, and education reception workflows.",
      "Each tenant workspace has isolated profiles, records, analytics, admins, and reports.",
      "The demo runs with mock AI adapters and browser voice, so there is no API or telephony cost.",
      "Required fields are defined by the agent profile and collected from the conversation."
    ],
    evaluatorChecklist: [
      "Agent asks for consent before continuing.",
      "Caller data is extracted into structured fields.",
      "Completed sessions appear in Collected Records.",
      "Follow-up status and outcome action can be updated.",
      "Daily handoff report can be generated and downloaded."
    ]
  };
}

function outcomeForProfile(profile: AgentProfile): { type: SessionOutcomeType; scheduledFor?: string; referenceId?: string; notes: string } {
  const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  if (profile.workflow === "appointment_booking") {
    return { type: "appointment_confirmed", scheduledFor, referenceId: "APT-DEMO-1001", notes: "Demo appointment confirmed from seeded browser call." };
  }

  if (profile.workflow === "frontdesk_reception") {
    return { type: "visitor_routed", referenceId: "VIS-DEMO-1001", notes: "Demo visitor routed to the requested department." };
  }

  if (profile.workflow === "institution_reception") {
    return { type: "enquiry_forwarded", referenceId: "ENQ-DEMO-1001", notes: "Demo admissions enquiry forwarded to counselling team." };
  }

  return { type: "closed_no_action", referenceId: "DEMO-1001", notes: "Demo workflow closed after sample response." };
}

function followUpForProfile(profile: AgentProfile): { status: FollowUpStatus; assignee: string; notes: string } {
  if (profile.workflow === "appointment_booking") {
    return { status: "resolved", assignee: "Hospital Ops", notes: "Seeded demo appointment is ready for handoff report." };
  }

  if (profile.workflow === "frontdesk_reception") {
    return { status: "contacted", assignee: "Front Desk", notes: "Seeded visitor request has been routed." };
  }

  if (profile.workflow === "institution_reception") {
    return { status: "in_progress", assignee: "Admissions Team", notes: "Seeded enquiry is ready for counsellor follow-up." };
  }

  return { status: "closed", assignee: "Demo Ops", notes: "Seeded demo workflow completed." };
}

function seedBody(body: unknown) {
  if (!body || typeof body !== "object") return {};
  const value = body as { tenantId?: unknown; allTenants?: unknown };
  return {
    tenantId: typeof value.tenantId === "string" && value.tenantId.trim() ? value.tenantId : undefined,
    allTenants: value.allTenants === true
  };
}

async function seedProfile(app: FastifyInstance, profile: AgentProfile, direction: CallDirection = "inbound") {
  const now = new Date().toISOString();
  const required = profile.slots.filter((slot) => slot.required).map((slot) => slot.key);
  const sampleUtterance = sampleUtteranceForProfile(profile);
  const created = await app.services.persistence.createSession({
    id: randomUUID(),
    tenantId: profile.tenantId,
    agentProfileId: profile.id,
    domain: profile.domain,
    workflow: profile.workflow,
    language: profile.languages[0] ?? "en-IN",
    direction,
    participant: direction === "outbound"
      ? { phoneNumber: "+919000000001", displayName: "Seeded Outbound Contact" }
      : { phoneNumber: "+910000000000", displayName: "Seeded Demo Caller" },
    slotState: { required, collected: {}, missing: [...required] }
  });
  const active = await app.services.persistence.captureConsent(created.id, true);
  if (!active) throw new Error("Unable to capture seeded demo consent.");

  const result = await app.services.orchestrator.processTurn({
    session: active,
    transcript: sampleUtterance,
    asrConfidence: 0.94,
    nluConfidence: 0.92,
    workflow: app.services.workflows.get(profile.workflow),
    profile
  });
  const processed = await app.services.persistence.applyTurn(created.id, sampleUtterance, result);
  if (!processed) throw new Error("Unable to process seeded demo turn.");

  let operation = null;
  if (result.decision.action === "complete_call") {
    const operationType = operationTypeForWorkflow(profile.workflow);
    const collected = processed.slotState.collected;
    const scheduledFor = [collected.preferred_date, collected.preferred_time].filter(Boolean).join(" ") || undefined;
    operation = await app.services.persistence.createOperation({
      tenantId: processed.tenantId,
      sessionId: processed.id,
      agentProfileId: profile.id,
      type: operationType,
      payload: collected,
      ...(scheduledFor ? { scheduledFor } : {})
    });
  }

  await app.services.persistence.recordMetric({
    sessionId: created.id,
    turnSwitchLatencyMs: 480,
    asrConfidence: 0.94,
    nluConfidence: 0.92,
    workflowCompleted: result.decision.action === "complete_call",
    escalated: result.decision.action === "escalate_to_human"
  });

  const followUp = followUpForProfile(profile);
  const withFollowUp = await app.services.persistence.updateFollowUp(processed.id, followUp);
  const outcome = outcomeForProfile(profile);
  const withOutcome = await app.services.persistence.updateOutcome(processed.id, outcome);
  const session = withOutcome ?? withFollowUp ?? processed;

  return {
    session,
    profile: { id: profile.id, name: profile.name, domain: profile.domain, workflow: profile.workflow },
    direction,
    sampleUtterance,
    decision: result.decision,
    operation,
    collected: session.slotState.collected,
    createdAt: now
  };
}

export function registerDemoRoutes(app: FastifyInstance) {
  app.get("/v1/demo/config", async (request) => {
    const { tenantId } = request.query as { tenantId?: string };
    const tenant = app.services.agentProfiles.getTenant(tenantId);
    const profiles = app.services.agentProfiles.list(tenant.id);
    return {
      appName: "Multilingual Voice Agent Demo",
      mode: "browser-simulator",
      zeroCost: true,
      tenant,
      supportedLanguages: ["en-IN", "hi-IN", "kn-IN", "ta-IN", "ml-IN"],
      aiAdapters: {
        asr: process.env.ASR_PROVIDER ?? "mock",
        llm: process.env.LLM_PROVIDER ?? "mock",
        tts: process.env.TTS_PROVIDER ?? "mock"
      },
      scenarios: profiles.map((profile) => ({
        id: profile.id,
        tenantId: profile.tenantId,
        title: profile.name,
        domain: profile.domain,
        workflow: profile.workflow,
        language: profile.languages[0],
        starterPrompt: profile.description,
        sampleUtterance: sampleUtteranceForProfile(profile),
        guide: guideForProfile(profile)
      })),
      presentation: {
        title: "Zero-Cost Multi-Purpose AI Calling Agent Demo",
        setupSteps: [
          "Run the backend and admin frontend locally.",
          "Choose a tenant workspace for the domain you want to show.",
          "Use the guided sample to complete one browser-based call.",
          "Open Collected Records and download the daily handoff report."
        ],
        zeroCostProof: [
          "No SIM, PSTN, SIP trunk, or paid telephony provider is used.",
          "ASR, LLM, and TTS run through mock provider adapters for the demo.",
          "Voice output uses the browser SpeechSynthesis API.",
          "Mic input uses optional browser SpeechRecognition when available."
        ]
      },
      notes: [
        "Uses your existing backend session flow.",
        "Uses browser speech synthesis for free voice output.",
        "Uses browser speech recognition only when supported by the browser.",
        "No phone numbers or telephony providers are required for the demo.",
        "The backend now runs through provider-neutral ASR, LLM, and TTS adapter interfaces.",
        "Each tenant workspace keeps its own profiles, admins, records, and analytics isolated for demo presentation."
      ]
    };
  });

  app.post("/v1/demo/seed", async (request, reply) => {
    const body = seedBody(request.body);

    try {
      const tenants = body.allTenants ? app.services.agentProfiles.listTenants() : [app.services.agentProfiles.getTenant(body.tenantId)];
      const seeded = [];

      for (const tenant of tenants) {
        const profiles = app.services.agentProfiles.list(tenant.id);
        for (const profile of profiles) {
          seeded.push(await seedProfile(app, profile, "inbound"));
        }
        if (profiles[0]) seeded.push(await seedProfile(app, profiles[0], "outbound"));
      }

      return reply.code(201).send({
        zeroCost: true,
        mode: "browser-simulator",
        seededCount: seeded.length,
        tenants: tenants.map((tenant) => ({ id: tenant.id, name: tenant.name, domainFocus: tenant.domainFocus })),
        sessions: seeded
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to seed demo records." });
    }
  });
}
