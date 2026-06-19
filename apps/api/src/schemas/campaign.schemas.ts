import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(["inbound", "outbound"]),
  agentProfileId: z.string().min(1)
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  agentProfileId: z.string().min(1).optional(),
  status: z.enum(["draft", "active", "paused", "completed"]).optional()
});

export const campaignProspectsSchema = z.object({
  prospectIds: z.array(z.string().min(1)).min(1)
});

export const placeCallSchema = z.object({
  prospectId: z.string().min(1),
  language: z.enum(["en-IN", "hi-IN", "kn-IN", "ta-IN", "ml-IN"]).optional()
});
