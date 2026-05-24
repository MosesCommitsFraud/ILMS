import { z } from "zod";

import type { ArtifactEvent } from "@ilms/contracts/run";
import type { ToolDescriptor } from "@ilms/contracts/tool";

import { runUv } from "../runtime/uvRunner";
import { resolveRequiredSecrets } from "../runtime/secretGuard";
import type { RunContext, ToolDriver } from "../ToolDriver";

const SESSION_ID_KEY = "toutatis.instagram.sessionid";

const InputSchema = z.object({
  username: z.string().trim().min(1),
});

const URL_RE = /(https?:\/\/[^\s]+)/g;

const descriptor: ToolDescriptor = {
  id: "toutatis",
  label: "Toutatis",
  description:
    "Extract Instagram account information (linked email/phone hints, profile id) from a username, using a logged-in Instagram session cookie.",
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
  requiredSecrets: [
    {
      key: SESSION_ID_KEY,
      label: "Instagram sessionid cookie",
      help: "Copy the `sessionid` cookie from an authenticated instagram.com session.",
    },
  ],
};

export const toutatisDriver: ToolDriver = {
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

    const username = parsed.data.username;
    const sessionId = secrets.values[SESSION_ID_KEY]!;
    yield { kind: "progress", message: `Querying Instagram for "${username}"…` };

    const args = ["--from", "toutatis", "toutatis", "-u", username, "-s", sessionId];

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
      // Toutatis prints "[!] Key : Value" and "[+] ..." lines; surface them as logs.
      yield {
        kind: "log",
        level: stream === "stderr" ? "warn" : "info",
        message: line,
      };
      const matches = line.match(URL_RE);
      if (matches) {
        for (const url of matches) {
          yield { kind: "artifact", artifact: { kind: "link", url, label: "toutatis" } };
        }
      }
    }
  },
};
