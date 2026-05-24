import { spawn } from "node:child_process";

export interface UvRunOptions {
  /** Args after `uv tool run`. */
  args: string[];
  signal: AbortSignal;
  env?: Record<string, string>;
}

export interface UvLine {
  stream: "stdout" | "stderr";
  line: string;
}

export type UvEvent =
  | { kind: "line"; line: UvLine }
  | { kind: "exit"; code: number | null }
  | { kind: "spawn-error"; message: string };

function resolveUvBinary(): string {
  return process.env.UV_BIN?.trim() || (process.platform === "win32" ? "uv.exe" : "uv");
}

/**
 * Spawn `uv tool run <args>` and yield stdout/stderr lines as they arrive,
 * followed by an exit event. If uv itself can't be spawned (not installed),
 * yields a single `spawn-error` event and returns.
 */
export async function* runUv(options: UvRunOptions): AsyncIterable<UvEvent> {
  const bin = resolveUvBinary();
  const child = spawn(bin, ["tool", "run", ...options.args], {
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const queue: UvEvent[] = [];
  let waiter: (() => void) | null = null;
  let finished = false;

  const push = (event: UvEvent) => {
    queue.push(event);
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  };

  const onClose = () => {
    if (finished) return;
    finished = true;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  };

  child.on("error", (error) => {
    push({ kind: "spawn-error", message: error.message });
    onClose();
  });
  child.on("exit", (code) => {
    push({ kind: "exit", code });
    onClose();
  });

  attachLineReader(child.stdout, "stdout", push);
  attachLineReader(child.stderr, "stderr", push);

  const abortHandler = () => {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  };
  options.signal.addEventListener("abort", abortHandler, { once: true });

  try {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (finished) break;
      await new Promise<void>((resolve) => {
        waiter = resolve;
      });
    }
  } finally {
    options.signal.removeEventListener("abort", abortHandler);
  }
}

function attachLineReader(
  stream: NodeJS.ReadableStream | null,
  name: "stdout" | "stderr",
  push: (event: UvEvent) => void,
): void {
  if (!stream) return;
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const raw = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      if (raw.length > 0) push({ kind: "line", line: { stream: name, line: raw } });
      newlineIndex = buffer.indexOf("\n");
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      push({ kind: "line", line: { stream: name, line: buffer } });
      buffer = "";
    }
  });
}
