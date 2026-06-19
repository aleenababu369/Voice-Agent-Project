import { useEffect } from "react";
import { PhoneCall, PhoneOutgoing } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { fetchAnalytics, fetchDailyReport } from "../features/platform/platformSlice";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, MetricCard, SectionHeader, formatLabel } from "../components/common";

function pct(value: number) { return `${Math.round(value * 100)}%`; }

function Bars({ items }: { items: Array<{ label: string; total: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.total));
  const visible = items.filter((i) => i.total > 0);
  if (visible.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <div className="space-y-3">
      {visible.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-sm"><span className="capitalize">{formatLabel(item.label)}</span><span className="text-muted-foreground">{item.total}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((item.total / max) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const dispatch = useAppDispatch();
  const analytics = useAppSelector((state) => state.platform.analytics);
  const dailyReport = useAppSelector((state) => state.platform.dailyReport);

  useEffect(() => { void dispatch(fetchAnalytics()); }, [dispatch]);

  const totals = analytics?.totals;
  const channel = analytics?.channelMix ?? { inbound: 0, outbound: 0 };

  function downloadReport() {
    if (!dailyReport) return;
    const blob = new Blob([dailyReport.markdown], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `handoff-${dailyReport.date}.md`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Analytics" title="Performance" subtitle="Real-time outcomes across your agents, campaigns, and prospects." aside={<Button variant="outline" onClick={() => { void dispatch(fetchAnalytics()); void dispatch(fetchDailyReport(undefined)); }}>Refresh</Button>} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Completion rate" value={pct(totals?.completionRate ?? 0)} />
        <MetricCard label="Escalation rate" value={pct(totals?.escalationRate ?? 0)} />
        <MetricCard label="Operations" value={String(totals?.totalOperations ?? 0)} />
        <MetricCard label="Campaigns / Prospects" value={`${totals?.totalCampaigns ?? 0} / ${totals?.totalProspects ?? 0}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <Eyebrow>Channel mix</Eyebrow>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-secondary/60 p-4"><div className="flex items-center gap-2"><PhoneCall className="h-4 w-4" /><span className="text-sm font-medium">Inbound</span></div><strong className="mt-2 block text-2xl">{channel.inbound}</strong></div>
              <div className="rounded-xl bg-secondary/60 p-4"><div className="flex items-center gap-2"><PhoneOutgoing className="h-4 w-4" /><span className="text-sm font-medium">Outbound</span></div><strong className="mt-2 block text-2xl">{channel.outbound}</strong></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <Eyebrow>Operations by type</Eyebrow>
            <Bars items={(analytics?.operationTypes ?? []).map((o) => ({ label: o.type, total: o.total }))} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <Eyebrow>Prospect funnel</Eyebrow>
            <Bars items={(analytics?.prospectFunnel ?? []).map((p) => ({ label: p.status, total: p.total }))} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <Eyebrow>Daily handoff</Eyebrow>
            <p className="text-sm text-muted-foreground">{dailyReport ? `${dailyReport.records.length} records on ${dailyReport.date}.` : "Build the report to download a handoff summary."}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void dispatch(fetchDailyReport(undefined))}>Build report</Button>
              <Button size="sm" disabled={!dailyReport} onClick={downloadReport}>Download .md</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <Eyebrow>Campaigns</Eyebrow>
          {(analytics?.campaigns ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No campaigns yet.</p> : (
            <div className="grid gap-2">
              {analytics?.campaigns.map((campaign) => (
                <div key={campaign.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><strong>{campaign.name}</strong><p className="text-sm capitalize text-muted-foreground">{campaign.direction} · {campaign.prospectCount} prospects</p></div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{campaign.totalCalls} calls</Badge>
                    <Badge variant="success">{pct(campaign.completionRate)} done</Badge>
                    <Badge variant={campaign.status === "active" ? "success" : "muted"}>{campaign.status}</Badge>
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
