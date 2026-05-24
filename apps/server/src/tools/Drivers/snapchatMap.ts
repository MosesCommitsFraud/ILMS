import { z } from "zod";

import type { ArtifactEvent } from "@ilms/contracts/run";
import type { ToolDescriptor } from "@ilms/contracts/tool";

import type { RunContext, ToolDriver } from "../ToolDriver";

const InputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(50).max(50_000).default(2000),
});

const descriptor: ToolDescriptor = {
  id: "snapchat-map",
  label: "Snapchat Map",
  description: "Query Snapchat's public Snap Map for stories within a radius of a coordinate.",
  risk: "rate-limited",
  inputFields: [
    {
      name: "lat",
      label: "Latitude",
      kind: "number",
      required: true,
      placeholder: "40.7128",
    },
    {
      name: "lng",
      label: "Longitude",
      kind: "number",
      required: true,
      placeholder: "-74.0060",
    },
    {
      name: "radiusMeters",
      label: "Radius (meters)",
      kind: "number",
      required: false,
      defaultValue: 2000,
    },
  ],
  requiredSecrets: [],
};

interface PlaylistResponse {
  manifest?: {
    elements?: Array<{
      id?: string;
      snapInfo?: {
        title?: string;
        publicUserStoryInfo?: { username?: string };
        timestamp?: string;
        streamingMediaInfo?: { prefixUrl?: string };
      };
    }>;
  };
}

export const snapchatMapDriver: ToolDriver = {
  describe(): ToolDescriptor {
    return descriptor;
  },
  async *run(input: Record<string, unknown>, ctx: RunContext): AsyncIterable<ArtifactEvent> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) {
      yield {
        kind: "error",
        message: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      };
      return;
    }
    const { lat, lng, radiusMeters } = parsed.data;
    yield {
      kind: "progress",
      message: `Querying Snap Map around (${lat}, ${lng}) r=${radiusMeters}m…`,
    };

    // Snapchat's public Snap Map web endpoint.
    const body = {
      requestGeoPoint: { lat, lon: lng },
      zoomLevel: 14,
      tileSetId: { flavor: "default", id: 1, version: 1 },
      radiusMeters,
      maximumFuzzRadius: 0,
    };

    let response: Response;
    try {
      response = await fetch("https://ms.sc-jpl.com/web/getPlaylist", {
        method: "POST",
        signal: ctx.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      yield {
        kind: "error",
        message: `Snap Map fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      yield { kind: "done", exitCode: 1 };
      return;
    }

    if (!response.ok) {
      yield {
        kind: "error",
        message: `Snap Map returned ${response.status}. The endpoint is reverse-engineered and may have changed.`,
      };
      yield { kind: "done", exitCode: 1 };
      return;
    }

    let payload: PlaylistResponse;
    try {
      payload = (await response.json()) as PlaylistResponse;
    } catch (error) {
      yield {
        kind: "error",
        message: `Could not parse Snap Map response: ${error instanceof Error ? error.message : String(error)}`,
      };
      yield { kind: "done", exitCode: 1 };
      return;
    }

    const elements = payload.manifest?.elements ?? [];
    yield { kind: "log", level: "info", message: `Got ${elements.length} story element(s).` };

    for (const el of elements) {
      const username = el.snapInfo?.publicUserStoryInfo?.username;
      const title = el.snapInfo?.title;
      const prefixUrl = el.snapInfo?.streamingMediaInfo?.prefixUrl;
      const id = el.id ?? "";
      const url = prefixUrl ?? (username ? `https://story.snapchat.com/s/${username}` : `https://snapchat.com/s/${id}`);
      yield {
        kind: "artifact",
        artifact: {
          kind: "link",
          url,
          label: title || username || `snapchat-story-${id}`,
        },
      };
    }
    yield { kind: "done", exitCode: 0 };
  },
};
