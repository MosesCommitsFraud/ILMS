import { z } from "zod";

import type { ArtifactEvent } from "@ilms/contracts/run";
import type { ToolDescriptor } from "@ilms/contracts/tool";

import {
  BrowserMissingError,
  openSession,
  profilePaths,
} from "../runtime/playwrightRunner";
import type { RunContext, ToolDriver } from "../ToolDriver";

const PROFILE = "facebook";

const InputSchema = z.object({
  prefix: z.string().trim().toLowerCase().regex(/^[a-z]$/, "Prefix must be a single letter a-z"),
  maxPages: z.number().int().min(1).max(20).default(3),
});

const descriptor: ToolDescriptor = {
  id: "facebook-directory",
  label: "Facebook Directory",
  description:
    "Browse facebook.com/directory/people/<letter>/ and yield public profile links.",
  risk: "tos-grey",
  inputFields: [
    {
      name: "prefix",
      label: "Starting letter",
      kind: "text",
      required: true,
      placeholder: "a",
      help: "Single letter a-z.",
    },
    {
      name: "maxPages",
      label: "Max pages",
      kind: "number",
      required: false,
      defaultValue: 3,
    },
  ],
  requiredSecrets: [],
};

export const facebookDirectoryDriver: ToolDriver = {
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

    const paths = profilePaths(PROFILE);
    if (!paths.hasState) {
      yield {
        kind: "error",
        message:
          "No saved Facebook session. Run the Facebook Recover Lookup tool first to sign in and capture cookies.",
      };
      return;
    }

    let session;
    try {
      session = await openSession({ profile: PROFILE, headless: true, signal: ctx.signal });
    } catch (error) {
      if (error instanceof BrowserMissingError) {
        yield { kind: "error", message: error.message };
        return;
      }
      throw error;
    }

    try {
      const { page } = session;
      const seen = new Set<string>();
      for (let pageNum = 1; pageNum <= parsed.data.maxPages; pageNum++) {
        const url = `https://www.facebook.com/directory/people/${parsed.data.prefix}/${pageNum}`;
        yield { kind: "progress", message: `Fetching page ${pageNum}…` };
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

        const links = await page
          .locator('a[href*="/people/"], a[href^="https://www.facebook.com/"][role="link"]')
          .evaluateAll((nodes) =>
            nodes
              .map((n) => ({
                href: n.getAttribute("href") ?? "",
                text: (n.textContent ?? "").trim(),
              }))
              .filter((entry) => /\/people\/|facebook\.com\/[^/]+\/?$/.test(entry.href))
              .filter((entry) => !entry.href.includes("/directory/")),
          )
          .catch(() => [] as Array<{ href: string; text: string }>);

        let yielded = 0;
        for (const link of links) {
          const absolute = new URL(link.href, "https://www.facebook.com").toString();
          if (seen.has(absolute)) continue;
          seen.add(absolute);
          const username = link.text || absolute.split("/").filter(Boolean).pop() || "";
          yield {
            kind: "artifact",
            artifact: { kind: "profile", site: "Facebook", url: absolute, username },
          };
          yielded++;
        }

        if (yielded === 0) {
          yield {
            kind: "log",
            level: "info",
            message: `No profile links found on page ${pageNum}. Facebook may have shown a login wall.`,
          };
          break;
        }
      }
      yield { kind: "done", exitCode: 0 };
    } finally {
      await session.close();
    }
  },
};
