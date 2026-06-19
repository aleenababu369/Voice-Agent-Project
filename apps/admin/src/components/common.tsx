import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{children}</p>;
}

export function SectionHeader({ eyebrow, title, subtitle, aside }: { eyebrow?: string; title: string; subtitle?: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{subtitle}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function MetricCard({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon ? <span className="text-primary/70">{icon}</span> : null}
      </div>
      <strong className="mt-2 block text-2xl font-semibold">{value}</strong>
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </Card>
  );
}

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/60 px-4 py-3">
      <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <strong className="block text-sm leading-6">{value}</strong>
    </div>
  );
}

export function QualityBar({ label, value, tone }: { label: string; value: number; tone: "emerald" | "teal" | "amber" }) {
  const barTone = tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-primary";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white">
        <div className={cn("h-full rounded-full", barTone)} style={{ width: `${Math.max(6, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border bg-secondary/40 px-5 py-6 text-center text-sm text-muted-foreground">{children}</div>;
}

export interface SimpleOption {
  value: string;
  label: string;
}

export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SimpleOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
