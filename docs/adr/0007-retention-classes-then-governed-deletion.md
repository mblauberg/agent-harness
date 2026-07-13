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

## Rejected

- Build the delete path first (pack): not a present defect.
- Archive-forever: unsustainable for autonomous operation.
