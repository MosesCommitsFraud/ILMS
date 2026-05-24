import { useCallback, useEffect, useState } from "react";

import type { Case } from "@ilms/contracts";

import { rpc } from "../rpc/client";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; cases: Case[] }
  | { status: "error"; message: string };

export function CasesRoute({ onOpen }: { onOpen: (caseId: string) => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(() => {
    rpc
      .call("case.list", {})
      .then((cases) => setState({ status: "ready", cases }))
      .catch((error: unknown) =>
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const created = await rpc.call("case.create", { name: newName.trim() });
      setNewName("");
      setCreating(false);
      onOpen(created.id);
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-medium tracking-tight">Cases</h1>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="rounded border border-white/10 px-3 py-1.5 text-xs uppercase tracking-wider text-white/60 hover:bg-white/5"
        >
          {creating ? "Cancel" : "New case"}
        </button>
      </header>

      {creating && (
        <form onSubmit={onCreate} className="mb-6 flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Case name"
            className="flex-1 rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
          <button
            type="submit"
            className="rounded border border-white/20 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
          >
            Create
          </button>
        </form>
      )}

      {state.status === "loading" && <div className="text-sm text-white/40">Loading…</div>}

      {state.status === "error" && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {state.message}
        </div>
      )}

      {state.status === "ready" && state.cases.length === 0 && (
        <div className="rounded border border-dashed border-white/10 px-6 py-10 text-center text-sm text-white/40">
          No cases yet. Create one to start an investigation.
        </div>
      )}

      {state.status === "ready" && state.cases.length > 0 && (
        <ul className="divide-y divide-white/10">
          {state.cases.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                className="flex w-full items-center justify-between gap-4 py-3 text-left hover:bg-white/[0.02]"
              >
                <div>
                  <div className="text-sm text-white">{c.name}</div>
                  <div className="text-xs text-white/40">{c.slug}</div>
                </div>
                <div className="font-mono text-[10px] text-white/30">
                  {new Date(c.updatedAt).toLocaleString()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
