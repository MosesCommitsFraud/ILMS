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
  identifier: z.string().trim().min(1),
});

const descriptor: ToolDescriptor = {
  id: "facebook-recover",
  label: "Facebook Recover Lookup",
  description:
    "Search facebook.com/login/identify for partial recovery hints (obfuscated email/phone, display name).",
  risk: "tos-grey",
  inputFields: [
    {
      name: "identifier",
      label: "Email, phone, or full name",
      kind: "text",
      required: true,
      placeholder: "person@example.com",
    },
  ],
  requiredSecrets: [],
};

export const facebookRecoverDriver: ToolDriver = {
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
        kind: "progress",
        message:
          "No saved Facebook session. Opening browser for one-time login — sign in, then close the window when done.",
      };
      try {
        const session = await openSession({ profile: PROFILE, headless: false, signal: ctx.signal });
        await session.page.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded" });
        await session.closed;
        yield {
          kind: "progress",
          message: "Session saved. Re-run this tool to perform the search.",
        };
        yield { kind: "done", exitCode: 0 };
        return;
      } catch (error) {
        if (error instanceof BrowserMissingError) {
          yield { kind: "error", message: error.message };
          return;
        }
        throw error;
      }
    }

    yield { kind: "progress", message: `Searching Facebook for "${parsed.data.identifier}"…` };

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
      await page.goto("https://www.facebook.com/login/identify/?ctx=recover", {
        waitUntil: "domcontentloaded",
      });

      const inputField = page.locator('input[name="email"]');
      if ((await inputField.count()) === 0) {
        yield {
          kind: "error",
          message:
            "Recovery form not found. Facebook may have changed the page or invalidated the saved session — delete the Facebook profile under data/playwright/ to re-login.",
        };
        yield { kind: "done", exitCode: 1 };
        return;
      }

      await inputField.first().fill(parsed.data.identifier);
      await page.locator('button[name="did_submit"], button[type="submit"]').first().click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

      const bodyText = await page.locator("body").innerText().catch(() => "");
      const lines = bodyText.split("\n").map((s) => s.trim()).filter(Boolean);

      const obfuscatedEmail = lines.find((l) => /\*+@/.test(l));
      const obfuscatedPhone = lines.find((l) => /\*+\d{2,}/.test(l) && !/@/.test(l));

      if (obfuscatedEmail) {
        yield {
          kind: "artifact",
          artifact: { kind: "hint", source: "facebook-recover", field: "email", value: obfuscatedEmail },
        };
      }
      if (obfuscatedPhone) {
        yield {
          kind: "artifact",
          artifact: { kind: "hint", source: "facebook-recover", field: "phone", value: obfuscatedPhone },
        };
      }

      const screenshotName = lines.find((l) => /^[A-Z][a-zA-Z'\-\s]{1,40}$/.test(l));
      if (screenshotName) {
        yield {
          kind: "artifact",
          artifact: { kind: "hint", source: "facebook-recover", field: "name", value: screenshotName },
        };
      }

      if (!obfuscatedEmail && !obfuscatedPhone && !screenshotName) {
        yield {
          kind: "log",
          level: "info",
          message: "No hints parsed. Facebook may have shown a captcha, login wall, or no-match page.",
        };
      }

      yield { kind: "done", exitCode: 0 };
    } finally {
      await session.close();
    }
  },
};
