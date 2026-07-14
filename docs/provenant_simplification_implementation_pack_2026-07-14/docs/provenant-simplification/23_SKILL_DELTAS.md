# Skill deltas

Status: proposal extracted from the 2026-07-13 re-review, not yet ratified. This is the per-skill diff for WP6 ("Skill and documentation simplification", `09_WORK_PACKAGES_AND_SEQUENCE.md`). These are changes in responsibility, not complete replacement skill files.

Adopting these enacts `21_DECISION_DELEGATION.md` (Class A/B/C, soft decisions, PR topology) and `22_DOCUMENT_GOVERNANCE.md` (canonical owner, `check-docs`) at the skill layer.

## `engineering-docs`

Add:

- classify the fact before creating a file;
- update an existing canonical owner rather than fork it;
- default specs to unnumbered domain families <=1,000 lines;
- use Git history as default archive;
- delete superseded working docs after reference/evidence checks;
- select exactly one work store;
- run `check-docs`.

Remove or change:

- numbered spec fallback;
- contiguous-number requirement for specs;
- move-never-delete default;
- `docs/STATE.md` as normal when Fabric is available.

## `scope`

Produce/update:

1. project governance/delegation charter;
2. current spec modules;
3. ADRs only for material decisions;
4. clean vertical-slice issues;
5. preliminary agent and PR topology.

Use decision packets rather than strictly one question per round. The human approves the envelope and decision table; downstream reversible deltas may be delegated.

## `implement`

Replace "scope/design drift returns to human" with:

- Class A: update issue/plan, proceed;
- Class B: chair/council resolution, update spec/issue/PR, raise soft decision, proceed;
- Class C: hard human gate.

Require issue-backed work for substantial implementation when a configured work store exists.

## `orchestrate`

Add:

- derive PR topology from the task dependency/conflict graph;
- maintain one owner for central specs/indexes/generated files;
- permit issue creation inside collaboration authority;
- report soft decisions without blocking;
- do not require PRs for non-GitHub or project-policy direct-commit work.

## `session`

Move substantial session continuity to run-owned state. After consumption, promote durable content and delete the handoff unless evidence retention requires it.

Fresh sessions read: project instructions/governance; the issue; linked specs/ADRs; live Fabric state; one active handoff only if required.

## `work-map`

Make this a fallback or generated initiative summary:

- never canonical task state;
- use only when no issue tracker/project view exists;
- derive from issues where possible;
- delete/archive after initiative closure;
- do not duplicate per-issue acceptance/status.

## `code-review`

Add document-governance lenses:

- duplicate canonical owner;
- stale policy/status;
- spec/ADR/issue boundary;
- unlinked scope delta;
- PR conflict/stack validity;
- deletion/pruning completeness.

## `release`

Keep GitHub issue/PR collaboration permissions separate from release/deploy authority. An agent authorised to create issues or open PRs is not authorised to merge, publish or deploy.
