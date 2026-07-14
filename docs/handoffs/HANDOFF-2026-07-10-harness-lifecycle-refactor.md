# Adaptive harness lifecycle handoff

Status: awaiting-human
Effort: harness-lifecycle-refactor
Leg: 7
Supersedes: none
Consumed-at: pending

## Goal

> Ensure that the docs/specs/02-adaptive-agent-harness.md spec is entirely
> implemented properly and refactored entirely. Work with fable in the other
> herdr pane. Ensure everything is updated and committed, including the
> README.md. There is a concurrent agent implementing agent-fabric to avoid
> colliding with.

## State on disk

- Specification: `docs/specs/02-adaptive-agent-harness.md`.
- Research basis: `docs/research/agentic-sdlc-harness-2026.md`.
- Effort map: `docs/efforts/EFFORT-harness-lifecycle-refactor.md`.
- Current validated pre-v1.3 paired run: `.agent-run/HREF-002/` (immutable).
  `.agent-run/SKAUD-20260714/` is noncanonical supporting evidence for the
  v1.3 work, not a current delivery receipt: the approved batch expanded beyond
  its original skill-audit-only authority and artifact envelope.
- The neutral kernel, five profiles, high-stakes overlay, requested-local and
  separately authorised shared-export skill evidence, retrospective receipts,
  security selector, observation contract, managed installation, lifecycle
  routing eval, context budgets and manifest-led cleanup are implemented. The
  unused synthetic telemetry collector was retired on 14 July 2026.
- Agent-fabric-owned files remain outside this effort and commit.

## Remaining work

1. Human acceptance of the machine-complete v1.3 static batch remains pending.
2. Installation, runtime activation and release remain separate human actions.

## Invariants

- Do not stage, commit or edit agent-fabric-owned files.
- No runtime activation, provider login, installation or release. Push only the
  reviewed scoped commits under the human's 14 July authority.
- Exactly one writer per shared surface; Fable routing/review stages remain
  artifact-only.
- Human acceptance stays pending after the machine gate.

## Verify

```sh
# Current source, public-tree and retained-evaluation gate.
"${AGENTS_HOME:-$HOME/.agents}/scripts/check-harness"
"${AGENTS_HOME:-$HOME/.agents}/scripts/public-release-check"
git diff --check

# Historical pre-v1.3 receipt only; SKAUD-20260714 is supporting evidence.
"${AGENTS_HOME:-$HOME/.agents}/skills/deliver/scripts/validate_delivery.py" \
  .agent-run/HREF-002/RUN.json --workspace-root "$PWD" --verify-hashes
```
