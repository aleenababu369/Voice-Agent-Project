import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "./app/hooks";
import { fetchMe, logout } from "./features/auth/authSlice";
import { router } from "./app/router";

function App() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const status = useAppSelector((state) => state.auth.status);

  useEffect(() => {
    if (token && status === "loading") void dispatch(fetchMe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => dispatch(logout());
    window.addEventListener("va:unauthorized", handler);
    return () => window.removeEventListener("va:unauthorized", handler);
  }, [dispatch]);

  return <RouterProvider router={router} />;
}

export default App;
