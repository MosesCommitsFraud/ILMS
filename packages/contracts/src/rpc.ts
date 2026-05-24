import { z } from "zod";

import {
  AgentEventSchema,
  AgentMessageSchema,
  AgentPermissionDecisionSchema,
  AgentRuntimeStatusSchema,
  AgentSendMessageInputSchema,
  AgentSessionSchema,
  PendingPermissionRequestSchema,
} from "./agent";
import {
  CaseCreateInputSchema,
  CaseSchema,
  CaseUpdateInputSchema,
} from "./case";
import {
  ArtifactEventSchema,
  PersistedArtifactSchema,
  RunSchema,
} from "./run";
import { SecretEntrySchema, SecretSetInputSchema } from "./secrets";
import { TargetCreateInputSchema, TargetSchema } from "./target";
import { ToolDescriptorSchema, ToolRunInputSchema, ToolRunStartedSchema } from "./tool";

export type RpcMethodDefinition = {
  input: z.ZodType;
  output: z.ZodType;
};

export type RpcMethodMap = Record<string, RpcMethodDefinition>;

const OkSchema = z.object({ ok: z.boolean() });

export const rpcMethods = {
  "case.list": { input: z.object({}), output: z.array(CaseSchema) },
  "case.get": { input: z.object({ id: z.string() }), output: CaseSchema },
  "case.create": { input: CaseCreateInputSchema, output: CaseSchema },
  "case.update": { input: CaseUpdateInputSchema, output: CaseSchema },
  "case.delete": { input: z.object({ id: z.string() }), output: OkSchema },
  "target.list": { input: z.object({ caseId: z.string() }), output: z.array(TargetSchema) },
  "target.create": { input: TargetCreateInputSchema, output: TargetSchema },
  "target.delete": { input: z.object({ id: z.string() }), output: OkSchema },
  "run.list": { input: z.object({ caseId: z.string() }), output: z.array(RunSchema) },
  "artifact.list": {
    input: z.object({ caseId: z.string().optional(), runId: z.string().optional() }),
    output: z.array(PersistedArtifactSchema),
  },
  "tool.list": { input: z.object({}), output: z.array(ToolDescriptorSchema) },
  "tool.run": { input: ToolRunInputSchema, output: ToolRunStartedSchema },
  "secrets.list": { input: z.object({}), output: z.array(SecretEntrySchema) },
  "secrets.set": { input: SecretSetInputSchema, output: OkSchema },
  "secrets.delete": { input: z.object({ key: z.string() }), output: OkSchema },
  "report.markdown": {
    input: z.object({ caseId: z.string() }),
    output: z.object({ content: z.string() }),
  },
  "agent.openSession": {
    input: z.object({ caseId: z.string() }),
    output: AgentSessionSchema,
  },
  "agent.listMessages": {
    input: z.object({ sessionId: z.string() }),
    output: z.array(AgentMessageSchema),
  },
  "agent.listPendingPermissions": {
    input: z.object({ sessionId: z.string() }),
    output: z.array(PendingPermissionRequestSchema),
  },
  "agent.sendMessage": {
    input: AgentSendMessageInputSchema,
    output: OkSchema,
  },
  "agent.respondToPermission": {
    input: AgentPermissionDecisionSchema,
    output: OkSchema,
  },
  "agent.runtimeStatus": {
    input: z.object({}),
    output: AgentRuntimeStatusSchema,
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

export const AgentRpcEventSchema = z.object({
  event: z.literal("agent.event"),
  key: z.string(),
  payload: AgentEventSchema,
});
export type AgentRpcEvent = z.infer<typeof AgentRpcEventSchema>;
