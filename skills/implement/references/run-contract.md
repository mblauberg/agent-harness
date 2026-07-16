# Software delivery contract

`implement` executes the `software` profile inside the single canonical
`delivery-run` receipt. Create `.agent-run/<id>/RUN.json` from
`skills/deliver/templates/RUN.template.json`, set `profile: software`, then use
the delivery validator. There is no separate implementation receipt format.

The approved scope supplies acceptance criteria, risk and authority. Record
software artifacts with profile types (`source`, `migration`, `configuration`
or `documentation`), map each canonical artifact to its changed security
surfaces, and link deterministic tests and security checks before independent
review. Stochastic or judgement-bearing product behaviour also links an
`evaluate` receipt.

State follows the delivery kernel: `draft -> scoped -> approved -> executing ->
verifying -> reviewing -> awaiting_acceptance`. Repairs return through
verification and review, at most twice. A new requirement, authority expansion
or one-way-door decision returns to `scope`; it is not a repair.

Validate from the project root:

```sh
"${AGENTS_HOME:-$HOME/.agents}/skills/deliver/scripts/validate_delivery.py" \
  .agent-run/<id>/RUN.json --workspace-root "$PWD" --verify-hashes
```

## Receipt portability

The exact `.agent-run/<id>/` receipt and its raw operational artifacts stay
local, ignored and validator-readable. Never force-track them, even when a
programme requires per-lane receipts. Project the durable tested-tree facts,
review verdicts, artifact digests and pending gates into tracked project docs,
fixtures and the PR evidence index. That curated projection is public evidence;
it does not replace or weaken validation of the private canonical receipt.

`awaiting_acceptance` is machine-ready, not complete. User acceptance and any
production promotion remain separate gates.
