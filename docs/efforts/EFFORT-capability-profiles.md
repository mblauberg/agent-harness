# EFFORT: capability-compiled execution authority

Updated: 13 July 2026
Status: active. Lane B implemented and locally verified; publication stopped
after `main` advanced and exposed the already-known Lane D/Rust failures. Lane
C characterisation goldens are integrated; V2 cutover remains blocked on Lane
A integration and a non-overlapping runtime baseline.

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
  binding. Nothing was merged or released to `main`; the rebased artifact
  requires fresh review and exact acceptance before promotion resumes.

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
- No standing network-egress, external-effect, release or push authority is
  created by this effort. The exact-digest Lane B GitHub authority granted on
  2026-07-13 is confined to its accepted delivery and release receipts.
- Spec-05 close-out items (live MCP round-trips, four-family review, 80x24
  human usability evaluation, final acceptance) remain owned by
  [EFFORT-project-fabric-console.md](EFFORT-project-fabric-console.md), not
  this effort.
