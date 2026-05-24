import { z } from "zod";

export const RunStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const ProfileArtifactSchema = z.object({
  kind: z.literal("profile"),
  site: z.string(),
  url: z.string(),
  username: z.string().optional(),
});
export const LinkArtifactSchema = z.object({
  kind: z.literal("link"),
  url: z.string(),
  label: z.string().optional(),
});
export const EmailArtifactSchema = z.object({
  kind: z.literal("email"),
  email: z.string(),
  source: z.string().optional(),
});
export const ArtifactSchema = z.discriminatedUnion("kind", [
  ProfileArtifactSchema,
  LinkArtifactSchema,
  EmailArtifactSchema,
]);
export type Artifact = z.infer<typeof ArtifactSchema>;

export const ArtifactEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("progress"), message: z.string() }),
  z.object({
    kind: z.literal("log"),
    level: z.enum(["debug", "info", "warn", "error"]),
    message: z.string(),
  }),
  z.object({ kind: z.literal("artifact"), artifact: ArtifactSchema }),
  z.object({ kind: z.literal("done"), exitCode: z.number().nullable() }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type ArtifactEvent = z.infer<typeof ArtifactEventSchema>;

export const RunSchema = z.object({
  id: z.string(),
  caseId: z.string().nullable(),
  toolId: z.string(),
  status: RunStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  input: z.record(z.string(), z.unknown()),
});
export type Run = z.infer<typeof RunSchema>;

export const PersistedArtifactSchema = z.object({
  id: z.string(),
  caseId: z.string().nullable(),
  runId: z.string(),
  artifact: ArtifactSchema,
  createdAt: z.string(),
});
export type PersistedArtifact = z.infer<typeof PersistedArtifactSchema>;
