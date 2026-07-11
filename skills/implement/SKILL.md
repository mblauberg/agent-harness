---
name: implement
description: "Use for an approved software change through verified implementation, independent review, bounded repair, and human acceptance. Not for unsettled scope, diagnosis-only, read-only review, or release."
---

# Implement

Own the software profile from approved contract to verified handoff.

## Entry gate

Require:

- approved scope, non-goals and acceptance criteria;
- costly-to-reverse design decisions approved or explicitly parked;
- build ceiling and write/external authority;
- risk/authority profile from `config/risk-policy.json`, including the minimum
  tier, bounded paths, disclosure, secrets and external-action constraints;
- whether stochastic/judgement-bearing behaviour requires `evaluate`.

If missing, use `scope`; never infer owner decisions.

For active service/safety impact, `mode: expedited-incident` may use an approved
containment spec and parallel verification/review. It never waives gates or
authority and must name a normal reconciliation run.

## Loop

1. Create the single canonical `delivery-run` receipt from
   `../deliver/templates/RUN.template.json`, set profile `software`, and follow
   [run-contract.md](references/run-contract.md).
2. Keep an adaptive plan. Per slice use `tdd` for changed observable behaviour,
   `refactor` for approved behaviour-preserving structure and `diagnose` for an
   unknown cause. Migrations may need behaviour tests and equivalence evidence.
   Use `orchestrate` only when decomposition or independent coverage helps;
   revise topology/order inside authority as evidence changes.
   For a version-sensitive external interface or migration, apply
   [source grounding](references/source-grounding.md) and
   [migration compatibility](references/migration-compatibility.md).
3. Run deterministic checks and map every acceptance criterion to evidence.
   When scope requires assurance, run `evaluate` and attach its passing receipt.
4. Invoke `code-review` read-only. Reviewer coverage follows the risk tier in
   `HARNESS.md`: fresh native and other-primary reviews are load-bearing;
   bonus families are opportunistic. Record adapter and actual family.
5. Repair blocking findings, then repeat verification and independent review.
   Maximum two repair cycles. After that, or on scope/design drift, stop and
   return to the human or `scope` with evidence.
6. Update owned documentation when behaviour, architecture, operations or
   decisions change. For substantial+ runs apply `session`: refresh the
   recovery checkpoint, audit context, graduate durable findings and classify
   retained/ephemeral artifacts in `RUN.json`.
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
- Routine minor work may continue automatically without `RUN.json` unless
  requested. Substantial+ starts a fresh implementation session bound to
  approved digests.
- `awaiting_acceptance` is the successful machine-gate state. Move the
  canonical receipt to `accepted` only after explicit human acceptance.
