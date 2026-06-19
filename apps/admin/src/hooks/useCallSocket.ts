import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSelector } from "../app/hooks";

export interface CallMessage {
  id: number;
  role: "agent" | "caller" | "system";
  text: string;
}

interface CallSocketState {
  connected: boolean;
  messages: CallMessage[];
  needsConsent: boolean;
  done: boolean;
  lastAgentReply: string;
}

function speakText(text: string, lang: string) {
  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  } catch {
    // ignore
  }
}

export function useCallSocket(options: { sessionId: string | null; role: "agent" | "softphone"; speak?: boolean }) {
  const { sessionId, role } = options;
  const speak = options.speak ?? role === "softphone";
  const baseUrl = useAppSelector((state) => state.demo.apiBaseUrl);
  const language = useAppSelector((state) => state.demo.selectedLanguage);
  const wsRef = useRef<WebSocket | null>(null);
  const counter = useRef(0);
  const [state, setState] = useState<CallSocketState>({ connected: false, messages: [], needsConsent: false, done: false, lastAgentReply: "" });

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
      let message: { type?: string; reply?: string; text?: string; needsConsent?: boolean; done?: boolean };
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "agent_reply" && typeof message.reply === "string") {
        push("agent", message.reply);
        if (speak) speakText(message.reply, language);
        setState((current) => ({ ...current, needsConsent: Boolean(message.needsConsent), done: Boolean(message.done), lastAgentReply: message.reply as string }));
      } else if (message.type === "caller_said" && typeof message.text === "string") {
        push("caller", message.text);
      } else if (message.type === "ended") {
        setState((current) => ({ ...current, done: true }));
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, role, baseUrl]);

  const sendUtterance = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && text.trim()) {
      wsRef.current.send(JSON.stringify({ type: "prospect_utterance", text }));
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
