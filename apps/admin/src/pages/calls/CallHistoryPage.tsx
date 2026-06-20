import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Megaphone } from "lucide-react";
import { useAppSelector } from "../../app/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, MetricCard, SectionHeader, SimpleSelect, formatLabel } from "../../components/common";

export function CallHistoryPage() {
  const sessions = useAppSelector((state) => state.platform.sessions);
  const analytics = useAppSelector((state) => state.platform.analytics);
  const campaigns = useAppSelector((state) => state.platform.campaigns);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sessions.filter((session) => {
      if (direction !== "all" && session.direction !== direction) return false;
      if (status !== "all" && session.status !== status) return false;
      if (!query) return true;
      return `${session.participant.displayName ?? ""} ${session.participant.phoneNumber} ${session.workflow} ${Object.values(session.slotState.collected).join(" ")}`.toLowerCase().includes(query);
    });
  }, [sessions, search, direction, status]);

  function exportCsv() {
    const header = ["session_id", "direction", "status", "workflow", "caller", "phone", "follow_up", "outcome", "created_at", "collected"];
    const rows = filtered.map((s) => [s.id, s.direction, s.status, s.workflow, s.participant.displayName ?? "", s.participant.phoneNumber, s.followUp.status, s.outcome.type, s.createdAt, JSON.stringify(s.slotState.collected)]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `call-records-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Records" title="Call history" subtitle="Every conversation, its outcome, and the data the agent collected." aside={<Button variant="outline" disabled={filtered.length === 0} onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total calls" value={String(analytics?.totals.totalSessions ?? sessions.length)} />
        <MetricCard label="Completed" value={String(analytics?.totals.completedSessions ?? 0)} />
        <MetricCard label="Escalated" value={String(analytics?.totals.escalatedSessions ?? 0)} />
        <MetricCard label="Operations" value={String(analytics?.totals.totalOperations ?? 0)} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <SimpleSelect value={direction} onValueChange={setDirection} options={[{ value: "all", label: "All directions" }, { value: "inbound", label: "Inbound" }, { value: "outbound", label: "Outbound" }]} />
        <SimpleSelect value={status} onValueChange={setStatus} options={[{ value: "all", label: "All states" }, { value: "completed", label: "Completed" }, { value: "active", label: "Active" }, { value: "escalated", label: "Escalated" }, { value: "consent_pending", label: "Consent pending" }, { value: "failed", label: "Failed" }]} />
      </div>

      {filtered.length === 0 ? <EmptyState>No calls match the filters.</EmptyState> : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((session) => (
                <Link key={session.id} to={`/calls/${session.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-secondary/50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="truncate">{session.participant.displayName ?? "Caller"}</strong>
                      <Badge variant={session.direction === "outbound" ? "outline" : "secondary"}>{session.direction}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{session.workflow} · {new Date(session.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {session.campaignId ? <Badge variant="outline"><Megaphone className="h-3 w-3" /> {campaigns.find((c) => c.id === session.campaignId)?.name ?? "Campaign"}</Badge> : null}
                    <Badge variant="muted">{formatLabel(session.outcome.type)}</Badge>
                    <Badge variant={session.status === "completed" ? "success" : session.status === "escalated" ? "destructive" : "muted"}>{session.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
