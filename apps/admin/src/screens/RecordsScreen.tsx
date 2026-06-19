import { useDeferredValue, useMemo, useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import { useAppDispatch } from "../app/hooks";
import { useWorkspace } from "../hooks/useWorkspace";
import {
  fetchAnalytics,
  fetchDailyReport,
  fetchOperations,
  fetchSessions,
  updateSessionFollowUp,
  updateSessionOutcome
} from "../features/platform/platformSlice";
import type { FollowUpStatusDto, SessionOutcomeTypeDto, SessionRecordDto } from "../features/platform/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow, Field, MetricCard, SimpleSelect, formatLabel } from "../components/common";

const UNASSIGNED = "__unassigned__";
const FOLLOW_UPS: FollowUpStatusDto[] = ["new", "in_progress", "contacted", "resolved", "closed"];
const OUTCOMES: SessionOutcomeTypeDto[] = ["none", "callback_scheduled", "appointment_confirmed", "enquiry_forwarded", "visitor_routed", "closed_no_action"];

export function RecordsScreen() {
  const dispatch = useAppDispatch();
  const { platform, tenant, canEdit } = useWorkspace();
  const { sessions, analytics, dailyReport, users } = platform;

  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, { status: FollowUpStatusDto; assignee: string; notes: string }>>({});
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<string, { type: SessionOutcomeTypeDto; scheduledFor: string; referenceId: string; notes: string }>>({});
  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return sessions.filter((session) => {
      if (domainFilter !== "all" && session.domain !== domainFilter) return false;
      if (statusFilter !== "all" && session.status !== statusFilter) return false;
      if (followUpFilter !== "all" && session.followUp.status !== followUpFilter) return false;
      if (outcomeFilter !== "all" && session.outcome.type !== outcomeFilter) return false;
      if (directionFilter !== "all" && session.direction !== directionFilter) return false;
      if (!query) return true;
      const collected = Object.entries(session.slotState.collected).map(([key, value]) => `${key} ${value}`).join(" ");
      return [session.agentProfileId ?? "", session.workflow, session.domain, session.participant.displayName ?? "", session.participant.phoneNumber, session.followUp.assignee ?? "", session.outcome.referenceId ?? "", collected].join(" ").toLowerCase().includes(query);
    });
  }, [deferredSearch, domainFilter, statusFilter, followUpFilter, outcomeFilter, directionFilter, sessions]);

  function getFollowUpDraft(session: SessionRecordDto) {
    return followUpDrafts[session.id] ?? { status: session.followUp.status, assignee: session.followUp.assignee ?? "", notes: session.followUp.notes ?? "" };
  }
  function getOutcomeDraft(session: SessionRecordDto) {
    return outcomeDrafts[session.id] ?? { type: session.outcome.type, scheduledFor: session.outcome.scheduledFor ?? "", referenceId: session.outcome.referenceId ?? "", notes: session.outcome.notes ?? "" };
  }
  function patchFollowUp(session: SessionRecordDto, patch: Partial<{ status: FollowUpStatusDto; assignee: string; notes: string }>) {
    setFollowUpDrafts((current) => ({ ...current, [session.id]: { ...getFollowUpDraft(session), ...patch } }));
  }
  function patchOutcome(session: SessionRecordDto, patch: Partial<{ type: SessionOutcomeTypeDto; scheduledFor: string; referenceId: string; notes: string }>) {
    setOutcomeDrafts((current) => ({ ...current, [session.id]: { ...getOutcomeDraft(session), ...patch } }));
  }

  function exportCsv() {
    const header = ["session_id", "profile_id", "domain", "workflow", "direction", "status", "follow_up", "assignee", "outcome", "reference_id", "caller", "phone", "created_at", "collected"];
    const rows = filtered.map((session) => [
      session.id, session.agentProfileId ?? "", session.domain, session.workflow, session.direction, session.status,
      session.followUp.status, session.followUp.assignee ?? "", session.outcome.type, session.outcome.referenceId ?? "",
      session.participant.displayName ?? "", session.participant.phoneNumber, session.createdAt, JSON.stringify(session.slotState.collected)
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(csv, "text/csv", `records-${tenant?.id ?? "workspace"}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function exportReport() {
    if (!dailyReport) return;
    downloadBlob(dailyReport.markdown, "text/markdown", `handoff-${dailyReport.tenant.id}-${dailyReport.date}.md`);
  }

  async function refresh() {
    await Promise.all([dispatch(fetchSessions()), dispatch(fetchAnalytics()), dispatch(fetchOperations())]);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <Eyebrow>Collected data</Eyebrow>
              <h2 className="text-2xl font-semibold">Call records</h2>
              <p className="mt-1 text-sm text-muted-foreground">Every conversation and the structured data the agent captured.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /> Refresh</Button>
              <Input className="w-[150px]" type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
              <Button variant="outline" size="sm" onClick={() => void dispatch(fetchDailyReport(reportDate))}><FileText className="h-4 w-4" /> Build report</Button>
              <Button variant="outline" size="sm" disabled={!dailyReport} onClick={exportReport}><Download className="h-4 w-4" /> Report</Button>
              <Button size="sm" disabled={filtered.length === 0} onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Sessions" value={String(analytics?.totals.totalSessions ?? sessions.length)} />
            <MetricCard label="Completed" value={String(analytics?.totals.completedSessions ?? 0)} />
            <MetricCard label="Escalated" value={String(analytics?.totals.escalatedSessions ?? 0)} />
            <MetricCard label="Fields" value={String(analytics?.totals.totalCollectedFields ?? 0)} />
            <MetricCard label="Open follow-ups" value={String(analytics?.totals.openFollowUps ?? 0)} />
            <MetricCard label="Operations" value={String(analytics?.totals.totalOperations ?? 0)} />
          </div>

          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <Input className="md:col-span-3 xl:col-span-1" placeholder="Search records…" value={search} onChange={(event) => setSearch(event.target.value)} />
            <SimpleSelect value={domainFilter} onValueChange={setDomainFilter} options={[{ value: "all", label: "All domains" }, { value: "education", label: "Education" }, { value: "healthcare", label: "Healthcare" }, { value: "frontdesk", label: "Frontdesk" }]} />
            <SimpleSelect value={directionFilter} onValueChange={setDirectionFilter} options={[{ value: "all", label: "All directions" }, { value: "inbound", label: "Inbound" }, { value: "outbound", label: "Outbound" }]} />
            <SimpleSelect value={statusFilter} onValueChange={setStatusFilter} options={[{ value: "all", label: "All states" }, { value: "completed", label: "Completed" }, { value: "active", label: "Active" }, { value: "clarification_required", label: "Clarification" }, { value: "escalated", label: "Escalated" }, { value: "consent_pending", label: "Consent pending" }, { value: "failed", label: "Failed" }]} />
            <SimpleSelect value={followUpFilter} onValueChange={setFollowUpFilter} options={[{ value: "all", label: "All follow-ups" }, ...FOLLOW_UPS.map((status) => ({ value: status, label: formatLabel(status) }))]} />
            <SimpleSelect value={outcomeFilter} onValueChange={setOutcomeFilter} options={[{ value: "all", label: "All outcomes" }, ...OUTCOMES.map((type) => ({ value: type, label: formatLabel(type) }))]} />
          </div>

          <div className="grid gap-4">
            {filtered.length === 0 ? (
              <p className="rounded-xl bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">No records match the current filters.</p>
            ) : (
              filtered.map((session) => {
                const fu = getFollowUpDraft(session);
                const oc = getOutcomeDraft(session);
                return (
                  <div key={session.id} className="rounded-2xl border border-border bg-white/60 p-4">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong>{session.agentProfileId ?? session.workflow}</strong>
                          <Badge variant={session.direction === "outbound" ? "accent" : "secondary"}>{session.direction}</Badge>
                          <Badge variant={session.status === "completed" ? "success" : session.status === "escalated" ? "destructive" : "muted"}>{session.status}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{session.domain} · {session.language} · Caller: {session.participant.displayName ?? "Demo caller"} · {session.participant.phoneNumber}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleString()} · {session.turnCount} turns</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary">Follow-up: {formatLabel(session.followUp.status)}</Badge>
                      <Badge variant="warning">Outcome: {formatLabel(session.outcome.type)}</Badge>
                      {session.outcome.referenceId ? <Badge variant="muted">Ref: {session.outcome.referenceId}</Badge> : null}
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {Object.keys(session.slotState.collected).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No data collected yet.</p>
                      ) : (
                        Object.entries(session.slotState.collected).map(([key, value]) => (
                          <div key={key} className="rounded-xl bg-secondary/40 px-3 py-2">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">{key}</div>
                            <div className="mt-0.5 break-words text-sm">{value}</div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-xl bg-white/70 p-4">
                        <Eyebrow>Follow-up action</Eyebrow>
                        <div className="mt-2 grid gap-2">
                          <SimpleSelect disabled={!canEdit} value={fu.status} onValueChange={(value) => patchFollowUp(session, { status: value as FollowUpStatusDto })} options={FOLLOW_UPS.map((status) => ({ value: status, label: formatLabel(status) }))} />
                          <SimpleSelect disabled={!canEdit} value={fu.assignee || UNASSIGNED} onValueChange={(value) => patchFollowUp(session, { assignee: value === UNASSIGNED ? "" : value })} options={[{ value: UNASSIGNED, label: "Unassigned" }, ...users.map((user) => ({ value: user.name, label: user.name }))]} />
                          <Input disabled={!canEdit} value={fu.notes} onChange={(event) => patchFollowUp(session, { notes: event.target.value })} placeholder="Note" />
                          <Button size="sm" disabled={!canEdit} onClick={() => void dispatch(updateSessionFollowUp({ sessionId: session.id, status: fu.status, assignee: fu.assignee || undefined, notes: fu.notes || undefined }))}>Save follow-up</Button>
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/70 p-4">
                        <Eyebrow>Operational outcome</Eyebrow>
                        <div className="mt-2 grid gap-2">
                          <SimpleSelect disabled={!canEdit} value={oc.type} onValueChange={(value) => patchOutcome(session, { type: value as SessionOutcomeTypeDto })} options={OUTCOMES.map((type) => ({ value: type, label: formatLabel(type) }))} />
                          <Input disabled={!canEdit} value={oc.referenceId} onChange={(event) => patchOutcome(session, { referenceId: event.target.value })} placeholder="Reference / booking code" />
                          <Input disabled={!canEdit} value={oc.scheduledFor} onChange={(event) => patchOutcome(session, { scheduledFor: event.target.value })} placeholder="Scheduled for" />
                          <Button size="sm" variant="accent" disabled={!canEdit} onClick={() => void dispatch(updateSessionOutcome({ sessionId: session.id, type: oc.type, scheduledFor: oc.scheduledFor || undefined, referenceId: oc.referenceId || undefined, notes: oc.notes || undefined }))}>Save outcome</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function downloadBlob(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type: `${type};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
