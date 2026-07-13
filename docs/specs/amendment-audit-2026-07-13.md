# Spec 01/04 amendment audit — anchored receipt (2026-07-13)

Status: **frozen audit**, reproducible against the base commit below. This is the
durable receipt the prior same-session review did not leave. It records the
audit's base tree, reviewers, scope, exclusions, exact anchors, per-lead
verdicts, chair adjudications of primary-vs-primary disagreements, missed
findings, the coverage boundary, and the Lane-D deferrals. It does **not** by
itself freeze the specs; repair + freeze follow in the same run (CAPA-001).

## Provenance

- **Base tree:** `d7f3536` (`docs(handoff): close consolidated Spec 05 session`),
  worktree `.worktrees/lane-a-spec-authority`, branch `lane-a-spec-authority`.
- **Surface audited:** `docs/specs/01-agent-fabric.md` v0.36 (9,727 lines) and
  `docs/specs/04-agent-fabric-operational-hardening.md` v1.31 (8,450 lines),
  amendment territory Spec 01 §32.13–§32.22 and Spec 04 §9.12–§9.24.
- **Reviewers (decorrelated, source-read-only):**
  - Chair: Claude Code, model `claude-opus-4-8` (adjudication; also ran the
    fan-out and read the crux DDL directly).
  - Fan-out: 7× `claude-sonnet-5` Explore agents, one lead-pair each plus two
    missed-findings sweeps and lead 9; leads 3+5 independently double-audited.
  - Other primary: `codex gpt-5.6-sol` (xhigh), full independent pass over all
    nine leads + §9.23/§9.24 sweep (runtime task `task-mrj6zr6i-v7fa94`).
- **Exclusions / never accessed:** `.agent-run/AFAB-004` (hard prohibition — not
  read, listed, or enumerated). `runtime/**`, `config/**`, `.github/**` not read.
- **Method:** semantic DDL/state-machine review, not keyword location. Several
  findings were reproduced against a live SQLite engine (`PRAGMA foreign_keys=ON`)
  by the sonnet and codex agents; the chair verified the two disputed leads (4, 7)
  by reading the exact CREATE TABLE / CHECK text.

## Verdict summary (nine leads)

| Lead | Verdict | Repair home | Notes |
|---|---|---|---|
| 1 receiptless direct-fresh rollback | **SUBSTANTIATED** (high) | spec DDL + hydration + fixture | protocol addition (fresh-origin receipt) |
| 2 invalid retirement FK / evidence carry | **SUBSTANTIATED** (high) | spec DDL + fixture | only broken FK in the custody/retirement chain |
| 3 reservation pre-authority FK ordering | **SUBSTANTIATED** (high, ×2 + codex) | spec DDL + fixture | non-deferrable FK to not-yet-materialized revision |
| 4 batch/fresh authority crossing | **SUBSTANTIATED (adjudicated)** (high) | spec DDL + fixture | arm-binding null-vacuity; **reject** the plan-equality sub-clause |
| 5 intent/completion effect-set closure | **SUBSTANTIATED** (high, ×2 + codex) | spec DDL + fixture | identity + kind-owner + anti-extra + membership |
| 6 bare apply row counts as applied | **SUBSTANTIATED** (high + codex) | spec DDL trigger + fixture | "insert apply last" already prescribed |
| 7 nullable heads can lie | **SUBSTANTIATED (adjudicated), broader** (high) | spec DDL + fixture | systemic: §9.21 slot heads AND §9.22 scope/loss/custody heads |
| 8 fresh-issue race + revocation/handoff | **SUBSTANTIATED** (high) | spec DDL + race fixture | single-flight index + reciprocal transition guards |
| 9 owner prose vs lifecycle | **SUBSTANTIATED, 2 of 3** (high, ×3) | spec prose | commit-pending + reopen edge; async-pipeline sub-item moot |

**Refuted sub-claim inside a substantiated lead (do not implement):** lead 4's
"enforce terminal-fresh plan equality" read as `applied_mutation_plan_digest =
fresh_apply_plan_digest`. Those are disjoint plans (old-custody termination vs
new-custody creation); only the pure-`fresh` arm equates them (Spec 04 L6605),
and the `terminal-fresh` arm correctly does not (L6573–6592). Forcing that
equality would introduce a bug. The real lead-4 defect is the null-vacuous
arm binding (below).

## Chair adjudications (primary-vs-primary)

### Lead 4 — codex SUBSTANTIATED vs sonnet NOT — chair: SUBSTANTIATED (arm binding)
The apply row (`lifecycle_transition_applies`, Spec 04 L6500–6512) carries
`apply_kind` but **not** the batch's `transition_kind`. The second batch FK
(L6532–6536) includes `fresh_handoff_id`/`fresh_handoff_digest`, which the
`terminal` CHECK arm forces NULL (L6563–6564); under SQLite MATCH SIMPLE any
NULL column makes the whole composite FK non-checking. So a batch prepared as
terminal-fresh (non-null fresh handoff) can be applied as plain `terminal`,
matched only by the 4-column FK (L6528–6531) — finalizing the source with no new
custody and stranding the handoff commit-pending. The `reuse-final-custody` apply
FK to the handoff similarly carries nullable loss-after columns → vacuous. The
sonnet "NOT SUBSTANTIATED" addressed only the plan-equality reading and a
different crossing (custody/handoff identity, foreclosed by
`UNIQUE(source_ref_digest)`), and admitted it could not execute the DDL.
**Repair:** carry `transition_kind` into the apply and bind `apply_kind` ↔
`transition_kind` ↔ fresh-arm with non-null sentinels so the fresh composite FK
can never be null-skipped; close all arms exhaustively. Do **not** add
`applied_mutation_plan_digest = fresh_apply_plan_digest` for terminal-fresh.

### Lead 7 — codex (scope/loss heads vulnerable) vs sonnet (sound, §9.21 slot heads only) — chair: SUBSTANTIATED, systemic
Verified against the DDL. `lifecycle_receipt_scope_heads` (L6079–6094): a core FK
on `(…,checkpoint_digest)` plus a fuller FK including `head_receipt_digest`; the
parity CHECK `(receipt_count=0)=(head_receipt_digest IS NULL)` is on the
*checkpoints* table (L6073), not the heads table. A head with
`head_receipt_digest=NULL` skips the fuller FK while its core FK still matches a
checkpoint with receipt_count>0 → lying head. `lifecycle_generation_loss_heads`
(L7201–7223): fuller "truthful" FK includes nullable state-dependent columns
(`abandon_kind_code`, `recovery_action_*`, `active_recovery_custody_id`) → null
-vacuous, so a head can claim `abandoned/terminal` while its core FK points at an
`open` revision (CHECK `(terminal=1)=(state IN …)` still passes). The STRICT
declaration (L7323–7325) exempts "the exact discriminator/null arms" — which are
exactly these vacuity-enabling columns — so STRICT does **not** save them. Sonnet
separately (and correctly) found §9.21 `review_slot_heads` (L5492–5513): PK only,
no FK, and its FK target `provider_review_evidence` has no published DDL. The two
agents found real defects on different tables; the defect is **systemic across
lifecycle head tables**. Likely also `lifecycle_rotation_custody_heads`
(L6030–6042) via nullable `disposition_code` — verify in repair.
**Repair:** add head-local parity/sentinel CHECKs and/or force the fuller-FK
columns non-null (sentinels) so composite head FKs cannot be null-skipped; give
`review_slot_heads` a real FK and publish `provider_review_evidence` DDL (unifies
with MF01-2).

### Lead 8 — sonnet (revocation half → runtime) vs codex (SQL-substantiable) — chair: SUBSTANTIATED (spec gap)
Single-flight half agreed by both: `agent_lifecycle_recovery_capability_issues`
(L7242–7277) lacks the active-source partial-unique index the codebase uses
elsewhere (`one_active_review_target_preparation_per_run` L2767–2769;
`one_nonfinal_lifecycle_custody_per_agent` L6044–6046) → two concurrent issues on
one source both commit, loser stuck commit-pending. Revocation/handoff half:
codex shows both insertion orders commit (revoke-then-handoff and
handoff-then-revoke), so the normative prose invariant (Spec 01 L1523–1527) has no
DDL enforcement — a **spec** defect repairable by reciprocal guards (handoff
rejects a prior revocation; revocation rejects an existing handoff), not merely a
runtime question. Guards need triggers (SQLite CHECK can't cross tables); the
runtime implementation of those triggers is Lane D, the normative specification of
them is Lane A.

## Missed findings (beyond the nine leads)

Spec 04 sweep (reproduced against live SQLite):
- **MF04-1 — P0:** `operator_git_grants` FK (§9.13 L1071–1076) references a 6-col
  tuple of `run_authority_revisions` with only a 4-col UNIQUE declared (L1009–1011;
  confirmed §9.23 L8006–8008). SQLite "foreign key mismatch" on first DML → the
  grant table is uninsertable as written. Repair: add the missing 6-col UNIQUE.
- **MF04-2 — P1:** `adapter_provider_smoke_subjects` (§9.23 L7731–7741) lacks
  `CHECK(action_adapter_id = adapter_id)` its sibling arm has (L7799–7800) →
  cross-adapter smoke subject.
- **MF04-3 — P1 (codex-corroborated):** `adapter_effective_configurations`
  (§9.23 L7743–7801) activation-config triple nullable when required non-null;
  FK doesn't check parent `adapter_id` or `subject_kind='activation'`.
- **MF04-4 — P1:** `provider_context_pressure_current` FK to
  `agent_adapter_bindings` (§9.23 L8094–8108) blocks the adapter-rotation UPDATE
  §9.22 defines. Repair: coordinate pressure-row clearing in the rotation txn, or
  re-key pressure off immutable binding identity.
- **MF04-5 — P1 (codex):** §9.23/§9.24 admission INSERT order puts a route before
  its action/reservation parent (§9.23 L7977–7988, §9.24 L8245–8256) with
  non-deferred FKs → route insert fails. Repair: reorder parents-first or defer +
  validate at commit.
- **MF04-6 — P1 (codex):** §9.23 dispatch/observation don't composite-bind route
  admission (L7913–7965) → a dispatch under route A's action pair can copy route
  B's admission digest/snapshot/config. Repair: exact route candidate keys + child
  FKs carrying pair + admission digest.

Spec 01 sweep:
- **MF01-1 — P1:** §32.21 (L8739–9401) and §32.22 (L9402–9727) carry **zero
  FR/NFR/AC IDs**, unlike all 20 preceding §32.x subsections → no citable anchor
  for supersession/conformance. Repair: add "Added requirements are:" /
  "Acceptance additionally requires:" blocks with fresh IDs.
- **MF01-2 — P1 (unifies with lead 7):** `provider_review_evidence` has no
  published DDL (prose only, Spec 04 L5514–5527, L7967–7975; Spec 01 L8968–9005).
  The anti-forgery rule "actual_route_identity_digest nonnull only when proved" is
  unenforced. Repair: publish DDL with FK to `provider_action_route_observations`
  + CHECK.
- **MF01-3 — P2:** `adapter_capability_snapshots.source` (§9.23 L7677–7687) no
  CHECK enum, no correlation to `capabilities.kind` (Spec 01 L8762/8819).
- **MF01-4 — P2:** no named recovery owner for a generic (non-certifying) route in
  `missing`/`integrity-failed` (Spec 01 §32.19.8 L8139–8144 is certifying-only;
  §32.22 L9577/9589 applies the vocabulary to all answer-bearing actions).

## Coverage boundary (not clean — not independently re-audited)

The fan-out prioritised §32.21/§32.22 and §9.23/§9.24 (least-covered by the prior
review). The following were sampled/grepped but not independently line-audited for
*new* defects and must not be treated as clean: Spec 01 §32.19.1–.3, .5–.7, .9;
Spec 04 §9.14–§9.20, §9.21.1–.3/.6–.7, and the §9.22 body outside the
custody/head/apply/reservation ranges quoted above. Their overlap with the nine
leads is covered; other defect classes there are unverified.

## Lane-D deferrals (runtime-validation-required — not repaired here)

- Whether the daemon computes digests over the complete row (underpins the lead-4
  crossing-foreclosure and every "digest-verified-by-application" claim).
- Whether a hidden trigger already enforces lead-5 identity closure, lead-8
  reciprocal exclusion, or the head parity of lead 7 in the *generated* schema
  (the specs distinguish "logical current relations" from generated DDL).
- Whether an external journal outside the audited sections mitigates lead 1.
These are recorded for Lane D per the run's stop condition; Lane A repairs the
normative spec text and its executable fixtures only.

## Baseline-contradiction parks (owner calls) — none yet

No repair below is believed to contradict the human-approved baseline `c2fc623`.
If a repair is found to, it will be parked here as an owner call for the human,
not silently applied.
