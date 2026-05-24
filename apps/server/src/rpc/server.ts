import { Elysia } from "elysia";

import { addClient, removeClient } from "./broadcast";
import { dispatchRpc } from "./dispatch";

export const rpcRoutes = new Elysia({ name: "ilms/rpc" }).ws("/rpc", {
  open(ws) {
    addClient(ws);
  },
  close(ws) {
    removeClient(ws);
  },
  async message(ws, message) {
    ws.send(JSON.stringify(await dispatchRpc(message)));
  },
});
