import { createOpencodeClient } from "@opencode-ai/sdk/client";

import { opencodeBaseUrl } from "./opencodeRuntime";

let cached: ReturnType<typeof createOpencodeClient> | null = null;

export function getOpencodeClient() {
  if (cached) return cached;
  cached = createOpencodeClient({ baseUrl: opencodeBaseUrl() });
  return cached;
}
