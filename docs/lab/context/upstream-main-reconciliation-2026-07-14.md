# Upstream main reconciliation — 2026-07-14

Read-only audit bound to:

- comprehensive-review: `961356422cd7403a2760ab5023b240186a61021f`
- origin/main: `1ddfe24858b362decb1c507b87a466df26d205eb`
- merge-base: `9f168eed9ac7001744d372a840be9648bb11edcf`
- divergence at audit: 122 review-only / 2 main-only commits

The two main-only commits are:

1. `873a7569f2b319e48673a4f922fc8c40f2f892c5` — remove frontend-design shell-command injection.
2. `1ddfe24858b362decb1c507b87a466df26d205eb` — simplify skill audits and lifecycle gates.

The cumulative delta is 88 paths (73 modified, 8 added, 7 deleted). Only two
paths are touched on both sides:

- `docs/lab/decision-register.md`
- `scripts/check-harness`

`git merge-tree` forecast no textual conflict. Semantic inspection remains
mandatory: the decision register must preserve the upstream style-policy change
and D-022 through D-032; `scripts/check-harness` must retain both
`scripts/check_spec_families.py` and `scripts/check-skill-javascript`.

High-risk replay surfaces are the autonomous-lab bootstrap/templates, delivery
and lifecycle profiles, work-map validation, skill-audit simplification, and the
frontend/static-security gates. The live lab predates the upstream bootstrap
changes and therefore needs explicit compatibility replay even if Git merges it
without a conflict.

After W018 integrates, merge the exact audited `origin/main` commit and run, in
order:

```sh
git diff --check
rg -n 'check_spec_families|check-skill-javascript' scripts/check-harness
python3 -m pytest -q tests/test_autonomous_lab_bootstrap.py tests/test_autonomous_lab_pause.py tests/test_delivery_contract.py tests/test_delivery_profile_scenarios.py tests/test_work_map_validator.py tests/test_skill_audit_contract.py tests/test_spec05_skill_alignment.py
node docs/lab/tools/check-adr-immutability.mjs
node docs/lab/tools/gen-dashboard.mjs --check
python3 scripts/check_spec_families.py
scripts/check-skill-javascript skills
python3 -m pytest -q tests/test_frontend_live_security.py tests/test_harness_contract.py tests/test_static_security_check.py tests/test_static_skill_corrections.py
scripts/check-harness
```

Route the security-focused replay and review through the human-directed Opus
path if native execution content-blocks. Do not weaken or skip the deterministic
gate. A fresh independent review must inspect the two semantic merge surfaces
and any compatibility repair before W005 production work resumes.

Audit commands were read-only: tracked-status checks with private exclusions,
`git rev-parse`, `git merge-base`, main-only `git log`, two-sided name-status
diffs, path intersection, and three-tree `git merge-tree`. No source, refs,
branches, worktrees, or private run paths were touched.
