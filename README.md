# ILMS

Desktop OSINT workbench. Wraps a curated set of open-source intel tools behind one UI, persists investigations as **Cases**, and is built to host an agent that proposes runs and waits for the user to approve them.

Architecture: see [PLAN.md](./PLAN.md). The short version is Tauri shell + Bun WS/HTTP server + Vite SPA + a single `ToolDriver` interface that every tool (python sidecar, Node child process, headless Playwright, HTTP fetch) implements identically.

## Tools

| Tool | Mechanism | Notes |
|---|---|---|
| Sherlock | `uv tool run sherlock-project` | Username → site enumeration. |
| SoIG | `uv tool run` git | Public Instagram profile metadata. |
| toutatis | `uv tool run toutatis` | Instagram OSINT from a session cookie. |
| CrossLinked | `uv tool run crosslinked` | LinkedIn name enumeration → emails. |
| informer | `uv tool run` git | Telegram channel scanning. Needs api_id + api_hash. |
| Facebook Recover Lookup | Playwright (persistent profile) | Sign-in once; parses obfuscated email/phone/name hints. |
| Facebook Directory | Playwright (persistent profile) | Paginates `/directory/people/<letter>/`. |
| Redective | HTTP — Reddit JSON API | About / submissions / comments for a username. |
| Snapchat Map | HTTP — `ms.sc-jpl.com` | Snap stories within a radius. |
| Discord OSINT | URL builder, no network | Google + disboard + discord.com search templates. |

## Repo layout

```
apps/
  web/        Vite + React SPA
  server/     Bun + Elysia WS/HTTP, all tool drivers
  desktop/    Tauri shell that boots the server as a sidecar
packages/
  contracts/  zod schemas — Case, Target, Run, Artifact, RPC registry
  shared/     pure cross-app utils
  client-runtime/ WS transport + typed RPC client + desktop bridge helpers
```

One-way layering: `contracts ← shared ← client-runtime ← apps/web` and `contracts ← shared ← apps/server`. Apps never imported by packages.

## Develop

Requires:
- [Bun](https://bun.sh) 1.3+
- [uv](https://github.com/astral-sh/uv) on PATH (for python tools)
- Tauri prerequisites if you want the desktop shell — see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

```bash
bun install

# Optional: pre-install python tools so the first sherlock/toutatis/crosslinked
# run doesn't wait on uv installing the package.
bun run --filter @ilms/server prepare:tools

# Optional: install chromium for the Facebook drivers + server-side PDF export.
bun run --filter @ilms/server prepare:playwright

# Run the server (Bun + Elysia)
bun run dev:server

# Run the web app (Vite)
bun run dev:web

# Run the Tauri shell (boots the server itself)
bun run dev:desktop
```

The server listens on `http://127.0.0.1:4242`. The web app on `http://localhost:5733`. In the Tauri shell those two are bridged via `window.desktopBridge.advertisedEndpoint`.

## Tests + typecheck

```bash
bun run typecheck
bun run test
```

Tests are colocated `*.test.ts` next to the code they cover.

## Data

All state is local:
- SQLite at `apps/server/data/ilms.db` (cases, targets, runs, artifacts)
- Secrets at `apps/server/data/secrets.json` (gitignored; planned migration to the OS keychain via Tauri)
- Playwright profiles at `apps/server/data/playwright/<profile>/`

Set `ILMS_DATA_DIR` to relocate the lot.

## Known issues

- **PDF export hangs on Bun + Windows + headless chromium.** Reproduces in a standalone playwright-core script, so it's a runtime-compat issue, not in our code. Use the `Print` button instead — it opens `/reports/:id/html` in a new tab and you can save as PDF from the browser. The `/reports/:id/pdf` route still works on Linux / macOS and on Node-runtime deployments.

## Agent

Each case has an embedded agent that can drive any of the 10 tools on your behalf. Implementation:

- `@anthropic-ai/sdk` with a custom tool-use loop. We own the loop, intercept every `tool_use` block, and route it through a permission gate before the tool actually runs.
- Each ToolDescriptor is converted to an Anthropic tool spec (JSON Schema from `inputFields`). The agent's tool calls go through the existing `runs/manager`, so artifacts persist to the case just like manual runs.
- Approve / deny each proposed tool call from the chat UI. `runs/manager` then executes the driver, the agent gets a summary back, and the loop continues until the model says `end_turn`.

Configure `agent.anthropic.api_key` (and optionally `agent.anthropic.model`, default `claude-sonnet-4-5`) under Settings.

## Status

All ten branches of the [PLAN](./PLAN.md) roadmap have shipped.
