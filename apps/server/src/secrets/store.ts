import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { SecretEntry } from "@ilms/contracts/secrets";

/**
 * Dev-only secrets store. Writes plaintext JSON to ILMS_DATA_DIR/secrets.json.
 * The path is gitignored. This module is the only place that touches the disk
 * for secrets; when the Tauri keychain bridge lands, swap this implementation
 * and keep the exported API unchanged.
 */

interface SecretRow {
  value: string;
  updatedAt: string;
}

function resolveStorePath(): string {
  const explicit = process.env.ILMS_SECRETS_PATH?.trim();
  if (explicit) return explicit;
  const dataDir = process.env.ILMS_DATA_DIR?.trim() || join(process.cwd(), "data");
  return join(dataDir, "secrets.json");
}

let cache: Record<string, SecretRow> | null = null;
let cachePath: string | null = null;

function load(): Record<string, SecretRow> {
  const path = resolveStorePath();
  if (cache && cachePath === path) return cache;
  cachePath = path;
  if (!existsSync(path)) {
    cache = {};
    return cache;
  }
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Record<string, SecretRow>;
    cache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist(): void {
  if (!cachePath || !cache) return;
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf8");
}

export function getSecret(key: string): string | null {
  const row = load()[key];
  return row?.value ?? null;
}

export function listSecrets(): SecretEntry[] {
  const data = load();
  return Object.entries(data).map(([key, row]) => ({
    key,
    hasValue: row.value.length > 0,
    updatedAt: row.updatedAt,
  }));
}

export function setSecret(key: string, value: string): void {
  const data = load();
  data[key] = { value, updatedAt: new Date().toISOString() };
  persist();
}

export function deleteSecret(key: string): void {
  const data = load();
  if (key in data) {
    delete data[key];
    persist();
  }
}
