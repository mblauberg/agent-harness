---
name: deliver
description: "Use for taking an approved research, analysis, document, or agent-product outcome through evidence, review, and human acceptance. Not for software-only work, unsettled scope, or release; use implement, scope, or release."
---

# Deliver

Run the domain-neutral lifecycle kernel. This skill coordinates existing
capabilities; domain skills still own domain methods.

## Entry

Require an approved intent, acceptance criteria, minimum risk tier and bounded
authority. Consequential scope/design, disclosure, one-way doors and risk
downgrades need explicit human approval. If intent is unsettled, use `scope`.

Select one base profile from `config/delivery-profiles.json`: `software`,
`research`, `analysis`, `document` or `agent-product`. Add the high-stakes
overlay when source authority, privacy or qualified review matters. Projects
may strengthen a profile, never weaken kernel gates silently.

## Lifecycle

1. Create `.agent-run/<id>/RUN.json` from `templates/RUN.template.json` and
   bind intent, design and authority by digest.
2. Record each state transition. No state may jump an approval, evidence,
   review, acceptance or release gate.
3. Execute through the relevant skills. Software routes execution through
   `implement`; stochastic behaviour routes through `evaluate`; failures use
   `diagnose`; substantial parallel work may use `orchestrate`.
4. Produce profile-required deterministic evidence before judgement evidence.
   Every gate links to a typed artifact or receipt. At acceptance, a stochastic
   gate must bind and hash-verify a passing `evaluation-run` schema-v2 receipt;
   copied scores or sampling metadata are not evidence. Retain failed or
   incomplete evaluation receipts as non-gating history.
5. Review independently with lenses selected from the dependency cone.
   Substantial+ requires a fresh native reviewer and the other primary family.
   Bonus-family failures are recorded and non-blocking.
6. Repair at most twice. Scope/design drift returns to the human gate.
7. Validate from the project root with
   `"${AGENTS_HOME:-$HOME/.agents}/skills/deliver/scripts/validate_delivery.py"
   .agent-run/<id>/RUN.json --workspace-root "$PWD" --verify-hashes` (plus a
   digest-bound `--project-policy` when used).
   `awaiting_acceptance` is machine-ready, not complete.
8. Human acceptance and external release are separate. Define observation
   before release; close only after its evidence window passes. Feed incidents
   and recurrence into `retrospect` and the next scoped cycle.

## Boundaries

Delegates may only narrow authority. One writer owns each shared source
surface. Artifact manifests classify `canonical`, `evidence`, `handoff`,
`scratch` or `external`; cleanup removes only expired, run-owned scratch with
explicit authority. Filesystem receipts remain truth when Herdr or another
transport is unavailable.

`implement` uses this same receipt with profile `software`; no parallel
implementation receipt format exists.
