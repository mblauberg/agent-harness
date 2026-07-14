# Assignment envelope: pair-codex independent pack review

- task: provenant-simplification-pack-review-2026-07-14
- stage: independent cross-family review
- chair: claude (Fable 5, herdr pane w5:p14, session 8251ab45)
- owner (this stage): pair-codex (gpt-5.6-sol, effort xhigh; model-route receipt: adapter=codex alias=flagship role=pair-review status=ok)
- peer: chair runs parallel native verification with Opus 4.8 / Sonnet 5 subagents
- base_revision: main @ 1ddfe24 (dirty: docs-only changes; other agents active in separate worktrees — do not touch `.worktrees/`, do not run git checkout/restore/stash)
- transport: FABRIC-ROUNDTRIP-UNAVAILABLE — reply via named artifact below; chair collects with bounded pane/status reads

## Objective

Independently review `docs/provenant_simplification_implementation_pack_2026-07-14/`
(the kickoff file plus `docs/provenant-simplification/00`–`20`) and answer:

1. **Accuracy** — do its baseline observations and repository change map match the
   live repo (`HARNESS.md`, `AGENTS.md`, `scripts/`, `skills/`, `config/`,
   `docs/specs/`, `docs/adr/`, `docs/efforts/`)? Cite file:line for every
   discrepancy.
2. **Coherence** — does the pack make sense for this project? Internal
   contradictions, over-engineering, conflicts with accepted ADRs (0001–0008) or
   active efforts, missing pieces, and anything that contradicts the pack's own
   thin-kernel/simplification objective.
3. **Supersession** — the plan is for `docs/agent-harness-comprehensive-review/`
   and `docs/provenant-re-review-2026-07-13/` to be DELETED with the pack as the
   sole surviving implementation plan. Identify anything in those two directories
   that is materially valuable and NOT yet reflected in the pack (decisions,
   constraints, schemas, findings) — the chair is doing the same with native
   subagents, so prioritise your own judgement over completeness.
4. **Spec split advice** — `docs/specs/01` (9731 lines) and `04` (8456 lines) and
   `05` (1465 lines) must be reworked into files under 1000 lines each and aligned
   with the pack. Propose a concrete split/rework structure.

## Authority

- Source: read-only across the repository.
- Write: ONLY `docs/provenant_simplification_implementation_pack_2026-07-14/review/pair-codex-*` files.
- Prohibited: edits elsewhere, branch/worktree creation, git state mutation, network side effects, deleting anything.

## Subagents

Use native Codex subagents for fan-out; route them to **gpt-5.6-luna** at
**xhigh** (use **max** only for isolated single-shot verification calls — do not
run max in a loop). Keep subagent outputs in your review directory or summarise
inline.

## Output contract

Write findings to
`docs/provenant_simplification_implementation_pack_2026-07-14/review/pair-codex-findings.md`:

- verdict per question above;
- numbered findings: severity (P0 blocker / P1 major / P2 minor), claim, evidence
  file:line, suggested fix;
- unresolved questions for the chair;
- a final `STATUS: complete|partial` line.

## Stop and budget

Stop after writing the findings file; do not begin edits or fixes. If blocked
>10 min on any single check, record it as unresolved and move on. Target one
working pass, not exhaustive re-derivation.
