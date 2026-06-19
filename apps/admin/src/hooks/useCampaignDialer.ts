import { useCallback, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { createApiClient } from "../features/demo/demoApi";
import {
  dialerMarkResult,
  dialerSetCurrent,
  dialerStart,
  dialerStop,
  dialerReset,
  fetchAnalytics,
  fetchCampaignDetail,
  fetchOperations,
  fetchSessions
} from "../features/platform/platformSlice";

function speak(text: string | undefined, lang: string) {
  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  } catch {
    // speech synthesis unavailable; ignore.
  }
}

export function useCampaignDialer() {
  const dispatch = useAppDispatch();
  const baseUrl = useAppSelector((state) => state.demo.apiBaseUrl);
  const token = useAppSelector((state) => state.auth.token);
  const language = useAppSelector((state) => state.demo.selectedLanguage);
  const dialer = useAppSelector((state) => state.platform.dialer);
  const stoppedRef = useRef(false);

  const run = useCallback(
    async (campaignId: string, prospectIds: string[]) => {
      if (prospectIds.length === 0) return;
      stoppedRef.current = false;
      dispatch(dialerStart({ campaignId, queue: prospectIds }));
      const api = createApiClient(baseUrl, token);

      for (const prospectId of prospectIds) {
        if (stoppedRef.current) break;
        dispatch(dialerSetCurrent(prospectId));
        try {
          const place = await api.post<{ session: { id: string } }>(`/v1/campaigns/${campaignId}/calls/place`, { prospectId });
          const sessionId = place.data.session.id;
          let done = false;
          let guard = 0;
          while (!done && guard < 8 && !stoppedRef.current) {
            const turn = await api.post<{ done: boolean; decision?: { responseText?: string } }>(`/v1/campaigns/${campaignId}/calls/${sessionId}/auto-turn`, {});
            speak(turn.data.decision?.responseText, language);
            done = turn.data.done;
            guard += 1;
          }
          dispatch(dialerMarkResult({ prospectId, ok: done }));
        } catch {
          dispatch(dialerMarkResult({ prospectId, ok: false }));
        }
      }

      dispatch(dialerSetCurrent(null));
      await Promise.all([
        dispatch(fetchCampaignDetail(campaignId)),
        dispatch(fetchOperations()),
        dispatch(fetchSessions()),
        dispatch(fetchAnalytics())
      ]);
    },
    [baseUrl, token, language, dispatch]
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    dispatch(dialerStop());
  }, [dispatch]);

  const reset = useCallback(() => dispatch(dialerReset()), [dispatch]);

  return { dialer, run, stop, reset };
}
