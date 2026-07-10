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
- Paired run: `.agent-run/HREF-002/`.
- The neutral kernel, five profiles, high-stakes overlay, privacy-safe
  telemetry collector, retrospective receipts, security selector, observation
  contract, managed installation, lifecycle routing eval, context budgets and
  manifest-led cleanup are implemented.
- Agent-fabric-owned files remain outside this effort and commit.

## Remaining work

1. Create the scoped HREF commit without agent-fabric-owned files.
2. Stop at final human acceptance; install, push and release remain separate.

## Invariants

- Do not stage, commit or edit agent-fabric-owned files.
- No runtime activation, provider login, installation, push or release.
- Exactly one writer per shared surface; Fable routing/review stages remain
  artifact-only.
- Human acceptance stays pending after the machine gate.

## Verify

```sh
"${AGENTS_HOME:-$HOME/.agents}/scripts/check-harness"
"${AGENTS_HOME:-$HOME/.agents}/scripts/public-release-check"
git diff --check
"${AGENTS_HOME:-$HOME/.agents}/skills/deliver/scripts/validate_delivery.py" \
  .agent-run/HREF-002/RUN.json --workspace-root "$PWD" --verify-hashes
```
