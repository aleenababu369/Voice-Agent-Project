import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, GraduationCap, Stethoscope } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { onboard } from "../features/auth/authSlice";
import type { DomainDto } from "../features/platform/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const USE_CASES: Array<{ value: DomainDto; label: string; blurb: string; icon: typeof Stethoscope }> = [
  { value: "healthcare", label: "Hospital", blurb: "Appointment booking & patient intake", icon: Stethoscope },
  { value: "education", label: "Education", blurb: "Admissions & campus enquiries", icon: GraduationCap },
  { value: "frontdesk", label: "Front desk", blurb: "Visitor routing & reception", icon: Building2 }
];

export function OnboardingPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const account = useAppSelector((state) => state.auth.account);
  const [selected, setSelected] = useState<DomainDto | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    const result = await dispatch(onboard(selected));
    setBusy(false);
    if (onboard.fulfilled.match(result)) navigate("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold">Welcome, {account?.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose your use case. We'll provision a starter agent you can customize and deploy.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {USE_CASES.map((useCase) => {
            const Icon = useCase.icon;
            const active = selected === useCase.value;
            return (
              <button key={useCase.value} type="button" onClick={() => setSelected(useCase.value)} className={cn("rounded-xl border p-5 text-left transition", active ? "border-primary bg-secondary" : "border-border bg-card hover:border-primary/40")}>
                <div className="flex items-center justify-between">
                  <Icon className="h-6 w-6" />
                  {active ? <Check className="h-5 w-5" /> : null}
                </div>
                <p className="mt-3 font-semibold">{useCase.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{useCase.blurb}</p>
              </button>
            );
          })}
        </div>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <p className="text-sm text-muted-foreground">{selected ? `Provision a ${selected} starter agent` : "Select a use case to continue"}</p>
            <Button disabled={!selected || busy} onClick={() => void confirm()}>{busy ? "Setting up…" : "Continue"}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
