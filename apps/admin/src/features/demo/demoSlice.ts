import { createAsyncThunk, createSlice, nanoid, type PayloadAction } from "@reduxjs/toolkit";
import { createApiClient } from "./demoApi";
import type {
  CallDirection,
  CallPhase,
  DemoConfig,
  DemoMetrics,
  DemoSeedResult,
  DemoSession,
  SessionEvent,
  TargetContact,
  VoiceState
} from "./types";
import type { RootState } from "../../app/store";

interface DemoState {
  apiBaseUrl: string;
  config: DemoConfig | null;
  selectedScenarioId: string | null;
  selectedLanguage: "en-IN" | "hi-IN" | "kn-IN" | "ta-IN" | "ml-IN";
  direction: CallDirection;
  targetContact: TargetContact;
  session: DemoSession | null;
  transcript: Array<{ id: string; role: "system" | "agent" | "user"; title: string; text: string; pending?: boolean }>;
  events: SessionEvent[];
  metrics: DemoMetrics | null;
  seedResult: DemoSeedResult | null;
  lastAgentReply: string;
  pendingAgentReply: string;
  callPhase: CallPhase;
  voiceState: VoiceState;
  loading: boolean;
  error: string | null;
}

const initialState: DemoState = {
  apiBaseUrl: "http://127.0.0.1:5005",
  config: null,
  selectedScenarioId: null,
  selectedLanguage: "en-IN",
  direction: "inbound",
  targetContact: { name: "", phoneNumber: "" },
  session: null,
  transcript: [],
  events: [],
  metrics: null,
  seedResult: null,
  lastAgentReply: "",
  pendingAgentReply: "",
  callPhase: "idle",
  voiceState: "ready",
  loading: false,
  error: null
};

const selectApiBaseUrl = (state: RootState) => state.demo.apiBaseUrl;
const selectTenantId = (state: RootState) => state.platform.selectedTenantId ?? state.platform.tenants[0]?.id ?? "city-hospital";
const selectSelectedScenario = (state: RootState) => state.demo.config?.scenarios.find((scenario) => scenario.id === state.demo.selectedScenarioId) ?? null;

export const fetchDemoConfig = createAsyncThunk("demo/fetchConfig", async (_, { getState }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.get<DemoConfig>("/v1/demo/config", { params: { tenantId: selectTenantId(state) } });
  return response.data;
});

export const fetchMetrics = createAsyncThunk("demo/fetchMetrics", async (_, { getState }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.get<DemoMetrics>("/v1/metrics", { params: { tenantId: selectTenantId(state) } });
  return response.data;
});

export const seedDemoRecords = createAsyncThunk("demo/seedRecords", async (_, { getState, dispatch }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.post<DemoSeedResult>("/v1/demo/seed", { tenantId: selectTenantId(state) });
  await dispatch(fetchMetrics());
  return response.data;
});

export const fetchSessionEvents = createAsyncThunk("demo/fetchSessionEvents", async (_, { getState }) => {
  const state = getState() as RootState;
  if (!state.demo.session) return [] as SessionEvent[];
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.get<{ events: SessionEvent[] }>(`/v1/calls/session/${state.demo.session.id}/events`);
  return response.data.events;
});

export const startDemoSession = createAsyncThunk("demo/startSession", async (_, { getState, dispatch }) => {
  const state = getState() as RootState;
  const scenario = selectSelectedScenario(state);
  if (!scenario) throw new Error("Select a scenario first.");
  const api = createApiClient(selectApiBaseUrl(state));
  const direction = state.demo.direction;
  const target = state.demo.targetContact;
  const isOutbound = direction === "outbound";
  const response = await api.post("/v1/calls/session", {
    tenantId: selectTenantId(state),
    profileId: scenario.id,
    language: state.demo.selectedLanguage,
    direction,
    phoneNumber: isOutbound && target.phoneNumber.trim() ? target.phoneNumber.trim() : "+910000000000",
    displayName: isOutbound && target.name.trim() ? target.name.trim() : "Demo Caller"
  });
  await dispatch(fetchMetrics());
  return { session: response.data.session as DemoSession, scenario };
});

export const grantConsent = createAsyncThunk("demo/grantConsent", async (_, { getState, dispatch }) => {
  const state = getState() as RootState;
  if (!state.demo.session) throw new Error("No active session.");
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.post(`/v1/calls/session/${state.demo.session.id}/consent`, { consentGranted: true });
  await dispatch(fetchSessionEvents());
  await dispatch(fetchMetrics());
  return response.data.session as DemoSession;
});

export const sendUtterance = createAsyncThunk("demo/sendUtterance", async (text: string, { getState, dispatch }) => {
  const state = getState() as RootState;
  if (!state.demo.session) throw new Error("No active session.");
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.post(`/v1/calls/session/${state.demo.session.id}/turn`, {
    transcript: text,
    asrConfidence: 0.9,
    nluConfidence: 0.88,
    turnSwitchLatencyMs: 510
  });
  await dispatch(fetchSessionEvents());
  await dispatch(fetchMetrics());
  return { session: response.data.session as DemoSession, decision: response.data.decision, userText: text };
});

const demoSlice = createSlice({
  name: "demo",
  initialState,
  reducers: {
    setApiBaseUrl(state, action: PayloadAction<string>) { state.apiBaseUrl = action.payload; },
    selectScenario(state, action: PayloadAction<string>) {
      state.selectedScenarioId = action.payload;
      const scenario = state.config?.scenarios.find((item) => item.id === action.payload);
      if (scenario) state.selectedLanguage = scenario.language;
      state.session = null;
      state.lastAgentReply = "";
      state.pendingAgentReply = "";
      state.callPhase = "idle";
      state.transcript = [];
      state.events = [];
      state.error = null;
    },
    setSelectedLanguage(state, action: PayloadAction<DemoState["selectedLanguage"]>) { state.selectedLanguage = action.payload; },
    setCallDirection(state, action: PayloadAction<CallDirection>) { state.direction = action.payload; },
    setTargetContact(state, action: PayloadAction<TargetContact>) { state.targetContact = action.payload; },
    clearError(state) { state.error = null; },
    resetDemoWorkspace(state) {
      state.session = null;
      state.selectedScenarioId = null;
      state.lastAgentReply = "";
      state.pendingAgentReply = "";
      state.callPhase = "idle";
      state.transcript = [];
      state.events = [];
      state.metrics = null;
      state.seedResult = null;
      state.targetContact = { name: "", phoneNumber: "" };
      state.error = null;
    },
    setCallPhase(state, action: PayloadAction<CallPhase>) { state.callPhase = action.payload; },
    setVoiceState(state, action: PayloadAction<VoiceState>) { state.voiceState = action.payload; },
    commitAgentReply(state, action: PayloadAction<string>) { state.pendingAgentReply = ""; state.lastAgentReply = action.payload; },
    replacePendingAgentMessage(state, action: PayloadAction<{ text: string; pending: boolean }>) {
      const lastAgentIndex = [...state.transcript].reverse().findIndex((message) => message.role === "agent" && message.pending);
      if (lastAgentIndex === -1) {
        state.transcript.push({ id: nanoid(), role: "agent", title: "Agent", text: action.payload.text, pending: action.payload.pending });
        return;
      }
      const actualIndex = state.transcript.length - 1 - lastAgentIndex;
      state.transcript[actualIndex] = { ...state.transcript[actualIndex], text: action.payload.text, pending: action.payload.pending };
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDemoConfig.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchDemoConfig.fulfilled, (state, action) => {
        state.loading = false;
        state.config = action.payload;
        const currentScenario = action.payload.scenarios.find((item) => item.id === state.selectedScenarioId);
        const selected = currentScenario ?? action.payload.scenarios[0] ?? null;
        state.selectedScenarioId = selected?.id ?? null;
        if (selected) state.selectedLanguage = selected.language;
      })
      .addCase(fetchDemoConfig.rejected, (state, action) => { state.loading = false; state.error = action.error.message ?? "Unable to load demo config."; })
      .addCase(fetchMetrics.fulfilled, (state, action) => { state.metrics = action.payload; })
      .addCase(seedDemoRecords.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(seedDemoRecords.fulfilled, (state, action) => {
        state.loading = false;
        state.seedResult = action.payload;
        state.transcript.push({ id: nanoid(), role: "system", title: "Demo Seed", text: `${action.payload.seededCount} sample record${action.payload.seededCount === 1 ? "" : "s"} added for the current workspace.` });
      })
      .addCase(seedDemoRecords.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Unable to seed demo records.";
      })
      .addCase(fetchSessionEvents.fulfilled, (state, action) => { state.events = action.payload; })
      .addCase(startDemoSession.pending, (state) => { state.loading = true; state.error = null; state.callPhase = "dialing"; })
      .addCase(startDemoSession.fulfilled, (state, action) => {
        state.loading = false;
        state.session = action.payload.session;
        state.events = [];
        state.callPhase = "ringing";
        state.lastAgentReply = "";
        state.pendingAgentReply = "Before we continue, do you agree to this automated call being used for service support and quality monitoring?";
        state.transcript = [
          { id: nanoid(), role: "system", title: "Demo", text: `Session created for ${action.payload.scenario.title} in ${state.selectedLanguage}.` },
          { id: nanoid(), role: "agent", title: "Agent", text: state.pendingAgentReply, pending: true }
        ];
      })
      .addCase(startDemoSession.rejected, (state, action) => { state.loading = false; state.callPhase = "idle"; state.error = action.error.message ?? "Unable to start demo session."; })
      .addCase(grantConsent.pending, (state) => { state.callPhase = "consent"; })
      .addCase(grantConsent.fulfilled, (state, action) => {
        state.session = action.payload;
        const scenario = state.config?.scenarios.find((item) => item.id === state.selectedScenarioId);
        const followUp = scenario ? `Consent captured. ${scenario.starterPrompt}` : "Consent captured.";
        state.pendingAgentReply = followUp;
        state.callPhase = "speaking";
        state.transcript.push({ id: nanoid(), role: "system", title: "Consent", text: "Consent captured. The workflow can proceed." });
        state.transcript.push({ id: nanoid(), role: "agent", title: "Agent", text: followUp, pending: true });
      })
      .addCase(grantConsent.rejected, (state, action) => { state.error = action.error.message ?? "Unable to capture consent."; })
      .addCase(sendUtterance.pending, (state, action) => {
        state.callPhase = "thinking";
        state.transcript.push({ id: nanoid(), role: "user", title: "Caller", text: action.meta.arg });
      })
      .addCase(sendUtterance.fulfilled, (state, action) => {
        state.session = action.payload.session;
        state.pendingAgentReply = action.payload.decision.responseText;
        state.callPhase = action.payload.decision.action === "escalate_to_human" ? "escalated" : action.payload.decision.action === "complete_call" ? "completed" : "speaking";
        state.transcript.push({ id: nanoid(), role: "agent", title: action.payload.decision.action === "escalate_to_human" ? "Agent Escalation" : "Agent", text: action.payload.decision.responseText, pending: true });
        if (action.payload.decision.extractedSlots && Object.keys(action.payload.decision.extractedSlots).length > 0) state.transcript.push({ id: nanoid(), role: "system", title: "Slots", text: JSON.stringify(action.payload.decision.extractedSlots) });
        if (action.payload.decision.aiMetadata?.synthesizedVoice) state.transcript.push({ id: nanoid(), role: "system", title: "Voice Profile", text: `${action.payload.decision.aiMetadata.synthesizedVoice} via ${action.payload.decision.aiMetadata.promptStyle ?? "workflow"} prompt` });
        if (action.payload.decision.escalationSummary) state.transcript.push({ id: nanoid(), role: "system", title: "Escalation", text: action.payload.decision.escalationSummary.reason });
      })
      .addCase(sendUtterance.rejected, (state, action) => { state.callPhase = "listening"; state.error = action.error.message ?? "Unable to process caller utterance."; });
  }
});

export const { setApiBaseUrl, selectScenario, setSelectedLanguage, setCallDirection, setTargetContact, clearError, resetDemoWorkspace, setCallPhase, setVoiceState, commitAgentReply, replacePendingAgentMessage } = demoSlice.actions;
export default demoSlice.reducer;
