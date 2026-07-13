# EFFORT: capability-compiled execution authority

Updated: 13 July 2026
Status: active. Lane B is implemented, locally verified and authorised for
promotion through PR #7 after rebasing over current `main`. Lane D and Rust CI
reconciliation remain deferred. Lane C characterisation goldens are integrated;
V2 cutover remains blocked on Lane A integration and a non-overlapping runtime
baseline.

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
  `check_spec_families.py` gate); draft and **council-resolve** the write-profile
  spec amendment (Specs 01/05 currently mandate read-only; acceptance is now
  LLM-resolved per the charter, no human stop)
  - [x] Anchored amendment audit with a durable receipt
    ([`docs/specs/amendment-audit-2026-07-13.md`](../specs/amendment-audit-2026-07-13.md));
    8/9 leads substantiated (lead 4 chair-adjudicated, its plan-equality
    sub-clause refuted), 10 missed defects found, 11 reproduced by fixtures
  - [x] Complete repairs landed: MF04-1 (P0), MF04-2, lead 9, lead 2 FK-mismatch
  - [ ] Structural repairs (leads 1,3,4,5,6,7,8; lead-2 evidence-carry;
    MF04-3/4/5/6; MF01-1/3/4), freeze, spec-family split, write-profile amendment
- [x] Lane B — foundations/build: root npm workspace + single lockfile
  (F-011; fixes `@local/agent-fabric-protocol` resolution and the red CI
  legs); compact protocol schema generation under the 5 MiB release gate;
  propose branch protection with required checks on `main` (F-036 quick win)
  - [x] One root lockfile, workspace links, dependency-ordered builds,
    TypeScript project references and root check/test/audit commands
  - [x] Clean-checkout build and `scripts/agent-fabric status` startup proof
  - [x] Compact deterministic protocol schema below the unchanged 5 MiB gate
  - [x] Root-lock CI caching, protocol resolution and duplicate push/PR repair
  - [x] Human-run `gh api` required-checks ruleset proposal
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
- [ ] Lane D — runtime reconciliation: repair the failing Fabric test families
  via TDD after Lane B integration. Reproduction on the Lane B rebase over
  `main@24ceb83` passed 149 Fabric files/1,054 tests and failed 30 files/162
  tests with 14 unhandled errors. The residual families and direct-cut route
  are:
  - the current baseline intentionally removed predecessor
    `model_routing_evidence`/`cross_family_review_evidence` stores and APIs,
    while runtime writers, receipt schemas and projectors still use them;
    remove those predecessor surfaces and project current route/review
    evidence instead of restoring compatibility tables;
  - `lifecycle_rotation_custody` is a new custody identity and state machine,
    not an `action_id` to `provider_action_id` rename; cut the old runtime
    prepare/replay/unreconciled flow and acceptance probes directly to the
    current custody contract;
  - `provider_actions` now requires a canonical
    `provider_action_pair_preflights` parent. Add one atomic helper and migrate
    all production action writers; repair positional 24-value fixtures with
    explicit columns and preflight parents;
  - the MCP registry is current, but the hand-maintained authority enum lacks
    14 current operations and several Fabric callers still send predecessor
    provider-action shapes;
  - both Claude and Codex checked-in adapter closure manifests are stale after
    protocol resolution exposed their full generated dependency sets.
- [ ] Rust CI reconciliation: Linux clippy has platform-specific cfg,
  conversion and credential-field lints; macOS portal relay has two-second
  helper deadlines plus one unbounded broker accept. Keep this separate from
  Lane B's build graph and prove it on both hosted targets.
- [ ] Step 2 — pure admission extraction into `AuthorityCompiler`
  (read-only behaviour unchanged); starts after Lane C
- [ ] Step 3 — one-provider write pilot behind the pre-approved adversarial
  containment spike (worktree/symlink/git/network/settings/secret/lifecycle
  matrix; provider chosen by evidence)
- [ ] Step 4 — second provider to the same gate, then provider-action
  structural extraction from the merged `ProviderActionDispatchInputV1` shape

## Lane B required-checks proposal

Not applied. Run only after the Lane D and Rust CI failures are green; applying
it earlier intentionally blocks updates to `main`.

```sh
gh api --method POST repos/mblauberg/provenant/rulesets \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  --input - <<'JSON'
{
  "name": "Protect main with required CI",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {
      "type": "required_status_checks",
      "parameters": {
        "do_not_enforce_on_create": false,
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          {"context": "Harness policy and Python tests"},
          {"context": "Agent fabric TypeScript, tests and audit"},
          {"context": "Agent fabric Console, evaluation, load and audit"},
          {"context": "Agent fabric Herdr adapter and audit"},
          {"context": "Review portal supervisor (ubuntu-latest)"},
          {"context": "Review portal supervisor (macos-15)"}
        ]
      }
    }
  ]
}
JSON
```

## Lane B integration checkpoint

- Build commit `6d88713` rebases the reviewed Lane B change on
  `main@24ceb83`, including Lane C's read-only characterisation goldens.
- Rebase verification passed clean install, root clean/build, deterministic
  schema generation/check, all workspace typechecks, the six repository CI
  policy tests and the unchanged public-release gate. The generated protocol
  schema is 2,061,826 bytes.
- The clean-checkout daemon/status proof, Protocol 46 files/785 tests, Herdr
  10 files/45 tests, Console 20 files/259 tests, audits and 458-test harness
  gate remain the accepted Lane B evidence. The full Fabric failures above
  are semantic and unchanged by the workspace migration.
- The first accepted artifact (`2db4f5a`) was pushed to draft PR
  [#7](https://github.com/mblauberg/provenant/pull/7). Promotion stopped when
  remote `main` advanced, invalidating its exact ancestry and acceptance
  binding. The human explicitly re-authorised conflict resolution and merge of
  the rebased artifact on 13 July 2026; PR #7 is the canonical promotion state.

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
- **Preserved boundaries (not delegated):** no standing network-egress profile,
  external-effect enablement, release/deploy, or production credential/registry
  mutation is created by this effort. The chair pushes the single integration
  branch and opens the single PR; it never ships. A lane that genuinely needs an
  external effect stops and asks the human. The write-profile containment spike
  is still executed adversarially (only its verdict is council-adjudicated).
  `.agent-run/AFAB-004` is never accessed.
- Lane B foundations landed via PR #7 (root workspace, compact protocol schema,
  CI). The exact-digest Lane B GitHub authority granted on 2026-07-13 is confined
  to its accepted delivery/release receipts and does not widen this effort's
  standing authority; the charter's single-branch push + PR authority is the
  sanctioned path from here.
- Spec-05 close-out items (live MCP round-trips, four-family review, 80×24
  usability evaluation, final acceptance) remain owned by
  [EFFORT-project-fabric-console.md](EFFORT-project-fabric-console.md), executed
  under the same charter governance.
