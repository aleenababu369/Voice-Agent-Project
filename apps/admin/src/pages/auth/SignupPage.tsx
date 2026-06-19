import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Waypoints } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { signup } from "../../features/auth/authSlice";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "../../components/common";

export function SignupPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const error = useAppSelector((state) => state.auth.error);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const result = await dispatch(signup({ name, email, password }));
    setBusy(false);
    if (signup.fulfilled.match(result)) navigate("/onboarding");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Waypoints className="h-6 w-6" /></div>
          <h1 className="font-display text-2xl font-semibold">Create your workspace</h1>
          <p className="text-sm text-muted-foreground">Sign up to build and deploy voice agents</p>
        </div>
        <Card>
          <CardContent className="space-y-4 p-6">
            {error ? <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <Field label="Organization name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Clinic" /></Field>
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
            <Field label="Password" hint="At least 6 characters."><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" /></Field>
            <Button className="w-full" disabled={busy || name.length < 2 || !email || password.length < 6} onClick={() => void submit()}>{busy ? "Creating…" : "Create account"}</Button>
            <p className="text-center text-sm text-muted-foreground">Already have an account? <Link to="/login" className="font-medium text-foreground underline">Log in</Link></p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
