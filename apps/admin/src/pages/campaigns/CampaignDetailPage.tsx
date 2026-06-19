import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pause, Play, Plus, Square } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { addProspectsToCampaign, fetchCampaignDetail, fetchProspects, setCampaignStatus } from "../../features/platform/platformSlice";
import { useCampaignDialer } from "../../hooks/useCampaignDialer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Eyebrow, QualityBar, SectionHeader, SimpleSelect, StatTile, formatLabel } from "../../components/common";

export function CampaignDetailPage() {
  const dispatch = useAppDispatch();
  const { campaignId } = useParams();
  const detail = useAppSelector((state) => state.platform.campaignDetail);
  const allProspects = useAppSelector((state) => state.platform.prospects);
  const profiles = useAppSelector((state) => state.platform.profiles);
  const { dialer, run, stop, reset } = useCampaignDialer();
  const [addId, setAddId] = useState("");

  useEffect(() => {
    if (campaignId) void dispatch(fetchCampaignDetail(campaignId));
    void dispatch(fetchProspects());
  }, [dispatch, campaignId]);

  if (!detail || detail.campaign.id !== campaignId) return <div className="text-sm text-muted-foreground">Loading campaign…</div>;
  const { campaign, prospects } = detail;
  const agent = profiles.find((profile) => profile.id === campaign.agentProfileId);
  const memberIds = new Set(campaign.prospectIds);
  const available = allProspects.filter((prospect) => !memberIds.has(prospect.id));
  const isRunning = dialer.status === "running" && dialer.campaignId === campaign.id;
  const progress = dialer.total > 0 ? Math.round(((dialer.completedIds.length + dialer.failedIds.length) / dialer.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild><Link to="/campaigns"><ArrowLeft className="h-4 w-4" /> Campaigns</Link></Button>
      <SectionHeader
        eyebrow="Campaign"
        title={campaign.name}
        subtitle={`${campaign.direction} · agent: ${agent?.name ?? campaign.agentProfileId}`}
        aside={
          <div className="flex items-center gap-2">
            <Badge variant={campaign.status === "active" ? "success" : "muted"}>{formatLabel(campaign.status)}</Badge>
            {campaign.status === "active"
              ? <Button variant="outline" onClick={() => void dispatch(setCampaignStatus({ campaignId: campaign.id, active: false }))}><Pause className="h-4 w-4" /> Pause</Button>
              : <Button onClick={() => void dispatch(setCampaignStatus({ campaignId: campaign.id, active: true }))}><Play className="h-4 w-4" /> Activate</Button>}
          </div>
        }
      />

      {campaign.direction === "outbound" ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><Eyebrow>Auto-dial</Eyebrow><h3 className="text-lg font-semibold">Hands-free dialer</h3><p className="text-sm text-muted-foreground">Sequentially calls each prospect; the agent collects data and books the operation.</p></div>
              {isRunning
                ? <Button variant="outline" onClick={stop}><Square className="h-4 w-4" /> Stop</Button>
                : <Button disabled={campaign.status !== "active" || prospects.length === 0 || agent?.status === "draft"} onClick={() => { reset(); void run(campaign.id, campaign.prospectIds); }}><Play className="h-4 w-4" /> Run auto-dial</Button>}
            </div>
            {agent?.status === "draft" ? <div className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">Deploy the agent before dialing.</div> : null}
            {dialer.campaignId === campaign.id && dialer.total > 0 ? (
              <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-4">
                <QualityBar label={`Progress — ${dialer.completedIds.length + dialer.failedIds.length}/${dialer.total}`} value={progress} />
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div><div className="text-lg font-semibold">{dialer.completedIds.length}</div><div className="text-muted-foreground">Completed</div></div>
                  <div><div className="text-lg font-semibold">{dialer.failedIds.length}</div><div className="text-muted-foreground">Failed</div></div>
                  <div><div className="text-lg font-semibold capitalize">{dialer.status}</div><div className="text-muted-foreground">Status</div></div>
                </div>
                {dialer.currentProspectId ? <p className="text-center text-sm text-muted-foreground">Calling {prospects.find((p) => p.id === dialer.currentProspectId)?.name ?? dialer.currentProspectId}…</p> : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">This is an inbound campaign — its agent answers incoming calls. Prospects calling in are matched/created automatically. Use the Call console / softphone to simulate an inbound call.</CardContent></Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Prospects" value={String(campaign.prospectIds.length)} />
        <StatTile label="Completed" value={String(prospects.filter((p) => p.status === "completed").length)} />
        <StatTile label="Queued" value={String(prospects.filter((p) => p.status === "queued").length)} />
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><Eyebrow>Members</Eyebrow><h3 className="text-lg font-semibold">Prospects in this campaign</h3></div>
            <div className="flex items-end gap-2">
              <div className="w-56"><SimpleSelect value={addId} onValueChange={setAddId} placeholder="Add a prospect" options={available.map((p) => ({ value: p.id, label: `${p.name} · ${p.phoneNumber}` }))} /></div>
              <Button disabled={!addId} onClick={async () => { await dispatch(addProspectsToCampaign({ campaignId: campaign.id, prospectIds: [addId] })); setAddId(""); }}><Plus className="h-4 w-4" /> Add</Button>
            </div>
          </div>
          {prospects.length === 0 ? <EmptyState>No prospects yet. Add prospects to dial them.</EmptyState> : (
            <div className="grid gap-2">
              {prospects.map((prospect) => (
                <div key={prospect.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                  <Link to={`/prospects/${prospect.id}`} className="font-medium hover:underline">{prospect.name}</Link>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{prospect.phoneNumber}</span>
                    <Badge variant={prospect.status === "completed" ? "success" : prospect.status === "failed" ? "destructive" : "muted"}>{formatLabel(prospect.status)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
