import type { ToolDescriptor } from "@ilms/contracts/tool";

import { getSecret } from "../../secrets/store";

export interface RequiredSecrets {
  ok: true;
  values: Record<string, string>;
}

export interface MissingSecrets {
  ok: false;
  message: string;
}

/**
 * Resolve every `requiredSecrets` key from the secrets store. On the first
 * miss, returns a single human-readable message that the driver can yield
 * as an `error` event.
 */
export function resolveRequiredSecrets(
  descriptor: ToolDescriptor,
): RequiredSecrets | MissingSecrets {
  const values: Record<string, string> = {};
  for (const req of descriptor.requiredSecrets) {
    const value = getSecret(req.key);
    if (!value) {
      return {
        ok: false,
        message: `Missing secret "${req.label}" (key: ${req.key}). Set it under Settings before running this tool.`,
      };
    }
    values[req.key] = value;
  }
  return { ok: true, values };
}
