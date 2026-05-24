import type { PendingPermissionRequest } from "@ilms/contracts/agent";

/**
 * Permission requests, indexed by id. opencode owns the lifecycle — it emits
 * `permission.updated` when a request is created and `permission.replied`
 * when answered — so we just mirror the live set here for the UI.
 */
const pending = new Map<string, PendingPermissionRequest>();

export function recordPermission(request: PendingPermissionRequest): void {
  pending.set(request.id, request);
}

export function clearPermission(permissionId: string): void {
  pending.delete(permissionId);
}

export function listPending(sessionId: string): PendingPermissionRequest[] {
  return Array.from(pending.values()).filter((p) => p.sessionId === sessionId);
}

export function getPermission(permissionId: string): PendingPermissionRequest | null {
  return pending.get(permissionId) ?? null;
}
