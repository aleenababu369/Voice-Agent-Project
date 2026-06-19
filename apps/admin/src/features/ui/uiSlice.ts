import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const SIDEBAR_KEY = "va_sidebar";

const initialOpen = typeof window === "undefined" ? true : window.localStorage.getItem(SIDEBAR_KEY) !== "closed";

interface UiState {
  sidebarOpen: boolean;
}

const initialState: UiState = { sidebarOpen: initialOpen };

function persist(open: boolean) {
  if (typeof window !== "undefined") window.localStorage.setItem(SIDEBAR_KEY, open ? "open" : "closed");
}

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen;
      persist(state.sidebarOpen);
    },
    setSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
      persist(state.sidebarOpen);
    }
  }
});

export const { toggleSidebar, setSidebarOpen } = uiSlice.actions;
export default uiSlice.reducer;
