import type { Database } from "bun:sqlite";

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE cases (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE targets (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(case_id, kind, value)
      );

      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
        tool_id TEXT NOT NULL,
        input TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT
      );
      CREATE INDEX runs_case_idx ON runs(case_id);

      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        dedup_key TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX artifacts_case_idx ON artifacts(case_id);
      CREATE INDEX artifacts_run_idx ON artifacts(run_id);
      CREATE UNIQUE INDEX artifacts_case_dedup_idx
        ON artifacts(case_id, dedup_key)
        WHERE case_id IS NOT NULL AND dedup_key IS NOT NULL;
    `,
  },
];

export function migrate(db: Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const row = db
    .query("SELECT MAX(version) AS current FROM schema_version")
    .get() as { current: number | null } | null;
  const current = row?.current ?? 0;

  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.run("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)", [
        m.version,
        new Date().toISOString(),
      ]);
    })();
  }
}
