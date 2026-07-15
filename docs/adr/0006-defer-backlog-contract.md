# ADR 0006 — Defer a canonical backlog contract

**Status:** Accepted 2026-07-13; amended 2026-07-15

## Context

For a single operator whose lifecycle is interactive, a canonical backlog
schema, store abstraction and migration layer would be a second framework
without a proven consumer. Managed write execution must establish the concrete
requirements first.

## Decision

Project-local work maps and GitHub issues remain the current work owners. The
harness does not define a canonical backlog-item schema, a cross-store contract
or bidirectional migration between Markdown and GitHub.

Reconsider a shared backlog contract only when managed write-pilot evidence
identifies a concrete consumer and its required fields, transitions and store
semantics. A runtime queue controller and intake-decision kernel remain
deferred with that contract.

## Consequences

- Interactive work continues from project-local work maps and GitHub issues.
- No lossless Markdown/GitHub migration is promised.
- Store-specific automation may evolve locally without establishing a harness
  contract.
