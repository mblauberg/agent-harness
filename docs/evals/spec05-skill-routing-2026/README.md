# Spec 05 lifecycle-skill evaluation

Status: revised frozen inputs and adapter-absent executable probe pass; fresh
real Fabric routing rerun pending after one retained semantic non-pass
Date: 12 July 2026

This evaluation closes Spec 05 AC24 without treating the focused skill YAML as
its own proof. `routing-holdout.yaml` is derived from all 36 positive, negative,
adjacent and portability cases for the nine affected lifecycle skills. Opaque
IDs, the complete live skill catalogue and the blind classifier instruction are
composed byte-for-byte into `routing-packet.txt` before any model call.

The semantic gate requires three answer-bearing actions through the generated
MCP surface and daemon: Claude through `claude-agent-sdk`, Cursor Grok through
`cursor-agent`, and Gemini through `agy`. `routing-result.json` must retain each
task/action identity, route, model lineage, terminal digest and raw JSON output.
The executable validator recomputes all input and raw-output hashes, requires
all 108 case rows, 100% primary accuracy, at least 90% exact companion fidelity,
and zero portability failures. Synthetic, recorded or self-declared adapters
are rejected.

`portability-result.json` is a separate deterministic filesystem probe. It
executes every affected skill's project-artifact fallback with an isolated
empty command path and proves that `agent-fabric-console`, `herdr` and `gh` are
absent. This proves local artifact mechanics; the three real semantic outputs
independently exercise the portability prompts and their artifact contracts.
Neither layer claims human acceptance or production task-success rates.

Commands:

```sh
python3 skills/orchestrate/evals/spec05_skill_evaluation.py validate-inputs
python3 skills/orchestrate/evals/spec05_skill_evaluation.py probe
python3 skills/orchestrate/evals/spec05_skill_evaluation.py import-bundle \
  --bundle /tmp/spec05-routing-provider-bundle.json
python3 skills/orchestrate/evals/spec05_skill_evaluation.py validate-routing \
  --result docs/evals/spec05-skill-routing-2026/routing-result.json
```

Provider generation is deliberately outside the deterministic evaluator. It
must use one Fabric coordination run with one chair; direct provider CLIs and
hand-authored outputs do not satisfy this gate.

## Retained non-passes

Attempt 01 used all three required Fabric routes and returned valid complete
JSON, but scored 103/108 primary and 92/108 companion rows. The raw actions and
outputs remain under `attempts/attempt-01/`. Adjudication corrected one
misowned session fixture, sharpened two genuinely ambiguous prompts and stated
the pre-existing companion boundary explicitly. No failed output was relabelled
or reused; the revised packet requires a fresh three-family run.
