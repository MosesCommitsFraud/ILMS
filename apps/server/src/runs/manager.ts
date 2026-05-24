import { randomUUID } from "node:crypto";

import type { ArtifactEvent } from "@ilms/contracts/run";

import { broadcastEvent } from "../rpc/broadcast";
import { getToolDriver } from "../tools/registry";

interface RunState {
  id: string;
  toolId: string;
  controller: AbortController;
}

const runs = new Map<string, RunState>();

export function startRun(toolId: string, input: Record<string, unknown>): string {
  const driver = getToolDriver(toolId);
  if (!driver) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  const runId = randomUUID();
  const controller = new AbortController();
  runs.set(runId, { id: runId, toolId, controller });

  void executeRun(runId, driver.run(input, { runId, signal: controller.signal })).finally(() => {
    runs.delete(runId);
  });

  return runId;
}

export function cancelRun(runId: string): boolean {
  const run = runs.get(runId);
  if (!run) return false;
  run.controller.abort();
  return true;
}

async function executeRun(runId: string, events: AsyncIterable<ArtifactEvent>): Promise<void> {
  try {
    for await (const event of events) {
      broadcastEvent({ event: "run.event", key: runId, payload: event });
    }
  } catch (error) {
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
