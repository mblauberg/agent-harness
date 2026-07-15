---
name: implement
description: "Use for an approved software change through verified implementation, independent review, bounded repair, and user acceptance. Not for unsettled scope, diagnosis-only, read-only review, or release."
---

# Implement

## Entry gate

Require:

- approved scope, non-goals and acceptance criteria;
- costly-to-reverse decisions approved or expressly parked;
- build ceiling and write/external authority;
- `config/risk-policy.json` risk/authority profile: minimum tier, bounded paths,
  disclosure, secrets and external-action constraints;
- `evaluate` need for stochastic/judgement-bearing behaviour.

If missing, use `scope`; never infer owner decisions.

For active service/safety impact, approved `mode: expedited-incident` may
parallelise containment verification/review. Gates and authority still apply;
name a reconciliation run.

## Loop

1. For substantial+ work, create the canonical `delivery-run` from
   `../deliver/templates/RUN.template.json`, set profile `software`, and follow
   [run-contract.md](references/run-contract.md). Routine minor work may proceed
   without `RUN.json` unless the user or project policy requests one.
2. Keep an adaptive plan. Per slice use `tdd` for observable change, `refactor`
   for approved behaviour-preserving structure and `diagnose` for unknown
   causes. Migrations may also need behaviour tests and equivalence evidence.
   Use `orchestrate` when decomposition or independent coverage helps; adapt
   topology/order inside authority. For a version-sensitive external interface
   or migration, apply
   [source grounding](references/source-grounding.md) and
   [migration compatibility](references/migration-compatibility.md).
3. Run deterministic checks; map each criterion to evidence. When required, run
   `evaluate` and attach its passing receipt.
4. Invoke read-only `code-review` under the `HARNESS.md` risk ladder. Fresh
   native and other-primary reviews load-bear; bonus families are
   opportunistic. Record adapter and actual family.
5. Repair blockers, then repeat verification and independent review. Stop after
   two repair cycles or scope/design drift; return evidence to the user or
   `scope`.
6. Update owned docs for behavioural, architectural, operational or decision
   change. For substantial+ apply `session`: refresh the recovery checkpoint,
   audit context, graduate durable findings and classify retained/ephemeral
   artifacts in `RUN.json`.
7. When a receipt exists, validate with
   `"${AGENTS_HOME:-$HOME/.agents}/skills/deliver/scripts/validate_delivery.py" \
   .agent-run/<id>/RUN.json --workspace-root "$PWD" --verify-hashes`.
   Hand off only after this machine gate.
8. User final acceptance is mandatory; promotion needs separate `release`
   authority. When a run directory exists, after acceptance, failure or
   cancellation, terminalise with
   `${AGENTS_HOME:-$HOME/.agents}/skills/orchestrate/scripts/run_dir_finalize.py`;
   an outer orchestrator's `awaiting-user` transport remains active and does
   not rename the canonical receipt state.

## Authority and completion

- Reviewers are source-read-only except assigned run artifacts; partition
  writers or use one serial applier.
- Record missing legs as failed/unavailable; never filter them. Missing
  load-bearing primary coverage blocks; missing bonus-family output does not.
- Objective evidence outranks reviewer confidence; adjudicate conclusions,
  never vote.
- Substantial+ starts a fresh implementation session bound to approved digests.
- `awaiting_acceptance` is the successful machine-gate state. Move the
  canonical receipt to `accepted` only after explicit user acceptance.

## Adapter-absent path

Without optional Console, Herdr or GitHub, use canonical project artifacts and
emit the skill-owned kind in
[portable-workflow.v1.json](portable-workflow.v1.json). It records evidence but
grants no acceptance or promotion authority.
