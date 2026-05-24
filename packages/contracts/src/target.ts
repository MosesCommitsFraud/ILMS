import { z } from "zod";

export const TargetKindSchema = z.enum(["email", "handle", "phone", "url", "name"]);
export type TargetKind = z.infer<typeof TargetKindSchema>;

export const TargetSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  kind: TargetKindSchema,
  value: z.string(),
  label: z.string().nullable(),
  createdAt: z.string(),
});
export type Target = z.infer<typeof TargetSchema>;

export const TargetCreateInputSchema = z.object({
  caseId: z.string(),
  kind: TargetKindSchema,
  value: z.string().trim().min(1),
  label: z.string().nullable().optional(),
});
export type TargetCreateInput = z.infer<typeof TargetCreateInputSchema>;
