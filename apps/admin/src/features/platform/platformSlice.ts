import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { createApiClient } from "../demo/demoApi";
import { selectAuthToken } from "../auth/authSlice";
import type { RootState } from "../../app/store";
import type {
  AgentProfileDto,
  AgentProfileTemplateDto,
  AgentProfileVersionDto,
  CallDetailDto,
  CampaignDto,
  FollowUpStatusDto,
  OperationDto,
  OperationStatusDto,
  PlatformAnalyticsDto,
  ProspectDto,
  SessionOutcomeTypeDto,
  SessionRecordDto,
  TenantDailyReportDto
} from "./types";

const selectApiBaseUrl = (state: RootState) => state.demo.apiBaseUrl;
const client = (state: RootState) => createApiClient(selectApiBaseUrl(state), selectAuthToken(state));

function extractError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: { issues?: string[]; error?: string } } }).response?.data;
    return data?.issues?.join(" ") ?? data?.error ?? fallback;
  }
  return fallback;
}

type DialerStatus = "idle" | "running" | "paused" | "stopped" | "completed";

interface DialerState {
  campaignId: string | null;
  status: DialerStatus;
  queue: string[];
  currentProspectId: string | null;
  completedIds: string[];
  failedIds: string[];
  total: number;
}

interface PlatformState {
  profiles: AgentProfileDto[];
  templates: AgentProfileTemplateDto[];
  versions: AgentProfileVersionDto[];
  selectedProfileId: string | null;
  sessions: SessionRecordDto[];
  operations: OperationDto[];
  prospects: ProspectDto[];
  prospectDetail: { prospect: ProspectDto; sessions: SessionRecordDto[]; operations: OperationDto[] } | null;
  campaigns: CampaignDto[];
  campaignDetail: { campaign: CampaignDto; prospects: ProspectDto[] } | null;
  callDetail: CallDetailDto | null;
  analytics: PlatformAnalyticsDto | null;
  dailyReport: TenantDailyReportDto | null;
  dialer: DialerState;
  loading: boolean;
  error: string | null;
  notice: string | null;
}

const initialDialer: DialerState = { campaignId: null, status: "idle", queue: [], currentProspectId: null, completedIds: [], failedIds: [], total: 0 };

const initialState: PlatformState = {
  profiles: [],
  templates: [],
  versions: [],
  selectedProfileId: null,
  sessions: [],
  operations: [],
  prospects: [],
  prospectDetail: null,
  campaigns: [],
  campaignDetail: null,
  callDetail: null,
  analytics: null,
  dailyReport: null,
  dialer: initialDialer,
  loading: false,
  error: null,
  notice: null
};

// ---- Agents ----
export const fetchTemplates = createAsyncThunk("platform/fetchTemplates", async (_, { getState }) => {
  const response = await client(getState() as RootState).get<{ templates: AgentProfileTemplateDto[] }>("/v1/agent-profile-templates");
  return response.data.templates;
});

export const fetchProfiles = createAsyncThunk("platform/fetchProfiles", async (_, { getState }) => {
  const response = await client(getState() as RootState).get<{ profiles: AgentProfileDto[] }>("/v1/agent-profiles");
  return response.data.profiles;
});

export const fetchProfileVersions = createAsyncThunk("platform/fetchProfileVersions", async (profileId: string, { getState }) => {
  const response = await client(getState() as RootState).get<{ versions: AgentProfileVersionDto[] }>(`/v1/agent-profiles/${profileId}/versions`);
  return { profileId, versions: response.data.versions };
});

export const saveProfile = createAsyncThunk("platform/saveProfile", async (profile: Omit<AgentProfileDto, "createdAt" | "updatedAt">, { getState, dispatch, rejectWithValue }) => {
  const api = client(getState() as RootState);
  try {
    const response = profile.id
      ? await api.put<{ profile: AgentProfileDto; versions: AgentProfileVersionDto[] }>(`/v1/agent-profiles/${profile.id}`, { profile })
      : await api.post<{ profile: AgentProfileDto; versions: AgentProfileVersionDto[] }>("/v1/agent-profiles", { profile });
    await dispatch(fetchProfiles());
    return response.data;
  } catch (error) {
    return rejectWithValue(extractError(error, "Unable to save agent."));
  }
});

export const deployProfile = createAsyncThunk("platform/deployProfile", async ({ profileId, deployed }: { profileId: string; deployed: boolean }, { getState, dispatch, rejectWithValue }) => {
  const api = client(getState() as RootState);
  try {
    const response = await api.post<{ profile: AgentProfileDto; versions: AgentProfileVersionDto[] }>(`/v1/agent-profiles/${profileId}/deploy`, { deployed });
    await dispatch(fetchProfiles());
    return response.data;
  } catch (error) {
    return rejectWithValue(extractError(error, "Unable to update deployment."));
  }
});

export const restoreProfileVersion = createAsyncThunk("platform/restoreProfileVersion", async ({ profileId, versionId }: { profileId: string; versionId: string }, { getState, dispatch, rejectWithValue }) => {
  const api = client(getState() as RootState);
  try {
    const response = await api.post<{ profile: AgentProfileDto; versions: AgentProfileVersionDto[] }>(`/v1/agent-profiles/${profileId}/restore`, { versionId });
    await dispatch(fetchProfiles());
    return response.data;
  } catch (error) {
    return rejectWithValue(extractError(error, "Unable to restore version."));
  }
});

// ---- Calls / records ----
export const fetchSessions = createAsyncThunk("platform/fetchSessions", async (_, { getState }) => {
  const response = await client(getState() as RootState).get<{ sessions: SessionRecordDto[] }>("/v1/calls/sessions");
  return response.data.sessions;
});

export const fetchCallDetail = createAsyncThunk("platform/fetchCallDetail", async (sessionId: string, { getState }) => {
  const response = await client(getState() as RootState).get<CallDetailDto>(`/v1/calls/session/${sessionId}/analytics`);
  return response.data;
});

export const updateSessionFollowUp = createAsyncThunk("platform/updateSessionFollowUp", async ({ sessionId, status, assignee, notes }: { sessionId: string; status: FollowUpStatusDto; assignee?: string; notes?: string }, { getState, dispatch, rejectWithValue }) => {
  const api = client(getState() as RootState);
  try {
    const response = await api.put<{ session: SessionRecordDto }>(`/v1/calls/session/${sessionId}/follow-up`, { status, ...(assignee ? { assignee } : {}), ...(notes ? { notes } : {}) });
    await Promise.all([dispatch(fetchSessions()), dispatch(fetchAnalytics())]);
    return response.data.session;
  } catch (error) {
    return rejectWithValue(extractError(error, "Unable to update follow-up."));
  }
});

export const updateSessionOutcome = createAsyncThunk("platform/updateSessionOutcome", async ({ sessionId, type, scheduledFor, referenceId, notes }: { sessionId: string; type: SessionOutcomeTypeDto; scheduledFor?: string; referenceId?: string; notes?: string }, { getState, dispatch, rejectWithValue }) => {
  const api = client(getState() as RootState);
  try {
    const response = await api.put<{ session: SessionRecordDto }>(`/v1/calls/session/${sessionId}/outcome`, { type, ...(scheduledFor ? { scheduledFor } : {}), ...(referenceId ? { referenceId } : {}), ...(notes ? { notes } : {}) });
    await Promise.all([dispatch(fetchSessions()), dispatch(fetchAnalytics())]);
    return response.data.session;
  } catch (error) {
    return rejectWithValue(extractError(error, "Unable to update outcome."));
  }
});

// ---- Operations ----
export const fetchOperations = createAsyncThunk("platform/fetchOperations", async (_, { getState }) => {
  const response = await client(getState() as RootState).get<{ operations: OperationDto[] }>("/v1/operations");
  return response.data.operations;
});

export const updateOperation = createAsyncThunk("platform/updateOperation", async ({ operationId, status }: { operationId: string; status: OperationStatusDto }, { getState, dispatch, rejectWithValue }) => {
  const api = client(getState() as RootState);
  try {
    const response = await api.put<{ operation: OperationDto }>(`/v1/operations/${operationId}/status`, { status });
    await dispatch(fetchOperations());
    return response.data.operation;
  } catch (error) {
    return rejectWithValue(extractError(error, "Unable to update operation."));
  }
});

// ---- Prospects ----
export const fetchProspects = createAsyncThunk("platform/fetchProspects", async (_, { getState }) => {
  const response = await client(getState() as RootState).get<{ prospects: ProspectDto[] }>("/v1/prospects");
  return response.data.prospects;
});

export const createProspect = createAsyncThunk("platform/createProspect", async (input: { name: string; phoneNumber: string; email?: string; fields?: Record<string, string>; campaignId?: string }, { getState, dispatch, rejectWithValue }) => {
  const api = client(getState() as RootState);
  try {
    const response = await api.post<{ prospect: ProspectDto }>("/v1/prospects", input);
    await dispatch(fetchProspects());
    return response.data.prospect;
  } catch (error) {
    return rejectWithValue(extractError(error, "Unable to add prospect."));
  }
});

export const fetchProspectDetail = createAsyncThunk("platform/fetchProspectDetail", async (prospectId: string, { getState }) => {
  const response = await client(getState() as RootState).get<{ prospect: ProspectDto; sessions: SessionRecordDto[]; operations: OperationDto[] }>(`/v1/prospects/${prospectId}`);
  return response.data;
});

// ---- Campaigns ----
export const fetchCampaigns = createAsyncThunk("platform/fetchCampaigns", async (_, { getState }) => {
  const response = await client(getState() as RootState).get<{ campaigns: CampaignDto[] }>("/v1/campaigns");
  return response.data.campaigns;
});

export const createCampaign = createAsyncThunk("platform/createCampaign", async (input: { name: string; direction: "inbound" | "outbound"; agentProfileId: string }, { getState, dispatch, rejectWithValue }) => {
  const api = client(getState() as RootState);
  try {
    const response = await api.post<{ campaign: CampaignDto }>("/v1/campaigns", input);
    await dispatch(fetchCampaigns());
    return response.data.campaign;
  } catch (error) {
    return rejectWithValue(extractError(error, "Unable to create campaign."));
  }
});

export const fetchCampaignDetail = createAsyncThunk("platform/fetchCampaignDetail", async (campaignId: string, { getState }) => {
  const response = await client(getState() as RootState).get<{ campaign: CampaignDto; prospects: ProspectDto[] }>(`/v1/campaigns/${campaignId}`);
  return response.data;
});

export const addProspectsToCampaign = createAsyncThunk("platform/addProspectsToCampaign", async ({ campaignId, prospectIds }: { campaignId: string; prospectIds: string[] }, { getState, dispatch, rejectWithValue }) => {
  const api = client(getState() as RootState);
  try {
    await api.post(`/v1/campaigns/${campaignId}/prospects`, { prospectIds });
    await dispatch(fetchCampaignDetail(campaignId));
    return true;
  } catch (error) {
    return rejectWithValue(extractError(error, "Unable to add prospects."));
  }
});

export const setCampaignStatus = createAsyncThunk("platform/setCampaignStatus", async ({ campaignId, active }: { campaignId: string; active: boolean }, { getState, dispatch, rejectWithValue }) => {
  const api = client(getState() as RootState);
  try {
    await api.post(`/v1/campaigns/${campaignId}/${active ? "activate" : "pause"}`, {});
    await Promise.all([dispatch(fetchCampaignDetail(campaignId)), dispatch(fetchCampaigns())]);
    return true;
  } catch (error) {
    return rejectWithValue(extractError(error, "Unable to update campaign."));
  }
});

// ---- Analytics ----
export const fetchAnalytics = createAsyncThunk("platform/fetchAnalytics", async (_, { getState }) => {
  const response = await client(getState() as RootState).get<PlatformAnalyticsDto>("/v1/platform/analytics");
  return response.data;
});

export const fetchDailyReport = createAsyncThunk("platform/fetchDailyReport", async (date: string | undefined, { getState }) => {
  const response = await client(getState() as RootState).get<TenantDailyReportDto>("/v1/platform/reports/daily", { params: date ? { date } : {} });
  return response.data;
});

const platformSlice = createSlice({
  name: "platform",
  initialState,
  reducers: {
    selectProfile(state, action: PayloadAction<string | null>) {
      state.selectedProfileId = action.payload;
      if (!action.payload) state.versions = [];
    },
    clearPlatformError(state) { state.error = null; },
    clearPlatformNotice(state) { state.notice = null; },
    resetWorkspaceData() { return initialState; },
    dialerStart(state, action: PayloadAction<{ campaignId: string; queue: string[] }>) {
      state.dialer = { campaignId: action.payload.campaignId, status: "running", queue: action.payload.queue, currentProspectId: null, completedIds: [], failedIds: [], total: action.payload.queue.length };
    },
    dialerSetCurrent(state, action: PayloadAction<string | null>) { state.dialer.currentProspectId = action.payload; },
    dialerMarkResult(state, action: PayloadAction<{ prospectId: string; ok: boolean }>) {
      if (action.payload.ok) state.dialer.completedIds.push(action.payload.prospectId);
      else state.dialer.failedIds.push(action.payload.prospectId);
      state.dialer.queue = state.dialer.queue.filter((id) => id !== action.payload.prospectId);
      if (state.dialer.queue.length === 0 && state.dialer.status === "running") state.dialer.status = "completed";
    },
    dialerStop(state) { state.dialer.status = "stopped"; state.dialer.currentProspectId = null; },
    dialerReset(state) { state.dialer = initialDialer; }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTemplates.fulfilled, (state, action) => { state.templates = action.payload; })
      .addCase(fetchProfiles.fulfilled, (state, action) => {
        state.profiles = action.payload;
        state.selectedProfileId = action.payload.find((profile) => profile.id === state.selectedProfileId)?.id ?? state.selectedProfileId;
      })
      .addCase(fetchProfileVersions.fulfilled, (state, action) => {
        if (state.selectedProfileId === action.payload.profileId) state.versions = action.payload.versions;
      })
      .addCase(saveProfile.fulfilled, (state, action) => { state.selectedProfileId = action.payload.profile.id; state.versions = action.payload.versions; state.notice = "Agent saved."; })
      .addCase(saveProfile.rejected, (state, action) => { state.error = (action.payload as string) ?? "Unable to save agent."; })
      .addCase(deployProfile.fulfilled, (state, action) => { state.versions = action.payload.versions; state.notice = action.payload.profile.status === "deployed" ? "Agent deployed." : "Agent moved to draft."; })
      .addCase(deployProfile.rejected, (state, action) => { state.error = (action.payload as string) ?? "Unable to deploy."; })
      .addCase(restoreProfileVersion.fulfilled, (state, action) => { state.selectedProfileId = action.payload.profile.id; state.versions = action.payload.versions; state.notice = "Version restored."; })
      .addCase(fetchSessions.fulfilled, (state, action) => { state.sessions = action.payload; })
      .addCase(fetchCallDetail.fulfilled, (state, action) => { state.callDetail = action.payload; })
      .addCase(fetchOperations.fulfilled, (state, action) => { state.operations = action.payload; })
      .addCase(updateOperation.rejected, (state, action) => { state.error = (action.payload as string) ?? "Unable to update operation."; })
      .addCase(fetchProspects.fulfilled, (state, action) => { state.prospects = action.payload; })
      .addCase(createProspect.rejected, (state, action) => { state.error = (action.payload as string) ?? "Unable to add prospect."; })
      .addCase(fetchProspectDetail.fulfilled, (state, action) => { state.prospectDetail = action.payload; })
      .addCase(fetchCampaigns.fulfilled, (state, action) => { state.campaigns = action.payload; })
      .addCase(createCampaign.rejected, (state, action) => { state.error = (action.payload as string) ?? "Unable to create campaign."; })
      .addCase(fetchCampaignDetail.fulfilled, (state, action) => { state.campaignDetail = action.payload; })
      .addCase(fetchAnalytics.fulfilled, (state, action) => { state.analytics = action.payload; })
      .addCase(fetchDailyReport.fulfilled, (state, action) => { state.dailyReport = action.payload; })
      .addCase(updateSessionFollowUp.rejected, (state, action) => { state.error = (action.payload as string) ?? "Unable to update follow-up."; })
      .addCase(updateSessionOutcome.rejected, (state, action) => { state.error = (action.payload as string) ?? "Unable to update outcome."; });
  }
});

export const {
  selectProfile,
  clearPlatformError,
  clearPlatformNotice,
  resetWorkspaceData,
  dialerStart,
  dialerSetCurrent,
  dialerMarkResult,
  dialerStop,
  dialerReset
} = platformSlice.actions;
export default platformSlice.reducer;
