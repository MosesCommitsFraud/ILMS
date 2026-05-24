import type { Case } from "@ilms/contracts/case";
import type { PersistedArtifact, Run } from "@ilms/contracts/run";
import type { Target } from "@ilms/contracts/target";
import type { ToolDescriptor } from "@ilms/contracts/tool";

export interface CaseContext {
  case: Case;
  targets: Target[];
  recentRuns: Run[];
  artifactCounts: Record<string, number>;
}

export function buildSystemPrompt(args: {
  caseContext: CaseContext;
  tools: ToolDescriptor[];
}): string {
  const { caseContext, tools } = args;
  const c = caseContext.case;

  const targetsBlock = caseContext.targets.length
    ? caseContext.targets.map((t) => `  - ${t.kind}: ${t.value}${t.label ? ` (${t.label})` : ""}`).join("\n")
    : "  (none)";

  const runsBlock = caseContext.recentRuns.length
    ? caseContext.recentRuns
        .slice(0, 8)
        .map((r) => `  - ${r.toolId} ${r.status} (input: ${JSON.stringify(r.input)})`)
        .join("\n")
    : "  (none)";

  const artifactsBlock = Object.entries(caseContext.artifactCounts)
    .map(([kind, n]) => `  - ${kind}: ${n}`)
    .join("\n") || "  (none)";

  const toolCatalog = tools
    .map((t) => {
      const fields = t.inputFields.map((f) => `${f.name}${f.required ? "" : "?"}: ${f.kind}`).join(", ");
      const secrets = t.requiredSecrets.length
        ? ` [secrets: ${t.requiredSecrets.map((s) => s.key).join(", ")}]`
        : "";
      return `  - **${t.id}** [${t.risk}] (${fields}): ${t.description}${secrets}`;
    })
    .join("\n");

  return `You are the ILMS OSINT investigation assistant.

You are embedded in a desktop OSINT workbench. Every tool call you make is gated by an explicit user approval — you propose, the human approves, then the tool runs.

## Case context

- **Name**: ${c.name}
- **Slug**: ${c.slug}
- **Notes**: ${c.notes.trim() || "(empty)"}

### Targets
${targetsBlock}

### Recent runs
${runsBlock}

### Artifacts on file
${artifactsBlock}

## Available tools

${toolCatalog}

## How to work

1. **Plan before you act.** When the user asks something, briefly state the steps you intend to take.
2. **Propose one tool call at a time.** Each tool call surfaces a permission prompt to the user; calling many at once makes the approval flow noisy.
3. **Respect risk tags.** \`safe-public\` is fine to suggest freely. \`rate-limited\` and \`tos-grey\` need an explicit reason in your message. \`login-required\` may need the user to do a one-time login first; mention that.
4. **No mass scraping.** Caps and rate limits are enforced server-side; do not try to circumvent them.
5. **Cite artifacts.** When you reference a finding, name the tool that produced it.
6. **Stop when you've delivered an answer.** Don't keep chaining tools if the question is answered.

## Ethics

You operate against publicly accessible sources. Do not assist with stalking, harassment, doxing of private individuals, or anything illegal under applicable law. If a request looks like it crosses that line, say so and stop.
`;
}
