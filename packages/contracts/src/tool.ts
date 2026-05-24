import { z } from "zod";

export const ToolRiskSchema = z.enum([
  "safe-public",
  "rate-limited",
  "tos-grey",
  "login-required",
]);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

export const ToolInputFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  kind: z.enum(["text", "number"]),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number()]).optional(),
  help: z.string().optional(),
});
export type ToolInputField = z.infer<typeof ToolInputFieldSchema>;

export const ToolDescriptorSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  risk: ToolRiskSchema,
  inputFields: z.array(ToolInputFieldSchema),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

export const ToolRunInputSchema = z.object({
  toolId: z.string(),
  input: z.record(z.string(), z.unknown()),
  caseId: z.string().nullable().optional(),
});
export type ToolRunInput = z.infer<typeof ToolRunInputSchema>;

export const ToolRunStartedSchema = z.object({ runId: z.string() });
export type ToolRunStarted = z.infer<typeof ToolRunStartedSchema>;
