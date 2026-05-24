import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { Database } from "bun:sqlite";

import { migrate } from "./migrate";

function resolveDbPath(): string {
  const explicit = process.env.ILMS_DB_PATH?.trim();
  if (explicit) return explicit;
  const dataDir = process.env.ILMS_DATA_DIR?.trim() || join(process.cwd(), "data");
  return join(dataDir, "ilms.db");
}

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;
  const path = resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}
