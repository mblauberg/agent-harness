# Anti-AI Thesis Patterns (academic overlay)

Load the `natural-writing` skill first for its hub taxonomy: the tiered
artefact/density/structural sweep, additive drafting,
defensive over-qualification, calibrated confidence, the positive-form
integrity guard, absence tombstones, and the final scrub checklist. This
file adds only the
thesis-specific material the hub does not cover: noun-stacking with
technical-thesis examples, repo/implementation jargon leaking into academic
prose, and viva/dialogue register.

## Core Test

Ask: would an examiner believe this sentence was written because the thesis
needed it, or because a language model filled a paragraph shape? Apply the
hub's Core Test the same way; this is the thesis framing of it.

## Noun-Stacking In Thesis Prose

The hub's noun-stacking fix applies directly. Thesis-specific examples:
`a class-specific generator prompt stack`, `an author-process register
fingerprint`, `corpus-attrition forensics`. Fix each recurring tower once
and reuse one phrasing across the thesis; restacking the same defined term
differently on every mention compounds the load. Keep defined terms
(`register fingerprint`, `0.75 audit ceiling`, `LoRA`, `function-word AUC`)
and honest negatives intact while lightening the prose around them.

## Repo And Implementation Jargon

Implementation, pipeline, and tooling vocabulary leaks into thesis prose
when the writing is drafted from a codebase. It reads as internal process
language, not scholarship. Translate it to plain academic terms, and keep
only a term the thesis has explicitly defined.

- `audit` for an analysis is repo language: rename the analytical act to
  `analysis` (`post-hoc audit` -> `post-hoc analysis`) and pipeline gate or
  process names to `check`/`review` (`shortcut-baseline audits` ->
  `shortcut-baseline checks`). Keep an explicitly defined term unchanged
  (for example a named `0.75 audit ceiling` threshold).
- Other common leaks: `gate`, `lane`, `shard`, `pipeline run`, `hard block
  fired`, `flag set`, status enums, file and function names, and ticket or
  ADR numbers in body prose. Name the concept, not the mechanism: `no
  release-blocking check was enforced`, not `no hard block fired`.
  Precedence: a gate the thesis has explicitly defined as a method step (a
  claimability gate, a validity gate) stays; only the build-process sense
  (`run the gate`, `the gate fired`) is the jargon to translate.
- Instructional or build-process register: `run the gate`, `promote the
  artefact`, `the manifest pins`. State the research fact; move operational
  detail to an appendix or a methods sentence where it earns its place.
- State-machine and runbook register: `stood down` (say `was not run` or
  `was not completed`), internal component handles (name the function
  instead), and literal regexes, file paths, or CLI commands sitting in
  running prose (state the rule in words and move the literal to a footnote
  or appendix). Status enums are never prose.

## Viva And Reviewer Dialogue

In a dialogue-style passage (a response to reviewers, or viva preparation),
drop generic flattery openers such as `You are absolutely right` and `Great
question`. Answer the substantive point directly. The hub's chatbot-framing
rule applies, but this is the register where it is most likely to appear.

## Final AI-Scrub Checklist

Run the hub's Final scrub and Final self-audit against the whole draft, then
confirm the two checks that live only here:

- No em dash, and no colon reproducing an em-dash pivot.
- Every sentence carries a claim, method, evidence, limitation, or necessary
  transition, and the passage has at least one short sentence.
