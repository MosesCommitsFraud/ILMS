import { z } from "zod";

export const SecretEntrySchema = z.object({
  key: z.string(),
  hasValue: z.boolean(),
  updatedAt: z.string().nullable(),
});
export type SecretEntry = z.infer<typeof SecretEntrySchema>;

export const SecretSetInputSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});
export type SecretSetInput = z.infer<typeof SecretSetInputSchema>;
