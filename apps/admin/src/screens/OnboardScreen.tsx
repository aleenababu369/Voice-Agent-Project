import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Sparkles } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { registerWorkspace } from "../features/platform/platformSlice";
import type { DomainDto } from "../features/platform/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Eyebrow, Field, SectionHeader, SimpleSelect } from "../components/common";
import { cn } from "@/lib/utils";

type Step = 0 | 1 | 2;

const DOMAIN_OPTIONS = [
  { value: "healthcare", label: "Healthcare — hospital / clinic" },
  { value: "education", label: "Education — institution / admissions" },
  { value: "frontdesk", label: "Front desk — office reception" }
];

const STEP_LABELS = ["Workspace", "Use case", "Review & create"];

export function OnboardScreen() {
  const dispatch = useAppDispatch();
  const templates = useAppSelector((state) => state.platform.templates);
  const loading = useAppSelector((state) => state.platform.loading);
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState({
    name: "",
    description: "",
    domainFocus: "healthcare" as DomainDto,
    adminContactName: "",
    templateId: ""
  });

  const domainTemplates = useMemo(() => templates.filter((template) => template.domain === form.domainFocus), [templates, form.domainFocus]);
  const selectedTemplate = templates.find((template) => template.id === form.templateId) ?? null;

  function patch(next: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...next }));
  }

  const canNext = step === 0 ? form.name.trim().length >= 2 : step === 1 ? Boolean(form.templateId) : true;

  async function handleCreate() {
    await dispatch(
      registerWorkspace({
        name: form.name.trim(),
        description: form.description.trim(),
        domainFocus: form.domainFocus,
        useCaseTemplateId: form.templateId || undefined,
        adminContactName: form.adminContactName.trim() || undefined
      })
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeader
        eyebrow="Step 1 of the workflow"
        title="Onboard a new client"
        subtitle="Register a workspace, choose a use case, and we provision a starter agent you can customize and deploy."
      />

      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, index) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold", index <= step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
              {index < step ? <Check className="h-4 w-4" /> : index + 1}
            </div>
            <span className={cn("text-sm", index === step ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
            {index < STEP_LABELS.length - 1 ? <div className="mx-1 hidden h-px flex-1 bg-border sm:block" /> : null}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          {step === 0 ? (
            <div className="grid gap-5">
              <Field label="Workspace / client name" hint="e.g. Sunrise Hospital, Riverside College">
                <Input value={form.name} onChange={(event) => patch({ name: event.target.value })} placeholder="Client name" />
              </Field>
              <Field label="Use case domain">
                <SimpleSelect value={form.domainFocus} onValueChange={(value) => patch({ domainFocus: value as DomainDto, templateId: "" })} options={DOMAIN_OPTIONS} />
              </Field>
              <Field label="Description">
                <Textarea rows={2} value={form.description} onChange={(event) => patch({ description: event.target.value })} placeholder="What does this workspace handle?" />
              </Field>
              <Field label="Workspace admin name" hint="Becomes the admin user for this workspace.">
                <Input value={form.adminContactName} onChange={(event) => patch({ adminContactName: event.target.value })} placeholder="Optional" />
              </Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Pick a starter use case for the <span className="font-medium capitalize">{form.domainFocus}</span> domain. You can fully customize it afterwards.</p>
              <div className="grid gap-3">
                {domainTemplates.map((template) => {
                  const selected = form.templateId === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => patch({ templateId: template.id })}
                      className={cn("rounded-2xl border p-4 text-left transition", selected ? "border-primary bg-primary/5" : "border-border bg-white/60 hover:border-primary/30")}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <strong>{template.name}</strong>
                        </div>
                        {selected ? <Badge><Check className="h-3 w-3" /> Selected</Badge> : <Badge variant="muted">{template.workflow}</Badge>}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{template.description}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {template.slots.filter((slot) => slot.required).map((slot) => (
                          <Badge key={slot.key} variant="secondary">{slot.label}</Badge>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-secondary/40 p-5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <strong className="text-lg">{form.name || "Untitled workspace"}</strong>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{form.description || "No description provided."}</p>
                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div><span className="text-muted-foreground">Domain:</span> <span className="capitalize">{form.domainFocus}</span></div>
                  <div><span className="text-muted-foreground">Use case:</span> {selectedTemplate?.name ?? "—"}</div>
                  <div><span className="text-muted-foreground">Admin:</span> {form.adminContactName || `${form.name} Admin`}</div>
                  <div><span className="text-muted-foreground">Starter agent:</span> created as draft</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Creating the workspace provisions an admin user and a draft starter agent. You will be taken to the agent builder next.</p>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((current) => (current - 1) as Step)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < 2 ? (
              <Button disabled={!canNext} onClick={() => setStep((current) => (current + 1) as Step)}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button disabled={loading || form.name.trim().length < 2} onClick={() => void handleCreate()}>
                <Check className="h-4 w-4" /> Create workspace
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
