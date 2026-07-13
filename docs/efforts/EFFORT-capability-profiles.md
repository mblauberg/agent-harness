# EFFORT: capability-compiled execution authority

Updated: 13 July 2026
Status: active — characterisation goldens integrated; V2 cutover blocked on
accepted Lane A/B integration and a non-overlapping runtime baseline

## Destination

Deliver ADR [0002](../adr/0002-capability-compiled-execution-authority.md):
provider-neutral authority profiles compiled into native settings so managed
headless sessions can implement inside one owned worktree, with containment
proven adversarially before any write profile ships. Direct V2 cutover, no
backwards compatibility. Scope, evidence and challenge history live in
[docs/agent-harness-comprehensive-review/SCOPING-SESSION.md](../agent-harness-comprehensive-review/SCOPING-SESSION.md)
and the [Step-1 work package and Step-3 containment
checklist](../agent-harness-comprehensive-review/challenges/codex-pair-round2.md)
(both human-approved). Risk tier: crucial.

Parallelisation constraint: one chair, disjoint write scopes per lane. Lane C
must not land `AuthorityEnvelopeV2` against an unfrozen spec contract (Lane A
freeze first). Each leg runs as its own fresh-session `/implement` (or
spec-edit) leg, digest-bound to the ADRs and this map.

## Route

- [ ] Lane A — spec authority: fresh anchored amendment audit; repair the nine
  P1 leads from
  [HANDOFF-2026-07-13-project-fabric-console.md](../handoffs/HANDOFF-2026-07-13-project-fabric-console.md);
  freeze Specs 01 v0.36/04 v1.31; spec-family split (≤1,000-line modules,
  `check_spec_families.py` gate); draft and human-approve the write-profile
  spec amendment (Specs 01/05 currently mandate read-only)
- [ ] Lane B — foundations/build: root npm workspace + single lockfile
  (F-011; fixes `@local/agent-fabric-protocol` resolution and the red CI
  legs); compact protocol schema generation under the 5 MiB release gate;
  enable branch protection with required checks on `main` (F-036 quick win)
- [ ] Lane C — Step 1 authority contract: characterisation goldens of the
  current read-only projection (may start immediately; no behaviour change);
  then `AuthorityEnvelopeV2` in protocol, delivery→Fabric mapper, direct V2
  cutover of all callers/tests/stored state (no dual parser), after Lane A
  freezes; re-run the seam diff after Lane B lands
  - [x] Characterisation goldens of the current read-only projection (done
    2026-07-13, commit `6748ceb`)
  - [ ] Atomic `AuthorityEnvelopeV2` direct cutover — BLOCKED; resume from
    [HANDOFF-2026-07-13-capability-profiles-v2.md](../handoffs/HANDOFF-2026-07-13-capability-profiles-v2.md)
    only after the handoff's A/B/runtime gates pass
- [ ] Lane D — runtime reconciliation: repair the failing fabric test families
  (database baseline drift, lifecycle custody, Herdr FKs, MCP vocabulary,
  wrapper manifest) via TDD in disjoint lanes; blocked by Lanes A and B
- [ ] Step 2 — pure admission extraction into `AuthorityCompiler`
  (read-only behaviour unchanged); starts after Lane C
- [ ] Step 3 — one-provider write pilot behind the pre-approved adversarial
  containment spike (worktree/symlink/git/network/settings/secret/lifecycle
  matrix; provider chosen by evidence)
- [ ] Step 4 — second provider to the same gate, then provider-action
  structural extraction from the merged `ProviderActionDispatchInputV1` shape

## Deferred registry (decided, not scheduled here)

- HARNESS.md coverage-table amendment + Spec 05 review-profile amendment for
  risk/oracle-adjusted review (ADR 0008) — with Lane A or a following docs leg.
- AGENTS.md style-policy refinement ($caveman split, ADR 0008 companion) and
  scope decision-packets skill edit (F-017); architecture-review skill
  promotion (D-008) — skill-authoring legs.
- Backlog-item schema publication (ADR 0006); retention class-tagging start
  (ADR 0007) — docs/schema legs after tranche 1 begins.
- Queue controller, intake kernel, routing outcome calibration (F-030),
  governed deletion machinery, replay/time-travel Console work — after the
  write pilot proves out.

## Human gates and exclusions

- Spec amendment approval (Lane A) before any write-capable contract lands.
- Containment-spike verdict review before the first write pilot (Step 3).
- No network egress profile, no external-effect enablement, no release/push
  authority anywhere in this effort.
- Spec-05 close-out items (live MCP round-trips, four-family review, 80x24
  human usability evaluation, final acceptance) remain owned by
  [EFFORT-project-fabric-console.md](EFFORT-project-fabric-console.md), not
  this effort.
