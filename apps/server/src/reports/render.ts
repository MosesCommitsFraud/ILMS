import type { Case } from "@ilms/contracts/case";
import type { PersistedArtifact, Run } from "@ilms/contracts/run";
import type { Target } from "@ilms/contracts/target";

export interface ReportBundle {
  case: Case;
  targets: Target[];
  runs: Run[];
  artifacts: PersistedArtifact[];
}

export function renderMarkdown(bundle: ReportBundle): string {
  const { case: c, targets, runs, artifacts } = bundle;
  const out: string[] = [];

  out.push(`# ${c.name}`);
  out.push("");
  out.push(`- **slug**: \`${c.slug}\``);
  out.push(`- **created**: ${c.createdAt}`);
  out.push(`- **updated**: ${c.updatedAt}`);
  out.push("");

  if (c.notes.trim().length > 0) {
    out.push("## Notes");
    out.push("");
    out.push(c.notes.trim());
    out.push("");
  }

  out.push(`## Targets (${targets.length})`);
  out.push("");
  if (targets.length === 0) {
    out.push("_No targets._");
  } else {
    for (const t of targets) {
      const label = t.label ? ` — ${t.label}` : "";
      out.push(`- **${t.kind}**: \`${t.value}\`${label}`);
    }
  }
  out.push("");

  out.push(`## Runs (${runs.length})`);
  out.push("");
  if (runs.length === 0) {
    out.push("_No runs._");
  } else {
    const runArtifactCounts = new Map<string, number>();
    for (const a of artifacts) {
      runArtifactCounts.set(a.runId, (runArtifactCounts.get(a.runId) ?? 0) + 1);
    }
    for (const r of runs) {
      const n = runArtifactCounts.get(r.id) ?? 0;
      out.push(`### ${r.toolId} — ${r.status}`);
      out.push("");
      out.push(`- **id**: \`${r.id}\``);
      out.push(`- **started**: ${r.startedAt}${r.endedAt ? ` — ended ${r.endedAt}` : ""}`);
      out.push(`- **input**: \`${JSON.stringify(r.input)}\``);
      out.push(`- **artifacts**: ${n}`);
      out.push("");
    }
  }

  out.push(`## Artifacts (${artifacts.length})`);
  out.push("");
  if (artifacts.length === 0) {
    out.push("_No artifacts._");
  } else {
    const byKind = groupBy(artifacts, (a) => a.artifact.kind);
    for (const [kind, list] of byKind) {
      out.push(`### ${kind} (${list.length})`);
      out.push("");
      for (const p of list) {
        out.push(`- ${renderArtifact(p)}`);
      }
      out.push("");
    }
  }

  return out.join("\n") + "\n";
}

function renderArtifact(p: PersistedArtifact): string {
  const a = p.artifact;
  switch (a.kind) {
    case "profile":
      return `**${a.site}** — [${a.url}](${a.url})${a.username ? ` (\`${a.username}\`)` : ""}`;
    case "link":
      return `[${a.label ?? a.url}](${a.url})`;
    case "email":
      return `\`${a.email}\`${a.source ? ` _(${a.source})_` : ""}`;
    case "hint":
      return `**${a.field}**: \`${a.value}\` _(${a.source})_`;
  }
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const bucket = out.get(k) ?? [];
    bucket.push(item);
    out.set(k, bucket);
  }
  return out;
}
