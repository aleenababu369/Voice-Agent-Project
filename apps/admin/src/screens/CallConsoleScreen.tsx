import { Mic, PhoneCall, PhoneOutgoing, PlayCircle, Send, ShieldCheck, Wand2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { useWorkspace } from "../hooks/useWorkspace";
import { useBrowserCall } from "../hooks/useBrowserCall";
import { selectScenario, setCallDirection, setSelectedLanguage, setTargetContact } from "../features/demo/demoSlice";
import type { CallDirection } from "../features/demo/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eyebrow, Field, MetricCard, QualityBar, SimpleSelect, StatTile } from "../components/common";
import { cn } from "@/lib/utils";

export function CallConsoleScreen() {
  const dispatch = useAppDispatch();
  const { platform } = useWorkspace();
  const call = useBrowserCall();
  const demo = call.demo;
  const selectedScenario = call.selectedScenario;
  const metrics = useAppSelector((state) => state.demo.metrics);

  const profileStatus = (id: string) => platform.profiles.find((profile) => profile.id === id)?.status ?? "deployed";
  const selectedIsDraft = selectedScenario ? profileStatus(selectedScenario.id) === "draft" : false;

  const completionPercent = Math.round((metrics?.completionRate ?? 0) * 100);
  const escalationPercent = Math.round((metrics?.escalationRate ?? 0) * 100);
  const confidenceScore = Math.round((((metrics?.averageAsrConfidence ?? 0) + (metrics?.averageNluConfidence ?? 0)) / 2) * 100);
  const isOutbound = demo.direction === "outbound";
  const busy = demo.callPhase === "thinking" || demo.callPhase === "speaking";

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_300px]">
      {/* Left: call setup */}
      <Card>
        <CardContent className="space-y-5 p-5">
          <div>
            <Eyebrow>Call setup</Eyebrow>
            <h3 className="text-lg font-semibold">Configure the call</h3>
          </div>

          <Field label="Direction">
            <Tabs value={demo.direction} onValueChange={(value) => dispatch(setCallDirection(value as CallDirection))}>
              <TabsList className="w-full">
                <TabsTrigger value="inbound" className="flex-1"><PhoneCall className="h-4 w-4" /> Inbound</TabsTrigger>
                <TabsTrigger value="outbound" className="flex-1"><PhoneOutgoing className="h-4 w-4" /> Outbound</TabsTrigger>
              </TabsList>
            </Tabs>
          </Field>

          {isOutbound ? (
            <div className="grid gap-3 rounded-2xl bg-accent/30 p-3">
              <p className="text-xs text-muted-foreground">Dial a contact (the agent calls out, e.g. a reminder or follow-up).</p>
              {platform.contacts.length > 0 ? (
                <SimpleSelect
                  value=""
                  placeholder="Pick a saved contact"
                  onValueChange={(value) => {
                    const contact = platform.contacts.find((item) => item.id === value);
                    if (contact) dispatch(setTargetContact({ name: contact.name, phoneNumber: contact.phoneNumber }));
                  }}
                  options={platform.contacts.map((contact) => ({ value: contact.id, label: `${contact.name} · ${contact.phoneNumber}` }))}
                />
              ) : null}
              <Input placeholder="Contact name" value={demo.targetContact.name} onChange={(event) => dispatch(setTargetContact({ ...demo.targetContact, name: event.target.value }))} />
              <Input placeholder="Phone number" value={demo.targetContact.phoneNumber} onChange={(event) => dispatch(setTargetContact({ ...demo.targetContact, phoneNumber: event.target.value }))} />
            </div>
          ) : null}

          <Field label="Language">
            <SimpleSelect value={demo.selectedLanguage} onValueChange={(value) => dispatch(setSelectedLanguage(value as typeof demo.selectedLanguage))} options={(demo.config?.supportedLanguages ?? ["en-IN"]).map((language) => ({ value: language, label: language }))} />
          </Field>

          <div>
            <span className="mb-2 block text-sm text-muted-foreground">Agent</span>
            <div className="grid gap-2">
              {(demo.config?.scenarios ?? []).map((scenario) => {
                const draft = profileStatus(scenario.id) === "draft";
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => dispatch(selectScenario(scenario.id))}
                    className={cn("rounded-2xl border p-3 text-left transition", scenario.id === demo.selectedScenarioId ? "border-primary bg-primary/5" : "border-border bg-white/60 hover:border-primary/30")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm">{scenario.title}</strong>
                      {draft ? <Badge variant="muted">draft</Badge> : <Badge variant="success">live</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{scenario.workflow} · {scenario.language}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Session" value={demo.session?.status ?? "Idle"} />
            <StatTile label="Voice" value={demo.voiceState} />
            <StatTile label="Mic" value={call.micStatus} />
            <StatTile label="Direction" value={demo.direction} />
          </div>

          {selectedIsDraft ? <Badge variant="warning" className="w-full justify-center py-1.5">This agent is a draft — deploy it to take calls.</Badge> : null}

          <div className="grid gap-2">
            <Button disabled={demo.loading || !selectedScenario || selectedIsDraft} onClick={() => void call.startCall()}>
              <PlayCircle className="h-4 w-4" /> Start call
            </Button>
            <Button variant="outline" disabled={!demo.session || demo.session.consentCaptured} onClick={() => void call.grant()}>
              <ShieldCheck className="h-4 w-4" /> Grant consent
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Center: conversation */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <Eyebrow>Conversation</Eyebrow>
              <h3 className="text-2xl font-semibold">{selectedScenario?.title ?? "Choose an agent"}</h3>
            </div>
            <Badge variant="accent" className="capitalize">{demo.direction} call</Badge>
          </div>

          {selectedScenario?.guide ? (
            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
              <Eyebrow>Guided sample</Eyebrow>
              <p className="mt-1 text-sm text-muted-foreground">{selectedScenario.guide.objective}</p>
              <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-sm leading-6">{selectedScenario.sampleUtterance}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={demo.loading || !selectedScenario || selectedIsDraft} onClick={() => void call.runGuidedSample()}><Wand2 className="h-4 w-4" /> Run guided sample</Button>
                <Button size="sm" variant="outline" disabled={demo.loading} onClick={() => void call.seedRecords()}>Seed demo records</Button>
              </div>
            </div>
          ) : null}

          <div className="max-h-[440px] min-h-[280px] space-y-3 overflow-auto rounded-2xl bg-secondary/20 p-4">
            {demo.transcript.length === 0 ? (
              <p className="rounded-xl bg-white/70 px-4 py-3 text-sm text-muted-foreground">Start a call to see the conversation timeline here.</p>
            ) : (
              demo.transcript.map((message) => (
                <div key={message.id} className={cn(
                  "rounded-2xl px-4 py-3 text-sm leading-6",
                  message.role === "agent" ? "mr-10 bg-primary/10" : message.role === "user" ? "ml-10 bg-accent/40" : "bg-white/70 text-muted-foreground"
                )}>
                  <small className="mb-1 block text-xs text-muted-foreground">{message.title}</small>
                  <div>{message.text || (message.pending ? "…" : "")}</div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3">
            <Textarea rows={3} placeholder={busy ? "The agent is responding…" : "Type what the caller says…"} value={call.input} onChange={(event) => call.setInput(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={!demo.session?.consentCaptured || !call.input.trim() || busy} onClick={() => void call.send()}><Send className="h-4 w-4" /> Send</Button>
              <Button variant="outline" disabled={!call.micAvailable} onClick={call.startMic}><Mic className="h-4 w-4" /> Microphone</Button>
              <Button variant="ghost" disabled={!selectedScenario} onClick={call.useSample}>Use sample</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right: live metrics */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <Eyebrow>Live metrics</Eyebrow>
            <h3 className="text-lg font-semibold">This workspace</h3>
          </div>
          <div className="grid gap-3">
            <MetricCard label="Total turns" value={String(metrics?.totalTurns ?? 0)} />
            <MetricCard label="Avg latency" value={`${metrics?.averageLatencyMs ?? 0} ms`} />
            <MetricCard label="ASR / NLU" value={`${metrics?.averageAsrConfidence ?? 0} / ${metrics?.averageNluConfidence ?? 0}`} />
          </div>
          <div className="rounded-2xl bg-secondary/40 p-4">
            <Eyebrow>Quality</Eyebrow>
            <div className="mt-3 grid gap-3">
              <QualityBar label="Task completion" value={completionPercent} tone="emerald" />
              <QualityBar label="Recognition" value={confidenceScore} tone="teal" />
              <QualityBar label="Escalation control" value={100 - escalationPercent} tone="amber" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
