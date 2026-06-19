import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, UserRound } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { createProspect } from "../../features/platform/platformSlice";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Field, SectionHeader, formatLabel } from "../../components/common";

interface FieldRow { key: string; value: string; }

export function ProspectsListPage() {
  const dispatch = useAppDispatch();
  const prospects = useAppSelector((state) => state.platform.prospects);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rows, setRows] = useState<FieldRow[]>([]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return prospects;
    return prospects.filter((p) => `${p.name} ${p.phoneNumber} ${p.status} ${Object.values(p.fields).join(" ")}`.toLowerCase().includes(query));
  }, [prospects, search]);

  async function add() {
    if (!name.trim() || !phone.trim()) return;
    const fields: Record<string, string> = {};
    for (const row of rows) if (row.key.trim()) fields[row.key.trim()] = row.value;
    await dispatch(createProspect({ name: name.trim(), phoneNumber: phone.trim(), ...(Object.keys(fields).length ? { fields } : {}) }));
    setName(""); setPhone(""); setRows([]);
  }

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Prospects" title="People to call" subtitle="The customers/patients your agent talks to. Their known details power hands-free auto-dial." />

      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="font-semibold">Add a prospect</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Verma" /></Field>
            <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" /></Field>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Known fields (optional — e.g. patient_name, age, issue)</span>
              <Button size="sm" variant="outline" onClick={() => setRows([...rows, { key: "", value: "" }])}><Plus className="h-4 w-4" /> Field</Button>
            </div>
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input value={row.key} placeholder="field_key" onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, key: e.target.value } : r))} />
                <Input value={row.value} placeholder="value" onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, value: e.target.value } : r))} />
                <Button size="icon" variant="ghost" onClick={() => setRows(rows.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <Button disabled={!name.trim() || !phone.trim()} onClick={() => void add()}><Plus className="h-4 w-4" /> Add prospect</Button>
        </CardContent>
      </Card>

      <Input placeholder="Search prospects…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {filtered.length === 0 ? (
        <EmptyState>No prospects yet.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((prospect) => (
            <Link key={prospect.id} to={`/prospects/${prospect.id}`}>
              <Card className="transition hover:border-primary/40">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary"><UserRound className="h-4 w-4" /></div>
                    <div>
                      <strong className="block">{prospect.name}</strong>
                      <span className="text-xs text-muted-foreground">{prospect.phoneNumber}</span>
                    </div>
                  </div>
                  <Badge variant={prospect.status === "completed" ? "success" : prospect.status === "failed" ? "destructive" : "muted"}>{formatLabel(prospect.status)}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
