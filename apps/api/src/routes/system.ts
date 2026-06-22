import type { FastifyInstance } from "fastify";
import { resolveAccountId } from "../plugins/auth.middleware.ts";
import { isWhisperConfigured } from "../services/ai/whisper-adapter.ts";

const followUpStatusList = ["new", "in_progress", "contacted", "resolved", "closed"] as const;
const outcomeTypeList = ["none", "callback_scheduled", "appointment_confirmed", "enquiry_forwarded", "visitor_routed", "closed_no_action"] as const;

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildMarkdownReport(input: {
  tenantName: string;
  date: string;
  totals: {
    totalSessions: number;
    completedSessions: number;
    escalatedSessions: number;
    openFollowUps: number;
    scheduledOutcomes: number;
    completedOutcomes: number;
    totalCollectedFields: number;
  };
  followUpGroups: Array<{ status: string; totalSessions: number }>;
  outcomeGroups: Array<{ type: string; totalSessions: number }>;
  channelMix: { inbound: number; outbound: number };
  operations: Array<{ type: string; status: string; referenceId: string; scheduledFor?: string }>;
  records: Array<{
    sessionId: string;
    profileName: string;
    domain: string;
    workflow: string;
    caller: string;
    phoneNumber: string;
    followUpStatus: string;
    outcomeType: string;
    scheduledFor?: string;
    referenceId?: string;
    collected: Record<string, string>;
  }>;
}) {
  const lines = [
    `# Daily Handoff Report - ${input.tenantName}`,
    "",
    `Date: ${input.date}`,
    "",
    "## Summary",
    "",
    `- Total sessions: ${input.totals.totalSessions}`,
    `- Completed sessions: ${input.totals.completedSessions}`,
    `- Escalated sessions: ${input.totals.escalatedSessions}`,
    `- Open follow-ups: ${input.totals.openFollowUps}`,
    `- Scheduled outcomes: ${input.totals.scheduledOutcomes}`,
    `- Completed outcomes: ${input.totals.completedOutcomes}`,
    `- Collected fields: ${input.totals.totalCollectedFields}`,
    "",
    "## Follow-Up Pipeline",
    "",
    ...input.followUpGroups.map((item) => `- ${formatLabel(item.status)}: ${item.totalSessions}`),
    "",
    "## Outcome Mix",
    "",
    ...input.outcomeGroups.map((item) => `- ${formatLabel(item.type)}: ${item.totalSessions}`),
    "",
    "## Channel Mix",
    "",
    `- Inbound: ${input.channelMix.inbound}`,
    `- Outbound: ${input.channelMix.outbound}`,
    "",
    "## Operations",
    "",
    ...(input.operations.length === 0
      ? ["No operations recorded for this date."]
      : input.operations.map((item) => `- ${formatLabel(item.type)} ${item.referenceId} (${formatLabel(item.status)})${item.scheduledFor ? ` scheduled for ${item.scheduledFor}` : ""}`)),
    "",
    "## Records",
    ""
  ];

  if (input.records.length === 0) {
    lines.push("No sessions found for this date.");
    return lines.join("\n");
  }

  for (const record of input.records) {
    const collected = Object.entries(record.collected).map(([key, value]) => `${key}: ${value}`).join("; ") || "No collected fields";
    lines.push(`- ${record.profileName} (${record.domain}/${record.workflow})`);
    lines.push(`  Caller: ${record.caller} | ${record.phoneNumber}`);
    lines.push(`  Follow-up: ${formatLabel(record.followUpStatus)} | Outcome: ${formatLabel(record.outcomeType)}`);
    if (record.scheduledFor) lines.push(`  Scheduled for: ${record.scheduledFor}`);
    if (record.referenceId) lines.push(`  Reference: ${record.referenceId}`);
    lines.push(`  Collected: ${collected}`);
    lines.push(`  Session: ${record.sessionId}`);
  }

  return lines.join("\n");
}

export function registerSystemRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    status: "ok",
    service: "voice-agent-api",
    workflows: app.services.workflows.list()
  }));

  app.get("/v1/capabilities", async () => ({
    domains: ["education", "healthcare", "frontdesk"],
    languages: ["en-IN", "hi-IN", "kn-IN", "ta-IN", "ml-IN"],
    workflows: app.services.workflows.list(),
    demoModes: ["browser-simulator"],
    // Tells the softphone whether to use the server-side Whisper recognizer or the browser's built-in one.
    whisperAsr: isWhisperConfigured(),
    asrEngine: isWhisperConfigured() ? "whisper" : "browser",
    features: [
      "goal_graph",
      "uncertainty_aware_orchestration",
      "slot_filling",
      "human_handoff_summary",
      "postgres_persistence_ready",
      "browser_voice_demo",
      "audit_logging_ready",
      "profile_templates",
      "records_analytics",
      "multi_tenant_workspaces",
      "follow_up_operations",
      "tenant_outcome_actions",
      "guided_demo_script",
      "zero_cost_seed_records",
      "dynamic_tenant_registration",
      "agent_deployment",
      "inbound_outbound_calls",
      "role_based_operations"
    ]
  }));

  app.get("/v1/metrics", async (request) => {
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    const summary = await app.services.persistence.getMetricsSummary(accountId);
    return {
      totalTurns: summary.total_turns,
      averageLatencyMs: summary.average_latency_ms,
      averageAsrConfidence: summary.average_asr_confidence,
      averageNluConfidence: summary.average_nlu_confidence,
      escalationRate: summary.escalation_rate,
      completionRate: summary.completion_rate
    };
  });

  app.get("/v1/platform/analytics", async (request) => {
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    const tenant = app.services.agentProfiles.getTenant(accountId);
    const sessions = await app.services.persistence.listSessions(tenant.id);
    const operations = await app.services.persistence.listOperations(tenant.id);
    const profiles = app.services.agentProfiles.list(tenant.id);

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((session) => session.status === "completed").length;
    const escalatedSessions = sessions.filter((session) => session.status === "escalated").length;
    const activeSessions = sessions.filter((session) => ["active", "clarification_required", "consent_pending"].includes(session.status)).length;
    const totalCollectedFields = sessions.reduce((sum, session) => sum + Object.keys(session.slotState.collected).length, 0);
    const openFollowUps = sessions.filter((session) => ["new", "in_progress", "contacted"].includes(session.followUp.status)).length;
    const resolvedFollowUps = sessions.filter((session) => ["resolved", "closed"].includes(session.followUp.status)).length;
    const scheduledOutcomes = sessions.filter((session) => ["callback_scheduled", "appointment_confirmed"].includes(session.outcome.type)).length;
    const completedOutcomes = sessions.filter((session) => ["enquiry_forwarded", "visitor_routed", "closed_no_action"].includes(session.outcome.type)).length;

    const domains = ["education", "healthcare", "frontdesk"].map((domain) => {
      const domainSessions = sessions.filter((session) => session.domain === domain);
      const domainTotal = domainSessions.length;
      const domainCompleted = domainSessions.filter((session) => session.status === "completed").length;
      const domainEscalated = domainSessions.filter((session) => session.status === "escalated").length;
      return {
        domain,
        totalSessions: domainTotal,
        completionRate: domainTotal === 0 ? 0 : Number((domainCompleted / domainTotal).toFixed(2)),
        escalationRate: domainTotal === 0 ? 0 : Number((domainEscalated / domainTotal).toFixed(2)),
        collectedFields: domainSessions.reduce((sum, session) => sum + Object.keys(session.slotState.collected).length, 0)
      };
    });

    const followUpStatuses = ["new", "in_progress", "contacted", "resolved", "closed"].map((status) => ({
      status,
      totalSessions: sessions.filter((session) => session.followUp.status === status).length
    }));

    const outcomeTypes = ["none", "callback_scheduled", "appointment_confirmed", "enquiry_forwarded", "visitor_routed", "closed_no_action"].map((type) => ({
      type,
      totalSessions: sessions.filter((session) => session.outcome.type === type).length
    }));

    const operationTypes = ["appointment", "enquiry", "visitor_routing", "reminder_ack", "follow_up", "generic"].map((type) => ({
      type,
      total: operations.filter((operation) => operation.type === type).length
    }));

    const operationStatuses = ["created", "scheduled", "in_progress", "completed", "cancelled"].map((status) => ({
      status,
      total: operations.filter((operation) => operation.status === status).length
    }));

    const channelMix = {
      inbound: sessions.filter((session) => session.direction === "inbound").length,
      outbound: sessions.filter((session) => session.direction === "outbound").length
    };

    const campaignList = await app.services.persistence.listCampaigns(tenant.id);
    const prospectList = await app.services.persistence.listProspects(tenant.id);
    const campaigns = campaignList.map((campaign) => {
      const campaignSessions = sessions.filter((session) => session.campaignId === campaign.id);
      const completed = campaignSessions.filter((session) => session.status === "completed").length;
      return {
        id: campaign.id,
        name: campaign.name,
        direction: campaign.direction,
        status: campaign.status,
        prospectCount: campaign.prospectIds.length,
        totalCalls: campaignSessions.length,
        completedCalls: completed,
        completionRate: campaignSessions.length === 0 ? 0 : Number((completed / campaignSessions.length).toFixed(2))
      };
    });
    const prospectFunnel = ["new", "queued", "in_progress", "contacted", "completed", "failed"].map((status) => ({
      status,
      total: prospectList.filter((prospect) => prospect.status === status).length
    }));

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const profileAnalytics = [...profileMap.values()].map((profile) => {
      const profileSessions = sessions.filter((session) => session.agentProfileId === profile.id);
      const count = profileSessions.length;
      const completed = profileSessions.filter((session) => session.status === "completed").length;
      const escalated = profileSessions.filter((session) => session.status === "escalated").length;
      const averageTurnCount = count === 0 ? 0 : Number((profileSessions.reduce((sum, session) => sum + session.turnCount, 0) / count).toFixed(1));
      return {
        profileId: profile.id,
        profileName: profile.name,
        domain: profile.domain,
        workflow: profile.workflow,
        totalSessions: count,
        completedSessions: completed,
        escalatedSessions: escalated,
        completionRate: count === 0 ? 0 : Number((completed / count).toFixed(2)),
        escalationRate: count === 0 ? 0 : Number((escalated / count).toFixed(2)),
        averageTurnCount,
        collectedFields: profileSessions.reduce((sum, session) => sum + Object.keys(session.slotState.collected).length, 0)
      };
    }).sort((left, right) => right.totalSessions - left.totalSessions || left.profileName.localeCompare(right.profileName));

    return {
      tenant,
      totals: {
        totalSessions,
        completedSessions,
        escalatedSessions,
        activeSessions,
        totalCollectedFields,
        openFollowUps,
        resolvedFollowUps,
        scheduledOutcomes,
        completedOutcomes,
        completionRate: totalSessions === 0 ? 0 : Number((completedSessions / totalSessions).toFixed(2)),
        escalationRate: totalSessions === 0 ? 0 : Number((escalatedSessions / totalSessions).toFixed(2)),
        totalOperations: operations.length,
        inboundSessions: channelMix.inbound,
        outboundSessions: channelMix.outbound,
        totalCampaigns: campaignList.length,
        totalProspects: prospectList.length
      },
      domains,
      followUpStatuses,
      outcomeTypes,
      operationTypes,
      operationStatuses,
      channelMix,
      campaigns,
      prospectFunnel,
      profiles: profileAnalytics
    };
  });

  app.get("/v1/platform/reports/daily", async (request) => {
    const { date } = request.query as { date?: string };
    const accountId = resolveAccountId(request, (request.query as { tenantId?: string }).tenantId);
    const tenant = app.services.agentProfiles.getTenant(accountId);
    const reportDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIsoDate();
    const allSessions = await app.services.persistence.listSessions(tenant.id);
    const sessions = allSessions.filter((session) => session.createdAt.slice(0, 10) === reportDate);
    const allOperations = await app.services.persistence.listOperations(tenant.id);
    const operations = allOperations.filter((operation) => operation.createdAt.slice(0, 10) === reportDate);
    const channelMix = {
      inbound: sessions.filter((session) => session.direction === "inbound").length,
      outbound: sessions.filter((session) => session.direction === "outbound").length
    };
    const profiles = app.services.agentProfiles.list(tenant.id);
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

    const totals = {
      totalSessions: sessions.length,
      completedSessions: sessions.filter((session) => session.status === "completed").length,
      escalatedSessions: sessions.filter((session) => session.status === "escalated").length,
      openFollowUps: sessions.filter((session) => ["new", "in_progress", "contacted"].includes(session.followUp.status)).length,
      scheduledOutcomes: sessions.filter((session) => ["callback_scheduled", "appointment_confirmed"].includes(session.outcome.type)).length,
      completedOutcomes: sessions.filter((session) => ["enquiry_forwarded", "visitor_routed", "closed_no_action"].includes(session.outcome.type)).length,
      totalCollectedFields: sessions.reduce((sum, session) => sum + Object.keys(session.slotState.collected).length, 0)
    };

    const followUpGroups = followUpStatusList.map((status) => ({
      status,
      totalSessions: sessions.filter((session) => session.followUp.status === status).length
    }));

    const outcomeGroups = outcomeTypeList.map((type) => ({
      type,
      totalSessions: sessions.filter((session) => session.outcome.type === type).length
    }));

    const records = sessions.map((session) => {
      const profile = session.agentProfileId ? profileMap.get(session.agentProfileId) : null;
      return {
        sessionId: session.id,
        profileName: profile?.name ?? session.agentProfileId ?? session.workflow,
        domain: session.domain,
        workflow: session.workflow,
        status: session.status,
        caller: session.participant.displayName ?? "Demo caller",
        phoneNumber: session.participant.phoneNumber,
        followUpStatus: session.followUp.status,
        assignee: session.followUp.assignee ?? null,
        followUpNotes: session.followUp.notes ?? null,
        outcomeType: session.outcome.type,
        scheduledFor: session.outcome.scheduledFor ?? null,
        referenceId: session.outcome.referenceId ?? null,
        outcomeNotes: session.outcome.notes ?? null,
        collected: session.slotState.collected,
        missing: session.slotState.missing,
        createdAt: session.createdAt
      };
    });

    const markdown = buildMarkdownReport({
      tenantName: tenant.name,
      date: reportDate,
      totals,
      followUpGroups,
      outcomeGroups,
      channelMix,
      operations: operations.map((operation) => ({
        type: operation.type,
        status: operation.status,
        referenceId: operation.referenceId,
        ...(operation.scheduledFor ? { scheduledFor: operation.scheduledFor } : {})
      })),
      records: records.map((record) => ({
        sessionId: record.sessionId,
        profileName: record.profileName,
        domain: record.domain,
        workflow: record.workflow,
        caller: record.caller,
        phoneNumber: record.phoneNumber,
        followUpStatus: record.followUpStatus,
        outcomeType: record.outcomeType,
        ...(record.scheduledFor ? { scheduledFor: record.scheduledFor } : {}),
        ...(record.referenceId ? { referenceId: record.referenceId } : {}),
        collected: record.collected
      }))
    });

    return {
      tenant,
      date: reportDate,
      generatedAt: new Date().toISOString(),
      totals,
      followUpGroups,
      outcomeGroups,
      channelMix,
      operations,
      records,
      markdown
    };
  });
}
