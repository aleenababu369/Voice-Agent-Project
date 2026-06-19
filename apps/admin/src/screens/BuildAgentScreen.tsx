import { useEffect, useMemo, useState } from "react";
import { History, Plus, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { useAppDispatch } from "../app/hooks";
import { useWorkspace } from "../hooks/useWorkspace";
import {
  fetchProfileVersions,
  fetchProfiles,
  restoreProfileVersion,
  saveProfile,
  selectProfile,
  setActiveScreen
} from "../features/platform/platformSlice";
import type { AgentProfileDto, AgentProfileTemplateDto, DomainDto } from "../features/platform/types";
import { type DraftProfile, emptyProfile, profileToDraft, templateToDraft, workflowForDomain } from "../features/platform/profileDrafts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Eyebrow, Field, SectionHeader, SimpleSelect } from "../components/common";
import { cn } from "@/lib/utils";

const DOMAIN_OPTIONS = [
  { value: "education", label: "education" },
  { value: "healthcare", label: "healthcare" },
  { value: "frontdesk", label: "frontdesk" }
];

export function BuildAgentScreen() {
  const dispatch = useAppDispatch();
  const { platform, tenant, canEdit } = useWorkspace();
  const selectedProfile = platform.profiles.find((profile) => profile.id === platform.selectedProfileId) ?? null;
  const [draft, setDraft] = useState<DraftProfile>(() => emptyProfile(tenant?.id ?? "city-hospital", tenant?.domainFocus ?? "education"));

  useEffect(() => {
    if (selectedProfile) {
      setDraft(profileToDraft(selectedProfile));
      void dispatch(fetchProfileVersions(selectedProfile.id));
      return;
    }
    setDraft(emptyProfile(tenant?.id ?? "city-hospital", tenant?.domainFocus ?? "education"));
  }, [dispatch, selectedProfile, tenant?.id, tenant?.domainFocus]);

  const activeTemplate = useMemo(
    () => platform.templates.find((template) => template.domain === draft.domain && template.workflow === draft.workflow) ?? null,
    [platform.templates, draft.domain, draft.workflow]
  );

  const coverage = useMemo(() => {
    if (!activeTemplate) return { matched: [] as string[], missing: [] as string[] };
    const requiredKeys = activeTemplate.slots.filter((slot) => slot.required).map((slot) => slot.key);
    return {
      matched: requiredKeys.filter((key) => draft.slots.some((slot) => slot.required && slot.key === key)),
      missing: requiredKeys.filter((key) => !draft.slots.some((slot) => slot.required && slot.key === key))
    };
  }, [activeTemplate, draft.slots]);

  const workflowOptions = platform.templates
    .filter((template) => template.domain === draft.domain)
    .map((template) => ({ value: template.workflow, label: template.workflow }));

  function applyTemplate(template: AgentProfileTemplateDto) {
    setDraft(templateToDraft(template, tenant?.id ?? draft.tenantId));
    dispatch(selectProfile(null));
  }

  function updateSlot(index: number, patch: Partial<AgentProfileDto["slots"][number]>) {
    setDraft({ ...draft, slots: draft.slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)) });
  }

  async function handleSave() {
    const result = await dispatch(saveProfile({ ...draft, tenantId: tenant?.id ?? draft.tenantId })).unwrap();
    void dispatch(fetchProfiles());
    void dispatch(fetchProfileVersions(result.profile.id));
  }

  async function handleRestore(versionId: string) {
    if (!platform.selectedProfileId) return;
    const result = await dispatch(restoreProfileVersion({ profileId: platform.selectedProfileId, versionId })).unwrap();
    setDraft(profileToDraft(result.profile));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <Eyebrow>Agents</Eyebrow>
                <h3 className="text-lg font-semibold">{tenant?.name ?? "Workspace"}</h3>
              </div>
              <Button size="sm" variant="outline" onClick={() => { dispatch(selectProfile(null)); setDraft(emptyProfile(tenant?.id ?? draft.tenantId, tenant?.domainFocus ?? "education")); }}>
                <Plus className="h-4 w-4" /> New
              </Button>
            </div>
            <div className="grid gap-2">
              {platform.profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => dispatch(selectProfile(profile.id))}
                  className={cn("rounded-2xl border p-3 text-left transition", platform.selectedProfileId === profile.id ? "border-primary bg-primary/5" : "border-border bg-white/60 hover:border-primary/30")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate">{profile.name}</strong>
                    <Badge variant={profile.status === "draft" ? "muted" : "success"}>{profile.status === "draft" ? "draft" : "live"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{profile.domain} · {profile.workflow}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <Eyebrow>Templates</Eyebrow>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">Start from a guided use case.</p>
            <div className="grid gap-2">
              {platform.templates.map((template) => (
                <div key={template.id} className="rounded-2xl border border-border bg-white/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <strong className="text-sm">{template.name}</strong>
                    </div>
                    <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => applyTemplate(template)}>Use</Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{template.domain} · {template.workflow}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-5 p-6">
            <SectionHeader
              eyebrow="Customize behavior"
              title={draft.name || "Create or edit an agent"}
              subtitle={`Workspace: ${tenant?.name ?? draft.tenantId}`}
              aside={!canEdit ? <Badge variant="warning">Read-only (viewer)</Badge> : draft.status === "draft" ? <Badge variant="muted">draft</Badge> : <Badge variant="success">live</Badge>}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Agent name">
                <Input disabled={!canEdit} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </Field>
              <Field label="Workspace">
                <Input disabled value={tenant?.name ?? draft.tenantId} />
              </Field>
              <Field label="Domain">
                <SimpleSelect disabled={!canEdit} value={draft.domain} onValueChange={(value) => setDraft({ ...draft, domain: value as DomainDto, workflow: workflowForDomain(value as DomainDto) })} options={DOMAIN_OPTIONS} />
              </Field>
              <Field label="Workflow / role">
                <SimpleSelect disabled={!canEdit} value={draft.workflow} onValueChange={(value) => setDraft({ ...draft, workflow: value })} options={workflowOptions.length ? workflowOptions : [{ value: draft.workflow, label: draft.workflow }]} />
              </Field>
              <Field label="Languages (comma separated)">
                <Input disabled={!canEdit} value={draft.languages.join(", ")} onChange={(event) => setDraft({ ...draft, languages: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
              </Field>
            </div>

            {activeTemplate ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl bg-accent/40 p-4">
                  <Eyebrow>Validation rules</Eyebrow>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {activeTemplate.validationRules.map((rule) => <li key={rule} className="rounded-lg bg-white/70 px-3 py-2">{rule}</li>)}
                  </ul>
                </div>
                <div className="rounded-2xl bg-primary/5 p-4">
                  <Eyebrow>Required field coverage</Eyebrow>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {coverage.matched.map((key) => <Badge key={key} variant="success">✓ {key}</Badge>)}
                    {coverage.missing.map((key) => <Badge key={key} variant="destructive">missing {key}</Badge>)}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4">
              <Field label="Description"><Textarea disabled={!canEdit} rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
              <Field label="Welcome message"><Textarea disabled={!canEdit} rows={2} value={draft.welcomeMessage} onChange={(event) => setDraft({ ...draft, welcomeMessage: event.target.value })} /></Field>
              <Field label="System prompt (behavior)"><Textarea disabled={!canEdit} rows={3} value={draft.systemPrompt} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} /></Field>
              <Field label="Completion message template" hint="Use {{slot_key}} placeholders for collected fields."><Textarea disabled={!canEdit} rows={2} value={draft.completionMessageTemplate} onChange={(event) => setDraft({ ...draft, completionMessageTemplate: event.target.value })} /></Field>
              <Field label="Escalation message"><Textarea disabled={!canEdit} rows={2} value={draft.escalationMessage} onChange={(event) => setDraft({ ...draft, escalationMessage: event.target.value })} /></Field>
            </div>

            <Separator />

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <Eyebrow>Data to collect</Eyebrow>
                  <h4 className="text-lg font-semibold">Questions & fields</h4>
                </div>
                <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setDraft({ ...draft, slots: [...draft.slots, { key: `field_${draft.slots.length + 1}`, label: "New field", prompt: "Please provide this detail.", required: true, examples: [] }] })}>
                  <Plus className="h-4 w-4" /> Add field
                </Button>
              </div>
              <div className="grid gap-3">
                {draft.slots.map((slot, index) => (
                  <div key={`${slot.key}-${index}`} className="rounded-2xl border border-border bg-secondary/30 p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input disabled={!canEdit} value={slot.key} onChange={(event) => updateSlot(index, { key: event.target.value })} placeholder="field_key" />
                      <Input disabled={!canEdit} value={slot.label} onChange={(event) => updateSlot(index, { label: event.target.value })} placeholder="Label" />
                      <Textarea disabled={!canEdit} rows={2} className="md:col-span-2" value={slot.prompt} onChange={(event) => updateSlot(index, { prompt: event.target.value })} placeholder="Prompt the agent asks the caller" />
                      <Input disabled={!canEdit} className="md:col-span-2" value={slot.examples?.join(", ") ?? ""} onChange={(event) => updateSlot(index, { examples: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Examples, comma separated" />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input disabled={!canEdit} type="checkbox" checked={slot.required} onChange={(event) => updateSlot(index, { required: event.target.checked })} />
                        Required field
                      </label>
                      <Button size="sm" variant="ghost" disabled={!canEdit} className="text-rose-600 hover:bg-rose-50" onClick={() => setDraft({ ...draft, slots: draft.slots.filter((_, i) => i !== index) })}>
                        <Trash2 className="h-4 w-4" /> Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button disabled={!canEdit} onClick={() => void handleSave()}><Save className="h-4 w-4" /> Save agent</Button>
              {activeTemplate ? <Button variant="outline" disabled={!canEdit} onClick={() => applyTemplate(activeTemplate)}><RotateCcw className="h-4 w-4" /> Reset to template</Button> : null}
              {selectedProfile ? <Button variant="ghost" onClick={() => dispatch(setActiveScreen("assign"))}>Go to deploy →</Button> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <SectionHeader eyebrow="History" title="Version timeline" aside={<Badge variant="muted"><History className="h-3 w-3" /> {platform.versions.length} versions</Badge>} />
            <div className="mt-4 grid gap-3">
              {platform.versions.length === 0 ? (
                <p className="rounded-xl bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">Select a saved agent to view its version history.</p>
              ) : (
                platform.versions.map((version) => (
                  <div key={version.id} className="rounded-2xl border border-border bg-white/60 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <strong>Version {version.version}</strong>
                        <p className="text-sm text-muted-foreground">{version.changeSummary}</p>
                        <p className="text-xs text-muted-foreground">{version.changedBy.name} · {version.changedBy.role}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(version.changedAt).toLocaleString()}</span>
                    </div>
                    <div className="mt-3">
                      <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => void handleRestore(version.id)}><RotateCcw className="h-4 w-4" /> Restore</Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
