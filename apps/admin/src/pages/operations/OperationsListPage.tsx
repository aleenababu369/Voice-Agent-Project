import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { fetchOperations, fetchProspects } from "../../features/platform/platformSlice";
import { useLiveCallRefresh } from "../../hooks/useLiveCallRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState, MetricCard, SectionHeader, SimpleSelect, formatLabel } from "../../components/common";
import type { OperationStatusDto, OperationTypeDto } from "../../features/platform/types";
import { OPERATION_STATUSES, OPERATION_TYPES, statusVariant, useCaseLabel } from "./shared";

export function OperationsListPage() {
  const operations = useAppSelector((state) => state.platform.operations);
  const prospects = useAppSelector((state) => state.platform.prospects);
  const profiles = useAppSelector((state) => state.platform.profiles);
  const dispatch = useAppDispatch();
  // Refresh the moment a call completes (its operation is created server-side just before the socket broadcast),
  // so a freshly booked appointment/enquiry shows here immediately — same live behaviour as the call history page.
  const refresh = useCallback(() => {
    void dispatch(fetchOperations());
    void dispatch(fetchProspects());
  }, [dispatch]);
  useLiveCallRefresh(refresh);
  const [type, setType] = useState<"all" | OperationTypeDto>("all");
  const [status, setStatus] = useState<"all" | OperationStatusDto>("all");
  const [query, setQuery] = useState("");

  const prospectName = (id?: string) => prospects.find((prospect) => prospect.id === id)?.name;
  const agentName = (id?: string) => profiles.find((profile) => profile.id === id)?.name;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return operations.filter((operation) => {
      if (type !== "all" && operation.type !== type) return false;
      if (status !== "all" && operation.status !== status) return false;
      if (needle) {
        const hay = `${operation.referenceId} ${prospectName(operation.prospectId) ?? ""} ${Object.values(operation.payload).join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operations, type, status, query, prospects]);

  const useCaseCount = OPERATION_TYPES.filter((operationType) => operations.some((operation) => operation.type === operationType)).length;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Operations"
        title="Use-case outcomes"
        subtitle="Every completed call performs a real action — appointments, enquiries, reminders and follow-ups — stored here per prospect with its collected data."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total outcomes" value={String(operations.length)} />
        <MetricCard label="Completed" value={String(operations.filter((operation) => operation.status === "completed").length)} />
        <MetricCard label="Scheduled" value={String(operations.filter((operation) => operation.status === "scheduled").length)} />
        <MetricCard label="Use cases" value={String(useCaseCount)} />
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-[200px_180px_minmax(0,1fr)]">
            <SimpleSelect value={type} onValueChange={(v) => setType(v as "all" | OperationTypeDto)} options={[{ value: "all", label: "All use cases" }, ...OPERATION_TYPES.map((operationType) => ({ value: operationType, label: useCaseLabel(operationType) }))]} />
            <SimpleSelect value={status} onValueChange={(v) => setStatus(v as "all" | OperationStatusDto)} options={[{ value: "all", label: "All statuses" }, ...OPERATION_STATUSES.map((operationStatus) => ({ value: operationStatus, label: formatLabel(operationStatus) }))]} />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reference, prospect, or collected data…" />
          </div>

          {filtered.length === 0 ? (
            <EmptyState>No operations match. Complete a call and the outcome will appear here automatically.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Use case</th>
                    <th className="py-2 pr-3 font-medium">Reference</th>
                    <th className="py-2 pr-3 font-medium">Prospect</th>
                    <th className="py-2 pr-3 font-medium">Agent</th>
                    <th className="py-2 pr-3 font-medium">Scheduled</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((operation) => (
                    <tr key={operation.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40">
                      <td className="py-2.5 pr-3"><Link to={`/operations/${operation.id}`}><Badge>{useCaseLabel(operation.type)}</Badge></Link></td>
                      <td className="py-2.5 pr-3"><Link to={`/operations/${operation.id}`} className="font-mono text-xs hover:underline">{operation.referenceId}</Link></td>
                      <td className="py-2.5 pr-3">{operation.prospectId ? <Link to={`/prospects/${operation.prospectId}`} className="hover:underline">{prospectName(operation.prospectId) ?? "Prospect"}</Link> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{agentName(operation.agentProfileId) ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{operation.scheduledFor ?? "—"}</td>
                      <td className="py-2.5 pr-3"><Badge variant={statusVariant(operation.status)}>{formatLabel(operation.status)}</Badge></td>
                      <td className="py-2.5 text-muted-foreground">{new Date(operation.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
