import type { DomainDto, KnowledgeKindDto } from "../../features/platform/types";

export const KNOWLEDGE_KIND_LABELS: Record<KnowledgeKindDto, string> = {
  doctor: "Doctor",
  department: "Department",
  service: "Service",
  patient_account: "Patient account",
  program: "Program / Course",
  education_office: "Office",
  student_account: "Student account",
  staff: "Staff",
  business_department: "Department",
  visitor_policy: "Visitor policy"
};

// Which record kinds belong to each use case (mirrors the backend LOOKUP_KINDS).
export const KINDS_BY_DOMAIN: Record<DomainDto, KnowledgeKindDto[]> = {
  healthcare: ["doctor", "department", "service", "patient_account"],
  education: ["program", "education_office", "student_account"],
  frontdesk: ["staff", "business_department", "visitor_policy"]
};

export function kindLabel(kind: KnowledgeKindDto): string {
  return KNOWLEDGE_KIND_LABELS[kind] ?? kind;
}

/** Render the details object as an editable "key: value" block (one per line; lists are comma-joined). */
export function detailsToText(details: Record<string, string | string[]>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join("\n");
}

/** Parse the "key: value" editor back into a details object (a comma-separated value becomes a list). */
export function textToDetails(text: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().replace(/\s+/g, "_").toLowerCase();
    const raw = line.slice(idx + 1).trim();
    if (!key || !raw) continue;
    out[key] = raw.includes(",") ? raw.split(",").map((part) => part.trim()).filter(Boolean) : raw;
  }
  return out;
}

export function detailsSummary(details: Record<string, string | string[]>): string {
  return Object.entries(details)
    .slice(0, 4)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join(" · ");
}
