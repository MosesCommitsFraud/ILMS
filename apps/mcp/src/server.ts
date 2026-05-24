import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import type { ToolDescriptor, ToolInputField } from "@ilms/contracts/tool";
import { RpcResponseSchema, RpcEventSchema } from "@ilms/contracts/rpc";

const DEFAULT_HTTP_URL = process.env.ILMS_HTTP_URL?.trim() || "http://127.0.0.1:4242";
const DEFAULT_WS_URL = process.env.ILMS_WS_URL?.trim() || DEFAULT_HTTP_URL.replace(/^http/, "ws") + "/rpc";
const CASE_ID = process.env.ILMS_CASE_ID?.trim() || null;

interface RpcClient {
  call: (method: string, input: unknown) => Promise<unknown>;
  onRunEvent: (runId: string, handler: (payload: unknown) => void) => () => void;
  close: () => void;
}

/**
 * Minimal WS-RPC client tuned for the MCP server's needs. We don't reuse the
 * browser-targeted RpcClient from @ilms/client-runtime because that one calls
 * `new WebSocket(url)` directly — works in Bun, but adds a dependency on
 * matching schema versions.
 */
async function createRpcClient(wsUrl: string): Promise<RpcClient> {
  const socket = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error(`WS open failed: ${wsUrl}`)), { once: true });
  });

  let nextId = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const runListeners = new Map<string, Set<(payload: unknown) => void>>();

  socket.addEventListener("message", (event) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(event.data));
    } catch {
      return;
    }

    const evt = RpcEventSchema.safeParse(parsed);
    if (evt.success && evt.data.event === "run.event") {
      const set = runListeners.get(evt.data.key);
      if (set) for (const h of set) h(evt.data.payload);
      return;
    }

    const res = RpcResponseSchema.safeParse(parsed);
    if (!res.success) return;
    if (typeof res.data.id !== "number") return;
    const entry = pending.get(res.data.id);
    if (!entry) return;
    pending.delete(res.data.id);
    if (res.data.error) entry.reject(new Error(res.data.error.message));
    else entry.resolve(res.data.result);
  });

  return {
    call(method, input) {
      const id = ++nextId;
      return new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, input }));
      });
    },
    onRunEvent(runId, handler) {
      let set = runListeners.get(runId);
      if (!set) {
        set = new Set();
        runListeners.set(runId, set);
      }
      set.add(handler);
      return () => set?.delete(handler);
    },
    close() {
      socket.close();
    },
  };
}

function inputShape(fields: ToolInputField[]): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    let base: z.ZodType;
    if (field.kind === "number") base = z.number();
    else if (field.kind === "select" && field.options) {
      const values = field.options.map((o) => o.value);
      const head = values[0];
      if (head !== undefined) base = z.enum([head, ...values.slice(1)] as [string, ...string[]]);
      else base = z.string();
    } else base = z.string();
    const description = [field.label, field.help].filter(Boolean).join(" — ");
    if (description) base = base.describe(description);
    shape[field.name] = field.required ? base : base.optional();
  }
  return shape;
}

async function runToolOnIlms(
  rpc: RpcClient,
  toolId: string,
  input: Record<string, unknown>,
): Promise<string> {
  const runStarted = (await rpc.call("tool.run", {
    toolId,
    input,
    caseId: CASE_ID,
  })) as { runId: string };

  const events: unknown[] = [];
  let artifactCount = 0;
  let lastError: string | null = null;

  await new Promise<void>((resolve) => {
    const unsubscribe = rpc.onRunEvent(runStarted.runId, (payload) => {
      events.push(payload);
      const p = payload as { kind: string; message?: string };
      if (p.kind === "artifact") artifactCount += 1;
      if (p.kind === "error" && p.message) lastError = p.message;
      if (p.kind === "done") {
        unsubscribe();
        resolve();
      }
    });
  });

  if (lastError) {
    return `Run ${runStarted.runId} failed: ${lastError}`;
  }
  return `Run ${runStarted.runId} completed. ${artifactCount} artifact${artifactCount === 1 ? "" : "s"} persisted to the case.`;
}

async function main(): Promise<void> {
  // Hold a single WS connection for the lifetime of this MCP process.
  const rpc = await createRpcClient(DEFAULT_WS_URL);
  const tools = (await rpc.call("tool.list", {})) as ToolDescriptor[];

  const server = new McpServer({
    name: "ilms",
    version: "0.0.1",
  });

  for (const descriptor of tools) {
    // opencode prefixes MCP tool names with the MCP server name automatically,
    // so registering "sherlock" surfaces to the model as "ilms_sherlock". Don't
    // double-prefix here.
    const mcpName = descriptor.id.replace(/-/g, "_");
    const shape = inputShape(descriptor.inputFields);
    const secretsNote = descriptor.requiredSecrets.length
      ? ` (requires secrets configured in ILMS: ${descriptor.requiredSecrets.map((s) => s.key).join(", ")})`
      : "";

    server.registerTool(
      mcpName,
      {
        description: `[${descriptor.risk}] ${descriptor.description}${secretsNote}`,
        inputSchema: shape,
      },
      async (rawInput: unknown) => {
        const summary = await runToolOnIlms(
          rpc,
          descriptor.id,
          (rawInput ?? {}) as Record<string, unknown>,
        );
        return { content: [{ type: "text", text: summary }] };
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`ilms-tools MCP server ready — ${tools.length} tools, ws=${DEFAULT_WS_URL}, caseId=${CASE_ID ?? "none"}`);
}

main().catch((error) => {
  console.error("ilms-tools MCP server failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
