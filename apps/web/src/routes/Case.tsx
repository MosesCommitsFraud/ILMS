import { useCallback, useEffect, useState } from "react";

import type {
  Case,
  PersistedArtifact,
  Run,
  Target,
  TargetKind,
  ToolDescriptor,
} from "@ilms/contracts";

import { rpc } from "../rpc/client";

interface CaseRouteProps {
  caseId: string;
  onBack: () => void;
  onRunTool: (toolId: string) => void;
  onOpenRun: (runId: string, toolId: string) => void;
}

interface BundleState {
  status: "loading" | "ready" | "error";
  case?: Case;
  targets: Target[];
  runs: Run[];
  artifacts: PersistedArtifact[];
  tools: ToolDescriptor[];
  error?: string;
}

const TARGET_KINDS: TargetKind[] = ["email", "handle", "phone", "url", "name"];

export function CaseRoute({ caseId, onBack, onRunTool, onOpenRun }: CaseRouteProps) {
  const [state, setState] = useState<BundleState>({
    status: "loading",
    targets: [],
    runs: [],
    artifacts: [],
    tools: [],
  });

  const refresh = useCallback(async () => {
    try {
      const [c, targets, runs, artifacts, tools] = await Promise.all([
        rpc.call("case.get", { id: caseId }),
        rpc.call("target.list", { caseId }),
        rpc.call("run.list", { caseId }),
        rpc.call("artifact.list", { caseId }),
        rpc.call("tool.list", {}),
      ]);
      setState({ status: "ready", case: c, targets, runs, artifacts, tools });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [caseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (state.status === "loading") return <div className="text-sm text-white/40">Loading…</div>;
  if (state.status === "error" || !state.case) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="text-xs uppercase tracking-wider text-white/40 hover:text-white/70"
        >
          ← Cases
        </button>
        <div className="rounded border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {state.error ?? "Case not found"}
        </div>
      </div>
    );
  }

  const c = state.case;

  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-4 text-xs uppercase tracking-wider text-white/40 hover:text-white/70"
        >
          ← Cases
        </button>
        <CaseHeader value={c} onChange={() => void refresh()} />
      </div>

      <TargetsSection
        caseId={caseId}
        targets={state.targets}
        onChanged={() => void refresh()}
      />

      <ToolsSection tools={state.tools} onRun={onRunTool} />

      <RunsSection runs={state.runs} onOpen={onOpenRun} />

      <ArtifactsSection artifacts={state.artifacts} />
    </div>
  );
}

function CaseHeader({ value, onChange }: { value: Case; onChange: () => void }) {
  const [name, setName] = useState(value.name);
  const [notes, setNotes] = useState(value.notes);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(value.name);
    setNotes(value.notes);
  }, [value.id, value.name, value.notes]);

  const dirty = name !== value.name || notes !== value.notes;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await rpc.call("case.update", { id: value.id, name, notes });
      onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        className="-mx-1 w-full rounded bg-transparent px-1 text-2xl font-medium tracking-tight text-white outline-none focus:bg-white/5"
      />
      <div className="mt-1 font-mono text-xs text-white/30">{value.slug}</div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={save}
        placeholder="Notes…"
        rows={3}
        className="mt-4 w-full resize-none rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 outline-none focus:border-white/30"
      />
      {saving && <div className="mt-1 text-xs text-white/30">saving…</div>}
    </div>
  );
}

function TargetsSection({
  caseId,
  targets,
  onChanged,
}: {
  caseId: string;
  targets: Target[];
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<TargetKind>("handle");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setError(null);
    try {
      await rpc.call("target.create", { caseId, kind, value: value.trim() });
      setValue("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onDelete(id: string) {
    await rpc.call("target.delete", { id });
    onChanged();
  }

  return (
    <section>
      <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">Targets</h2>
      <form onSubmit={onAdd} className="mb-3 flex gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as TargetKind)}
          className="rounded border border-white/10 bg-black/30 px-2 py-2 text-sm text-white outline-none focus:border-white/30"
        >
          {TARGET_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value"
          className="flex-1 rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
        />
        <button
          type="submit"
          className="rounded border border-white/20 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          Add
        </button>
      </form>
      {error && (
        <div className="mb-2 rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
      {targets.length === 0 ? (
        <div className="rounded border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/30">
          No targets yet.
        </div>
      ) : (
        <ul className="divide-y divide-white/10">
          {targets.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-baseline gap-3">
                <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/40">
                  {t.kind}
                </span>
                <span className="text-sm text-white">{t.value}</span>
              </div>
              <button
                type="button"
                onClick={() => void onDelete(t.id)}
                className="text-xs text-white/30 hover:text-red-300"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ToolsSection({
  tools,
  onRun,
}: {
  tools: ToolDescriptor[];
  onRun: (toolId: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">Run a tool</h2>
      <div className="flex flex-wrap gap-2">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onRun(t.id)}
            className="rounded border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:border-white/30 hover:text-white"
          >
            {t.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function RunsSection({
  runs,
  onOpen,
}: {
  runs: Run[];
  onOpen: (runId: string, toolId: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">Runs ({runs.length})</h2>
      {runs.length === 0 ? (
        <div className="rounded border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/30">
          No runs yet.
        </div>
      ) : (
        <ul className="divide-y divide-white/10">
          {runs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpen(r.id, r.toolId)}
                className="flex w-full items-center justify-between gap-4 py-2 text-left hover:bg-white/[0.02]"
              >
                <div>
                  <div className="text-sm text-white">{r.toolId}</div>
                  <div className="font-mono text-[10px] text-white/30">{r.id}</div>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/40">
                    {r.status}
                  </span>
                  <span className="font-mono text-[10px] text-white/30">
                    {new Date(r.startedAt).toLocaleString()}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ArtifactsSection({ artifacts }: { artifacts: PersistedArtifact[] }) {
  return (
    <section>
      <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">
        Artifacts ({artifacts.length})
      </h2>
      {artifacts.length === 0 ? (
        <div className="rounded border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/30">
          No artifacts yet.
        </div>
      ) : (
        <ul className="divide-y divide-white/10">
          {artifacts.map((p) => (
            <li key={p.id} className="py-2">
              {p.artifact.kind === "profile" && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-white">{p.artifact.site}</span>
                  <a
                    href={p.artifact.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-300 hover:underline"
                  >
                    {p.artifact.url}
                  </a>
                </div>
              )}
              {p.artifact.kind === "link" && (
                <a
                  href={p.artifact.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-300 hover:underline"
                >
                  {p.artifact.label ?? p.artifact.url}
                </a>
              )}
              {p.artifact.kind === "email" && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-white">{p.artifact.email}</span>
                  {p.artifact.source && (
                    <span className="text-[10px] uppercase tracking-wider text-white/30">
                      {p.artifact.source}
                    </span>
                  )}
                </div>
              )}
              {p.artifact.kind === "hint" && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-white">
                    <span className="text-white/40">{p.artifact.field}:</span>{" "}
                    {p.artifact.value}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-white/30">
                    {p.artifact.source}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
