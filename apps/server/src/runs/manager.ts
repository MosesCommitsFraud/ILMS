import type { ArtifactEvent } from "@ilms/contracts/run";

import { broadcastEvent } from "../rpc/broadcast";
import { getToolDriver } from "../tools/registry";

import { finishRun, insertArtifact, insertRun } from "./store";

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
