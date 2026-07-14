# Receipt portability diagnosis

Date: 2026-07-14
Scope: comprehensive-review full-harness baseline; source-read-only diagnosis

## Result

The full harness fails for two independent reasons introduced by programme
integration, not by the W007 Rust source or W017 semantic source:

1. ignored operational receipts were force-added under `.agent-run/`; and
2. the tracked autonomous-lab README contains the bootstrap machine's absolute
   home path.

The safe default is to keep exact delivery receipts private and ignored under
`.agent-run/<id>/`, as the delivery contract requires, while committing their
durable conclusions to project-owned decisions, findings, fixtures, context
digests and the final PR evidence index. Do not weaken the release checker to
permit a special tracked run directory.

Council decision D-026 adopts that repair with three additions: projected
evidence must be self-verifying from tracked source/fixtures and the eventual
publication SHA; the regression suite must prove both zero tracked run paths
and an effective history scan; and the still-unpushed integration history must
be reconstructed into one sanitized publication commit before its first push.
The latter is deferred to W014 because it invalidates every SHA-bound final
gate and review.

## Reproduction and call chain

At integration head `5166328`, `scripts/check-harness` reached the spec-family,
skill and routing gates, then failed at `scripts/check-harness:42`, which always
invokes `scripts/public_release_check.py`.

The release checker has forbidden every tracked `.agent-run/` path since its
initial portable-release commit (`a39c7b7`):

- `scripts/public_release_check.py:29-37` declares `.agent-run/` a forbidden
  prefix;
- `scripts/public_release_check.py:56-70` obtains the actual Git index and
  rejects every matching path before inspecting content; and
- `.gitignore:7` plus `tests/test_harness_contract.py:139-140` require the
  default run directory to stay ignored.

The live failures covered 22 CAPA-001 files already force-added by `b618c78`
and seven W007 files added by `50065a1`/`5166328`. Three of those review
artifacts also contain personal absolute paths, so moving or allowing the raw
files without sanitisation would still fail `scripts/public_release_check.py:85-86`.

The generated lab README independently fails because
`skills/autonomous-lab/templates/README.template.md:62-68` says the operator is
already in the lab root but still inserts `{{LAB_DIR}}` twice. Bootstrap
canonicalises that token to an absolute path at
`skills/autonomous-lab/scripts/bootstrap-lab.sh:1177-1181`. The installed
instance exposes the machine path at `lab/README.md:67-68`.

The ordinary harness invokes only the current-tree check. The documented
pre-publication `--history` mode instead uses `git rev-list --all` and
`git log --all`; untracking the receipts therefore does not remove their
personal paths from reachable local branch history. It also makes `--all` the
wrong proof surface in a multi-worktree programme with deliberately private
lane refs. The repair needs a fail-closed explicit publication-range mode that
preserves the existing all-ref mode but can prove only the commits selected for
the eventual push.

## Contract reconciliation

The apparently conflicting instructions separate cleanly:

- `KICKOFF.md:63-68` requires each leg to update its exact
  `.agent-run/<id>/RUN.json` receipt; it does not say to force-track the ignored
  operational directory.
- `CHAIR-CHARTER.md:82-85` requires the final PR description to carry a living
  evidence index including per-lane receipt evidence.
- `HARNESS.md:94-104` requires durable project knowledge in project-owned docs
  and machine-readable receipts for substantial runs; it does not make the
  operational receipt itself a public source artifact.
- W017's committed contract is explicit at
  `lab/context/net-current-consolidation-tdd-contract.md:297-298`: tracked
  project docs/fixtures carry durable truth, while the private receipt is
  supporting evidence.

Therefore the operational receipt remains exact, local and validator-readable;
its durable conclusions, artifact digests, review verdicts, tested commits and
pending gates are projected into tracked governance/context and ultimately the
PR body. The raw private directory is not a release artifact.

## Minimum repair contract

1. Remove only the already-tracked `.agent-run/CAPA-001/**` and
   `.agent-run/W007/**` entries from the Git index, preserving the ignored local
   files and their exact hashes. Never stage W017 or later run directories.
2. Clarify KICKOFF/charter operating text that exact receipts remain private
   under `.agent-run`, while curated durable facts and the PR evidence index are
   tracked. Do not change receipt schema, validator or retention semantics.
3. Make the autonomous-lab README portable: because the operator is already in
   the lab root, the generated prompt should say "this lab root" and read
   `OPERATING_MANUAL.md` relatively. Repair both the source template and the
   bootstrap script's inline fallback, then regenerate/correct this lab's
   README.
4. Add regression coverage that a delivery-shaped `RUN.json` is still rejected
   when presented as a tracked `.agent-run` path, `git ls-files` returns zero
   `.agent-run/` entries, and the README template/bootstrap output contains no
   substituted personal home path.
5. Add a fail-closed publication-range mode alongside the existing all-ref
   mode. Validate the resolved selected HEAD tree against the complete public-
   tree policy independently of the checkout; reject forbidden pathnames in
   every selected commit; and scan selected tree content, full commit messages
   and author emails for home/secret patterns. Synthetic-repository tests must
   show a clean selected range ignores a tainted sibling ref, then reject a
   tainted selected tree, an add-then-delete private receipt, a selected HEAD
   missing a required file and a message-only home/token leak. Document this as
   the pre-push command. D-028 further requires one raw-object endpoint for
   range and history proof: replacement objects disabled, inherited Git
   redirection sanitized, grafts and shallow views neutralized and rejected,
   ancestry enumerated from raw commit parent headers, and raw endpoint/tree/
   path/message/author evidence bound together. Repository-native
   content-addressed alternates remain permitted.
6. Run the focused release/bootstrap tests, `scripts/public_release_check.py`,
   `scripts/check-harness`, and `git diff --check`. Record the exact retained
   local receipt hashes before and after index removal.
7. At W014 only, after every lane and the final tracked tree are accepted,
   recheck the absent remote branch and current `origin/main`; record `BASE`,
   `OLD` and `TREE` privately; construct one commit from exactly `TREE` with
   parent `BASE`; prove exact tree/diff/parent/non-ancestry; atomically replace
   only the still-unpushed local integration ref using expected `OLD`; and keep
   recovery in that ref's reflog plus the private receipt, not another ref.
   Rerun and rebind every final deterministic, security, native, Opus and hosted
   gate to the new SHA before one exact non-force push. If `origin/main` moved,
   integrate and reaccept it before reconstruction.

## Rejected alternatives

- **Allowlist CAPA/W007/W017 under `.agent-run`.** This weakens a global
  portability/privacy boundary, retains ignored-but-force-added state, and
  immediately exposes existing absolute paths. A per-run allowlist also makes
  every future receipt a policy edit.
- **Move raw run trees into tracked `docs/`.** Raw operational artifacts include
  machine paths and mixed retention classes. Moving them would require broad
  sanitisation, digest rewrites and a second pseudo-canonical receipt tree.
- **Delete receipts after untracking.** Exact local receipts remain needed for
  validation, hosted-gate updates and final PR evidence synthesis; index-only
  removal is sufficient.

This repair changes no product/runtime/spec authority and requires no external
effect. Because it reconciles a security/retention boundary with a human
kickoff directive, the chair must obtain the standing Opus other-primary vote
before implementation; the unavailable Fabric bonus leg remains recorded. The
private Opus vote
(`sha256:d61d91d965ba315d4a3901db850aa6443db75c277db8f8889416783259682198`)
approved the repair spine and required history and auditability deltas; its
corrected private addendum
(`sha256:5a6222fc7b87b35e33820cb38b9ca87ef7a9a4f0e582efbef9a2598edce77afd`)
and a fresh private native audit
(`sha256:b01b8be85ec83702aa2c7c170fa3395b1485b4b8127af71f5c9b419305931d31`)
both require sanitized option B and prohibit publishing the tainted branch
before a squash.

Native repair-1 re-audit (`sha256:45dfcf4fcc7f74b9a5dcc18f4dc4c89e4f27ebffc211b12e688d5b5203793d66`)
and Opus raw-object adjudication
(`sha256:53f306275171b6423579314b1fa48b206e155f3bee9423e60323d40a729a84f5`)
then independently proved that replacement refs, grafts and shallow/env
overrides can virtualize that range proof. D-028 adopts their combined
hardened-endpoint contract as W018's final repair cycle.
