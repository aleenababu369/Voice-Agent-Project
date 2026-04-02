import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  clearError,
  commitAgentReply,
  fetchDemoConfig,
  fetchMetrics,
  fetchSessionEvents,
  grantConsent,
  replacePendingAgentMessage,
  resetDemoWorkspace,
  selectScenario,
  sendUtterance,
  setApiBaseUrl,
  setCallPhase,
  setSelectedLanguage,
  setVoiceState,
  startDemoSession
} from "./features/demo/demoSlice";
import { useAppDispatch, useAppSelector } from "./app/hooks";
import {
  clearPlatformError,
  fetchAnalytics,
  fetchProfileVersions,
  fetchProfiles,
  fetchSessions,
  fetchTemplates,
  fetchTenants,
  fetchUsers,
  restoreProfileVersion,
  saveProfile,
  updateSessionFollowUp,
  selectActor,
  selectProfile,
  selectTenant
} from "./features/platform/platformSlice";
import type { AgentProfileDto, AgentProfileTemplateDto } from "./features/platform/types";
import { RecordsPanel } from "./components/RecordsPanel";

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type ViewMode = "simulator" | "profiles" | "records";

type DraftProfile = Omit<AgentProfileDto, "createdAt" | "updatedAt">;

const defaultTenantId = "city-hospital";

const emptyProfile: DraftProfile = {
  id: "",
  tenantId: defaultTenantId,
  name: "",
  domain: "education",
  workflow: "institution_reception",
  description: "",
  languages: ["en-IN"],
  welcomeMessage: "",
  systemPrompt: "",
  completionMessageTemplate: "",
  escalationMessage: "",
  slots: [{ key: "caller_name", label: "Caller name", prompt: "May I know your name?", required: true, examples: [] }]
};

function App() {
  const dispatch = useAppDispatch();
  const demo = useAppSelector((state) => state.demo);
  const platform = useAppSelector((state) => state.platform);
  const selectedTenant = platform.tenants.find((tenant) => tenant.id === platform.selectedTenantId) ?? platform.tenants[0] ?? null;
  const selectedScenario = demo.config?.scenarios.find((scenario) => scenario.id === demo.selectedScenarioId) ?? null;
  const selectedProfile = platform.profiles.find((profile) => profile.id === platform.selectedProfileId) ?? null;
  const selectedActor = platform.users.find((user) => user.id === platform.selectedActorId) ?? platform.users[0] ?? null;
  const canEditProfiles = selectedActor ? selectedActor.role !== "viewer" : false;
  const [viewMode, setViewMode] = useState<ViewMode>("simulator");
  const [input, setInput] = useState("");
  const [micStatus, setMicStatus] = useState("Checking");
  const [profileDraft, setProfileDraft] = useState<DraftProfile>(emptyProfile);
  const recognitionRef = useRef<InstanceType<RecognitionCtor> | null>(null);

  useEffect(() => {
    void dispatch(fetchTenants());
    void dispatch(fetchTemplates());
  }, [dispatch]);

  useEffect(() => {
    if (!platform.selectedTenantId) return;
    dispatch(resetDemoWorkspace());
    void dispatch(fetchUsers());
    void dispatch(fetchProfiles());
    void dispatch(fetchSessions());
    void dispatch(fetchAnalytics());
    void dispatch(fetchDemoConfig());
    void dispatch(fetchMetrics());
  }, [dispatch, platform.selectedTenantId]);

  useEffect(() => {
    if (selectedProfile) {
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = selectedProfile;
      setProfileDraft(draft);
      void dispatch(fetchProfileVersions(selectedProfile.id));
      return;
    }

    setProfileDraft((current) => ({
      ...emptyProfile,
      tenantId: selectedTenant?.id ?? defaultTenantId,
      domain: selectedTenant?.domainFocus ?? current.domain,
      workflow: selectedTenant?.domainFocus === "healthcare"
        ? "appointment_booking"
        : selectedTenant?.domainFocus === "frontdesk"
          ? "frontdesk_reception"
          : "institution_reception"
    }));
  }, [dispatch, selectedProfile, selectedTenant]);

  useEffect(() => {
    if (!demo.session) return;
    void dispatch(fetchSessionEvents());
  }, [dispatch, demo.session]);

  useEffect(() => {
    if (!demo.pendingAgentReply) return;
    let cursor = 0;
    dispatch(setCallPhase("speaking"));
    dispatch(replacePendingAgentMessage({ text: "", pending: true }));
    const interval = window.setInterval(() => {
      cursor = Math.min(cursor + 4, demo.pendingAgentReply.length);
      const nextText = demo.pendingAgentReply.slice(0, cursor);
      const done = cursor >= demo.pendingAgentReply.length;
      dispatch(replacePendingAgentMessage({ text: nextText, pending: !done }));
      if (done) {
        window.clearInterval(interval);
        dispatch(commitAgentReply(demo.pendingAgentReply));
      }
    }, 22);
    return () => window.clearInterval(interval);
  }, [dispatch, demo.pendingAgentReply]);

  useEffect(() => {
    if (!demo.lastAgentReply) return;
    if (!("speechSynthesis" in window)) {
      dispatch(setVoiceState("unsupported"));
      return;
    }
    window.speechSynthesis.cancel();
    dispatch(setVoiceState("speaking"));
    const utterance = new SpeechSynthesisUtterance(demo.lastAgentReply);
    utterance.lang = demo.selectedLanguage;
    utterance.rate = 1;
    utterance.onend = () => {
      dispatch(setVoiceState("ready"));
      dispatch(setCallPhase(demo.session?.status === "completed" ? "completed" : demo.session?.status === "escalated" ? "escalated" : "listening"));
    };
    window.speechSynthesis.speak(utterance);
  }, [dispatch, demo.lastAgentReply, demo.selectedLanguage, demo.session?.status]);

  useEffect(() => {
    const Recognition = (window as typeof window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
      ?? (window as typeof window & { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;
    if (!Recognition) {
      setMicStatus("Unsupported");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = demo.selectedLanguage;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setMicStatus("Listening"); dispatch(setCallPhase("listening")); };
    recognition.onend = () => setMicStatus("Ready");
    recognition.onerror = () => setMicStatus("Error");
    recognition.onresult = (event) => setInput(event.results[0][0].transcript);
    recognitionRef.current = recognition;
    setMicStatus("Ready");
  }, [dispatch, demo.selectedLanguage]);

  const completionPercent = Math.round((demo.metrics?.completionRate ?? 0) * 100);
  const escalationPercent = Math.round((demo.metrics?.escalationRate ?? 0) * 100);
  const confidenceScore = Math.round((((demo.metrics?.averageAsrConfidence ?? 0) + (demo.metrics?.averageNluConfidence ?? 0)) / 2) * 100);
  const phaseLabel = { idle: "Idle", dialing: "Dialing", ringing: "Ringing", consent: "Awaiting consent", listening: "Listening", thinking: "Understanding caller", speaking: "Agent speaking", completed: "Workflow completed", escalated: "Escalated to human" }[demo.callPhase];

  const activeTemplate = useMemo(() => platform.templates.find((template) => template.domain === profileDraft.domain && template.workflow === profileDraft.workflow) ?? null, [platform.templates, profileDraft.domain, profileDraft.workflow]);
  const templateCoverage = useMemo(() => {
    if (!activeTemplate) return { matched: [] as string[], missing: [] as string[] };
    const requiredKeys = activeTemplate.slots.filter((slot) => slot.required).map((slot) => slot.key);
    return {
      matched: requiredKeys.filter((key) => profileDraft.slots.some((slot) => slot.required && slot.key === key)),
      missing: requiredKeys.filter((key) => !profileDraft.slots.some((slot) => slot.required && slot.key === key))
    };
  }, [activeTemplate, profileDraft.slots]);

  async function refreshPlatformData() {
    await Promise.all([dispatch(fetchSessions()), dispatch(fetchAnalytics())]);
  }

  async function handleStartDemo() {
    await dispatch(startDemoSession()).unwrap();
    window.setTimeout(() => dispatch(setCallPhase("consent")), 650);
  }

  async function handleGrantConsent() {
    await dispatch(grantConsent()).unwrap();
  }

  async function handleSendUtterance() {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    await dispatch(sendUtterance(text)).unwrap();
    await refreshPlatformData();
  }

  async function handleSaveProfile() {
    const result = await dispatch(saveProfile({ ...profileDraft, tenantId: selectedTenant?.id ?? profileDraft.tenantId })).unwrap();
    void dispatch(fetchProfiles());
    void dispatch(fetchProfileVersions(result.profile.id));
  }

  async function handleRestoreVersion(versionId: string) {
    if (!platform.selectedProfileId) return;
    const result = await dispatch(restoreProfileVersion({ profileId: platform.selectedProfileId, versionId })).unwrap();
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = result.profile;
    setProfileDraft(draft);
  }

  function applyTemplate(template: AgentProfileTemplateDto) {
    setProfileDraft({
      id: "",
      tenantId: selectedTenant?.id ?? defaultTenantId,
      name: template.name,
      domain: template.domain,
      workflow: template.workflow,
      description: template.description,
      languages: [...template.languages],
      welcomeMessage: template.welcomeMessage,
      systemPrompt: template.systemPrompt,
      completionMessageTemplate: template.completionMessageTemplate,
      escalationMessage: template.escalationMessage,
      slots: template.slots.map((slot) => slot.examples ? { ...slot, examples: [...slot.examples] } : { ...slot })
    });
    dispatch(selectProfile(null));
    setViewMode("profiles");
  }

  function updateSlot(index: number, patch: Partial<AgentProfileDto["slots"][number]>) {
    setProfileDraft({ ...profileDraft, slots: profileDraft.slots.map((slot, i) => i === index ? { ...slot, ...patch } : slot) });
  }

  function handleSelectTenant(tenantId: string) {
    dispatch(selectTenant(tenantId));
  }

  function renderSimulator() {
    return (
      <>
        <aside className="rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl">
          <label className="mb-5 block"><span className="mb-2 block text-sm text-[var(--color-ink-700)]">API base URL</span><input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" value={demo.apiBaseUrl} onChange={(event) => dispatch(setApiBaseUrl(event.target.value))} onBlur={() => { void dispatch(fetchTenants()); void dispatch(fetchTemplates()); }} /></label>
          <label className="mb-5 block"><span className="mb-2 block text-sm text-[var(--color-ink-700)]">Workspace</span><select className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" value={selectedTenant?.id ?? ""} onChange={(event) => handleSelectTenant(event.target.value)}>{platform.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
          <label className="mb-5 block"><span className="mb-2 block text-sm text-[var(--color-ink-700)]">Language</span><select className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" value={demo.selectedLanguage} onChange={(event) => dispatch(setSelectedLanguage(event.target.value as typeof demo.selectedLanguage))}>{demo.config?.supportedLanguages.map((language) => <option key={language} value={language}>{language}</option>)}</select></label>
          <div className="mb-5 rounded-[24px] border border-teal-700/10 bg-gradient-to-r from-teal-50 to-white px-4 py-4"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Workspace focus</span><span className="rounded-full bg-white px-3 py-1 text-xs text-[var(--color-teal-800)]">{selectedTenant?.domainFocus ?? "general"}</span></div><strong className="block text-xl">{selectedTenant?.name ?? "Tenant workspace"}</strong><p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">{selectedTenant?.description ?? "Choose a tenant workspace to scope the demo and dashboard."}</p></div>
          <div className="mb-5"><span className="mb-3 block text-sm text-[var(--color-ink-700)]">Agent profiles</span><div className="grid gap-3">{demo.config?.scenarios.map((scenario) => <button key={scenario.id} type="button" onClick={() => dispatch(selectScenario(scenario.id))} className={`rounded-3xl border px-4 py-4 text-left transition ${scenario.id === demo.selectedScenarioId ? "border-teal-700/40 bg-teal-50" : "border-black/10 bg-amber-50/50"}`}><strong className="block text-base">{scenario.title}</strong><span className="mt-1 block text-sm leading-6 text-[var(--color-ink-700)]">{scenario.starterPrompt}</span><div className="mt-2 flex flex-wrap gap-2"><span className="inline-block rounded-full bg-white px-3 py-1 text-xs text-[var(--color-teal-700)]">{scenario.language}</span><span className="inline-block rounded-full bg-white px-3 py-1 text-xs text-[var(--color-ink-700)]">{scenario.workflow}</span></div></button>)}</div></div>
          <div className="mb-5 rounded-[24px] border border-teal-700/10 bg-gradient-to-r from-teal-50 to-white px-4 py-4"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Live call state</span><span className={`h-3 w-3 rounded-full ${demo.callPhase === "speaking" ? "bg-amber-500" : demo.callPhase === "thinking" ? "bg-sky-500" : demo.callPhase === "completed" ? "bg-emerald-500" : demo.callPhase === "escalated" ? "bg-rose-500" : "bg-teal-600"}`} /></div><strong className="block text-xl">{phaseLabel}</strong><p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">The simulator is tracking the active call stage for the selected workspace.</p></div>
          <div className="mb-5 grid grid-cols-2 gap-3 text-sm"><StatusCard label="Session" value={demo.session?.status ?? "Idle"} /><StatusCard label="Workflow" value={selectedScenario?.workflow ?? "Not started"} /><StatusCard label="Voice" value={demo.voiceState} /><StatusCard label="Mic" value={micStatus} /></div>
          <div className="flex flex-col gap-3"><button className="rounded-full bg-[var(--color-teal-700)] px-5 py-3 text-white disabled:opacity-50" disabled={demo.loading || !selectedScenario || !selectedTenant} onClick={() => void handleStartDemo()}>Start Demo Call</button><button className="rounded-full bg-stone-200 px-5 py-3 disabled:opacity-50" disabled={!demo.session || demo.session.consentCaptured} onClick={() => void handleGrantConsent()}>Grant Consent</button></div>
        </aside>
        <section className="rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Conversation</p><h2 className="text-3xl">{selectedScenario?.title ?? "Choose a profile"}</h2><p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">Workspace: {selectedTenant?.name ?? "Tenant workspace"}</p></div><div className="rounded-full bg-amber-100 px-4 py-2 text-sm text-amber-700">Multi-purpose AI agent</div></div>
          <div className="mt-5 grid gap-3">{demo.config?.notes.map((note) => <div key={note} className="rounded-2xl bg-amber-50 px-4 py-3 text-[var(--color-ink-700)]">{note}</div>)}</div>
          {(demo.error || platform.error) ? <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-rose-700"><div className="flex items-center justify-between gap-3"><span>{demo.error ?? platform.error}</span><button type="button" className="rounded-full border border-rose-200 px-3 py-1 text-sm" onClick={() => { dispatch(clearError()); dispatch(clearPlatformError()); }}>Dismiss</button></div></div> : null}
          <div className="mt-4 flex flex-wrap gap-3"><SignalPill label="Workspace" value={selectedTenant?.name ?? "Tenant"} tone="teal" /><SignalPill label="Phase" value={phaseLabel} tone="teal" /><SignalPill label="Language" value={demo.selectedLanguage} tone="teal" /><SignalPill label="Voice" value={demo.voiceState} tone={demo.voiceState === "speaking" ? "amber" : "teal"} /></div>
          <div className="mt-5 max-h-[480px] min-h-[320px] overflow-auto pr-1">{demo.transcript.length === 0 ? <div className="rounded-3xl bg-stone-100 px-5 py-4 text-[var(--color-ink-700)]">Start a demo call to see the conversation timeline here.</div> : demo.transcript.map((message) => <div key={message.id} className={`mb-3 rounded-3xl px-4 py-3 leading-7 ${message.role === "agent" ? "mr-16 bg-teal-50" : message.role === "user" ? "ml-16 bg-amber-50" : "bg-stone-100 text-[var(--color-ink-700)]"}`}><small className="mb-1 block text-sm text-[var(--color-ink-700)]">{message.title}</small><div>{message.text || (message.pending ? "..." : "")}</div></div>)}</div>
          <div className="mt-5"><textarea rows={4} className="w-full rounded-3xl border border-black/10 bg-white px-4 py-3" placeholder={demo.callPhase === "thinking" ? "The agent is preparing a response..." : "Type what the caller says here..."} value={input} onChange={(event) => setInput(event.target.value)} /><div className="mt-3 flex flex-wrap gap-3"><button className="rounded-full bg-[var(--color-teal-700)] px-5 py-3 text-white disabled:opacity-50" disabled={!demo.session?.consentCaptured || !input.trim() || demo.callPhase === "thinking" || demo.callPhase === "speaking"} onClick={() => void handleSendUtterance()}>Send Utterance</button><button className="rounded-full border border-teal-700/20 px-5 py-3 text-[var(--color-teal-800)] disabled:opacity-50" disabled={!recognitionRef.current} onClick={() => recognitionRef.current?.start()}>Use Microphone</button><button className="rounded-full border border-teal-700/20 px-5 py-3 text-[var(--color-teal-800)] disabled:opacity-50" disabled={!selectedScenario} onClick={() => setInput(selectedScenario?.sampleUtterance ?? "")}>Use Sample</button></div></div>
        </section>
        <aside className="rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl"><div><p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Operations View</p><h2 className="text-3xl">Live Metrics</h2><p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">Scoped to {selectedTenant?.name ?? "the selected tenant"}.</p></div><div className="mt-5 grid gap-3"><MetricCard label="Total turns" value={String(demo.metrics?.totalTurns ?? 0)} /><MetricCard label="Avg latency" value={`${demo.metrics?.averageLatencyMs ?? 0} ms`} /><MetricCard label="ASR confidence" value={String(demo.metrics?.averageAsrConfidence ?? 0)} /><MetricCard label="NLU confidence" value={String(demo.metrics?.averageNluConfidence ?? 0)} /><MetricCard label="Escalation rate" value={`${escalationPercent}%`} /><MetricCard label="Completion rate" value={`${completionPercent}%`} /></div><div className="mt-6 rounded-[24px] bg-gradient-to-b from-teal-50 to-white px-4 py-4"><p className="text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Demo Quality</p><div className="mt-3 grid gap-3"><QualityBar label="Task completion" value={completionPercent} tone="emerald" /><QualityBar label="Recognition confidence" value={confidenceScore} tone="teal" /><QualityBar label="Escalation control" value={100 - escalationPercent} tone="amber" /></div></div></aside>
      </>
    );
  }

  function renderProfiles() {
    return (
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-2xl">Agent Profiles</h2><p className="mt-1 text-sm text-[var(--color-ink-700)]">{selectedTenant?.name ?? "Tenant workspace"}</p></div><button className="rounded-full border border-teal-700/20 px-4 py-2 text-sm text-[var(--color-teal-800)]" onClick={() => { dispatch(selectProfile(null)); setProfileDraft({ ...emptyProfile, tenantId: selectedTenant?.id ?? defaultTenantId, domain: selectedTenant?.domainFocus ?? "education", workflow: selectedTenant?.domainFocus === "healthcare" ? "appointment_booking" : selectedTenant?.domainFocus === "frontdesk" ? "frontdesk_reception" : "institution_reception" }); }}>New</button></div>
          <div className="grid gap-3">{platform.profiles.map((profile) => <button key={profile.id} type="button" onClick={() => dispatch(selectProfile(profile.id))} className={`rounded-3xl border px-4 py-4 text-left ${platform.selectedProfileId === profile.id ? "border-teal-700/40 bg-teal-50" : "border-black/10 bg-stone-50"}`}><strong className="block">{profile.name}</strong><span className="mt-1 block text-sm text-[var(--color-ink-700)]">{profile.domain} · {profile.workflow}</span><span className="mt-2 inline-block rounded-full bg-white px-3 py-1 text-xs text-[var(--color-teal-800)]">{profile.tenantId}</span></button>)}</div>
        </aside>
        <section className="space-y-5">
          <div className="rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between gap-3"><div><p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Admin Access</p><h2 className="text-3xl">Team governance</h2></div><div className="rounded-full bg-stone-100 px-4 py-2 text-sm text-[var(--color-ink-700)]">Role-based control</div></div>
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <Field label="Active admin"><select className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" value={selectedActor?.id ?? ""} onChange={(event) => dispatch(selectActor(event.target.value))}>{platform.users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role} · {user.scope} · {user.tenantId}</option>)}</select></Field>
              <div className="rounded-3xl bg-amber-50 px-4 py-4 text-sm leading-6 text-[var(--color-ink-700)]">{selectedActor ? `${selectedActor.name} is acting as ${selectedActor.role}. Scope: ${selectedActor.scope}. Tenant access: ${selectedActor.tenantId}. ${canEditProfiles ? "This user can create, edit, and restore profiles within scope." : "This user has read-only access."}` : "Select an admin user to manage permissions."}</div>
            </div>
          </div>
          <div className="rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between gap-3"><div><p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Profile Templates</p><h2 className="text-3xl">Start with a guided use case</h2><p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">Templates apply inside the selected workspace.</p></div><div className="rounded-full bg-stone-100 px-4 py-2 text-sm text-[var(--color-ink-700)]">Zero-cost demo ready</div></div>
            <div className="grid gap-4 lg:grid-cols-3">{platform.templates.map((template) => <div key={template.id} className="rounded-3xl border border-black/10 bg-stone-50 p-4"><div className="flex items-start justify-between gap-3"><div><strong className="block text-lg">{template.name}</strong><span className="mt-1 block text-sm text-[var(--color-ink-700)]">{template.domain} · {template.workflow}</span></div><button className="rounded-full bg-[var(--color-teal-700)] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!canEditProfiles} onClick={() => applyTemplate(template)}>Use template</button></div><p className="mt-3 text-sm leading-6 text-[var(--color-ink-700)]">{template.description}</p><div className="mt-4 flex flex-wrap gap-2">{template.slots.filter((slot) => slot.required).map((slot) => <span key={slot.key} className="rounded-full bg-white px-3 py-1 text-xs text-[var(--color-teal-800)]">{slot.label}</span>)}</div></div>)}</div>
          </div>
          <section className="rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl">
            <div className="mb-5"><p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Behavior Customization</p><h2 className="text-3xl">{profileDraft.name || "Create or edit an agent profile"}</h2><p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">Tenant workspace: {selectedTenant?.name ?? profileDraft.tenantId}</p></div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Profile name"><input disabled={!canEditProfiles} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" value={profileDraft.name} onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })} /></Field>
              <Field label="Tenant workspace"><input disabled className="w-full rounded-2xl border border-black/10 bg-stone-100 px-4 py-3 text-[var(--color-ink-700)]" value={selectedTenant?.name ?? profileDraft.tenantId} /></Field>
              <Field label="Domain"><select disabled={!canEditProfiles} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" value={profileDraft.domain} onChange={(e) => setProfileDraft({ ...profileDraft, domain: e.target.value as AgentProfileDto["domain"] })}><option value="education">education</option><option value="healthcare">healthcare</option><option value="frontdesk">frontdesk</option></select></Field>
              <Field label="Workflow"><select disabled={!canEditProfiles} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" value={profileDraft.workflow} onChange={(e) => setProfileDraft({ ...profileDraft, workflow: e.target.value })}>{platform.templates.filter((template) => template.domain === profileDraft.domain).map((template) => <option key={template.id} value={template.workflow}>{template.workflow}</option>)}</select></Field>
              <Field label="Languages (comma separated)"><input disabled={!canEditProfiles} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" value={profileDraft.languages.join(", ")} onChange={(e) => setProfileDraft({ ...profileDraft, languages: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>
            </div>
            {activeTemplate ? <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><div className="rounded-3xl bg-amber-50 px-4 py-4"><p className="text-xs uppercase tracking-[0.14em] text-amber-700">Validation Rules</p><div className="mt-3 grid gap-2">{activeTemplate.validationRules.map((rule) => <div key={rule} className="rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-[var(--color-ink-700)]">{rule}</div>)}</div></div><div className="rounded-3xl bg-teal-50 px-4 py-4"><p className="text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Required Field Coverage</p><div className="mt-3 grid gap-2">{templateCoverage.matched.map((key) => <div key={key} className="rounded-2xl bg-white px-4 py-3 text-sm text-emerald-700">Included: {key}</div>)}{templateCoverage.missing.map((key) => <div key={key} className="rounded-2xl bg-white px-4 py-3 text-sm text-rose-700">Missing: {key}</div>)}</div></div></div> : null}
            <div className="mt-4 grid gap-4">
              <Field label="Description"><textarea disabled={!canEditProfiles} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" rows={2} value={profileDraft.description} onChange={(e) => setProfileDraft({ ...profileDraft, description: e.target.value })} /></Field>
              <Field label="Welcome message"><textarea disabled={!canEditProfiles} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" rows={2} value={profileDraft.welcomeMessage} onChange={(e) => setProfileDraft({ ...profileDraft, welcomeMessage: e.target.value })} /></Field>
              <Field label="System prompt"><textarea disabled={!canEditProfiles} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" rows={3} value={profileDraft.systemPrompt} onChange={(e) => setProfileDraft({ ...profileDraft, systemPrompt: e.target.value })} /></Field>
              <Field label="Completion template"><textarea disabled={!canEditProfiles} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" rows={2} value={profileDraft.completionMessageTemplate} onChange={(e) => setProfileDraft({ ...profileDraft, completionMessageTemplate: e.target.value })} /></Field>
              <Field label="Escalation message"><textarea disabled={!canEditProfiles} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" rows={2} value={profileDraft.escalationMessage} onChange={(e) => setProfileDraft({ ...profileDraft, escalationMessage: e.target.value })} /></Field>
            </div>
            <div className="mt-6"><div className="mb-3 flex items-center justify-between"><h3 className="text-xl">Data fields to collect</h3><button className="rounded-full border border-teal-700/20 px-4 py-2 text-sm text-[var(--color-teal-800)] disabled:opacity-50" disabled={!canEditProfiles} onClick={() => setProfileDraft({ ...profileDraft, slots: [...profileDraft.slots, { key: `field_${profileDraft.slots.length + 1}`, label: "New field", prompt: "Please provide this detail.", required: true, examples: [] }] })}>Add Field</button></div><div className="grid gap-3">{profileDraft.slots.map((slot, index) => <div key={`${slot.key}-${index}`} className="rounded-3xl bg-stone-50 p-4"><div className="grid gap-3 md:grid-cols-2"><input disabled={!canEditProfiles} className="rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" value={slot.key} onChange={(e) => updateSlot(index, { key: e.target.value })} placeholder="field key" /><input disabled={!canEditProfiles} className="rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" value={slot.label} onChange={(e) => updateSlot(index, { label: e.target.value })} placeholder="label" /><textarea disabled={!canEditProfiles} className="md:col-span-2 rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" rows={2} value={slot.prompt} onChange={(e) => updateSlot(index, { prompt: e.target.value })} placeholder="prompt to ask caller" /><input disabled={!canEditProfiles} className="md:col-span-2 rounded-2xl border border-black/10 bg-white px-4 py-3 disabled:opacity-60" value={slot.examples?.join(", ") ?? ""} onChange={(e) => updateSlot(index, { examples: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="examples, separated by commas" /></div><div className="mt-3 flex items-center justify-between"><label className="text-sm text-[var(--color-ink-700)]"><input disabled={!canEditProfiles} type="checkbox" className="mr-2" checked={slot.required} onChange={(e) => updateSlot(index, { required: e.target.checked })} />Required field</label><button className="rounded-full border border-rose-200 px-3 py-1 text-sm text-rose-700 disabled:opacity-50" disabled={!canEditProfiles} onClick={() => setProfileDraft({ ...profileDraft, slots: profileDraft.slots.filter((_, i) => i !== index) })}>Remove</button></div></div>)}</div></div>
            <div className="mt-6 flex flex-wrap gap-3"><button className="rounded-full bg-[var(--color-teal-700)] px-5 py-3 text-white disabled:opacity-50" disabled={!canEditProfiles} onClick={() => void handleSaveProfile()}>Save Agent Profile</button>{activeTemplate ? <button className="rounded-full border border-teal-700/20 px-5 py-3 text-[var(--color-teal-800)] disabled:opacity-50" disabled={!canEditProfiles} onClick={() => applyTemplate(activeTemplate)}>Reset to Template</button> : null}</div>
          </section>
          <section className="rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between"><div><p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Profile History</p><h2 className="text-3xl">Version timeline</h2></div><div className="rounded-full bg-stone-100 px-4 py-2 text-sm text-[var(--color-ink-700)]">{platform.versions.length} versions</div></div>
            <div className="grid gap-3">{platform.versions.length === 0 ? <div className="rounded-2xl bg-stone-100 px-4 py-3 text-[var(--color-ink-700)]">Select a saved profile to view version history.</div> : platform.versions.map((version) => <div key={version.id} className="rounded-3xl border border-black/10 bg-stone-50 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><strong>Version {version.version}</strong><div className="mt-1 text-sm text-[var(--color-ink-700)]">{version.changeSummary}</div><div className="mt-1 text-sm text-[var(--color-ink-700)]">{version.changedBy.name} · {version.changedBy.role}</div></div><div className="text-sm text-[var(--color-ink-700)]">{new Date(version.changedAt).toLocaleString()}</div></div><div className="mt-3 flex flex-wrap gap-2">{version.profile.slots.filter((slot) => slot.required).map((slot) => <span key={slot.key} className="rounded-full bg-white px-3 py-1 text-xs text-[var(--color-teal-800)]">{slot.key}</span>)}</div><div className="mt-3"><button className="rounded-full border border-teal-700/20 px-4 py-2 text-sm text-[var(--color-teal-800)] disabled:opacity-50" disabled={!canEditProfiles} onClick={() => void handleRestoreVersion(version.id)}>Restore This Version</button></div></div>)}</div>
          </section>
        </section>
      </div>
    );
  }

  function renderRecords() {
    return <RecordsPanel analytics={platform.analytics} sessions={platform.sessions} tenant={selectedTenant} users={platform.users} canEdit={canEditProfiles} onRefresh={() => { void refreshPlatformData(); }} onUpdateFollowUp={async (input) => { await dispatch(updateSessionFollowUp(input)).unwrap(); }} />;
  }

  return (
    <main className="mx-auto min-h-screen w-[min(1320px,calc(100%-28px))] py-7 text-[var(--color-ink-900)]">
      <section className="rounded-[28px] border border-black/10 bg-white/85 p-7 shadow-[0_24px_60px_rgba(68,49,26,0.12)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--color-teal-700)]">Multi-Purpose Platform</p><h1 className="mb-3 text-5xl leading-[0.95] md:text-7xl">AI Calling Agent Control Center</h1><p className="max-w-4xl text-lg leading-8 text-[var(--color-ink-700)]">Customize what the agent says, what it asks, and what data it collects for hospitals, front desks, or education institutions. Each tenant workspace keeps its own agent behavior, records, analytics, and admin access isolated inside the same platform.</p></div><div className="min-w-56 rounded-[22px] bg-gradient-to-b from-teal-50 to-amber-50 px-5 py-4"><span className="block text-sm text-[var(--color-ink-700)]">Active workspace</span><strong className="mt-1 block text-3xl">{selectedTenant?.name ?? "Loading"}</strong><span className="mt-2 block text-sm text-[var(--color-ink-700)]">{selectedTenant?.domainFocus ?? "workspace"}</span></div></div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]"><Field label="Workspace selector"><select className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" value={selectedTenant?.id ?? ""} onChange={(event) => handleSelectTenant(event.target.value)}>{platform.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.domainFocus}</option>)}</select></Field><div className="rounded-3xl bg-stone-100 px-4 py-4 text-sm leading-6 text-[var(--color-ink-700)]">{selectedTenant?.description ?? "The workspace selector scopes the simulator, profile builder, records, analytics, and admin list."}</div></div>
        <div className="mt-6 flex flex-wrap gap-3"><TabButton label="Simulator" active={viewMode === "simulator"} onClick={() => setViewMode("simulator")} /><TabButton label="Agent Profiles" active={viewMode === "profiles"} onClick={() => setViewMode("profiles")} /><TabButton label="Collected Records" active={viewMode === "records"} onClick={() => setViewMode("records")} /></div>
      </section>
      <section className={`mt-5 grid gap-5 ${viewMode === "simulator" ? "xl:grid-cols-[320px_minmax(0,1fr)_320px]" : ""}`}>{viewMode === "simulator" ? renderSimulator() : viewMode === "profiles" ? renderProfiles() : renderRecords()}</section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-sm text-[var(--color-ink-700)]">{label}</span>{children}</label>; }
function StatusCard({ label, value }: { label: string; value: string }) { return <div className="rounded-3xl bg-stone-100 px-4 py-3"><span className="mb-1 block text-xs uppercase tracking-[0.12em] text-[var(--color-ink-700)]">{label}</span><strong className="block text-sm leading-6">{value}</strong></div>; }
function MetricCard({ label, value }: { label: string; value: string }) { return <div className="rounded-3xl bg-gradient-to-b from-teal-50 to-white px-4 py-3"><span className="mb-1 block text-xs uppercase tracking-[0.12em] text-[var(--color-ink-700)]">{label}</span><strong className="block text-lg leading-6">{value}</strong></div>; }
function SignalPill({ label, value, tone }: { label: string; value: string; tone: "teal" | "amber" }) { const classes = tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-teal-100 text-teal-800"; return <div className={`rounded-full px-4 py-2 text-sm ${classes}`}>{label}: {value}</div>; }
function QualityBar({ label, value, tone }: { label: string; value: number; tone: "emerald" | "teal" | "amber" }) { const barTone = tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-teal-600"; return <div><div className="mb-1 flex items-center justify-between text-sm text-[var(--color-ink-700)]"><span>{label}</span><span>{value}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white"><div className={`h-full ${barTone}`} style={{ width: `${Math.max(6, Math.min(100, value))}%` }} /></div></div>; }
function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) { return <button className={`rounded-full px-5 py-3 text-sm ${active ? "bg-[var(--color-teal-700)] text-white" : "border border-teal-700/20 text-[var(--color-teal-800)]"}`} onClick={onClick}>{label}</button>; }

export default App;


