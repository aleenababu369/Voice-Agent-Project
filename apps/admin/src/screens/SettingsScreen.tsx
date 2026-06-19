import { useAppDispatch, useAppSelector } from "../app/hooks";
import { useWorkspace } from "../hooks/useWorkspace";
import { setApiBaseUrl, setSelectedLanguage } from "../features/demo/demoSlice";
import { fetchTemplates, fetchTenants, selectActor, selectTenant } from "../features/platform/platformSlice";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Eyebrow, Field, SectionHeader, SimpleSelect } from "../components/common";

export function SettingsScreen() {
  const dispatch = useAppDispatch();
  const { platform, tenant, actor } = useWorkspace();
  const apiBaseUrl = useAppSelector((state) => state.demo.apiBaseUrl);
  const selectedLanguage = useAppSelector((state) => state.demo.selectedLanguage);
  const config = useAppSelector((state) => state.demo.config);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeader eyebrow="Configuration" title="Settings" subtitle="Connection, workspace, and acting admin for the demo." />

      <Card>
        <CardContent className="space-y-4 p-6">
          <Eyebrow>Connection</Eyebrow>
          <Field label="API base URL" hint="The backend the dashboard talks to.">
            <Input
              value={apiBaseUrl}
              onChange={(event) => dispatch(setApiBaseUrl(event.target.value))}
              onBlur={() => { void dispatch(fetchTenants()); void dispatch(fetchTemplates()); }}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">ASR: {config?.aiAdapters?.asr ?? "mock"}</Badge>
            <Badge variant="secondary">LLM: {config?.aiAdapters?.llm ?? "mock"}</Badge>
            <Badge variant="secondary">TTS: {config?.aiAdapters?.tts ?? "mock"}</Badge>
            <Badge variant="success">{config?.mode ?? "browser-simulator"}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <Eyebrow>Workspace</Eyebrow>
          <Field label="Active workspace">
            <SimpleSelect value={tenant?.id ?? ""} onValueChange={(value) => dispatch(selectTenant(value))} options={platform.tenants.map((item) => ({ value: item.id, label: `${item.name} · ${item.domainFocus}` }))} />
          </Field>
          <Field label="Acting admin">
            <SimpleSelect value={actor?.id ?? ""} onValueChange={(value) => dispatch(selectActor(value))} options={platform.users.map((user) => ({ value: user.id, label: `${user.name} · ${user.role}` }))} />
          </Field>
          <Field label="Default call language">
            <SimpleSelect value={selectedLanguage} onValueChange={(value) => dispatch(setSelectedLanguage(value as typeof selectedLanguage))} options={(config?.supportedLanguages ?? ["en-IN"]).map((language) => ({ value: language, label: language }))} />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}
