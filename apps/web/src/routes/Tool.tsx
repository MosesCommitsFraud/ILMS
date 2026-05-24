import { useEffect, useMemo, useState } from "react";

import type { ToolDescriptor, ToolInputField } from "@ilms/contracts/tool";

import { rpc } from "../rpc/client";

interface ToolRouteProps {
  toolId: string;
  onBack: () => void;
  onRunStarted: (runId: string) => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; tool: ToolDescriptor }
  | { status: "error"; message: string };

export function ToolRoute({ toolId, onBack, onRunStarted }: ToolRouteProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    rpc
      .call("tool.list", {})
      .then((tools) => {
        if (cancelled) return;
        const tool = tools.find((t) => t.id === toolId);
        if (!tool) {
          setState({ status: "error", message: `Tool not found: ${toolId}` });
          return;
        }
        setState({ status: "ready", tool });
        const defaults: Record<string, string> = {};
        for (const f of tool.inputFields) {
          if (f.defaultValue !== undefined) defaults[f.name] = String(f.defaultValue);
        }
        setValues(defaults);
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
  }, [toolId]);

  const tool = state.status === "ready" ? state.tool : null;
  const canSubmit = useMemo(() => {
    if (!tool) return false;
    return tool.inputFields.every((f) => !f.required || (values[f.name]?.trim() ?? "") !== "");
  }, [tool, values]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tool || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const input = coerceInput(tool.inputFields, values);
      const { runId } = await rpc.call("tool.run", { toolId: tool.id, input });
      onRunStarted(runId);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 text-xs uppercase tracking-wider text-white/40 hover:text-white/70"
      >
        ← Tools
      </button>

      {state.status === "loading" && <div className="text-sm text-white/40">Loading…</div>}
      {state.status === "error" && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {state.message}
        </div>
      )}

      {tool && (
        <>
          <header className="mb-8">
            <h1 className="text-2xl font-medium tracking-tight">{tool.label}</h1>
            <p className="mt-1 text-sm text-white/40">{tool.description}</p>
          </header>

          <form onSubmit={onSubmit} className="space-y-5">
            {tool.inputFields.map((f) => (
              <Field
                key={f.name}
                field={f}
                value={values[f.name] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.name]: v }))}
              />
            ))}

            {submitError && (
              <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="rounded border border-white/20 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Starting…" : "Run"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: ToolInputField;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-white/50">
        {field.label}
        {field.required && <span className="text-red-300"> *</span>}
      </span>
      <input
        type={field.kind === "number" ? "number" : "text"}
        value={value}
        placeholder={field.placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
      />
      {field.help && <p className="mt-1 text-xs text-white/40">{field.help}</p>}
    </label>
  );
}

function coerceInput(
  fields: ToolInputField[],
  values: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.name];
    if (raw === undefined || raw === "") continue;
    out[f.name] = f.kind === "number" ? Number(raw) : raw;
  }
  return out;
}
