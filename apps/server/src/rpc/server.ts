import { Elysia } from "elysia";

import { dispatchRpc } from "./dispatch";

export const rpcRoutes = new Elysia({ name: "ilms/rpc" }).ws("/rpc", {
  async message(ws, message) {
    ws.send(JSON.stringify(await dispatchRpc(message)));
  },
});
