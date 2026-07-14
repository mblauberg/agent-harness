# EFFORT: agent fabric operational hardening

Updated: 11 July 2026
Status: awaiting final human acceptance

## Destination

Deliver the [operational-hardening contract](../specs/agent-fabric/architecture-assurance.md) from the
adjudicated remainder of the external review, without reopening the existing contracts or
racing the separately owned skill-portfolio effort.

## Route

- [x] Leg 1 — live review adjudication and primary-source verification
- [x] Leg 2 — approved operational-hardening contract and partitioned implementation design
- [x] Leg 3 — CI, bounded protocol and database packages in parallel
- [x] Leg 4 — trust/status/retention and receipt v2
- [x] Leg 5 — serial integration, migration/live regression and documentation
- [>] Leg 6 — independent review and bounded repair complete; human acceptance pending

## Ownership

- CI worker: `.github/**` and one namespaced CI policy test.
- Protocol worker: bounded NDJSON, daemon/client/adapter wire and focused tests.
- Persistence worker: migration 0003, SQLite maintenance/invariants and tests.
- Chair: trust/status/retention, receipt v2, shared integration, docs and receipt.
- Skill-portfolio pane: all unrelated skill changes; this effort does not edit
  or stage that lane.

## Invariants

- One SQLite mutation owner; no service split.
- No destructive pruning or trust broadening by inference.
- Projects narrow global/local authority; they never widen maxima.
- Existing provider activation and MCP communication remain live.
- No Git push, release or production promotion.

## Trail

- 11 July 2026: external review classified section-by-section against `f7a3240` and current primary documentation. Operational baseline found stale; CI, transport bounds, trust, database enforcement, receipt semantics and invariant testing remain valid.
- 11 July 2026: operational hardening became a separate crucial programme because the implemented lifecycle kernel explicitly excludes fabric reimplementation.
- 11 July 2026: implemented bounded protocol/resource admission, exact identity-bound machine trust, migration 0003, receipt v2, report-only retention/archive, status/doctor and repository assurance. Final gates: runtime 99 files/360 tests, harness 326 tests, evaluation 13/13, load 1/1 and zero production vulnerabilities.
- 11 July 2026: the migrated live daemon reports all five configured adapters active; five-seat MCP health, Codex↔Claude acknowledged round trip and real Claude/Codex/Agy/Cursor/Kiro spawn-turn-release smokes pass with exact output and unchanged isolated workspaces.
- 11 July 2026: native and Claude Code final reviews found no unresolved P0–P2 after repair. Auto-start/respawn, Git push and release remain separate human gates.
