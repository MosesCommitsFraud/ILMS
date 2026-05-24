import { randomUUID } from "node:crypto";

import type {
  Artifact,
  PersistedArtifact,
  Run,
  RunStatus,
} from "@ilms/contracts/run";

import { getDb } from "../db";

import { dedupKey } from "./dedupKey";

interface RunRow {
  id: string;
  case_id: string | null;
  tool_id: string;
  input: string;
  status: string;
  started_at: string;
  ended_at: string | null;
}

interface ArtifactRow {
  id: string;
  case_id: string | null;
  run_id: string;
  kind: string;
  payload: string;
  created_at: string;
}

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    caseId: row.case_id,
    toolId: row.tool_id,
    status: row.status as RunStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    input: JSON.parse(row.input) as Record<string, unknown>,
  };
}

function rowToArtifact(row: ArtifactRow): PersistedArtifact {
  return {
    id: row.id,
    caseId: row.case_id,
    runId: row.run_id,
    artifact: JSON.parse(row.payload) as Artifact,
    createdAt: row.created_at,
  };
}

export function insertRun(args: {
  caseId: string | null;
  toolId: string;
  input: Record<string, unknown>;
}): Run {
  const row: RunRow = {
    id: randomUUID(),
    case_id: args.caseId,
    tool_id: args.toolId,
    input: JSON.stringify(args.input),
    status: "running",
    started_at: new Date().toISOString(),
    ended_at: null,
  };
  getDb().run(
    "INSERT INTO runs (id, case_id, tool_id, input, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [row.id, row.case_id, row.tool_id, row.input, row.status, row.started_at, row.ended_at],
  );
  return rowToRun(row);
}

export function finishRun(runId: string, status: RunStatus): void {
  getDb().run(
    "UPDATE runs SET status = ?, ended_at = ? WHERE id = ?",
    [status, new Date().toISOString(), runId],
  );
}

export function listRuns(caseId: string): Run[] {
  const rows = getDb()
    .query(
      "SELECT id, case_id, tool_id, input, status, started_at, ended_at FROM runs WHERE case_id = ? ORDER BY started_at DESC",
    )
    .all(caseId) as RunRow[];
  return rows.map(rowToRun);
}

export function getRun(runId: string): Run | null {
  const row = getDb()
    .query(
      "SELECT id, case_id, tool_id, input, status, started_at, ended_at FROM runs WHERE id = ?",
    )
    .get(runId) as RunRow | null;
  return row ? rowToRun(row) : null;
}

/** Insert artifact; returns true if inserted, false if deduped. */
export function insertArtifact(args: {
  caseId: string | null;
  runId: string;
  artifact: Artifact;
}): boolean {
  const id = randomUUID();
  const payload = JSON.stringify(args.artifact);
  const createdAt = new Date().toISOString();
  const dedup = dedupKey(args.artifact);
  try {
    getDb().run(
      "INSERT INTO artifacts (id, case_id, run_id, kind, payload, dedup_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, args.caseId, args.runId, args.artifact.kind, payload, dedup, createdAt],
    );
    return true;
  } catch (error) {
    if (error instanceof Error && /UNIQUE/.test(error.message)) {
      return false;
    }
    throw error;
  }
}

export function listArtifacts(query: {
  caseId?: string | undefined;
  runId?: string | undefined;
}): PersistedArtifact[] {
  if (!query.caseId && !query.runId) {
    throw new Error("artifact.list requires caseId or runId");
  }
  const filters: string[] = [];
  const params: string[] = [];
  if (query.caseId) {
    filters.push("case_id = ?");
    params.push(query.caseId);
  }
  if (query.runId) {
    filters.push("run_id = ?");
    params.push(query.runId);
  }
  const sql =
    "SELECT id, case_id, run_id, kind, payload, created_at FROM artifacts WHERE " +
    filters.join(" AND ") +
    " ORDER BY created_at ASC";
  const rows = getDb().query(sql).all(...params) as ArtifactRow[];
  return rows.map(rowToArtifact);
}
