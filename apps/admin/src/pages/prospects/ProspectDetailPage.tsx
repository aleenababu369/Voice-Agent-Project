import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { fetchProspectDetail, updateOperation } from "../../features/platform/platformSlice";
import type { OperationStatusDto } from "../../features/platform/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Eyebrow, SectionHeader, SimpleSelect, StatTile, formatLabel } from "../../components/common";

const STATUSES: OperationStatusDto[] = ["created", "scheduled", "in_progress", "completed", "cancelled"];

export function ProspectDetailPage() {
  const dispatch = useAppDispatch();
  const { prospectId } = useParams();
  const detail = useAppSelector((state) => state.platform.prospectDetail);

  useEffect(() => {
    if (prospectId) void dispatch(fetchProspectDetail(prospectId));
  }, [dispatch, prospectId]);

  if (!detail || detail.prospect.id !== prospectId) {
    return <div className="text-sm text-muted-foreground">Loading prospect…</div>;
  }
  const { prospect, sessions, operations } = detail;

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild><Link to="/prospects"><ArrowLeft className="h-4 w-4" /> Prospects</Link></Button>
      <SectionHeader eyebrow="Prospect" title={prospect.name} subtitle={prospect.phoneNumber} aside={<Badge variant={prospect.status === "completed" ? "success" : "muted"}>{formatLabel(prospect.status)}</Badge>} />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Calls" value={String(sessions.length)} />
        <StatTile label="Operations" value={String(operations.length)} />
        <StatTile label="Status" value={formatLabel(prospect.status)} />
        <StatTile label="Last outcome" value={prospect.lastOutcome ?? "—"} />
      </div>

      <Card>
        <CardContent className="p-6">
          <Eyebrow>Known data</Eyebrow>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(prospect.fields).length === 0 ? <p className="text-sm text-muted-foreground">No stored fields.</p> : Object.entries(prospect.fields).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-secondary/50 px-3 py-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">{key}</div><div className="mt-0.5 text-sm">{value}</div></div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <Eyebrow>Operations performed</Eyebrow>
          <div className="mt-3 grid gap-3">
            {operations.length === 0 ? <EmptyState>No operations yet — complete a call with this prospect.</EmptyState> : operations.map((operation) => (
              <div key={operation.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2"><Badge>{formatLabel(operation.type)}</Badge><strong className="font-mono text-sm">{operation.referenceId}</strong>{operation.scheduledFor ? <span className="text-sm text-muted-foreground">· {operation.scheduledFor}</span> : null}</div>
                <div className="w-[170px]"><SimpleSelect value={operation.status} onValueChange={(v) => void dispatch(updateOperation({ operationId: operation.id, status: v as OperationStatusDto }))} options={STATUSES.map((status) => ({ value: status, label: formatLabel(status) }))} /></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <Eyebrow>Calls</Eyebrow>
          <div className="mt-3 grid gap-2">
            {sessions.length === 0 ? <EmptyState>No calls yet.</EmptyState> : sessions.map((session) => (
              <Link key={session.id} to={`/calls/${session.id}`} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition hover:border-primary/40">
                <div className="flex items-center gap-2"><Badge variant={session.direction === "outbound" ? "outline" : "secondary"}>{session.direction}</Badge><span className="text-sm">{new Date(session.createdAt).toLocaleString()}</span></div>
                <Badge variant={session.status === "completed" ? "success" : "muted"}>{session.status}</Badge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
