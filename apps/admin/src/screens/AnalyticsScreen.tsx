import { PhoneCall, PhoneOutgoing } from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, MetricCard, SectionHeader, StatTile, formatLabel } from "../components/common";

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function DistributionRow({ label, total, max }: { label: string; total: number; max: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="capitalize">{label}</span>
        <span className="text-muted-foreground">{total}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary/60">
        <div className="h-full rounded-full bg-primary" style={{ width: `${max === 0 ? 0 : Math.round((total / max) * 100)}%` }} />
      </div>
    </div>
  );
}

export function AnalyticsScreen() {
  const { platform, tenant } = useWorkspace();
  const analytics = platform.analytics;
  const dailyReport = platform.dailyReport;
  const totals = analytics?.totals;
  const channel = analytics?.channelMix ?? { inbound: 0, outbound: 0 };
  const opMax = Math.max(1, ...(analytics?.operationTypes ?? []).map((item) => item.total));
  const topProfiles = analytics?.profiles.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Analytics" title="Platform performance" subtitle={`Workspace focus: ${tenant?.domainFocus ?? "workspace"}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Completion rate" value={pct(totals?.completionRate ?? 0)} />
        <MetricCard label="Escalation rate" value={pct(totals?.escalationRate ?? 0)} />
        <MetricCard label="Active sessions" value={String(totals?.activeSessions ?? 0)} />
        <MetricCard label="Operations" value={String(totals?.totalOperations ?? 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <Eyebrow>Channel mix</Eyebrow>
            <h3 className="text-lg font-semibold">Inbound vs outbound</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-primary"><PhoneCall className="h-4 w-4" /> <span className="text-sm font-medium">Inbound</span></div>
                <strong className="mt-2 block text-2xl">{channel.inbound}</strong>
              </div>
              <div className="rounded-2xl bg-accent/40 p-4">
                <div className="flex items-center gap-2 text-amber-700"><PhoneOutgoing className="h-4 w-4" /> <span className="text-sm font-medium">Outbound</span></div>
                <strong className="mt-2 block text-2xl">{channel.outbound}</strong>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <Eyebrow>Operations</Eyebrow>
            <h3 className="text-lg font-semibold">By type</h3>
            <div className="space-y-3">
              {(analytics?.operationTypes ?? []).filter((item) => item.total > 0).length === 0 ? (
                <p className="text-sm text-muted-foreground">No operations recorded yet.</p>
              ) : (
                (analytics?.operationTypes ?? []).filter((item) => item.total > 0).map((item) => (
                  <DistributionRow key={item.type} label={formatLabel(item.type)} total={item.total} max={opMax} />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <Eyebrow>Pipeline</Eyebrow>
            <h3 className="text-lg font-semibold">Follow-up & outcomes</h3>
            <div className="grid gap-2">
              {(analytics?.followUpStatuses ?? []).map((item) => (
                <div key={item.status} className="flex items-center justify-between rounded-xl bg-secondary/40 px-4 py-2 text-sm">
                  <span className="capitalize">{formatLabel(item.status)}</span>
                  <span className="text-muted-foreground">{item.totalSessions}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <Eyebrow>Daily handoff</Eyebrow>
            <h3 className="text-lg font-semibold">Tenant report</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile label="Report date" value={dailyReport?.date ?? "—"} />
              <StatTile label="Sessions" value={String(dailyReport?.totals.totalSessions ?? 0)} />
              <StatTile label="Open follow-ups" value={String(dailyReport?.totals.openFollowUps ?? 0)} />
              <StatTile label="Operations" value={String(dailyReport?.operations.length ?? 0)} />
            </div>
            <p className="rounded-xl bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
              {dailyReport ? `${dailyReport.records.length} records · generated ${new Date(dailyReport.generatedAt).toLocaleString()}. Build & download from Call records.` : "Build a report from the Call records screen to prepare a handoff."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <Eyebrow>Leaderboard</Eyebrow>
          <h3 className="text-lg font-semibold">Top agents</h3>
          <div className="grid gap-3">
            {topProfiles.length === 0 ? (
              <p className="rounded-xl bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">Run sessions to populate analytics.</p>
            ) : (
              topProfiles.map((profile) => (
                <div key={profile.profileId} className="flex flex-col gap-2 rounded-2xl border border-border bg-white/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <strong>{profile.profileName}</strong>
                    <p className="text-sm text-muted-foreground">{profile.domain} · {profile.workflow}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{profile.totalSessions} sessions</Badge>
                    <Badge variant="success">{pct(profile.completionRate)} done</Badge>
                    <Badge variant="muted">{profile.averageTurnCount} turns</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
