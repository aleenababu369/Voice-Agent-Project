import { useState } from "react";
import { Link } from "react-router-dom";
import { Megaphone, Plus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { createCampaign } from "../../features/platform/platformSlice";
import type { CallDirectionDto } from "../../features/platform/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Field, SectionHeader, SimpleSelect, formatLabel } from "../../components/common";

export function CampaignsListPage() {
  const dispatch = useAppDispatch();
  const campaigns = useAppSelector((state) => state.platform.campaigns);
  const profiles = useAppSelector((state) => state.platform.profiles);
  const deployed = profiles.filter((profile) => profile.status !== "draft");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<CallDirectionDto>("outbound");
  const [agentProfileId, setAgentProfileId] = useState("");

  async function create() {
    if (!name.trim() || !agentProfileId) return;
    await dispatch(createCampaign({ name: name.trim(), direction, agentProfileId }));
    setName(""); setAgentProfileId("");
  }

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Campaigns" title="Calling campaigns" subtitle="Group prospects and run inbound or outbound calls. Activate an outbound campaign to auto-dial its prospects." />

      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="font-semibold">New campaign</h3>
          {deployed.length === 0 ? <div className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">Deploy an agent first to create a campaign.</div> : null}
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring recall drive" /></Field>
            <Field label="Direction"><SimpleSelect value={direction} onValueChange={(v) => setDirection(v as CallDirectionDto)} options={[{ value: "outbound", label: "Outbound" }, { value: "inbound", label: "Inbound" }]} /></Field>
            <Field label="Agent"><SimpleSelect value={agentProfileId} onValueChange={setAgentProfileId} placeholder="Select a deployed agent" options={deployed.map((p) => ({ value: p.id, label: p.name }))} /></Field>
          </div>
          <Button disabled={!name.trim() || !agentProfileId} onClick={() => void create()}><Plus className="h-4 w-4" /> Create campaign</Button>
        </CardContent>
      </Card>

      {campaigns.length === 0 ? (
        <EmptyState>No campaigns yet.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {campaigns.map((campaign) => (
            <Link key={campaign.id} to={`/campaigns/${campaign.id}`}>
              <Card className="transition hover:border-primary/40">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary"><Megaphone className="h-4 w-4" /></div>
                      <div><strong className="block">{campaign.name}</strong><span className="text-xs capitalize text-muted-foreground">{campaign.direction}</span></div>
                    </div>
                    <Badge variant={campaign.status === "active" ? "success" : "muted"}>{formatLabel(campaign.status)}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{campaign.prospectIds.length} prospects</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
