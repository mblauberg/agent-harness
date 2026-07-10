---
name: implement
description: Use when implementing an approved feature, bugfix, refactor, migration, or dependency upgrade end-to-end through verification, independent review, bounded repair, documentation, and final human acceptance — especially "implement this autonomously", "take this spec to completion", or "review and fix until clean". Not for deciding requirements (scope), test-first coding alone (tdd), diagnosis only, or review without edits.
---

# Implement

Own an ordinary software implementation from an approved contract to a verified human
handoff. Claude Code and Codex are equal operators; provider workflows are
accelerators, not the lifecycle source of truth.

## Entry gate

Before implementation, require:

- approved scope, non-goals and acceptance criteria;
- costly-to-reverse design decisions approved or explicitly parked;
- build ceiling and write/external authority known;
- risk/authority profile from `config/risk-policy.json`, including the minimum
  tier, bounded paths, disclosure, secrets and external-action constraints;
- whether stochastic/judgement-bearing behaviour requires `evaluate`.

If these are missing, route to `scope`. Do not infer owner decisions.

For active service/safety impact, `mode: expedited-incident` may use a
human-approved containment spec and parallel verification/review. It never
waives authority or gates and must name a normal follow-up reconciliation run.

## Loop

1. Start `RUN.json` from [RUN.template.json](templates/RUN.template.json); follow
   [run-contract.md](references/run-contract.md).
2. Implement vertical slices with `tdd`. Use `diagnose` for discovered failures
   and `orchestrate` only when decomposition or independent coverage helps.
3. Run deterministic checks and map every acceptance criterion to evidence.
   When scope requires assurance, run `evaluate` and attach its passing receipt.
4. Invoke `code-review` read-only. Reviewer coverage follows the risk tier in
   `HARNESS.md`: fresh-context native reviewers and the other primary are
   load-bearing; xAI, Gemini and other bonus families run opportunistically in
   parallel and never replace the primary pair. Record adapter and actual
   provider family separately.
5. Repair blocking findings, then repeat verification and independent review.
   Maximum two repair cycles. After that, or on scope/design drift, stop and
   return to the human or `scope` with evidence.
6. Update owned documentation when behaviour, architecture, operations, or
   decisions changed. For substantial and higher runs, apply `session` context
   hygiene: refresh the recovery checkpoint, run the read-only audit, graduate
   durable findings and classify retained/ephemeral artifacts in `RUN.json`.
7. Run `${AGENTS_HOME:-$HOME/.agents}/skills/implement/scripts/validate_run.py RUN.json`.
   Hand off only when the machine gate
   passes and unresolved blockers are empty.
8. Human final acceptance is mandatory. Production promotion is a separate,
   explicitly authorised `release` action. After acceptance, failure or
   cancellation, terminalise an orchestrated run with
   `${AGENTS_HOME:-$HOME/.agents}/skills/orchestrate/scripts/run_dir_finalize.py`;
   awaiting-human runs remain active.

## Authority and completion

- Reviewers are source-read-only. They may write only assigned run artifacts;
  partition source writers or use one serial applier.
- Missing worker/reviewer legs are explicit failed or unavailable records,
  never silently filtered out. Missing load-bearing primary coverage blocks;
  missing bonus-family output does not.
- Objective evidence outranks reviewer confidence; reviewer conclusions are
  adjudicated, not voted.
- Routine micro-edits need not create `RUN.json` unless requested. Substantial
  and higher changes do.
- `awaiting-human` is a successful machine-gate state, not completion. Mark
  `complete` only after explicit human acceptance.
