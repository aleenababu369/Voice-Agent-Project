import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bot, Megaphone, Phone, UserRound } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { updateOperation } from "../../features/platform/platformSlice";
import type { OperationStatusDto } from "../../features/platform/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, MetricCard, SectionHeader, SimpleSelect, formatLabel } from "../../components/common";
import { OPERATION_STATUSES, statusVariant, useCaseLabel } from "./shared";

export function OperationDetailPage() {
  const dispatch = useAppDispatch();
  const { operationId } = useParams();
  const operations = useAppSelector((state) => state.platform.operations);
  const prospects = useAppSelector((state) => state.platform.prospects);
  const profiles = useAppSelector((state) => state.platform.profiles);
  const campaigns = useAppSelector((state) => state.platform.campaigns);
  const operation = operations.find((item) => item.id === operationId) ?? null;

  if (!operation) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild><Link to="/operations"><ArrowLeft className="h-4 w-4" /> Operations</Link></Button>
        <p className="text-sm text-muted-foreground">{operations.length === 0 ? "Loading operation…" : "Operation not found."}</p>
      </div>
    );
  }

  const prospect = prospects.find((item) => item.id === operation.prospectId);
  const agent = profiles.find((item) => item.id === operation.agentProfileId);
  const campaign = campaigns.find((item) => item.id === operation.campaignId);
  const entries = Object.entries(operation.payload);

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild><Link to="/operations"><ArrowLeft className="h-4 w-4" /> Operations</Link></Button>
      <SectionHeader
        eyebrow={`${useCaseLabel(operation.type)} · ${operation.referenceId}`}
        title={prospect?.name ?? "Operation outcome"}
        subtitle={agent ? `Collected by ${agent.name}` : "Outcome from a completed call"}
        aside={<Badge variant={statusVariant(operation.status)}>{formatLabel(operation.status)}</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Use case" value={useCaseLabel(operation.type)} />
        <MetricCard label="Reference" value={operation.referenceId} />
        <MetricCard label="Scheduled" value={operation.scheduledFor ?? "—"} />
        <MetricCard label="Created" value={new Date(operation.createdAt).toLocaleString()} />
      </div>

      {operation.agentProfileId || operation.prospectId || operation.campaignId || operation.sessionId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Related:</span>
          {operation.agentProfileId ? <Button variant="outline" size="sm" asChild><Link to={`/agents/${operation.agentProfileId}`}><Bot className="h-4 w-4" /> {agent?.name ?? "Agent"}</Link></Button> : null}
          {operation.prospectId ? <Button variant="outline" size="sm" asChild><Link to={`/prospects/${operation.prospectId}`}><UserRound className="h-4 w-4" /> {prospect?.name ?? "Prospect"}</Link></Button> : null}
          {operation.sessionId ? <Button variant="outline" size="sm" asChild><Link to={`/calls/${operation.sessionId}`}><Phone className="h-4 w-4" /> Call</Link></Button> : null}
          {operation.campaignId ? <Button variant="outline" size="sm" asChild><Link to={`/campaigns/${operation.campaignId}`}><Megaphone className="h-4 w-4" /> {campaign?.name ?? "Campaign"}</Link></Button> : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardContent className="p-6">
            <Eyebrow>Collected data</Eyebrow>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">The structured information this use case captured from the caller.</p>
            {entries.length === 0 ? <p className="text-sm text-muted-foreground">No data captured.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {entries.map(([key, value]) => (
                    <tr key={key} className="border-b border-border/60 last:border-0">
                      <td className="w-1/3 py-2.5 pr-3 align-top text-xs uppercase tracking-wide text-muted-foreground">{formatLabel(key)}</td>
                      <td className="py-2.5">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <Eyebrow>Status</Eyebrow>
            <p className="text-sm text-muted-foreground">Update as the back office processes this outcome.</p>
            <SimpleSelect value={operation.status} onValueChange={(v) => void dispatch(updateOperation({ operationId: operation.id, status: v as OperationStatusDto }))} options={OPERATION_STATUSES.map((operationStatus) => ({ value: operationStatus, label: formatLabel(operationStatus) }))} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
