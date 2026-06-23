import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { useAppSelector } from "./hooks";
import { AppShell } from "../components/layout/AppShell";
import { LoginPage } from "../pages/auth/LoginPage";
import { SignupPage } from "../pages/auth/SignupPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { OverviewPage } from "../pages/OverviewPage";
import { AgentsListPage } from "../pages/agents/AgentsListPage";
import { AgentConfigPage } from "../pages/agents/AgentConfigPage";
import { CampaignsListPage } from "../pages/campaigns/CampaignsListPage";
import { CampaignDetailPage } from "../pages/campaigns/CampaignDetailPage";
import { ProspectsListPage } from "../pages/prospects/ProspectsListPage";
import { ProspectDetailPage } from "../pages/prospects/ProspectDetailPage";
import { CallHistoryPage } from "../pages/calls/CallHistoryPage";
import { CallDetailPage } from "../pages/calls/CallDetailPage";
import { OperationsListPage } from "../pages/operations/OperationsListPage";
import { OperationDetailPage } from "../pages/operations/OperationDetailPage";
import { KnowledgeBasePage } from "../pages/knowledge/KnowledgeBasePage";
import { AnalyticsPage } from "../pages/AnalyticsPage";
import { CallConsolePage } from "../pages/CallConsolePage";
import { SettingsPage } from "../pages/SettingsPage";
import { SoftphonePage } from "../pages/SoftphonePage";
import { DialerPage } from "../pages/DialerPage";

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>
  );
}

function ProtectedLayout() {
  const { status, account } = useAppSelector((state) => state.auth);
  if (status === "loading") return <Splash />;
  if (status !== "authenticated" || !account) return <Navigate to="/login" replace />;
  if (!account.useCase) return <Navigate to="/onboarding" replace />;
  return <AppShell />;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const status = useAppSelector((state) => state.auth.status);
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function OnboardingGate() {
  const { status, account } = useAppSelector((state) => state.auth);
  if (status === "loading") return <Splash />;
  if (status !== "authenticated" || !account) return <Navigate to="/login" replace />;
  if (account.useCase) return <Navigate to="/" replace />;
  return <OnboardingPage />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <PublicOnly><LoginPage /></PublicOnly> },
  { path: "/signup", element: <PublicOnly><SignupPage /></PublicOnly> },
  { path: "/onboarding", element: <OnboardingGate /> },
  { path: "/call", element: <DialerPage /> },
  { path: "/softphone", element: <SoftphonePage /> },
  {
    path: "/",
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "agents", element: <AgentsListPage /> },
      { path: "agents/:agentId", element: <AgentConfigPage /> },
      { path: "knowledge", element: <KnowledgeBasePage /> },
      { path: "campaigns", element: <CampaignsListPage /> },
      { path: "campaigns/:campaignId", element: <CampaignDetailPage /> },
      { path: "prospects", element: <ProspectsListPage /> },
      { path: "prospects/:prospectId", element: <ProspectDetailPage /> },
      { path: "calls", element: <CallHistoryPage /> },
      { path: "calls/:callId", element: <CallDetailPage /> },
      { path: "operations", element: <OperationsListPage /> },
      { path: "operations/:operationId", element: <OperationDetailPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
      { path: "console", element: <CallConsolePage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> }
]);

export { Outlet };
