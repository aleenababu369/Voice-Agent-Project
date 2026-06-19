import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Bot, Megaphone, PhoneCall, Users } from "lucide-react";
import { useAppSelector } from "../app/hooks";
import { useAccount } from "../hooks/useAccount";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, MetricCard } from "../components/common";

const STEPS = [
  { to: "/agents", label: "Build & deploy agents", icon: Bot, blurb: "Configure prompts, questions, and data to collect" },
  { to: "/prospects", label: "Add prospects", icon: Users, blurb: "The people the agent will talk to" },
  { to: "/campaigns", label: "Run campaigns", icon: Megaphone, blurb: "Auto-dial prospects or take inbound calls" },
  { to: "/console", label: "Live call console", icon: PhoneCall, blurb: "Place a call & answer in a softphone tab" },
  { to: "/calls", label: "Call records", icon: BarChart3, blurb: "Per-call analytics, transcripts, collected data" }
];

export function OverviewPage() {
  const { account } = useAccount();
  const totals = useAppSelector((state) => state.platform.analytics?.totals);
  const profiles = useAppSelector((state) => state.platform.profiles);
  const deployed = profiles.filter((profile) => profile.status !== "draft").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-6 p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <Eyebrow>Overview</Eyebrow>
            <h2 className="mt-2 font-display text-3xl font-semibold">{account?.name}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">Build a voice agent, add prospects, run inbound/outbound campaigns, and every completed call becomes a real operation — an appointment booked, an enquiry logged, a visitor routed.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild><Link to="/console"><PhoneCall className="h-4 w-4" /> Open call console</Link></Button>
              <Button variant="outline" asChild><Link to="/campaigns"><Megaphone className="h-4 w-4" /> Campaigns</Link></Button>
            </div>
          </div>
          <div className="grid min-w-[220px] gap-2 rounded-xl border border-border bg-secondary/60 p-5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</span>
            <strong className="text-xl">{account?.name}</strong>
            <Badge variant="secondary" className="w-fit capitalize">{account?.useCase ?? "workspace"}</Badge>
            <span className="text-sm text-muted-foreground">{profiles.length} agents · {deployed} deployed</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total calls" value={String(totals?.totalSessions ?? 0)} />
        <MetricCard label="Operations" value={String(totals?.totalOperations ?? 0)} />
        <MetricCard label="Prospects" value={String(totals?.totalProspects ?? 0)} />
        <MetricCard label="Inbound / Outbound" value={`${totals?.inboundSessions ?? 0} / ${totals?.outboundSessions ?? 0}`} />
      </div>

      <Card>
        <CardContent className="p-6">
          <Eyebrow>Get started</Eyebrow>
          <h3 className="mt-1 text-xl font-semibold">Your workflow</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <Link key={step.to} to={step.to} className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:bg-secondary/50">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-muted-foreground">Step {index + 1}</span>
                    <p className="font-medium">{step.label}</p>
                    <p className="text-sm text-muted-foreground">{step.blurb}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
