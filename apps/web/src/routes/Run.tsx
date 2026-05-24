import { useEffect, useMemo, useState } from "react";

import { ArtifactEventSchema, type ArtifactEvent } from "@ilms/contracts/run";

import { rpc } from "../rpc/client";

interface RunRouteProps {
  runId: string;
  toolId: string;
  onBack: () => void;
}

type Entry = ArtifactEvent & { seq: number };

export function RunRoute({ runId, toolId, onBack }: RunRouteProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let seq = 0;
    const off = rpc.onEvent("run.event", (event) => {
      if (event.key !== runId) return;
      const parsed = ArtifactEventSchema.safeParse(event.payload);
      if (!parsed.success) return;
      const entry: Entry = { ...parsed.data, seq: ++seq };
      setEntries((prev) => [...prev, entry]);
      if (entry.kind === "done") setFinished(true);
    });
    return off;
  }, [runId]);

  const artifacts = useMemo(
    () => entries.filter((e): e is Extract<Entry, { kind: "artifact" }> => e.kind === "artifact"),
    [entries],
  );
  const logs = useMemo(() => entries.filter((e) => e.kind !== "artifact"), [entries]);

  return (
    <div className="max-w-4xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 text-xs uppercase tracking-wider text-white/40 hover:text-white/70"
      >
        ← {toolId}
      </button>

      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-medium tracking-tight">Run</h1>
        <div className="font-mono text-xs text-white/40">
          {runId} · {finished ? "done" : "running…"}
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">
          Artifacts ({artifacts.length})
        </h2>
        {artifacts.length === 0 ? (
          <div className="rounded border border-dashed border-white/10 px-6 py-6 text-center text-xs text-white/30">
            No artifacts yet.
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {artifacts.map((e) => (
              <li key={e.seq} className="py-2">
                {e.artifact.kind === "profile" ? (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-white">{e.artifact.site}</span>
                    <a
                      href={e.artifact.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-300 hover:underline"
                    >
                      {e.artifact.url}
                    </a>
                  </div>
                ) : (
                  <a
                    href={e.artifact.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-300 hover:underline"
                  >
                    {e.artifact.label ?? e.artifact.url}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">Log</h2>
        <pre className="max-h-96 overflow-auto rounded border border-white/10 bg-black/40 px-3 py-2 text-[11px] leading-relaxed text-white/70">
          {logs.map((e) => formatLine(e)).join("\n") || "—"}
        </pre>
      </section>
    </div>
  );
}

function formatLine(e: ArtifactEvent): string {
  switch (e.kind) {
    case "progress":
      return `[progress] ${e.message}`;
    case "log":
      return `[${e.level}] ${e.message}`;
    case "done":
      return `[done] exit=${e.exitCode ?? "?"}`;
    case "error":
      return `[error] ${e.message}`;
    default:
      return "";
  }
}
