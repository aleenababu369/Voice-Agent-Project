import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { createApiClient } from "../demo/demoApi";
import type { RootState } from "../../app/store";
import type {
  AdminUserDto,
  AgentProfileDto,
  AgentProfileTemplateDto,
  AgentProfileVersionDto,
  ContactDto,
  DomainDto,
  FollowUpStatusDto,
  OperationDto,
  OperationStatusDto,
  PlatformAnalyticsDto,
  Screen,
  SessionOutcomeTypeDto,
  SessionRecordDto,
  TenantDailyReportDto,
  TenantDto
} from "./types";

function extractError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: { issues?: string[]; error?: string } } }).response?.data;
    return data?.issues?.join(" ") ?? data?.error ?? fallback;
  }
  return fallback;
}

interface PlatformState {
  tenants: TenantDto[];
  profiles: AgentProfileDto[];
  templates: AgentProfileTemplateDto[];
  users: AdminUserDto[];
  versions: AgentProfileVersionDto[];
  sessions: SessionRecordDto[];
  operations: OperationDto[];
  contacts: ContactDto[];
  analytics: PlatformAnalyticsDto | null;
  dailyReport: TenantDailyReportDto | null;
  activeScreen: Screen;
  selectedTenantId: string | null;
  selectedProfileId: string | null;
  selectedActorId: string | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
}

const initialState: PlatformState = {
  tenants: [],
  profiles: [],
  templates: [],
  users: [],
  versions: [],
  sessions: [],
  operations: [],
  contacts: [],
  analytics: null,
  dailyReport: null,
  activeScreen: "home",
  selectedTenantId: null,
  selectedProfileId: null,
  selectedActorId: null,
  loading: false,
  error: null,
  notice: null
};

const selectApiBaseUrl = (state: RootState) => state.demo.apiBaseUrl;
const selectTenantId = (state: RootState) => state.platform.selectedTenantId ?? state.platform.tenants[0]?.id ?? "city-hospital";
const selectActorId = (state: RootState) => state.platform.selectedActorId ?? state.platform.users[0]?.id ?? "platform-admin";

export const fetchTenants = createAsyncThunk("platform/fetchTenants", async (_, { getState }) => {
  const api = createApiClient(selectApiBaseUrl(getState() as RootState));
  const response = await api.get<{ tenants: TenantDto[] }>("/v1/tenants");
  return response.data.tenants;
});

export const fetchUsers = createAsyncThunk("platform/fetchUsers", async (_, { getState }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.get<{ users: AdminUserDto[] }>("/v1/admin/users", { params: { tenantId: selectTenantId(state) } });
  return response.data.users;
});

export const fetchTemplates = createAsyncThunk("platform/fetchTemplates", async (_, { getState }) => {
  const api = createApiClient(selectApiBaseUrl(getState() as RootState));
  const response = await api.get<{ templates: AgentProfileTemplateDto[] }>("/v1/agent-profile-templates");
  return response.data.templates;
});

export const fetchProfiles = createAsyncThunk("platform/fetchProfiles", async (_, { getState }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.get<{ profiles: AgentProfileDto[] }>("/v1/agent-profiles", { params: { tenantId: selectTenantId(state) } });
  return response.data.profiles;
});

export const fetchProfileVersions = createAsyncThunk("platform/fetchProfileVersions", async (profileId: string, { getState }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.get<{ versions: AgentProfileVersionDto[] }>(`/v1/agent-profiles/${profileId}/versions`, { params: { tenantId: selectTenantId(state) } });
  return { profileId, versions: response.data.versions };
});

export const fetchSessions = createAsyncThunk("platform/fetchSessions", async (_, { getState }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.get<{ sessions: SessionRecordDto[] }>("/v1/calls/sessions", { params: { tenantId: selectTenantId(state) } });
  return response.data.sessions;
});

export const fetchAnalytics = createAsyncThunk("platform/fetchAnalytics", async (_, { getState }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.get<PlatformAnalyticsDto>("/v1/platform/analytics", { params: { tenantId: selectTenantId(state) } });
  return response.data;
});

export const fetchDailyReport = createAsyncThunk("platform/fetchDailyReport", async (date: string | undefined, { getState }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.get<TenantDailyReportDto>("/v1/platform/reports/daily", {
    params: { tenantId: selectTenantId(state), ...(date ? { date } : {}) }
  });
  return response.data;
});

export const registerWorkspace = createAsyncThunk(
  "platform/registerWorkspace",
  async (
    input: { name: string; description: string; domainFocus: DomainDto; useCaseTemplateId?: string; adminContactName?: string },
    { getState, dispatch, rejectWithValue }
  ) => {
    const api = createApiClient(selectApiBaseUrl(getState() as RootState));
    try {
      const response = await api.post<{ tenant: TenantDto; profile: AgentProfileDto }>("/v1/tenants", input);
      await dispatch(fetchTenants());
      dispatch(selectTenant(response.data.tenant.id));
      return response.data;
    } catch (error) {
      return rejectWithValue(extractError(error, "Unable to register workspace."));
    }
  }
);

export const deployProfile = createAsyncThunk(
  "platform/deployProfile",
  async ({ profileId, deployed }: { profileId: string; deployed: boolean }, { getState, dispatch, rejectWithValue }) => {
    const state = getState() as RootState;
    const api = createApiClient(selectApiBaseUrl(state));
    try {
      const response = await api.post<{ profile: AgentProfileDto; versions: AgentProfileVersionDto[] }>(
        `/v1/agent-profiles/${profileId}/deploy`,
        { actorId: selectActorId(state), tenantId: selectTenantId(state), deployed }
      );
      await dispatch(fetchProfiles());
      return response.data;
    } catch (error) {
      return rejectWithValue(extractError(error, "Unable to update deployment."));
    }
  }
);

export const fetchOperations = createAsyncThunk("platform/fetchOperations", async (_, { getState }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.get<{ operations: OperationDto[] }>("/v1/operations", { params: { tenantId: selectTenantId(state) } });
  return response.data.operations;
});

export const updateOperation = createAsyncThunk(
  "platform/updateOperation",
  async ({ operationId, status }: { operationId: string; status: OperationStatusDto }, { getState, dispatch, rejectWithValue }) => {
    const state = getState() as RootState;
    const api = createApiClient(selectApiBaseUrl(state));
    try {
      const response = await api.put<{ operation: OperationDto }>(`/v1/operations/${operationId}/status`, { status });
      await dispatch(fetchOperations());
      return response.data.operation;
    } catch (error) {
      return rejectWithValue(extractError(error, "Unable to update operation."));
    }
  }
);

export const fetchContacts = createAsyncThunk("platform/fetchContacts", async (_, { getState }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const response = await api.get<{ contacts: ContactDto[] }>(`/v1/tenants/${selectTenantId(state)}/contacts`);
  return response.data.contacts;
});

export const createContact = createAsyncThunk(
  "platform/createContact",
  async (input: { name: string; phoneNumber: string; notes?: string }, { getState, dispatch, rejectWithValue }) => {
    const state = getState() as RootState;
    const api = createApiClient(selectApiBaseUrl(state));
    try {
      const response = await api.post<{ contact: ContactDto }>(`/v1/tenants/${selectTenantId(state)}/contacts`, input);
      await dispatch(fetchContacts());
      return response.data.contact;
    } catch (error) {
      return rejectWithValue(extractError(error, "Unable to add contact."));
    }
  }
);

export const updateSessionFollowUp = createAsyncThunk(
  "platform/updateSessionFollowUp",
  async ({ sessionId, status, assignee, notes }: { sessionId: string; status: FollowUpStatusDto; assignee?: string; notes?: string }, { getState, dispatch, rejectWithValue }) => {
    const state = getState() as RootState;
    const api = createApiClient(selectApiBaseUrl(state));

    try {
      const response = await api.put<{ session: SessionRecordDto }>(`/v1/calls/session/${sessionId}/follow-up`, {
        status,
        ...(assignee ? { assignee } : {}),
        ...(notes ? { notes } : {})
      });
      await Promise.all([dispatch(fetchSessions()), dispatch(fetchAnalytics())]);
      return response.data.session;
    } catch (error) {
      const message = error && typeof error === "object" && "response" in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Unable to update follow-up.")
        : "Unable to update follow-up.";
      return rejectWithValue(message);
    }
  }
);

export const updateSessionOutcome = createAsyncThunk(
  "platform/updateSessionOutcome",
  async ({ sessionId, type, scheduledFor, referenceId, notes }: { sessionId: string; type: SessionOutcomeTypeDto; scheduledFor?: string; referenceId?: string; notes?: string }, { getState, dispatch, rejectWithValue }) => {
    const state = getState() as RootState;
    const api = createApiClient(selectApiBaseUrl(state));

    try {
      const response = await api.put<{ session: SessionRecordDto }>(`/v1/calls/session/${sessionId}/outcome`, {
        type,
        ...(scheduledFor ? { scheduledFor } : {}),
        ...(referenceId ? { referenceId } : {}),
        ...(notes ? { notes } : {})
      });
      await Promise.all([dispatch(fetchSessions()), dispatch(fetchAnalytics())]);
      return response.data.session;
    } catch (error) {
      const message = error && typeof error === "object" && "response" in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Unable to update outcome.")
        : "Unable to update outcome.";
      return rejectWithValue(message);
    }
  }
);

export const saveProfile = createAsyncThunk("platform/saveProfile", async (profile: Omit<AgentProfileDto, "createdAt" | "updatedAt">, { getState, dispatch, rejectWithValue }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const actorId = selectActorId(state);
  const tenantId = selectTenantId(state);
  const payload = { actorId, tenantId, profile: { ...profile, tenantId } };

  try {
    const response = profile.id
      ? await api.put<{ profile: AgentProfileDto; versions: AgentProfileVersionDto[] }>(`/v1/agent-profiles/${profile.id}`, payload)
      : await api.post<{ profile: AgentProfileDto; versions: AgentProfileVersionDto[] }>("/v1/agent-profiles", payload);
    await Promise.all([dispatch(fetchProfiles()), dispatch(fetchAnalytics())]);
    return response.data;
  } catch (error) {
    const message = error && typeof error === "object" && "response" in error
      ? ((error as { response?: { data?: { issues?: string[]; error?: string } } }).response?.data?.issues?.join(" ")
        ?? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        ?? "Unable to save profile.")
      : "Unable to save profile.";
    return rejectWithValue(message);
  }
});

export const restoreProfileVersion = createAsyncThunk("platform/restoreProfileVersion", async ({ profileId, versionId }: { profileId: string; versionId: string }, { getState, dispatch, rejectWithValue }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state));
  const actorId = selectActorId(state);
  const tenantId = selectTenantId(state);

  try {
    const response = await api.post<{ profile: AgentProfileDto; versions: AgentProfileVersionDto[] }>(`/v1/agent-profiles/${profileId}/restore`, { actorId, tenantId, versionId });
    await Promise.all([dispatch(fetchProfiles()), dispatch(fetchAnalytics())]);
    return response.data;
  } catch (error) {
    const message = error && typeof error === "object" && "response" in error
      ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Unable to restore version.")
      : "Unable to restore version.";
    return rejectWithValue(message);
  }
});

const platformSlice = createSlice({
  name: "platform",
  initialState,
  reducers: {
    setActiveScreen(state, action: PayloadAction<Screen>) {
      state.activeScreen = action.payload;
    },
    selectProfile(state, action: PayloadAction<string | null>) {
      state.selectedProfileId = action.payload;
      if (!action.payload) state.versions = [];
    },
    selectActor(state, action: PayloadAction<string>) {
      state.selectedActorId = action.payload;
    },
    selectTenant(state, action: PayloadAction<string>) {
      state.selectedTenantId = action.payload;
      state.selectedProfileId = null;
      state.selectedActorId = null;
      state.versions = [];
      state.sessions = [];
      state.operations = [];
      state.contacts = [];
      state.analytics = null;
      state.dailyReport = null;
    },
    clearPlatformError(state) {
      state.error = null;
    },
    clearPlatformNotice(state) {
      state.notice = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenants.fulfilled, (state, action) => {
        state.tenants = action.payload;
        state.selectedTenantId = state.selectedTenantId ?? action.payload[0]?.id ?? null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.users = action.payload;
        state.selectedActorId = action.payload.find((user) => user.id === state.selectedActorId)?.id ?? action.payload[0]?.id ?? null;
      })
      .addCase(fetchTemplates.fulfilled, (state, action) => {
        state.templates = action.payload;
      })
      .addCase(fetchProfiles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProfiles.fulfilled, (state, action) => {
        state.loading = false;
        state.profiles = action.payload;
        state.selectedProfileId = action.payload.find((profile) => profile.id === state.selectedProfileId)?.id ?? action.payload[0]?.id ?? null;
      })
      .addCase(fetchProfiles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Unable to load profiles.";
      })
      .addCase(fetchProfileVersions.fulfilled, (state, action) => {
        if (state.selectedProfileId === action.payload.profileId) state.versions = action.payload.versions;
      })
      .addCase(fetchSessions.fulfilled, (state, action) => {
        state.sessions = action.payload;
      })
      .addCase(fetchAnalytics.fulfilled, (state, action) => {
        state.analytics = action.payload;
      })
      .addCase(fetchDailyReport.fulfilled, (state, action) => {
        state.dailyReport = action.payload;
      })
      .addCase(fetchOperations.fulfilled, (state, action) => {
        state.operations = action.payload;
      })
      .addCase(fetchContacts.fulfilled, (state, action) => {
        state.contacts = action.payload;
      })
      .addCase(registerWorkspace.fulfilled, (state, action) => {
        state.error = null;
        state.notice = `Workspace "${action.payload.tenant.name}" created. A starter agent is ready to customize and deploy.`;
        state.activeScreen = "build";
      })
      .addCase(registerWorkspace.rejected, (state, action) => {
        state.error = (typeof action.payload === "string" ? action.payload : action.error.message) ?? "Unable to register workspace.";
      })
      .addCase(deployProfile.fulfilled, (state, action) => {
        state.selectedProfileId = action.payload.profile.id;
        state.versions = action.payload.versions;
        state.error = null;
        state.notice = action.payload.profile.status === "deployed" ? "Agent deployed. It can now take calls." : "Agent moved back to draft.";
      })
      .addCase(deployProfile.rejected, (state, action) => {
        state.error = (typeof action.payload === "string" ? action.payload : action.error.message) ?? "Unable to update deployment.";
      })
      .addCase(updateOperation.rejected, (state, action) => {
        state.error = (typeof action.payload === "string" ? action.payload : action.error.message) ?? "Unable to update operation.";
      })
      .addCase(createContact.rejected, (state, action) => {
        state.error = (typeof action.payload === "string" ? action.payload : action.error.message) ?? "Unable to add contact.";
      })
      .addCase(updateSessionFollowUp.rejected, (state, action) => {
        state.error = (typeof action.payload === "string" ? action.payload : action.error.message) ?? "Unable to update follow-up.";
      })
      .addCase(updateSessionOutcome.rejected, (state, action) => {
        state.error = (typeof action.payload === "string" ? action.payload : action.error.message) ?? "Unable to update outcome.";
      })
      .addCase(saveProfile.fulfilled, (state, action) => {
        state.selectedProfileId = action.payload.profile.id;
        state.versions = action.payload.versions;
        state.error = null;
      })
      .addCase(saveProfile.rejected, (state, action) => {
        state.error = (typeof action.payload === "string" ? action.payload : action.error.message) ?? "Unable to save profile.";
      })
      .addCase(restoreProfileVersion.fulfilled, (state, action) => {
        state.selectedProfileId = action.payload.profile.id;
        state.versions = action.payload.versions;
        state.error = null;
      })
      .addCase(restoreProfileVersion.rejected, (state, action) => {
        state.error = (typeof action.payload === "string" ? action.payload : action.error.message) ?? "Unable to restore version.";
      });
  }
});

export const { setActiveScreen, selectProfile, selectActor, selectTenant, clearPlatformError, clearPlatformNotice } = platformSlice.actions;
export default platformSlice.reducer;
