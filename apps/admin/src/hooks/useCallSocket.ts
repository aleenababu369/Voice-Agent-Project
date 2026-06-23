import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSelector } from "../app/hooks";

export interface CallMessage {
  id: number;
  role: "agent" | "caller" | "system";
  text: string;
}

interface ConfirmingSlot {
  slotKey: string;
  value: string;
  confidence: number;
}

interface CallSocketState {
  connected: boolean;
  messages: CallMessage[];
  needsConsent: boolean;
  done: boolean;
  lastAgentReply: string;
  /** Uncertainty-aware dialogue management: what grounding action the agent just took. */
  lastAction: string | null;
  lastConfidence: number | null;
  confirming: ConfirmingSlot | null;
  /** Live session language — switches mid-call when the agent detects the caller's language. */
  sessionLanguage: string | null;
}

/** Read long digit runs (phone numbers) one digit at a time instead of as a huge cardinal number. */
function formatForSpeech(text: string): string {
  return text.replace(/\d[\d\s-]{5,}\d/g, (run) => {
    const digits = run.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 13 ? digits.split("").join(" ") : run;
  });
}

function speakText(text: string, lang: string) {
  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(formatForSpeech(text));
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  } catch {
    // ignore
  }
}

const CALL_CHANGED_EVENT = "va:call-changed";
const CALL_CHANGED_STORAGE_KEY = "va_call_changed";

/** Notify record/analytics screens immediately, including admin screens open in another tab. */
function notifyCallChanged(sessionId: string) {
  if (typeof window === "undefined") return;
  const detail = { sessionId, changedAt: Date.now() };
  window.dispatchEvent(new CustomEvent(CALL_CHANGED_EVENT, { detail }));
  try { window.localStorage.setItem(CALL_CHANGED_STORAGE_KEY, JSON.stringify(detail)); } catch { /* storage may be disabled */ }
}

export function useCallSocket(options: { sessionId: string | null; role: "agent" | "softphone"; speak?: boolean }) {
  const { sessionId, role } = options;
  const speak = options.speak ?? role === "softphone";
  const baseUrl = useAppSelector((state) => state.demo.apiBaseUrl);
  const language = useAppSelector((state) => state.demo.selectedLanguage);
  const wsRef = useRef<WebSocket | null>(null);
  const counter = useRef(0);
  const [state, setState] = useState<CallSocketState>({ connected: false, messages: [], needsConsent: false, done: false, lastAgentReply: "", lastAction: null, lastConfidence: null, confirming: null, sessionLanguage: null });

  const push = useCallback((role: CallMessage["role"], text: string) => {
    counter.current += 1;
    const id = counter.current;
    setState((current) => ({ ...current, messages: [...current.messages, { id, role, text }] }));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const wsUrl = `${baseUrl.replace(/^http/, "ws")}/v1/calls/ws?session=${sessionId}&role=${role}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return;
    }
    wsRef.current = ws;
    ws.onopen = () => setState((current) => ({ ...current, connected: true }));
    ws.onclose = () => setState((current) => ({ ...current, connected: false }));
    ws.onmessage = (event) => {
      let message: {
        type?: string;
        reply?: string;
        text?: string;
        needsConsent?: boolean;
        done?: boolean;
        decision?: { action?: string; confidence?: number; confirming?: ConfirmingSlot | null };
        session?: { language?: string };
      };
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      // The session payload (joined / agent_reply / session_update) carries the live language, which may switch mid-call.
      if (message.session?.language) {
        const nextLanguage = message.session.language;
        setState((current) => (current.sessionLanguage === nextLanguage ? current : { ...current, sessionLanguage: nextLanguage }));
      }
      if (message.type === "agent_reply" && typeof message.reply === "string") {
        push("agent", message.reply);
        if (speak) speakText(message.reply, language);
        const decision = message.decision;
        setState((current) => ({
          ...current,
          needsConsent: Boolean(message.needsConsent),
          done: Boolean(message.done),
          lastAgentReply: message.reply as string,
          lastAction: decision?.action ?? current.lastAction,
          lastConfidence: typeof decision?.confidence === "number" ? decision.confidence : current.lastConfidence,
          confirming: decision?.action === "confirm_slot" ? (decision.confirming ?? null) : null
        }));
        if (message.session) notifyCallChanged(sessionId);
      } else if (message.type === "caller_said" && typeof message.text === "string") {
        push("caller", message.text);
      } else if (message.type === "ended") {
        setState((current) => ({ ...current, done: true }));
        notifyCallChanged(sessionId);
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, role, baseUrl]);

  const sendUtterance = useCallback((text: string, asrConfidence?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && text.trim()) {
      const payload: { type: string; text: string; asrConfidence?: number } = { type: "prospect_utterance", text };
      if (typeof asrConfidence === "number" && asrConfidence > 0) payload.asrConfidence = asrConfidence;
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const grantConsent = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "consent", granted: true }));
    }
  }, []);

  const end = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end" }));
    }
  }, []);

  return { ...state, sendUtterance, grantConsent, end };
}
