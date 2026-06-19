import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mic, PhoneOff, Send, ShieldCheck, Waypoints } from "lucide-react";
import { useCallSocket } from "../hooks/useCallSocket";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export function SoftphonePage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session");
  const call = useCallSocket({ sessionId, role: "softphone", speak: true });
  const [input, setInput] = useState("");
  const [micStatus, setMicStatus] = useState("");
  const recognitionRef = useRef<InstanceType<RecognitionCtor> | null>(null);

  useEffect(() => {
    const Recognition = (window as typeof window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
      ?? (window as typeof window & { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;
    if (!Recognition) {
      setMicStatus("Mic unsupported");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => setInput(event.results[0][0].transcript);
    recognition.onend = () => setMicStatus("");
    recognition.onerror = () => setMicStatus("Mic error");
    recognitionRef.current = recognition;
  }, []);

  function send() {
    if (!input.trim()) return;
    call.sendUtterance(input.trim());
    setInput("");
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

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Waypoints className="h-5 w-5" /></div><span className="font-display text-lg font-semibold">Softphone</span></div>
              <Badge variant={call.connected ? "success" : "muted"}>{call.connected ? "connected" : "connecting…"}</Badge>
            </div>

            <div className="max-h-[360px] min-h-[220px] space-y-3 overflow-auto rounded-xl bg-secondary/30 p-4">
              {call.messages.length === 0 ? <p className="text-sm text-muted-foreground">Waiting for the agent…</p> : call.messages.map((message) => (
                <div key={message.id} className={cn("rounded-xl px-4 py-3 text-sm leading-6", message.role === "agent" ? "bg-secondary" : "ml-8 bg-zinc-100")}>
                  <small className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{message.role === "agent" ? "Agent" : "You"}</small>
                  {message.text}
                </div>
              ))}
            </div>

            {call.done ? (
              <div className="rounded-lg bg-secondary px-4 py-3 text-center text-sm text-muted-foreground">Call ended. Thank you.</div>
            ) : call.needsConsent ? (
              <Button className="w-full" onClick={call.grantConsent}><ShieldCheck className="h-4 w-4" /> Answer & give consent</Button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Speak or type your reply…" onKeyDown={(e) => e.key === "Enter" && send()} />
                  <Button size="icon" variant="outline" disabled={!recognitionRef.current} onClick={() => { setMicStatus("Listening…"); recognitionRef.current?.start(); }}><Mic className="h-4 w-4" /></Button>
                  <Button size="icon" onClick={send}><Send className="h-4 w-4" /></Button>
                </div>
                {micStatus ? <p className="text-center text-xs text-muted-foreground">{micStatus}</p> : null}
              </div>
            )}

            <Button variant="ghost" className="w-full text-muted-foreground" onClick={call.end}><PhoneOff className="h-4 w-4" /> Hang up</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
