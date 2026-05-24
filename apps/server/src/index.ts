import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { rpcRoutes } from "./rpc/server";

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
    .use(rpcRoutes);
}

export const app = createApp();
