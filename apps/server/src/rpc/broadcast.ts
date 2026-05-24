import type { RpcEvent } from "@ilms/contracts/rpc";

interface WsLike {
  send(data: string): unknown;
}

const clients = new Set<WsLike>();

export function addClient(ws: WsLike): void {
  clients.add(ws);
}

export function removeClient(ws: WsLike): void {
  clients.delete(ws);
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
}
