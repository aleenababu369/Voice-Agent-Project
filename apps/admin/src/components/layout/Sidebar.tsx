import {
  BarChart3,
  Bot,
  CalendarCheck,
  ClipboardList,
  LayoutDashboard,
  PhoneCall,
  Rocket,
  Settings as SettingsIcon,
  UserPlus,
  Waypoints
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppDispatch } from "../../app/hooks";
import { useWorkspace } from "../../hooks/useWorkspace";
import { selectTenant, setActiveScreen } from "../../features/platform/platformSlice";
import type { Screen } from "../../features/platform/types";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface NavItem {
  screen: Screen;
  label: string;
  icon: LucideIcon;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [
      { screen: "home", label: "Overview", icon: LayoutDashboard },
      { screen: "onboard", label: "Onboard client", icon: UserPlus }
    ]
  },
  {
    label: "Agent",
    items: [
      { screen: "build", label: "Build agent", icon: Bot },
      { screen: "assign", label: "Assign & deploy", icon: Rocket }
    ]
  },
  {
    label: "Operations",
    items: [
      { screen: "call", label: "Call console", icon: PhoneCall },
      { screen: "records", label: "Call records", icon: ClipboardList },
      { screen: "operations", label: "Operations", icon: CalendarCheck },
      { screen: "analytics", label: "Analytics", icon: BarChart3 }
    ]
  }
];

export function Sidebar() {
  const dispatch = useAppDispatch();
  const { platform, tenant, actor } = useWorkspace();
  const active = platform.activeScreen;

  return (
    <aside className="sticky top-0 flex h-screen w-[270px] shrink-0 flex-col gap-5 border-r border-sidebar-border bg-sidebar/95 px-4 py-6 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Waypoints className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Voice Agent</p>
          <p className="text-xs text-muted-foreground">Control Center</p>
        </div>
      </div>

      <div className="grid gap-1.5 px-1">
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace</span>
        <Select value={tenant?.id ?? ""} onValueChange={(value) => dispatch(selectTenant(value))}>
          <SelectTrigger className="bg-white/70">
            <SelectValue placeholder="Select workspace" />
          </SelectTrigger>
          <SelectContent>
            {platform.tenants.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.screen;
              return (
                <button
                  key={item.screen}
                  type="button"
                  onClick={() => dispatch(setActiveScreen(item.screen))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/70",
                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_rgba(15,118,110,0.18)]"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-2 px-1">
        <button
          type="button"
          onClick={() => dispatch(setActiveScreen("settings"))}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/70",
            active === "settings" && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
        >
          <SettingsIcon className="h-4 w-4 text-muted-foreground" />
          Settings
        </button>
        <div className="rounded-xl border border-sidebar-border bg-white/60 px-3 py-2.5">
          <p className="text-sm font-medium">{actor?.name ?? "No admin"}</p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={actor?.role === "admin" ? "default" : actor?.role === "editor" ? "accent" : "muted"}>
              {actor?.role ?? "viewer"}
            </Badge>
            <span className="text-xs text-muted-foreground">{actor?.scope ?? "scope"}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
