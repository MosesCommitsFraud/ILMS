import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AgentEvent,
  AgentMessage,
  AgentSession,
  AgentStatus,
  PendingPermissionRequest,
} from "@ilms/contracts/agent";
import { AgentEventSchema } from "@ilms/contracts/agent";

import { rpc } from "../rpc/client";

interface AgentRouteProps {
  caseId: string;
  onBack: () => void;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "idle",
  thinking: "thinking…",
  awaiting_permission: "awaiting approval",
  running_tool: "running tool…",
  error: "error",
};

export function AgentRoute({ caseId, onBack }: AgentRouteProps) {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pending, setPending] = useState<PendingPermissionRequest[]>([]);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const bootstrap = useCallback(async () => {
    try {
      const s = await rpc.call("agent.openSession", { caseId });
      setSession(s);
      const [msgs, perms] = await Promise.all([
        rpc.call("agent.listMessages", { sessionId: s.id }),
        rpc.call("agent.listPendingPermissions", { sessionId: s.id }),
      ]);
      setMessages(msgs);
      setPending(perms);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [caseId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!session) return;
    return rpc.onEvent("agent.event", (raw) => {
      if (raw.key !== session.id) return;
      const parsed = AgentEventSchema.safeParse(raw.payload);
      if (!parsed.success) return;
      const event: AgentEvent = parsed.data;
      if (event.kind === "message") {
        setMessages((prev) => {
          // upsert by id
          const idx = prev.findIndex((m) => m.id === event.message.id);
          if (idx === -1) return [...prev, event.message];
          const next = prev.slice();
          next[idx] = event.message;
          return next;
        });
      } else if (event.kind === "permission_requested") {
        setPending((prev) =>
          prev.some((p) => p.id === event.request.id) ? prev : [...prev, event.request],
        );
        setStatus("awaiting_permission");
      } else if (event.kind === "permission_resolved") {
        setPending((prev) => prev.filter((p) => p.id !== event.permissionId));
      } else if (event.kind === "status") {
        setStatus(event.status);
      } else if (event.kind === "error") {
        setError(event.message);
      }
    });
  }, [session]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending.length]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !input.trim() || sending) return;
    setSending(true);
    setError(null);
    const message = input.trim();
    setInput("");
    try {
      await rpc.call("agent.sendMessage", { sessionId: session.id, message });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  async function onPermission(
    permissionId: string,
    response: "once" | "always" | "reject",
  ) {
    if (!session) return;
    try {
      await rpc.call("agent.respondToPermission", {
        sessionId: session.id,
        permissionId,
        response,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 block text-xs uppercase tracking-wider text-white/40 hover:text-white/70"
          >
            ← Case
          </button>
          <h1 className="text-2xl font-medium tracking-tight">Agent</h1>
        </div>
        <div className="font-mono text-xs text-white/40">{STATUS_LABEL[status]}</div>
      </header>

      {error && (
        <div className="mb-3 rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded border border-white/10 bg-black/30 p-4"
      >
        {messages.length === 0 && pending.length === 0 && (
          <div className="text-center text-sm text-white/30">
            Say something to get started. The agent uses opencode and has access to all 10 ILMS tools through MCP.
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {pending.map((p) => (
          <PermissionCard key={p.id} request={p} onDecide={onPermission} />
        ))}
      </div>

      <form onSubmit={onSend} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the agent…"
          disabled={!session || sending}
          className="flex-1 rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!session || sending || !input.trim()}
          className="rounded border border-white/20 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: AgentMessage }) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.text ?? "")).join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-white/10 px-3 py-2 text-sm text-white">{text}</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return (
            <div key={i} className="text-sm text-white/90 whitespace-pre-wrap">
              {part.text ?? ""}
            </div>
          );
        }
        if (part.type === "reasoning") {
          return (
            <div key={i} className="rounded border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-white/40 italic">
              {part.text ?? ""}
            </div>
          );
        }
        if (part.type === "tool") {
          const tool = (part as Record<string, unknown>).tool as string | undefined;
          const stateObj = (part as Record<string, unknown>).state as Record<string, unknown> | undefined;
          const status = (stateObj?.status as string | undefined) ?? "pending";
          const ok = status === "completed";
          const errored = status === "error";
          return (
            <div
              key={i}
              className={
                "rounded border px-3 py-2 text-xs " +
                (errored
                  ? "border-red-500/30 bg-red-500/5 text-red-200"
                  : ok
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
                    : "border-white/10 bg-white/5 text-white/60")
              }
            >
              <span className="text-white/40">tool · </span>
              <span className="font-mono text-white">{tool ?? "unknown"}</span>
              <span className="ml-2 text-[10px] uppercase tracking-wider text-white/40">{status}</span>
              {stateObj?.output !== undefined && (
                <pre className="mt-1 overflow-x-auto text-[10px] text-white/40 whitespace-pre-wrap">
                  {typeof stateObj.output === "string" ? stateObj.output : JSON.stringify(stateObj.output, null, 2)}
                </pre>
              )}
            </div>
          );
        }
        return (
          <div key={i} className="rounded border border-white/10 px-3 py-2 text-[10px] text-white/40">
            <span className="text-white/30">{part.type}</span>
          </div>
        );
      })}
    </div>
  );
}

function PermissionCard({
  request,
  onDecide,
}: {
  request: PendingPermissionRequest;
  onDecide: (permissionId: string, response: "once" | "always" | "reject") => void;
}) {
  return (
    <div className="rounded border border-amber-500/40 bg-amber-500/5 px-3 py-3">
      <div className="text-xs uppercase tracking-wider text-amber-200/70">Permission requested</div>
      <div className="mt-1 text-sm text-white">{request.title}</div>
      {request.pattern && (
        <pre className="mt-2 overflow-x-auto rounded bg-black/40 px-2 py-1 text-[10px] text-white/60">
          {Array.isArray(request.pattern) ? request.pattern.join("\n") : request.pattern}
        </pre>
      )}
      {Object.keys(request.metadata).length > 0 && (
        <pre className="mt-2 overflow-x-auto rounded bg-black/40 px-2 py-1 text-[10px] text-white/60">
          {JSON.stringify(request.metadata, null, 2)}
        </pre>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onDecide(request.id, "once")}
          className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20"
        >
          Approve once
        </button>
        <button
          type="button"
          onClick={() => onDecide(request.id, "always")}
          className="rounded border border-emerald-500/30 px-3 py-1 text-xs text-emerald-200/70 hover:bg-emerald-500/10"
        >
          Always
        </button>
        <button
          type="button"
          onClick={() => onDecide(request.id, "reject")}
          className="rounded border border-white/10 px-3 py-1 text-xs text-white/60 hover:bg-white/5"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
