import { z } from "zod";

export const createProspectSchema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().min(3),
  email: z.string().email().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  campaignId: z.string().optional()
});

export const updateProspectSchema = z.object({
  name: z.string().min(1).optional(),
  phoneNumber: z.string().min(3).optional(),
  email: z.string().email().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  status: z.enum(["new", "queued", "in_progress", "contacted", "completed", "failed"]).optional(),
  campaignId: z.string().optional()
});
