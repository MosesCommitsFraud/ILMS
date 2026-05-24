import { useState } from "react";

import { CaseRoute } from "./routes/Case";
import { CasesRoute } from "./routes/Cases";
import { ReportsRoute } from "./routes/Reports";
import { RunRoute } from "./routes/Run";
import { SettingsRoute } from "./routes/Settings";
import { ToolRoute } from "./routes/Tool";
import { ToolsRoute } from "./routes/Tools";

export type View =
  | { kind: "cases" }
  | { kind: "case"; caseId: string }
  | { kind: "tools" }
  | { kind: "tool"; toolId: string; caseId?: string | undefined }
  | { kind: "run"; runId: string; toolId: string; caseId?: string | undefined }
  | { kind: "reports" }
  | { kind: "settings" };

const NAV: Array<{ label: string; view: View; enabled?: boolean }> = [
  { label: "Cases", view: { kind: "cases" } },
  { label: "Tools", view: { kind: "tools" } },
  { label: "Agent", view: { kind: "cases" }, enabled: false },
  { label: "Reports", view: { kind: "reports" } },
  { label: "Settings", view: { kind: "settings" } },
];

export function App() {
  const [view, setView] = useState<View>({ kind: "cases" });

  const activeTop = view.kind === "case"
    ? "cases"
    : view.kind === "tool" || view.kind === "run"
      ? view.caseId ? "cases" : "tools"
      : view.kind;

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-white/10 px-4 py-6">
        <div className="text-xs uppercase tracking-[0.2em] text-white/40">ILMS</div>
        <nav className="mt-8 space-y-1 text-sm">
          {NAV.map((item) => (
            <NavItem
              key={item.label}
              label={item.label}
              active={item.enabled !== false && item.view.kind === activeTop}
              disabled={item.enabled === false}
              onClick={() => item.enabled !== false && setView(item.view)}
            />
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto px-10 py-8">
        {view.kind === "cases" && (
          <CasesRoute onOpen={(caseId) => setView({ kind: "case", caseId })} />
        )}
        {view.kind === "case" && (
          <CaseRoute
            caseId={view.caseId}
            onBack={() => setView({ kind: "cases" })}
            onRunTool={(toolId) => setView({ kind: "tool", toolId, caseId: view.caseId })}
            onOpenRun={(runId, toolId) =>
              setView({ kind: "run", runId, toolId, caseId: view.caseId })
            }
          />
        )}
        {view.kind === "tools" && (
          <ToolsRoute onSelect={(toolId) => setView({ kind: "tool", toolId })} />
        )}
        {view.kind === "tool" && (
          <ToolRoute
            toolId={view.toolId}
            caseId={view.caseId}
            onBack={() =>
              view.caseId ? setView({ kind: "case", caseId: view.caseId }) : setView({ kind: "tools" })
            }
            onRunStarted={(runId) =>
              setView({ kind: "run", runId, toolId: view.toolId, caseId: view.caseId })
            }
          />
        )}
        {view.kind === "settings" && <SettingsRoute />}
        {view.kind === "reports" && <ReportsRoute />}
        {view.kind === "run" && (
          <RunRoute
            runId={view.runId}
            toolId={view.toolId}
            onBack={() =>
              view.caseId
                ? setView({ kind: "case", caseId: view.caseId })
                : setView({ kind: "tool", toolId: view.toolId })
            }
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
