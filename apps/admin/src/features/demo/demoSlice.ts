import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type LanguageCode = "en-IN" | "hi-IN" | "kn-IN" | "ta-IN" | "ml-IN";

interface DemoState {
  apiBaseUrl: string;
  selectedLanguage: LanguageCode;
}

function defaultBaseUrl() {
  if (typeof window !== "undefined" && window.localStorage.getItem("va_api_base")) {
    return window.localStorage.getItem("va_api_base") as string;
  }
  return "http://127.0.0.1:5005";
}

const initialState: DemoState = {
  apiBaseUrl: defaultBaseUrl(),
  selectedLanguage: "en-IN"
};

const demoSlice = createSlice({
  name: "demo",
  initialState,
  reducers: {
    setApiBaseUrl(state, action: PayloadAction<string>) {
      state.apiBaseUrl = action.payload;
      if (typeof window !== "undefined") window.localStorage.setItem("va_api_base", action.payload);
    },
    setSelectedLanguage(state, action: PayloadAction<LanguageCode>) {
      state.selectedLanguage = action.payload;
    }
  }
});

export const { setApiBaseUrl, setSelectedLanguage } = demoSlice.actions;
export default demoSlice.reducer;
