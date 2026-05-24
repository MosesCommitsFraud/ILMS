import { randomBytes, randomUUID } from "node:crypto";

import type { Case, CaseCreateInput, CaseUpdateInput } from "@ilms/contracts/case";

import { getDb } from "../db";

interface CaseRow {
  id: string;
  slug: string;
  name: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

function rowToCase(row: CaseRow): Case {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = randomBytes(3).toString("hex");
  return base ? `${base}-${suffix}` : `case-${suffix}`;
}

export function listCases(): Case[] {
  const rows = getDb()
    .query("SELECT id, slug, name, notes, created_at, updated_at FROM cases ORDER BY updated_at DESC")
    .all() as CaseRow[];
  return rows.map(rowToCase);
}

export function getCase(id: string): Case {
  const row = getDb()
    .query("SELECT id, slug, name, notes, created_at, updated_at FROM cases WHERE id = ?")
    .get(id) as CaseRow | null;
  if (!row) throw new Error(`Case not found: ${id}`);
  return rowToCase(row);
}

export function createCase(input: CaseCreateInput): Case {
  const now = new Date().toISOString();
  const row: CaseRow = {
    id: randomUUID(),
    slug: slugify(input.name),
    name: input.name,
    notes: "",
    created_at: now,
    updated_at: now,
  };
  getDb().run(
    "INSERT INTO cases (id, slug, name, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [row.id, row.slug, row.name, row.notes, row.created_at, row.updated_at],
  );
  return rowToCase(row);
}

export function updateCase(input: CaseUpdateInput): Case {
  const existing = getCase(input.id);
  const next: Case = {
    ...existing,
    name: input.name ?? existing.name,
    notes: input.notes ?? existing.notes,
    updatedAt: new Date().toISOString(),
  };
  getDb().run(
    "UPDATE cases SET name = ?, notes = ?, updated_at = ? WHERE id = ?",
    [next.name, next.notes, next.updatedAt, next.id],
  );
  return next;
}

export function deleteCase(id: string): void {
  getDb().run("DELETE FROM cases WHERE id = ?", [id]);
}
