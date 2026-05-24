import { useCallback, useEffect, useMemo, useState } from "react";

import type { SecretEntry, ToolDescriptor, ToolSecretRequirement } from "@ilms/contracts";

import { rpc } from "../rpc/client";

interface ToolGroup {
  tool: ToolDescriptor;
  requirements: ToolSecretRequirement[];
}

export function SettingsRoute() {
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [entries, setEntries] = useState<SecretEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [t, e] = await Promise.all([
        rpc.call("tool.list", {}),
        rpc.call("secrets.list", {}),
      ]);
      setTools(t);
      setEntries(e);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const groups: ToolGroup[] = useMemo(
    () =>
      tools
        .filter((t) => t.requiredSecrets.length > 0)
        .map((t) => ({ tool: t, requirements: t.requiredSecrets })),
    [tools],
  );

  const entryByKey = useMemo(() => {
    const map = new Map<string, SecretEntry>();
    for (const e of entries) map.set(e.key, e);
    return map;
  }, [entries]);

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-white/40">
          Secrets are stored locally and never leave this machine.
          <span className="ml-1 text-white/30">
            (Dev fallback: plaintext JSON under <code>data/secrets.json</code>. OS keychain integration via Tauri is pending.)
          </span>
        </p>
      </header>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded border border-dashed border-white/10 px-6 py-10 text-center text-sm text-white/30">
          No tools currently require secrets.
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.tool.id}>
            <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">{g.tool.label}</h2>
            <div className="space-y-4">
              {g.requirements.map((req) => (
                <SecretRow
                  key={req.key}
                  requirement={req}
                  entry={entryByKey.get(req.key) ?? null}
                  onChanged={() => void refresh()}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function SecretRow({
  requirement,
  entry,
  onChanged,
}: {
  requirement: ToolSecretRequirement;
  entry: SecretEntry | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await rpc.call("secrets.set", { key: requirement.key, value: value.trim() });
      setValue("");
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    if (busy) return;
    setBusy(true);
    try {
      await rpc.call("secrets.delete", { key: requirement.key });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-white/10 px-4 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-sm text-white">{requirement.label}</div>
          <div className="font-mono text-[10px] text-white/30">{requirement.key}</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              "rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider " +
              (entry?.hasValue
                ? "border-emerald-500/30 text-emerald-300"
                : "border-white/10 text-white/40")
            }
          >
            {entry?.hasValue ? "set" : "not set"}
          </span>
          {entry?.hasValue && !editing && (
            <button
              type="button"
              onClick={() => void onClear()}
              className="text-xs text-white/30 hover:text-red-300"
            >
              clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-xs text-white/40 hover:text-white"
          >
            {editing ? "cancel" : entry?.hasValue ? "replace" : "set"}
          </button>
        </div>
      </div>
      {requirement.help && (
        <p className="mt-1 text-xs text-white/40">{requirement.help}</p>
      )}
      {editing && (
        <form onSubmit={onSave} className="mt-3 flex gap-2">
          <input
            autoFocus
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="enter value"
            className="flex-1 rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
          <button
            type="submit"
            disabled={!value.trim() || busy}
            className="rounded border border-white/20 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </form>
      )}
      {error && (
        <div className="mt-2 rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
