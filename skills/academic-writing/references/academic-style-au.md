# Australian Academic Style

Use this reference when a thesis section needs Australian English, academic register, punctuation control, or final style consistency.

## Baseline Register

Thesis prose should be formal enough for examination and direct enough to read easily. It should not sound like marketing copy, a tutorial, a grant pitch, or a chatbot answer. The ideal register is calm, exact, and authored.

Prefer:

```text
The reviewed corpus constrains the evaluation to decision turns. Context-only turns update memory but do not enter the primary AUPRC denominator.
```

Avoid:

```text
This robust and innovative evaluation framework seamlessly ensures that the system delivers meaningful insights across the broader research landscape.
```

## Australian English

Use Australian spelling unless preserving a title, quoted text, code identifier, package name, API field, citation key, or filename.

Common forms:

- `analyse`, `analysed`, `analysing`
- `organise`, `organised`, `organising`
- `recognise`, `recognised`, `recognising`
- `optimise`, `optimised`, `optimising`
- `behaviour`, `colour`, `favour`
- `centre`, `metre`, `litre`
- `modelling`, `labelling`, `travelling`

Further spelling rules: -yse, not -yze (analyse, paralyse, catalyse). Noun/verb pairs split: licence (noun) / license (verb), practice (noun) / practise (verb). Use program in all senses, not programme. When Macquarie lists variants, take the first-listed headword (the most common form); Macquarie lists -ise before -ize, so use -ise and -isation.

Use `per cent` in running prose when the value is not a compact metric expression. Use `%` in tables, equations, metric lists, captions with numeric data, and technical values. The Style Manual digital edition now prefers the % symbol with a numeral (no space, `30%`) and has dropped the explicit per-cent option, but a thesis is academic writing, not government web copy, so per cent in running prose stays acceptable: pick one convention and hold it. Per cent is the adverb; percentage is the noun.

Numbers: spell out only zero and one; use numerals from 2 upward, except at the start of a sentence (recast, or spell out the opening number). Keep one convention per document. Write dates as day month year (25 December 2026).

## Punctuation

Do not use em dashes. In thesis prose they often create synthetic rhythm and over-dramatic pivots. Replace by function:

- Aside: parentheses or commas. The Australian Government Style Manual replaces the unspaced em dash with a spaced en dash ( – , typed in LaTeX as `--` with a space each side) for asides, because the em dash is not Australian Government style and a screen reader can misread the unspaced form as a hyphen. Use it sparingly, so it does not smuggle the em-dash beat back in.
- Explanation: a new sentence, or a colon only before a list or definition (see the colon rule below).
- Contrast: `but`, `yet`, semicolon, or a new sentence.
- Range: prefer words in prose (`to`, `from ... to`, `between ... and`); use an unspaced en dash (LaTeX `--`, no surrounding spaces) for ranges in tables, captions, display text, and space-limited contexts (`2024--2026`, `12--18 turns`).
- Compound modifier: hyphen where standard.

Avoid prose `---` in LaTeX text. It renders as an em dash. Preserve `--` only where it is a legitimate en dash in a range or label and the surrounding style expects it.

Banning the em dash does not license moving its rhythm into a colon. Use a colon only to introduce a list or a definition, never as a dramatic pivot or reveal (`the detector takes a different position: it retains...`). For a pivot, use a full stop or a plain clause. Modern detection keys on the qualifying-pivot pattern, not just the dash character, so displacing the same beat into a colon or a double hyphen leaves the tell intact.

## Hyphenation (Australian English)

Be sparing. The hyphen is a clarity tool, not decoration. Australian usage (Style Manual, Macquarie) defaults to open or closed forms and reserves the hyphen for genuine need. A high count of *correct* before-noun technical compounds is good engineering prose, not a defect, so do not mass-de-hyphenate established terms (`on-device`, `low-rank`, `held-out`, `function-word`, `fine-tuning`, `end-to-end`). Ordinary inter-word hyphens are not the em-dash tell; do not edit them to chase a detector.

- Hyphenate a compound modifier only before the noun it modifies (`a low-rank adaptation`, `an on-device model`, `function-word features`); open it after the noun or in predicate position (`the adaptation is low rank`, `inference runs on device`).
- Never hyphenate an `-ly` adverb plus adjective or participle, in any position (`fully connected layer`, `randomly sampled subset`, `clearly defined cue`, not `fully-connected`, `clearly-defined`). This is the strongest American/AI over-hyphenation tell; keep it at zero. The only fixed exceptions are `fully-fledged` and `fully-fashioned`.
- Prefer the closed form for established compounds: `dataset`, `baseline`, `runtime`, `preprocessing`, `online`, `codebase`, `metadata`, `coordinate`, `cooperate`, `revictimisation`. Note the split for cash flow (noun) / cashflow (verb): Macquarie lists `cash flow` as the noun and `cashflow` only as the verb, and a thesis mostly uses the noun. Follow your chosen dictionary when unsure.
- Hyphenate to prevent a misreading (`re-cover` vs `recover`), and keep one prefixed spelling throughout: do not write both `re-victimisation` and `revictimisation`.
- Do not stack three-or-more-word hyphen chains or `versus`-joined modifiers (`IID-versus-non-IID`, `financial-romance-fraud`, `detector-claim-manifest`); recast as a prepositional phrase. Repeat the base word instead of hanging hyphens (`full-time and part-time`, not `full- and part-time`).

## Tense

Use tense deliberately:

- Present tense for established knowledge, thesis structure, equations, and system properties: `The detector rejects invalid outputs.`
- Past tense for completed experiments: `The model was trained on the reviewed split.`
- Present perfect for work that remains relevant: `Prior work has treated scam detection as a text classification problem.`
- Future tense for actual future work only. Avoid using future tense to hide missing results.

## Person And Voice

Most engineering theses use impersonal phrasing, but passive voice is not mandatory. Choose by clarity:

- Active voice when the actor matters: `The evaluation script rejects malformed JSON.`
- Passive voice when the artefact or result matters: `Predictions were filtered before aggregation.`
- First person only if the thesis, school style, or supervisor expects it.

Do not make every sentence passive. Passive-heavy prose hides causality and creates stale rhythm.

## Paragraph Rhythm

A good thesis paragraph usually has:

1. A topic sentence with the point.
2. Evidence, mechanism, comparison, or method detail.
3. A short consequence, caveat, or link to the next paragraph.

Avoid uniform paragraph architecture across a whole chapter. Not every paragraph needs three sentences, a citation in the same position, or a concluding phrase. Vary sentence length where it helps the argument, but do not add fake personality.

### Sentence Rhythm (Operational Test)

Flat, uniform sentence length is the strongest signal a modern reader or detector keys on. Model output clusters tightly around one length; human prose is bursty and mixes short with long, a well-documented stylometric contrast. Grammatical correctness does not fix this: a passage where every sentence runs 31 to 38 words reads as generated even when each sentence is sound.

Apply a concrete test to any multi-sentence passage (abstract, paragraph, results block):

- Include at least one short sentence, roughly under twelve words, to break the metre and land a key point. A short sentence after a long one is the cheapest effective fix.
- Vary structure, not only length: do not run more than two or three consecutive subject-first declaratives.
- If every sentence has the same shape and weight, the passage reads as machine-balanced even when each sentence is correct.

Vary deliberately to track the argument. Do not add fragments, roughness, or filler for its own sake; the variation must carry meaning.

## Academic Restraint

Replace ambition with evidence:

| Avoid | Prefer |
| --- | --- |
| `groundbreaking contribution` | `contribution` or the specific contribution |
| `pivotal framework` | `framework` |
| `robust results` | the actual metric, confidence interval, or validation gate |
| `seamless integration` | the mechanism or interface |
| `highly effective` | the measured effect |

Use strong language only when the evidence is strong and specific.

Use minimal capitalisation: sentence case for headings (capitalise the first word and proper nouns only), and reserve initial capitals for formal names and titles, lower case for generic references (the detector, the corpus, federated learning). Do not use a serial (Oxford) comma by default; add one only where a list would otherwise be ambiguous.

## Final Style Checklist

- Australian spelling applied.
- No em dashes or prose `---`.
- No generic chapter throat-clearing.
- No inflated novelty or impact language.
- Paragraphs begin with substance, not ceremony.
- Claims carry enough support or a visible flag.
- Technical identifiers are preserved exactly.
