import {
  RpcResponseSchema,
  rpcMethods,
  type RpcErrorPayload,
  type RpcInput,
  type RpcMethod,
  type RpcOutput,
} from "@ilms/contracts/rpc";

import { createWsTransport, type WsTransport } from "./wsTransport";

export interface RpcClientOptions {
  url: string | (() => string);
  timeoutMs?: number;
  reconnectDelayMs?: number;
}

export class RpcError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(payload: RpcErrorPayload) {
    super(payload.message);
    this.name = "RpcError";
    this.code = payload.code;
    this.details = payload.details;
  }
}

export class RpcClient {
  private nextId = 0;
  private readonly timeoutMs: number;
  private readonly transport: WsTransport;
  private readonly pending = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(options: RpcClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.transport = createWsTransport({
      url: options.url,
      ...(options.reconnectDelayMs !== undefined ? { reconnectDelayMs: options.reconnectDelayMs } : {}),
    });
    this.transport.subscribe((message) => this.handleMessage(message));
    this.transport.onDisconnect((error) => this.rejectPending(error));
  }

  async call<M extends RpcMethod>(method: M, input: RpcInput<M>): Promise<RpcOutput<M>> {
    const definition = rpcMethods[method];
    const parsedInput = definition.input.parse(input);
    const id = ++this.nextId;
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC call timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      void this.transport.send({ id, method, input: parsedInput }).catch((error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
    return definition.output.parse(result) as RpcOutput<M>;
  }

  close(): void {
    this.transport.close();
  }

  private handleMessage(message: unknown): void {
    const parsed = RpcResponseSchema.safeParse(message);
    if (!parsed.success) return;
    const entry = this.pending.get(parsed.data.id);
    if (!entry) return;
    this.pending.delete(parsed.data.id);
    clearTimeout(entry.timer);
    if (parsed.data.error) {
      entry.reject(new RpcError(parsed.data.error));
      return;
    }
    entry.resolve(parsed.data.result);
  }

  private rejectPending(error: Error): void {
    for (const [id, entry] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(entry.timer);
      entry.reject(error);
    }
  }
}

export function createRpcClient(options: RpcClientOptions): RpcClient {
  return new RpcClient(options);
}
