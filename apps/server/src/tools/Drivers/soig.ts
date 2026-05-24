import { z } from "zod";

import type { ArtifactEvent } from "@ilms/contracts/run";
import type { ToolDescriptor } from "@ilms/contracts/tool";

import { runUv } from "../runtime/uvRunner";
import type { RunContext, ToolDriver } from "../ToolDriver";

const InputSchema = z.object({
  username: z.string().trim().min(1),
});

const URL_RE = /(https?:\/\/[^\s]+)/g;

const descriptor: ToolDescriptor = {
  id: "soig",
  label: "SoIG",
  description: "Social-OSINT Instagram tool — pulls public profile metadata from a username.",
  risk: "rate-limited",
  inputFields: [
    {
      name: "username",
      label: "Instagram username",
      kind: "text",
      required: true,
      placeholder: "e.g. johndoe",
    },
  ],
  requiredSecrets: [],
};

export const soigDriver: ToolDriver = {
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

    const username = parsed.data.username;
    yield { kind: "progress", message: `Looking up "${username}" on Instagram…` };

    // SoIG isn't on PyPI; uv installs it from source on first run.
    const args = [
      "--from",
      "git+https://github.com/yezz123/SoIG",
      "soig",
      "-u",
      username,
    ];

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
      yield {
        kind: "log",
        level: stream === "stderr" ? "warn" : "info",
        message: line,
      };
      const matches = line.match(URL_RE);
      if (matches) {
        for (const url of matches) {
          yield { kind: "artifact", artifact: { kind: "link", url, label: "soig" } };
        }
      }
    }
  },
};
