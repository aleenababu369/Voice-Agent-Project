import { LogOut } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { useAccount } from "../hooks/useAccount";
import { setApiBaseUrl, setSelectedLanguage, type LanguageCode } from "../features/demo/demoSlice";
import { logout } from "../features/auth/authSlice";
import { fetchProfiles, fetchTemplates } from "../features/platform/platformSlice";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, Field, SectionHeader, SimpleSelect } from "../components/common";

const LANGS: LanguageCode[] = ["en-IN", "hi-IN", "kn-IN", "ta-IN", "ml-IN"];

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const { account } = useAccount();
  const apiBaseUrl = useAppSelector((state) => state.demo.apiBaseUrl);
  const language = useAppSelector((state) => state.demo.selectedLanguage);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeader eyebrow="Settings" title="Workspace settings" subtitle="Account, connection, and call defaults." />

      <Card>
        <CardContent className="space-y-3 p-6">
          <Eyebrow>Account</Eyebrow>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{account?.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{account?.email}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Use case</span><Badge variant="secondary" className="capitalize">{account?.useCase ?? "—"}</Badge></div>
          </div>
          <Button variant="outline" size="sm" onClick={() => dispatch(logout())}><LogOut className="h-4 w-4" /> Log out</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <Eyebrow>Connection</Eyebrow>
          <Field label="API base URL" hint="The backend the dashboard talks to.">
            <Input value={apiBaseUrl} onChange={(e) => dispatch(setApiBaseUrl(e.target.value))} onBlur={() => { void dispatch(fetchTemplates()); void dispatch(fetchProfiles()); }} />
          </Field>
          <Field label="Default call language">
            <SimpleSelect value={language} onValueChange={(v) => dispatch(setSelectedLanguage(v as LanguageCode))} options={LANGS.map((l) => ({ value: l, label: l }))} />
          </Field>
          <p className="text-xs text-muted-foreground">To use a real LLM, set LLM_BASE_URL / LLM_MODEL on the backend. Otherwise the built-in rule engine runs (zero-cost).</p>
        </CardContent>
      </Card>
    </div>
  );
}
