# Agent fabric runtime

Local coordination runtime shared by Claude Code, Codex and optional provider adapters. It keeps authority, tasks, leases, mailboxes, provider-action reconciliation, teams, receipts and lifecycle checkpoints in one SQLite/WAL store behind a private Unix socket.

Status: Stages 1–5 and the activation extension are implemented. The daemon is
active for this checkout and the MCP proxy is registered globally for Agy,
Claude Code, Codex, Cursor and Kiro. Their provider adapters are enabled behind
pinned compatibility and runtime activation gates. Pi remains disabled until a
trusted open-weight provider/model is available.

## Architecture

```text
Claude MCP proxy ─┐
                  ├─ private Unix socket ─ daemon ─ SQLite/WAL
Codex MCP proxy  ─┘                         │
                                            ├─ provider adapter processes
Herdr visibility/inbox integration ─────────┘
```

The daemon is authoritative. Herdr provides visible panes and wake-ups, not coordination state. Pi is an optional worker adapter, not the harness or authority store.

Important boundaries:

- `src/core/fabric.ts`: compatibility façade and aggregate coordination
- `src/core/client.ts`: capability-bound client façade
- `src/application/command-journal.ts`: command dedupe and transaction owner
- `src/persistence/sqlite.ts`: hardened connection and canonical migration startup
- `src/transport/bounded-ndjson.ts`: shared byte-bounded framing
- `src/cli/workspace-trust.ts`: exact machine-local workspace admission
- `src/cli/retention.ts`: report-only retention and non-destructive archive
- `src/core/read-policy.ts`: chair/owner/participant scoped projections
- `src/daemon/`: single-instance process, trusted composition and socket transport
- `src/mcp/`: one input/output schema surface for both primary clients
- `src/adapters/providers/`: isolated, pinned provider adapters
- `src/exports/`: receipt projection, schema enforcement and link verification
- `migrations/0001-core.sql`: canonical baseline
- `migrations/0002-observer-event-sequence.sql`: durable observer cursor
- `migrations/0003-integrity-and-query-plans.sql`: additive invariants and hot-path indexes

## Development

```sh
npm install
npm run check
npm run test:evaluation
npm run test:load
```

All normal tests use temporary databases and fake provider boundaries. They do not log into providers or register MCP servers.

### Optional GitHub hosted checks

Local typed Git reads are independent of GitHub. `GitRepositoryReadService`
accepts an optional `GitHostedChecksPort`; omitting it is the default and
projects `unavailable` hosted facts while keeping local Git `live`.

Trusted daemon composition can call
`createOptionalGitHubHostedChecksAdapter({ enabled: true, ... })` with one
canonical repository root, exact `owner/repository`, `github.com`, and a
canonical SHA-256-pinned `gh` executable. The adapter issues only the fixed
bounded check-runs request for the observed native HEAD. It accepts no URL,
ref, arbitrary GitHub endpoint, argument vector, shell or caller environment.
An outage, authentication failure, malformed response, more than 100 checks or
oversized output becomes exact-HEAD `stale` (when a same-binding cache exists)
or `unavailable`; it never fails or rewrites the local Git projection.
Credentials may be inherited ephemerally by `gh`, but are never accepted in
configuration, persisted, logged or projected. Retargeting the canonical root,
repository or HEAD fails before process I/O.

Inspect the live machine without printing capabilities:

```sh
scripts/agent-fabric status --json --project "$PWD"
scripts/agent-fabric doctor --json
scripts/agent-fabric retention preview
```

## Runtime locations

Resolved by `src/cli/paths.ts` under the user data/runtime directories:

- durable database and capability key: state directory
- Unix socket and socket-identity owner lock: runtime directory
- database-identity owner lock: beside the durable database
- per-project evidence: `.agent-run/<run-id>/`

All five registered clients launch `scripts/agent-fabric-mcp` with the same
socket and a seat label. The proxy canonicalises its working directory, walks
ancestor projects for the nearest matching provisioned seat and fails closed
when none exists. Client labels never change the MCP schema or authority. The
raw capability is stored only in its private `0600` `.cap` file; registry
configuration contains neither the credential nor a fixed project seat path.
Seat rotation binds one content-addressed generation in the daemon database,
atomically revokes the prior roster, stages the complete immutable filesystem
generation and compare-and-swaps a private `current.json` pointer. There is no
flat-seat fallback or second accepted generation.

The current daemon is a foreground process in Herdr's infrastructure tab, not
an installed login service. A separate least-privilege `fabric-events` pane
renders bounded human-readable event summaries. A newly started client session
loads its MCP registry entry; a session that predates registration may need to
reconnect or restart.

See [the operations runbook](../../docs/runbooks/agent-fabric-operations.md) before any live start or registration.
