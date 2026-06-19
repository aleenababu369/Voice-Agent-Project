import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { createApiClient } from "../demo/demoApi";
import type { RootState } from "../../app/store";
import type { AccountDto, DomainDto } from "../platform/types";

const TOKEN_KEY = "va_token";
const selectApiBaseUrl = (state: RootState) => state.demo.apiBaseUrl;

function extractError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: { error?: string } } }).response?.data;
    return data?.error ?? fallback;
  }
  return fallback;
}

interface AuthResponse {
  token: string;
  account: AccountDto;
}

interface AuthState {
  token: string | null;
  account: AccountDto | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  error: string | null;
}

const initialToken = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;

const initialState: AuthState = {
  token: initialToken,
  account: null,
  status: initialToken ? "loading" : "unauthenticated",
  error: null
};

export const signup = createAsyncThunk(
  "auth/signup",
  async (input: { name: string; email: string; password: string; useCase?: DomainDto }, { getState, rejectWithValue }) => {
    const api = createApiClient(selectApiBaseUrl(getState() as RootState));
    try {
      const response = await api.post<AuthResponse>("/v1/auth/signup", input);
      return response.data;
    } catch (error) {
      return rejectWithValue(extractError(error, "Unable to create account."));
    }
  }
);

export const login = createAsyncThunk(
  "auth/login",
  async (input: { email: string; password: string }, { getState, rejectWithValue }) => {
    const api = createApiClient(selectApiBaseUrl(getState() as RootState));
    try {
      const response = await api.post<AuthResponse>("/v1/auth/login", input);
      return response.data;
    } catch (error) {
      return rejectWithValue(extractError(error, "Invalid email or password."));
    }
  }
);

export const fetchMe = createAsyncThunk("auth/me", async (_, { getState, rejectWithValue }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state), state.auth.token);
  try {
    const response = await api.get<{ account: AccountDto }>("/v1/auth/me");
    return response.data.account;
  } catch (error) {
    return rejectWithValue(extractError(error, "Session expired."));
  }
});

export const onboard = createAsyncThunk("auth/onboard", async (useCase: DomainDto, { getState, rejectWithValue }) => {
  const state = getState() as RootState;
  const api = createApiClient(selectApiBaseUrl(state), state.auth.token);
  try {
    const response = await api.post<{ account: AccountDto }>("/v1/accounts/onboard", { useCase });
    return response.data.account;
  } catch (error) {
    return rejectWithValue(extractError(error, "Unable to set use case."));
  }
});

function persistToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout(state) {
      state.token = null;
      state.account = null;
      state.status = "unauthenticated";
      state.error = null;
      persistToken(null);
    },
    clearAuthError(state) {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    const onAuth = (state: AuthState, action: { payload: AuthResponse }) => {
      state.token = action.payload.token;
      state.account = action.payload.account;
      state.status = "authenticated";
      state.error = null;
      persistToken(action.payload.token);
    };
    builder
      .addCase(signup.fulfilled, onAuth)
      .addCase(login.fulfilled, onAuth)
      .addCase(signup.rejected, (state, action) => { state.error = (action.payload as string) ?? "Unable to create account."; })
      .addCase(login.rejected, (state, action) => { state.error = (action.payload as string) ?? "Unable to log in."; })
      .addCase(fetchMe.fulfilled, (state, action) => { state.account = action.payload; state.status = "authenticated"; })
      .addCase(fetchMe.rejected, (state) => { state.token = null; state.account = null; state.status = "unauthenticated"; persistToken(null); })
      .addCase(onboard.fulfilled, (state, action) => { state.account = action.payload; })
      .addCase(onboard.rejected, (state, action) => { state.error = (action.payload as string) ?? "Unable to onboard."; });
  }
});

export const { logout, clearAuthError } = authSlice.actions;
export const selectAuthToken = (state: RootState) => state.auth.token;
export default authSlice.reducer;
