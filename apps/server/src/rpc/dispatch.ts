import {
  RpcRequestSchema,
  rpcMethods,
  type RpcInput,
  type RpcMethod,
} from "@ilms/contracts/rpc";
import { ZodError } from "zod";

import { listCases } from "../cases/store";
import { startRun } from "../runs/manager";
import { listTools } from "../tools/registry";

type RpcHandlers = {
  [M in RpcMethod]: (input: RpcInput<M>) => Promise<unknown> | unknown;
};

const handlers = {
  "case.list": () => listCases(),
  "tool.list": () => listTools(),
  "tool.run": ({ toolId, input }) => ({ runId: startRun(toolId, input) }),
} satisfies RpcHandlers;

function executeParsedRpcHandler(method: RpcMethod, input: unknown) {
  const handler = handlers[method] as (input: unknown) => Promise<unknown> | unknown;
  return handler(input);
}

function decodeFrame(message: unknown): unknown {
  if (typeof message === "string") return JSON.parse(message);
  if (message instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(message));
  return message;
}

function errorPayload(error: unknown) {
  if (error instanceof ZodError) {
    return { code: "BAD_REQUEST", message: "Invalid RPC payload", details: error.format() };
  }
  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "Unexpected RPC error",
  };
}

export async function dispatchRpc(raw: unknown) {
  let id: string | number = "unknown";
  try {
    const request = RpcRequestSchema.parse(decodeFrame(raw));
    id = request.id;
    const method = rpcMethods[request.method];
    const input = method.input.parse(request.input);
    const result = await executeParsedRpcHandler(request.method, input);
    return { id, result: method.output.parse(result) };
  } catch (error) {
    return { id, error: errorPayload(error) };
  }
}
