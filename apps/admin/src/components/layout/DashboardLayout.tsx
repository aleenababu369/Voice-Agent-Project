import { X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { clearError } from "../../features/demo/demoSlice";
import { clearPlatformError, clearPlatformNotice } from "../../features/platform/platformSlice";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ScreenRouter } from "./ScreenRouter";

export function DashboardLayout() {
  const dispatch = useAppDispatch();
  const error = useAppSelector((state) => state.platform.error ?? state.demo.error);
  const notice = useAppSelector((state) => state.platform.notice);

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 px-6 py-6">
          {error ? (
            <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <span>{error}</span>
              <button type="button" onClick={() => { dispatch(clearError()); dispatch(clearPlatformError()); }} className="rounded-full p-1 hover:bg-rose-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          {notice ? (
            <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <span>{notice}</span>
              <button type="button" onClick={() => dispatch(clearPlatformNotice())} className="rounded-full p-1 hover:bg-emerald-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <div className="mx-auto w-full max-w-[1240px]">
            <ScreenRouter />
          </div>
        </main>
      </div>
    </div>
  );
}
