import { randomUUID } from "node:crypto";

import type { AgentSession } from "@ilms/contracts/agent";

import { getDb } from "../db";

interface SessionRow {
  id: string;
  case_id: string;
  opencode_session_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSession(row: SessionRow): AgentSession {
  return {
    id: row.id,
    caseId: row.case_id,
    opencodeSessionId: row.opencode_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function openSession(caseId: string): AgentSession {
  const db = getDb();
  const existing = db
    .query(
      "SELECT id, case_id, opencode_session_id, created_at, updated_at FROM agent_sessions WHERE case_id = ?",
    )
    .get(caseId) as SessionRow | null;
  if (existing) return rowToSession(existing);

  const now = new Date().toISOString();
  const row: SessionRow = {
    id: randomUUID(),
    case_id: caseId,
    opencode_session_id: null,
    created_at: now,
    updated_at: now,
  };
  db.run(
    "INSERT INTO agent_sessions (id, case_id, opencode_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [row.id, row.case_id, row.opencode_session_id, row.created_at, row.updated_at],
  );
  return rowToSession(row);
}

export function getSession(sessionId: string): AgentSession | null {
  const row = getDb()
    .query(
      "SELECT id, case_id, opencode_session_id, created_at, updated_at FROM agent_sessions WHERE id = ?",
    )
    .get(sessionId) as SessionRow | null;
  return row ? rowToSession(row) : null;
}

export function getSessionByOpencodeId(opencodeSessionId: string): AgentSession | null {
  const row = getDb()
    .query(
      "SELECT id, case_id, opencode_session_id, created_at, updated_at FROM agent_sessions WHERE opencode_session_id = ?",
    )
    .get(opencodeSessionId) as SessionRow | null;
  return row ? rowToSession(row) : null;
}

export function setOpencodeSessionId(sessionId: string, opencodeSessionId: string): void {
  const now = new Date().toISOString();
  getDb().run(
    "UPDATE agent_sessions SET opencode_session_id = ?, updated_at = ? WHERE id = ?",
    [opencodeSessionId, now, sessionId],
  );
}

export function touchSession(sessionId: string): void {
  getDb().run("UPDATE agent_sessions SET updated_at = ? WHERE id = ?", [
    new Date().toISOString(),
    sessionId,
  ]);
}
