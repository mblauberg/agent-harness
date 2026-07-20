# Writing Like an Engineer, Not Like AI (engineering overlay)

Load the `natural-writing` skill first for its hub taxonomy: the tiered
artefact/density/structural sweep, noun-stacking,
Markdown residue, additive drafting, defensive over-qualification, and
calibrated confidence. This file adds only the engineering-specific
material: internal process language in deliverables, positive habits with
engineering examples, and the domain final scrub.

## The core test

For each sentence ask: would an engineer write this because the document
needed it, or did a language model produce it to fill a shape? Apply the
hub's Core Test the same way; this is the engineering framing of it.

## Internal process language in deliverables (Tier 1 addition)

Agent, build, or workspace vocabulary leaking into reader-facing text: `the
subagent found`, `the workflow ran`, `gate fired`, `per the manifest`, `the
review pass confirmed`, status enums, ticket numbers as prose. Translate to
the engineering fact or cite the actual source: `the load test recorded
...`, not `the perf agent reported ...`. Unresolved placeholders (`TODO`,
`TBD`, `TBC`, `FIXME`, `insert value`, `drafting note`) are fine in working
drafts and code, and a defect in anything sent to a client, stakeholder, or
release.

## Positive habits (what to do instead)

- **Concrete verbs and nouns.** `The parser rejects malformed JSON` beats
  `The parser handles input appropriately`.
- **Specific numbers and identifiers.** Exact values, versions, limits,
  error codes, file paths. `Times out after 30 s` beats `may take a while`.
- **First-person ownership of decisions.** `We chose Postgres over DynamoDB
  because the access pattern is relational and joins dominate.` Engineers
  own their calls; passive fog (`it was decided`) hides the actor and the
  reasoning.
- **Say what was NOT done.** `Not load-tested above 500 concurrent users`,
  `Retry logic is out of scope for this PR`. Honest negatives are high-value
  and distinctly human.
- **One term per concept.** Repeat the precise technical noun; do not
  synonym-cycle `endpoint`/`route`/`URL` for variety. Consistency beats
  elegant variation in engineering prose.
- **Distinguish observation from interpretation.** `CPU sat at 100% for 4
  minutes` (observed) versus `the regex is likely catastrophic-backtracking`
  (inferred). Mark the inference. See the claim-discipline overlay in
  `style-standard.md` for the full schema.

## Honest uncertainty

Use direct uncertainty words: `appears`, `likely`, `unknown`, `not
measured`, `not verified`, `assumed`. If a claim lacks support, narrow it or
flag it: `[FLAG: verify]`. A budget overrun stays an overrun; a missed
defect stays a miss. Never soften a real weakness into reassurance; see
Positive form is not positive spin in the hub taxonomy.

## What humanising is not

Do not add slang, jokes, invented anecdotes, rhetorical questions,
contractions-for-flavour, or fake personality. Clear, plain, consistent,
specific writing is the target. Do not edit to beat an AI detector: see the
hub taxonomy's detector guidance.

## Final scrub

Run the hub taxonomy's Final scrub and Final self-audit against the whole
document. This skill adds no further checklist; the internal-process-language
sweep above is the only engineering-specific addition to it.
