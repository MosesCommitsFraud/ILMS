import type { ToolDescriptor } from "@ilms/contracts/tool";

import { crosslinkedDriver } from "./Drivers/crosslinked";
import { informerDriver } from "./Drivers/informer";
import { sherlockDriver } from "./Drivers/sherlock";
import { soigDriver } from "./Drivers/soig";
import { toutatisDriver } from "./Drivers/toutatis";
import type { ToolDriver } from "./ToolDriver";

const driverList: ToolDriver[] = [
  sherlockDriver,
  soigDriver,
  toutatisDriver,
  crosslinkedDriver,
  informerDriver,
];

const drivers: Record<string, ToolDriver> = Object.fromEntries(
  driverList.map((d) => [d.describe().id, d]),
);

export function listTools(): ToolDescriptor[] {
  return driverList.map((d) => d.describe());
}

export function getToolDriver(id: string): ToolDriver | null {
  return drivers[id] ?? null;
}
