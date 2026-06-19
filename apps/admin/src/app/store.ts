import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import uiReducer from "../features/ui/uiSlice";
import demoReducer from "../features/demo/demoSlice";
import platformReducer from "../features/platform/platformSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
    demo: demoReducer,
    platform: platformReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
