import { useDeferredValue, useMemo, useState } from "react";
import type { AdminUserDto, FollowUpStatusDto, PlatformAnalyticsDto, SessionRecordDto, TenantDto } from "../features/platform/types";

type DomainFilter = "all" | "education" | "healthcare" | "frontdesk";
type StatusFilter = "all" | "consent_pending" | "active" | "clarification_required" | "completed" | "escalated" | "failed";
type FollowUpFilter = "all" | FollowUpStatusDto;

interface RecordsPanelProps {
  analytics: PlatformAnalyticsDto | null;
  sessions: SessionRecordDto[];
  tenant: TenantDto | null;
  users: AdminUserDto[];
  canEdit: boolean;
  onRefresh: () => void;
  onUpdateFollowUp: (input: { sessionId: string; status: FollowUpStatusDto; assignee?: string; notes?: string }) => Promise<void>;
}

const followUpStatuses: FollowUpStatusDto[] = ["new", "in_progress", "contacted", "resolved", "closed"];

export function RecordsPanel({ analytics, sessions, tenant, users, canEdit, onRefresh, onUpdateFollowUp }: RecordsPanelProps) {
  const [recordsSearch, setRecordsSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<DomainFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("all");
  const [drafts, setDrafts] = useState<Record<string, { status: FollowUpStatusDto; assignee: string; notes: string }>>({});
  const deferredSearch = useDeferredValue(recordsSearch);

  const filteredSessions = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return sessions.filter((session) => {
      if (domainFilter !== "all" && session.domain !== domainFilter) return false;
      if (statusFilter !== "all" && session.status !== statusFilter) return false;
      if (followUpFilter !== "all" && session.followUp.status !== followUpFilter) return false;
      if (!query) return true;
      const collectedText = Object.entries(session.slotState.collected).map(([key, value]) => `${key} ${value}`).join(" ").toLowerCase();
      const searchable = [
        session.tenantId,
        session.agentProfileId ?? "",
        session.workflow,
        session.domain,
        session.language,
        session.participant.displayName ?? "",
        session.participant.phoneNumber,
        session.followUp.status,
        session.followUp.assignee ?? "",
        session.followUp.notes ?? "",
        collectedText
      ].join(" ").toLowerCase();
      return searchable.includes(query);
    });
  }, [deferredSearch, domainFilter, followUpFilter, sessions, statusFilter]);

  const topProfiles = analytics?.profiles.slice(0, 4) ?? [];

  function toPercent(value: number) {
    return `${Math.round(value * 100)}%`;
  }

  function exportRecordsCsv(records: SessionRecordDto[]) {
    const header = ["tenant_id", "session_id", "profile_id", "domain", "workflow", "status", "follow_up_status", "follow_up_assignee", "follow_up_notes", "language", "caller_name", "phone_number", "turn_count", "created_at", "collected_fields"];
    const rows = records.map((session) => [
      session.tenantId,
      session.id,
      session.agentProfileId ?? "",
      session.domain,
      session.workflow,
      session.status,
      session.followUp.status,
      session.followUp.assignee ?? "",
      session.followUp.notes ?? "",
      session.language,
      session.participant.displayName ?? "",
      session.participant.phoneNumber,
      String(session.turnCount),
      session.createdAt,
      JSON.stringify(session.slotState.collected)
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `voice-agent-records-${tenant?.id ?? "workspace"}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function getDraft(session: SessionRecordDto) {
    return drafts[session.id] ?? {
      status: session.followUp.status,
      assignee: session.followUp.assignee ?? "",
      notes: session.followUp.notes ?? ""
    };
  }

  function updateDraft(sessionId: string, patch: Partial<{ status: FollowUpStatusDto; assignee: string; notes: string }>) {
    setDrafts((current) => {
      const session = sessions.find((item) => item.id === sessionId);
      const base = session ? getDraft(session) : { status: "new" as FollowUpStatusDto, assignee: "", notes: "" };
      return { ...current, [sessionId]: { ...base, ...patch } };
    });
  }

  async function handleSaveFollowUp(session: SessionRecordDto) {
    const draft = getDraft(session);
    await onUpdateFollowUp({
      sessionId: session.id,
      status: draft.status,
      assignee: draft.assignee || undefined,
      notes: draft.notes || undefined
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-5">
        <section className="rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Collected Data</p>
              <h2 className="text-3xl">Conversation Records</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">Workspace: {tenant?.name ?? analytics?.tenant.name ?? "Tenant workspace"}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-full border border-teal-700/20 px-4 py-2 text-sm text-[var(--color-teal-800)]" onClick={onRefresh}>Refresh</button>
              <button className="rounded-full bg-[var(--color-teal-700)] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={filteredSessions.length === 0} onClick={() => exportRecordsCsv(filteredSessions)}>Export CSV</button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
            <MetricCard label="Total sessions" value={String(analytics?.totals.totalSessions ?? sessions.length)} />
            <MetricCard label="Completed" value={String(analytics?.totals.completedSessions ?? 0)} />
            <MetricCard label="Escalated" value={String(analytics?.totals.escalatedSessions ?? 0)} />
            <MetricCard label="Collected fields" value={String(analytics?.totals.totalCollectedFields ?? 0)} />
            <MetricCard label="Open follow-ups" value={String(analytics?.totals.openFollowUps ?? 0)} />
            <MetricCard label="Resolved" value={String(analytics?.totals.resolvedFollowUps ?? 0)} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_180px_180px_180px]">
            <input className="rounded-2xl border border-black/10 bg-white px-4 py-3" placeholder="Search by profile, caller, phone, or collected data" value={recordsSearch} onChange={(event) => setRecordsSearch(event.target.value)} />
            <select className="rounded-2xl border border-black/10 bg-white px-4 py-3" value={domainFilter} onChange={(event) => setDomainFilter(event.target.value as DomainFilter)}>
              <option value="all">All domains</option>
              <option value="education">Education</option>
              <option value="healthcare">Healthcare</option>
              <option value="frontdesk">Frontdesk</option>
            </select>
            <select className="rounded-2xl border border-black/10 bg-white px-4 py-3" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">All session states</option>
              <option value="consent_pending">Consent pending</option>
              <option value="active">Active</option>
              <option value="clarification_required">Clarification</option>
              <option value="completed">Completed</option>
              <option value="escalated">Escalated</option>
              <option value="failed">Failed</option>
            </select>
            <select className="rounded-2xl border border-black/10 bg-white px-4 py-3" value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value as FollowUpFilter)}>
              <option value="all">All follow-ups</option>
              {followUpStatuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="mt-5 grid gap-4">
            {filteredSessions.length === 0 ? <div className="rounded-3xl bg-stone-100 px-5 py-4 text-[var(--color-ink-700)]">No records match the current filters yet.</div> : filteredSessions.map((session) => {
              const draft = getDraft(session);
              return <div key={session.id} className="rounded-3xl border border-black/10 bg-stone-50 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><strong>{session.agentProfileId ?? session.workflow}</strong><div className="mt-1 text-sm text-[var(--color-ink-700)]">{session.domain} · {session.language} · {session.status}</div><div className="mt-1 text-sm text-[var(--color-ink-700)]">Caller: {session.participant.displayName ?? "Demo caller"} · {session.participant.phoneNumber}</div></div><div className="text-sm text-[var(--color-ink-700)]">{new Date(session.createdAt).toLocaleString()} · {session.turnCount} turns</div></div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs text-[var(--color-teal-800)]">Follow-up: {session.followUp.status.replace("_", " ")}</span>{session.followUp.assignee ? <span className="rounded-full bg-white px-3 py-1 text-xs text-[var(--color-ink-700)]">Assignee: {session.followUp.assignee}</span> : null}{session.followUp.updatedAt ? <span className="rounded-full bg-white px-3 py-1 text-xs text-[var(--color-ink-700)]">Updated: {new Date(session.followUp.updatedAt).toLocaleString()}</span> : null}</div><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{Object.keys(session.slotState.collected).length === 0 ? <div className="text-sm text-[var(--color-ink-700)]">No data collected yet.</div> : Object.entries(session.slotState.collected).map(([key, value]) => <div key={key} className="rounded-2xl bg-white px-4 py-3"><div className="text-xs uppercase tracking-[0.1em] text-[var(--color-ink-700)]">{key}</div><div className="mt-1 break-words text-sm">{value}</div></div>)}</div><div className="mt-3 text-sm text-[var(--color-ink-700)]">Missing fields: {session.slotState.missing.join(", ") || "None"}</div><div className="mt-4 rounded-3xl bg-white px-4 py-4"><div className="grid gap-3 md:grid-cols-[220px_220px_minmax(0,1fr)_140px]"><select disabled={!canEdit} className="rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" value={draft.status} onChange={(event) => updateDraft(session.id, { status: event.target.value as FollowUpStatusDto })}>{followUpStatuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select><select disabled={!canEdit} className="rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" value={draft.assignee} onChange={(event) => updateDraft(session.id, { assignee: event.target.value })}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.name}>{user.name}</option>)}</select><input disabled={!canEdit} className="rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" value={draft.notes} onChange={(event) => updateDraft(session.id, { notes: event.target.value })} placeholder="Follow-up note or outcome" /><button className="rounded-full bg-[var(--color-teal-700)] px-5 py-3 text-white disabled:opacity-50" disabled={!canEdit} onClick={() => void handleSaveFollowUp(session)}>Save</button></div></div></div>;
            })}
          </div>
        </section>
      </section>
      <aside className="space-y-5">
        <section className="rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl">
          <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Analytics</p>
          <h2 className="text-3xl">Platform Performance</h2>
          <div className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">Tenant focus: {tenant?.domainFocus ?? analytics?.tenant.domainFocus ?? "workspace"}</div>
          <div className="mt-5 grid gap-3">
            <StatusCard label="Completion rate" value={toPercent(analytics?.totals.completionRate ?? 0)} />
            <StatusCard label="Escalation rate" value={toPercent(analytics?.totals.escalationRate ?? 0)} />
            <StatusCard label="Active sessions" value={String(analytics?.totals.activeSessions ?? 0)} />
          </div>
          <div className="mt-6 rounded-[24px] bg-gradient-to-b from-teal-50 to-white px-4 py-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Follow-up pipeline</p>
            <div className="mt-3 grid gap-3">{analytics?.followUpStatuses.map((item) => <div key={item.status} className="rounded-2xl bg-white px-4 py-3"><div className="flex items-center justify-between gap-3"><strong>{item.status.replace("_", " ")}</strong><span className="text-sm text-[var(--color-ink-700)]">{item.totalSessions} sessions</span></div></div>)}</div>
          </div>
          <div className="mt-6 rounded-[24px] bg-gradient-to-b from-teal-50 to-white px-4 py-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">By domain</p>
            <div className="mt-3 grid gap-3">{analytics?.domains.map((domain) => <div key={domain.domain} className="rounded-2xl bg-white px-4 py-3"><div className="flex items-center justify-between gap-3"><strong className="capitalize">{domain.domain}</strong><span className="text-sm text-[var(--color-ink-700)]">{domain.totalSessions} sessions</span></div><div className="mt-2 text-sm text-[var(--color-ink-700)]">Completion {toPercent(domain.completionRate)} · Escalation {toPercent(domain.escalationRate)}</div></div>)}</div>
          </div>
        </section>
        <section className="rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl">
          <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Top profiles</p>
          <h2 className="text-3xl">Profile Leaderboard</h2>
          <div className="mt-5 grid gap-3">{topProfiles.length === 0 ? <div className="rounded-2xl bg-stone-100 px-4 py-3 text-[var(--color-ink-700)]">Run some sessions to populate analytics.</div> : topProfiles.map((profile) => <div key={profile.profileId} className="rounded-2xl bg-stone-50 px-4 py-3"><div className="flex items-start justify-between gap-3"><div><strong>{profile.profileName}</strong><div className="mt-1 text-sm text-[var(--color-ink-700)]">{profile.domain} · {profile.workflow}</div></div><span className="rounded-full bg-white px-3 py-1 text-xs text-[var(--color-teal-800)]">{profile.totalSessions} sessions</span></div><div className="mt-3 text-sm text-[var(--color-ink-700)]">Completion {toPercent(profile.completionRate)} · Escalation {toPercent(profile.escalationRate)} · Avg turns {profile.averageTurnCount}</div></div>)}</div>
        </section>
      </aside>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl bg-gradient-to-b from-teal-50 to-white px-4 py-3"><span className="mb-1 block text-xs uppercase tracking-[0.12em] text-[var(--color-ink-700)]">{label}</span><strong className="block text-lg leading-6">{value}</strong></div>;
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl bg-stone-100 px-4 py-3"><span className="mb-1 block text-xs uppercase tracking-[0.12em] text-[var(--color-ink-700)]">{label}</span><strong className="block text-sm leading-6">{value}</strong></div>;
}
