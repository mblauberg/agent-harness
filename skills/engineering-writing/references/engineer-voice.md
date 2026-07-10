# Writing Like an Engineer, Not Like AI

Use this reference when text sounds artificial, generic, promotional, overpolished, or padded. The goal is prose that reads as if a competent engineer wrote it to get something done: specific, plain, owned, and honest about what is and is not known.

## The core test

For each sentence ask: would an engineer write this because the document needed it, or did a language model produce it to fill a shape? If the sentence carries no fact, mechanism, number, decision, caveat, or necessary transition, cut it or replace it with one that does.

A shorter or smoother edit is not automatically better. Reject any edit that drops a condition, number, actor, or obligation, that turns an exact claim into a vague benefit, or that varies a technical term for style.

## How to read the tiers

No single word or mark proves machine drafting; density, clustering, and convergence of signals are the signal. Work in three tiers: remove artefacts outright, cap density signals, and police structural tells hardest, because structural tells survive synonym swaps and register changes.

The word-level vocabulary also shifts each model generation (`delve`, `tapestry`, `intricate` in the GPT-4 era; `showcasing`, `fostering`, `enhance` later; `emphasising` and notability puffery more recently). `delve` fell away sharply through 2025, so its absence is no reassurance. Treat the word lists below as dated examples, not a permanent blocklist; flag clusters and repeated patterns, not one lone word. As the lexical tells fade, the structural ones carry more weight.

## Tier 1: artefacts (remove on sight)

These have no legitimate register value in engineering prose.

**Chatbot framing.** Delete openers that talk to the reader instead of starting the content: `Sure`, `Of course`, `Great question`, `You're absolutely right`, `Let's dive in`, `I hope this helps`, `Here's what you need to know`, `In today's fast-paced world`. Also prompt restatement, knowledge-cutoff or refusal text, and `As an AI language model`.

**Throat-clearing and meta-discourse.** Cut `It is important to note`, `It should be noted`, `It is worth mentioning`, `As previously mentioned`, `In this document we will`, `This section explains`. Write about the subject, not about the act of writing. `This guide explains how to configure the worker` becomes `Configure the worker.`

**Tool and markup residue.** Literal tool strings (`turn0search0`, `oaicite`, `oai_citation`, `contentReference`, `attributableIndex`), `utm_source=chatgpt.com` in link URLs, stray `**bold**` markers or `#` headings in rendered prose, curly quotes inside code or commands (they break copy-paste; code takes straight quotes only), and emoji in documents whose repository does not already use them.

**Fabricated references.** Never name a package, API, method, flag, config key, version, or URL you have not verified against the codebase or its documentation; hallucinated identifiers are both a defect and the strongest tell reviewers now check for. If it cannot be verified now, mark it `[FLAG: verify]`.

**Internal process language in deliverables.** Agent, build, or workspace vocabulary leaking into reader-facing text: `the subagent found`, `the workflow ran`, `gate fired`, `per the manifest`, `the review pass confirmed`, status enums, ticket numbers as prose. Translate to the engineering fact or cite the actual source: `the load test recorded ...`, not `the perf agent reported ...`. Unresolved placeholders (`TODO`, `TBD`, `TBC`, `FIXME`, `insert value`, `drafting note`) are fine in working drafts and code, and a defect in anything sent to a client, stakeholder, or release.

## Tier 2: density signals (a cluster is the tell)

Each item is legitimate in isolation; a pile of them in one passage is machine texture.

**Puffery adjectives.** Cut unless a metric or test backs them: `crucial`, `pivotal`, `vital`, `essential`, `robust`, `seamless`, `powerful`, `comprehensive`, `holistic`, `cutting-edge`, `state-of-the-art`, `world-class`, `game-changing`, `transformative`, `next-generation`. `robust` is allowed only next to a named robustness test; `comprehensive evaluation` becomes `evaluation across the four configurations and three baselines`.

**Second-tier inflation vocabulary.** `leverage` (use `use`), `utilise`, `facilitate`, `foster`, `harness`, `navigate`, `streamline`, `nuanced`, `multifaceted`, `myriad`, `plethora`, `paramount`, `delve into`. Replace each with the plain word or the concrete claim. Collapse ceremonial doublets to the operative word: `each and every` becomes `each`; `first and foremost` becomes `first`; `any and all` becomes `any`.

**Copula avoidance.** `serves as`, `stands as`, `acts as`, `boasts`, `features`, `represents`, `plays a role in` where plain `is`, `has`, or `includes` would do. Keep a stronger verb only when it carries real meaning (`the gate rejects malformed JSON`).

**Register lifts and personification.** Reaching for the weightier near-synonym the work does not need (`utilise` for `use`, `commence` for `start`, `interlocutor` for `caller`); each is defensible alone, together they read as machine vocabulary. Use the plainest term the domain allows, and the project's own term where one exists. Do not personify systems as actors in a debate (`the architecture argues for`, `this approach takes a different position`); state the mechanism.

**Interpretation-smuggling verbs.** `underscores`, `showcases`, `highlights`, `demonstrates`, `reflects`, `serves as a testament to`, `plays a vital role in`, `speaks to`. If the interpretation matters, attribute or evidence it. If not, delete it.

**Vague benefit claims.** `streamlines workflows`, `enhances reliability`, `improves productivity`, `drives impact`, `supports scalability`, `ensures quality`. Replace with what changed: `p99 latency dropped from 800 ms to 210 ms`, `retries now stop after 3 attempts`, `the command exits non-zero on failure`.

**Empty `-ing` tails.** `The system filters invalid input, ensuring reliable evaluation` becomes `The system filters invalid input before metric aggregation.` Name the mechanism or cut the tail. Common weak forms: `ensuring reliability`, `enabling scalability`, `allowing for flexibility`, `highlighting relevance`.

**Decorative tails and glosses.** Trailing temporal or prepositional padding (`over time`, `as the system evolves`, `throughout the process`): cut it or state the actual increment. Inline comma-gloss definitions (`decision points, the places where an operator must act, rather than ...`): define the term in its own short sentence or a plain parenthetical. Trailing meta-gap appositives (`X, a comparison the existing docs do not make`): end on the concrete point, not the tidy meta-implication.

**Formulaic contrast and symmetry.** `not just X, but Y`, `more than just`, `it's not only ... it's ...`, `from X to Y` where the poles are not a real range (`from ingestion to insight`); use `from X to Y` only for a genuine measured range. Every list does not have three items; vary the count.

**Fake conclusions.** `In summary`, `In conclusion`, `Overall`, `Ultimately`, `This highlights the importance of`, and the `despite challenges ... the future outlook` closing formula. End on the concrete decision, risk, number, or next action.

**Vague authority.** `industry reports suggest`, `it is widely accepted`, `many teams find`, `observers note` with no citation. Name the source or drop the appeal.

**Conjunctive-adverb chaining.** Stacked `Moreover`, `Furthermore`, `Additionally`, `In addition` as sentence or paragraph openers. Let the logical relation carry the link, or name it. Never open consecutive paragraphs with additive adverbs.

**Hedge-and-reassure stacking.** More than one qualifier before a claim (`It is worth noting that, generally speaking, in most cases...`), and steering cues `notably`, `interestingly`, `importantly` as openers. State the claim once with the single qualifier the evidence warrants.

## Tier 3: structural tells (police hardest)

Word-independent patterns; they survive synonym swaps, and formal register does not excuse them.

- **Metronome rhythm.** Uniform sentence and paragraph length. Fix by varying length deliberately and landing the operative point in the shortest sentence.
- **Over-signposting.** A connective opening every paragraph, plus meta-signposts (`As mentioned earlier`, `Having covered X, we turn to Y`). Prefer substantive connectors (`Because the cache is write-through, ...`) and delete the rest.
- **Both-sides seesaw.** `On the one hand ... on the other` ending noncommittally. A trade-off section that never lands a recommendation is an AI tell and weak engineering at once. Commit to the option the evidence supports; a named, specific contrast is fine.
- **Hollow topic sentences.** Openers that restate the heading without adding a checkable proposition.
- **Recap endings.** Conclusions that restate what was said. End on the decision, risk, number, or next action.
- **Evenly weighted lists.** Every bullet the same length regardless of importance, and the `bold term: gloss` bullet as every section's default shape. Genuine enumerations (steps, API fields, config keys) correctly stay parallel.
- **Sentence-ending participle synthesis.** `, highlighting ...`, `, underscoring ...`, `, reflecting ...` appending an unsourced conclusion to a factual sentence. Stop at the fact, or make the conclusion its own supported sentence.
- **Template sections.** Every section built the same way (preview, three equal blocks, recap). Swap test: if the paragraphs of a section can be reordered without breaking anything, the section has no load-bearing spine.
- **Uniform confidence.** The same assertive register across strong and weak claims flattens the writer's most useful signal. See Calibrated confidence below.
- **Unanchored claims.** Polished prose with nothing checkable: no number, command, file path, error text, measurement, or code reference. Specific anchors and honest negatives are the strongest human signals available.

## Markdown residue in prose

Training on Markdown leaves structural habits that outlast the word-level tells:

- bold-emphasised key terms mid-sentence (`the **cache** stores...`);
- a bold term, a colon, then a gloss, repeated down the page as a fake definition list;
- Title Case headings (developer-doc consensus is sentence case: Google, Microsoft, GitLab), skipped heading levels (H2 straight to H4), and horizontal rules before headings;
- tables where prose or a list would do, as a default shape;
- everything broken into suspiciously even parts (always three bullets, always four).

The em dash is the Markdown artefact that survives a "no formatting" instruction. Ban it on quality grounds (see australian-english.md), but do not treat a single dash as proof of AI. Do not "fix" a banned em dash by replacing it with a colon, spaced hyphen, or semicolon that reproduces the same dramatic pivot.

## Noun-stacking (the strongest tell in technical prose)

The noun tower is two to four premodifiers piled on an abstract head noun the reader unpacks last: `a class-specific generator prompt stack`, `per-round federated communication payload`, `corpus-attrition forensics`. Each word may be correct, yet the pile reads machine-assembled. This, not hyphenation or long words, is usually why dense technical writing "feels AI".

- Cap the premodifiers. Move qualifiers into a relative or prepositional clause: `a register fingerprint left by how each class was authored`, not `an author-process register fingerprint`.
- Unpack vague container heads (`envelope`, `surface`, `posture`, `landscape`, `forensics`): `the measured size, memory, and latency of the local deployment`, not `the measured local deployment envelope`.
- Prefer a verb plus a couple of nouns: `passively scoring risk on the device`, not `passive on-device risk scoring`.
- Free the buried verb from `-ion`/`-ment` nouns: `when a validity gate fails, narrow the claim`, not `failure of a validity gate should narrow the claim`.
- Fix each recurring tower once and reuse the repaired phrasing; restacking the same concept differently on every mention compounds the load.

Keep defined terms and honest negatives intact while you lighten the prose around them.

## Additive drafting

Additive drafting is the habit of adding another sentence because the text feels incomplete, then joining it with a neutral connector. It produces padded READMEs, PRs, and reports. Before adding a sentence, name the new job it does for the reader. Treat these as failed reasons for adding text: `sets the scene`, `sounds more complete`, `adds a transition`, `makes the tone warmer`, `summarises what was just said`, `explains the obvious consequence`. In a rewrite, condense, or scrub pass, a net addition is a warning sign: cut again, or state the specific fact, condition, or step that required the extra words.

## Defensive over-qualification

The mirror of hedge stacking: the writer, worried the reader will over-read a point, wraps it in pre-emptive disclaimers no one asked for. Symptoms: a sentence that first states what the change does not do, then what it does, then how little is claimed for it; re-listing every case a fix does not cover when one clean scope statement carries the boundary; closers that re-soften a point already made.

Cut or keep test: would removing the words remove a real boundary (a scope limit, an untested case, a known failure mode, a compatibility constraint), or only remove anxiety? Keep the one qualifier that defines a genuine boundary; cut the repetition around it. `Not load-tested above 500 concurrent users` stays. `This may not be perfect and there could be edge cases we haven't considered` goes.

## Calibrated confidence

Match assertion strength to evidence strength, sentence by sentence. Uniform confidence reads as machine tone and wastes the reader's trust; intensifiers (`clearly`, `obviously`, `undoubtedly`) cost credibility rather than adding it. State strong claims plainly with their evidence (`the regression is caused by the N+1 query; the trace shows 400 identical SELECTs`). Give weak claims one located qualifier (`this appears racy under load; not yet reproduced in CI`). Never flatten both to the same middle register, and never dress a hypothesis as a finding.

## Positive habits (what to do instead)

- **Concrete verbs and nouns.** `The parser rejects malformed JSON` beats `The parser handles input appropriately`.
- **Specific numbers and identifiers.** Exact values, versions, limits, error codes, file paths. `Times out after 30 s` beats `may take a while`.
- **Comparatives carry their number.** Ban bare `faster`, `better`, `improved`, `higher` on their own; give the measurement or point to it (see the claim discipline section in style-standard.md).
- **First-person ownership of decisions.** `We chose Postgres over DynamoDB because the access pattern is relational and joins dominate.` Engineers own their calls; passive fog (`it was decided`) hides the actor and the reasoning.
- **Say what was NOT done.** `Not load-tested above 500 concurrent users`, `Retry logic is out of scope for this PR`, `We did not migrate the legacy rows`. Honest negatives are high-value and distinctly human.
- **Varied sentence length.** Let a short sentence land the operative point after a longer one. Do not enforce a target average; do not add roughness for its own sake.
- **Plain assertions over hedged ones.** State the claim, then the single qualifier the evidence warrants. `The cache is invalidated on write` beats `It could potentially be the case that the cache may be invalidated`.
- **One term per concept.** Repeat the precise technical noun; do not synonym-cycle `endpoint`/`route`/`URL` for variety. Consistency beats elegant variation in engineering prose.
- **Distinguish observation from interpretation.** `CPU sat at 100% for 4 minutes` (observed) versus `the regex is likely catastrophic-backtracking` (inferred). Mark the inference.

## Honest uncertainty, not false confidence and not false modesty

Use direct uncertainty words: `appears`, `likely`, `unknown`, `not measured`, `not verified`, `assumed`. If a claim lacks support, narrow it or flag it: `[FLAG: verify]`. Positive form (Strunk's rule) means a definite, direct assertion; it does not mean positive spin. A budget overrun stays an overrun; a missed defect stays a miss. Never soften a real weakness into reassurance.

Never announce an absence that exists only because an instruction removed content. When asked to cut X, omit it silently; do not write a tombstone (`X is not covered here because that section was removed`). The test: would this sentence exist if no one had asked to remove anything? A genuine, author-owned scope statement is different and stays (`Windows support is out of scope; the file-locking model differs`).

## What humanising is not

Do not add slang, jokes, invented anecdotes, rhetorical questions, contractions-for-flavour, fake personality, or deliberate messiness. Clear, plain, consistent, specific writing is the target.

Do not edit to beat an AI detector. A detector score is not evidence: detectors false-positive hardest on exactly the disciplined, formal, consistent prose good engineering writing produces, and the traits that genuinely read as machine-written (flat rhythm, low specificity, inflated register, unanchored claims) are the ones this reference already removes. Never strip correct passive voice, repeated defined terms, or technical precision to appease a tool; every register-safe fix is a substance fix (anchors, specifics, varied rhythm, calibration, cuts).

## Final scrub

One pass, in order: Tier 1 artefacts, then the Tier 2 sweep (puffery, inflation, copula avoidance, interpretation-smuggling, vague benefits, `-ing` tails, decorative tails, symmetry, fake conclusions, adverb chaining, hedge stacking), then the Tier 3 structural tells, Markdown residue, and noun towers. Then confirm: no em dash (and no colon or spaced hyphen reproducing an em-dash pivot); every sentence carries a fact, mechanism, decision, caveat, or transition; at least one short sentence in the passage; the actor of each decision is visible; confidence is calibrated, not flat.

**Final self-audit.** Before returning the text, name the single concrete remaining defect, if any: unanchored claim, flat rhythm, noun tower, false transition, uniform confidence, recap ending, internal process language, dropped caveat. If no concrete defect can be named, stop. Fix defects, not style anxiety; do not keep rewriting to satisfy a vague feeling that the text should sound more human.
