import { useAppSelector } from "../../app/hooks";
import { useWorkspace } from "../../hooks/useWorkspace";
import type { Screen } from "../../features/platform/types";
import type { CallPhase } from "../../features/demo/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SCREEN_TITLES: Record<Screen, string> = {
  home: "Overview",
  onboard: "Onboard a client",
  build: "Build agent",
  assign: "Assign & deploy",
  call: "Call console",
  records: "Call records",
  operations: "Operations",
  analytics: "Analytics & reports",
  settings: "Settings"
};

const PHASE_LABEL: Record<CallPhase, string> = {
  idle: "Idle",
  dialing: "Dialing",
  ringing: "Ringing",
  consent: "Awaiting consent",
  listening: "Listening",
  thinking: "Understanding caller",
  speaking: "Agent speaking",
  completed: "Workflow completed",
  escalated: "Escalated to human"
};

function phaseDot(phase: CallPhase) {
  if (phase === "speaking") return "bg-amber-500";
  if (phase === "thinking") return "bg-sky-500";
  if (phase === "completed") return "bg-emerald-500";
  if (phase === "escalated") return "bg-rose-500";
  if (phase === "idle") return "bg-stone-400";
  return "bg-primary";
}

export function TopBar() {
  const { tenant } = useWorkspace();
  const activeScreen = useAppSelector((state) => state.platform.activeScreen);
  const callPhase = useAppSelector((state) => state.demo.callPhase);

  return (
    <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-border/70 bg-background/70 px-6 py-4 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{tenant?.name ?? "Workspace"}</p>
        <h1 className="text-xl font-semibold tracking-tight">{SCREEN_TITLES[activeScreen]}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {tenant ? <Badge variant="secondary" className="capitalize">{tenant.domainFocus}</Badge> : null}
        <div className="flex items-center gap-2 rounded-full border border-border bg-white/70 px-3 py-1.5 text-sm">
          <span className={cn("h-2.5 w-2.5 rounded-full", phaseDot(callPhase))} />
          <span className="text-muted-foreground">{PHASE_LABEL[callPhase]}</span>
        </div>
      </div>
    </header>
  );
}
