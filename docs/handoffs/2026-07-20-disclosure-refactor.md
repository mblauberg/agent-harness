# Handoff: harness progressive-disclosure refactor

Work item: [#335](https://github.com/mblauberg/provenant/issues/335) (Ready).
The prerequisite PR train (#329, #331) has landed. Consume this handoff when
picking the work up; remove it (and its README entry) when the work is
In progress and the sweep result is recorded on the issue.

## Mission

Implement `docs/specs/harness/disclosure-refactor.md` (r3 — self-contained;
inlines all decisions and the full verdict/migration inventory). The spec is
the authority; this handoff is only continuity.

## Gate state you inherit

- Spec decisions D1–D15 user-approved 2026-07-20 (D14 accelerator custody and
  D15 docs custody added in the r3 amendment pass, same day). OD5 is
  **approved pending re-validation**: before any implementation, run the D11
  evidence sweep — re-verify every line-cited claim in the spec against
  then-current `main`. This handoff's validated base:
  `baseRevision: 5cc288aa45ad66b3168393c18bc68a354b1dc6bd`. Record the sweep
  result as a comment on #335 (clean → set In progress; contradiction → set
  Awaiting user, stop that row only).
- Review pressure for the effort: the other-primary leg is satisfied by two
  completed Codex audits (r2 paired-primary audit; r3 three-leg chaired
  review — receipts in `.agent-run/bootstrap-c0c659eead55/pair/claude/`,
  substance to be recorded on #335 per AC-R3). This arrangement is
  user-approved gate state; per-PR Codex review remains at your discretion
  for rows touching authority text. Fresh native review per PR is mandatory.
- Held-out comparative evals are waived (ADR-0014). Trigger fixtures and
  contract tests are not.

## Execution shape

Six PRs per the spec work plan, each through the normal workflow
(`docs/runbooks/github-workflow.md`, worktrees under `.worktrees/<task-agent>`):

0. Docs custody (D15): spec, this handoff, ADR-0014, both index entries.
   **This lands first** — a worktree cut from main will not otherwise contain
   the spec it implements.
1. Constitution strip + installer fixtures (full AC-P2 matrix).
2. Reference rule + migration-manifest fixture/test + resolver fixture.
3. Orchestrate prune per the manifest (migration steps 1–5; includes the
   `docs/research/README.md` index entry — that file is now a curated index
   with normative-owner routing, not a dump).
4. Governance (MAINTAINING.md amendments incl. the D9 GitHub authority
   clause).
5. Accelerator custody (D14): import `~/.claude/workflows/*.js` sources under
   `workflows/`, installer management, private-path repoints, bounded
   alignment refresh. Any time after PR2.

Gates per PR: AC-P1 set plus the spec's other AC-P checks as applicable.

## Known snags you can avoid

- Fabric: bootstrap-authority tasks cannot be claimed and the steer path
  degrades to manual pane wake; the working roundtrip recipe (incl. the
  `participantAgentIds` requirement and authority-ID format) is in
  `pair/claude/chair-receipt-spec-audit-r2.md`; usability gaps tracked as
  #336 — not part of #335.
- `herdr pane layout --current` from a non-Herdr-spawned shell resolves to
  the user's focused pane — target explicit IDs from `HERDR_*` env.
- Catalogue: 7,341/8,000 chars at the r3 base (binding measure:
  `scripts/check-harness`), only 259 under the 7,600 target — PR3 must not
  add entries.
- `docs/evals/skill-portfolio-2026/` was restructured (predecessor/
  directory); eval-fixture edits must preserve that layout.

## First actions

1. `session` intake; read the spec end-to-end, then #335.
2. Open PR0 (docs custody).
3. Run the D11 sweep against then-current main; record on #335.
4. Branch for PR1 in a worktree; proceed.
