import { configureStore } from "@reduxjs/toolkit";
import demoReducer from "../features/demo/demoSlice";
import platformReducer from "../features/platform/platformSlice";

export const store = configureStore({
  reducer: {
    demo: demoReducer,
    platform: platformReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
