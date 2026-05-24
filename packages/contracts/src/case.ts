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
