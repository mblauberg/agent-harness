# Skill portfolio evaluation appendix

Evidence cut-off: 14 July 2026
Delivery run: `SKAUD-20260714`

This appendix is the durable evidence index for the 2026 portfolio refactor.
Detailed provider events and usage remain local run-owned evidence.

## Routing results

| Dataset | Schedule | Result | Disposition |
|---|---:|---|---|
| [Canonical portfolio holdout](routing-holdout.yaml) | 18 cases x 2 families x 3 trials | 108/108 exact primary-plus-bounded-companion routes | Pass; human acceptance remains external. |

The holdout includes lifecycle, authority, presentation and specialist
confusion boundaries, including material skill revision versus read-only audit,
the action-owner-plus-audit companion rule, and explicit project-level Caveman
invocation. Its SHA-256 is
`565b5c87e20fedca94a33ea473656204fdb9d5bab186288090e40714d5b90366`.

The [frozen protocol](routing-protocol.json) set primary accuracy to 1.00 and
companion fidelity to 0.90 before generation. The current catalogue digest is
`9346760fbab26c585e87822f88c54f54b47a2ea0231935b2befc72798ba886cf`.

Gemini 3.1 Pro High through `agy` and Grok 4.5 XHigh through `cursor-agent`
each ran three fresh no-retry trials through Agent Fabric. All 108 rows passed.
Anthropic was not scheduled after the separate Spec 05 SDK action terminated at
provider authentication; that infrastructure failure was retained and not
counted as semantic evidence.

## Retained non-passes

| Attempt | Result | Reason | Receipt SHA-256 |
|---|---|---|---|
| skill-audit v1 | fail | action-plus-audit rows gave primary ownership to `skill-audit` | `660422f2dd83f2dfc24435044e1ff0f4246c4373acb81c481e0353442b49eb15` |
| portfolio v3 | fail; 106/108 primary, 102/108 companions | the external-send artifact and audit composition were underspecified | `45530970b7417d703f0a64cad04dce179281d6ba2c5890690e272df969792338` |
| portfolio v4 | fail; 106/108 primary, 108/108 companions | two rows treated project-level Caveman wording as context, not invocation | `0f51749fa770797a135b3b6272f6fce6f1ef1010171e87a0f596e9adfffaf616` |

Earlier portfolio non-passes remain indexed in `summary.json`. They are
historical evidence, not alternative live schemas or routing datasets.

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
| canonical routing protocol | `d36390ede2531d585341f37bc93488f07f01f2805eb233744cfcbb2acbf1a089` |
| canonical routing result | `04ad85a546bef0cdb1d2c1d99cab56ba0d9985428619e1e85642b9a860ce19d1` |

## Interpretation limits

- These are synthetic routing and response-quality cases, not production task
  success rates.
- The portable catalogue excludes project-specific skills and most dynamic
  plugin overlays. The selected host probe contains 16 hand-selected entries.
- Model aliases, discovery behaviour, caching and pricing can change. Re-run
  after a material model, host or catalogue change.
- A routing regression establishes only the frozen synthetic cases. The
  enclosing delivery receipt and human retain acceptance and release authority.
