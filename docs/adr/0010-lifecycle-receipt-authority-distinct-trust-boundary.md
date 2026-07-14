# ADR 0010 — The lifecycle receipt authority is a trust boundary distinct from provider authority compilation

**Status:** Accepted 2026-07-15 (human, W005/W008 dependency call)

## Context

"Receipt" now names three unrelated things, and the collision is manufacturing a
false circular dependency:

1. **`lifecycle_authority_receipts`** — attestation of lifecycle *transitions*
   by an external append-only ledger. Frozen in
   `runtime/agent-fabric/migrations/0001-current-baseline.sql:1874`, with
   `lifecycle_receipt_batches:1372`, `_batch_completions:1924`,
   `_batch_authorizations:2147`, `lifecycle_transition_applies:2171` and
   `lifecycle_admitted_run_scopes:1153`.
2. **`AuthorityEnvelopeV2`** / the provider authority-compilation receipt —
   *provider capability compilation* (ADR 0002). It does not exist in code yet.
3. **"receipt portability"** — publication of *release evidence*. Unrelated to
   both.

The false circularity: W008 (the `AuthorityEnvelopeV2` cutover) depends on W005,
but W005's frozen lifecycle schema appears to require an authority receipt — so
W005 looks like it needs W008. It does not. These are different trust
boundaries: one attests that a lifecycle transition happened; the other compiles
what a provider is permitted to do.

## Decision

The three concepts have distinct owners and are named distinctly in all new
text. Specifically, for the lifecycle receipt authority:

- It is an **external, append-only ledger, read outside the resealable lifecycle
  snapshot**. It is exposed as an optional port on `FabricRuntimeOpenOptions`
  (`lifecycleReceiptAuthority?: LifecycleIntegrityReceiptAuthorityPort`,
  `runtime/agent-fabric/src/core/fabric.ts:232`), following the existing
  `externalEffects` ports/adapters precedent in the same options block
  (`…/fabric.ts:224`).
- It **cannot mint its own identity**. `authority_id` is FK-bound to
  `lifecycle_admitted_run_scopes`, which permits exactly one authority per
  `(project_session_id, run_id)` — the receipt chain is also hash-linked, with
  sequence 1 forbidden a predecessor and every later sequence required to name
  one. An in-process default may never forge an authority, and must not claim
  third-party attestation it does not hold.
- **W005 ships the lifecycle receipt authority** and keeps an **explicitly
  labelled transitional unrouted provider-action arm** that claims **no** Spec-04
  v1.32 authority conformance. W008 closes that arm.

There is therefore no circular dependency.

## Consequences

- W005 is **not** blocked on W008 and must not be sequenced as though it were.
- The transitional arm is labelled, not silent: it states in-band that it
  carries no Spec-04 authority conformance.
- The vocabulary collision is retired in new text; "receipt" is never used
  unqualified across these three boundaries.

## Rejected

- Serialising W005 behind W008 to "resolve" the dependency: the dependency is an
  artefact of the shared word, not of the schema.
- An in-process default that mints its own `authority_id`: the schema forbids it,
  and a self-issued attestation is not an attestation.
- Collapsing lifecycle receipts and the provider authority envelope into one
  contract: they answer different questions at different trust boundaries.
