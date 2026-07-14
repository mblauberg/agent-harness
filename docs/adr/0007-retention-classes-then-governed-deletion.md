# ADR 0007 — Retention classes now, governed deletion later

**Status:** Accepted 2026-07-13 (human, scoping round 6)

## Context

Retention is deliberately report/archive-only (`retention.ts` supports only
status/preview/archive). Safe early, but unbounded for a durable autonomous
harness (F-008).

## Decision

Adopt the five retention classes now — ephemeral, operational, evidence,
durable knowledge, sensitive — and **class-tag all new state immediately** so
later deletion needs no archaeology. The typed-delete machinery (preview,
protected paths, legal hold, receipts, refuse-unknown-files) ships after the
ADR 0002 tranche; archive-only remains the behaviour until then. F-008 demoted
from P0.

## Amendment — 15 July 2026 (machine identifiers)

The Decision above names the classes in prose. Every schema, contract and
persisted value uses the **machine identifier**; a space is inadmissible in a
JSON enum or a persisted field value. The prose names map 1:1, and only the
fourth differs:

| Prose name | Machine identifier |
|---|---|
| ephemeral | `ephemeral` |
| operational | `operational` |
| evidence | `evidence` |
| durable knowledge | `durable-knowledge` |
| sensitive | `sensitive` |

`durable knowledge` is a prose name only; `durable-knowledge` is its sole
machine identifier. No other spelling is admitted in any schema or example. The
five classes and the Decision are otherwise unchanged.

## Rejected

- Build the delete path first (pack): not a present defect.
- Archive-forever: unsustainable for autonomous operation.
