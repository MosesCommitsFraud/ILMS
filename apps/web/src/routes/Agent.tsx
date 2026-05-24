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
          if (prev.some((m) => m.id === event.message.id)) return prev;
          return [...prev, event.message];
        });
      } else if (event.kind === "permission_requested") {
        setPending((prev) => [...prev, event.request]);
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

  async function onPermission(permissionId: string, approved: boolean) {
    try {
      await rpc.call("agent.respondToPermission", { permissionId, approved });
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
            Say something to get started. The agent has access to all tools and the current case.
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
  const c = message.content;
  if (c.type === "user_text") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-white/10 px-3 py-2 text-sm text-white">
          {c.text}
        </div>
      </div>
    );
  }
  if (c.type === "assistant") {
    return (
      <div className="space-y-2">
        {c.blocks.map((b, i) =>
          b.type === "text" ? (
            <div key={i} className="text-sm text-white/90 whitespace-pre-wrap">
              {b.text}
            </div>
          ) : (
            <div
              key={i}
              className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60"
            >
              <span className="text-white/40">tool_use → </span>
              <span className="font-mono text-white">{b.toolId}</span>
              <pre className="mt-1 overflow-x-auto text-[10px] text-white/40">
                {JSON.stringify(b.input, null, 2)}
              </pre>
            </div>
          ),
        )}
      </div>
    );
  }
  // tool_result
  return (
    <div
      className={
        "rounded border px-3 py-2 text-xs " +
        (c.ok
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
          : "border-red-500/30 bg-red-500/5 text-red-200")
      }
    >
      <span className="text-white/40">tool_result {c.toolId}: </span>
      {c.summary}
    </div>
  );
}

function PermissionCard({
  request,
  onDecide,
}: {
  request: PendingPermissionRequest;
  onDecide: (permissionId: string, approved: boolean) => void;
}) {
  return (
    <div className="rounded border border-amber-500/40 bg-amber-500/5 px-3 py-3">
      <div className="text-xs uppercase tracking-wider text-amber-200/70">Permission requested</div>
      <div className="mt-1 text-sm text-white">
        Run <span className="font-mono text-amber-200">{request.toolId}</span>
      </div>
      <pre className="mt-2 overflow-x-auto rounded bg-black/40 px-2 py-1 text-[10px] text-white/60">
        {JSON.stringify(request.input, null, 2)}
      </pre>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onDecide(request.id, true)}
          className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => onDecide(request.id, false)}
          className="rounded border border-white/10 px-3 py-1 text-xs text-white/60 hover:bg-white/5"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
