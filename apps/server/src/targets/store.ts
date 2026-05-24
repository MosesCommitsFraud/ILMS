import { randomUUID } from "node:crypto";

import type { Target, TargetCreateInput } from "@ilms/contracts/target";

import { getDb } from "../db";

interface TargetRow {
  id: string;
  case_id: string;
  kind: string;
  value: string;
  label: string | null;
  created_at: string;
}

function rowToTarget(row: TargetRow): Target {
  return {
    id: row.id,
    caseId: row.case_id,
    kind: row.kind as Target["kind"],
    value: row.value,
    label: row.label,
    createdAt: row.created_at,
  };
}

export function listTargets(caseId: string): Target[] {
  const rows = getDb()
    .query(
      "SELECT id, case_id, kind, value, label, created_at FROM targets WHERE case_id = ? ORDER BY created_at ASC",
    )
    .all(caseId) as TargetRow[];
  return rows.map(rowToTarget);
}

export function createTarget(input: TargetCreateInput): Target {
  const row: TargetRow = {
    id: randomUUID(),
    case_id: input.caseId,
    kind: input.kind,
    value: input.value,
    label: input.label ?? null,
    created_at: new Date().toISOString(),
  };
  try {
    getDb().run(
      "INSERT INTO targets (id, case_id, kind, value, label, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [row.id, row.case_id, row.kind, row.value, row.label, row.created_at],
    );
  } catch (error) {
    if (error instanceof Error && /UNIQUE/.test(error.message)) {
      throw new Error("Target already exists in this case");
    }
    throw error;
  }
  return rowToTarget(row);
}

export function deleteTarget(id: string): void {
  getDb().run("DELETE FROM targets WHERE id = ?", [id]);
}
