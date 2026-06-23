import { z } from "zod";

// One knowledge record holds either a scalar or a list per detail key (e.g. working_days is a list, fee is a string).
const detailValue = z.union([z.string(), z.array(z.string())]);

export const knowledgeKinds = [
  "doctor", "department", "service", "patient_account",
  "program", "education_office", "student_account",
  "staff", "business_department", "visitor_policy"
] as const;

export const createKnowledgeSchema = z.object({
  kind: z.enum(knowledgeKinds),
  name: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  details: z.record(z.string(), detailValue).optional(),
  // Optional override; otherwise the route derives the domain from the account's use case.
  domain: z.enum(["education", "healthcare", "frontdesk"]).optional()
});

export const updateKnowledgeSchema = z.object({
  kind: z.enum(knowledgeKinds).optional(),
  name: z.string().min(1).optional(),
  aliases: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  details: z.record(z.string(), detailValue).optional()
});
