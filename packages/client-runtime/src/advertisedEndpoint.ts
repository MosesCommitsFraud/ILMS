import { DesktopAdvertisedEndpointSchema, type DesktopAdvertisedEndpoint } from "@ilms/contracts";

import { getDesktopBridge } from "./environment";

export function getAdvertisedEndpoint(): DesktopAdvertisedEndpoint | null {
  const endpoint = getDesktopBridge()?.advertisedEndpoint;
  const parsed = DesktopAdvertisedEndpointSchema.safeParse(endpoint);
  return parsed.success ? parsed.data : null;
}

export function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}
