# Spec 05 affected-skill TDD evidence

Date: 2026-07-12

## RED

Command:

```sh
/opt/homebrew/bin/pytest -q tests/test_spec05_skill_alignment.py
```

Result: `1 failed, 1 passed`. The focused Spec 05 route/portability fixtures
were valid; the doctrine gate failed for the intended reason because the
current `scope` entrypoint lacked explicit decision-context and digest-bound
handoff behaviour.

## GREEN

After the smallest affected-skill doctrine changes, the same command returned
`2 passed`. The gate now proves focused routing/portability coverage, adaptive
topology with one chair, digest-bound lifecycle handoffs, canonical receipt
relationships and the separately target-bound release authority boundary.

Supporting static gates:

```text
scripts/check_harness.py
PASS: 33 skills; catalogue=7354/8000 chars; frontmatter, fixtures, links and sidecars clean

skills/orchestrate/evals/check_skill_triggers.py
SKILL DOCTRINE CHECK: PASS (16 doctrine, 21 reference)
```

The first repository pass also exposed the stricter whole-entrypoint budget;
the five affected overages were compressed without weakening the contracts.
The final affected gate returned `16 passed`; the remaining harness pytest
returned `422 passed` after building the worktree-local lockfile dependencies.

`scripts/check-harness` initially stopped in `public_release_check.py` on a
pre-existing absolute path in
`runtime/agent-fabric-console/tests/presenter-render.test.ts`. The chair owned
and resolved that Console-only defect outside this isolated skill commit.
