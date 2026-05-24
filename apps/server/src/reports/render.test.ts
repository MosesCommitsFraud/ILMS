import { describe, expect, test } from "bun:test";

import { renderMarkdown, type ReportBundle } from "./render";

const baseCase = {
  id: "c1",
  slug: "test-case",
  name: "Test Case",
  notes: "",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-02T00:00:00Z",
};

function bundle(overrides: Partial<ReportBundle> = {}): ReportBundle {
  return {
    case: baseCase,
    targets: [],
    runs: [],
    artifacts: [],
    ...overrides,
  };
}

describe("renderMarkdown", () => {
  test("empty case has header + empty sections", () => {
    const md = renderMarkdown(bundle());
    expect(md).toContain("# Test Case");
    expect(md).toContain("`test-case`");
    expect(md).toContain("## Targets (0)");
    expect(md).toContain("## Runs (0)");
    expect(md).toContain("## Artifacts (0)");
    expect(md).toContain("_No targets._");
  });

  test("notes section appears only when non-empty", () => {
    expect(renderMarkdown(bundle())).not.toContain("## Notes");
    expect(
      renderMarkdown(bundle({ case: { ...baseCase, notes: "hello" } })),
    ).toContain("## Notes");
  });

  test("targets render with kind tag and label", () => {
    const md = renderMarkdown(
      bundle({
        targets: [
          { id: "t1", caseId: "c1", kind: "email", value: "a@b.com", label: null, createdAt: "x" },
          { id: "t2", caseId: "c1", kind: "handle", value: "alice", label: "Alice Smith", createdAt: "x" },
        ],
      }),
    );
    expect(md).toContain("## Targets (2)");
    expect(md).toContain("- **email**: `a@b.com`");
    expect(md).toContain("- **handle**: `alice` — Alice Smith");
  });

  test("artifacts group by kind and show counts", () => {
    const md = renderMarkdown(
      bundle({
        artifacts: [
          {
            id: "a1",
            caseId: "c1",
            runId: "r1",
            createdAt: "x",
            artifact: { kind: "profile", site: "Twitter", url: "https://t.co/foo", username: "foo" },
          },
          {
            id: "a2",
            caseId: "c1",
            runId: "r1",
            createdAt: "x",
            artifact: { kind: "email", email: "x@y.com", source: "crosslinked" },
          },
          {
            id: "a3",
            caseId: "c1",
            runId: "r1",
            createdAt: "x",
            artifact: { kind: "email", email: "z@y.com" },
          },
        ],
      }),
    );
    expect(md).toContain("## Artifacts (3)");
    expect(md).toContain("### profile (1)");
    expect(md).toContain("### email (2)");
    expect(md).toContain("**Twitter** — [https://t.co/foo](https://t.co/foo) (`foo`)");
    expect(md).toContain("`x@y.com` _(crosslinked)_");
    expect(md).toContain("`z@y.com`");
  });

  test("runs list shows tool, status, and per-run artifact count", () => {
    const md = renderMarkdown(
      bundle({
        runs: [
          {
            id: "r1",
            caseId: "c1",
            toolId: "sherlock",
            status: "completed",
            startedAt: "2025-01-01T00:00:00Z",
            endedAt: "2025-01-01T00:00:05Z",
            input: { username: "octocat" },
          },
        ],
        artifacts: [
          {
            id: "a1",
            caseId: "c1",
            runId: "r1",
            createdAt: "x",
            artifact: { kind: "profile", site: "Twitter", url: "https://t.co/o" },
          },
          {
            id: "a2",
            caseId: "c1",
            runId: "r1",
            createdAt: "x",
            artifact: { kind: "profile", site: "GitHub", url: "https://gh.co/o" },
          },
        ],
      }),
    );
    expect(md).toContain("### sherlock — completed");
    expect(md).toContain('- **input**: `{"username":"octocat"}`');
    expect(md).toContain("- **artifacts**: 2");
  });
});
