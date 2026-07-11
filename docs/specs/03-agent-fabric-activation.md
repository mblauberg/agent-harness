# Agent fabric activation and operations

Status: Implemented; final human acceptance pending
Date: 11 July 2026
Decision owner: Human maintainer
Approval: Direct instruction to implement, activate and provider-smoke all listed capabilities, with quota use authorised

## Outcome

Promote the coordination-only agent fabric into a safely activated local model-execution fabric for Claude, Codex, Agy, Cursor and Kiro, with Pi ready but unavailable until an open-weight provider/model is installed. Add operator-started human-readable Herdr observation and coordinated seat rotation without weakening authority, disclosure, read-only execution or fail-closed compatibility gates.

## Required behaviour

1. Every activated adapter is bound to verified wrapper closure, upstream executable or package, protocol/schema and model-family constraints.
2. Provider work uses the admitted absolute working directory and cannot request write tools, edit modes, approval bypasses, extra roots or uncontrolled provider/model substitutions.
3. Malformed, drifted or ambiguous provider responses fail closed before state is accepted.
4. Kiro uses a real, version-pinned ACP client with bounded framing, capability negotiation, session lifecycle and read-only tool policy.
5. Activation is staged and reversible. One adapter failure cannot disable coordination or corrupt another adapter's journal.
6. Provider-backed smoke tests use bounded read-only prompts, record the pinned adapter/executable and explicitly requested model route, reject wrapper-visible substitutions, and may consume quota under this approval. Upstreams that do not report an effective model must not be described as independently proving it.
7. Herdr observation reads a durable monotonic event cursor and renders one-line summaries in a separate local observer pane. Message events include a terminal-safe 160-character body preview. It never types into an agent composer, receives mail or acknowledges delivery.
8. Seat expiry warnings are automatic. Authority extension remains an explicit operator action: close the old run only after daemon-produced barrier evidence, provision a fresh immutable generation, atomically cut over the roster, reconnect every seat, and run health plus round-trip smokes. The global 31-day maximum remains non-configurable by projects.

## Activation order

1. Claude Agent SDK.
2. Codex app server.
3. Cursor and Agy headless boundaries.
4. Pi RPC isolation and compatibility pinning; runtime activation waits for an available trusted open-weight route.
5. Kiro ACP.
6. Herdr observer.
7. Coordinated seat renewal.

Each step must pass compatibility, boundary, conformance and negative tests before joining `activeAdapters`. Provider-backed smoke follows activation and stops on any write attempt, schema drift, unexpected permission request, missing session reference or unbounded output.

## Non-goals

- No provider credential export or login changes.
- No automatic public deployment or Git push.
- No unbounded fabric message bodies in Herdr; local previews are capped and terminal-neutralised.
- No authority extension by capability rotation or blind timer.
- No fallback that bypasses a disabled, unresolved or mismatched adapter.

## Rollback

Restore `activeAdapters: []`, restart the visible daemon, retain journals and seat generations for audit, and rerun coordination-only health plus Codex↔Claude mailbox smokes. Adapter activation is configuration-reversible. Observer sequencing adds migration `0002-observer-event-sequence.sql`; rollback retains that monotonic audit table because removing it would destroy cursor history.

## Acceptance

- Full runtime and harness gates pass.
- Every adapter has positive conformance and negative boundary coverage.
- Provider-backed read-only smoke passes for each available logged-in provider/model family; unavailable account models are recorded, not substituted silently.
- Herdr observer resumes without loss after an orderly restart, provides at-least-once rendering across a crash window, shows bounded local message previews and exposes no capability data.
- Expiry warning and explicit coordinated rotation tests pass.
- Fresh native and Fable reviews report no unresolved P0–P2 findings.
