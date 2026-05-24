import {
  RpcRequestSchema,
  rpcMethods,
  type RpcInput,
  type RpcMethod,
} from "@ilms/contracts/rpc";
import { ZodError } from "zod";

import {
  createCase,
  deleteCase,
  getCase,
  listCases,
  updateCase,
} from "../cases/store";
import { startRun } from "../runs/manager";
import { listArtifacts, listRuns } from "../runs/store";
import { deleteSecret, listSecrets, setSecret } from "../secrets/store";
import { createTarget, deleteTarget, listTargets } from "../targets/store";
import { listTools } from "../tools/registry";

type RpcHandlers = {
  [M in RpcMethod]: (input: RpcInput<M>) => Promise<unknown> | unknown;
};

const handlers = {
  "case.list": () => listCases(),
  "case.get": ({ id }) => getCase(id),
  "case.create": (input) => createCase(input),
  "case.update": (input) => updateCase(input),
  "case.delete": ({ id }) => {
    deleteCase(id);
    return { ok: true };
  },
  "target.list": ({ caseId }) => listTargets(caseId),
  "target.create": (input) => createTarget(input),
  "target.delete": ({ id }) => {
    deleteTarget(id);
    return { ok: true };
  },
  "run.list": ({ caseId }) => listRuns(caseId),
  "artifact.list": (query) => listArtifacts(query),
  "tool.list": () => listTools(),
  "tool.run": ({ toolId, input, caseId }) => ({
    runId: startRun({ toolId, input, caseId: caseId ?? null }),
  }),
  "secrets.list": () => listSecrets(),
  "secrets.set": ({ key, value }) => {
    setSecret(key, value);
    return { ok: true };
  },
  "secrets.delete": ({ key }) => {
    deleteSecret(key);
    return { ok: true };
  },
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
