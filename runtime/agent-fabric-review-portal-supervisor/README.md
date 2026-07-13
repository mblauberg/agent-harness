# Agent Fabric review portal supervisor

This dependency-free Rust crate owns the narrow native boundary required by
Spec 04 section 9.21.3 and Spec 05 section 6:

- the binary accepts only `portal-stdio-v1` and exactly
  `AGENT_FABRIC_REVIEW_SOCKET`, `AGENT_FABRIC_REVIEW_ACTION` and
  `AGENT_FABRIC_REVIEW_CONTRACT`;
- portal mode requires private supervisor FD 3 to be absent, connects to one
  AF_UNIX broker once, and relays bounded LF frames without interpreting JSON,
  UTF-8 or MCP;
- supervisor helpers mark FD 3 `CLOEXEC`, bind local peer credentials to
  PID/start/PGID/session identity, verify bounded ancestry, and perform
  TERM -> 250 ms -> KILL -> reap cleanup only for an exact isolated group;
- custody helpers reject absolute/traversing names and inspect/remove only an
  exact non-symlink socket or regular file beneath the canonical, owner-matched
  0700 directory identity.

TypeScript remains the sole JSON-RPC/MCP parser, policy owner, ledger/journal
owner and one-use broker. The binary never receives a bearer capability.

## Fail-closed integration status

This crate alone does **not** prove `certifying-review-packet-only.v1`. Keep
Cursor and Agy capability false until daemon integration also proves all of the
following on the activated build:

- stopped-child launch and durable `review_portal_process_custody` persistence
  before continue/exec;
- action/contract/bundle equality and one-use broker admission using the peer
  identity returned here;
- pinned executable bytes, Darwin code identity, complete ancestry and outer
  OS confinement;
- control EOF, deadline, cancellation, provider exit and daemon/supervisor
  death wiring to the cleanup owner;
- no-follow directory/device/inode **and expected file digest** verification
  before removal (this crate verifies names/type/device/inode but does not own
  the daemon's persisted digest comparison);
- current-build source/auth/tool/network denial plus `setsid`, double-fork,
  daemonisation and reparent escape canaries.

Run the crate gate with:

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```
