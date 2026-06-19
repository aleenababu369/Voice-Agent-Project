import { useMemo, useState } from "react";
import { CalendarCheck, Plus, RefreshCw, UserRound } from "lucide-react";
import { useAppDispatch } from "../app/hooks";
import { useWorkspace } from "../hooks/useWorkspace";
import { createContact, fetchOperations, updateOperation } from "../features/platform/platformSlice";
import type { OperationStatusDto } from "../features/platform/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow, Field, MetricCard, SectionHeader, SimpleSelect, formatLabel } from "../components/common";

const STATUSES: OperationStatusDto[] = ["created", "scheduled", "in_progress", "completed", "cancelled"];

const TYPE_VARIANT: Record<string, "default" | "accent" | "success" | "muted" | "warning"> = {
  appointment: "default",
  enquiry: "accent",
  visitor_routing: "warning",
  reminder_ack: "muted",
  follow_up: "success",
  generic: "muted"
};

export function OperationsScreen() {
  const dispatch = useAppDispatch();
  const { platform, canEdit } = useWorkspace();
  const { operations, contacts } = platform;
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contactForm, setContactForm] = useState({ name: "", phoneNumber: "" });

  const filtered = useMemo(
    () => operations.filter((op) => (typeFilter === "all" || op.type === typeFilter) && (statusFilter === "all" || op.status === statusFilter)),
    [operations, typeFilter, statusFilter]
  );

  const completed = operations.filter((op) => op.status === "completed").length;
  const scheduled = operations.filter((op) => op.status === "scheduled").length;

  async function addContact() {
    if (!contactForm.name.trim() || !contactForm.phoneNumber.trim()) return;
    await dispatch(createContact({ name: contactForm.name.trim(), phoneNumber: contactForm.phoneNumber.trim() }));
    setContactForm({ name: "", phoneNumber: "" });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Card>
          <CardContent className="space-y-5 p-6">
            <SectionHeader
              eyebrow="Role-based actions"
              title="Operations"
              subtitle="Every completed call produces a real operation — an appointment booked, an enquiry logged, a visitor routed."
              aside={<Button size="sm" variant="outline" onClick={() => void dispatch(fetchOperations())}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Total operations" value={String(operations.length)} icon={<CalendarCheck className="h-4 w-4" />} />
              <MetricCard label="Scheduled" value={String(scheduled)} />
              <MetricCard label="Completed" value={String(completed)} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <SimpleSelect value={typeFilter} onValueChange={setTypeFilter} options={[{ value: "all", label: "All types" }, ...["appointment", "enquiry", "visitor_routing", "reminder_ack", "follow_up", "generic"].map((type) => ({ value: type, label: formatLabel(type) }))]} />
              <SimpleSelect value={statusFilter} onValueChange={setStatusFilter} options={[{ value: "all", label: "All statuses" }, ...STATUSES.map((status) => ({ value: status, label: formatLabel(status) }))]} />
            </div>

            <div className="grid gap-3">
              {filtered.length === 0 ? (
                <p className="rounded-xl bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">No operations yet. Complete a call in the console to generate one.</p>
              ) : (
                filtered.map((op) => (
                  <div key={op.id} className="rounded-2xl border border-border bg-white/60 p-4">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={TYPE_VARIANT[op.type] ?? "muted"}>{formatLabel(op.type)}</Badge>
                          <strong className="font-mono text-sm">{op.referenceId}</strong>
                        </div>
                        {op.scheduledFor ? <p className="mt-1 text-sm text-muted-foreground">Scheduled for {op.scheduledFor}</p> : null}
                      </div>
                      <div className="w-[180px]">
                        <SimpleSelect disabled={!canEdit} value={op.status} onValueChange={(value) => void dispatch(updateOperation({ operationId: op.id, status: value as OperationStatusDto }))} options={STATUSES.map((status) => ({ value: status, label: formatLabel(status) }))} />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {Object.entries(op.payload).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No captured fields.</p>
                      ) : (
                        Object.entries(op.payload).map(([key, value]) => (
                          <div key={key} className="rounded-xl bg-secondary/40 px-3 py-2">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">{key}</div>
                            <div className="mt-0.5 break-words text-sm">{value}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <Eyebrow>Outbound</Eyebrow>
            <h3 className="text-lg font-semibold">Contacts</h3>
            <p className="mt-1 text-sm text-muted-foreground">People the agent can dial for outbound calls.</p>
          </div>
          <div className="grid gap-2">
            <Field label="Name"><Input disabled={!canEdit} value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} placeholder="Contact name" /></Field>
            <Field label="Phone"><Input disabled={!canEdit} value={contactForm.phoneNumber} onChange={(event) => setContactForm({ ...contactForm, phoneNumber: event.target.value })} placeholder="+91…" /></Field>
            <Button size="sm" disabled={!canEdit || !contactForm.name.trim() || !contactForm.phoneNumber.trim()} onClick={() => void addContact()}><Plus className="h-4 w-4" /> Add contact</Button>
          </div>
          <div className="grid gap-2">
            {contacts.length === 0 ? (
              <p className="rounded-xl bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">No contacts yet.</p>
            ) : (
              contacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-2 rounded-xl border border-border bg-white/60 px-3 py-2">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{contact.name}</p>
                    <p className="text-xs text-muted-foreground">{contact.phoneNumber}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
