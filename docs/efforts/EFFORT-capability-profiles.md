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

## Governance, gates and exclusions

Per the human directive of 2026-07-13, this effort runs under the autonomous
[chair charter](../agent-harness-comprehensive-review/CHAIR-CHARTER.md): a
codex `gpt-5.6-sol` chair with an Opus pair implements every lane, LLM-resolving
each decision (chair discretion or council vote) and recording it in the
[decision register](../agent-harness-comprehensive-review/decision-register.md).

- **The only human gate is PR review.** Nothing merges to `main` without a
  human approving the pull request; no direct pushes or admin-merge-over-red.
- **LLM-resolved (was human-gated):** the Lane A write-profile spec-amendment
  acceptance; the Step-3 containment-spike verdict; risk-tier and lane
  acceptance; and the Spec-05 close-out judgements (four-family review
  adjudication, 80×24 usability result) — each still *produced* to full rigor,
  only the accept decision moves from human to chair/council, then lands via PR.
- **Preserved boundaries (not delegated):** no network-egress profile, no
  external-effect enablement, no release/deploy, no production credential or
  registry mutation — anywhere in this effort. The chair pushes feature
  branches and opens PRs; it never ships. A lane that genuinely needs an
  external effect stops and asks the human. The write-profile containment spike
  is still executed adversarially (only its verdict is council-adjudicated).
  `.agent-run/AFAB-004` is never accessed.
- Spec-05 close-out items (live MCP round-trips, four-family review, 80×24
  usability evaluation, final acceptance) remain owned by
  [EFFORT-project-fabric-console.md](EFFORT-project-fabric-console.md), executed
  under the same charter governance.
