import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Mic, MicOff, PhoneOff, ShieldCheck, Volume2, Waypoints, Zap } from "lucide-react";
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

const BARGE_MIN_WORDS = 2;

function wordsOf(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
}

/** True when the recognized text mostly overlaps what the agent is currently saying (i.e. it's the speaker bleeding into the mic, not the user). */
function isEcho(transcript: string, agentText: string): boolean {
  if (!agentText) return false;
  const agentWords = new Set(wordsOf(agentText));
  const spoken = wordsOf(transcript);
  if (spoken.length === 0) return true;
  const overlap = spoken.filter((word) => agentWords.has(word)).length / spoken.length;
  return overlap >= 0.6;
}

export function SoftphonePage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session");
  const auto = params.get("auto") === "1"; // dialed inbound call -> the agent answers automatically
  const language = useAppSelector((state) => state.demo.selectedLanguage);
  // The page owns text-to-speech so it knows exactly when the agent is talking (for echo filtering + barge-in).
  const call = useCallSocket({ sessionId, role: "softphone", speak: false });

  const [phase, setPhase] = useState<Phase>("connecting");
  const [answered, setAnswered] = useState(false);
  const [muted, setMuted] = useState(false);
  const [bargeIn, setBargeIn] = useState(true);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const recognitionRunningRef = useRef(false);
  const lastSpokenIdRef = useRef(0);
  const answeredRef = useRef(false);
  const mutedRef = useRef(false);
  const doneRef = useRef(false);
  const bargeInRef = useRef(true);
  const ttsActiveRef = useRef(false);
  const ttsStartRef = useRef(0);
  const agentTextRef = useRef("");
  const autoAnsweredRef = useRef(false);
  const sendRef = useRef(call.sendUtterance);

  useEffect(() => { answeredRef.current = answered; }, [answered]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { bargeInRef.current = bargeIn; }, [bargeIn]);
  // Keep done/send refs fresh BEFORE the message effect below runs.
  useEffect(() => { doneRef.current = call.done; sendRef.current = call.sendUtterance; }, [call.done, call.sendUtterance]);
  useEffect(() => { if (call.done) setPhase("ended"); }, [call.done]);
  useEffect(() => { if (call.connected && phase === "connecting") setPhase("ringing"); }, [call.connected, phase]);

  const ensureListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || recognitionRunningRef.current || mutedRef.current || doneRef.current || !answeredRef.current) return;
    try { recognition.start(); } catch { /* start() throws if already running — ignore */ }
  }, []);

  const speak = useCallback((text: string) => {
    setPhase("agent");
    agentTextRef.current = text;
    ttsActiveRef.current = true;
    ttsStartRef.current = Date.now();
    const finish = () => {
      ttsActiveRef.current = false;
      agentTextRef.current = "";
      if (!doneRef.current) setPhase(answeredRef.current ? "listening" : "ringing");
      ensureListening();
    };
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { finish(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    let handled = false;
    const proceed = () => { if (handled) return; handled = true; finish(); };
    const fallback = window.setTimeout(proceed, Math.max(3000, text.length * 90));
    utterance.onend = () => { window.clearTimeout(fallback); proceed(); };
    try { window.speechSynthesis.speak(utterance); } catch { window.clearTimeout(fallback); proceed(); }
    // Barge-in: keep the mic hot while the agent talks so the user can cut in. Otherwise wait until it finishes.
    if (bargeInRef.current) ensureListening();
  }, [language, ensureListening]);

  // Dialed inbound call: the agent answers automatically (the caller already initiated by dialing).
  useEffect(() => {
    if (!auto || !call.connected || autoAnsweredRef.current) return;
    autoAnsweredRef.current = true;
    setAnswered(true);
    answeredRef.current = true;
    call.grantConsent();
    ensureListening();
  }, [auto, call.connected, call.grantConsent, ensureListening]);

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
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      recognitionRunningRef.current = true;
      if (!ttsActiveRef.current && !doneRef.current && answeredRef.current) setPhase("listening");
    };
    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalText += text; else interim += text;
      }
      const candidate = (finalText || interim).trim();

      if (ttsActiveRef.current) {
        // The agent is still talking. Decide: barge-in (real user) or echo (ignore).
        const looksLikeUser = bargeInRef.current
          && Date.now() - ttsStartRef.current > 300
          && wordsOf(candidate).length >= BARGE_MIN_WORDS
          && !isEcho(candidate, agentTextRef.current);
        if (looksLikeUser) {
          try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
          ttsActiveRef.current = false;
          agentTextRef.current = "";
          setPhase("listening");
        } else {
          return; // echo or too short while the agent speaks — never send it
        }
      }

      if (finalText.trim() && !ttsActiveRef.current) {
        setPhase("thinking");
        sendRef.current(finalText.trim());
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
      recognitionRunningRef.current = false;
      // Keep the mic hot for the whole call so barge-in works; small delay avoids a tight restart loop on silence.
      if (answeredRef.current && !mutedRef.current && !doneRef.current) {
        window.setTimeout(ensureListening, 250);
      }
    };
    recognitionRef.current = recognition;
    return () => { try { recognition.abort(); } catch { /* ignore */ } };
  }, [language, ensureListening]);

  // When a new agent message arrives, speak it.
  useEffect(() => {
    let lastAgent: { id: number; text: string } | undefined;
    for (let i = call.messages.length - 1; i >= 0; i -= 1) {
      if (call.messages[i].role === "agent") { lastAgent = call.messages[i]; break; }
    }
    if (!lastAgent || lastAgent.id === lastSpokenIdRef.current) return;
    lastSpokenIdRef.current = lastAgent.id;
    speak(lastAgent.text);
  }, [call.messages, speak]);

  function answerCall() {
    setAnswered(true);
    answeredRef.current = true;
    call.grantConsent();
    ensureListening();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    if (next) { try { recognitionRef.current?.abort(); } catch { /* ignore */ } }
    else ensureListening();
  }

  function sendTyped() {
    if (!input.trim()) return;
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    ttsActiveRef.current = false;
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
    agent: bargeIn ? "Agent speaking — you can cut in" : "Agent speaking…",
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
              auto ? (
                <div className="rounded-lg bg-secondary px-4 py-3 text-center text-sm text-muted-foreground">{call.connected ? "The agent is answering…" : "Calling…"}</div>
              ) : (
                <div className="space-y-2">
                  <Button className="w-full" disabled={!call.connected} onClick={answerCall}><ShieldCheck className="h-4 w-4" /> Answer &amp; start talking</Button>
                  <Button variant="ghost" className="w-full text-muted-foreground" onClick={hangUp}><PhoneOff className="h-4 w-4" /> Decline</Button>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <p className="text-center text-xs text-muted-foreground">Just talk — the mic stays open. {bargeIn ? "You can interrupt the agent anytime." : "Wait for the agent to finish."} Or type below.</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button size="sm" variant={muted ? "default" : "outline"} onClick={toggleMute}>{muted ? <><MicOff className="h-4 w-4" /> Mic off</> : <><Mic className="h-4 w-4" /> Mic on</>}</Button>
                  <Button size="sm" variant={bargeIn ? "default" : "outline"} onClick={() => setBargeIn((v) => !v)}><Zap className="h-4 w-4" /> Barge-in {bargeIn ? "on" : "off"}</Button>
                  <Button size="sm" variant="destructive" onClick={hangUp}><PhoneOff className="h-4 w-4" /> Hang up</Button>
                </div>
                <div className="flex gap-2">
                  <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="…or type your reply" onKeyDown={(e) => e.key === "Enter" && sendTyped()} />
                  <Button size="sm" variant="outline" onClick={sendTyped}>Send</Button>
                </div>
                {micNote ? <p className="text-center text-xs text-amber-600">{micNote}</p> : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
