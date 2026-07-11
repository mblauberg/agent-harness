# Skill portfolio evaluation appendix

Evidence cut-off: 11 July 2026
Delivery run: `SKILLS-20260711`

This appendix is the durable, redacted evidence index for the 2026 portfolio
refactor. Raw prompts, provider events, stderr and usage remain run-owned local
evidence rather than a public transcript archive.

## Routing results

| Dataset | Schedule | Result | Disposition |
|---|---:|---|---|
| [Canonical portfolio holdout](routing-holdout.yaml) | 15 cases x 2 families x 3 trials | 90/90 exact primary-plus-bounded-companion routes | Pass; human acceptance remains external. |

The holdout includes lifecycle, authority, presentation and specialist
confusion boundaries, including material skill revision versus read-only audit,
implementation ownership and the governing Caveman adaptive default. Its
SHA-256 is
`ccf946829c97f0972d144b1e1e07cc308833d7dc6cc20d20eed850e3d422b30d`.

The [frozen protocol](routing-protocol.json) set primary accuracy to 1.00 and
companion fidelity to 0.90 before generation. The current catalogue digest is
`c869bc273dda712312add66639d0c248ed648f487a9a07132f709d1730008a94`.

The current Anthropic Fable route returned HTTP 429 before generation. The
predeclared fallback selected `claude-opus-4-8`; the full 15-case schedule was
rerun fresh alongside `gpt-5.6-sol`. All 90 rows passed, including the new
Fabric-first provider-routing case. Infrastructure failure was retained and not
counted as semantic evidence.

## Retained non-passes

| Attempt | Result | Reason | Receipt SHA-256 |
|---|---|---|---|
| current Fable route | incomplete; 45 OpenAI rows passed, 45 Anthropic rows were tool errors | HTTP 429 before generation; full schedule reran on predeclared Opus fallback | `0c69de105fe359fa1640f0b8f5a36416b350acf91f21b60a071e1884cf7dbad4` |
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
| canonical routing protocol | `05989dcd9bf869b54a64f670a3a465ccefd040b045c0125fd8459d68a1ab49c5` |
| canonical routing result | `f0284aff373da2bcc4af9933746fe81bfbd9e1d81bd264137be6e029cdae2cff` |

## Interpretation limits

- These are synthetic routing and response-quality cases, not production task
  success rates.
- The portable catalogue excludes project-specific skills and most dynamic
  plugin overlays. The selected host probe contains 16 hand-selected entries.
- Model aliases, discovery behaviour, caching and pricing can change. Re-run
  after a material model, host or catalogue change.
- A routing regression establishes only the frozen synthetic cases. The
  enclosing delivery receipt and human retain acceptance and release authority.
