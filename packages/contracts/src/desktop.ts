import { z } from "zod";

export const DesktopAdvertisedEndpointSchema = z.object({
  httpUrl: z.string().url(),
  wsUrl: z.string().url(),
});
export type DesktopAdvertisedEndpoint = z.infer<typeof DesktopAdvertisedEndpointSchema>;

export interface DesktopBridge {
  advertisedEndpoint?: DesktopAdvertisedEndpoint | null;
  [key: string]: unknown;
}
