import { useEffect, useState } from "react";

import type { Case } from "@ilms/contracts/case";

import { downloadString, reportUrl } from "../lib/download";
import { rpc } from "../rpc/client";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; cases: Case[] }
  | { status: "error"; message: string };

export function ReportsRoute() {
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
      <header className="mb-8">
        <h1 className="text-2xl font-medium tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-white/40">
          Export an investigation as Markdown or PDF.
        </p>
      </header>

      {state.status === "loading" && <div className="text-sm text-white/40">Loading…</div>}

      {state.status === "error" && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {state.message}
        </div>
      )}

      {state.status === "ready" && state.cases.length === 0 && (
        <div className="rounded border border-dashed border-white/10 px-6 py-10 text-center text-sm text-white/40">
          No cases to export yet.
        </div>
      )}

      {state.status === "ready" && state.cases.length > 0 && (
        <ul className="divide-y divide-white/10">
          {state.cases.map((c) => (
            <CaseRow key={c.id} value={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CaseRow({ value }: { value: Case }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className="text-sm text-white">{value.name}</div>
        <div className="font-mono text-[10px] text-white/30">{value.slug}</div>
      </div>
      <ExportButtons caseId={value.id} slug={value.slug} />
    </li>
  );
}

export function ExportButtons({ caseId, slug }: { caseId: string; slug: string }) {
  const [busy, setBusy] = useState<null | "md" | "pdf">(null);
  const [error, setError] = useState<string | null>(null);

  async function onMarkdown() {
    setBusy("md");
    setError(null);
    try {
      const { content } = await rpc.call("report.markdown", { caseId });
      downloadString(`${slug}.md`, content, "text/markdown;charset=utf-8");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function onPrint() {
    // Browser-native print is more reliable than server-side chromium on
    // every platform, and dodges the Bun + playwright + Windows hang.
    window.open(reportUrl(caseId, "html"), "_blank");
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-300">{error}</span>}
      <button
        type="button"
        onClick={onMarkdown}
        disabled={busy !== null}
        className="rounded border border-white/10 px-3 py-1 text-xs text-white/70 hover:border-white/30 hover:text-white disabled:opacity-40"
      >
        {busy === "md" ? "…" : "Markdown"}
      </button>
      <button
        type="button"
        onClick={onPrint}
        title="Opens the report in a new tab; press Ctrl/Cmd+P to print or save as PDF."
        className="rounded border border-white/10 px-3 py-1 text-xs text-white/70 hover:border-white/30 hover:text-white"
      >
        Print
      </button>
    </div>
  );
}
