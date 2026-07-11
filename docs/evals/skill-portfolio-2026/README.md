# Skill portfolio evaluation appendix

Evidence cut-off: 11 July 2026
Delivery run: `SKILLS-20260711`

This appendix is the durable, redacted evidence index for the 2026 portfolio
refactor. It separates development evidence, infrastructure failures, failed
gates and the final fresh regression. Raw prompts, provider events, stderr,
usage and failure rows remain under `.agent-run/SKILLS-20260711/evaluation/`;
they are local run evidence and are not a public transcript archive.

## Routing results

| Run | Role | Schedule | Result | Disposition |
|---|---|---:|---|---|
| Portable catalogue holdout | development holdout | 40 cases x 2 families x 3 trials | 235/240 exact routes (97.9%); all five misses were the same requirements-document boundary | Retained unchanged; followed by a fresh six-case writing regression at 36/36. |
| Selected Codex host overlay | developmental probe, not full host catalogue | 12 cases x 2 families x 3 trials | four completed invocations: 48/48 primary, 43/48 exact; two Codex invocations hit a usage limit | Not a gate. Infrastructure rows are not semantic errors. |
| v2 | frozen schema-v2 gate | 12 x 2 x 2 | deterministic preflight failed because its interpreter lacked `pytest`; zero model calls | `incomplete`; all planned cells retained as skipped. |
| v3 | frozen schema-v2 gate | 12 x 2 x 2 | plan was below the agent-product minimum of three repetitions; zero model calls | `incomplete`; prompted a delivery-validator check and a fresh plan. |
| v4 | first three-repetition holdout | 12 x 2 x 3 | 72/72 primary; 71/72 exact | `fail`; one valid `work-map` companion was undeclared for `autonomous-lab`. |
| v5 | fresh post-failure holdout | 12 x 2 x 3 | 72/72 primary; 71/72 exact | `fail`; one valid `engineering-writing` companion was undeclared for an implementation/documentation prompt. |
| v6 | fresh post-metric-repair holdout | 12 x 2 x 3 | 72/72 primary and 72/72 bounded companion dispositions | Machine `pass`; primary accuracy threshold 1.00, companion-fidelity threshold 0.90. Human acceptance remains external. |

The v4/v5 failures showed that primary selection and companion composition are
different signals. v6 froze them as separate metrics before execution: a
critical case fails on the wrong primary, while legitimate companion variation
is retained and scored against its own threshold. This is not a post-hoc rescore
of v4 or v5; both failed receipts remain bound in the delivery run.

The three reproducible routing datasets are:

- [routing-holdout.yaml](routing-holdout.yaml), SHA-256
  `beda748951b073155661c3a80f2f622ca11a6f78d9a64129cf2233746ef15b7c`;
- [routing-regression-holdout.yaml](routing-regression-holdout.yaml), SHA-256
  `1a45801f7d0d9867ebd352c8ef98077d81086c9e2a3ac57c45033be39e16e7bf`;
- [routing-metric-holdout.yaml](routing-metric-holdout.yaml), SHA-256
  `0653255c89c8eedc98d7a97bb774a3606e046746cebad3af552fdb5686772593`.

v4-v6 used three clean-context trials on each primary family. Requested and
actual generator lineage was retained as `gpt-5.6-sol` through Codex CLI and
`claude-fable-5` through Claude Code. Each receipt binds the catalogue,
dataset, rubric, runtime, plan, provider route/output artifacts, case rows,
ground-truth judgements, accounting and hashes.

## Caveman quality evidence

The 16-case development comparison used baseline, one-line concise, rewritten
candidate and legacy arms, twice on each primary family. An opposite-family
blind judge scored 256 items after deterministic checks.

- Claude-family candidate cost was about USD 0.698 across two runs, versus
  0.633 for concise, 0.848 for baseline and 0.778 for legacy. This supports no
  universal savings claim.
- The pre-repair candidate had one Claude-family hard failure from raising an
  unverified source's evidence altitude; the skill was tightened. The
  OpenAI-family candidate had no hard failure and all five judge dimensions
  scored 4.0.
- A fresh three-case x three-trial x two-family altitude regression preserved
  attribution, non-causation and unconfirmed compromise in all 18 outputs.
  The lexical matcher marked 15/18 because three semantically correct phrases
  did not use its exact token; those are recorded as grader limitations rather
  than silently relabelled.
- Legacy was shorter but produced two Claude-family hard failures and lower
  OpenAI-family clarity. Brevity alone was not accepted as quality.

## Receipt hashes

| Evidence | SHA-256 |
|---|---|
| portable catalogue receipt | `5c2d6e0f1f545268ac40515059e97835bbb09f9ccb0ad19e6b606c0932ff4d5f` |
| writing regression receipt | `0ad0dfd979002a5418791c446e9909073fb75683670760f8119765fb965896c0` |
| selected host-overlay receipt | `31c192d6ddc69158bb2f829786ec737a28fd44912886524138414628a0625822` |
| Caveman arm receipt | `bc098ae63f98a2b433ee068beecd2821a9ad85b68861c9b3471517a27218714f` |
| Caveman blind-judge receipt | `e9f86375bebf4c1537ff214a62a3ceba494ede5c3f68e932129e8449e189fbec` |
| Caveman altitude-regression receipt | `4f9b9d4202a9cb8e2250fca1a7008adbdee578d774b1e3620eac256762d776e9` |
| v2 incomplete receipt | `6fb081ea45d08bdf8d20f0b340d30882699030955c8787a706eb7029cc81964e` |
| v3 incomplete receipt | `0e534a369cec5a8e90aadf9ccba0bfc849152b3553f321e7f942b7db5aab3908` |
| v4 failed receipt | `696091cd34f9b20d8eebba075a608209991904371df016611fd3f0312732a36f` |
| v5 failed receipt | `7b09dc603770038a1aed87605285350b577bba1c33f14f7ffa9c805cf8434647` |
| v6 passing receipt | `9879b06f02866bbded4c6917c317e013056bae2aa8812fc67652816019fd4555` |

## Interpretation limits

- These are synthetic routing and response-quality cases, not production task
  success rates.
- The portable catalogue excludes project-specific skills and most dynamic
  plugin overlays. The selected host probe contains 16 hand-selected entries.
- Model aliases, discovery behaviour, caching and pricing can change. Re-run
  after a material model, host or catalogue change.
- A schema-v2 machine pass establishes only the frozen evaluation gate. The
  enclosing delivery receipt and human retain acceptance and release authority.
