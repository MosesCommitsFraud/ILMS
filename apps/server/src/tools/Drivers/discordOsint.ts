import { z } from "zod";

import type { ArtifactEvent } from "@ilms/contracts/run";
import type { ToolDescriptor } from "@ilms/contracts/tool";

import type { RunContext, ToolDriver } from "../ToolDriver";

const InputSchema = z.object({
  query: z.string().trim().min(1),
  category: z.enum(["invites", "users", "messages", "all"]).default("all"),
});

const descriptor: ToolDescriptor = {
  id: "discord-osint",
  label: "Discord OSINT",
  description:
    "Build Google search queries from the DiscordOSINT cheatsheet — invites, user profiles, leaked messages. No automated scraping inside Discord.",
  risk: "safe-public",
  inputFields: [
    {
      name: "query",
      label: "Search term",
      kind: "text",
      required: true,
      placeholder: "username, server name, or keyword",
    },
    {
      name: "category",
      label: "Category",
      kind: "select",
      required: true,
      defaultValue: "all",
      options: [
        { value: "all", label: "All" },
        { value: "invites", label: "Public invites" },
        { value: "users", label: "User profiles" },
        { value: "messages", label: "Leaked messages" },
      ],
    },
  ],
  requiredSecrets: [],
};

interface QueryTemplate {
  category: "invites" | "users" | "messages";
  label: string;
  build: (q: string) => string;
}

const TEMPLATES: QueryTemplate[] = [
  {
    category: "invites",
    label: "Google: discord.gg invites",
    build: (q) => `https://www.google.com/search?q=${encodeURIComponent(`site:discord.gg ${q}`)}`,
  },
  {
    category: "invites",
    label: "Google: top.gg listings",
    build: (q) => `https://www.google.com/search?q=${encodeURIComponent(`site:top.gg ${q}`)}`,
  },
  {
    category: "invites",
    label: "Disboard search",
    build: (q) => `https://disboard.org/search?keyword=${encodeURIComponent(q)}`,
  },
  {
    category: "users",
    label: "Google: discord usernames",
    build: (q) =>
      `https://www.google.com/search?q=${encodeURIComponent(`"discord" "${q}#" OR "${q}"`)}`,
  },
  {
    category: "messages",
    label: "Google: discord.com/channels leaks",
    build: (q) =>
      `https://www.google.com/search?q=${encodeURIComponent(`site:discord.com/channels ${q}`)}`,
  },
  {
    category: "messages",
    label: "Discord Search Suggestion (in-app)",
    build: (q) => `https://discord.com/search?q=${encodeURIComponent(q)}`,
  },
];

export const discordOsintDriver: ToolDriver = {
  describe(): ToolDescriptor {
    return descriptor;
  },
  async *run(input: Record<string, unknown>, _ctx: RunContext): AsyncIterable<ArtifactEvent> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) {
      yield {
        kind: "error",
        message: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      };
      return;
    }
    const { query, category } = parsed.data;
    yield { kind: "progress", message: `Building Discord OSINT queries for "${query}"…` };

    const filtered = category === "all" ? TEMPLATES : TEMPLATES.filter((t) => t.category === category);
    for (const t of filtered) {
      yield {
        kind: "artifact",
        artifact: { kind: "link", url: t.build(query), label: t.label },
      };
    }

    yield {
      kind: "log",
      level: "info",
      message:
        "These are search-engine queries, not automated scrapes. Open each link manually to honor each platform's terms of service.",
    };
    yield { kind: "done", exitCode: 0 };
  },
};
