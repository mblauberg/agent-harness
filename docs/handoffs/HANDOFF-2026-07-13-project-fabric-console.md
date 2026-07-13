# Project Fabric Console implementation handoff

Status: active — consolidated checkpoint; implementation is not complete,
verified or accepted

Effort: project-fabric-console

Leg: Spec 01/04 semantic repair, modularisation and integrated runtime completion

Date: 13 July 2026

Consumed-at: pending

Supersedes: `HANDOFF-2026-07-12-project-fabric-console.md`

Approved baseline: `c2fc623`

Consolidation checkpoint: `85f4613` (descendant of merge `941a72f`)

Integration checkpoint: `392b96c`

Authority: local implementation, review, branch consolidation and authorised
worktree cleanup; no further push, release or deployment

## Goal and truth boundary

Finish binding Spec 05 v1.13, including its Spec 01/04 protocol and daemon
extensions, responsive Console, MCP agent fabric, lifecycle skills,
evaluations, load gates and four-family review. Stop for the human timed-
usability gate and explicit final acceptance.

The previous handoff's automated-completion status is stale. This handoff
replaces it.

Read `AGENTS.md`, `HARNESS.md`, `docs/specs/00-index.md`, Specs 01–05,
`docs/worktrees.md`, this handoff and the active effort map before dispatching
work.

Hard prohibition: never inspect, search, enumerate or otherwise access contents
under `.agent-run/AFAB-004`. If final receipt certification cannot be completed
through an approved non-content-reading interface, stop for explicit human
direction.

## Git and consolidation state

- Remote: `origin = https://github.com/mblauberg/provenant.git`.
- PR #6 was admin-merged despite failing checks. Its remote merge is
  `0cdda475f1d23e9de0554b21bf2aa90feb8c8e92`.
- The deleted PR topic ended at
  `15bedc90fcc5ace59c7a0a069c7f0cf7eceba1b4`.
- The local consolidation merge is `941a72f`; the research decision checkpoint
  is `85f4613`. The handoff/research commit follows both.
- Raw comprehensive-review research is preserved at `fe9d229`; reconciled
  review-pack history is preserved at `392b96c`.
- Every pre-consolidation topic branch was an ancestor of local `main` before
  authorised pruning. Only the primary worktree should remain.
- No unfinished implementation was pushed or released.

The consolidation preserves work; it does not certify semantic compatibility
or completion. Incorporated histories include:

- protocol contracts: `b330e74`;
- database baseline: `e28e2e7`;
- lifecycle domain: `fef6fd1`;
- Console hardening: `58d3f25`;
- Rust review-portal supervisor: `05c8405`;
- orchestration value gate: `97d74d9`;
- review-pack reconciliation: `657e99d`;
- retained lifecycle-rotation WIP: `a016e3d`; and
- draft Spec 01/04 amendment: `19368bc`.

The lifecycle-rotation WIP is reachable through history but intentionally
contributes no current-tree delta because it targeted the superseded custody
schema. Treat database, lifecycle, Console and portal code as preserved WIP
until reconciled against repaired normative specs with new tests.

## Binding product decisions

- Spec 05 v1.13 remains binding.
- `80x24` is the default/reference viewport, not a fixed terminal size.
- The Console must dynamically reflow, preserve state on resize, support a
  minimum usable `30x6`, and become clipped/inert below it while retaining
  quit/detach and terminal restoration.
- Current evidence favours the TypeScript cell-grid Console plus the narrow Rust
  native supervisor. Do not rewrite the whole TUI unless measurements prove the
  current runtime cannot meet deterministic responsiveness and safety gates.
- This is pre-release: remove obsolete compatibility paths instead of retaining
  legacy migrations, decoders or aliases.
- Fold continuity-routing research into existing owners and topic-based
  research references; do not create a normative Spec 06.
- Keep one chair per coordination run. Parallel writers require disjoint
  `.worktrees/<task-agent>` scopes and independently checkable returns.

The refreshed language and open-source comparison is
`docs/research/project-fabric-console-terminal-runtime.md`. Relevant design
references include Ratatui, Bubble Tea, FTXUI, OpenCode, Goose, mini-SWE-agent,
Aider and OpenHands. Borrow explicit client/server seams, stable event identity,
observable verification and inspectable histories; do not import another
harness wholesale.

## Frozen amendment audit

The independent frozen audit found no P0 and no other P0–P2 outside these nine
unresolved P1s. Do not call Spec 01 v0.36 or Spec 04 v1.31 accepted or
implementation-ready until all nine are repaired and freshly reviewed.

1. Receiptless direct-fresh rollback: reuse-final/open-loss fresh applies lack
   external authentication. Add an authenticated direct-fresh subject/batch and
   zero-receipt admitted-scope discovery.
2. Invalid retirement FK: the exact custody parent `UNIQUE` is missing. Carry
   finalized state/evidence and admission, proof, mutation and retirement
   evidence through plan → effect → result.
3. Review reservation pre-authority FKs point at a future linked-loss revision.
   Bind the planned tuple to the same-prepare linked effect; bind the revision
   only after authority/apply.
4. Batch and fresh authority can be crossed. Close batch arms, carry transition
   kind in apply, use a non-null/sentinel full chain, and enforce terminal-fresh
   plan equality.
5. Intent/completion does not close the effect set. Add kind-owner checks,
   intent-effect keys, declared effect membership/count and anti-extra
   enforcement.
6. A bare apply row currently counts as applied. Insert apply last and require
   an arm-specific post-state completeness trigger or marker.
7. Nullable heads can lie. Use canonical pointers/derived fields or complete
   core keys plus sentinels for scope and loss heads.
8. Fresh issue/source races and revocation/handoff can coexist. Add exact-source
   single-flight and mutually exclusive transition guards in both race orders.
9. Owner prose contradicts the lifecycle. Repair Spec 01 §32.20 and Spec 04
   §9.22 to include `commit-pending`, asynchronous prepare → append → authorize
   → apply, and `recovery-in-progress → open`.

## Specification-size requirement

At consolidation, Spec 01 is about 9,700 lines, Spec 04 about 8,450 and Spec 05
1,461. The human requires a hard maximum of 1,000 lines per spec file/module.

First repair and independently freeze the semantic amendment. Then mechanically
split Specs 01, 04 and 05 into canonical families:

- retain each existing root filename as a small normative manifest;
- place topic modules beneath same-name directories;
- hard-cap every manifest/module at 1,000 lines, with a soft target near 850;
- bind ordered module paths, hashes and family version;
- reject duplicate requirement IDs, broken links, missing modules, version
  drift, tampering and over-cap files;
- add a tested `scripts/check_spec_families.py` gate to the harness; and
- retain no legacy monolith copies or aliases.

A purely mechanical split need not change the semantic version. Any behavioural
change does.

## Verified evidence and known failures

No result below is final-main evidence.

- Before consolidation, `python3 scripts/check_harness.py` and
  `git diff --check` passed.
- The public-release gate fails because
  `runtime/agent-fabric-protocol/schemas/protocol.schema.json` is about
  6.06 MiB, above the 5 MiB limit. Compact deterministic generation; do not
  weaken the gate.
- Branch-local orchestration evidence reported 444 Python tests green plus
  harness/security/delivery checks and independent review.
- Branch-local lifecycle evidence reported 240 tests/type/build/harness checks
  green and a clean native review.
- The Rust portal branch reported 18 tests and a clean native review. Its README
  correctly keeps certifying capability disabled until daemon custody and
  confinement integration are proved.
- The merged Console has resize plumbing, but `responsiveModeFor` currently
  admits an interactive `strip` at 12x3. That contradicts the binding 30x6
  minimum and requires a first failing test plus repair.
- All branch results were invalidated as final evidence by consolidation.

PR #6 CI was not green:

- two Agent Fabric TypeScript/test/audit jobs failed around production Herdr
  composition resolving `@local/agent-fabric-protocol`; and
- one duplicated Console job breached the 10,000-row dynamic-resize load limit
  at roughly 5.28 seconds against a 5-second bound, while its duplicate passed.

Harness and Herdr jobs passed. The complete final-main runtime, evaluation,
load, audit, MCP and provider-review matrix has not run.

## Ordered continuation

1. Reopen live `main`; verify a clean status, this handoff, remote, branch and
   worktree inventory, and preservation of every incorporated commit.
2. Repair the nine Spec 01/04 P1s with executable SQL/codec/race fixtures where
   possible. Obtain a fresh exact native audit, then Claude Opus and Cursor
   review. Do not implement against an unfrozen contract.
3. Modularise Specs 01, 04 and 05 under the 1,000-line rule. Refresh the index,
   effort map, traceability and review-pack applicability.
4. Reconcile preserved runtime code through TDD in disjoint lanes:
   - compact protocol/schema generation and exact reads;
   - current squashed database plus lifecycle receipt authority;
   - Rust portal-supervisor daemon integration and confinement;
   - Console/Herdr projection, exact 30x6 boundary and dynamic resize; and
   - MCP seat/fabric round trips, lifecycle skills and evaluations.
5. Apply relevant comprehensive-review close-out:
   - F-007: record a real TypeScript SAST tool, version, scope and result;
   - F-006: keep traceability versions/status truthful;
   - F-018: retain the integrated orchestration value gate;
   - F-023: implement the authorised spec-family split;
   - F-041: retain live provider and human usability gates; and
   - update F-038/repository-name applicability after the Provenant rename.
   Do not adopt `proposals/` wholesale.
6. Repair PR CI failures and evaluate Dependabot upgrades in bounded TDD batches.
7. Run every deterministic gate on one clean final commit.
8. Run live daemon/MCP health and registered round-trip checks against the same
   project/session/run without exposing credentials.
9. Obtain fresh answer-bearing native, Claude Opus, Cursor Grok 4.5 High and Agy
   Gemini reviews through Fabric. Repair every substantiated P0–P2 and rerun
   affected gates.
10. Prepare the human 80x24 timed-identification evaluation and request explicit
    final acceptance.

## Final deterministic gates

Run from the final commit:

```sh
npm --prefix runtime/agent-fabric-protocol ci
npm --prefix runtime/agent-fabric-protocol run check

npm --prefix runtime/agent-fabric ci
npm --prefix runtime/agent-fabric run check
npm --prefix runtime/agent-fabric run test:evaluation
npm --prefix runtime/agent-fabric run test:load
npm --prefix runtime/agent-fabric audit --omit=dev --audit-level=high

npm --prefix runtime/agent-fabric-console ci
npm --prefix runtime/agent-fabric-console run check
npm --prefix runtime/agent-fabric-console run test:evaluation
npm --prefix runtime/agent-fabric-console run test:load
npm --prefix runtime/agent-fabric-console audit --omit=dev --audit-level=high

npm --prefix runtime/agent-fabric-herdr ci
npm --prefix runtime/agent-fabric-herdr run check
npm --prefix runtime/agent-fabric-herdr audit --omit=dev --audit-level=high

(
  cd runtime/agent-fabric-review-portal-supervisor
  cargo fmt --check
  cargo metadata --locked --offline --no-deps --format-version 1 >/dev/null
  cargo clippy --locked --offline --all-targets -- -D warnings
  cargo test --locked --offline
)

PYTHONPATH=. pytest -q
python3 scripts/check_harness.py
scripts/public-release-check
git diff --check
```

Then run the operations-runbook status/doctor and registered MCP health/round-
trip commands. Record exact commit, environment, counts, failures and repair
reruns. Older branch passes are not substitutes.

## Human gates

Only these remain genuine human gates:

1. Any material spec/one-way-door change beyond repair of the nine audited
   defects.
2. Any lifting of the `.agent-run/AFAB-004` prohibition or appointment of an
   authorised receipt verifier.
3. The human-recorded 80x24 timed-identification evaluation.
4. Explicit final acceptance.
5. Any later push, release, deployment, provider-login change or credential/
   registry mutation.

PR #6 acceptance and this local branch/worktree consolidation were already
authorised. They do not authorise another push or release.

## Exit condition

Do not mark this effort machine-complete or awaiting acceptance until one clean
final commit passes every deterministic, security, load, live MCP and four-
family review gate with no unresolved substantiated P0–P2. Do not mark it
accepted until the human usability report and explicit final acceptance are
recorded.
