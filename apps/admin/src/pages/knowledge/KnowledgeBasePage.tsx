import { useMemo, useState } from "react";
import { BookOpen, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { useAccount } from "../../hooks/useAccount";
import { deleteKnowledge, saveKnowledge } from "../../features/platform/platformSlice";
import type { DomainDto, KnowledgeItemDto, KnowledgeKindDto } from "../../features/platform/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, MetricCard, SectionHeader, SimpleSelect } from "../../components/common";
import { KINDS_BY_DOMAIN, detailsSummary, detailsToText, kindLabel, textToDetails } from "./shared";

interface EditorState {
  id?: string;
  kind: KnowledgeKindDto;
  name: string;
  aliases: string;
  active: boolean;
  detailsText: string;
}

function emptyEditor(kind: KnowledgeKindDto): EditorState {
  return { kind, name: "", aliases: "", active: true, detailsText: "" };
}

export function KnowledgeBasePage() {
  const dispatch = useAppDispatch();
  const { account } = useAccount();
  const knowledge = useAppSelector((state) => state.platform.knowledge);
  const domain: DomainDto = account?.useCase ?? "education";
  const kinds = KINDS_BY_DOMAIN[domain];

  const [filter, setFilter] = useState<"all" | KnowledgeKindDto>("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return knowledge.filter((item) => {
      if (filter !== "all" && item.kind !== filter) return false;
      if (needle) {
        const hay = `${item.name} ${item.aliases.join(" ")} ${detailsSummary(item.details)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [knowledge, filter, query]);

  const startCreate = () => setEditor(emptyEditor(kinds[0] ?? "service"));
  const startEdit = (item: KnowledgeItemDto) => setEditor({
    id: item.id,
    kind: item.kind,
    name: item.name,
    aliases: item.aliases.join(", "),
    active: item.active,
    detailsText: detailsToText(item.details)
  });

  const submit = async () => {
    if (!editor || !editor.name.trim()) return;
    await dispatch(saveKnowledge({
      ...(editor.id ? { id: editor.id } : {}),
      kind: editor.kind,
      name: editor.name.trim(),
      aliases: editor.aliases.split(",").map((alias) => alias.trim()).filter(Boolean),
      active: editor.active,
      details: textToDetails(editor.detailsText)
    }));
    setEditor(null);
  };

  const toggleActive = (item: KnowledgeItemDto) => {
    void dispatch(saveKnowledge({ id: item.id, kind: item.kind, name: item.name, aliases: item.aliases, active: !item.active, details: item.details }));
  };

  const remove = (item: KnowledgeItemDto) => {
    if (window.confirm(`Delete "${item.name}" from the knowledge base?`)) void dispatch(deleteKnowledge(item.id));
  };

  const activeCount = knowledge.filter((item) => item.active).length;
  const kindCount = new Set(knowledge.map((item) => item.kind)).size;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Knowledge base"
        title="Operational data the agent looks up"
        subtitle="Doctors, departments, programs, fees and more. During a call the agent answers factual questions from these tables and refuses to book anything marked unavailable — offering the live alternatives instead."
        aside={<Button onClick={startCreate}><Plus className="h-4 w-4" /> Add entry</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total entries" value={String(knowledge.length)} icon={<BookOpen className="h-4 w-4" />} />
        <MetricCard label="Available" value={String(activeCount)} />
        <MetricCard label="Unavailable" value={String(knowledge.length - activeCount)} />
        <MetricCard label="Categories" value={String(kindCount)} />
      </div>

      {editor ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{editor.id ? "Edit entry" : "New entry"}</h3>
              <Button size="sm" variant="ghost" onClick={() => setEditor(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Category">
                <SimpleSelect
                  value={editor.kind}
                  onValueChange={(value) => setEditor({ ...editor, kind: value as KnowledgeKindDto })}
                  options={kinds.map((kind) => ({ value: kind, label: kindLabel(kind) }))}
                />
              </Field>
              <Field label="Name" hint="What a caller would say, e.g. &quot;Dr Priya Menon&quot; or &quot;BTech Computer Science&quot;.">
                <Input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="Dr Priya Menon" />
              </Field>
            </div>
            <Field label="Aliases" hint="Comma-separated alternate names the caller might use (e.g. dr priya, gynaecologist).">
              <Input value={editor.aliases} onChange={(e) => setEditor({ ...editor, aliases: e.target.value })} placeholder="dr priya, priya, gynaecologist" />
            </Field>
            <Field label="Details" hint="One &quot;key: value&quot; per line. Use commas for a list, e.g. working days: Monday, Wednesday, Friday.">
              <Textarea rows={6} value={editor.detailsText} onChange={(e) => setEditor({ ...editor, detailsText: e.target.value })} placeholder={"department: Cardiology\nworking days: Monday, Wednesday, Friday\nslots: 9:00 AM-12:00 PM\nconsultation fee: ₹1,000"} />
            </Field>
            <div className="flex items-center justify-between">
              <Button type="button" size="sm" variant={editor.active ? "outline" : "destructive"} onClick={() => setEditor({ ...editor, active: !editor.active })}>
                {editor.active ? <><Check className="h-4 w-4" /> Available</> : <><X className="h-4 w-4" /> Unavailable</>}
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditor(null)}>Cancel</Button>
                <Button size="sm" disabled={!editor.name.trim()} onClick={() => void submit()}>Save entry</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
            <SimpleSelect
              value={filter}
              onValueChange={(value) => setFilter(value as "all" | KnowledgeKindDto)}
              options={[{ value: "all", label: "All categories" }, ...kinds.map((kind) => ({ value: kind, label: kindLabel(kind) }))]}
            />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, alias, or detail…" />
          </div>

          {filtered.length === 0 ? (
            <EmptyState>No entries yet. Add doctors, departments, programs or services so the agent can answer and validate them on a call.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Details</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b border-border/60 align-top transition-colors last:border-0 hover:bg-secondary/40">
                      <td className="py-2.5 pr-3"><Badge variant="muted">{kindLabel(item.kind)}</Badge></td>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{item.name}</div>
                        {item.aliases.length ? <div className="text-xs text-muted-foreground">{item.aliases.slice(0, 4).join(", ")}</div> : null}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">{detailsSummary(item.details) || "—"}</td>
                      <td className="py-2.5 pr-3">
                        <button type="button" onClick={() => toggleActive(item)} title="Toggle availability">
                          <Badge variant={item.active ? "success" : "destructive"}>{item.active ? "available" : "unavailable"}</Badge>
                        </button>
                      </td>
                      <td className="py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Edit" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" title="Delete" onClick={() => remove(item)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
