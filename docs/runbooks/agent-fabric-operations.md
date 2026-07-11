# Agent fabric operations

Status: five model-execution adapters and five MCP client registrations active
Applies to: `runtime/agent-fabric` and `scripts/agent-fabric*`

## Human gates

The following remain separate approvals. One does not imply another:

1. build/install the local runtime;
2. enable a provider adapter after compatibility verification;
3. install an auto-start service for the daemon;
4. log into or consume quota from a provider;
5. change or remove a client registry entry;
6. run a smoke that invokes a real provider adapter;
7. release or publish Git state.

The human authorised the current model-execution daemon, five local MCP
registrations and bounded provider smokes. Claude, Codex, Agy, Cursor and Kiro
are enabled; Pi remains disabled until a trusted open-weight provider/model is
installed. Registration does not authorise provider login changes, release or
publication.

## Preflight

```sh
npm --prefix runtime/agent-fabric run check
npm --prefix runtime/agent-fabric run test:evaluation
npm --prefix runtime/agent-fabric run test:load
scripts/check-harness
git diff --check
python3 skills/deliver/scripts/validate_delivery.py \
  .agent-run/AFAB-001/RUN.json --workspace-root "$PWD" --verify-hashes
```

Then verify the selected compatibility entries against the current executable/schema hashes. Unresolved pins, missing artifacts or disabled entries fail closed.

## Current local installation

Read workstation-specific run, roster, expiry, adapter and socket state from
the machine interface. Do not copy it into this runbook:

```sh
scripts/agent-fabric status --json --project "$PWD"
scripts/agent-fabric doctor --json
```

Each client registry contains only the proxy command, socket path, fabric state
directory, seat and client label:

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

The resolved `.cap` file must remain a private regular file with mode `0600`.
The adjacent `.json` file is secret-free metadata and is checked against the
canonical project, project key, seat and credential path before use. Never
paste capability values into a registry, log or document.

## Daemon supervision

The current daemon runs in Herdr's infrastructure tab with the five activated
provider adapters:

```sh
env AGENT_FABRIC_RUNTIME_DIRECTORY="$HOME/.local/state/agent-harness/fabric/runtime" \
  "$HOME/.agents/scripts/agent-fabric" daemon run \
  --trusted-config "$HOME/.agents/config/agent-fabric.yaml" \
  --compatibility "$HOME/.agents/config/adapter-compatibility.yaml" \
  --compatibility-schema "$HOME/.agents/runtime/agent-fabric/schemas/adapter-compatibility.schema.json" \
  --agents-home "$HOME/.agents"
```

There is deliberately no login item or background auto-start service yet. The
healthy foreground daemon is intentionally quiet, so its dedicated
`infrastructure` pane normally appears blank. Reuse that one pane; do not open
another on restart. If it stops, restart the command above in the existing pane
before reconnecting clients. A second daemon
for the same socket or the same SQLite database fails closed. The socket lock
prevents unlink takeover; the database lock prevents two startup-recovery
owners from serving one durable store through different sockets.

## Shared-client model

Every client uses a separate stdio proxy process:

```text
AGENT_FABRIC_SOCKET_PATH=<same socket>
AGENT_FABRIC_STATE_DIRECTORY=<private fabric state directory>
AGENT_FABRIC_SEAT=<agy|claude|codex|cursor|kiro>
scripts/agent-fabric-mcp
```

The chair creates the run. Peers receive narrowed authority and their own capability. Swapping Claude and Codex leadership changes only which capability is chair-bound; it does not change the protocol or create a fallback chain.

For visible pairing, Herdr attaches panes or observer renderers while messages still travel through the durable fabric mailbox. For headless orchestration, no pane is required. Both profiles can coexist in one run.

Herdr provides pane visibility and process supervision. Fabric events are
rendered by the explicit least-privilege `fabric-events` observer described
below; MCP tool responses and the SQLite-backed fabric remain authoritative.

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
```

The daemon and every MCP proxy derive the same stable private socket at
`$AGENT_FABRIC_STATE_DIRECTORY/runtime/fabric-v1.sock`. Registry entries bind
`AGENT_FABRIC_PROJECT_PATH` plus a seat; they do not hard-code credentials.

Start a least-privilege observer after provisioning or renewal:

```sh
scripts/agent-fabric mcp observer-provision --project "$PWD"
scripts/agent-fabric observe \
  --socket "$HOME/.local/state/agent-harness/fabric/runtime/fabric-v1.sock" \
  --capability-file "$HOME/.local/state/agent-harness/fabric/seats/<project-key>/observer.cap" \
  --run-id '<current run id>' \
  --cursor "$HOME/.local/state/agent-harness/fabric/observer/<project-key>.cursor.json"
```

Keep the quiet daemon process in a separate Herdr infrastructure tab. The
`fabric-events` pane is the human surface: it renders terminal-safe one-line
events in Brisbane time (`AEST`, UTC+10) and 160-character local message
previews, never bearer credentials.
The cursor is saved after rendering. Orderly restarts resume at the next event;
a crash between rendering and cursor persistence can repeat the last event, so
consumers must treat the stream as at-least-once.

Run transport-only checks independently of provider execution:

```sh
cd runtime/agent-fabric
AGENT_FABRIC_PROJECT_KEY='<from status --json>' \
  node smoke/registered-mcp-health.mjs ../..
AGENT_FABRIC_PROJECT_KEY='<from status --json>' \
  node smoke/registered-mcp-roundtrip.mjs ../..
```

The health smoke checks all five seats, tool/resource discovery and readable
run state. The round-trip smoke sends and acknowledges Codex to Claude and
Claude to Codex mailbox messages through separate MCP proxies.

## Renew seats

Provision a fresh immutable run before the current expiry. Use a future ISO
timestamp no more than 31 days away:

```sh
scripts/agent-fabric mcp provision \
  --project "$HOME/.agents" \
  --chair codex \
  --seats agy,claude,codex,cursor,kiro \
  --expires-at '<ISO timestamp>'
```

Renewal intentionally creates a new immutable run because expiry is part of
the authority envelope; rotating a capability cannot extend that authority.
Before renewal, drain and checkpoint the old run, export its receipt, close its
barriers, and stop old proxies. Provisioning writes the complete roster into an
immutable `generations/<generation>/` directory, fsyncs every private file, then
atomically replaces `current.json`. Readers therefore observe either the whole
old roster or the whole new roster; an interrupted staging pass does not create
a mixed generation. Legacy flat seat files remain readable until the next
successful renewal. Restart or reconnect all clients together after cutover and
rerun both smoke checks.
Already-connected old proxies remain bound to the old run until stopped or its
capabilities expire; do not operate old and new generations as one team. Retain
the old immutable run for audit and reconciliation.

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

Do not delete the SQLite database, capability key, provider-native session, or `.agent-run` evidence as part of normal completion. Retention or destructive cleanup requires its own human decision.
