import type { ArtifactEvent } from "@ilms/contracts/run";

import { broadcastEvent, onEventInternal } from "../rpc/broadcast";
import { getToolDriver } from "../tools/registry";

import { finishRun, insertArtifact, insertRun, listArtifacts } from "./store";

interface RunState {
  id: string;
  toolId: string;
  caseId: string | null;
  controller: AbortController;
}

const runs = new Map<string, RunState>();

export function startRun(args: {
  toolId: string;
  input: Record<string, unknown>;
  caseId: string | null;
}): string {
  const driver = getToolDriver(args.toolId);
  if (!driver) {
    throw new Error(`Unknown tool: ${args.toolId}`);
  }

  const persisted = insertRun({ caseId: args.caseId, toolId: args.toolId, input: args.input });
  const controller = new AbortController();
  runs.set(persisted.id, {
    id: persisted.id,
    toolId: args.toolId,
    caseId: args.caseId,
    controller,
  });

  const events = driver.run(args.input, { runId: persisted.id, signal: controller.signal });
  void executeRun(persisted.id, args.caseId, events).finally(() => {
    runs.delete(persisted.id);
  });

  return persisted.id;
}

export function cancelRun(runId: string): boolean {
  const run = runs.get(runId);
  if (!run) return false;
  run.controller.abort();
  return true;
}

/**
 * Kick off a run and wait until it emits a `done` event over the broadcast
 * bus, then summarize what happened for the caller. The agent runner uses
 * this to surface tool results back to the model as tool_result blocks.
 */
export async function runToCompletion(args: {
  toolId: string;
  input: Record<string, unknown>;
  caseId: string | null;
}): Promise<{
  runId: string;
  ok: boolean;
  artifactCount: number;
  errorMessage: string | null;
}> {
  const runId = startRun(args);

  let lastError: string | null = null;
  const donePromise = new Promise<{ ok: boolean }>((resolve) => {
    const unsubscribe = onEventInternal((event) => {
      if (event.event !== "run.event" || event.key !== runId) return;
      const payload = event.payload as { kind: string; message?: string };
      if (payload.kind === "error" && payload.message) lastError = payload.message;
      if (payload.kind === "done") {
        unsubscribe();
        resolve({ ok: lastError === null });
      }
    });
  });

  const { ok } = await donePromise;
  const artifacts = args.caseId
    ? listArtifacts({ caseId: args.caseId }).filter((a) => a.runId === runId)
    : listArtifacts({ runId });
  return { runId, ok, artifactCount: artifacts.length, errorMessage: lastError };
}

async function executeRun(
  runId: string,
  caseId: string | null,
  events: AsyncIterable<ArtifactEvent>,
): Promise<void> {
  let saw_error = false;
  let saw_done = false;
  try {
    for await (const event of events) {
      if (event.kind === "artifact") {
        const inserted = insertArtifact({ caseId, runId, artifact: event.artifact });
        if (!inserted) continue; // dedup — don't broadcast a duplicate
      }
      if (event.kind === "error") saw_error = true;
      if (event.kind === "done") saw_done = true;
      broadcastEvent({ event: "run.event", key: runId, payload: event });
    }
    finishRun(runId, saw_error ? "failed" : "completed");
    if (!saw_done) {
      broadcastEvent({
        event: "run.event",
        key: runId,
        payload: { kind: "done", exitCode: saw_error ? 1 : 0 },
      });
    }
  } catch (error) {
    finishRun(runId, "failed");
    broadcastEvent({
      event: "run.event",
      key: runId,
      payload: {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      },
    });
    broadcastEvent({
      event: "run.event",
      key: runId,
      payload: { kind: "done", exitCode: null },
    });
  }
}
