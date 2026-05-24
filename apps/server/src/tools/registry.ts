import type { ToolDescriptor } from "@ilms/contracts/tool";

import { sherlockDriver } from "./Drivers/sherlock";
import type { ToolDriver } from "./ToolDriver";

const drivers: Record<string, ToolDriver> = {
  [sherlockDriver.describe().id]: sherlockDriver,
};

export function listTools(): ToolDescriptor[] {
  return Object.values(drivers).map((d) => d.describe());
}

export function getToolDriver(id: string): ToolDriver | null {
  return drivers[id] ?? null;
}
