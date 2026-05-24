import { z } from "zod";

export const CaseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  notes: z.string().default(""),
});
export type Case = z.infer<typeof CaseSchema>;

export const CaseCreateInputSchema = z.object({
  name: z.string().trim().min(1),
});
export type CaseCreateInput = z.infer<typeof CaseCreateInputSchema>;

export const CaseUpdateInputSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
});
export type CaseUpdateInput = z.infer<typeof CaseUpdateInputSchema>;
