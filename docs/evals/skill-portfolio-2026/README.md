# Skill portfolio evaluation appendix

Evidence cut-off: 11 July 2026
Delivery run: `SKILLS-20260711`

This appendix is the durable, redacted evidence index for the 2026 portfolio
refactor. Raw prompts, provider events, stderr and usage remain run-owned local
evidence rather than a public transcript archive.

## Routing results

| Dataset | Schedule | Result | Disposition |
|---|---:|---|---|
| [Canonical portfolio holdout](routing-holdout.yaml) | 14 cases x 2 families x 3 trials | 84/84 exact primary-plus-bounded-companion routes | Pass; human acceptance remains external. |

The holdout includes lifecycle, authority, presentation and specialist
confusion boundaries, including material skill revision versus read-only audit,
implementation ownership and the governing Caveman adaptive default. Its
SHA-256 is
`20966b1a295e20531402a815bee901476df2fefc599139b7aea66fc31c4fff13`.

The [frozen protocol](routing-protocol.json) set primary accuracy to 1.00 and
companion fidelity to 0.90 before generation. The current catalogue digest is
`c00f4760e45821d2b2403211e04141a67cd292123fcaa768255e6c7c58cc5cf6`.

The initial Anthropic route returned HTTP 429 before generation. The live model
router selected `claude-opus-4-8`; the full holdout was rerun fresh alongside
`gpt-5.6-sol`. Infrastructure failure was not counted as semantic evidence.

## Retained non-passes

| Attempt | Result | Reason | Receipt SHA-256 |
|---|---|---|---|
| initial Fable route | incomplete; three tool errors | HTTP 429 before generation; OpenAI rows excluded from the semantic gate | `4c475850f95887541b09ea9a6587d7126b26961c545c6c90b7941bf58cf387ec` |
| v2 | incomplete; zero model calls | preflight interpreter lacked `pytest` | `6fb081ea45d08bdf8d20f0b340d30882699030955c8787a706eb7029cc81964e` |
| v3 | incomplete; zero model calls | plan had fewer than three repetitions | `0e534a369cec5a8e90aadf9ccba0bfc849152b3553f321e7f942b7db5aab3908` |
| v4 | fail; 72/72 primary, 71/72 companions | undeclared but legitimate `work-map` companion | `696091cd34f9b20d8eebba075a608209991904371df016611fd3f0312732a36f` |
| v5 | fail; 72/72 primary, 71/72 companions | undeclared but legitimate `engineering-writing` companion | `7b09dc603770038a1aed87605285350b577bba1c33f14f7ffa9c805cf8434647` |
| unfrozen replacement attempt | cancelled; five outputs completed | protocol-free outputs excluded; raw artifacts retained locally | no receipt produced |

These are historical evidence, not alternative live schemas or routing
datasets. The supported public route is the single canonical holdout above.

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
| canonical routing protocol | `e4f58c062df27f5d85e2797bef99f314000951eec1dbf39d2f926036c80bffee` |
| canonical routing result | `954c285b8855a4da0058ef3eecf8971a513757f41abf592e07fc50df6c215545` |

## Interpretation limits

- These are synthetic routing and response-quality cases, not production task
  success rates.
- The portable catalogue excludes project-specific skills and most dynamic
  plugin overlays. The selected host probe contains 16 hand-selected entries.
- Model aliases, discovery behaviour, caching and pricing can change. Re-run
  after a material model, host or catalogue change.
- A routing regression establishes only the frozen synthetic cases. The
  enclosing delivery receipt and human retain acceptance and release authority.
