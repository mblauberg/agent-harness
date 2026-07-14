# Rust review-portal CI diagnosis — 2026-07-14

Base: `9f168eed9ac7001744d372a840be9648bb11edcf`.

Local macOS is green for format, locked/offline metadata, Clippy, and all tests. The hosted failures are two independent platform slices.

## Linux: five Clippy errors

- macOS-only `getsid` FFI/wrapper compiles unused on Linux (`src/lib.rs:1871`, `:2071`).
- Linux x86_64 performs two useless same-type conversions (`:1958`, `:1960`); the macOS/aarch64 widening requirement must remain.
- `UCred` fields at `:2254` trip `clippy::struct_field_names`; rename to `pid`, `uid`, `gid` while preserving `repr(C)` field order/layout.

Repair: target-gate the macOS FFI/wrapper, choose conversions by actual target width, rename the Linux credential fields, and keep crate-wide lint denial intact.

## macOS: ambient FD plus unbounded test accept

Production correctly rejects every inherited non-stdio descriptor (`src/lib.rs:341`). Relay tests clear the environment but do not control inherited descriptors (`tests/portal_relay.rs:88`). With an injected parent FD, the nominal relay test reproduces the hosted symptom exactly:

```sh
bash -c 'exec 9</dev/null; cargo test --locked --offline --test portal_relay \
  connects_once_and_relays_byte_exact_lf_frames_between_stdio_and_the_broker \
  -- --exact --nocapture'
```

Independent replay: failure at 2.00 seconds with `helper never connected`. Direct helper evidence identifies the rejected descriptor. A blocking test-side `accept()` at `tests/portal_relay.rs:368` and later join at `:397` converts the correct early rejection into the hosted job timeout; other long-running test names are waiters on the suite-wide mutex at `:19`, not independent hangs.

Repair contract:

- keep production inherited-FD rejection fail-closed;
- launch nominal helpers with a controlled 0–2 descriptor set;
- inject an exact high descriptor in the negative test and assert that exact failure reason;
- internally bound every broker accept/read and child cleanup, including `read_exact` at `:76` and `read_to_end` at `:318`;
- preserve helper stderr when broker setup fails;
- separate generous CI scheduling bounds from sub-500ms semantic assertions.

## Acceptance

On both `ubuntu-latest` and `macos-15`, at the same head SHA:

```sh
cargo fmt --check
cargo metadata --locked --offline --no-deps --format-version 1
cargo clippy --locked --offline --all-targets -- -D warnings
cargo test --locked --offline
```

Additionally, the full relay suite must pass under a parent that deliberately inherits FD 9; the exact injected-FD negative must still fail closed; and no broker accept/read or child cleanup may rely on the outer ten-minute job timeout.
