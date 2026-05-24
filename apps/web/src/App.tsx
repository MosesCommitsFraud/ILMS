import { useState } from "react";

import { CasesRoute } from "./routes/Cases";
import { RunRoute } from "./routes/Run";
import { ToolRoute } from "./routes/Tool";
import { ToolsRoute } from "./routes/Tools";

export type View =
  | { kind: "cases" }
  | { kind: "tools" }
  | { kind: "tool"; toolId: string }
  | { kind: "run"; runId: string; toolId: string };

const NAV: Array<{ label: string; view: View; enabled?: boolean }> = [
  { label: "Cases", view: { kind: "cases" } },
  { label: "Tools", view: { kind: "tools" } },
  { label: "Agent", view: { kind: "cases" }, enabled: false },
  { label: "Reports", view: { kind: "cases" }, enabled: false },
  { label: "Settings", view: { kind: "cases" }, enabled: false },
];

export function App() {
  const [view, setView] = useState<View>({ kind: "tools" });

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-white/10 px-4 py-6">
        <div className="text-xs uppercase tracking-[0.2em] text-white/40">ILMS</div>
        <nav className="mt-8 space-y-1 text-sm">
          {NAV.map((item) => (
            <NavItem
              key={item.label}
              label={item.label}
              active={item.enabled !== false && item.view.kind === view.kind}
              disabled={item.enabled === false}
              onClick={() => item.enabled !== false && setView(item.view)}
            />
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto px-10 py-8">
        {view.kind === "cases" && <CasesRoute />}
        {view.kind === "tools" && (
          <ToolsRoute onSelect={(toolId) => setView({ kind: "tool", toolId })} />
        )}
        {view.kind === "tool" && (
          <ToolRoute
            toolId={view.toolId}
            onBack={() => setView({ kind: "tools" })}
            onRunStarted={(runId) => setView({ kind: "run", runId, toolId: view.toolId })}
          />
        )}
        {view.kind === "run" && (
          <RunRoute
            runId={view.runId}
            toolId={view.toolId}
            onBack={() => setView({ kind: "tool", toolId: view.toolId })}
          />
        )}
      </main>
    </div>
  );
}

function NavItem({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "block w-full rounded px-2 py-1.5 text-left " +
        (disabled
          ? "cursor-not-allowed text-white/20"
          : active
            ? "bg-white/5 text-white"
            : "text-white/50 hover:text-white/80")
      }
    >
      {label}
    </button>
  );
}
