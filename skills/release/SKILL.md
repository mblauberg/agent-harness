---
name: release
description: Use when promoting an accepted software change to a shared, staged, or production environment — release readiness, versioning, migration sequencing, rollout, rollback, post-release verification, or “deploy this”. Requires explicit human promotion authority; not for implementation (`implement`) or provider-specific deployment mechanics.
---

# Release

Promote a human-accepted change through a reversible, observable release. This
skill owns the gate and evidence; project runbooks and provider tools own the
commands.

## Entry gate

Require an accepted change receipt or equivalent evidence, a named target and
artifact identity, explicit release owner, data/secrets policy, and project
deployment instructions. Missing production authority stops before mutation.

Start `RELEASE.json` from [RELEASE.template.json](templates/RELEASE.template.json).

## Readiness

Record and verify:

- immutable artifact/version and source revision;
- compatibility, schema/data migration order and backward-compatibility window;
- backups or recovery point where state changes;
- staged rollout/canary plan, blast-radius cap and stop conditions;
- tested rollback or forward-fix path with an owner and time bound;
- observation window, signals, owner, privacy/sampling, containment, close
  condition, expected baseline and post-release success thresholds;
- user-facing docs, changelog and operator communication when relevant.

Release authority is separate from change authority. It pins the artifact,
target, expiry, allowed command prefixes, secrets posture, communication and
irreversible-migration permission. Destructive or non-backward-compatible
migrations require an explicit human authority field plus order, compatibility
window and recovery point.

Run the read-only gate before asking for promotion:

```sh
${AGENTS_HOME:-$HOME/.agents}/skills/release/scripts/validate_release.py --gate ready RELEASE.json
```

## Promote and verify

1. Obtain explicit human approval for this artifact, target and plan. Approval
   for implementation is not deployment authority.
2. Use one release owner/serial operator. Do not let parallel agents issue
   overlapping infrastructure or migration commands.
3. Record every external command, actor, timestamp and result. Never invent or
   expose credentials; pause for missing authority.
4. Verify health, behaviour, migrations, telemetry and user-visible outcome
   against predeclared thresholds.
5. On a stop condition, contain blast radius and execute the approved rollback
   or escalate. Do not improvise a destructive recovery.
6. Preserve the receipt, update runbooks/state, and route defects to `diagnose`
   or the project incident process.

Validate terminal evidence with `--gate complete`. `complete` means the release
was observed healthy; a command exiting zero is not enough. `rolled-back` and
`failed` remain explicit terminal outcomes with follow-up owners.

## Human gates

Humans own production promotion, destructive migrations, irreversible data
changes, public communication and acceptance of degraded safeguards. The agent
may prepare and verify; it may execute only within explicit granted authority.
