import { PhoneCall, Rocket, ShieldCheck, Undo2 } from "lucide-react";
import { useAppDispatch } from "../app/hooks";
import { useWorkspace } from "../hooks/useWorkspace";
import { deployProfile, selectActor, selectProfile, setActiveScreen } from "../features/platform/platformSlice";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, Field, SectionHeader, SimpleSelect } from "../components/common";

export function AssignAgentScreen() {
  const dispatch = useAppDispatch();
  const { platform, actor, canEdit } = useWorkspace();

  const userOptions = platform.users.map((user) => ({ value: user.id, label: `${user.name} · ${user.role} · ${user.scope}` }));

  function openCall(profileId: string) {
    dispatch(selectProfile(profileId));
    dispatch(setActiveScreen("call"));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader eyebrow="Access" title="Team governance" subtitle="Choose the admin acting in this workspace. Role decides who can edit, deploy, and run operations." aside={<Badge variant="secondary"><ShieldCheck className="h-3 w-3" /> RBAC</Badge>} />
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <Field label="Active admin">
              <SimpleSelect value={actor?.id ?? ""} onValueChange={(value) => dispatch(selectActor(value))} options={userOptions} placeholder="Select admin" />
            </Field>
            <div className="rounded-2xl bg-secondary/40 p-4 text-sm leading-6 text-muted-foreground">
              {actor
                ? `${actor.name} is acting as ${actor.role} (scope: ${actor.scope}, tenant: ${actor.tenantId}). ${canEdit ? "Can create, edit, and deploy agents within scope." : "Read-only access — switch to an editor or admin to deploy."}`
                : "Select an admin user to manage permissions."}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader eyebrow="Assign & deploy" title="Make agents live for calls" subtitle="A draft agent cannot take calls. Deploy it to open it for inbound and outbound sessions." />
          <div className="grid gap-3">
            {platform.profiles.length === 0 ? (
              <p className="rounded-xl bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">No agents in this workspace yet. Onboard a client or build an agent first.</p>
            ) : (
              platform.profiles.map((profile) => {
                const live = profile.status !== "draft";
                return (
                  <div key={profile.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-white/60 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong>{profile.name}</strong>
                        <Badge variant={live ? "success" : "muted"}>{live ? "live" : "draft"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{profile.domain} · {profile.workflow} · {profile.slots.filter((slot) => slot.required).length} required fields</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {live ? (
                        <>
                          <Button size="sm" onClick={() => openCall(profile.id)}><PhoneCall className="h-4 w-4" /> Open call console</Button>
                          <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => void dispatch(deployProfile({ profileId: profile.id, deployed: false }))}><Undo2 className="h-4 w-4" /> Move to draft</Button>
                        </>
                      ) : (
                        <Button size="sm" disabled={!canEdit} onClick={() => void dispatch(deployProfile({ profileId: profile.id, deployed: true }))}><Rocket className="h-4 w-4" /> Deploy</Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
