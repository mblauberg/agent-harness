# ADR 0007 — Defer universal retention classes and typed deletion

**Status:** Accepted 2026-07-13; amended 2026-07-15

## Context

Current retention is deliberately report/archive-only. Universal retention
classes and typed deletion would add state fields and lifecycle machinery
before a concrete deletion requirement exists.

## Decision

Use project and risk policy plus bounded run-artifact retention as the current
owners. Do not require a universal retention-class field or class-tag all new
state.

Defer universal retention classes and typed deletion until a concrete deletion
requirement establishes the necessary protections, evidence and refusal
behaviour. Archive-only remains the runtime behaviour until then.

## Consequences

- Existing project-specific retention rules remain authoritative.
- The harness adds no universal class vocabulary, tagging framework or deletion
  contract now.
- A future deletion proposal requires a separately approved scope.
