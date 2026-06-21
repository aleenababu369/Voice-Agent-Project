import { useState } from "react";
import { Copy, ExternalLink, PhoneCall, PhoneOutgoing, Send } from "lucide-react";
import { useAppSelector } from "../app/hooks";
import { createApiClient } from "../features/demo/demoApi";
import { useCallSocket } from "../hooks/useCallSocket";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow, Field, SectionHeader, SimpleSelect } from "../components/common";
import { cn } from "@/lib/utils";

export function CallConsolePage() {
  const baseUrl = useAppSelector((state) => state.demo.apiBaseUrl);
  const token = useAppSelector((state) => state.auth.token);
  const profiles = useAppSelector((state) => state.platform.profiles);
  const prospects = useAppSelector((state) => state.platform.prospects);
  const deployed = profiles.filter((profile) => profile.status !== "draft");

  const [agentId, setAgentId] = useState("");
  const [prospectId, setProspectId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const call = useCallSocket({ sessionId, role: "agent", speak: false });
  const selectedAgent = deployed.find((profile) => profile.id === agentId);
  const softphoneLink = sessionId ? `${window.location.origin}/softphone?session=${sessionId}` : "";

  async function placeCall() {
    setError(null);
    setPlacing(true);
    try {
      const api = createApiClient(baseUrl, token);
      const body: Record<string, unknown> = { profileId: agentId, direction: "outbound", phoneNumber: "+910000000000" };
      if (prospectId) body.prospectId = prospectId;
      const response = await api.post<{ session: { id: string } }>("/v1/calls/session", body);
      setSessionId(response.data.session.id);
    } catch (err) {
      setError(err && typeof err === "object" && "response" in err ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Unable to place call.") : "Unable to place call.");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Call console" title="Place an outbound call" subtitle="Outbound = the agent dials a prospect; you answer in a softphone tab. For inbound, customers dial the agent's number on the dialer." />

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardContent className="space-y-4 p-5">
            <Field label="Agent"><SimpleSelect value={agentId} onValueChange={setAgentId} placeholder="Select a deployed agent" options={deployed.map((p) => ({ value: p.id, label: p.name }))} /></Field>

            {selectedAgent?.phoneNumber ? (
              <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
                <Eyebrow>Inbound number</Eyebrow>
                <p className="text-xs text-muted-foreground">Customers dial this number to reach this agent:</p>
                <div className="flex items-center gap-2">
                  <Input readOnly value={selectedAgent.phoneNumber} className="font-mono text-sm" />
                  <Button size="icon" variant="outline" onClick={() => navigator.clipboard?.writeText(selectedAgent.phoneNumber ?? "")}><Copy className="h-4 w-4" /></Button>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => window.open(`/call?number=${encodeURIComponent(selectedAgent.phoneNumber ?? "")}`, "_blank")}><PhoneCall className="h-4 w-4" /> Open dialer (test inbound)</Button>
              </div>
            ) : null}

            <Field label="Prospect to call"><SimpleSelect value={prospectId} onValueChange={setProspectId} placeholder="Pick a prospect (optional)" options={prospects.map((p) => ({ value: p.id, label: `${p.name} · ${p.phoneNumber}` }))} /></Field>

            {error ? <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <Button className="w-full" disabled={!agentId || placing} onClick={() => void placeCall()}><PhoneOutgoing className="h-4 w-4" /> {placing ? "Placing…" : "Place outbound call"}</Button>

            {sessionId ? (
              <div className="space-y-2 rounded-lg border border-border bg-secondary/50 p-3">
                <Eyebrow>Softphone</Eyebrow>
                <p className="text-xs text-muted-foreground">Open this in a second tab to answer as the prospect:</p>
                <div className="flex items-center gap-2">
                  <Input readOnly value={softphoneLink} className="text-xs" />
                  <Button size="icon" variant="outline" onClick={() => navigator.clipboard?.writeText(softphoneLink)}><Copy className="h-4 w-4" /></Button>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => window.open(softphoneLink, "_blank")}><ExternalLink className="h-4 w-4" /> Open softphone</Button>
                <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Monitor</span><Badge variant={call.connected ? "success" : "muted"}>{call.connected ? "live" : "offline"}</Badge></div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div><Eyebrow>Live conversation</Eyebrow><h3 className="text-lg font-semibold">{sessionId ? "Monitoring call" : "No active call"}</h3></div>
              {call.done ? <Badge variant="success">Completed</Badge> : sessionId ? <Badge variant="secondary">In progress</Badge> : null}
            </div>
            <div className="max-h-[420px] min-h-[260px] space-y-3 overflow-auto rounded-xl bg-secondary/20 p-4">
              {call.messages.length === 0 ? <p className="text-sm text-muted-foreground">Place a call and answer in the softphone tab to see the live transcript.</p> : call.messages.map((message) => (
                <div key={message.id} className={cn("rounded-xl px-4 py-3 text-sm leading-6", message.role === "agent" ? "mr-8 bg-secondary" : "ml-8 bg-zinc-100")}>
                  <small className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{message.role}</small>
                  {message.text}
                </div>
              ))}
            </div>
            {sessionId && !call.done ? (
              <div className="flex gap-2">
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Reply as the caller (single-tab test)…" onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) { call.sendUtterance(input.trim()); setInput(""); } }} />
                <Button onClick={() => { if (input.trim()) { call.sendUtterance(input.trim()); setInput(""); } }}><Send className="h-4 w-4" /></Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
