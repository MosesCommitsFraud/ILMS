import { z } from "zod";

import type { ArtifactEvent } from "@ilms/contracts/run";
import type { ToolDescriptor } from "@ilms/contracts/tool";

import { runUv } from "../runtime/uvRunner";
import type { RunContext, ToolDriver } from "../ToolDriver";

const InputSchema = z.object({
  username: z.string().trim().min(1),
});

const SHERLOCK_HIT = /^\[\+\]\s+(.+?):\s+(https?:\/\/\S+)/;

const descriptor: ToolDescriptor = {
  id: "sherlock",
  label: "Sherlock",
  description: "Check whether a username is registered on a wide list of sites.",
  risk: "safe-public",
  inputFields: [
    {
      name: "username",
      label: "Username",
      kind: "text",
      required: true,
      placeholder: "e.g. johndoe",
    },
  ],
};

export const sherlockDriver: ToolDriver = {
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

    const { username } = parsed.data;
    yield { kind: "progress", message: `Running sherlock for "${username}"…` };

    const args = [
      "--from",
      "sherlock-project",
      "sherlock",
      username,
      "--print-found",
      "--no-color",
      "--no-txt",
    ];
    let sawAnyOutput = false;
    let spawnFailed = false;

    for await (const event of runUv({ args, signal: ctx.signal })) {
      if (event.kind === "spawn-error") {
        spawnFailed = true;
        yield {
          kind: "error",
          message:
            `Could not launch uv (${event.message}). Install Astral's uv to run python tools — see https://docs.astral.sh/uv/.`,
        };
        return;
      }
      if (event.kind === "exit") {
        yield { kind: "done", exitCode: event.code };
        return;
      }
      sawAnyOutput = true;
      const { stream, line } = event.line;
      if (stream === "stderr") {
        yield { kind: "log", level: "warn", message: line };
        continue;
      }
      const match = line.match(SHERLOCK_HIT);
      const site = match?.[1];
      const url = match?.[2];
      if (site && url) {
        yield {
          kind: "artifact",
          artifact: { kind: "profile", site: site.trim(), url: url.trim(), username },
        };
      } else {
        yield { kind: "log", level: "info", message: line };
      }
    }

    if (!sawAnyOutput && !spawnFailed) {
      yield { kind: "log", level: "info", message: "sherlock produced no output" };
    }
  },
};
