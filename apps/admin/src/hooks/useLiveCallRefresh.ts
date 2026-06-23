import { useEffect } from "react";

/**
 * Re-run `refresh` immediately on mount and whenever a call changes — same tab (the `va:call-changed`
 * event fired by the call socket), another tab (the `va_call_changed` storage key), or when the tab
 * regains focus. Lets records/operations screens reflect a completed call without a manual reload.
 */
export function useLiveCallRefresh(refresh: () => void) {
  useEffect(() => {
    refresh();
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 100);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "va_call_changed") schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule();
    };
    window.addEventListener("va:call-changed", schedule);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("va:call-changed", schedule);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);
}
