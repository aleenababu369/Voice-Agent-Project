import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import {
  clearPlatformError,
  clearPlatformNotice,
  fetchAnalytics,
  fetchCampaigns,
  fetchDailyReport,
  fetchOperations,
  fetchProfiles,
  fetchProspects,
  fetchSessions,
  fetchTemplates
} from "../../features/platform/platformSlice";

export function AppShell() {
  const dispatch = useAppDispatch();
  const accountId = useAppSelector((state) => state.auth.account?.id);
  const error = useAppSelector((state) => state.platform.error);
  const notice = useAppSelector((state) => state.platform.notice);

  useEffect(() => {
    if (!accountId) return;
    void dispatch(fetchTemplates());
    void dispatch(fetchProfiles());
    void dispatch(fetchSessions());
    void dispatch(fetchOperations());
    void dispatch(fetchProspects());
    void dispatch(fetchCampaigns());
    void dispatch(fetchAnalytics());
    void dispatch(fetchDailyReport(undefined));
  }, [dispatch, accountId]);

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 px-4 py-6 md:px-6">
          {error ? (
            <div className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{error}</span>
              <button type="button" onClick={() => dispatch(clearPlatformError())} className="rounded-full p-1 hover:bg-red-100"><X className="h-4 w-4" /></button>
            </div>
          ) : null}
          {notice ? (
            <div className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-foreground">
              <span>{notice}</span>
              <button type="button" onClick={() => dispatch(clearPlatformNotice())} className="rounded-full p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
          ) : null}
          <div className="mx-auto w-full max-w-[1280px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
