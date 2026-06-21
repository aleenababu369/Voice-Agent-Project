import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PhoneCall } from "lucide-react";
import { useAppSelector } from "../app/hooks";
import { createApiClient } from "../features/demo/demoApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "../components/common";

interface PublicAgent {
  id: string;
  name: string;
  phoneNumber: string | null;
  accountName: string;
  useCase: string;
  deployed: boolean;
}

export function DialerPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const baseUrl = useAppSelector((state) => state.demo.apiBaseUrl);
  const [number, setNumber] = useState(params.get("number") ?? "");
  const [callerName, setCallerName] = useState("");
  const [callerPhone, setCallerPhone] = useState("");
  const [agent, setAgent] = useState<PublicAgent | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [dialing, setDialing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Look up which agent answers the typed number (debounced) so the caller sees who they're calling.
  useEffect(() => {
    const value = number.trim();
    setAgent(null);
    setLookupError(null);
    if (value.replace(/[^\d+]/g, "").length < 6) return;
    const handle = window.setTimeout(() => {
      createApiClient(baseUrl)
        .get<{ agent: PublicAgent }>(`/v1/public/agents/by-number/${encodeURIComponent(value)}`)
        .then((response) => setAgent(response.data.agent))
        .catch(() => setLookupError("No agent found at that number."));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [number, baseUrl]);

  async function dial() {
    if (!number.trim() || !callerPhone.trim()) return;
    setDialing(true);
    setError(null);
    try {
      const response = await createApiClient(baseUrl).post<{ session: { id: string } }>("/v1/calls/dial", {
        agentNumber: number.trim(),
        callerPhone: callerPhone.trim(),
        ...(callerName.trim() ? { callerName: callerName.trim() } : {})
      });
      navigate(`/softphone?session=${response.data.session.id}&auto=1`);
    } catch (err) {
      const message = err && typeof err === "object" && "response" in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Unable to place the call.")
        : "Unable to place the call.";
      setError(message);
    } finally {
      setDialing(false);
    }
  }

  const canDial = Boolean(number.trim()) && Boolean(callerPhone.trim()) && (!agent || agent.deployed);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><PhoneCall className="h-5 w-5" /></div>
              <span className="font-display text-lg font-semibold">Dial an agent</span>
            </div>

            <Field label="Agent number"><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+9190…" /></Field>
            {agent ? (
              <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
                <div className="flex items-center justify-between"><strong>{agent.accountName}</strong><Badge variant={agent.deployed ? "success" : "muted"}>{agent.deployed ? "available" : "offline"}</Badge></div>
                <span className="text-xs capitalize text-muted-foreground">{agent.name} · {agent.useCase}</span>
              </div>
            ) : lookupError ? <p className="text-xs text-amber-600">{lookupError}</p> : null}

            <Field label="Your name (optional)"><Input value={callerName} onChange={(e) => setCallerName(e.target.value)} placeholder="e.g. Asha" /></Field>
            <Field label="Your phone"><Input value={callerPhone} onChange={(e) => setCallerPhone(e.target.value)} placeholder="+91…" /></Field>

            {error ? <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <Button className="w-full" disabled={!canDial || dialing} onClick={() => void dial()}><PhoneCall className="h-4 w-4" /> {dialing ? "Calling…" : "Call"}</Button>
            <p className="text-center text-xs text-muted-foreground">The agent answers automatically and starts the conversation.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
