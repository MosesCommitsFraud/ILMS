import { useEffect, useState } from "react";

import type { ToolDescriptor } from "@ilms/contracts/tool";

import { rpc } from "../rpc/client";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; tools: ToolDescriptor[] }
  | { status: "error"; message: string };

const RISK_LABEL: Record<string, string> = {
  "safe-public": "safe",
  "rate-limited": "rate-limited",
  "tos-grey": "tos-grey",
  "login-required": "login",
};

export function ToolsRoute({ onSelect }: { onSelect: (toolId: string) => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    rpc
      .call("tool.list", {})
      .then((tools) => {
        if (!cancelled) setState({ status: "ready", tools });
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
      <header className="mb-8">
        <h1 className="text-2xl font-medium tracking-tight">Tools</h1>
        <p className="mt-1 text-sm text-white/40">
          Pick a tool to run against a target.
        </p>
      </header>

      {state.status === "loading" && (
        <div className="text-sm text-white/40">Loading…</div>
      )}

      {state.status === "error" && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {state.message}
        </div>
      )}

      {state.status === "ready" && (
        <ul className="divide-y divide-white/10">
          {state.tools.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className="flex w-full items-start justify-between gap-4 py-4 text-left hover:bg-white/[0.02]"
              >
                <div>
                  <div className="text-sm text-white">{t.label}</div>
                  <div className="mt-1 text-xs text-white/40">{t.description}</div>
                </div>
                <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/40">
                  {RISK_LABEL[t.risk] ?? t.risk}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
