import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Languages, Loader2, Mic, MicOff, PhoneOff, ShieldCheck, Volume2, Waypoints, Zap } from "lucide-react";
import { useAppSelector } from "../app/hooks";
import { useCallSocket } from "../hooks/useCallSocket";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface RecognitionResult { 0: { transcript: string; confidence: number }; isFinal: boolean }
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
// A reported recognition confidence below this is treated as ambient noise rather than the caller speaking.
const NOISE_CONFIDENCE_FLOOR = 0.3;
// Half-duplex timing: how long to wait after the agent stops speaking before reopening the mic (skips the
// acoustic tail of the speaker), and how long after that to keep rejecting any echo of the agent's words.
const TTS_TAIL_MS = 450;
const TTS_ECHO_GUARD_MS = 2200;
const PHONE_SETTLE_MS = 1400;
// Voice-activity detection for the Whisper recording path: speech level, end-of-utterance silence, min length.
const VAD_SPEAK_LEVEL = 0.025;
const VAD_SILENCE_MS = 900;
const VAD_MIN_MS = 350;

const LANGUAGE_LABELS: Record<string, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi",
  "kn-IN": "Kannada",
  "ta-IN": "Tamil",
  "ml-IN": "Malayalam"
};
// Disfluencies/filler the recognizer emits for throat-clears, hesitation, and background murmur.
const FILLER_PATTERN = /\b(uh+|um+|hmm+|mm+|mhm+|er+|err+|ah+|eh+|huh)\b/gi;

function wordsOf(text: string): string[] {
  // Keep letters and numbers from every script. The previous ASCII-only cleanup turned
  // Hindi/Malayalam/etc. into an empty string, so valid native-script speech was discarded as noise.
  return text.toLocaleLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
}

function digitsOf(text: string): string {
  return text.replace(/[^\d]/g, "");
}

function looksLikePhoneUtterance(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  const digits = digitsOf(text);
  if (digits.length < 7) return false;
  return /\b(phone|number|contact|callback|mobile)\b/i.test(text) || (compact.length > 0 && digits.length / compact.length >= 0.5);
}

function mergeUtterances(previous: string, next: string): string {
  if (!previous) return next.trim();
  if (!next) return previous.trim();
  const prevDigits = digitsOf(previous);
  const nextDigits = digitsOf(next);
  if (prevDigits && nextDigits) {
    if (nextDigits.includes(prevDigits)) return next.trim();
    if (prevDigits.includes(nextDigits)) return previous.trim();
  }
  return `${previous} ${next}`.replace(/\s{2,}/g, " ").trim();
}

/** Make the browser read long digit runs (phone numbers) one digit at a time, not as a huge cardinal number. */
function formatForSpeech(text: string): string {
  return text.replace(/\d[\d\s-]{5,}\d/g, (run) => {
    const digits = run.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 13 ? digits.split("").join(" ") : run;
  });
}

/** Strip recognizer noise artifacts and filler so only meaningful speech reaches the agent and the LLM. */
function denoise(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, " ") // bracketed artifacts: [noise], [music], [inaudible]
    .replace(/\([^)]*\)/g, " ") // parenthetical artifacts: (background noise)
    .replace(FILLER_PATTERN, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Decide whether a cleaned final result is just background noise (empty, a lone stray token, or very low confidence). */
function isNoise(cleaned: string, confidence: number): boolean {
  if (!cleaned) return true;
  const words = wordsOf(cleaned);
  if (words.length === 0) return true;
  // Keep short but real answers like "yes"/"no"/"ok"; drop a single one-letter stray token.
  if (words.length === 1 && (words[0]?.length ?? 0) < 2) return true;
  // The recognizer gave a confidence and it's below the floor -> almost certainly ambient noise.
  if (confidence > 0 && confidence < NOISE_CONFIDENCE_FLOOR) return true;
  return false;
}

/** True when the recognized text is the agent's own voice bleeding into the mic, not the caller speaking. */
function isEcho(transcript: string, agentText: string): boolean {
  if (!agentText) return false;
  const spoken = wordsOf(transcript);
  if (spoken.length === 0) return true;
  const agentWords = wordsOf(agentText);
  const agentSet = new Set(agentWords);
  const overlap = spoken.filter((word) => agentSet.has(word)).length / spoken.length;
  if (overlap >= 0.6) return true;
  // A contiguous slice of what the agent just said (e.g. the tail of its sentence) is also echo.
  if (spoken.length >= 2 && agentWords.join(" ").includes(spoken.join(" "))) return true;
  return false;
}

export function SoftphonePage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session");
  const auto = params.get("auto") === "1"; // dialed inbound call -> the agent answers automatically
  const demoLanguage = useAppSelector((state) => state.demo.selectedLanguage);
  const baseUrl = useAppSelector((state) => state.demo.apiBaseUrl);
  // The page owns text-to-speech so it knows exactly when the agent is talking (for echo filtering + barge-in).
  const call = useCallSocket({ sessionId, role: "softphone", speak: false });
  // When the backend has a Whisper server configured, the softphone records audio and transcribes server-side
  // (far more accurate); otherwise it uses the browser's built-in recognizer.
  const [whisperEnabled, setWhisperEnabled] = useState(false);
  // Follow the live session language: when the agent detects the caller switched languages, the recognizer
  // and text-to-speech follow suit so the rest of the call is heard and spoken in that language.
  const language = call.sessionLanguage ?? demoLanguage;

  const [phase, setPhase] = useState<Phase>("connecting");
  const [answered, setAnswered] = useState(false);
  const [muted, setMuted] = useState(false);
  // Half-duplex by default: the mic is closed while the agent speaks, so it can't hear itself. Barge-in
  // (full-duplex) is opt-in and only reliable with a headset/earphones that prevent acoustic echo.
  const [bargeIn, setBargeIn] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const recognitionRunningRef = useRef(false);
  // Agent replies are SPOKEN through a queue so the opening greeting and the first question (which arrive as two
  // back-to-back messages) are both heard in order, instead of the second cancelling the first mid-sentence.
  const lastSpokenIdRef = useRef(0);
  const speechQueueRef = useRef<string[]>([]);
  const pumpRef = useRef<() => void>(() => {});
  const answeredRef = useRef(false);
  const mutedRef = useRef(false);
  const doneRef = useRef(false);
  const bargeInRef = useRef(false);
  const ttsActiveRef = useRef(false);
  const ttsStartRef = useRef(0);
  const ttsEndedAtRef = useRef(0);
  const agentTextRef = useRef("");
  const autoAnsweredRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sendRef = useRef(call.sendUtterance);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const pendingUtteranceRef = useRef("");
  const pendingUtteranceConfidenceRef = useRef(0);
  const pendingUtteranceTimerRef = useRef<number | null>(null);

  useEffect(() => { answeredRef.current = answered; }, [answered]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { bargeInRef.current = bargeIn; }, [bargeIn]);
  // Keep done/send refs fresh BEFORE the message effect below runs.
  useEffect(() => { doneRef.current = call.done; sendRef.current = call.sendUtterance; }, [call.done, call.sendUtterance]);
  useEffect(() => { if (call.done) setPhase("ended"); }, [call.done]);
  useEffect(() => { if (call.connected && phase === "connecting") setPhase("ringing"); }, [call.connected, phase]);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [call.messages]);
  useEffect(() => () => {
    if (pendingUtteranceTimerRef.current) window.clearTimeout(pendingUtteranceTimerRef.current);
  }, []);

  // Ask the backend whether a Whisper ASR server is configured; if so we record + transcribe server-side.
  useEffect(() => {
    let active = true;
    fetch(`${baseUrl}/v1/capabilities`)
      .then((response) => response.json())
      .then((caps) => { if (active) setWhisperEnabled(Boolean(caps?.whisperAsr)); })
      .catch(() => { /* default to the browser recognizer */ });
    return () => { active = false; };
  }, [baseUrl]);

  const ensureListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || recognitionRunningRef.current || mutedRef.current || doneRef.current || !answeredRef.current) return;
    // Half-duplex: while the agent is speaking, keep the mic closed unless the user opted into barge-in.
    if (ttsActiveRef.current && !bargeInRef.current) return;
    try { recognition.start(); } catch { /* start() throws if already running — ignore */ }
  }, []);

  const speak = useCallback((text: string) => {
    setPhase("agent");
    agentTextRef.current = text;
    ttsActiveRef.current = true;
    ttsStartRef.current = Date.now();
    // Half-duplex: close the mic so it can't capture the agent's own voice.
    if (!bargeInRef.current) { try { recognitionRef.current?.abort(); } catch { /* ignore */ } }
    const finish = () => {
      ttsActiveRef.current = false;
      ttsEndedAtRef.current = Date.now();
      // More agent sentences queued (e.g. greeting then first question)? Speak the next before reopening the mic.
      if (speechQueueRef.current.length > 0) { pumpRef.current(); return; }
      // Keep agentTextRef set: the echo guard below still rejects the agent's words for a short window.
      if (!doneRef.current) setPhase(answeredRef.current ? "listening" : "ringing");
      window.setTimeout(() => ensureListening(), TTS_TAIL_MS); // reopen the mic after the speaker's acoustic tail clears
    };
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { finish(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(formatForSpeech(text));
    utterance.lang = language;
    let handled = false;
    const proceed = () => { if (handled) return; handled = true; finish(); };
    const fallback = window.setTimeout(proceed, Math.max(3000, text.length * 90));
    utterance.onend = () => { window.clearTimeout(fallback); proceed(); };
    try { window.speechSynthesis.speak(utterance); } catch { window.clearTimeout(fallback); proceed(); }
    // Barge-in (opt-in): keep the mic hot while the agent talks so the user can cut in.
    if (bargeInRef.current) ensureListening();
  }, [language, ensureListening]);

  // Drain the agent-speech queue one utterance at a time so consecutive replies never talk over each other.
  const pumpQueue = useCallback(() => {
    if (ttsActiveRef.current) return;
    const next = speechQueueRef.current.shift();
    if (next === undefined) return;
    speak(next);
  }, [speak]);
  useEffect(() => { pumpRef.current = pumpQueue; }, [pumpQueue]);

  const clearQueuedUtterance = useCallback(() => {
    if (pendingUtteranceTimerRef.current) window.clearTimeout(pendingUtteranceTimerRef.current);
    pendingUtteranceTimerRef.current = null;
    pendingUtteranceRef.current = "";
    pendingUtteranceConfidenceRef.current = 0;
  }, []);

  const flushQueuedUtterance = useCallback(() => {
    const text = pendingUtteranceRef.current.trim();
    const confidence = pendingUtteranceConfidenceRef.current;
    clearQueuedUtterance();
    if (!text) return;
    setPhase("thinking");
    sendRef.current(text, confidence);
  }, [clearQueuedUtterance]);

  const queueUtterance = useCallback((text: string, confidence: number) => {
    const phoneLike = looksLikePhoneUtterance(text);
    const hasPending = pendingUtteranceRef.current.trim().length > 0;

    if (!phoneLike && !hasPending) {
      setPhase("thinking");
      sendRef.current(text, confidence);
      return;
    }

    if (hasPending && !phoneLike) {
      flushQueuedUtterance();
      setPhase("thinking");
      sendRef.current(text, confidence);
      return;
    }

    pendingUtteranceRef.current = mergeUtterances(pendingUtteranceRef.current, text);
    pendingUtteranceConfidenceRef.current = Math.max(pendingUtteranceConfidenceRef.current, confidence);
    if (pendingUtteranceTimerRef.current) window.clearTimeout(pendingUtteranceTimerRef.current);
    pendingUtteranceTimerRef.current = window.setTimeout(() => flushQueuedUtterance(), PHONE_SETTLE_MS);
    if (!doneRef.current && answeredRef.current) setPhase("listening");
  }, [flushQueuedUtterance]);

  // Dialed inbound call: the agent answers automatically (the caller already initiated by dialing).
  useEffect(() => {
    if (!auto || !call.connected || autoAnsweredRef.current) return;
    autoAnsweredRef.current = true;
    setAnswered(true);
    answeredRef.current = true;
    call.grantConsent();
    ensureListening();
  }, [auto, call.connected, call.grantConsent, ensureListening]);

  // Engage the browser's audio DSP (noise suppression, echo cancellation, auto-gain) on the mic and prime permission.
  // Keeping this stream open applies the processing to the live capture session that speech recognition reads from.
  useEffect(() => {
    if (whisperEnabled) return; // Whisper path owns the mic stream itself
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) return;
    let cancelled = false;
    media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        micStreamRef.current = stream;
      })
      .catch(() => { /* mic denied or unavailable — recognition will prompt/fallback on its own */ });
    return () => {
      cancelled = true;
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    };
  }, [whisperEnabled]);

  // Set up the browser's speech recognition (used only when no Whisper server is configured).
  useEffect(() => {
    if (whisperEnabled) return;
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
      let finalConfidence = 0;
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alt = result?.[0];
        const text = alt?.transcript ?? "";
        if (result?.isFinal) {
          finalText += text;
          // Web Speech reports a per-result confidence (0..1); keep the strongest final alternative.
          if (typeof alt?.confidence === "number" && alt.confidence > finalConfidence) finalConfidence = alt.confidence;
        } else interim += text;
      }
      const candidate = denoise(finalText || interim);

      if (ttsActiveRef.current) {
        // The agent is still talking. Decide: barge-in (real user) or echo (ignore).
        const looksLikeUser = bargeInRef.current
          && Date.now() - ttsStartRef.current > 300
          && wordsOf(candidate).length >= BARGE_MIN_WORDS
          && !isEcho(candidate, agentTextRef.current);
        if (looksLikeUser) {
          try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
          speechQueueRef.current = []; // user cut in — drop any unspoken queued agent sentences
          ttsActiveRef.current = false;
          agentTextRef.current = "";
          setPhase("listening");
        } else {
          return; // echo or too short while the agent speaks — never send it
        }
      }

      if (finalText.trim() && !ttsActiveRef.current) {
        // Echo guard: for a short window after the agent stops speaking, the recognizer may still deliver
        // the tail of the agent's own voice. Reject anything that matches what the agent just said.
        if (Date.now() - ttsEndedAtRef.current < TTS_ECHO_GUARD_MS && isEcho(candidate, agentTextRef.current)) {
          if (!doneRef.current && answeredRef.current) setPhase("listening");
          return;
        }
        // Drop background noise / stray blips before they ever reach the agent or the LLM; send only clean speech.
        if (isNoise(candidate, finalConfidence)) {
          if (!doneRef.current && answeredRef.current) setPhase("listening");
          return;
        }
        queueUtterance(candidate, finalConfidence);
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
    // If the recognizer was rebuilt mid-call (e.g. the call switched language), resume listening on the new one.
    if (answeredRef.current && !mutedRef.current && !doneRef.current) window.setTimeout(ensureListening, 200);
    return () => { try { recognition.abort(); } catch { /* ignore */ } };
  }, [language, ensureListening, whisperEnabled]);

  // Whisper path: record utterances with voice-activity detection and transcribe them server-side.
  useEffect(() => {
    if (!whisperEnabled) return;
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicNote("Recording isn't supported in this browser — type your replies instead.");
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let recording = false;
    let recordStart = 0;
    let lastVoiceAt = 0;
    let vadTimer = 0;
    const samples = new Uint8Array(2048);
    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";

    const backToListening = () => { if (!doneRef.current && answeredRef.current) setPhase("listening"); };

    const transcribe = async (blob: Blob) => {
      try {
        const response = await fetch(`${baseUrl}/v1/asr?language=${encodeURIComponent(language)}`, { method: "POST", headers: { "Content-Type": "audio/webm" }, body: blob });
        if (!response.ok) { backToListening(); return; }
        const out = (await response.json()) as { text?: string; confidence?: number };
        const text = denoise((out.text ?? "").trim());
        const confidence = typeof out.confidence === "number" ? out.confidence : 0.9;
        if (!text || isNoise(text, confidence)) { backToListening(); return; }
        // Reject the agent's own voice if it bled into the recording just after it spoke.
        if (Date.now() - ttsEndedAtRef.current < TTS_ECHO_GUARD_MS && isEcho(text, agentTextRef.current)) { backToListening(); return; }
        queueUtterance(text, confidence);
      } catch { backToListening(); }
    };

    const startRec = () => {
      if (!recorder || recording) return;
      chunks = [];
      try { recorder.start(); recording = true; recordStart = Date.now(); if (!doneRef.current) setPhase("listening"); } catch { /* ignore */ }
    };
    const stopRec = () => {
      if (!recorder || !recording) return;
      recording = false;
      try { recorder.stop(); } catch { /* ignore */ }
    };

    const tick = () => {
      if (cancelled || !analyser) return;
      const blocked = !answeredRef.current || mutedRef.current || doneRef.current || (ttsActiveRef.current && !bargeInRef.current);
      if (blocked) { if (recording) stopRec(); return; }
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) { const v = (samples[i]! - 128) / 128; sum += v * v; }
      const level = Math.sqrt(sum / samples.length);
      const now = Date.now();
      if (level > VAD_SPEAK_LEVEL) {
        lastVoiceAt = now;
        if (!recording) startRec();
      } else if (recording && now - lastVoiceAt > VAD_SILENCE_MS) {
        stopRec();
      }
    };

    media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((acquired) => {
        if (cancelled) { acquired.getTracks().forEach((track) => track.stop()); return; }
        stream = acquired;
        const Ctx = (window as typeof window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
          ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        audioCtx = new Ctx();
        const source = audioCtx.createMediaStreamSource(acquired);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        recorder = mimeType ? new MediaRecorder(acquired, { mimeType }) : new MediaRecorder(acquired);
        recorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) chunks.push(event.data); };
        recorder.onstop = () => {
          const lasted = Date.now() - recordStart;
          const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
          chunks = [];
          if (lasted >= VAD_MIN_MS && blob.size > 0) void transcribe(blob);
          else backToListening();
        };
        vadTimer = window.setInterval(tick, 80);
      })
      .catch(() => setMicNote("Microphone blocked. Allow mic access, or type your replies."));

    return () => {
      cancelled = true;
      if (vadTimer) window.clearInterval(vadTimer);
      try { if (recorder && recorder.state === "recording") recorder.stop(); } catch { /* ignore */ }
      try { void audioCtx?.close(); } catch { /* ignore */ }
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [whisperEnabled, baseUrl, language]);

  // Enqueue every new agent message in order and start speaking — so the opening greeting AND the first
  // question are both heard, instead of the second reply cancelling the first.
  useEffect(() => {
    let enqueued = false;
    for (const message of call.messages) {
      if (message.role !== "agent" || message.id <= lastSpokenIdRef.current) continue;
      lastSpokenIdRef.current = message.id;
      speechQueueRef.current.push(message.text);
      enqueued = true;
    }
    if (enqueued) pumpQueue();
  }, [call.messages, pumpQueue]);

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
    clearQueuedUtterance();
    speechQueueRef.current = [];
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    ttsActiveRef.current = false;
    setPhase("thinking");
    call.sendUtterance(input.trim(), 0.97); // typed text is unambiguous — high recognition confidence
    setInput("");
  }

  function hangUp() {
    clearQueuedUtterance();
    speechQueueRef.current = [];
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
              <div className="flex items-center gap-2">
                {whisperEnabled ? <Badge variant="secondary">Whisper</Badge> : null}
                {call.sessionLanguage && call.sessionLanguage !== demoLanguage ? <Badge variant="secondary"><Languages className="h-3 w-3" /> {LANGUAGE_LABELS[language] ?? language}</Badge> : null}
                <Badge variant={call.connected ? "success" : "muted"}>{call.connected ? "connected" : "connecting…"}</Badge>
              </div>
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

            {call.confirming ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Confirming your {call.confirming.slotKey.replace(/_/g, " ")}: <strong>{call.confirming.value}</strong> — say yes or no</span>
              </div>
            ) : null}

            <div className="max-h-[300px] min-h-[180px] space-y-3 overflow-auto rounded-xl bg-secondary/30 p-4">
              {call.messages.length === 0 ? <p className="text-sm text-muted-foreground">Waiting for the agent…</p> : call.messages.map((message) => (
                <div key={message.id} className={cn("rounded-xl px-4 py-3 text-sm leading-6", message.role === "agent" ? "bg-secondary" : "ml-8 bg-zinc-100")}>
                  <small className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{message.role === "agent" ? "Agent" : "You"}</small>
                  {message.text}
                </div>
              ))}
              <div ref={transcriptEndRef} />
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
                <p className="text-center text-xs text-muted-foreground">{bargeIn ? "Mic stays open — you can interrupt the agent (use a headset to avoid echo)." : "Wait for the agent to finish, then speak — the mic opens when it's your turn."} Or type below.</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button size="sm" variant={muted ? "default" : "outline"} onClick={toggleMute}>{muted ? <><MicOff className="h-4 w-4" /> Mic off</> : <><Mic className="h-4 w-4" /> Mic on</>}</Button>
                  <Button size="sm" variant={bargeIn ? "default" : "outline"} onClick={() => setBargeIn((v) => !v)} title="Barge-in lets you interrupt the agent. Needs a headset to avoid the mic hearing the agent."><Zap className="h-4 w-4" /> Barge-in {bargeIn ? "on" : "off"}</Button>
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
