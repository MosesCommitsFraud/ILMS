import { randomUUID } from "node:crypto";

import type {
  AgentMessage,
  AgentMessageContent,
  AgentSession,
} from "@ilms/contracts/agent";

import { getDb } from "../db";

interface SessionRow {
  id: string;
  case_id: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  sequence: number;
  content: string;
  created_at: string;
}

function rowToSession(row: SessionRow): AgentSession {
  return {
    id: row.id,
    caseId: row.case_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): AgentMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    content: JSON.parse(row.content) as AgentMessageContent,
    createdAt: row.created_at,
  };
}

export function openSession(caseId: string): AgentSession {
  const db = getDb();
  const existing = db
    .query("SELECT id, case_id, created_at, updated_at FROM agent_sessions WHERE case_id = ?")
    .get(caseId) as SessionRow | null;
  if (existing) return rowToSession(existing);

  const now = new Date().toISOString();
  const row: SessionRow = {
    id: randomUUID(),
    case_id: caseId,
    created_at: now,
    updated_at: now,
  };
  db.run(
    "INSERT INTO agent_sessions (id, case_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [row.id, row.case_id, row.created_at, row.updated_at],
  );
  return rowToSession(row);
}

export function getSession(sessionId: string): AgentSession | null {
  const row = getDb()
    .query("SELECT id, case_id, created_at, updated_at FROM agent_sessions WHERE id = ?")
    .get(sessionId) as SessionRow | null;
  return row ? rowToSession(row) : null;
}

export function listMessages(sessionId: string): AgentMessage[] {
  const rows = getDb()
    .query(
      "SELECT id, session_id, sequence, content, created_at FROM agent_messages WHERE session_id = ? ORDER BY sequence ASC",
    )
    .all(sessionId) as MessageRow[];
  return rows.map(rowToMessage);
}

function nextSequence(sessionId: string): number {
  const row = getDb()
    .query("SELECT MAX(sequence) AS max_seq FROM agent_messages WHERE session_id = ?")
    .get(sessionId) as { max_seq: number | null } | null;
  return (row?.max_seq ?? -1) + 1;
}

export function appendMessage(
  sessionId: string,
  content: AgentMessageContent,
): AgentMessage {
  const seq = nextSequence(sessionId);
  const row: MessageRow = {
    id: randomUUID(),
    session_id: sessionId,
    sequence: seq,
    content: JSON.stringify(content),
    created_at: new Date().toISOString(),
  };
  getDb().run(
    "INSERT INTO agent_messages (id, session_id, sequence, content, created_at) VALUES (?, ?, ?, ?, ?)",
    [row.id, row.session_id, row.sequence, row.content, row.created_at],
  );
  getDb().run("UPDATE agent_sessions SET updated_at = ? WHERE id = ?", [row.created_at, sessionId]);
  return rowToMessage(row);
}
