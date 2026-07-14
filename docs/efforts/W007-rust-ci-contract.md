# Rust review-portal CI repair: TDD contract

Date: 2026-07-14
Work item: W016, feeding W007 after W003
Audience: the W007 implementer and independent reviewers

## Decision

Treat the hosted failures as two independent repairs:

1. make the existing native boundary lint-clean for each compiled target; and
2. make the relay tests control child descriptor inheritance and bound their own
   I/O and cleanup.

The macOS repair is test infrastructure. Production shall continue to reject
every inherited descriptor above stderr. It shall not silently close, ignore or
allow an ambient descriptor.

This contract is grounded at integration head
`9340e8623f05ef52d91b6263a178844d3db8ac8f`. The Rust crate and its CI job are
unchanged from the diagnosis base
`9f168eed9ac7001744d372a840be9648bb11edcf`; a path-limited diff between those
heads was empty.

## Current evidence

- `src/lib.rs:341-396` is the production fail-closed descriptor oracle. It
  reports `portal mode inherited non-stdio descriptor <n>` before broker
  connection.
- Linux compiles unused Darwin `getsid` surfaces (`src/lib.rs:1871` and
  `:2071-2079`), sees same-type conversions at `:1958` and `:1960`, and applies
  `struct_field_names` to `UCred` at `:2254-2264`.
- The nominal relay command is built directly at `tests/portal_relay.rs:88-101`.
  `env_clear()` does not close inherited descriptors.
- Test-side blocking remains at `tests/portal_relay.rs:76`, `:318`, `:370` and
  the following join at `:397`. Child collection at `:33-47` can also enter
  unbounded output collection after its process poll.
- `.github/workflows/ci.yml:96-124` already runs the crate on
  `ubuntu-latest` and `macos-15` with Rust 1.94.1, Clippy warnings denied and a
  ten-minute job watchdog.
- The reproduced failures and commands are recorded in
  `rust-ci-diagnosis-2026-07-14.md`. That diagnosis is the retained RED witness;
  do not manufacture a different failure.

## Risk and authority

Minimum risk tier: `crucial`. This touches a build/release gate and the tests around
a fail-closed native security boundary.

Once W003 clears W007 to start, implementation may change only:

- `runtime/agent-fabric-review-portal-supervisor/src/lib.rs`;
- `runtime/agent-fabric-review-portal-supervisor/tests/portal_relay.rs`; and
- `.github/workflows/ci.yml` for the explicit inherited-FD proof.

No Cargo manifest, lockfile, dependency, production portal protocol, descriptor
policy, release state or external system is in scope. Do not add lint permits,
weaken `-D warnings`, change the ten-minute CI watchdog, or use a production
change to make a nominal test tolerate an ambient descriptor. Scope expires
when W007 is accepted or when the Rust/workflow paths diverge from the grounded
head; divergence requires a fresh diagnosis. The D-021 authority holder is the
approver.

## Non-negotiable invariants

- **RUST-FD-01: production rejection.**
  `require_portal_descriptors_closed()` shall remain fail-closed for every open
  descriptor greater than 2 and shall retain the exact descriptor number in the
  error.
- **RUST-FD-02: clean nominal launch.** Every nominal test helper shall start
  after successful `exec` with only descriptors 0, 1 and 2 inherited.
- **RUST-FD-03: exact negative launch.** The negative case shall first apply
  the same nominal cleanup, then inject exactly FD 127, and shall observe the
  exact FD 127 rejection before any broker connection.
- **RUST-IO-01: internal bounds.** No broker accept, broker read/write, child
  output drain, child termination or child reap in `portal_relay.rs` may depend
  on the GitHub job timeout.
- **RUST-TIME-01: deadline classes.** An infrastructure deadline prevents a
  hang; it is not evidence that a semantic operation was fast. A semantic
  deadline is asserted only by a test whose named product contract is
  fail-fast.
- **RUST-LINT-01: target truth.** Platform gates and conversions shall reflect
  the type compiled on that target. They shall not suppress a diagnostic.
- **RUST-ABI-01: credential layout.** The Linux `SO_PEERCRED` structure shall
  remain `repr(C)` with PID, UID and GID in that order and with the existing
  field types.

## Red-green sequence

Run one cycle at a time and retain the command, exit code and relevant output in
the W007 receipt.

### Cycle L1: Linux Clippy

**First right-reason RED**

On `ubuntu-latest` x86_64, at the grounded Rust source and Rust 1.94.1:

```sh
cargo clippy --locked --offline --all-targets -- -D warnings
```

The valid RED is the five diagnosed target-specific diagnostics only:

1. unused Darwin `getsid` declaration;
2. unused Darwin `process_session_id` wrapper;
3. useless `u32 -> u32` conversion for Linux `mode`;
4. useless `u64 -> u64` conversion for Linux x86_64 `hard_links`; and
5. `struct_field_names` on Linux `UCred`.

A missing toolchain, unlocked graph, network access, compile error, new warning
or test failure is a wrong-reason RED and must return to diagnosis.

**Minimum GREEN**

- Gate the `getsid` declaration and `process_session_id` wrapper to macOS, where
  their only caller is already gated.
- Materialise `mode` and `hard_links` using the compiled target widths:
  macOS widens `u16 -> u32` and `u16 -> u64`; Linux uses `u32` directly for
  `mode`; Linux x86_64 uses `u64` directly for `hard_links`; other supported
  Linux layouts widen their `u32` link count.
- Rename only the private Linux credential fields to `pid`, `uid` and `gid`,
  then update the tuple projection. Preserve field order, field types and
  `repr(C)`.

Do not add a synthetic unit test for private names. The right oracle is the
Linux lint gate plus the existing public peer-identity and custody suites. Green
means the exact Clippy command succeeds on Linux and the full crate suite
remains green on both matrix platforms.

### Cycle M0: lock the security characterisation

Before changing the test launcher, strengthen the existing negative test to
assert all four observable outcomes:

1. non-zero helper exit;
2. no accepted broker connection;
3. stderr is exactly
   `review portal helper failed closed: portal mode inherited non-stdio descriptor 127\n`;
4. FD 127 remains detectable even after the child lowers its soft descriptor
   limit below 127.

This characterisation is expected to pass before the repair. It protects the
security behaviour while the nominal launcher changes. If it does not pass,
stop and re-diagnose.

### Cycle M1: ambient parent FD

**First right-reason RED**

The existing nominal public behaviour is the test. Run it in a short-lived
shell that gives only that Cargo/test process an inheritable FD 9:

```sh
bash -c 'exec 9</dev/null; cargo test --locked --offline --test portal_relay \
  connects_once_and_relays_byte_exact_lf_frames_between_stdio_and_the_broker \
  -- --exact --nocapture'
```

At the diagnosed source it fails after the broker wait because production
correctly rejects FD 9. The retained diagnosis pairs that outer failure with a
direct-helper probe whose stderr identifies FD 9. Any fresh RED run shall retain
that stderr even if the broker side reports no connection. A setup, socket-path
or framing failure is wrong-reason.

The diagnosed `immediate_broker_eof_never_masks_a_malformed_request` timeout is
the corresponding RED for the raw blocking accept at line 370. Do not run that
unbounded reproducer without an external five-second watchdog; the retained
hosted timeout already satisfies the RED-witness requirement.

**Minimum GREEN**

Route every portal-binary launch in `portal_relay.rs` through one test-only
builder with two explicit modes:

- `Clean`: remove the test process's inheritable non-stdio descriptors in the
  child immediately before `exec`;
- `Inject(127)`: perform the same cleanup and then duplicate the test-owned
  source descriptor to 127 before lowering the child soft limit.

The builder shall not mutate or close descriptors in the test process. The
preferred bounded mechanism is:

1. immediately before `spawn`, enumerate `/dev/fd`, drop the enumeration
   handle, and retain only open descriptors greater than 2 whose
   `FD_CLOEXEC` flag is clear;
2. capture that stable list in `pre_exec` and call only async-signal-safe
   `close(2)` operations for those exact descriptor numbers, tolerating only
   `EBADF` if a listed descriptor is already closed; and
3. for `Inject(127)`, exclude the retained test-owned source from the close
   list, close the remaining baseline list first, then `dup2` the source to 127,
   close the source when it is above stderr and not itself 127, and apply the
   existing child-only rlimit change. Assert before `spawn` that the selected
   source is not 127.

Do not use an indiscriminate `closefrom(3)` or `close_range(3, ...)` inside
`pre_exec` unless a separate proof shows that Rust's `Command` exec-error pipe
and stdio setup survive. Snapshotting before `spawn` avoids closing descriptors
created internally by `Command` and prevents the repair from hiding spawn
failures.

### Cycle M2: bounded test I/O and cleanup

After M1 is green, extract a common test-fixture interface as a behaviour-
preserving refactor and rerun the focused suite. Then add one observable fixture
case at a time. Each shall fail at the diagnosed raw blocking operation before
its minimum test-side implementation:

- `broker_accept_deadline_reports_helper_stderr`: a helper rejected before
  connection yields a bounded accept-phase error that includes captured helper
  stderr;
- `broker_read_deadline_rejects_a_connected_stalled_peer`: a connected peer
  that sends no complete request yields a bounded read-phase error;
- `child_deadline_kills_reaps_and_preserves_partial_output`: a live helper at
  the infrastructure deadline is terminated, reaped within a second bounded
  phase, and returns its partial stdout/stderr to the assertion.

Exercise these through the common test fixture interface, not private call
counts. A compile/setup failure is not RED. For the historic line-370 case, the
right RED is failure to return before the external watchdog; for the read and
cleanup cases, the right RED is the named phase exceeding its absolute
deadline.

The minimum test-side implementation shall:

- use one absolute infrastructure deadline per accept/read/write/drain phase;
- make listeners and accepted streams non-blocking, retry only `WouldBlock` or
  `Interrupted`, and never reset the deadline after partial progress;
- replace raw `read_exact`, `read_to_end` and blocking `accept` in broker
  threads with bounded operations;
- poll child exit; on deadline, kill, poll bounded reap, and drain stdout/stderr
  without an unbounded `wait_with_output` path;
- return phase-labelled errors rather than panic inside broker threads; and
- collect child output before reporting broker failure so the security reason
  is never masked by `helper never connected` or an opaque join panic.

Use a five-second infrastructure operation/reap bound. Keep the GitHub job's
ten-minute limit as a scheduling/catastrophic watchdog only. Keep semantic
latency assertions separate and at their existing contract values: the
malformed-frame fail-closed assertion remains below 500 ms, and the unavailable
socket no-retry assertion remains below one second. Do not treat completion
within five seconds as semantic success.

## CI proof at one head SHA

The `review-portal-supervisor` matrix shall run the following at the same
`GITHUB_SHA` on both `ubuntu-latest` and `macos-15`:

```sh
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
cargo fmt --check
test "$(awk '/^\[\[package\]\]/{count++} END{print count+0}' Cargo.lock)" -eq 1
cargo metadata --locked --offline --no-deps --format-version 1 >/dev/null
cargo clippy --locked --offline --all-targets -- -D warnings
cargo test --locked --offline
bash -c 'exec 9</dev/null; cargo test --locked --offline --test portal_relay -- --test-threads=1'
```

The final `bash -c` is deliberately process-local: FD 9 is inherited by Cargo
and the relay test binary, then removed only from nominal portal children. It
cannot leak into later workflow steps. The exact FD 127 negative runs inside
that full relay suite; its builder must remove ambient FD 9 before injecting
127, so an implementation that merely accepts or globally closes all high
descriptors cannot pass both oracles.

Acceptance requires:

- all seven commands green in both matrix jobs at the same SHA;
- Linux Clippy emits no warnings and keeps crate-wide lint denial intact;
- the ordinary and FD-9 relay suites both pass without an outer timeout;
- the exact FD 127 test still fails closed before broker connection and reports
  only FD 127;
- the three bounded-fixture cases identify accept, read and child-cleanup
  deadline phases without masking partial stderr; and
- the W007 receipt records the two job URLs, tested SHA, Rust version, RED
  witnesses and focused/full GREEN commands.

Mutation-sensitive review shall also show that: disabling nominal descriptor
cleanup makes the FD-9 suite fail; applying cleanup after FD-127 injection makes
the exact negative fail; removing an accept/read/cleanup bound trips its focused
fixture; and removing a Linux target gate restores the Clippy RED.

## Explicit exclusions

- No change to production descriptor enumeration, rejection wording or call
  order in `main.rs`.
- No production transport deadline, retry or framing change.
- No dependency, lockfile, toolchain, action-version or broad Rust refactor.
- No claim that a local macOS run proves Linux. Hosted Linux evidence is
  load-bearing.
- No release, merge or deployment action.

## Primary risks for review

1. A broad child-FD close can remove Rust's exec-error pipe and turn a spawn
   failure into false success. Require the pre-spawn inheritable-FD snapshot.
2. Cleaning after FD 127 is injected can make the security negative pass for
   the wrong reason or disappear. Require clean-then-inject and exact stderr.
3. A five-second infrastructure watchdog can be mistaken for a semantic
   latency contract. Keep phase names and separate sub-second assertions.
4. Bounding `accept` while leaving output drain, reap or a broker read blocking
   merely moves the hosted hang. Exercise all three focused deadline cases.
5. macOS green cannot validate Linux ABI widths or Clippy. Require both hosted
   matrix jobs at one SHA before acceptance.
