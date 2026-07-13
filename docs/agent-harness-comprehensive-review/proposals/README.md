# Illustrative proposal files

These files demonstrate the recommended design at a level suitable for review.
They are **not** a drop-in patch and have not been executed against the
repository. Names, paths and provider-native settings should be reconciled with
the final approved architecture and current provider schemas during
implementation.

## Contents

- `harness.manifest.yaml` — one registry for packages, skills, providers,
  policies, generation and distribution. **REJECTED 2026-07-13** (scoping
  session round 4): replaced by per-domain owners with generated projections
  and CI drift checks; retained here as a rejected illustration only.
- `policies/lifecycle.yaml` — executable lifecycle and review decisions.
- `policies/authority-profiles.yaml` — portable capability profiles.
- `policies/retention.yaml` — governed compaction and deletion.
- `policies/effects.yaml` — staged external-effect model.
- `policies/routing.yaml` — intent-band routing and calibration.
- `schemas/intake-decision.schema.json` — request classification.
- `schemas/execution-plan.schema.json` — visible agent topology and DAG.
- `schemas/backlog-item.schema.json` — approved autonomous work item.
- `schemas/authority-profile.schema.json` — profile policy validation.
- `AGENTS.md` and `CLAUDE.md` — concise shared/provider-specific instructions.
- `.claude/rules/runtime.md` — path-scoped Claude rule example.
- `skills/architecture-review/SKILL.md` — proposed new capability.
- `skills/refactor/SKILL.md` — illustrative direct-cutover-aware rewrite.
- `skills/orchestrate/SKILL.md` — illustrative topology/value-aware rewrite.

## Integration approach

1. Approve the concepts and names.
2. Add schemas and fixtures first.
3. Generate documentation/sidecars from the manifest.
4. Preserve the current read-only provider posture as
   `review-readonly`.
5. implement `workspace-write-offline` in a bounded tranche.
6. Extract provider-action handling behind the compiler and a unit of work.
7. Delete temporary compatibility paths after callers migrate.
