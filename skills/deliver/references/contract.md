# Delivery contract

`RUN.json` with `contract: delivery-run` and `schema_version: 1` is the single
canonical lifecycle receipt. The profile registry
declares minimum deterministic and judgement gates; project profiles may add
requirements. `status` is the live state and `state_history` is its ordered,
timestamped proof. Side states (`blocked`, `cancelled`, `degraded`) require a
reason and recovery instruction and cannot replace a mandatory gate.

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
evidence records an exit code and receipt digest; judgement evidence records
actual model lineage. Non-human evidence lists the source paths it consumed,
all within authority. A digest-bound `--project-policy` may add a complete
project profile or add requirements to a built-in profile, never remove them.

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
