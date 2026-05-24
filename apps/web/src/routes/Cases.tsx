import { useEffect, useState } from "react";

import type { Case } from "@ilms/contracts";

import { rpc } from "../rpc/client";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; cases: Case[] }
  | { status: "error"; message: string };

export function CasesRoute() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    rpc
      .call("case.list", {})
      .then((cases) => {
        if (!cancelled) setState({ status: "ready", cases });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-3xl">
      <header className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-medium tracking-tight">Cases</h1>
        <button
          type="button"
          className="rounded border border-white/10 px-3 py-1.5 text-xs uppercase tracking-wider text-white/60 hover:bg-white/5"
        >
          New case
        </button>
      </header>

      {state.status === "loading" && (
        <div className="text-sm text-white/40">Connecting to backend…</div>
      )}

      {state.status === "error" && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          Backend error: {state.message}
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
            <li key={c.id} className="py-3">
              <div className="text-sm text-white">{c.name}</div>
              <div className="text-xs text-white/40">{c.slug}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
