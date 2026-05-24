import { z } from "zod";

export const AgentSessionSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  opencodeSessionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentSession = z.infer<typeof AgentSessionSchema>;

/**
 * One assistant or user message as opencode reports it. Mirrors the upstream
 * shape (info + parts) loosely so we can render anything opencode emits
 * without losing fidelity. Part type is left open as a string because
 * opencode adds new part kinds over time (text, tool, reasoning, file,
 * step-start, step-finish, …).
 */
export const AgentMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  sessionId: z.string(),
  parts: z.array(
    z
      .object({
        type: z.string(),
        text: z.string().optional(),
      })
      .catchall(z.unknown()),
  ),
  error: z.unknown().optional(),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const PendingPermissionRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: z.string(),
  title: z.string(),
  messageId: z.string(),
  callId: z.string().optional(),
  pattern: z.union([z.string(), z.array(z.string())]).optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.number(),
});
export type PendingPermissionRequest = z.infer<typeof PendingPermissionRequestSchema>;

export const AgentStatusSchema = z.enum([
  "idle",
  "thinking",
  "awaiting_permission",
  "running_tool",
  "error",
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentSendMessageInputSchema = z.object({
  sessionId: z.string(),
  message: z.string().trim().min(1),
});
export type AgentSendMessageInput = z.infer<typeof AgentSendMessageInputSchema>;

export const AgentPermissionDecisionSchema = z.object({
  sessionId: z.string(),
  permissionId: z.string(),
  response: z.enum(["once", "always", "reject"]),
});
export type AgentPermissionDecision = z.infer<typeof AgentPermissionDecisionSchema>;

export const AgentEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), message: AgentMessageSchema }),
  z.object({ kind: z.literal("permission_requested"), request: PendingPermissionRequestSchema }),
  z.object({ kind: z.literal("permission_resolved"), permissionId: z.string() }),
  z.object({ kind: z.literal("status"), status: AgentStatusSchema }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const AgentRuntimeStatusSchema = z.object({
  binaryFound: z.boolean(),
  running: z.boolean(),
  healthy: z.boolean(),
  baseUrl: z.string(),
  lastError: z.string().nullable(),
});
export type AgentRuntimeStatus = z.infer<typeof AgentRuntimeStatusSchema>;
