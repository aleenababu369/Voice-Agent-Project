import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Mic, MicOff, PhoneOff, ShieldCheck, Volume2, Waypoints } from "lucide-react";
import { useAppSelector } from "../app/hooks";
import { useCallSocket } from "../hooks/useCallSocket";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface RecognitionResult { 0: { transcript: string }; isFinal: boolean }
interface RecognitionEvent { results: ArrayLike<RecognitionResult> }
interface RecognitionError { error: string }
interface RecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: RecognitionError) => void) | null;
}
type RecognitionCtor = new () => RecognitionInstance;

type Phase = "connecting" | "ringing" | "agent" | "listening" | "thinking" | "ended";

export function SoftphonePage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session");
  const language = useAppSelector((state) => state.demo.selectedLanguage);
  // The page owns text-to-speech so it knows exactly when the agent finished talking (to open the mic).
  const call = useCallSocket({ sessionId, role: "softphone", speak: false });

  const [phase, setPhase] = useState<Phase>("connecting");
  const [answered, setAnswered] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const lastSpokenIdRef = useRef(0);
  const answeredRef = useRef(false);
  const mutedRef = useRef(false);
  const doneRef = useRef(false);
  const userTurnRef = useRef(false);
  const gotResultRef = useRef(false);
  const sendRef = useRef(call.sendUtterance);

  useEffect(() => { answeredRef.current = answered; }, [answered]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { doneRef.current = call.done; sendRef.current = call.sendUtterance; }, [call.done, call.sendUtterance]);
  useEffect(() => { if (call.done) setPhase("ended"); }, [call.done]);
  useEffect(() => { if (call.connected && phase === "connecting") setPhase("ringing"); }, [call.connected, phase]);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || mutedRef.current || doneRef.current || !answeredRef.current) return;
    userTurnRef.current = true;
    gotResultRef.current = false;
    try {
      recognition.start();
    } catch {
      // start() throws if already running — safe to ignore.
    }
  }, []);

  const speak = useCallback((text: string, thenListen: boolean) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      if (thenListen) startListening();
      return;
    }
    setPhase("agent");
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    let handled = false;
    const proceed = () => {
      if (handled) return;
      handled = true;
      if (thenListen && !doneRef.current) startListening();
      else if (!thenListen) setPhase(doneRef.current ? "ended" : "ringing");
    };
    const fallback = window.setTimeout(proceed, Math.max(3000, text.length * 90));
    utterance.onend = () => { window.clearTimeout(fallback); proceed(); };
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      window.clearTimeout(fallback);
      proceed();
    }
  }, [language, startListening]);

  // Set up speech recognition once.
  useEffect(() => {
    const Ctor = (window as typeof window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
      ?? (window as typeof window & { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;
    if (!Ctor) {
      setMicNote("Microphone isn't supported in this browser — type your replies instead.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setPhase("listening");
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last?.[0]?.transcript ?? "";
      if (text.trim()) {
        gotResultRef.current = true;
        userTurnRef.current = false;
        setPhase("thinking");
        sendRef.current(text.trim());
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicNote("Microphone blocked. Allow mic access, or type your replies.");
        mutedRef.current = true;
        setMuted(true);
      }
    };
    recognition.onend = () => {
      // Keep the mic open during the user's turn if they stayed silent; otherwise it's the agent's turn now.
      if (!gotResultRef.current && userTurnRef.current && answeredRef.current && !mutedRef.current && !doneRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };
    recognitionRef.current = recognition;
    return () => { try { recognition.abort(); } catch { /* ignore */ } };
  }, [language]);

  // When a new agent message arrives, speak it — and after speaking, auto-open the mic (once answered).
  useEffect(() => {
    let lastAgent: { id: number; text: string } | undefined;
    for (let i = call.messages.length - 1; i >= 0; i -= 1) {
      if (call.messages[i].role === "agent") { lastAgent = call.messages[i]; break; }
    }
    if (!lastAgent || lastAgent.id === lastSpokenIdRef.current) return;
    lastSpokenIdRef.current = lastAgent.id;
    speak(lastAgent.text, answeredRef.current && !call.done);
  }, [call.messages, call.done, speak]);

  function answerCall() {
    setAnswered(true);
    answeredRef.current = true;
    call.grantConsent();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    if (next) {
      try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    } else if (userTurnRef.current) {
      startListening();
    }
  }

  function sendTyped() {
    if (!input.trim()) return;
    userTurnRef.current = false;
    gotResultRef.current = true;
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    setPhase("thinking");
    call.sendUtterance(input.trim());
    setInput("");
  }

  function hangUp() {
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    call.end();
  }

  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div className="space-y-2">
          <Waypoints className="mx-auto h-8 w-8" />
          <h1 className="text-xl font-semibold">No active call</h1>
          <p className="text-sm text-muted-foreground">Open a softphone link from the Call console to answer a call.</p>
        </div>
      </div>
    );
  }

  const statusLabel: Record<Phase, string> = {
    connecting: "Connecting…",
    ringing: "Incoming call",
    agent: "Agent speaking…",
    listening: "Listening — go ahead",
    thinking: "Thinking…",
    ended: "Call ended"
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Waypoints className="h-5 w-5" /></div><span className="font-display text-lg font-semibold">Softphone</span></div>
              <Badge variant={call.connected ? "success" : "muted"}>{call.connected ? "connected" : "connecting…"}</Badge>
            </div>

            {/* Live status indicator */}
            <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-secondary/30 py-4">
              <span className={cn("flex h-3 w-3 items-center justify-center", phase === "listening" && "animate-pulse")}>
                <span className={cn("h-3 w-3 rounded-full",
                  phase === "listening" ? "bg-emerald-500" : phase === "agent" ? "bg-primary" : phase === "thinking" ? "bg-amber-500" : phase === "ended" ? "bg-zinc-400" : "bg-zinc-300")} />
              </span>
              <span className="text-sm font-medium">{statusLabel[phase]}</span>
              {phase === "agent" ? <Volume2 className="h-4 w-4 text-muted-foreground" /> : null}
              {phase === "thinking" ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              {phase === "listening" ? <Mic className="h-4 w-4 text-emerald-600" /> : null}
            </div>

            <div className="max-h-[300px] min-h-[180px] space-y-3 overflow-auto rounded-xl bg-secondary/30 p-4">
              {call.messages.length === 0 ? <p className="text-sm text-muted-foreground">Waiting for the agent…</p> : call.messages.map((message) => (
                <div key={message.id} className={cn("rounded-xl px-4 py-3 text-sm leading-6", message.role === "agent" ? "bg-secondary" : "ml-8 bg-zinc-100")}>
                  <small className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{message.role === "agent" ? "Agent" : "You"}</small>
                  {message.text}
                </div>
              ))}
            </div>

            {call.done ? (
              <div className="rounded-lg bg-secondary px-4 py-3 text-center text-sm text-muted-foreground">Call ended. Thank you.</div>
            ) : !answered ? (
              <Button className="w-full" disabled={!call.connected} onClick={answerCall}><ShieldCheck className="h-4 w-4" /> Answer &amp; start talking</Button>
            ) : (
              <div className="space-y-3">
                <p className="text-center text-xs text-muted-foreground">Just talk — the mic opens automatically after the agent speaks. Or type below.</p>
                <div className="flex items-center justify-center gap-2">
                  <Button size="sm" variant={muted ? "default" : "outline"} onClick={toggleMute}>
                    {muted ? <><MicOff className="h-4 w-4" /> Mic off</> : <><Mic className="h-4 w-4" /> Mic on</>}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={hangUp}><PhoneOff className="h-4 w-4" /> Hang up</Button>
                </div>
                <div className="flex gap-2">
                  <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="…or type your reply" onKeyDown={(e) => e.key === "Enter" && sendTyped()} />
                  <Button size="sm" variant="outline" onClick={sendTyped}>Send</Button>
                </div>
                {micNote ? <p className="text-center text-xs text-amber-600">{micNote}</p> : null}
              </div>
            )}

            {answered && !call.done ? null : !call.done ? (
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={hangUp}><PhoneOff className="h-4 w-4" /> Hang up</Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
