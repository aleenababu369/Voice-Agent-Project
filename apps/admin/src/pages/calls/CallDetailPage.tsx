import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bot, Megaphone, UserRound } from "lucide-react";
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
  const profiles = useAppSelector((state) => state.platform.profiles);
  const campaigns = useAppSelector((state) => state.platform.campaigns);
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
  const agentName = profiles.find((profile) => profile.id === detail.agentProfileId)?.name;
  const campaignName = campaigns.find((campaign) => campaign.id === detail.campaignId)?.name;

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

      {detail.agentProfileId || detail.prospectId || detail.campaignId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Related:</span>
          {detail.agentProfileId ? <Button variant="outline" size="sm" asChild><Link to={`/agents/${detail.agentProfileId}`}><Bot className="h-4 w-4" /> {agentName ?? "Agent"}</Link></Button> : null}
          {detail.prospectId ? <Button variant="outline" size="sm" asChild><Link to={`/prospects/${detail.prospectId}`}><UserRound className="h-4 w-4" /> Prospect</Link></Button> : null}
          {detail.campaignId ? <Button variant="outline" size="sm" asChild><Link to={`/campaigns/${detail.campaignId}`}><Megaphone className="h-4 w-4" /> {campaignName ?? "Campaign"}</Link></Button> : null}
        </div>
      ) : null}

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

          {detail.uncertainty ? (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <Eyebrow>Dialogue confidence</Eyebrow>
                  <Badge variant="muted">{Math.round(detail.uncertainty.averageSlotConfidence * 100)}% avg</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-secondary/50 px-3 py-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">Confirmations</div><div className="mt-0.5 text-lg font-semibold">{detail.uncertainty.confirmations}</div></div>
                  <div className="rounded-lg bg-secondary/50 px-3 py-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">Re-prompts</div><div className="mt-0.5 text-lg font-semibold">{detail.uncertainty.reprompts}</div></div>
                </div>
                {Object.keys(detail.uncertainty.slotConfidence).length > 0 ? (
                  <div className="mt-4 space-y-2.5">
                    {Object.entries(detail.uncertainty.slotConfidence).map(([key, value]) => {
                      const pct = Math.round(value * 100);
                      const band = value >= 0.7 ? "high" : value >= 0.4 ? "medium" : "low";
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{key}</span>
                            <span className="font-mono">{pct}% · {band}</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                            <div className={cn("h-full rounded-full", band === "high" ? "bg-zinc-900" : band === "medium" ? "bg-zinc-500" : "bg-zinc-300")} style={{ width: `${Math.max(4, pct)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="mt-3 text-xs text-muted-foreground">No per-field confidence recorded for this call.</p>}
                <p className="mt-3 text-xs text-muted-foreground">High = accepted · Medium = confirmed with the caller · Low = re-prompted.</p>
              </CardContent>
            </Card>
          ) : null}

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
                    <Link key={operation.id} to={`/operations/${operation.id}`} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-sm transition-colors hover:bg-secondary">
                      <Badge>{formatLabel(operation.type)}</Badge>
                      <span className="font-mono text-xs">{operation.referenceId}</span>
                    </Link>
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
