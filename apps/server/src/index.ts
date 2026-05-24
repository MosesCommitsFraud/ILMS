import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { getDb } from "./db";
import { reportRoutes } from "./reports/routes";
import { rpcRoutes } from "./rpc/server";

// Open + migrate the database at module load so the first RPC call doesn't pay
// the migration cost and we surface schema errors during boot.
getDb();

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
      setTimeout(() => process.exit(0), 10);
      return { ok: true };
    })
    .use(reportRoutes)
    .use(rpcRoutes);
}

export const app = createApp();
