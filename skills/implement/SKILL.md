---
name: implement
description: Use when implementing an approved feature, bugfix, refactor, migration, or dependency upgrade end-to-end through verification, independent review, bounded repair, documentation, and final human acceptance — especially "implement this autonomously", "take this spec to completion", or "review and fix until clean". Not for deciding requirements (scope), test-first coding alone (tdd), diagnosis only, or review without edits.
---

# Implement

Own the software profile from approved contract to verified human handoff.

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

1. Create the single canonical `delivery-run` receipt from
   `../deliver/templates/RUN.template.json`, set profile `software`, and follow
   [run-contract.md](references/run-contract.md).
2. Implement vertical slices with `tdd`. Use `diagnose` for discovered failures
   and `orchestrate` only when decomposition or independent coverage helps.
3. Run deterministic checks and map every acceptance criterion to evidence.
   When scope requires assurance, run `evaluate` and attach its passing receipt.
4. Invoke `code-review` read-only. Reviewer coverage follows the risk tier in
   `HARNESS.md`: fresh native and other-primary reviews are load-bearing;
   bonus families are opportunistic. Record adapter and actual family.
5. Repair blocking findings, then repeat verification and independent review.
   Maximum two repair cycles. After that, or on scope/design drift, stop and
   return to the human or `scope` with evidence.
6. Update owned documentation when behaviour, architecture, operations, or
   decisions changed. For substantial and higher runs, apply `session` context
   hygiene: refresh the recovery checkpoint, run the read-only audit, graduate
   durable findings and classify retained/ephemeral artifacts in `RUN.json`.
7. Validate with
   `"${AGENTS_HOME:-$HOME/.agents}/skills/deliver/scripts/validate_delivery.py" \
   .agent-run/<id>/RUN.json --workspace-root "$PWD" --verify-hashes`.
   Hand off only after the machine gate.
8. Human final acceptance is mandatory. Production promotion is a separate,
   explicitly authorised `release` action. After acceptance, failure or
   cancellation, terminalise an orchestrated run with
   `${AGENTS_HOME:-$HOME/.agents}/skills/orchestrate/scripts/run_dir_finalize.py`;
   an outer orchestrator `awaiting-human` transport result remains active and
   does not rename the canonical receipt state.

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
- `awaiting_acceptance` is the successful machine-gate state. Move the
  canonical receipt to `accepted` only after explicit human acceptance.
