import { z } from "zod";

import type { ArtifactEvent } from "@ilms/contracts/run";
import type { ToolDescriptor } from "@ilms/contracts/tool";

import { runUv } from "../runtime/uvRunner";
import { resolveRequiredSecrets } from "../runtime/secretGuard";
import type { RunContext, ToolDriver } from "../ToolDriver";

const API_ID_KEY = "informer.telegram.api_id";
const API_HASH_KEY = "informer.telegram.api_hash";

const InputSchema = z.object({
  channel: z.string().trim().min(1),
});

const URL_RE = /(https?:\/\/[^\s]+)/g;

const descriptor: ToolDescriptor = {
  id: "informer",
  label: "Informer",
  description: "Telegram OSINT: discover and monitor channels / groups via the Telegram API.",
  risk: "rate-limited",
  inputFields: [
    {
      name: "channel",
      label: "Telegram channel or username",
      kind: "text",
      required: true,
      placeholder: "e.g. @durov",
    },
  ],
  requiredSecrets: [
    {
      key: API_ID_KEY,
      label: "Telegram api_id",
      help: "Create at https://my.telegram.org → API development tools.",
    },
    {
      key: API_HASH_KEY,
      label: "Telegram api_hash",
      help: "Pair with api_id from the same Telegram developer page.",
    },
  ],
};

export const informerDriver: ToolDriver = {
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
    const secrets = resolveRequiredSecrets(descriptor);
    if (!secrets.ok) {
      yield { kind: "error", message: secrets.message };
      return;
    }

    const channel = parsed.data.channel;
    yield { kind: "progress", message: `Scanning Telegram for "${channel}"…` };

    // informer isn't on PyPI; uv installs it from source on first run.
    const args = [
      "--from",
      "git+https://github.com/paulpierre/informer",
      "informer",
      "--channel",
      channel,
    ];

    for await (const event of runUv({
      args,
      signal: ctx.signal,
      env: {
        TELEGRAM_API_ID: secrets.values[API_ID_KEY]!,
        TELEGRAM_API_HASH: secrets.values[API_HASH_KEY]!,
      },
    })) {
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
          yield { kind: "artifact", artifact: { kind: "link", url, label: "informer" } };
        }
      }
    }
  },
};
