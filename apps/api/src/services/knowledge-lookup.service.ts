import type { Domain, LanguageCode, WorkflowType } from "../../../../packages/contracts/src/index.ts";
import { getCollection, stripId } from "../db/mongo.ts";

export type KnowledgeRecordKind =
  | "doctor" | "department" | "service" | "patient_account"
  | "program" | "education_office" | "student_account"
  | "staff" | "business_department" | "visitor_policy";

export interface KnowledgeRecord {
  id: string;
  tenantId: string;
  domain: Domain;
  kind: KnowledgeRecordKind;
  name: string;
  aliases: string[];
  active: boolean;
  details: Record<string, string | string[]>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeLookupResult {
  handled: boolean;
  intent?: string;
  facts?: string[];
  fallbackText?: string;
  recordIds?: string[];
}

const COLLECTION = "operational_knowledge";
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const QUESTION_HINT = /\b(available|availability|open|closed|when|time|timing|slot|schedule|which|who|where|location|fee|fees|cost|price|duration|eligib|deadline|seat|status|balance|due|contact|phone|extension|department|doctor|course|program|service|speciali[sz]|visit|parking|hours?)\b|उपलब्ध|डॉक्टर|समय|फीस|स्थिति|विभाग|കോഴ്സ്|ഡോക്ടർ|ലഭ്യ|സമയം|ഫീസ്|ಸ್ಥಿತಿ|ವೈದ್ಯ|ಸಮಯ|ಶುಲ್ಕ|மருத்துவர்|நேரம்|கட்டணம்|நிலை/iu;
const LOOKUP_KINDS: Record<Domain, KnowledgeRecordKind[]> = {
  healthcare: ["doctor", "department", "service", "patient_account"],
  education: ["program", "education_office", "student_account"],
  frontdesk: ["staff", "business_department", "visitor_policy"]
};

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\p{L}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

function record(tenantId: string, domain: Domain, kind: KnowledgeRecordKind, name: string, aliases: string[], details: KnowledgeRecord["details"]): KnowledgeRecord {
  const timestamp = new Date().toISOString();
  return { id: `${tenantId}-${kind}-${normalize(name).replace(/\s+/g, "-")}`, tenantId, domain, kind, name, aliases, active: true, details, createdAt: timestamp, updatedAt: timestamp };
}

function seedRecords(tenantId: string, domain: Domain): KnowledgeRecord[] {
  if (domain === "healthcare") return [
    record(tenantId, domain, "doctor", "Dr Priya Menon", ["dr priya", "doctor priya", "priya", "gynaecologist", "gynecologist", "डॉक्टर प्रिया", "डॉ प्रिया", "ഡോക്ടർ പ്രിയ", "ಡಾಕ್ಟರ್ ಪ್ರಿಯಾ", "டாக்டர் பிரியா"], { department: "Gynecology", specialty: "Obstetrics and Gynecology", working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], slots: ["10:00 AM-1:00 PM", "3:00 PM-5:00 PM"], location: "Women’s Health Wing, Floor 2", consultation_fee: "₹800" }),
    record(tenantId, domain, "doctor", "Dr Arun Rao", ["dr arun", "dr rao", "arun rao", "cardiologist"], { department: "Cardiology", specialty: "Cardiology", working_days: ["Monday", "Wednesday", "Friday"], slots: ["9:00 AM-12:00 PM", "4:00 PM-6:00 PM"], location: "Cardiac Wing, Floor 3", consultation_fee: "₹1,000" }),
    record(tenantId, domain, "doctor", "Dr Neha Sharma", ["dr neha", "neha sharma", "pediatrician", "child specialist"], { department: "Pediatrics", specialty: "Pediatrics", working_days: ["Tuesday", "Thursday", "Saturday"], slots: ["9:30 AM-1:30 PM"], location: "Children’s Wing, Floor 1", consultation_fee: "₹700" }),
    record(tenantId, domain, "department", "Gynecology", ["gynacology", "gynaecology", "gynecology", "women health"], { hours: "Monday-Saturday, 9:00 AM-6:00 PM", location: "Women’s Health Wing, Floor 2", phone: "Extension 220" }),
    record(tenantId, domain, "department", "Cardiology", ["heart", "cardiac", "cardiology"], { hours: "Monday-Saturday, 8:00 AM-7:00 PM", location: "Cardiac Wing, Floor 3", phone: "Extension 330" }),
    record(tenantId, domain, "department", "Emergency", ["emergency", "casualty", "er"], { hours: "Open 24 hours every day", location: "Ground floor, East entrance", phone: "Extension 100" }),
    record(tenantId, domain, "service", "Diagnostic Laboratory", ["lab", "blood test", "laboratory", "diagnostic"], { hours: "Monday-Saturday, 7:00 AM-8:00 PM; Sunday, 8:00 AM-1:00 PM", location: "Ground floor", preparation: "Fasting depends on the ordered test; confirm with the lab" }),
    record(tenantId, domain, "service", "Pharmacy", ["medical shop", "medicine", "pharmacy"], { hours: "Open 24 hours every day", location: "Ground floor beside reception" }),
    record(tenantId, domain, "patient_account", "Patient P12345", ["p12345", "patient p12345"], { patient_id: "P12345", patient_name: "Asha Nair", pending_amount: "₹2,450", payment_status: "Pending", follow_up_date: "2026-06-27", appointment_status: "Follow-up requested" })
  ];
  if (domain === "education") return [
    record(tenantId, domain, "program", "BTech Computer Science", ["btech", "b tech", "computer science", "cse"], { duration: "4 years", eligibility: "10+2 with Physics, Chemistry and Mathematics; minimum 60% aggregate", annual_fee: "₹1,25,000", seats: "120", admission_status: "Applications open", application_deadline: "2026-07-31" }),
    record(tenantId, domain, "program", "MTech Computer Science", ["mtech", "m tech", "masters technology"], { duration: "2 years", eligibility: "Relevant BE/BTech degree with minimum 55% aggregate", annual_fee: "₹95,000", seats: "30", admission_status: "Applications open", application_deadline: "2026-07-15" }),
    record(tenantId, domain, "program", "MBA", ["mba", "business administration", "management"], { duration: "2 years", eligibility: "Bachelor’s degree with minimum 50% aggregate", annual_fee: "₹1,10,000", seats: "60", admission_status: "Applications open", application_deadline: "2026-07-20" }),
    record(tenantId, domain, "education_office", "Admissions Office", ["admission", "admissions", "counselling", "counseling"], { hours: "Monday-Saturday, 9:00 AM-5:00 PM", location: "Administration Block, Ground Floor", phone: "Extension 101", counseling_slots: ["10:00 AM", "11:30 AM", "2:00 PM", "3:30 PM"] }),
    record(tenantId, domain, "education_office", "Accounts Office", ["accounts", "fee office", "payment"], { hours: "Monday-Friday, 9:30 AM-4:30 PM", location: "Administration Block, Floor 1", phone: "Extension 115" }),
    record(tenantId, domain, "education_office", "Hostel Office", ["hostel", "accommodation", "dormitory"], { hours: "Monday-Saturday, 9:00 AM-5:00 PM", location: "Student Services Block", phone: "Extension 140", availability: "Limited rooms available; allocation is confirmed after admission" }),
    record(tenantId, domain, "student_account", "Student S2024", ["s2024", "student s2024", "application s2024"], { student_id: "S2024", student_name: "Nisha Kumar", application_status: "Documents verified; counseling pending", pending_fee: "₹25,000", next_step: "Book an admissions counseling slot before 2026-07-10" })
  ];
  return [
    record(tenantId, domain, "staff", "Anita Verma", ["anita", "ms anita", "anita verma", "hr manager"], { department: "Human Resources", role: "HR Manager", working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], hours: "10:00 AM-5:00 PM", extension: "Extension 211", location: "Floor 2" }),
    record(tenantId, domain, "staff", "Raj Mehta", ["raj", "raj mehta", "sales manager"], { department: "Sales", role: "Sales Manager", working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], hours: "9:30 AM-6:00 PM", extension: "Extension 305", location: "Floor 3" }),
    record(tenantId, domain, "business_department", "Human Resources", ["hr", "human resources", "recruitment"], { hours: "Monday-Friday, 9:30 AM-5:30 PM", location: "Floor 2", extension: "Extension 210" }),
    record(tenantId, domain, "business_department", "Sales", ["sales", "business development"], { hours: "Monday-Saturday, 9:30 AM-6:00 PM", location: "Floor 3", extension: "Extension 300" }),
    record(tenantId, domain, "business_department", "Support", ["support", "customer care", "help desk"], { hours: "Open 24 hours every day", location: "Floor 1", extension: "Extension 150" }),
    record(tenantId, domain, "visitor_policy", "Visitor Information", ["visitor", "visit", "parking", "entry", "id proof", "badge"], { visiting_hours: "Monday-Saturday, 9:00 AM-6:00 PM", id_requirement: "Government photo ID is required", check_in: "Check in at the ground-floor reception", parking: "Visitor parking is available in Basement 1" })
  ];
}

function valueText(value: string | string[]) { return Array.isArray(value) ? value.join(", ") : value; }

class KnowledgeLookupService {
  private readonly records = new Map<string, KnowledgeRecord>();
  private seededTenants = new Set<string>();

  async ensureTenant(tenantId: string, domain: Domain) {
    const key = `${tenantId}:${domain}`;
    if (this.seededTenants.has(key)) return;
    const collection = await getCollection(COLLECTION);
    if (collection) {
      const existing = await collection.find({ tenantId, domain }).toArray();
      for (const item of existing) {
        const clean = stripId<KnowledgeRecord>(item);
        if (clean) this.records.set(clean.id, clean);
      }
    }
    for (const seed of seedRecords(tenantId, domain)) {
      if (this.records.has(seed.id)) continue;
      this.records.set(seed.id, seed);
      if (collection) await collection.replaceOne({ _id: seed.id }, seed, { upsert: true });
    }
    this.seededTenants.add(key);
  }

  async lookup(input: { tenantId: string; domain: Domain; workflow: WorkflowType; transcript: string; collected: Record<string, string>; language: LanguageCode }): Promise<KnowledgeLookupResult> {
    await this.ensureTenant(input.tenantId, input.domain);
    const query = normalize(input.transcript);
    const identifiers = [input.collected.patient_id, input.collected.student_id].filter((value): value is string => Boolean(value)).map(normalize);
    const asksQuestion = QUESTION_HINT.test(query) || /\b(is|are|do|does|can|tell me|want to know)\b/i.test(query);
    if (!asksQuestion && identifiers.length === 0) return { handled: false };

    const candidates = [...this.records.values()].filter((item) => item.tenantId === input.tenantId && item.domain === input.domain && item.active && LOOKUP_KINDS[input.domain].includes(item.kind));
    const broadDoctorQuery = input.domain === "healthcare" && /which|what|list|doctors?/i.test(query) && /available|department|speciali[sz]|gyn|cardio|pediatric/i.test(query);
    const broadProgramQuery = input.domain === "education" && /which|what|list|courses?|programs?/i.test(query);
    const scored = candidates.map((item) => {
      const entityTerms = [item.name, ...item.aliases].map(normalize);
      const detailTerms = Object.values(item.details).flat().map((value) => normalize(String(value)));
      const entityScore = entityTerms.reduce((best, term) => query.includes(term) ? Math.max(best, term.length + 20) : best, 0);
      const detailScore = detailTerms.reduce((best, term) => term.length >= 3 && query.includes(term) ? Math.max(best, term.length) : best, 0);
      let score = Math.max(entityScore, detailScore);
      for (const id of identifiers) if ([...entityTerms, ...detailTerms].some((term) => term.includes(id))) score += 100;
      if (broadDoctorQuery && item.kind === "doctor") score += 1;
      if (broadProgramQuery && item.kind === "program") score += 1;
      return { item, score };
    }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);

    let matches = scored.slice(0, 5).map(({ item }) => item);
    if (broadDoctorQuery) {
      const doctorMatches = scored.filter(({ item, score }) => item.kind === "doctor" && score > 1).map(({ item }) => item);
      matches = doctorMatches.length ? doctorMatches : candidates.filter((item) => item.kind === "doctor");
    }
    if (broadProgramQuery) matches = candidates.filter((item) => item.kind === "program");
    if (!matches.length) return { handled: true, intent: "knowledge_not_found", facts: [], fallbackText: "I couldn’t find a matching current record. I can note the enquiry for the team to verify.", recordIds: [] };

    const requestedDate = new Date();
    if (/tomorrow|कल|നാളെ|ನಾಳೆ|நாளை/i.test(query)) requestedDate.setDate(requestedDate.getDate() + 1);
    const namedDay = DAY_NAMES.find((item) => new RegExp(`\\b${item}\\b`, "i").test(query));
    const day = namedDay ?? DAY_NAMES[requestedDate.getDay()]!;
    const facts = matches.map((item) => {
      const details = Object.entries(item.details)
        .filter(([key]) => this.relevantField(query, key))
        .map(([key, value]) => `${key.replace(/_/g, " ")}: ${valueText(value)}`);
      const workingDays = item.details.working_days;
      if (Array.isArray(workingDays) && /today|tomorrow|available|availability|उपलब्ध|ലഭ്യ|ಲಭ್ಯ|கிடைக்க/i.test(query)) details.unshift(`available on ${day}: ${workingDays.includes(day) ? "yes" : "no"}`);
      return `${item.name} — ${details.length ? details.join("; ") : Object.entries(item.details).map(([key, value]) => `${key.replace(/_/g, " ")}: ${valueText(value)}`).join("; ")}`;
    });
    return { handled: true, intent: "database_lookup", facts, fallbackText: facts.join(" "), recordIds: matches.map((item) => item.id) };
  }

  /**
   * Validate a value the caller wants to BOOK against (a doctor/department for hospitals, a program for
   * education) against the operational table. Synchronous: `ensureTenant` has already run for this turn via
   * `lookup`, so the in-memory records are populated. Returns "ok" (with the canonical name) when the entity
   * exists and is active, "unavailable" when it exists but is inactive, and "unknown" when it isn't in the
   * table — the orchestrator then re-prompts with the live alternatives instead of booking a bad value.
   */
  checkBookingValueSync(tenantId: string, domain: Domain, kinds: KnowledgeRecordKind[], value: string): { status: "ok" | "unavailable" | "unknown"; canonicalName?: string; alternatives: string[] } {
    const query = normalize(value);
    if (!query) return { status: "ok", alternatives: [] };
    const pool = [...this.records.values()].filter((item) => item.tenantId === tenantId && item.domain === domain && kinds.includes(item.kind));
    if (pool.length === 0) return { status: "ok", alternatives: [] }; // nothing to enforce against
    // Prefer suggesting bookable entities (doctors/programs) over generic departments.
    const primary = pool.filter((item) => item.active && item.kind !== "department" && item.kind !== "business_department");
    const alternatives = (primary.length ? primary : pool.filter((item) => item.active)).map((item) => item.name).slice(0, 5);
    const match = pool.find((item) => [item.name, ...item.aliases].some((alias) => {
      const normalized = normalize(alias);
      return normalized.length >= 3 && (query.includes(normalized) || normalized.includes(query));
    }));
    if (!match) return { status: "unknown", alternatives };
    if (!match.active) return { status: "unavailable", canonicalName: match.name, alternatives };
    return { status: "ok", canonicalName: match.name, alternatives };
  }

  /** All records for a tenant+domain (seeded on first access). Powers the dashboard knowledge-base page. */
  async list(tenantId: string, domain: Domain): Promise<KnowledgeRecord[]> {
    await this.ensureTenant(tenantId, domain);
    return [...this.records.values()]
      .filter((item) => item.tenantId === tenantId && item.domain === domain)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  }

  async create(tenantId: string, domain: Domain, input: { kind: KnowledgeRecordKind; name: string; aliases?: string[]; active?: boolean; details?: KnowledgeRecord["details"] }): Promise<KnowledgeRecord> {
    await this.ensureTenant(tenantId, domain);
    const created = record(tenantId, domain, input.kind, input.name, input.aliases ?? [], input.details ?? {});
    if (input.active === false) created.active = false;
    let id = created.id;
    let suffix = 1;
    while (this.records.has(id) && this.records.get(id)!.name !== input.name) id = `${created.id}-${++suffix}`;
    created.id = id;
    this.records.set(created.id, created);
    await this.persist(created);
    return created;
  }

  async update(id: string, patch: Partial<Pick<KnowledgeRecord, "kind" | "name" | "aliases" | "active" | "details">>): Promise<KnowledgeRecord | null> {
    const existing = this.records.get(id) ?? (await this.findById(id));
    if (!existing) return null;
    const updated: KnowledgeRecord = { ...existing, ...patch, id: existing.id, tenantId: existing.tenantId, domain: existing.domain, updatedAt: new Date().toISOString() };
    this.records.set(id, updated);
    await this.persist(updated);
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    const existed = this.records.delete(id);
    const collection = await getCollection(COLLECTION);
    if (collection) await collection.deleteOne({ _id: id });
    return existed;
  }

  private async findById(id: string): Promise<KnowledgeRecord | undefined> {
    const collection = await getCollection(COLLECTION);
    if (!collection) return undefined;
    const clean = stripId<KnowledgeRecord>(await collection.findOne({ _id: id }));
    if (clean) this.records.set(clean.id, clean);
    return clean;
  }

  private async persist(rec: KnowledgeRecord): Promise<void> {
    const collection = await getCollection(COLLECTION);
    if (collection) await collection.replaceOne({ _id: rec.id }, rec, { upsert: true });
  }

  private relevantField(query: string, key: string) {
    const requested: RegExp[] = [];
    if (/available|today|tomorrow|slot|time|when|schedule|open|closed|hours/.test(query)) requested.push(/working_days|slots|hours|status|availability|counseling_slots|follow_up_date/);
    if (/where|location|department|extension|contact|phone/.test(query)) requested.push(/location|department|extension|phone/);
    if (/fee|cost|price|balance|due|payment/.test(query)) requested.push(/fee|amount|payment|pending/);
    if (/eligib|duration|seat|deadline|admission/.test(query)) requested.push(/eligibility|duration|seats|deadline|admission_status|next_step|application_status/);
    if (/status/.test(query)) requested.push(/status|next_step|date/);
    return requested.length === 0 || requested.some((pattern) => pattern.test(key));
  }
}

export const knowledgeLookupService = new KnowledgeLookupService();
