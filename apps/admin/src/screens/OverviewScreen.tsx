import { ArrowRight, BarChart3, Bot, CalendarCheck, CheckCircle2, PhoneCall, Rocket, UserPlus } from "lucide-react";
import { useAppDispatch } from "../app/hooks";
import { useWorkspace } from "../hooks/useWorkspace";
import { setActiveScreen } from "../features/platform/platformSlice";
import type { Screen } from "../features/platform/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, MetricCard } from "../components/common";

const WORKFLOW_STEPS = [
  { screen: "onboard" as Screen, label: "Register client", icon: UserPlus, blurb: "Create a workspace + pick a use case" },
  { screen: "build" as Screen, label: "Build agent", icon: Bot, blurb: "Customize prompts, questions, data fields" },
  { screen: "assign" as Screen, label: "Deploy agent", icon: Rocket, blurb: "Make the agent live for calls" },
  { screen: "call" as Screen, label: "Take calls", icon: PhoneCall, blurb: "Inbound & outbound browser calls" },
  { screen: "operations" as Screen, label: "Run operations", icon: CalendarCheck, blurb: "Appointments, enquiries, routing" },
  { screen: "analytics" as Screen, label: "Review analytics", icon: BarChart3, blurb: "Outcomes, reports, performance" }
];

export function OverviewScreen() {
  const dispatch = useAppDispatch();
  const { tenant, platform } = useWorkspace();
  const totals = platform.analytics?.totals;
  const deployedAgents = platform.profiles.filter((profile) => profile.status !== "draft").length;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-6 p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <Eyebrow>Multi-purpose AI calling platform</Eyebrow>
            <h2 className="mt-2 font-display text-3xl leading-tight md:text-4xl">{tenant?.name ?? "Workspace"}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {tenant?.description ?? "Register a client, customize a voice agent for healthcare, education, or front-desk use cases, deploy it, and let customers call in or be dialed out — every completed call becomes a real operation."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => dispatch(setActiveScreen("onboard"))}>
                <UserPlus className="h-4 w-4" /> Onboard a client
              </Button>
              <Button variant="outline" onClick={() => dispatch(setActiveScreen("call"))}>
                <PhoneCall className="h-4 w-4" /> Open call console
              </Button>
            </div>
          </div>
          <div className="grid min-w-[240px] gap-3 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/40 p-5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Active workspace</span>
            <strong className="text-2xl">{tenant?.name ?? "Loading"}</strong>
            <Badge variant="secondary" className="w-fit capitalize">{tenant?.domainFocus ?? "workspace"}</Badge>
            <span className="text-sm text-muted-foreground">{platform.profiles.length} agents · {deployedAgents} deployed</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total sessions" value={String(totals?.totalSessions ?? 0)} />
        <MetricCard label="Completed" value={String(totals?.completedSessions ?? 0)} hint={`${Math.round((totals?.completionRate ?? 0) * 100)}% completion`} />
        <MetricCard label="Operations created" value={String(totals?.totalOperations ?? 0)} />
        <MetricCard label="Inbound / Outbound" value={`${totals?.inboundSessions ?? 0} / ${totals?.outboundSessions ?? 0}`} />
      </div>

      <Card>
        <CardContent className="p-6">
          <Eyebrow>Workflow</Eyebrow>
          <h3 className="mt-1 text-xl font-semibold">From onboarding to operations</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {WORKFLOW_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <button
                  key={step.screen}
                  type="button"
                  onClick={() => dispatch(setActiveScreen(step.screen))}
                  className="group flex items-start gap-3 rounded-2xl border border-border bg-white/60 p-4 text-left transition hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Step {index + 1}</span>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/70" />
                    </div>
                    <p className="font-medium">{step.label}</p>
                    <p className="text-sm text-muted-foreground">{step.blurb}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
