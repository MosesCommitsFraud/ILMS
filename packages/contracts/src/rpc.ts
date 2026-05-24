import { z } from "zod";

import { CaseSchema } from "./case";

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
