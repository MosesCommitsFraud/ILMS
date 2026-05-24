import type { Artifact } from "@ilms/contracts/run";

/**
 * Per-case deduplication key for an artifact. Returns null when an artifact
 * kind doesn't have a stable dedup key (e.g. future kinds, or kinds whose
 * payload is inherently unique per occurrence).
 */
export function dedupKey(artifact: Artifact): string | null {
  switch (artifact.kind) {
    case "profile":
      return `profile:${artifact.url}`;
    case "link":
      return `link:${artifact.url}`;
    case "email":
      return `email:${artifact.email.toLowerCase()}`;
    case "hint":
      return `hint:${artifact.source}:${artifact.field}:${artifact.value}`;
  }
}
