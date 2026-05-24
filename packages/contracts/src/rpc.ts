import { z } from "zod";

import { CaseSchema } from "./case";
import { ArtifactEventSchema } from "./run";
import { ToolDescriptorSchema, ToolRunInputSchema, ToolRunStartedSchema } from "./tool";

export type RpcMethodDefinition = {
  input: z.ZodType;
  output: z.ZodType;
};

export type RpcMethodMap = Record<string, RpcMethodDefinition>;

export const rpcMethods = {
  "case.list": {
    input: z.object({}),
    output: z.array(CaseSchema),
  },
  "tool.list": {
    input: z.object({}),
    output: z.array(ToolDescriptorSchema),
  },
  "tool.run": {
    input: ToolRunInputSchema,
    output: ToolRunStartedSchema,
  },
} satisfies RpcMethodMap;

export type RpcMethod = keyof typeof rpcMethods;
export type RpcInput<M extends RpcMethod> = z.infer<(typeof rpcMethods)[M]["input"]>;
export type RpcOutput<M extends RpcMethod> = z.infer<(typeof rpcMethods)[M]["output"]>;

export const RpcMethodSchema = z.enum(Object.keys(rpcMethods) as [RpcMethod, ...RpcMethod[]]);

export const RpcRequestSchema = z.object({
  id: z.union([z.string(), z.number()]),
  method: RpcMethodSchema,
  input: z.unknown(),
});
export type RpcRequest = z.infer<typeof RpcRequestSchema>;

export const RpcErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type RpcErrorPayload = z.infer<typeof RpcErrorPayloadSchema>;

export const RpcResponseSchema = z.object({
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: RpcErrorPayloadSchema.optional(),
});
export type RpcResponse = z.infer<typeof RpcResponseSchema>;

/**
 * Server-pushed events. Identified by `event` (channel kind) and `key`
 * (channel id, e.g. a runId). Payload shape depends on the event kind.
 */
export const RpcEventSchema = z.object({
  event: z.string(),
  key: z.string(),
  payload: z.unknown(),
});
export type RpcEvent = z.infer<typeof RpcEventSchema>;

export const RunEventSchema = z.object({
  event: z.literal("run.event"),
  key: z.string(),
  payload: ArtifactEventSchema,
});
export type RunEvent = z.infer<typeof RunEventSchema>;
