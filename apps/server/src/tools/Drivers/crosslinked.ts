import { z } from "zod";

import type { ArtifactEvent } from "@ilms/contracts/run";
import type { ToolDescriptor } from "@ilms/contracts/tool";

import { runUv } from "../runtime/uvRunner";
import type { RunContext, ToolDriver } from "../ToolDriver";

const InputSchema = z.object({
  company: z.string().trim().min(1),
  format: z.string().trim().min(1).default("{first}.{last}@example.com"),
});

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const descriptor: ToolDescriptor = {
  id: "crosslinked",
  label: "CrossLinked",
  description:
    "Enumerate employee names at a target company via LinkedIn search engine scraping, formatted into email addresses.",
  risk: "rate-limited",
  inputFields: [
    {
      name: "company",
      label: "LinkedIn company name",
      kind: "text",
      required: true,
      placeholder: "e.g. acme",
    },
    {
      name: "format",
      label: "Email format",
      kind: "text",
      required: true,
      defaultValue: "{first}.{last}@example.com",
      help: "Use {first}, {last}, {f}, {l} placeholders.",
    },
  ],
  requiredSecrets: [],
};

export const crosslinkedDriver: ToolDriver = {
  describe(): ToolDescriptor {
    return descriptor;
  },
  async *run(input: Record<string, unknown>, ctx: RunContext): AsyncIterable<ArtifactEvent> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) {
      yield {
        kind: "error",
        message: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      };
      return;
    }

    const { company, format } = parsed.data;
    yield { kind: "progress", message: `Enumerating "${company}" via LinkedIn search…` };

    const args = ["--from", "crosslinked", "crosslinked", "-f", format, company];

    const seen = new Set<string>();
    for await (const event of runUv({ args, signal: ctx.signal })) {
      if (event.kind === "spawn-error") {
        yield {
          kind: "error",
          message: `Could not launch uv (${event.message}). Install Astral's uv to run python tools.`,
        };
        return;
      }
      if (event.kind === "exit") {
        yield { kind: "done", exitCode: event.code };
        return;
      }
      const { stream, line } = event.line;
      const emails = line.match(EMAIL_RE);
      if (emails) {
        for (const raw of emails) {
          const email = raw.toLowerCase();
          if (seen.has(email)) continue;
          seen.add(email);
          yield {
            kind: "artifact",
            artifact: { kind: "email", email, source: "crosslinked" },
          };
        }
      } else {
        yield {
          kind: "log",
          level: stream === "stderr" ? "warn" : "info",
          message: line,
        };
      }
    }
  },
};
