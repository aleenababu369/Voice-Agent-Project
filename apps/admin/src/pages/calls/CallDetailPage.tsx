import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { fetchCallDetail, updateSessionFollowUp, updateSessionOutcome } from "../../features/platform/platformSlice";
import type { FollowUpStatusDto, SessionOutcomeTypeDto } from "../../features/platform/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow, MetricCard, SectionHeader, SimpleSelect, formatLabel } from "../../components/common";
import { cn } from "@/lib/utils";

const FOLLOW_UPS: FollowUpStatusDto[] = ["new", "in_progress", "contacted", "resolved", "closed"];
const OUTCOMES: SessionOutcomeTypeDto[] = ["none", "callback_scheduled", "appointment_confirmed", "enquiry_forwarded", "visitor_routed", "closed_no_action"];

export function CallDetailPage() {
  const dispatch = useAppDispatch();
  const { callId } = useParams();
  const detail = useAppSelector((state) => state.platform.callDetail);
  const [followUp, setFollowUp] = useState<FollowUpStatusDto>("new");
  const [outcome, setOutcome] = useState<SessionOutcomeTypeDto>("none");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (callId) void dispatch(fetchCallDetail(callId));
  }, [dispatch, callId]);

  useEffect(() => {
    if (detail && detail.sessionId === callId) {
      setFollowUp(detail.followUp.status);
      setOutcome(detail.outcome.type);
      setReference(detail.outcome.referenceId ?? "");
    }
  }, [detail, callId]);

  if (!detail || detail.sessionId !== callId) return <div className="text-sm text-muted-foreground">Loading call…</div>;

  const seconds = Math.round(detail.durationMs / 1000);

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild><Link to="/calls"><ArrowLeft className="h-4 w-4" /> Call history</Link></Button>
      <SectionHeader
        eyebrow="Call detail"
        title={detail.participant.displayName ?? "Caller"}
        subtitle={`${detail.participant.phoneNumber} · ${detail.direction} · ${detail.language}`}
        aside={<Badge variant={detail.status === "completed" ? "success" : detail.status === "escalated" ? "destructive" : "muted"}>{detail.status}</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Duration" value={`${seconds}s`} />
        <MetricCard label="Turns" value={String(detail.turnCount)} />
        <MetricCard label="Avg latency" value={`${detail.averageLatencyMs}ms`} />
        <MetricCard label="ASR conf." value={String(detail.averageAsrConfidence)} />
        <MetricCard label="NLU conf." value={String(detail.averageNluConfidence)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardContent className="p-6">
            <Eyebrow>Transcript</Eyebrow>
            <div className="mt-3 space-y-3">
              {detail.transcript.length === 0 ? <p className="text-sm text-muted-foreground">No transcript recorded.</p> : detail.transcript.map((entry, index) => (
                <div key={index} className={cn("rounded-xl px-4 py-3 text-sm leading-6", entry.role === "agent" ? "mr-8 bg-secondary" : "ml-8 bg-zinc-100")}>
                  <small className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{entry.role}</small>
                  {entry.text}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <Eyebrow>Collected data</Eyebrow>
              <div className="mt-3 grid gap-2">
                {Object.entries(detail.collected).length === 0 ? <p className="text-sm text-muted-foreground">No data collected.</p> : Object.entries(detail.collected).map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-secondary/50 px-3 py-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">{key}</div><div className="mt-0.5 text-sm">{value}</div></div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <Eyebrow>Outcome & follow-up</Eyebrow>
              <SimpleSelect value={outcome} onValueChange={(v) => setOutcome(v as SessionOutcomeTypeDto)} options={OUTCOMES.map((o) => ({ value: o, label: formatLabel(o) }))} />
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference / booking code" />
              <Button size="sm" className="w-full" onClick={() => void dispatch(updateSessionOutcome({ sessionId: detail.sessionId, type: outcome, ...(reference ? { referenceId: reference } : {}) }))}>Save outcome</Button>
              <SimpleSelect value={followUp} onValueChange={(v) => setFollowUp(v as FollowUpStatusDto)} options={FOLLOW_UPS.map((f) => ({ value: f, label: formatLabel(f) }))} />
              <Button size="sm" variant="outline" className="w-full" onClick={() => void dispatch(updateSessionFollowUp({ sessionId: detail.sessionId, status: followUp }))}>Save follow-up</Button>
            </CardContent>
          </Card>

          {detail.operations.length > 0 ? (
            <Card>
              <CardContent className="p-5">
                <Eyebrow>Operations</Eyebrow>
                <div className="mt-3 grid gap-2">
                  {detail.operations.map((operation) => (
                    <div key={operation.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-sm">
                      <Badge>{formatLabel(operation.type)}</Badge>
                      <span className="font-mono text-xs">{operation.referenceId}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
