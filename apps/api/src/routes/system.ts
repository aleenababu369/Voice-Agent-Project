import type { FastifyInstance } from "fastify";

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
      "follow_up_operations"
    ]
  }));

  app.get("/v1/metrics", async (request) => {
    const { tenantId } = request.query as { tenantId?: string };
    const summary = await app.services.persistence.getMetricsSummary(tenantId);
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
    const { tenantId } = request.query as { tenantId?: string };
    const tenant = app.services.agentProfiles.getTenant(tenantId);
    const sessions = await app.services.persistence.listSessions(tenant.id);
    const profiles = app.services.agentProfiles.list(tenant.id);

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((session) => session.status === "completed").length;
    const escalatedSessions = sessions.filter((session) => session.status === "escalated").length;
    const activeSessions = sessions.filter((session) => ["active", "clarification_required", "consent_pending"].includes(session.status)).length;
    const totalCollectedFields = sessions.reduce((sum, session) => sum + Object.keys(session.slotState.collected).length, 0);
    const openFollowUps = sessions.filter((session) => ["new", "in_progress", "contacted"].includes(session.followUp.status)).length;
    const resolvedFollowUps = sessions.filter((session) => ["resolved", "closed"].includes(session.followUp.status)).length;

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
        completionRate: totalSessions === 0 ? 0 : Number((completedSessions / totalSessions).toFixed(2)),
        escalationRate: totalSessions === 0 ? 0 : Number((escalatedSessions / totalSessions).toFixed(2))
      },
      domains,
      followUpStatuses,
      profiles: profileAnalytics
    };
  });
}
