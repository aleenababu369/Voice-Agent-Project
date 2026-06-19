import { LogOut, PanelLeft } from "lucide-react";
import { useAppDispatch } from "../../app/hooks";
import { useAccount } from "../../hooks/useAccount";
import { toggleSidebar } from "../../features/ui/uiSlice";
import { logout } from "../../features/auth/authSlice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function TopBar() {
  const dispatch = useAppDispatch();
  const { account } = useAccount();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Toggle sidebar" onClick={() => dispatch(toggleSidebar())}>
          <PanelLeft className="h-5 w-5" />
        </Button>
        <span className="font-display text-lg font-semibold tracking-tight">Voice Agent Platform</span>
      </div>
      <div className="flex items-center gap-3">
        {account ? (
          <div className="hidden items-center gap-2 sm:flex">
            <Badge variant="secondary" className="capitalize">{account.useCase ?? "workspace"}</Badge>
            <span className="text-sm text-muted-foreground">{account.name}</span>
          </div>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => dispatch(logout())}>
          <LogOut className="h-4 w-4" /> Logout
        </Button>
      </div>
    </header>
  );
}
