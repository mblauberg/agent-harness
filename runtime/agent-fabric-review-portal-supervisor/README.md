# Agent Fabric review portal supervisor

This dependency-free Rust crate owns the narrow native boundary required by
Spec 04 section 9.21.3 and Spec 05 section 6:

- the binary accepts only `portal-stdio-v1` and exactly
  `AGENT_FABRIC_REVIEW_SOCKET`, `AGENT_FABRIC_REVIEW_ACTION` and
  `AGENT_FABRIC_REVIEW_CONTRACT`;
- portal mode requires every inherited descriptor above stderr to be absent, connects to one
  AF_UNIX broker once, and relays bounded LF frames without interpreting JSON,
  UTF-8 or MCP;
- supervisor helpers mark FD 3 `CLOEXEC`, bind local peer credentials to
  PID/start/PGID/session identity plus Darwin audit-token PID generation, verify bounded ancestry,
  and perform polled TERM -> 250 ms -> KILL -> bounded WNOHANG reap cleanup only for an exact
  isolated group while retaining trigger/outcome evidence;
- custody helpers walk and retain no-follow directory descriptors, use fstatat/openat/unlinkat,
  and remove only an exact owner-matched socket or SHA-256-matched regular file beneath the exact
  0700 directory identity.

TypeScript remains the sole JSON-RPC/MCP parser, policy owner, ledger/journal
owner and one-use broker. The binary never receives a bearer capability.

## Fail-closed integration status

This crate alone does **not** prove `certifying-review-packet-only.v1`. Keep
every helper-backed certifying route `capability=false`; in particular, `setsid` escape prevention
and outer OS confinement remain explicitly false until daemon integration proves all of the
following on the activated build:

- stopped-child launch and durable `review_portal_process_custody` persistence
  before continue/exec;
- action/contract/bundle equality and one-use broker admission using the peer
  identity returned here;
- pinned executable bytes, Darwin code identity, complete ancestry and outer
  OS confinement;
- control EOF, deadline, cancellation, provider exit and daemon/supervisor
  death wiring to the cleanup owner;
- durable persistence and comparison of the expected custody identity/digest passed to this
  crate's no-follow removal boundary;
- current-build source/auth/tool/network denial plus `setsid`, double-fork,
  daemonisation and reparent escape canaries.

Run the crate gate with:

```sh
cargo fmt --check
test "$(awk '/^\[\[package\]\]/{count++} END{print count+0}' Cargo.lock)" -eq 1
cargo metadata --locked --offline --no-deps --format-version 1 >/dev/null
cargo clippy --locked --offline --all-targets -- -D warnings
cargo test --locked --offline
```
