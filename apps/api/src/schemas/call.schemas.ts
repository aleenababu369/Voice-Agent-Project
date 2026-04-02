import { z } from "zod";

const tenantIdSchema = z.string().min(1);

export const createSessionSchema = z.object({
  tenantId: tenantIdSchema.optional(),
  profileId: z.string().optional(),
  domain: z.enum(["education", "healthcare", "frontdesk"]).optional(),
  workflow: z.enum([
    "appointment_booking",
    "fee_reminder",
    "general_enquiry",
    "follow_up_confirmation",
    "frontdesk_reception",
    "institution_reception"
  ]).optional(),
  language: z.enum(["en-IN", "hi-IN", "kn-IN", "ta-IN", "ml-IN"]).default("en-IN"),
  phoneNumber: z.string().min(3),
  displayName: z.string().min(1).optional()
}).refine((value) => Boolean(value.profileId || (value.domain && value.workflow)), {
  message: "Either profileId or both domain and workflow are required."
});

export const consentSchema = z.object({ consentGranted: z.boolean() });

export const processTurnSchema = z.object({
  transcript: z.string().min(1),
  asrConfidence: z.number().min(0).max(1).default(0.85),
  nluConfidence: z.number().min(0).max(1).default(0.85),
  turnSwitchLatencyMs: z.number().min(0).default(0)
});

export const slotSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  prompt: z.string().min(1),
  required: z.boolean(),
  examples: z.array(z.string()).optional()
});

export const agentProfileSchema = z.object({
  tenantId: tenantIdSchema,
  name: z.string().min(2),
  domain: z.enum(["education", "healthcare", "frontdesk"]),
  workflow: z.enum([
    "appointment_booking",
    "fee_reminder",
    "general_enquiry",
    "follow_up_confirmation",
    "frontdesk_reception",
    "institution_reception"
  ]),
  description: z.string().min(5),
  languages: z.array(z.enum(["en-IN", "hi-IN", "kn-IN", "ta-IN", "ml-IN"])).min(1),
  welcomeMessage: z.string().min(5),
  systemPrompt: z.string().min(5),
  completionMessageTemplate: z.string().min(5),
  escalationMessage: z.string().min(5),
  slots: z.array(slotSchema).min(1)
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type ConsentInput = z.infer<typeof consentSchema>;
export type ProcessTurnInput = z.infer<typeof processTurnSchema>;
export type AgentProfileInput = z.infer<typeof agentProfileSchema>;
