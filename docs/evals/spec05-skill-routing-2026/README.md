# Spec 05 lifecycle-skill evaluation

Status: pass; real three-family Fabric routing and adapter-absent executable
probe complete after two retained semantic non-passes
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
and zero portability failures. Each retained output preserves the exact Fabric
`providerAnswer` bytes and must match the answer digest in its terminal action
evidence; semantic-equivalent or synthetic replacement JSON fails even if its
local output hash and metrics are rewritten. Synthetic, recorded or
self-declared adapters are rejected.

`portability-result.json` is a separate deterministic filesystem probe. It
executes every affected skill's owned `portable-workflow.v1.json` contract
through `skills/_shared/portable_workflow.py`, with an isolated empty command
path proving that `agent-fabric-console`, `herdr` and `gh` are absent. The
evaluator only supplies the canonical project context and validates the
artifact produced by that external runner; a missing, broken or dishonest
runner fails the probe. This proves local artifact mechanics; the three real
semantic outputs independently exercise the portability prompts and their
artifact contracts. Neither layer claims human acceptance or production
task-success rates.

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

The accepted third run is bound to revision
`b5a855c4c810f2ed53d607b2b92b995aa8da0737`. Claude Opus, Cursor Grok 4.5
XHigh and Agy Gemini 3.1 Pro High each returned all 36 rows through terminal
Fabric actions. The combined result is 108/108 primary routes, 101/108 exact
companion routes (93.52%), and zero critical portability failures. Raw action
and answer evidence is retained under `raw/`; `routing-result.json` is rebuilt
and checked from those files.

## Retained non-passes

Attempt 01 used all three required Fabric routes and returned valid complete
JSON, but scored 103/108 primary and 92/108 companion rows. The raw actions and
outputs remain under `attempts/attempt-01/`. Adjudication corrected one
misowned session fixture, sharpened two genuinely ambiguous prompts and stated
the pre-existing companion boundary explicitly. No failed output was relabelled
or reused; the revised packet requires a fresh three-family run.

Attempt 02 passed companion and portability thresholds, but all three families
read "bounded delivery" as `deliver` primary in the positive orchestration
fixture. That wording was corrected to an explicit bounded coordination-run
operation. The 105/108 primary result and all raw evidence remain retained;
the 100% primary threshold was not lowered.
