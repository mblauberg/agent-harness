# Spec 05 affected-skill TDD evidence

Original RED/GREEN date: 2026-07-12

Current receipt refresh: 2026-07-14

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
`2 passed`. That original gate proved fixture shape and doctrine only. Final
implementation review correctly found that it did not execute the semantic
routes or the adapter-absent workflows, so it was not accepted as AC24 evidence.

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

The integrated workstream/live-handoff extension added a second focused
RED→GREEN on 12 July: the doctrine test first failed on missing recursive
settlement and live-handoff custody, then passed after `orchestrate` bound
settlement to recursive obligations and chair change to a generation-bound
operator action. The entrypoint remained within its 500-word budget and the
doctrine checker passed.

## Executable AC24 repair

Final native review produced a new right-reason RED: three new tests failed
because no executable Spec 05 evaluator existed. The repair freezes all 36
focused cases as opaque IDs, composes the complete live catalogue and exact
classifier prompt, rejects synthetic adapters, executes every project-artifact
fallback with Console, Herdr and GitHub absent, and validates retained terminal
Fabric action evidence.

Two real three-family semantic attempts were retained as non-passes rather than
relabelled. They exposed one misowned adjacent fixture, two ambiguous prompts
and an implicit companion boundary. A later v1 three-family pass is retained as
superseded evidence because its catalogue and packet predate the current input.

The current receipt is `spec05-skill-routing-20260714-v3`: Cursor Grok 4.5
XHigh and Agy Gemini 3.1 Pro High produced 72/72 primary routes, 68/72 exact
companion routes and zero critical portability failures. The attempted
Anthropic refresh failed at provider authentication; that infrastructure
failure remains run-owned evidence and was not relabelled or imported. The
repository gate validates the current frozen packet, executable probe, exact
raw inventory and raw-answer-derived routing result.

`scripts/check-harness` initially stopped in `public_release_check.py` on a
pre-existing absolute path in
`runtime/agent-fabric-console/tests/presenter-render.test.ts`. The chair owned
and resolved that Console-only defect outside this isolated skill commit.
