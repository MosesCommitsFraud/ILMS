import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { AgentRuntimeStatus } from "@ilms/contracts/agent";

const DEFAULT_BASE_URL = process.env.OPENCODE_BASE_URL?.trim() || "http://127.0.0.1:4096";
const WEB_ORIGIN = process.env.ILMS_WEB_ORIGIN?.trim() || "http://localhost:5733";

interface RuntimeState {
  child: ReturnType<typeof Bun.spawn> | null;
  startPromise: Promise<void> | null;
  lastError: string | null;
}

const state: RuntimeState = {
  child: null,
  startPromise: null,
  lastError: null,
};

export function opencodeBaseUrl(): string {
  return DEFAULT_BASE_URL;
}

function healthUrl(): string {
  return `${DEFAULT_BASE_URL.replace(/\/$/, "")}/global/health`;
}

async function isHealthy(): Promise<boolean> {
  try {
    const response = await fetch(healthUrl(), { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await Bun.file(p).stat()).isFile();
  } catch {
    return false;
  }
}

async function resolveOpenCodeBinary(): Promise<string | null> {
  const explicit = process.env.OPENCODE_BIN?.trim();
  if (explicit && (await isFile(explicit))) return explicit;
  const candidates =
    process.platform === "win32" ? ["opencode.exe", "opencode.cmd", "opencode.bat", "opencode"] : ["opencode"];
  const dirs = (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").filter(Boolean);
  const home = os.homedir();
  if (home) {
    dirs.push(path.join(home, ".local", "bin"));
    dirs.push(path.join(home, ".bun", "bin"));
  }
  for (const dir of dirs) {
    for (const candidate of candidates) {
      const full = path.join(dir, candidate);
      if (await isFile(full)) return full;
    }
  }
  return null;
}

function findWorkspaceRoot(): string {
  let dir = path.dirname(new URL(import.meta.url).pathname);
  // import.meta.url on Windows gives "/C:/..." — strip the leading "/"
  if (process.platform === "win32" && /^\/[A-Za-z]:/.test(dir)) dir = dir.slice(1);
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "apps", "mcp", "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

async function writeRuntimeConfig(httpUrl: string, wsUrl: string): Promise<string> {
  const root = findWorkspaceRoot();
  const configDir = path.join(os.homedir() || os.tmpdir(), ".ilms", "opencode-runtime");
  await mkdir(configDir, { recursive: true });
  const configPath = path.join(configDir, "opencode.json");
  const mcpEntry = path.join(root, "apps", "mcp", "src", "server.ts");

  const config = {
    mcp: {
      ilms: {
        type: "local" as const,
        command: ["bun", mcpEntry],
        environment: {
          ILMS_HTTP_URL: httpUrl,
          ILMS_WS_URL: wsUrl,
        },
      },
    },
    instructions: [],
  };
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  return configPath;
}

async function waitForHealth(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("opencode started but health check timed out");
}

export async function ensureOpencodeRuntime(args: {
  httpUrl: string;
  wsUrl: string;
}): Promise<void> {
  if (await isHealthy()) return;
  if (state.startPromise) return state.startPromise;
  state.startPromise = (async () => {
    const binary = await resolveOpenCodeBinary();
    if (!binary) {
      const message =
        "opencode binary not found on PATH. Install from https://opencode.ai/ then run `opencode auth login` once.";
      state.lastError = message;
      throw new Error(message);
    }
    const configPath = await writeRuntimeConfig(args.httpUrl, args.wsUrl);
    const child = Bun.spawn([binary, "serve", "--cors", WEB_ORIGIN], {
      env: { ...process.env, OPENCODE_CONFIG: configPath },
      stdout: "ignore",
      stderr: "ignore",
    });
    state.child = child;
    void child.exited.then(() => {
      state.child = null;
    });
    try {
      await waitForHealth();
      state.lastError = null;
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      state.child = null;
      throw error;
    }
  })().finally(() => {
    state.startPromise = null;
  });
  return state.startPromise;
}

export function stopOpencodeRuntime(): void {
  if (!state.child) return;
  try {
    state.child.kill();
  } catch {
    /* ignore */
  }
  state.child = null;
}

export async function getRuntimeStatus(): Promise<AgentRuntimeStatus> {
  const binary = await resolveOpenCodeBinary();
  return {
    binaryFound: binary !== null,
    running: state.child !== null,
    healthy: await isHealthy(),
    baseUrl: DEFAULT_BASE_URL,
    lastError: state.lastError,
  };
}
