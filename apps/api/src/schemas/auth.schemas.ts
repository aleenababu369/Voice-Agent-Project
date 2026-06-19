import { z } from "zod";

const useCase = z.enum(["education", "healthcare", "frontdesk"]);

export const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  useCase: useCase.optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const onboardSchema = z.object({
  useCase
});
