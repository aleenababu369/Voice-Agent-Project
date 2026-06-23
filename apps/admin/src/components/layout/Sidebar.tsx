import { NavLink } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Bot,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  Megaphone,
  PhoneCall,
  Settings as SettingsIcon,
  Users,
  Waypoints
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppSelector } from "../../app/hooks";
import { useAccount } from "../../hooks/useAccount";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: "Workspace", items: [{ to: "/", label: "Overview", icon: LayoutDashboard, end: true }, { to: "/analytics", label: "Analytics", icon: BarChart3 }] },
  { group: "Build", items: [{ to: "/agents", label: "Agents", icon: Bot }, { to: "/knowledge", label: "Knowledge base", icon: BookOpen }] },
  { group: "Run", items: [{ to: "/campaigns", label: "Campaigns", icon: Megaphone }, { to: "/prospects", label: "Prospects", icon: Users }, { to: "/console", label: "Call console", icon: PhoneCall }] },
  { group: "Records", items: [{ to: "/operations", label: "Operations", icon: ClipboardCheck }, { to: "/calls", label: "Call history", icon: ClipboardList }] }
];

export function Sidebar() {
  const open = useAppSelector((state) => state.ui.sidebarOpen);
  const { account } = useAccount();

  return (
    <aside className={cn("sticky top-0 flex h-screen shrink-0 flex-col gap-5 border-r border-border bg-sidebar/95 py-5 backdrop-blur-xl transition-all", open ? "w-[256px] px-4" : "w-[72px] px-2")}>
      <div className={cn("flex items-center gap-3", open ? "px-2" : "justify-center")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Waypoints className="h-5 w-5" />
        </div>
        {open ? (
          <div className="leading-tight">
            <p className="text-sm font-semibold">Voice Agent</p>
            <p className="text-xs text-muted-foreground">Control Center</p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto">
        {NAV.map((section) => (
          <div key={section.group} className="space-y-1">
            {open ? <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">{section.group}</p> : null}
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  className={({ isActive }) => cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent",
                    !open && "justify-center px-0",
                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {open ? item.label : null}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <NavLink
        to="/settings"
        title="Settings"
        className={({ isActive }) => cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent",
          !open && "justify-center px-0",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <SettingsIcon className="h-4 w-4 shrink-0" />
        {open ? "Settings" : null}
      </NavLink>

      {open && account ? (
        <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="truncate text-xs capitalize text-muted-foreground">{account.useCase ?? "workspace"}</p>
        </div>
      ) : null}
    </aside>
  );
}
