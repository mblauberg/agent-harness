# Anti-AI Thesis Patterns

Use this reference for aggressive removal of synthetic, generic, overpolished, or chatbot-like thesis prose. The goal is authored academic writing, not casual writing.

## Core Test

Ask: would an examiner believe this sentence was written because the thesis needed it, or because a language model filled a paragraph shape?

If the sentence contains no concrete claim, mechanism, evidence, limitation, or transition, delete or rewrite it.

## High-Risk AI Tells

Remove or rewrite:

- em dashes and prose `---`
- `pivotal`, `crucial`, `vital`, `transformative`, `groundbreaking`
- `robust` unless a robustness metric or test is named
- `seamless` almost always
- `cutting-edge`, `state-of-the-art` unless directly supported and cited
- `leverages` when `uses` is enough
- `highlights`, `showcases`, `underscores`, `serves as a testament`
- `in today's rapidly evolving landscape`
- `this section delves into`
- `it is important to note`
- generic `overall` conclusions
- negative parallelism in copula form: `not just X, it is Y`, `isn't merely X, it's Y`. State the claim affirmatively and let the evidence carry the contrast. Reserve explicit contrast for a real measured comparison (`In contrast to the sliding-window baseline, the hierarchical detector retains pinned evidence beyond the window.`)
- copula avoidance: `serves as`, `stands as`, `boasts`, `features`, `represents`, `marks`, `plays a role in` where plain `is`, `has`, or `includes` would do. Keep a stronger verb only when it carries real meaning (`the gate rejects malformed JSON`)
- conjunctive-adverb chaining: stacked `Moreover`, `Furthermore`, `Additionally`, `In addition` as sentence or paragraph openers. Let the logical relation carry the link, or name a real relation. Never open consecutive paragraphs with additive adverbs
- significance-inflation closers: `marks a pivotal moment in`, `sets the stage for`, `represents a key step towards`. End on a concrete consequence, caveat, or next analytic step
- engagement hooks: `Here's the thing`, `The catch?`, and mid-paragraph rhetorical questions. A thesis does not pose questions it already answers
- hedge-and-reassure stacking: more than one qualifier before an assertion (`It is worth noting that, generally speaking, in most cases...`), and the steering cues `notably`, `interestingly`, `importantly` as openers. State the claim once with the single qualifier the evidence warrants
- second-tier inflation vocabulary: `comprehensive`, `holistic`, `multifaceted`, `nuanced`, `intricate`, `meticulous`, `foster`, `harness`, `navigate`, `streamline`, `facilitate`, `myriad`, `plethora`, `paramount`. Replace with the concrete claim (`comprehensive evaluation` becomes `evaluation across the four detector configurations and three baselines`). Use `intricate` or `multifaceted` only if you then enumerate the parts
- limp reporting verbs and stock openers: `records`, `exhibits` for a result, and the `This result [verb]s...` sentence opener. Use a direct verb tied to the metric

## Tells Age With The Models

Treat the vocabulary above as dated examples, not a permanent blocklist; the tells shift with each model generation. The GPT-4 era leaned on `delve`, `tapestry`, `intricate`, `meticulous`, `pivotal`, `underscore`; GPT-4o on `showcasing`, `highlighting`, `fostering`, `enhance`; the GPT-5 era on `emphasising`, `enhance`, `highlighting`, with a cluster of notability and attribution puffery. `delve` fell away sharply through 2025, so its absence is no reassurance.

The em dash is now only partly weakened as a tell. OpenAI tuned GPT-5.1 (November 2025) to suppress it on request, yet it persists by default and in Claude and Gemini output, and it is the markdown artefact that survives a no-formatting instruction. Keep the thesis em-dash ban on prose-quality grounds, but do not read a single em dash as proof of AI.

As the lexical tells fade, the structural ones carry more weight (see Markdown Residue In Prose). Calibrate by flagging clusters and repeated patterns, not a lone word or a single dash.

## Empty -ing Phrases

AI-generated prose often appends vague `-ing` phrases:

```text
The system filters invalid outputs, ensuring reliable evaluation.
```

Better:

```text
The system filters invalid outputs before metric aggregation.
```

Rewrite by naming the actual mechanism or deleting the phrase.

Common weak forms:

- `ensuring reliability`
- `enhancing performance`
- `highlighting relevance`
- `showcasing potential`
- `supporting scalability`
- `driving impact`

## Decorative Tails And Glosses

The empty `-ing` phrase is one case of a wider habit: appending material that rounds off rhythm without carrying a claim. Remove or replace these too.

- Trailing temporal or prepositional padding: `as the dialogue progresses`, `over time`, `throughout the interaction`. Cut it, or state the actual increment (`scores risk turn by turn`).
- Inline comma-gloss definitions: `decision turns, the points where a participant is asked to act, rather than...`. Define the term in a separate sentence, or use a plain parenthetical without the symmetric frame. Splitting the gloss into its own short sentence also repairs rhythm.
- Trailing meta-gap appositives: `X, a comparison the prior work does not make directly`. End on the concrete comparison, not the tidy meta-implication.

## Register Lifts And Personification

- Register-elevated near-synonyms reach for a weightier word than the work needs: `interlocutor` for `sender`, `utterance` for `message`, `leverage` for `use`. Each is individually defensible, but together they read as machine vocabulary. Use the plainest term that fits the domain, and the project's own term where one exists.
- Personifying a system or data structure as an actor in a debate (`the detector takes a different position`, `this approach argues against`) is rhetorical scaffolding, not engineering description. State the mechanism directly.

## Markdown Residue In Prose

Markdown-heavy training data leaves structural habits that outlast the word-level tells. In running thesis prose, avoid:

- bold-emphasised key terms mid-paragraph;
- title-case section headings (use sentence case; see academic-style-au.md);
- a bold term, a colon, then a gloss, repeated as a list of definitions;
- a breakdown split into suspiciously even parts (always three, always four).

## Noun-Stacking And Nominal Compression

The strongest readability tell in technical AI/ML prose is the noun tower: two to four hyphenated or technical premodifiers piled onto an abstract head noun the reader unpacks last (`a class-specific generator prompt stack`, `an author-process register fingerprint`, `corpus-attrition forensics`, `a synthetic-benchmark claimability gate`). Each modifier may be individually correct, yet the stack reads as machine-assembled and slows the reader. Lighten the stack; do not strip the terminology. This habit, not hyphenation or single complex words, is usually the dominant reason dense technical prose "feels AI". Reinhart et al. (2025) put numbers to this: instruction-tuned language models use nominalisations at 1.5 to 2 times, and present-participial clauses at 2 to 5 times (GPT-4o at 5.3 times), the human rate, a stylometric signature of instruction tuning.

- Cap the premodifiers. Carry qualifiers in a relative or prepositional clause instead of bolting them to the front: `an author-process register fingerprint` becomes `a register fingerprint left by how each class was authored`.
- Keep one defined term per phrase. Do not chain two defined terms together; name the term, then describe the rest in plain words.
- Unpack vague container heads. Abstract heads (`envelope`, `surface`, `posture`, `regime`, `landscape`, `forensics`, `boundary`, `profile`) stand in for the concrete figures the reader wants: `a measured local deployment envelope` becomes `the measured size, memory, and latency of the local deployment`; `corpus-attrition forensics` becomes `the analysis of which cases were lost during quality control`.
- Prefer a verb plus a couple of nouns over a noun pile. A process noun carrying modifiers usually reads better as a verb: `passive on-device risk scoring` becomes `passively scoring risk on the device`; `the per-round federated communication payload` becomes `the bytes each federated round sends`.
- Release heavy nominalisation. A verb buried in an `-ion`/`-ment`/`-ance` noun usually reads better freed: `Failure of a validity gate should narrow the claim` becomes `When a validity gate fails, the claim should be narrowed`; `the attribution of the result to memory` becomes `attributing the result to memory`.
- Avoid noun-versus-noun contrasts with no verb (`a testable hypothesis, not a derived optimum` becomes `a hypothesis to be tested, not an arrangement proven optimal`) and noun-tower section headings (`Raw-data Non-centralising Deployment Considerations` becomes `Keeping Raw Data Off the Server`).

Fix each recurring tower once and reuse one phrasing across the thesis; restacking the same defined term differently on every mention compounds the load. Keep defined terms (`register fingerprint`, `0.75 audit ceiling`, `LoRA`, `function-word AUC`) and honest negatives intact while you lighten the prose around them.

## Fake Analysis

Avoid sentences that gesture at interpretation without evidence.

Weak:

```text
These findings underscore the importance of memory-aware detection in modern scam defence.
```

Better:

```text
The memory-aware detector is compared with sliding-window and flat-retrieval baselines to isolate whether structured memory changes decision-turn AUPRC.
```

## Over-Neat Symmetry

AI prose often uses balanced structures too often:

- `not only X, but also Y`
- three examples in every list
- every paragraph ending with a broad implication
- every section opening with a definition
- repeated `X is critical because Y` rhythm
- false ranges: `from X to Y` where the poles are not real endpoints of one spectrum (`from data ingestion to insight generation`). List the actual items or name the real dimension. Use `from X to Y` only for a genuine measured range (`accuracy ranged from 0.79 to 0.98 across configurations`)
- negative-parallelism padding: `it is not just X, it is Y`, or `X rather than Y` used as a rhythmic flourish rather than a real contrast

Repair:

- Use the natural number of examples.
- Treat two balanced triads (`A, B, and C`) in one paragraph as a hard flag. Vary the item count so lists are sometimes two, sometimes four or five.
- Let some sentences be short.
- Let a paragraph end on a limitation or concrete next step.
- Repeat the precise technical term instead of varying it.

## Academic-Safe Humanising

Humanising thesis prose means making it more specific and less templated. It does not mean adding slang, jokes, anecdotes, contractions, or deliberate roughness.

Use:

- specific mechanisms
- uneven but purposeful sentence length
- direct topic sentences
- concrete limitations
- precise cross-references
- modest claim language

Avoid:

- fake personality
- casual idioms
- rhetorical questions
- invented examples
- inflated certainty

## Meta-Discourse And Absence Announcements

Write about the subject, not about the document or the act of writing it. Cut report-referential and instructional framing:

- `for this thesis report`, `in this report`, `this write-up`, `the aim of this report is to`. A thesis is a thesis, not a report or an assignment.
- `as part of this thesis we will be looking at`, `the present study sets out to`, `as the reader will see`, decorative `as mentioned earlier`.
- process narration: `we will now discuss`, `having covered X, we turn to Y`.

Keep the one legitimate form: a direct statement of content or contribution whose subject is the work, not the document (`This thesis presents a hierarchical-memory detector...`, `The next section defines the decision-turn scope`). Specific and minimal is fine; hollow and ceremonial is not.

Never announce an absence that exists only because an instruction removed content. When asked to cut X, or to leave X unmentioned for a reason, omit it silently. Do not write a tombstone:

Wrong (leaks the editing instruction):

```text
Federated results are not discussed here because that section was removed.
```

The test: would this sentence exist if no one had asked to remove anything? If it exists only to justify an omission to an editor or marker, or it echoes the editing rationale, delete it.

A genuine, author-owned scope boundary is different and may stay, when it answers a question an examiner would actually ask and the reason is about the research, not the editing process:

```text
No federated result table is presented because the extension lacks a claimable artefact.
```

In a dialogue-style passage (a response to reviewers, or viva preparation), drop RLHF flattery openers: `You are absolutely right`, `Great question`, and validating the premise before answering. These are reduced but not gone in GPT-5.x and Claude 4.5 and later.

## Repo And Implementation Jargon

Implementation, pipeline, and tooling vocabulary leaks into thesis prose when the writing is drafted from a codebase. It reads as internal process language, not scholarship. Translate it to plain academic terms, and keep only a term the thesis has explicitly defined.

- `audit` for an analysis is repo language: rename the analytical act to `analysis` (`post-hoc audit` -> `post-hoc analysis`, `separability audit` -> `separability analysis`) and pipeline gate or process names to `check`/`review` (`shortcut-baseline audits` -> `shortcut-baseline checks`, `release-candidate auditing` -> `release-candidate review`). Keep an explicitly defined term unchanged (for example a named `0.75 audit ceiling` threshold).
- Other common leaks: `gate`, `lane`, `shard`, `pipeline run`, `hard block fired`, `flag set`, status enums, file and function names, and ticket or ADR numbers in body prose. Name the concept, not the mechanism: `no release-blocking check was enforced`, not `no hard block fired`. Precedence: a gate the thesis has explicitly defined as a method step (a claimability gate, a validity gate) stays; only the build-process sense (`run the gate`, `the gate fired`) is the jargon to translate.
- Instructional or build-process register: `run the gate`, `promote the artefact`, `the manifest pins`. State the research fact; move operational detail to an appendix or a methods sentence where it earns its place.
- State-machine and runbook register: `stood down` (say `was not run` or `was not completed`), `smoke test`/`wrapper script`/`gate-passing` strung together as build steps, component handles such as `backend selector` or `federated driver` (name the function: `the detector exposes one interface over several back-ends`, `the federated simulation`), and literal regexes, file paths, or CLI commands sitting in running prose (state the rule in words and move the literal to a footnote or appendix). Status enums such as `WEAK_RIGHTLY_KILLED` are never prose.

## Positive Form Is Not Positive Spin

Strunk's positive-form rule (Rule 11, 1918 edition) removes tame, evasive, colourless negatives (`did not support a ranking` -> `bounds the result to capability and calibration`). It must never soften an honest limitation, failure, or withheld claim into reassurance. A measured budget overrun stays an overrun; a method that missed a defect stays a miss; an unestablished claim stays withheld. Positive *form* (a definite, direct assertion) is the target; positive *spin* (a rosy reading of a real weakness) is itself an AI tell and a defect. After a results-framing change, also sweep for half-pivot residue: structure, section order, and headings often lag the rephrase and keep promising what the new framing withdrew. When a negative is honest and cannot go positive without softening it, leave it. See Positive Form in concision-and-structure.md for the matching style rule.

## On AI Detectors

Do not edit thesis prose to lower an AI-detector score: a score is a signal for inquiry, not proof, and the traits that make prose look machine-written (low lexical variability, flat rhythm, inflated register) are the ones this skill already fixes for better scholarship. Detector accuracy is uneven and falls hardest on the formal, non-native, short, or paraphrased prose a thesis often contains.

The evidence, in brief: Liang et al. (2023) found GPT detectors flagged 61 per cent of non-native English essays as AI, falling to about 12 per cent once the vocabulary was enriched; 2025 benchmarks put Pangram near a zero false-positive rate while older perplexity tools stayed unreliable; Turnitin claims a false-positive rate below 1 per cent for flagged documents but independent tests report higher, and Vanderbilt, Pittsburgh and Cornell have disabled or discounted it since August 2023; provider watermarking (Google SynthID-Text, 2024) marks only specific models and weakens under paraphrase, so it cannot prove arbitrary prose is human-written.

Consequences for thesis work:

- `Looks AI` is not proof, and a high detector score is not evidence of anything.
- Never strip correct passive voice, formal register, technical precision, or legitimate phrasing solely to appease a tool.
- If a supervisor or panel relies on a detector, answer with the artefacts and the drafting record (version control, dated decisions), not by degrading the prose.

## Common Before/After Patterns

Before:

```text
This chapter explores the robust methodological framework used to evaluate the system, highlighting its effectiveness in supporting reliable detection.
```

After:

```text
This chapter defines the evaluation protocol for the detector. It specifies the reviewed dataset, comparator systems, decision-turn scope, metrics, and evidence gates used for claimable results.
```

Before:

```text
The proposed approach leverages hierarchical memory to provide a comprehensive and scalable solution to romance scam detection.
```

After:

```text
The detector uses hierarchical memory to retain recent turns alongside longer-range summaries and pinned evidence. The evaluation tests whether this memory structure improves detection against sliding-window and flat-retrieval comparators.
```

Before:

```text
The results demonstrate that the framework is highly effective.
```

After:

```text
The result supports the tested comparison only if the corresponding claim row is backed by a gate-passing evidence bundle.
```

## Final AI-Scrub Checklist

Make one final pass against the catalogue above, not a second copy of it. Sweep, in order: High-Risk AI Tells, Tells Age With The Models, Empty -ing Phrases, Decorative Tails And Glosses, Register Lifts And Personification, Markdown Residue In Prose, Noun-Stacking And Nominal Compression, and Meta-Discourse And Absence Announcements. Then confirm the two checks that live only here:

- No em dash, and no colon reproducing an em-dash pivot.
- Every sentence carries a claim, method, evidence, limitation, or necessary transition, and the passage has at least one short sentence.
