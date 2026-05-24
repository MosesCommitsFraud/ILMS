import { z } from "zod";

export const AgentSessionSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentSession = z.infer<typeof AgentSessionSchema>;

/**
 * Content blocks for assistant messages — these mirror the shape Anthropic's
 * messages API returns. A persisted assistant message can contain text plus
 * any number of tool_use blocks; each tool_use is later paired with a
 * tool_result message that records what the driver did.
 */
export const AssistantBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("tool_use"),
    toolUseId: z.string(),
    toolId: z.string(),
    input: z.record(z.string(), z.unknown()),
  }),
]);
export type AssistantBlock = z.infer<typeof AssistantBlockSchema>;

export const AgentMessageContentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user_text"), text: z.string() }),
  z.object({ type: z.literal("assistant"), blocks: z.array(AssistantBlockSchema) }),
  z.object({
    type: z.literal("tool_result"),
    toolUseId: z.string(),
    toolId: z.string(),
    runId: z.string().nullable(),
    summary: z.string(),
    ok: z.boolean(),
  }),
]);
export type AgentMessageContent = z.infer<typeof AgentMessageContentSchema>;

export const AgentMessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sequence: z.number().int(),
  content: AgentMessageContentSchema,
  createdAt: z.string(),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const PendingPermissionRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  toolUseId: z.string(),
  toolId: z.string(),
  input: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
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
  permissionId: z.string(),
  approved: z.boolean(),
});
export type AgentPermissionDecision = z.infer<typeof AgentPermissionDecisionSchema>;

/**
 * Server-pushed events on the "agent.event" channel, keyed by sessionId.
 * Mirrors run.event's shape so client-side handling is symmetrical.
 */
export const AgentEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), message: AgentMessageSchema }),
  z.object({ kind: z.literal("permission_requested"), request: PendingPermissionRequestSchema }),
  z.object({
    kind: z.literal("permission_resolved"),
    permissionId: z.string(),
    approved: z.boolean(),
  }),
  z.object({ kind: z.literal("status"), status: AgentStatusSchema }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
