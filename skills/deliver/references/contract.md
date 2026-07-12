# Delivery contract

`RUN.json` with `contract: delivery-run` and `schema_version: 1` is the single
canonical lifecycle receipt. The profile registry
declares minimum deterministic and judgement gates; project profiles may add
requirements. `status` is the live state and `state_history` is its ordered,
timestamped proof. Side states (`blocked`, `cancelled`, `degraded`) require a
reason and recovery instruction and cannot replace a mandatory gate.

## Fabric relationship binding

New receipts declare the optional-in-v1 `fabric_relationships` object. Omission
is accepted only for backward compatibility with receipts created before this
extension. A coordinated delivery uses concrete bounded Fabric identifiers and
binds `delivery_run_id` back to the receipt's exact `run_id`:

```json
{
  "mode": "coordinated",
  "delivery_run_id": "DEL-001",
  "project_session_id": "ps_01",
  "coordination_run_id": "run_01",
  "workstream_id": "workstream_01",
  "lead_agent_id": "agent_lead_01"
}
```

An independent delivery uses the same complete shape with `mode` set to
`independent`, `delivery_run_id` still equal to `run_id`, and all four parent,
workstream and lead values set exactly to `not_applicable`. Partial objects,
unknown fields or modes, invented parents, invalid identifiers and a mismatched
delivery run fail closed. `lead_agent_id` identifies the bounded workstream
lead, never a second chair; live Fabric membership and chair authority remain
daemon-owned rather than being recreated in this receipt.

Artifact digests use `sha256:<64 lowercase hex>`. Local paths are relative to
the explicit workspace root; validate with `--workspace-root` and
`--verify-hashes`. External URIs require `digest_unavailable_reason` when bytes
cannot be bound.

From the project root:

```sh
"${AGENTS_HOME:-$HOME/.agents}/skills/deliver/scripts/validate_delivery.py" \
  .agent-run/<id>/RUN.json --workspace-root "$PWD" --verify-hashes
```

Human decisions link matching passing `kind: human` evidence. Deterministic
evidence records an exit code and a receipt digest equal to its declared
artifact digest; `--verify-hashes` then binds that artifact to its live bytes.
Non-evaluation deterministic evidence must be a local JSON
`deterministic-evidence-bundle`; its exact check IDs, gates, statuses, methods,
source paths and exit codes must match the linked evidence rows.
Judgement evidence records actual model lineage. Non-human evidence lists the
source paths it consumed, all within authority. A digest-bound
`--project-policy` may add a complete project profile or add requirements to a
built-in profile, never remove them.

Stochastic assurance uses a lifecycle binding with exactly `status`,
`anchored_at`, `evidence_id`, `evaluation_artifact_id`, `evaluation_id`,
`evaluation_digest` and `plan_digest`. Before execution, a `planned` row binds
the evaluation ID and frozen plan digest; artifact, evaluation digest and
evidence fields stay empty. `complete`, `failed` and `incomplete` rows keep
that anchor and fill the three live-result fields. Complete rows link passing
judgement evidence. Terminal nonpasses link deterministic receipt-validation
evidence and remain in the history; they never satisfy stochastic assurance.
Awaiting acceptance requires at least one complete passing row and no planned
row.

The referenced local JSON artifact must be declared as evidence. With
`--verify-hashes`, the delivery validator checks its live digest and invokes
the canonical `evaluation-run` validator with the anchored evaluation ID,
frozen plan digest and enclosing delivery run ID. It also verifies every
artifact inside that evaluation receipt and checks profile minima against the
bound plan for complete candidates. Terminal nonpasses may fall below those
minima because they are retained evidence, not acceptance candidates. For
every materialised row, the plan must be frozen no later than `anchored_at`,
and the anchor must precede that nested evaluation's earliest preflight or
attempt. A retry may therefore be freshly anchored after an earlier evaluation
fails, even while the enclosing delivery remains in execution. Copied dataset,
sample, repetition, threshold or score fields cannot satisfy this gate.

Security checks are selected by changed surface. Crucial software and
agent-product runs cannot reach acceptance without matching passing
deterministic results. Agent products disposition the OWASP agentic risk
catalogue; `not_applicable` needs a reason.

Observation is profile-specific but always names window, signals, thresholds,
owner, containment, privacy and close condition. `not_applicable` requires a
profile justification.

The profile gate uses independently authored positive, negative and boundary
cases rather than receipts emitted by the reference generator:

```sh
python3 "${AGENTS_HOME:-$HOME/.agents}/scripts/validate_delivery_scenarios.py"
```

Every expected outcome must match. The dataset covers each base profile in
both directions, exercises the high-stakes overlay twice, and repeats
stochastic or boundary cases where reproducibility matters.
