import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { ensureOpencodeRuntime, stopOpencodeRuntime } from "./agent/opencodeRuntime";
import { getDb } from "./db";
import { reportRoutes } from "./reports/routes";
import { rpcRoutes } from "./rpc/server";

// Open + migrate the database at module load so the first RPC call doesn't pay
// the migration cost and we surface schema errors during boot.
getDb();

// Kick off the opencode sidecar in the background. Failure (binary missing,
// auth not configured) is non-fatal — the agent route will surface it. The
// server itself stays useful for case + tool operations without an agent.
const httpUrl = process.env.ILMS_HTTP_URL?.trim() || "http://127.0.0.1:4242";
const wsUrl = process.env.ILMS_WS_URL?.trim() || httpUrl.replace(/^http/, "ws") + "/rpc";
void ensureOpencodeRuntime({ httpUrl, wsUrl }).catch((error) => {
  console.error("[opencode] boot skipped:", error instanceof Error ? error.message : error);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopOpencodeRuntime();
    process.exit(0);
  });
}

function resolveCorsOrigin(): true | string[] {
  const raw = process.env.ILMS_CORS_ALLOWED_ORIGINS?.trim();
  if (!raw || raw === "*") return true;
  return raw.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
}

export function createApp() {
  return new Elysia()
    .use(
      cors({
        origin: resolveCorsOrigin(),
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: false,
      }),
    )
    .get("/", () => ({ healthy: true, service: "ilms-server" }))
    .get("/health", () => ({ healthy: true, service: "ilms-server" }))
    .post("/shutdown", () => {
      stopOpencodeRuntime();
      setTimeout(() => process.exit(0), 10);
      return { ok: true };
    })
    .use(reportRoutes)
    .use(rpcRoutes);
}

export const app = createApp();
