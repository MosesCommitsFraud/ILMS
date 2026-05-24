import type { RpcEvent } from "@ilms/contracts/rpc";

interface WsLike {
  send(data: string): unknown;
}

const clients = new Set<WsLike>();
const internalListeners = new Set<(event: RpcEvent) => void>();

export function addClient(ws: WsLike): void {
  clients.add(ws);
}

export function removeClient(ws: WsLike): void {
  clients.delete(ws);
}

/**
 * Subscribe to broadcast events from inside the server process. Used by the
 * agent runner to await a specific runId's done event without speaking WS.
 * Returns an unsubscribe.
 */
export function onEventInternal(handler: (event: RpcEvent) => void): () => void {
  internalListeners.add(handler);
  return () => internalListeners.delete(handler);
}

export function broadcastEvent(event: RpcEvent): void {
  const frame = JSON.stringify(event);
  for (const ws of clients) {
    try {
      ws.send(frame);
    } catch {
      clients.delete(ws);
    }
  }
  for (const handler of internalListeners) {
    try {
      handler(event);
    } catch {
      /* listener should not break the bus */
    }
  }
}
