import Anthropic from "@anthropic-ai/sdk";

import type {
  AgentEvent,
  AgentMessage,
  AgentMessageContent,
  AgentStatus,
  AssistantBlock,
} from "@ilms/contracts/agent";

import { getCase } from "../cases/store";
import { broadcastEvent } from "../rpc/broadcast";
import { runToCompletion } from "../runs/manager";
import { listArtifacts, listRuns } from "../runs/store";
import { getSecret } from "../secrets/store";
import { listTargets } from "../targets/store";
import { listTools } from "../tools/registry";

import { createPermissionRequest } from "./permissionGate";
import { appendMessage, getSession, listMessages } from "./store";
import { buildSystemPrompt, type CaseContext } from "./systemPrompt";
import { anthropicToolName, toolIdFromAnthropicName, toolToAnthropic } from "./toolSchema";

const API_KEY_SECRET = "agent.anthropic.api_key";
const MODEL_SECRET = "agent.anthropic.model";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 4096;
const MAX_ITERATIONS = 8;

/** Sessions currently running a turn — prevents concurrent send. */
const inFlight = new Set<string>();

function emit(sessionId: string, event: AgentEvent): void {
  broadcastEvent({ event: "agent.event", key: sessionId, payload: event });
}

function emitStatus(sessionId: string, status: AgentStatus): void {
  emit(sessionId, { kind: "status", status });
}

function emitMessage(sessionId: string, message: AgentMessage): void {
  emit(sessionId, { kind: "message", message });
}

function persistAndEmit(sessionId: string, content: AgentMessageContent): AgentMessage {
  const msg = appendMessage(sessionId, content);
  emitMessage(sessionId, msg);
  return msg;
}

function loadCaseContext(caseId: string): CaseContext {
  const c = getCase(caseId);
  const targets = listTargets(caseId);
  const runs = listRuns(caseId);
  const artifacts = listArtifacts({ caseId });
  const artifactCounts: Record<string, number> = {};
  for (const a of artifacts) {
    artifactCounts[a.artifact.kind] = (artifactCounts[a.artifact.kind] ?? 0) + 1;
  }
  return { case: c, targets, recentRuns: runs, artifactCounts };
}

/**
 * Convert persisted AgentMessages into the Anthropic messages array. Each
 * user_text becomes a user message; each assistant content (text + tool_use
 * blocks) becomes an assistant message; each tool_result becomes a user
 * message whose content is a tool_result block.
 */
function toAnthropicMessages(messages: AgentMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    const c = m.content;
    if (c.type === "user_text") {
      out.push({ role: "user", content: c.text });
    } else if (c.type === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = c.blocks.map((b) =>
        b.type === "text"
          ? { type: "text" as const, text: b.text }
          : {
              type: "tool_use" as const,
              id: b.toolUseId,
              name: anthropicToolName(b.toolId),
              input: b.input,
            },
      );
      out.push({ role: "assistant", content: blocks });
    } else if (c.type === "tool_result") {
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result" as const,
            tool_use_id: c.toolUseId,
            content: c.summary,
            ...(c.ok ? {} : { is_error: true }),
          },
        ],
      });
    }
  }
  return out;
}

export async function sendUserMessage(args: {
  sessionId: string;
  message: string;
}): Promise<void> {
  const session = getSession(args.sessionId);
  if (!session) throw new Error(`Unknown session: ${args.sessionId}`);

  if (inFlight.has(args.sessionId)) {
    throw new Error("Agent is already processing a message for this session");
  }

  const apiKey = getSecret(API_KEY_SECRET);
  if (!apiKey) {
    persistAndEmit(args.sessionId, { type: "user_text", text: args.message });
    emit(args.sessionId, {
      kind: "error",
      message: `Missing secret "${API_KEY_SECRET}". Set it in Settings before sending agent messages.`,
    });
    emitStatus(args.sessionId, "error");
    return;
  }

  inFlight.add(args.sessionId);
  try {
    persistAndEmit(args.sessionId, { type: "user_text", text: args.message });
    await runTurn({ sessionId: args.sessionId, caseId: session.caseId, apiKey });
  } finally {
    inFlight.delete(args.sessionId);
    emitStatus(args.sessionId, "idle");
  }
}

async function runTurn(args: {
  sessionId: string;
  caseId: string;
  apiKey: string;
}): Promise<void> {
  const client = new Anthropic({ apiKey: args.apiKey });
  const model = getSecret(MODEL_SECRET) || DEFAULT_MODEL;
  const tools = listTools().map(toolToAnthropic);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const caseContext = loadCaseContext(args.caseId);
    const system = buildSystemPrompt({ caseContext, tools: listTools() });
    const messages = toAnthropicMessages(listMessages(args.sessionId));

    emitStatus(args.sessionId, "thinking");

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system,
        tools,
        messages,
      });
    } catch (error) {
      emit(args.sessionId, {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const blocks: AssistantBlock[] = [];
    for (const block of response.content) {
      if (block.type === "text") {
        blocks.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        blocks.push({
          type: "tool_use",
          toolUseId: block.id,
          toolId: toolIdFromAnthropicName(block.name),
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    if (blocks.length > 0) {
      persistAndEmit(args.sessionId, { type: "assistant", blocks });
    }

    if (response.stop_reason !== "tool_use") return;

    // Process each tool_use: ask for permission, then run if approved.
    const toolUses = blocks.filter(
      (b): b is Extract<AssistantBlock, { type: "tool_use" }> => b.type === "tool_use",
    );
    for (const use of toolUses) {
      const { request, decision } = createPermissionRequest({
        sessionId: args.sessionId,
        toolUseId: use.toolUseId,
        toolId: use.toolId,
        input: use.input,
      });
      emitStatus(args.sessionId, "awaiting_permission");
      emit(args.sessionId, { kind: "permission_requested", request });
      const approved = await decision;
      emit(args.sessionId, {
        kind: "permission_resolved",
        permissionId: request.id,
        approved,
      });

      if (!approved) {
        persistAndEmit(args.sessionId, {
          type: "tool_result",
          toolUseId: use.toolUseId,
          toolId: use.toolId,
          runId: null,
          summary: "User denied this tool call.",
          ok: false,
        });
        continue;
      }

      emitStatus(args.sessionId, "running_tool");
      try {
        const result = await runToCompletion({
          toolId: use.toolId,
          input: use.input,
          caseId: args.caseId,
        });
        const summary = result.ok
          ? `Run ${result.runId} completed. ${result.artifactCount} artifact${result.artifactCount === 1 ? "" : "s"} persisted to the case.${result.errorMessage ? ` Note: ${result.errorMessage}` : ""}`
          : `Run ${result.runId} failed: ${result.errorMessage ?? "unknown error"}`;
        persistAndEmit(args.sessionId, {
          type: "tool_result",
          toolUseId: use.toolUseId,
          toolId: use.toolId,
          runId: result.runId,
          summary,
          ok: result.ok,
        });
      } catch (error) {
        persistAndEmit(args.sessionId, {
          type: "tool_result",
          toolUseId: use.toolUseId,
          toolId: use.toolId,
          runId: null,
          summary: error instanceof Error ? error.message : String(error),
          ok: false,
        });
      }
    }
    // loop back to call the model again with tool_results in context
  }

  emit(args.sessionId, {
    kind: "error",
    message: `Hit max iterations (${MAX_ITERATIONS}). Stopping to prevent runaway.`,
  });
}
