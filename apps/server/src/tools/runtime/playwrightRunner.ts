import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { BrowserContext, Page } from "playwright-core";
import { chromium } from "playwright-core";

export interface PlaywrightProfilePaths {
  userDataDir: string;
  hasState: boolean;
}

function resolveProfileRoot(): string {
  const dataDir = process.env.ILMS_DATA_DIR?.trim() || join(process.cwd(), "data");
  return join(dataDir, "playwright");
}

export function profilePaths(profile: string): PlaywrightProfilePaths {
  const root = resolveProfileRoot();
  const userDataDir = join(root, profile);
  return {
    userDataDir,
    hasState: existsSync(userDataDir),
  };
}

export interface PlaywrightSession {
  context: BrowserContext;
  page: Page;
  /** Resolves when the user closes the browser window (interactive mode). */
  closed: Promise<void>;
  close(): Promise<void>;
}

export interface OpenSessionArgs {
  profile: string;
  headless: boolean;
  signal: AbortSignal;
}

export class BrowserMissingError extends Error {
  constructor() {
    super(
      "Playwright Chromium is not installed. Run `bun run --filter @ilms/server prepare:playwright` to download it (one-time, ~150MB).",
    );
    this.name = "BrowserMissingError";
  }
}

/**
 * Open a persistent Chromium context for the given profile. The user data
 * directory is created on first use; subsequent calls re-attach to the same
 * profile so saved cookies and localStorage persist.
 */
export async function openSession(args: OpenSessionArgs): Promise<PlaywrightSession> {
  const paths = profilePaths(args.profile);
  mkdirSync(paths.userDataDir, { recursive: true });

  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(paths.userDataDir, {
      headless: args.headless,
    });
  } catch (error) {
    if (error instanceof Error && /Executable doesn't exist|browserType\.launch/i.test(error.message)) {
      throw new BrowserMissingError();
    }
    throw error;
  }

  const pages = context.pages();
  const page = pages[0] ?? (await context.newPage());

  let closeResolve: () => void = () => {};
  const closed = new Promise<void>((resolve) => {
    closeResolve = resolve;
  });
  context.on("close", () => closeResolve());

  const abortHandler = () => {
    void context.close().catch(() => undefined);
  };
  args.signal.addEventListener("abort", abortHandler, { once: true });

  return {
    context,
    page,
    closed,
    async close() {
      args.signal.removeEventListener("abort", abortHandler);
      try {
        await context.close();
      } catch {
        /* ignore */
      }
    },
  };
}
