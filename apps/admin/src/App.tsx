import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "./app/hooks";
import { fetchDemoConfig, fetchMetrics, resetDemoWorkspace } from "./features/demo/demoSlice";
import {
  fetchAnalytics,
  fetchContacts,
  fetchDailyReport,
  fetchOperations,
  fetchProfiles,
  fetchSessions,
  fetchTemplates,
  fetchTenants,
  fetchUsers
} from "./features/platform/platformSlice";
import { DashboardLayout } from "./components/layout/DashboardLayout";

function App() {
  const dispatch = useAppDispatch();
  const selectedTenantId = useAppSelector((state) => state.platform.selectedTenantId);

  useEffect(() => {
    void dispatch(fetchTenants());
    void dispatch(fetchTemplates());
  }, [dispatch]);

  useEffect(() => {
    if (!selectedTenantId) return;
    dispatch(resetDemoWorkspace());
    void dispatch(fetchUsers());
    void dispatch(fetchProfiles());
    void dispatch(fetchSessions());
    void dispatch(fetchOperations());
    void dispatch(fetchContacts());
    void dispatch(fetchAnalytics());
    void dispatch(fetchDailyReport(undefined));
    void dispatch(fetchDemoConfig());
    void dispatch(fetchMetrics());
  }, [dispatch, selectedTenantId]);

  return <DashboardLayout />;
}

export default App;
