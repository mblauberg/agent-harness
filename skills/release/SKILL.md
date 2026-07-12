---
name: release
description: "Use for human-authorised promotion of an accepted artifact: deploy, publish, send, roll out, or observe. Not for implementation or drafting; use implement or the domain owner."
---

# Release

Promote one pinned, human-accepted artifact to an authorised target. This skill
owns the authority gate and evidence; runbooks and tools own mechanics.

## Entry gate

Require accepted delivery receipt, exact accepted-artifact digest, typed
action (`deploy`, `publish`, `share`, `send` or `activate`), target-bound
release authority, owner, disclosure/data policy and project instructions.
Implementation acceptance is not promotion authority.
Broad project/session authority cannot release or deploy; the promotion grant
must bind this artifact, action, target, expiry and applicable constraints.

Start from canonical
[RELEASE.template.json](templates/RELEASE.template.json). The validator accepts
only that typed receipt and fails closed on every other shape.

## Readiness

Record and verify:

- action, target ID/kind, provider-independent tier and disclosure boundary;
- authority covering the target, artifact, operations, expiry, secrets,
  communication, public disclosure and irreversibility;
- state/data impact: ordered steps, compatibility window and purpose-typed
  evidence bound to passing checks;
- bounded promotion plan, exposure cap and stop conditions;
- realistic rollback, revocation, recall, deactivation, replacement or
  containment plan, with owner and time bound;
- proof requirements, evidence source, owner, close condition and observation
  window when outcome needs time;
- recipient/audience validation, retention and required communications.

Public distribution can be copied after deletion. Mark residual risk
irreversible, document reversal limits and require explicit authority. `none`
reversal needs the same gate. Test production reversal regardless of provider
naming. Keep domain migration/publication checks in project runbook/evidence;
destructive or non-backward-compatible change still needs the global
impact/authority gate.

Run read-only gate before requesting promotion:

```sh
${AGENTS_HOME:-$HOME/.agents}/skills/release/scripts/validate_release.py --gate ready RELEASE.json
```

The CLI binds artifact to the live delivery receipt. Unit-policy tests may call
`validate(..., structural_only=True)` without a root; it cannot authorise
promotion.

## Promote and verify

1. Obtain explicit human approval for artifact, target and plan.
2. Use one serial operator; reviewers cannot issue external actions.
3. Execute only authorised command, connector or named human operation. Record
   operation, actor, UTC interval, result/evidence; never expose secrets.
4. Prove the target-visible outcome against predeclared requirements.
5. On a stop condition, contain exposure and run the approved reversal or
   escalate. Do not improvise an irreversible recovery.
6. Preserve the receipt, update project state and route defects to `diagnose` or
   the domain incident process.

Validate terminal evidence with `--gate complete`. `complete` means the outcome
was proved, not merely that an operation succeeded. `reversed` and `failed`
remain explicit outcomes with evidence and follow-up owners.

## Human gates

Humans own production promotion, external sending, public publication,
irreversible disclosure or data changes, and acceptance of degraded safeguards.
Agent may prepare and verify; it may execute only within explicit authority.

## Adapter-absent path

Console, Herdr and GitHub are optional. Use canonical project artifacts and
emit the skill-owned artifact kind in
[portable-workflow.v1.json](portable-workflow.v1.json). That filesystem
artifact records workflow evidence; it cannot release or deploy and never
substitutes for target-bound human authority.
