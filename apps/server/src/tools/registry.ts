import type { ToolDescriptor } from "@ilms/contracts/tool";

import { crosslinkedDriver } from "./Drivers/crosslinked";
import { discordOsintDriver } from "./Drivers/discordOsint";
import { facebookDirectoryDriver } from "./Drivers/facebookDirectory";
import { facebookRecoverDriver } from "./Drivers/facebookRecover";
import { informerDriver } from "./Drivers/informer";
import { redectiveDriver } from "./Drivers/redective";
import { sherlockDriver } from "./Drivers/sherlock";
import { snapchatMapDriver } from "./Drivers/snapchatMap";
import { soigDriver } from "./Drivers/soig";
import { toutatisDriver } from "./Drivers/toutatis";
import type { ToolDriver } from "./ToolDriver";

const driverList: ToolDriver[] = [
  sherlockDriver,
  soigDriver,
  toutatisDriver,
  crosslinkedDriver,
  informerDriver,
  facebookRecoverDriver,
  facebookDirectoryDriver,
  redectiveDriver,
  snapchatMapDriver,
  discordOsintDriver,
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
