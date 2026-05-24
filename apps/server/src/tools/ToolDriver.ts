import type { ArtifactEvent } from "@ilms/contracts/run";
import type { ToolDescriptor } from "@ilms/contracts/tool";

export interface RunContext {
  runId: string;
  signal: AbortSignal;
}

export interface ToolDriver {
  describe(): ToolDescriptor;
  /**
   * Validate the raw input bag and execute the run. Yields ArtifactEvents
   * (progress, log, artifact, done, error) as they become available.
   *
   * Drivers must surface their own validation errors as a final
   * `{ kind: "error" }` event rather than throwing — that way the
   * dispatcher always responds with a runId and the UI shows the failure
   * in the run stream.
   */
  run(input: Record<string, unknown>, ctx: RunContext): AsyncIterable<ArtifactEvent>;
}
