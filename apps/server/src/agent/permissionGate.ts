import { randomUUID } from "node:crypto";

import type { PendingPermissionRequest } from "@ilms/contracts/agent";

interface PendingEntry extends PendingPermissionRequest {
  resolve: (approved: boolean) => void;
}

const pending = new Map<string, PendingEntry>();

export function createPermissionRequest(args: {
  sessionId: string;
  toolUseId: string;
  toolId: string;
  input: Record<string, unknown>;
}): { request: PendingPermissionRequest; decision: Promise<boolean> } {
  const id = randomUUID();
  const request: PendingPermissionRequest = {
    id,
    sessionId: args.sessionId,
    toolUseId: args.toolUseId,
    toolId: args.toolId,
    input: args.input,
    createdAt: new Date().toISOString(),
  };
  let resolve!: (approved: boolean) => void;
  const decision = new Promise<boolean>((res) => {
    resolve = res;
  });
  pending.set(id, { ...request, resolve });
  return { request, decision };
}

export function resolvePermission(permissionId: string, approved: boolean): boolean {
  const entry = pending.get(permissionId);
  if (!entry) return false;
  pending.delete(permissionId);
  entry.resolve(approved);
  return true;
}

export function listPending(sessionId: string): PendingPermissionRequest[] {
  return Array.from(pending.values())
    .filter((p) => p.sessionId === sessionId)
    .map(({ resolve: _, ...rest }) => rest);
}

/** Drop pending requests when a session restarts; resolves them as denied so the runner doesn't hang. */
export function cancelSessionPending(sessionId: string): void {
  for (const [id, entry] of pending.entries()) {
    if (entry.sessionId === sessionId) {
      pending.delete(id);
      entry.resolve(false);
    }
  }
}
