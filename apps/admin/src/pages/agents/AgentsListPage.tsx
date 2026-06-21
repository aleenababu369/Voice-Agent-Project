import { Link } from "react-router-dom";
import { Bot, Plus } from "lucide-react";
import { useAppSelector } from "../../app/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "../../components/common";

export function AgentsListPage() {
  const profiles = useAppSelector((state) => state.platform.profiles);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Agents"
        title="Your agents"
        subtitle="Configure what the agent says, what it asks, and the data it collects. Deploy an agent to take calls."
        aside={<Button asChild><Link to="/agents/new"><Plus className="h-4 w-4" /> New agent</Link></Button>}
      />
      {profiles.length === 0 ? (
        <EmptyState>No agents yet. Create your first agent to get started.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {profiles.map((profile) => (
            <Link key={profile.id} to={`/agents/${profile.id}`}>
              <Card className="h-full transition hover:border-primary/40">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary"><Bot className="h-4 w-4" /></div>
                      <div>
                        <strong className="block">{profile.name}</strong>
                        <span className="text-xs text-muted-foreground">{profile.domain} · {profile.workflow}</span>
                      </div>
                    </div>
                    <Badge variant={profile.status === "draft" ? "muted" : "success"}>{profile.status === "draft" ? "draft" : "live"}</Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{profile.description}</p>
                  {profile.phoneNumber ? <p className="mt-2 font-mono text-xs text-muted-foreground">☎ {profile.phoneNumber}</p> : null}
                  <p className="mt-3 text-xs text-muted-foreground">{profile.slots.filter((slot) => slot.required).length} required fields · {profile.languages.join(", ")}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
