# Agent fabric operations

Status: current pre-release operations; query live machine state before action
Applies to: `runtime/agent-fabric` and `scripts/agent-fabric*`

## User gates

The following remain separate approvals. One does not imply another:

1. build or install the local runtime outside an active implementation envelope;
2. trust a project root or provision/rotate its operator and agent seats;
3. enable a provider adapter after compatibility verification;
4. install an auto-start/login service for the daemon;
5. log into or consume quota from a provider;
6. change or remove a client registry entry;
7. run a smoke that invokes a real provider adapter;
8. accept the implementation, release it or publish Git state.

Read the active authority before acting. Prior activation evidence does not
authorise a new root, login, registry mutation, provider call, acceptance,
release or publication.

## Preflight

```sh
npm ci --no-audit --no-fund
npm run build
npm run check
npm run test:evaluation
npm run test:load
npm audit --omit=dev --audit-level=high
scripts/check-harness
git diff --check
python3 skills/deliver/scripts/validate_delivery.py \
  '<canonical-run>/RUN.json' --workspace-root "$PWD" --verify-hashes
```

Then verify the selected compatibility entries. External executable, package
and schema artifacts are checked against their pinned hashes.
Repository-owned wrapper code carries Git provenance instead of a hash pin
(`runtime/agent-fabric/src/adapters/compatibility.ts`): the wrapper
entrypoint must resolve inside a Git repository, be tracked at HEAD and
byte-identical to its committed content, and its first-party source spans
(the owning workspace package's src tree, local workspace dependency src
trees and every consulted package manifest) must be diff-clean against HEAD.
An empty or truncated span discovery is a hard verification failure, never a
skip. Provenance is re-derived immediately before every adapter process
spawn and must match the provenance verified at composition. Unresolved
pins, missing artifacts, disabled entries or any provenance mismatch fail
closed.

## Keep the CLI dist warm

`scripts/agent-fabric` and `scripts/agent-fabric-mcp` execute the compiled
dist and fall back to the tsx loader only when the dist is absent or older
than the TypeScript sources; the fallback adds noticeable per-invocation
latency. After integrating runtime changes into the main checkout (the
post-merge sync in [the GitHub workflow
runbook](github-workflow.md#after-merge)), run:

```sh
scripts/agent-fabric-warm
```

It is a no-op when the dist is fresh and runs the workspace build only when
stale, so normal operation never hits the fallback path.

## Live discovery and registrations

Read workstation-specific run, roster, expiry, adapter and socket state from
the machine interface. Do not copy it into this runbook:

```sh
scripts/agent-fabric status --json --project "$PWD"
scripts/agent-fabric doctor --json
```

Each client registry contains only the proxy command, fabric state directory,
seat and client label:

| Client | Global registry |
| --- | --- |
| Agy | `~/.gemini/config/mcp_config.json` |
| Claude Code | `~/.claude.json` |
| Codex | `~/.codex/config.toml` |
| Cursor | `~/.cursor/mcp.json` |
| Kiro | `~/.kiro/settings/mcp.json` |

At proxy start, the client working directory is canonicalised and ancestors are
searched for the nearest project-keyed seat. An unprovisioned project fails
closed instead of authenticating into another project's run. Clients that do
not preserve the workspace working directory need project-scoped registration.
Subdirectories intentionally inherit the nearest ancestor project's seat.

The harness installer configures the project-dynamic global entry for its
selected primary client. Configure or verify both Claude Code and Codex from
the harness checkout with:

```sh
scripts/configure-agent-fabric-mcp.py --platform all
scripts/configure-agent-fabric-mcp.py --platform all --check
```

The command atomically replaces only the `agent-fabric` entry in each client
configuration and reports only that entry's status. It never prints
capabilities or unrelated configuration. Its global entries omit
`AGENT_FABRIC_PROJECT_PATH`; Claude Code and Codex preserve cwd and must use
nearest-ancestor discovery. A fixed `AGENT_FABRIC_PROJECT_PATH` remains a
manual, project-scoped compatibility path only for a client that cannot preserve
its workspace cwd. Never add it to a global Claude Code or Codex entry.
If either configuration changes after it is read, the command exits with a
typed conflict without overwriting that file; rerun it against the new state.

The resolved `.cap` file must remain a private regular file with mode `0600`.
The adjacent `.json` file is secret-free metadata and is checked against the
canonical project, project key, seat and credential path before use. Never
paste capability values into a registry, log or document.

## Daemon supervision

Fabric is on-demand, not a login service. The first current client read or
command authenticates and attaches to a compatible incumbent before inspecting
the database. Only the elected no-incumbent path inspects current state,
rechecks it under the daemon-election lock and starts one owner. A compatible
busy WAL writer is therefore attachable; incompatible state remains untouched
and returns `SCHEMA_CUTOVER_REQUIRED`.

Use the following foreground command only for an authorised manual diagnostic
or supervised activation:

```sh
env AGENT_FABRIC_RUNTIME_DIRECTORY="$HOME/.local/state/agent-harness/fabric/runtime" \
  "$HOME/.agents/scripts/agent-fabric" daemon run \
  --trusted-config "$HOME/.agents/config/agent-fabric.yaml" \
  --compatibility "$HOME/.agents/config/adapter-compatibility.yaml" \
  --compatibility-schema "$HOME/.agents/runtime/agent-fabric/schemas/adapter-compatibility.schema.json" \
  --agents-home "$HOME/.agents"
```

Do not start this command merely because a pane or PID is absent. Re-run
`status` and `doctor`; on-demand bootstrap or the existing supervisor owns the
next step. A second daemon for the same socket or SQLite database fails closed.
The election, socket and database locks prevent two startup/recovery owners or
a shutdown/start race from serving one durable store.

## Shared-client model

Every client uses a separate stdio proxy process:

```text
AGENT_FABRIC_SOCKET_PATH=<same socket>
AGENT_FABRIC_STATE_DIRECTORY=<private fabric state directory>
AGENT_FABRIC_SEAT=<agy|claude|codex|cursor|kiro>
scripts/agent-fabric-mcp
```

Reviewed operator launch custody creates the project session, run and one
generation-fenced chair. Agents cannot create runs through MCP. Peers receive
narrowed authority and their own capability. Swapping Claude and Codex
leadership requires typed handoff/takeover custody; it does not change the
protocol or create a fallback chain.

In production Console, Launch is available only when the dedicated
`projectSessions.prepareLaunch` operation and explicit operator-action commit
surface are negotiated. The selected live Project row supplies the session
revision, generation and reviewed launch-packet reference; Launch accepts no
caller-authored CAS fields. Preview preparation uses a per-input-attempt command
so an expired, effect-free preview can be replaced. Console derives the commit
command ID from the operator, project, session, session generation and exact
launch packet path/digest; input events and Console client instances are
deliberately excluded. An exact reopen therefore polls the existing commit,
while a new generation or packet gets a new identity. Provider dispatch still requires a
separate explicit confirmation gesture. Sessions projected as `launching` or
`launch_ambiguous` rehydrate through status-only observation; Console never
redispatches or invokes generic action reconciliation for launch custody.

For visible pairing, Herdr attaches panes or observer renderers while messages still travel through the durable fabric mailbox. For headless orchestration, no pane is required. Both profiles can coexist in one run.

Herdr provides pane visibility and process supervision. Fabric events are
rendered by the explicit least-privilege `fabric-events` observer described
below; MCP tool responses and the SQLite-backed fabric remain authoritative.

## Provider controls and context

Set controls directly on each admitted provider spawn or turn:

| Control | Operator rule |
| --- | --- |
| `model` + `modelFamily` | Use exact provider values. A retained role/model change uses rotate and a fresh context. |
| `effort` | Use an explicit value supported by that provider/model. |
| `compact` | Checkpoint first, then continue the same retained task with bounded context. |
| `rotate` / clear | Checkpoint first, then start fresh for a new task, independent review, stale/confused/unreconciled context, or role/model change. Fabric rotate is the clear equivalent; never clear silently. |

Claude reviewers and one-task workers start fresh and release when done. For a
retained Claude pair, checkpoint and compact at each stage or work-unit
boundary, by four answer-bearing provider turns, or before a pause expected to
exceed five minutes. Codex follows stage boundaries; native auto-compaction is
only a fallback. Fabric does not enforce these turn/time thresholds.

## Project Fabric Console

Build and verify the standalone Console before attaching it to live state:

```sh
npm run check --workspace=@local/agent-fabric-console
node runtime/agent-fabric-console/dist/cli.js --help
node runtime/agent-fabric-console/dist/cli.js --project "$PWD"
```

Use `--session '<stable project-session ID>'` when more than one attachable
session exists, `--herdr` when launched through the typed Herdr surface, or
`--export json|markdown` for a non-interactive snapshot. The interactive
Console follows the current terminal dimensions. `80x24` is the reference and
default when dimensions are unavailable, not a fixed size. Resize events
reflow full, compact and inert layouts while preserving stable selection,
focus, scroll, drafts and pending commands. `q` detaches the UI; it does not
stop a project session or daemon.

## Verify registrations

Client registry commands should report `agent-fabric` connected or ready. New
sessions may be required after changing a registry.

```sh
claude mcp list
codex mcp list
cursor-agent mcp list
kiro-cli mcp list
agy mcp list
```

The current Agy CLI uses a Bubble Tea TUI for `mcp list` and fails when no TTY
is available. In headless verification, inspect only the `agent-fabric` object
in `~/.gemini/config/mcp_config.json` and confirm its command plus the four
non-secret `AGENT_FABRIC_*` seat-selection variables; never print capability
files or unrelated registry values.

Resolve the active credential and metadata paths for one project seat without
printing the capability:

```sh
scripts/agent-fabric mcp seat-path --project "$PWD" --seat codex
PROJECT_KEY="$(scripts/agent-fabric mcp seat-path \
  --project "$PWD" --seat codex | jq -r .projectKey)"
SEAT_GENERATION="$(scripts/agent-fabric mcp seat-path \
  --project "$PWD" --seat codex | jq -r .generation)"
```

Both values come from the current project-keyed seat pointer. Do not derive a
project key from status prose, a copied path or an older generation.

The daemon and every MCP proxy derive the same stable private socket at
`$AGENT_FABRIC_STATE_DIRECTORY/runtime/fabric-v1.sock`. Dynamic Claude Code and
Codex registry entries bind a seat but no project path or credential. A client
that cannot preserve cwd may use a separately scoped `AGENT_FABRIC_PROJECT_PATH`
entry for one project; it must never be reused as a global registration.

Start a least-privilege observer after provisioning or renewal:

```sh
scripts/agent-fabric mcp observer-provision --project "$PWD"
scripts/agent-fabric observe \
  --socket "$HOME/.local/state/agent-harness/fabric/runtime/fabric-v1.sock" \
  --capability-file "$HOME/.local/state/agent-harness/fabric/seats/$PROJECT_KEY/observer.cap" \
  --run-id '<current run id>' \
  --cursor "$HOME/.local/state/agent-harness/fabric/observer/$PROJECT_KEY.cursor.json"
```

When an authorised supervised foreground daemon is intentionally used, keep
its quiet process separate from the optional `fabric-events` observer. The
observer renders terminal-safe one-line events in Brisbane time (`AEST`,
UTC+10) and 160-character local message previews, never bearer credentials.
The cursor is saved after rendering. Orderly restarts resume at the next event;
a crash between rendering and cursor persistence can repeat the last event, so
consumers must treat the stream as at-least-once.

Run transport-only checks independently of provider execution:

```sh
cd runtime/agent-fabric
export AGENT_FABRIC_PROJECT_KEY="$(../../scripts/agent-fabric mcp seat-path \
  --project ../.. --seat codex | jq -r .projectKey)"
node smoke/registered-mcp-health.mjs ../..
node smoke/registered-mcp-roundtrip.mjs ../..
```

The health smoke checks all five seats, tool/resource discovery and readable
run state. The round-trip smoke sends and acknowledges Codex to Claude and
Claude to Codex mailbox messages through separate MCP proxies.

## Renew seats

Bind a new immutable seat generation to the exact current operator-launched
project session and coordination run before the current credentials expire.
After launch reaches committed status, use the current `seatProvisioning`
descriptor returned by `operatorActionStatus` for the session/run revisions,
generations, chair identity and active chair lease. This descriptor is a
current CAS projection and is not part of the immutable commit receipt; refresh
status immediately before provisioning. The command derives the current active
roster generation from the locked project pointer and passes it as the expected
predecessor; there is no caller-selected rollback value. The requested expiry
must be a future ISO timestamp no more than 31 days away and cannot outlive any
bound agent's authority:

```sh
scripts/agent-fabric mcp provision \
  --project "$HOME/.agents" \
  --project-session-id '<current project-session ID>' \
  --session-revision '<current session revision>' \
  --session-generation '<current session generation>' \
  --run-id '<current coordination-run ID>' \
  --run-revision '<current run revision>' \
  --chair-seat codex \
  --chair-agent-id '<current chair agent ID>' \
  --chair-generation '<current chair generation>' \
  --chair-lease-id '<active chair lease ID>' \
  --seat-bindings 'agy=<agent>@<generation>,claude=<agent>@<generation>,codex=<chair-agent>@<generation>,cursor=<agent>@<generation>,kiro=<agent>@<generation>' \
  --expires-at '<ISO timestamp>'
```

Provisioning creates only agent capabilities for the supplied existing
principals. It does not create or select a project, session, run, chair,
authority, agent or discussion group. Any stale, retired, rolled-back,
cross-project or crossed identity fails atomically. An exact replay is
idempotent. The JSON result includes `expectedPreviousGeneration` and the new
content-addressed `generation`.

The daemon compare-and-swaps the active generation and revokes every prior
roster token in one transaction. The CLI stages and fsyncs the complete
`generations/<generation>/` directory, then compare-and-swaps `current.json`
under the private project lock only if its predecessor still matches. A delayed
writer cannot replace a newer pointer, and readers never fall back to a flat or
old pointer shape. Stop old proxies before cutover, restart or reconnect all
clients together, and rerun both smoke checks. An already-connected old proxy
is rejected on its next authenticated operation; do not treat two generations
as one team.

## Recovery

- A second daemon for the same socket or canonical database is rejected by an
  OS-backed SQLite exclusive owner lock held for the daemon lifetime. Process
  death releases the kernel lock without pathname deletion or stale-takeover
  races. Symlinked, dangling-symlink and hard-linked database paths fail closed.
- Startup releases expired delivery claims, quarantines expired unfenced write leases, reconciles non-terminal provider actions and marks unrecoverable sessions `context-unreconciled`.
- Provider effects use stable action IDs. Ambiguous effects are looked up or quarantined; they are not silently replayed.
- Interactive pane/TUI loss suspends the principal and freezes delivery until explicit reattach/rotation.
- Agents request compact or rotate with a revision-bound checkpoint. The lead closes stage/run barriers only after tasks, evidence, messages, leases, provider actions, handoffs and gates reconcile.

## Retention and archive

Retention is report-only. It never deletes data:

```sh
scripts/agent-fabric retention status
scripts/agent-fabric retention preview
scripts/agent-fabric retention archive \
  --run-id '<terminal run id>' \
  --output "$HOME/.local/state/agent-harness/fabric/archives"
```

Archive requires a terminal, non-quarantined run with a verified exported
receipt. It copies that immutable coordination receipt and a hash-bound
manifest without modifying the source database or run directory. There is no
retention `apply` command.

## Receipt and shutdown

Export `fabric-receipt.json`, declare it in the canonical `delivery-run`
`RUN.json` as the `fabric-coordination-receipt` evidence artifact, and verify
the artifact digest before stopping the daemon. The fabric receipt hashes
provider resume references and records full coordination fields; it does not
expose provider secrets. Do not create or adopt a second run-receipt shape.

Do not delete the SQLite database, capability key, provider-native session, or `.agent-run` evidence as part of normal completion. Retention or destructive cleanup requires its own user decision.
