# ILMS — Architecture Plan

ILMS is a desktop OSINT workbench. It wraps a curated set of open-source intel tools behind one UI, persists investigations as **Cases**, and exposes the same tool surface to an **opencode-driven agent** that proposes runs and waits for the user to approve them.

Reference: `/DEV/MIDA` is the working example of the same product shape (Tauri shell + Bun server + Vite SPA + opencode driver). ILMS mirrors MIDA's **boundaries**, not its **runtime**. Where MIDA orchestrates AI providers, ILMS orchestrates OSINT tools.

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Shell | **Tauri** | Match MIDA. Heavy artifacts (chromium, python) live inside the Bun sidecar, not the shell — Electron's Node-in-main advantage doesn't apply. OS keychain access is needed regardless. |
| Python tool isolation | **Bundled `uv` + per-tool venv**, PyInstaller-frozen fallback for nasty deps | Docker can't realistically be bundled (hypervisor on Win/macOS). `uv` is a single static binary; per-tool venv gives Docker-like isolation with no daemon. |
| Browser tools | **Bundled Playwright (chromium)**, user signs in once, cookies in OS keychain | Smoothest UX; the only path that survives Facebook's login walls. |
| Agent autonomy | **Plan + propose, every run requires approval** | MIDA-style permission gate. Auto-running OSINT tools is how you get accounts/IPs banned. |
| Agent driver | **Forked from MIDA's `opencode.ts`** with OSINT system prompt and ToolDriver-as-tool schemas | Clean long-term separation; small upfront cost. |
| Storage | **SQLite + files in app-data** (local-only) | Private by default, no infra, cases exportable as zip. |
| v1 scope | **All listed tools** | Sherlock first (smoke test), then python set, then Playwright set, then Discord knowledge-base UI. |
| Name | ILMS — opaque acronym, defined later | Doesn't block anything. |

## Guiding principles (from MIDA)

1. **Apps are thin shells.** Wire transports, mount UI, supervise processes. Domain logic doesn't live in `apps/*` if it could be reused.
2. **One-way package layering.** Lower never imports higher.
3. **Single ownership per concern.** Each tool has exactly one driver. The Bun server owns tool orchestration; Tauri owns the native shell. No tool logic in Rust.
4. **Validated boundaries.** Every WS/HTTP/IPC payload parsed by an `@ilms/contracts` schema at the edge. Inside the runtime, types are trusted.
5. **Typed RPC over hand-written HTTP clients.** One transport, one schema, no per-tool client files in the web app.

## Target package graph

```
apps/
  web/                            Vite SPA. Routes, components, hooks, colocated logic + tests.
    src/rpc/                      Thin typed WS-RPC client built from @ilms/contracts.
    src/routes/
      cases/                      Cases list, case detail (targets, runs, artifacts, notes).
      tools/                      Per-tool view: form generated from ToolDescriptor schema.
      agent/                      Chat-style panel; tool calls require approval.
      reports/                    Markdown/PDF export.
      settings/                   Secrets (keychain), tool install state, opencode config.
    src/components/
      RunStream.tsx               Streams ArtifactEvents from a Run over WS.
      ArtifactCard.tsx, TargetChip.tsx, PermissionPrompt.tsx, ...
  server/                         Bun WS/HTTP. Folder-per-domain.
    src/tools/
      ToolDriver.ts               Interface: describe(), run(input, ctx) -> AsyncIterable<ArtifactEvent>, cancel().
      Drivers/
        sherlock.ts               uv + sherlock-project (python sidecar)
        soig.ts                   uv + SoIG
        toutatis.ts               uv + toutatis (pip)
        crosslinked.ts            uv + CrossLinked
        informer.ts               uv + informer (needs Telegram api id/hash from keychain)
        snapchatMap.ts            node child process: snapchat-map-scraper
        redective.ts              HTTP scrape (no sidecar)
        facebookRecover.ts        Playwright: drives facebook.com/login/identify, parses recovery hints
        facebookDirectory.ts      Playwright: paginates facebook.com/directory/people/
        discordOsint.ts           Curated query builder + link-out (the upstream repo is a knowledge collection,
                                   not a CLI — we render it as UI helpers, not an automated tool).
      registry.ts                 id -> driver lookup.
      runtime/
        uvRunner.ts               Spawn uv-managed venv tool, stream stdout, parse JSON-lines or text.
        playwrightRunner.ts       Shared browser context per case; cookie persistence to keychain.
        nodeRunner.ts             Spawn node tools.
        httpRunner.ts             Fetch helpers with per-domain rate limits.
    src/agent/
      opencodeDriver.ts           Forked from MIDA. Exposes ToolDriver registry as agent tools.
      systemPrompt.ts             OSINT-tuned prompt: case context, ethics rails, tool catalog.
      permissionGate.ts           Every tool call yields a PendingPermissionRequest; user approves in UI.
    src/cases/                    Case/target persistence (SQLite, better-sqlite3 via bun:sqlite).
    src/runs/                     Run lifecycle: create, stream events, cancel, persist artifacts.
    src/artifacts/                Dedup, normalize, link artifacts back to targets.
    src/secrets/                  Read/write secrets via Tauri IPC (OS keychain). Server never touches disk for secrets.
    src/export/                   Markdown / JSON / PDF report builders.
    src/rpc/                      RPC server: parse contracts -> call domain services.

  desktop/                        Tauri shell.
    src-tauri/src/
      main.rs                     Window chrome, sidecar boot, deep links.
      sidecar.rs                  Supervises Bun server + uv binary; readiness checks.
      keychain.rs                 OS keychain bridge (keyring crate).
      dialogs.rs                  Native file pickers for case export/import.
    src/
      bridge.ts                   Backend port/readiness, env sync, update state (same shape as MIDA).

packages/
  contracts/                      zod schemas + types. Zero runtime deps beyond zod.
    case.ts                       Case, Target (email | handle | phone | url | name | ...).
    run.ts                        Run, RunStatus, ArtifactEvent (streamed).
    artifact.ts                   Artifact union: Profile | Post | Image | Link | Hint | Note.
    tool.ts                       ToolDescriptor (id, label, input schema, risk tag, auth requirements).
    agent.ts                      AgentSession, AgentMessage, PendingPermissionRequest, PendingQuestion.
    desktop.ts                    window.__ILMS__ bridge contract.
    rpc.ts                        RPC method registry: name -> input/output/error schemas.
    index.ts                      Re-exports.

  shared/                         Pure cross-app utils. No DOM, no Node-only APIs.
    entity.ts                     Normalize email/handle/phone/url. Detect entity kind from a string.
    rateLimit.ts                  Token bucket used by httpRunner + per-tool throttles.
    logging.ts, string.ts, path.ts

  client-runtime/                 Browser-side runtime adapters.
    environment.ts                web vs desktop, base URL resolution.
    advertisedEndpoint.ts         desktop-advertised backend endpoint resolution.
    wsTransport.ts                Reconnecting WS.
    rpcClient.ts                  Typed RPC over wsTransport, driven by @ilms/contracts/rpc.
```

Allowed import direction:

```
contracts  <-  shared  <-  client-runtime  <-  apps/web
                       <-  (server-runtime services in apps/server)  <-  apps/server
apps/* never imported by packages/*.
```

We are **not** creating `packages/server-runtime` or per-tool packages. Tool drivers live in `apps/server/src/tools/Drivers/` and only get promoted to a package if a second app (CLI, headless runner) needs them.

## Core abstractions

### `ToolDriver` (the one interface that matters)

```ts
interface ToolDriver<I = unknown> {
  describe(): ToolDescriptor;                 // id, label, input zod schema, risk tag, auth needs
  run(input: I, ctx: RunContext): AsyncIterable<ArtifactEvent>;
  cancel(runId: string): Promise<void>;
}
```

Every tool — python, node, HTTP, Playwright — implements this. The UI form is generated from `describe().input`. The agent sees `describe()` as a tool schema. The RPC layer doesn't know about tool types.

### `ArtifactEvent` (the streaming wire format)

A union: `progress | log | artifact | done | error`. Drivers yield these as they discover findings. The server persists artifacts into the case and forwards events to subscribed WS clients (UI + agent).

### Case → Target → Run → Artifact

- **Case** owns everything else. Identified by a slug.
- **Target** is an entity inside a case (email, handle, phone, url, name + free metadata).
- **Run** is one tool execution scoped to a case, optionally bound to one or more targets.
- **Artifact** is a finding. Deduped per case by `(kind, canonicalUrl | externalId)`. Always traces back to the Run that produced it.

### Agent permission contract

Forked from MIDA. Agent yields a `PendingPermissionRequest` for each proposed tool call; UI surfaces it as a card with "Approve / Approve always for this tool / Deny". Approved calls become normal Runs in the case timeline — the human sees the same UI whether they triggered it or the agent did.

## How each tool is wired

| Tool | Mechanism | Auth / secrets | Notes |
|---|---|---|---|
| Sherlock | `uv run sherlock --json` | none | Smoke test for the whole pipeline. |
| SoIG | uv sidecar | none | Instagram OSINT from a username. |
| toutatis | uv sidecar | Instagram session cookie (keychain) | Email -> linked Instagram profile. |
| CrossLinked | uv sidecar | none | LinkedIn name enumeration via search engines. |
| informer | uv sidecar | Telegram `api_id` + `api_hash` (keychain) | Heaviest python dep. |
| snapchat-map-scraper | node child process | none | Inputs lat/lng/radius. |
| Redective | HTTP fetch | none | Reddit search wrapper, no sidecar. |
| Facebook recover lookup | Playwright | user signs in once | Drives `/login/identify`, parses the partial-email/phone hints page returns. |
| Facebook directory | Playwright | user signs in once | Paginates `/directory/people/`. |
| DiscordOSINT | UI helpers + link-out | none | Upstream is a knowledge collection, not a CLI. Render the search syntax as a builder; open the user's Discord in browser. No scraping inside Discord — ToS landmine. |

All python tools share the **bundled `uv` binary** (Tauri sidecar). Venvs live under `app-data/venvs/<tool>/`. Lockfiles pinned per tool in `apps/server/src/tools/Drivers/<tool>/requirements.lock`.

## Ethics + legal rails (built into the product, not hand-waved)

- **Risk tags on every tool.** `safe-public | rate-limited | tos-grey | login-required`. Surfaced in the UI; agent is told about them in the system prompt and must justify `tos-grey` calls.
- **No automated mass-scraping.** Per-tool rate limits in `httpRunner` and `playwrightRunner`. Caps are not user-configurable.
- **Agent never bypasses approval.** The permission gate is at the driver layer, not the UI layer — there is no path to a Run without an approved permission record.
- **Cases are local-only** by default; export is an explicit user action.
- **No credential storage outside the OS keychain.** Server reads secrets through Tauri IPC; secrets never touch the SQLite DB or disk.

## Roadmap

```
1. feat/skeleton              contracts + shared + client-runtime + apps/{web,server,desktop} bootstrapped from MIDA
2. feat/tool-driver           ToolDriver interface, uvRunner, Sherlock driver, end-to-end Run streaming
3. feat/cases                 SQLite schema, Case/Target/Run/Artifact CRUD, case detail UI
4. feat/python-tools          SoIG, toutatis, CrossLinked, informer drivers (informer behind a secrets-setup flow)
5. feat/playwright            playwrightRunner with persistent browser context + keychain cookies;
                              Facebook recover + Facebook directory drivers
6. feat/light-tools           Redective HTTP driver, snapchat-map node driver, DiscordOSINT UI helpers
7. feat/agent                 Fork MIDA opencode driver; permission gate; OSINT system prompt; agent UI
8. feat/reports               Markdown + PDF case export
9. chore/hygiene              Test coverage on drivers, error UX, install/upgrade flows for uv venvs
```

Sequencing rationale: the skeleton (#1) and ToolDriver (#2) prove the architecture with the cheapest tool. Cases (#3) gives the surface that everything else attaches to. Python (#4), Playwright (#5), and light tools (#6) are independent and can be parallelized after #3. Agent (#7) is deliberately late — it consumes the ToolDriver registry, so it benefits from a stable surface. Reports and hygiene close it out.

---

### Branch 1 — `feat/skeleton`

Goal: ILMS has the same bones as MIDA, no domain logic yet.

Steps:

1. Copy MIDA's `package.json`, `turbo.json`, `tsconfig.base.json`, and the empty shells of `packages/{contracts,shared,client-runtime}` and `apps/{web,server,desktop}`.
2. Rename `@mida/*` -> `@ilms/*` throughout.
3. Strip MIDA-specific contracts (provider/chat/runtime). Keep desktop bridge, RPC registry shape, ws transport.
4. Stand up an empty Bun server with `/healthz` and a single RPC method `case.list` returning `[]`.
5. Stand up a Vite SPA with the case list route reading from the RPC client.
6. Stand up Tauri shell that boots the Bun server as a sidecar (port the supervisor from `apps/desktop/src-tauri/src/sidecar.rs` and `apps/desktop/src/bridge.ts`).

Exit criteria: `bun run dev` brings up the desktop app and the case list (empty) renders against the live server.

### Branch 2 — `feat/tool-driver`

Goal: end-to-end streaming Run, proven with Sherlock.

Steps:

1. Define `ToolDriver`, `ToolDescriptor`, `ArtifactEvent`, `Run`, `RunStatus` schemas in `@ilms/contracts`.
2. Implement `apps/server/src/tools/runtime/uvRunner.ts`: spawn `uv run <cmd>`, capture stdout/stderr, emit `ArtifactEvent`s.
3. Implement `apps/server/src/tools/Drivers/sherlock.ts` using `uvRunner`.
4. Add RPC methods: `tool.list`, `tool.run` (returns runId), and a WS subscription `run.events` (yields `ArtifactEvent`s).
5. Build the Tools route in `apps/web`: a form generated from Sherlock's input schema, a "Run" button, a streaming results view.

Exit criteria: from the UI, type a username, click Run, watch site checks stream in, see artifacts persisted into the (still-empty) case shell.

### Branches 3-9

Detailed steps deferred until the prior branch lands. The shape is implied by the package graph above.

## Open questions to revisit before branch 7

- Does the opencode agent need its own scratch state separate from the case (intermediate plans, abandoned hypotheses)? Likely yes — add `AgentTrace` later, don't pre-design it.
- DiscordOSINT: is "knowledge-base UI" enough, or do we want to integrate any of the discord.id-style endpoint helpers? Defer until #7.
- Export: PDF or Markdown-only for v1? Markdown is cheap, PDF needs a renderer choice. Defer.
