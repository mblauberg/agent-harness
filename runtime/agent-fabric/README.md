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
- `src/core/read-policy.ts`: chair/owner/participant scoped projections
- `src/daemon/`: single-instance process, trusted composition and socket transport
- `src/mcp/`: one input/output schema surface for both primary clients
- `src/adapters/providers/`: isolated, pinned provider adapters
- `src/exports/`: receipt projection, schema enforcement and link verification
- `migrations/0001-core.sql`: unreleased canonical baseline; freeze at the first release

## Development

```sh
npm install
npm run check
npm run test:evaluation
npm run test:load
```

All normal tests use temporary databases and fake provider boundaries. They do not log into providers or register MCP servers.

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
Seat rotation stages a complete immutable generation and atomically switches a
single private `current.json` pointer. Existing flat seat files remain a
read-only compatibility fallback until a successful rotation.

The current daemon is a foreground process in Herdr's infrastructure tab, not
an installed login service. A separate least-privilege `fabric-events` pane
renders bounded human-readable event summaries. A newly started client session
loads its MCP registry entry; a session that predates registration may need to
reconnect or restart.

See [the operations runbook](../../docs/runbooks/agent-fabric-operations.md) before any live start or registration.
