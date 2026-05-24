export interface WsTransportOptions {
  url: string | (() => string);
  reconnectDelayMs?: number;
}

export type WsMessageHandler = (message: unknown) => void;
export type WsDisconnectHandler = (error: Error) => void;

function decodeMessage(message: MessageEvent["data"]): unknown | Promise<unknown> {
  if (typeof message === "string") return JSON.parse(message);
  if (message instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(message));
  if (message instanceof Blob) return message.text().then((text) => JSON.parse(text));
  return message;
}

export class WsTransport {
  private socket: WebSocket | null = null;
  private connecting: Promise<WebSocket> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private manuallyClosed = false;
  private readonly listeners = new Set<WsMessageHandler>();
  private readonly disconnectListeners = new Set<WsDisconnectHandler>();

  constructor(private readonly options: WsTransportOptions) {}

  subscribe(listener: WsMessageHandler): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onDisconnect(listener: WsDisconnectHandler): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  async send(message: unknown): Promise<void> {
    const socket = await this.open();
    socket.send(JSON.stringify(message));
  }

  close(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connecting = null;
    this.socket?.close();
    this.socket = null;
  }

  private open(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    if (this.connecting) return this.connecting;
    this.manuallyClosed = false;

    this.connecting = new Promise((resolve, reject) => {
      const url = typeof this.options.url === "function" ? this.options.url() : this.options.url;
      const socket = new WebSocket(url);
      const clear = () => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
      };
      const onOpen = () => {
        clear();
        this.reconnectAttempts = 0;
        this.socket = socket;
        this.connecting = null;
        resolve(socket);
      };
      const onError = () => {
        clear();
        this.connecting = null;
        reject(new Error("RPC websocket connection failed"));
      };
      socket.addEventListener("open", onOpen, { once: true });
      socket.addEventListener("error", onError, { once: true });
      socket.addEventListener("close", () => {
        if (this.socket === socket) this.socket = null;
        this.connecting = null;
        if (!this.manuallyClosed) this.scheduleReconnect(new Error("RPC websocket disconnected"));
      });
      socket.addEventListener("message", (event) => {
        void Promise.resolve(decodeMessage(event.data))
          .then((decoded) => {
            for (const listener of this.listeners) listener(decoded);
          })
          .catch(() => undefined);
      });
    });

    return this.connecting;
  }

  private scheduleReconnect(error: Error): void {
    for (const listener of this.disconnectListeners) listener(error);
    if (this.manuallyClosed || this.reconnectTimer) return;
    const baseDelay = this.options.reconnectDelayMs ?? 500;
    const delay = Math.min(baseDelay * 2 ** this.reconnectAttempts, 10_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open().catch(() => {
        if (!this.manuallyClosed) this.scheduleReconnect(new Error("RPC websocket reconnect failed"));
      });
    }, delay);
  }
}

export function createWsTransport(options: WsTransportOptions): WsTransport {
  return new WsTransport(options);
}
