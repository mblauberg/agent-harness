---
name: release
description: "Use for human-authorised promotion of an accepted artifact: deploy, publish, send, roll out, or observe. Not for implementation or drafting; use implement or the domain owner."
---

# Release

Promote one pinned, human-accepted artifact to an authorised target. This skill
owns the authority gate and evidence; runbooks and tools own mechanics.

## Entry gate

Require the accepted delivery receipt, artifact digest, typed action (`deploy`,
`publish`, `share`, `send` or `activate`), target, owner, disclosure/data policy
and project instructions.
Implementation acceptance is not promotion authority.

Start new work from the schema-v2
[RELEASE.template.json](templates/RELEASE.template.json). The validator keeps
schema v1 readable; do not create new v1 receipts. Because v1 lacks typed tiers,
every legacy target requires tested rollback.

## Readiness

Record and verify:

- action, target ID/kind, provider-independent tier and disclosure boundary;
- authority covering the target, artifact, operations, expiry, secrets,
  communication, public disclosure and irreversibility;
- typed state/data impact: ordered steps, compatibility window, and
  purpose-typed evidence bound to passing readiness checks;
- bounded promotion plan, exposure cap and stop conditions;
- realistic rollback, revocation, recall, deactivation, replacement or
  containment plan with owner and time bound;
- proof requirements, evidence source, owner, close condition and observation
  window when outcome needs time;
- recipient/audience validation, retention and required communications.

Public distribution can be copied after deletion. Mark that residual risk as
irreversible, document reversal limits and require explicit authority. A `none`
reversal mode needs the same gate. Production reversal must be tested regardless
of provider naming.
Domain-specific migration or publication checks remain in the project runbook
and readiness evidence, but destructive or non-backward-compatible change
cannot bypass the global impact and authority gate.

Run the read-only gate before asking for promotion:

```sh
${AGENTS_HOME:-$HOME/.agents}/skills/release/scripts/validate_release.py --gate ready RELEASE.json
```

The CLI binds the artifact to the live delivery receipt. Unit-policy tests may
call `validate(..., structural_only=True)` without a root; that mode cannot
authorise promotion.

## Promote and verify

1. Obtain explicit human approval for this artifact, target and plan.
2. Use one serial operator; parallel reviewers cannot issue external actions.
3. Execute only authorised command, connector or named human operations. Record
   operation, actor, UTC interval, result and evidence; never expose secrets.
4. Prove the target-visible outcome against every predeclared requirement.
5. On a stop condition, contain exposure and run the approved reversal or
   escalate. Do not improvise an irreversible recovery.
6. Preserve the receipt, update project state and route defects to `diagnose` or
   the domain incident process.

Validate terminal evidence with `--gate complete`. `complete` means the release
outcome was proved, not merely that an operation returned success. `reversed`
and `failed` remain explicit terminal outcomes with evidence and follow-up
owners.

## Human gates

Humans own production promotion, external sending, public publication,
irreversible disclosure or data changes, and acceptance of degraded safeguards.
The agent may prepare and verify; it may execute only within explicit authority.
