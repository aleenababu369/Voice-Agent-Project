import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Waypoints } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { login } from "../../features/auth/authSlice";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "../../components/common";

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const error = useAppSelector((state) => state.auth.error);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const result = await dispatch(login({ email, password }));
    setBusy(false);
    if (login.fulfilled.match(result)) navigate(result.payload.account.useCase ? "/" : "/onboarding");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Waypoints className="h-6 w-6" /></div>
          <h1 className="font-display text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Log in to your voice agent workspace</p>
        </div>
        <Card>
          <CardContent className="space-y-4 p-6">
            {error ? <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
            <Button className="w-full" disabled={busy || !email || !password} onClick={() => void submit()}>{busy ? "Logging in…" : "Log in"}</Button>
            <p className="text-center text-sm text-muted-foreground">No account? <Link to="/signup" className="font-medium text-foreground underline">Sign up</Link></p>
            <p className="rounded-lg bg-secondary px-3 py-2 text-center text-xs text-muted-foreground">Demo: hospital@demo.local · demo1234</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
