import type {
  AgentEvent,
  AgentMessage,
  AgentStatus,
  PendingPermissionRequest,
} from "@ilms/contracts/agent";

import { getCase } from "../cases/store";
import { broadcastEvent } from "../rpc/broadcast";
import { listArtifacts, listRuns } from "../runs/store";
import { getSecret } from "../secrets/store";
import { listTargets } from "../targets/store";
import { listTools } from "../tools/registry";

import { getOpencodeClient } from "./openCodeClient";
import { ensureOpencodeRuntime } from "./opencodeRuntime";
import { clearPermission, listPending, recordPermission } from "./permissionGate";
import { getSession, setOpencodeSessionId, touchSession, getSessionByOpencodeId } from "./store";
import { buildSystemPrompt, type CaseContext } from "./systemPrompt";

const MODEL_SECRET = "agent.opencode.model";
const PROVIDER_SECRET = "agent.opencode.provider";

let subscriptionStarted = false;

function emit(sessionId: string, event: AgentEvent): void {
  broadcastEvent({ event: "agent.event", key: sessionId, payload: event });
}

function emitStatus(sessionId: string, status: AgentStatus): void {
  emit(sessionId, { kind: "status", status });
}

function loadCaseContext(caseId: string): CaseContext {
  const c = getCase(caseId);
  const targets = listTargets(caseId);
  const runs = listRuns(caseId);
  const artifacts = listArtifacts({ caseId });
  const counts: Record<string, number> = {};
  for (const a of artifacts) counts[a.artifact.kind] = (counts[a.artifact.kind] ?? 0) + 1;
  return { case: c, targets, recentRuns: runs, artifactCounts: counts };
}

async function ensureRuntimeForSession(): Promise<void> {
  const httpUrl = process.env.ILMS_HTTP_URL?.trim() || "http://127.0.0.1:4242";
  const wsUrl = process.env.ILMS_WS_URL?.trim() || httpUrl.replace(/^http/, "ws") + "/rpc";
  await ensureOpencodeRuntime({ httpUrl, wsUrl });
  if (!subscriptionStarted) {
    subscriptionStarted = true;
    void startOpencodeEventSubscription();
  }
}

async function startOpencodeEventSubscription(): Promise<void> {
  const client = getOpencodeClient();
  try {
    const result = await client.event.subscribe();
    for await (const event of result.stream) {
      try {
        handleOpencodeEvent(event as { type: string; properties?: unknown });
      } catch (error) {
        console.error("opencode event handler failed:", error);
      }
    }
  } catch (error) {
    console.error("opencode SSE subscription error:", error);
    subscriptionStarted = false;
  }
}

function handleOpencodeEvent(event: { type: string; properties?: unknown }): void {
  const properties = (event.properties ?? {}) as Record<string, unknown>;

  if (event.type === "message.updated") {
    const info = (properties.info ?? {}) as { sessionID?: string; id?: string; role?: string; error?: unknown };
    if (!info.sessionID) return;
    const session = getSessionByOpencodeId(info.sessionID);
    if (!session) return;
    touchSession(session.id);
    const message = normalizeMessage(properties);
    if (message) emit(session.id, { kind: "message", message });
    return;
  }

  if (event.type === "permission.updated") {
    const props = properties as {
      id?: string;
      sessionID?: string;
      type?: string;
      title?: string;
      messageID?: string;
      callID?: string;
      pattern?: string | string[];
      metadata?: Record<string, unknown>;
      time?: { created?: number };
    };
    if (!props.id || !props.sessionID) return;
    const session = getSessionByOpencodeId(props.sessionID);
    if (!session) return;
    const request: PendingPermissionRequest = {
      id: props.id,
      sessionId: session.id,
      type: props.type ?? "unknown",
      title: props.title ?? "Tool call",
      messageId: props.messageID ?? "",
      ...(props.callID ? { callId: props.callID } : {}),
      ...(props.pattern ? { pattern: props.pattern } : {}),
      metadata: props.metadata ?? {},
      createdAt: props.time?.created ?? Date.now(),
    };
    recordPermission(request);
    emit(session.id, { kind: "permission_requested", request });
    emitStatus(session.id, "awaiting_permission");
    return;
  }

  if (event.type === "permission.replied") {
    const props = properties as { permissionID?: string; sessionID?: string };
    if (!props.permissionID || !props.sessionID) return;
    const session = getSessionByOpencodeId(props.sessionID);
    if (!session) return;
    clearPermission(props.permissionID);
    emit(session.id, { kind: "permission_resolved", permissionId: props.permissionID });
    return;
  }

  if (event.type === "session.idle") {
    const props = properties as { sessionID?: string };
    if (!props.sessionID) return;
    const session = getSessionByOpencodeId(props.sessionID);
    if (!session) return;
    emitStatus(session.id, "idle");
    return;
  }

  if (event.type === "session.status") {
    const props = properties as { sessionID?: string; status?: { type?: string } };
    if (!props.sessionID) return;
    const session = getSessionByOpencodeId(props.sessionID);
    if (!session) return;
    emitStatus(session.id, props.status?.type === "busy" ? "thinking" : "idle");
    return;
  }
}

function normalizeMessage(properties: Record<string, unknown>): AgentMessage | null {
  const info = (properties.info ?? {}) as {
    id?: string;
    role?: string;
    sessionID?: string;
    error?: unknown;
  };
  const parts = Array.isArray(properties.parts) ? (properties.parts as Array<Record<string, unknown>>) : [];
  if (!info.id || !info.sessionID) return null;
  return {
    id: info.id,
    role: info.role ?? "assistant",
    sessionId: info.sessionID,
    parts: parts.map((p) => ({
      ...(p as Record<string, unknown>),
      type: typeof p.type === "string" ? p.type : "unknown",
      ...(typeof p.text === "string" ? { text: p.text } : {}),
    })),
    ...(info.error !== undefined ? { error: info.error } : {}),
  };
}

async function ensureOpencodeSession(sessionId: string): Promise<string> {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Unknown agent session: ${sessionId}`);
  if (session.opencodeSessionId) return session.opencodeSessionId;
  const client = getOpencodeClient();
  const created = await client.session.create({ body: { title: `ILMS case ${session.caseId}` } } as never);
  const data = (created as { data?: { id?: string } }).data;
  const opencodeId = data?.id;
  if (!opencodeId) throw new Error("Failed to create opencode session");
  setOpencodeSessionId(sessionId, opencodeId);
  return opencodeId;
}

function resolveModel(): { providerID?: string; modelID?: string } {
  const model = getSecret(MODEL_SECRET);
  const provider = getSecret(PROVIDER_SECRET);
  if (model && provider) return { providerID: provider, modelID: model };
  return {};
}

export async function sendUserMessage(args: {
  sessionId: string;
  message: string;
}): Promise<void> {
  const session = getSession(args.sessionId);
  if (!session) throw new Error(`Unknown session: ${args.sessionId}`);

  try {
    await ensureRuntimeForSession();
  } catch (error) {
    emit(args.sessionId, {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    emitStatus(args.sessionId, "error");
    return;
  }

  const opencodeSessionId = await ensureOpencodeSession(args.sessionId);
  const client = getOpencodeClient();
  const caseContext = loadCaseContext(session.caseId);
  const system = buildSystemPrompt({ caseContext, tools: listTools() });
  const model = resolveModel();

  emitStatus(args.sessionId, "thinking");
  try {
    await client.session.prompt({
      path: { id: opencodeSessionId },
      body: {
        parts: [{ type: "text", text: args.message }],
        system,
        ...(model.providerID && model.modelID
          ? { model: { providerID: model.providerID, modelID: model.modelID } }
          : {}),
      },
    } as never);
  } catch (error) {
    emit(args.sessionId, {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    emitStatus(args.sessionId, "error");
  }
}

export async function listOpencodeMessages(sessionId: string): Promise<AgentMessage[]> {
  const session = getSession(sessionId);
  if (!session || !session.opencodeSessionId) return [];
  const client = getOpencodeClient();
  const result = (await client.session.messages({
    path: { id: session.opencodeSessionId },
  } as never)) as { data?: Array<Record<string, unknown>> };
  if (!Array.isArray(result.data)) return [];
  return result.data
    .map((entry) => normalizeMessage(entry))
    .filter((m): m is AgentMessage => m !== null);
}

export async function respondToPermission(args: {
  sessionId: string;
  permissionId: string;
  response: "once" | "always" | "reject";
}): Promise<void> {
  const session = getSession(args.sessionId);
  if (!session || !session.opencodeSessionId) throw new Error("Session has no opencode binding yet");
  const client = getOpencodeClient();
  await client.postSessionIdPermissionsPermissionId({
    path: { id: session.opencodeSessionId, permissionID: args.permissionId },
    body: { response: args.response },
  } as never);
  clearPermission(args.permissionId);
  emit(args.sessionId, { kind: "permission_resolved", permissionId: args.permissionId });
}

export function listPendingPermissions(sessionId: string) {
  return listPending(sessionId);
}
