import { z } from "zod";

import type { ArtifactEvent } from "@ilms/contracts/run";
import type { ToolDescriptor } from "@ilms/contracts/tool";

import type { RunContext, ToolDriver } from "../ToolDriver";

const InputSchema = z.object({
  username: z.string().trim().min(1),
  mode: z.enum(["about", "submitted", "comments"]).default("submitted"),
  limit: z.number().int().min(1).max(100).default(25),
});

const descriptor: ToolDescriptor = {
  id: "redective",
  label: "Redective",
  description:
    "Reddit account intelligence via the public JSON API — about, submissions, or recent comments for a username.",
  risk: "safe-public",
  inputFields: [
    {
      name: "username",
      label: "Reddit username",
      kind: "text",
      required: true,
      placeholder: "e.g. spez",
    },
    {
      name: "mode",
      label: "Mode",
      kind: "select",
      required: true,
      defaultValue: "submitted",
      options: [
        { value: "about", label: "About profile" },
        { value: "submitted", label: "Recent submissions" },
        { value: "comments", label: "Recent comments" },
      ],
    },
    {
      name: "limit",
      label: "Limit",
      kind: "number",
      required: false,
      defaultValue: 25,
    },
  ],
  requiredSecrets: [],
};

interface AboutPayload {
  data?: {
    name?: string;
    created_utc?: number;
    link_karma?: number;
    comment_karma?: number;
    icon_img?: string;
    subreddit?: { url?: string; title?: string };
  };
}

interface ListingPayload {
  data?: {
    children?: Array<{
      data?: {
        permalink?: string;
        title?: string;
        link_title?: string;
        body?: string;
        subreddit?: string;
        created_utc?: number;
      };
    }>;
  };
}

export const redectiveDriver: ToolDriver = {
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

    const { username, mode, limit } = parsed.data;
    const url =
      mode === "about"
        ? `https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`
        : `https://www.reddit.com/user/${encodeURIComponent(username)}/${mode}.json?limit=${limit}`;

    yield { kind: "progress", message: `Fetching ${mode} for u/${username}…` };

    let response: Response;
    try {
      response = await fetch(url, {
        signal: ctx.signal,
        headers: { "User-Agent": "ilms-redective/0.1 (by /u/ilms)" },
      });
    } catch (error) {
      yield {
        kind: "error",
        message: `Reddit fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      yield { kind: "done", exitCode: 1 };
      return;
    }

    if (!response.ok) {
      yield {
        kind: "error",
        message: `Reddit returned ${response.status}. ${response.status === 404 ? "User not found." : "Try again later."}`,
      };
      yield { kind: "done", exitCode: 1 };
      return;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      yield {
        kind: "error",
        message: `Could not parse Reddit response: ${error instanceof Error ? error.message : String(error)}`,
      };
      yield { kind: "done", exitCode: 1 };
      return;
    }

    if (mode === "about") {
      const about = payload as AboutPayload;
      const profileUrl = `https://www.reddit.com/user/${username}`;
      yield {
        kind: "artifact",
        artifact: { kind: "profile", site: "Reddit", url: profileUrl, username },
      };
      yield {
        kind: "log",
        level: "info",
        message: `created_utc=${about.data?.created_utc ?? "?"} link_karma=${about.data?.link_karma ?? "?"} comment_karma=${about.data?.comment_karma ?? "?"}`,
      };
      yield { kind: "done", exitCode: 0 };
      return;
    }

    const listing = payload as ListingPayload;
    const children = listing.data?.children ?? [];
    for (const c of children) {
      const permalink = c.data?.permalink;
      if (!permalink) continue;
      const fullUrl = `https://www.reddit.com${permalink}`;
      const label = c.data?.title ?? c.data?.link_title ?? (c.data?.body ?? "").slice(0, 80);
      yield {
        kind: "artifact",
        artifact: { kind: "link", url: fullUrl, label: label || "reddit" },
      };
    }
    yield {
      kind: "log",
      level: "info",
      message: `Fetched ${children.length} item${children.length === 1 ? "" : "s"}.`,
    };
    yield { kind: "done", exitCode: 0 };
  },
};
