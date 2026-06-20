import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, RotateCcw, Save, Sparkles, Rocket, Trash2, Undo2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { useAccount } from "../../hooks/useAccount";
import { deployProfile, fetchProfileVersions, restoreProfileVersion, saveProfile, selectProfile } from "../../features/platform/platformSlice";
import type { AgentProfileDto, AgentProfileTemplateDto, DomainDto } from "../../features/platform/types";
import { type DraftProfile, emptyProfile, profileToDraft, templateToDraft, workflowForDomain } from "../../features/platform/profileDrafts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Eyebrow, Field, SectionHeader, SimpleSelect } from "../../components/common";

const DOMAIN_OPTIONS = [
  { value: "education", label: "education" },
  { value: "healthcare", label: "healthcare" },
  { value: "frontdesk", label: "frontdesk" }
];

export function AgentConfigPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { agentId } = useParams();
  const { account } = useAccount();
  const profiles = useAppSelector((state) => state.platform.profiles);
  const templates = useAppSelector((state) => state.platform.templates);
  const versions = useAppSelector((state) => state.platform.versions);
  const isNew = agentId === "new";
  const existing = profiles.find((profile) => profile.id === agentId) ?? null;
  const accountId = account?.id ?? "";

  const [draft, setDraft] = useState<DraftProfile>(() => emptyProfile(accountId, account?.useCase ?? "education"));

  useEffect(() => {
    if (isNew) {
      dispatch(selectProfile(null));
      setDraft(emptyProfile(accountId, account?.useCase ?? "education"));
      return;
    }
    if (existing) {
      dispatch(selectProfile(existing.id));
      setDraft(profileToDraft(existing));
      void dispatch(fetchProfileVersions(existing.id));
    }
  }, [dispatch, isNew, existing?.id, accountId]);

  const activeTemplate = useMemo(() => templates.find((template) => template.domain === draft.domain && template.workflow === draft.workflow) ?? null, [templates, draft.domain, draft.workflow]);
  const workflowOptions = templates.filter((template) => template.domain === draft.domain).map((template) => ({ value: template.workflow, label: template.workflow }));

  function applyTemplate(template: AgentProfileTemplateDto) {
    setDraft(templateToDraft(template, accountId, draft.name || template.name));
  }
  function updateSlot(index: number, patch: Partial<AgentProfileDto["slots"][number]>) {
    setDraft({ ...draft, slots: draft.slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)) });
  }
  async function handleSave() {
    const result = await dispatch(saveProfile({ ...draft, tenantId: accountId }));
    if (saveProfile.fulfilled.match(result) && isNew) navigate(`/agents/${result.payload.profile.id}`);
  }
  async function handleRestore(versionId: string) {
    if (!existing) return;
    const result = await dispatch(restoreProfileVersion({ profileId: existing.id, versionId }));
    if (restoreProfileVersion.fulfilled.match(result)) setDraft(profileToDraft(result.payload.profile));
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow={isNew ? "New agent" : "Edit agent"}
        title={draft.name || "Create an agent"}
        subtitle="Customize the agent's behavior, prompts, questions, and the data it collects."
        aside={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/agents")}><ArrowLeft className="h-4 w-4" /> Back</Button>
            {existing ? (
              existing.status === "draft"
                ? <Button onClick={() => void dispatch(deployProfile({ profileId: existing.id, deployed: true }))}><Rocket className="h-4 w-4" /> Deploy</Button>
                : <Button variant="outline" onClick={() => void dispatch(deployProfile({ profileId: existing.id, deployed: false }))}><Undo2 className="h-4 w-4" /> Move to draft</Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-5 p-6">
              {existing ? <Badge variant={existing.status === "draft" ? "muted" : "success"}>{existing.status === "draft" ? "draft" : "live"}</Badge> : null}
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Agent name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                <Field label="Domain"><SimpleSelect value={draft.domain} onValueChange={(v) => setDraft({ ...draft, domain: v as DomainDto, workflow: workflowForDomain(v as DomainDto) })} options={DOMAIN_OPTIONS} /></Field>
                <Field label="Workflow / role"><SimpleSelect value={draft.workflow} onValueChange={(v) => setDraft({ ...draft, workflow: v })} options={workflowOptions.length ? workflowOptions : [{ value: draft.workflow, label: draft.workflow }]} /></Field>
                <Field label="Languages (comma separated)"><Input value={draft.languages.join(", ")} onChange={(e) => setDraft({ ...draft, languages: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
              </div>

              <div className="grid gap-4">
                <Field label="Description"><Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
                <Field label="Welcome message"><Textarea rows={2} value={draft.welcomeMessage} onChange={(e) => setDraft({ ...draft, welcomeMessage: e.target.value })} /></Field>
                <Field label="System prompt (behavior)"><Textarea rows={3} value={draft.systemPrompt} onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })} /></Field>
                <Field label="Completion template" hint="Use {{slot_key}} for collected fields."><Textarea rows={2} value={draft.completionMessageTemplate} onChange={(e) => setDraft({ ...draft, completionMessageTemplate: e.target.value })} /></Field>
                <Field label="Escalation message"><Textarea rows={2} value={draft.escalationMessage} onChange={(e) => setDraft({ ...draft, escalationMessage: e.target.value })} /></Field>
              </div>

              <Separator />

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <div><Eyebrow>Data to collect</Eyebrow><h4 className="text-lg font-semibold">Questions & fields</h4></div>
                  <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, slots: [...draft.slots, { key: `field_${draft.slots.length + 1}`, label: "New field", prompt: "Please provide this detail.", required: true, examples: [] }] })}><Plus className="h-4 w-4" /> Add field</Button>
                </div>
                <p className="mb-3 text-sm text-muted-foreground">Define what the agent asks for. On a real call the caller speaks the answer and the agent extracts &amp; stores the value automatically — you do not enter the value here.</p>
                <div className="grid gap-3">
                  {draft.slots.map((slot, index) => (
                    <div key={index} className="rounded-xl border border-border bg-secondary/40 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Field key (stored in DB)"><Input value={slot.key} onChange={(e) => updateSlot(index, { key: e.target.value })} placeholder="patient_name" /></Field>
                        <Field label="Label"><Input value={slot.label} onChange={(e) => updateSlot(index, { label: e.target.value })} placeholder="Patient name" /></Field>
                        <div className="md:col-span-2"><Field label="Question the agent asks the caller"><Textarea rows={2} value={slot.prompt} onChange={(e) => updateSlot(index, { prompt: e.target.value })} placeholder="e.g. May I have the patient's name?" /></Field></div>
                        <div className="md:col-span-2"><Field label="Example answers (optional)" hint="Sample ways a caller might phrase their answer — used only as hints for the AI, never stored as the value."><Input value={slot.examples?.join(", ") ?? ""} onChange={(e) => updateSlot(index, { examples: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="e.g. I am Asha, my name is Asha" /></Field></div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={slot.required} onChange={(e) => updateSlot(index, { required: e.target.checked })} /> Required</label>
                        <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, slots: draft.slots.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /> Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void handleSave()}><Save className="h-4 w-4" /> Save agent</Button>
                {activeTemplate ? <Button variant="outline" onClick={() => applyTemplate(activeTemplate)}><RotateCcw className="h-4 w-4" /> Reset to template</Button> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <Eyebrow>Templates</Eyebrow>
              <p className="mt-1 mb-3 text-sm text-muted-foreground">Start from a guided use case.</p>
              <div className="grid gap-2">
                {templates.map((template) => (
                  <div key={template.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" /><div><strong className="block text-sm">{template.name}</strong><span className="text-xs text-muted-foreground">{template.workflow}</span></div></div>
                    <Button size="sm" variant="ghost" onClick={() => applyTemplate(template)}>Use</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {existing ? (
            <Card>
              <CardContent className="p-5">
                <Eyebrow>History</Eyebrow>
                <p className="mt-1 mb-3 text-sm text-muted-foreground">{versions.length} versions</p>
                <div className="grid gap-2">
                  {versions.map((version) => (
                    <div key={version.id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center justify-between"><strong className="text-sm">v{version.version}</strong><span className="text-xs text-muted-foreground">{new Date(version.changedAt).toLocaleDateString()}</span></div>
                      <p className="mt-1 text-xs text-muted-foreground">{version.changeSummary}</p>
                      <Button size="sm" variant="ghost" className="mt-2" onClick={() => void handleRestore(version.id)}><RotateCcw className="h-3 w-3" /> Restore</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
