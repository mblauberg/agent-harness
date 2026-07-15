# Academic Register

Use this reference when a thesis section needs academic register, tense and
voice control, paragraph rhythm, or final style consistency. For Australian
English mechanics (spelling, punctuation, hyphenation, numbers, dates), load
the hub default at
`${AGENTS_HOME:-$HOME/.agents}/skills/natural-writing/references/au-english.md`
first; this file adds only the academic-specific exceptions below.

## Baseline Register

Thesis prose should be formal enough for examination and direct enough to
read easily. It should not sound like marketing copy, a tutorial, a grant
pitch, or a chatbot answer. The ideal register is calm, exact, and authored.

Prefer:

```text
The evaluation uses records collected at two sites. The findings therefore do not establish performance at unobserved sites.
```

Avoid:

```text
This robust and innovative evaluation framework seamlessly ensures that the system delivers meaningful insights across the broader research landscape.
```

## Academic exceptions to the hub AU default

- Use `per cent` in running prose even where the value is a compact metric
  expression; use `%` in tables, equations, metric lists and captions. The
  Australian Government Style Manual's digital edition now prefers `%` with
  a numeral everywhere, but a thesis is academic writing, not government web
  copy, so `per cent` in running prose stays the academic convention: pick
  one and hold it.
- Preserve US or other spelling inside a title, quoted text, code
  identifier, package name, API field, citation key, or filename. Citation
  keys are the one addition to the hub's general preserve-list that matters
  most in thesis work.
- Use minimal capitalisation: sentence case for headings, and reserve
  initial capitals for formal names and titles; lower case for generic
  references (the model, the corpus, distributed learning).

## Tense

Use tense deliberately:

- Present tense for established knowledge, thesis structure, equations, and
  system properties: `The validator rejects malformed records.`
- Past tense for completed experiments: `The model was trained on the
  development split.`
- Present perfect for work that remains relevant: `Prior work has treated
  the task as supervised classification.`
- Future tense for actual future work only. Avoid using future tense to hide
  missing results.

## Person And Voice

Most engineering theses use impersonal phrasing, but passive voice is not
mandatory. Choose by clarity:

- Active voice when the actor matters: `The evaluation script rejects
  malformed JSON.`
- Passive voice when the artefact or result matters: `Predictions were
  filtered before aggregation.`
- First person only if the thesis, school style, or supervisor expects it.

Do not make every sentence passive. Passive-heavy prose hides causality and
creates stale rhythm.

## Paragraph Rhythm

A good thesis paragraph usually has:

1. A topic sentence with the point.
2. Evidence, mechanism, comparison, or method detail.
3. A short consequence, caveat, or link to the next paragraph.

Avoid uniform paragraph architecture across a whole chapter. Not every
paragraph needs three sentences, a citation in the same position, or a
concluding phrase. Vary sentence length where it helps the argument, but do
not add fake personality.

### Sentence Rhythm (Operational Test)

Flat, uniform sentence length can make a passage monotonous even when every
sentence is grammatical. Use sentence length and structure to match the
argument, not to imitate or evade a purported authorship signature.

Apply a concrete test to any multi-sentence passage (abstract, paragraph,
results block):

- Include at least one short sentence, roughly under twelve words, to break
  the metre and land a key point. A short sentence after a long one is the
  cheapest effective fix.
- Vary structure, not only length: do not run more than two or three
  consecutive subject-first declaratives.
- If every sentence has the same shape and weight, the passage reads as
  machine-balanced even when each sentence is correct.

Vary deliberately to track the argument. Do not add fragments, roughness, or
filler for its own sake; the variation must carry meaning.

## Academic Restraint

Replace ambition with evidence:

| Avoid | Prefer |
| --- | --- |
| `groundbreaking contribution` | `contribution` or the specific contribution |
| `pivotal framework` | `framework` |
| `robust results` | the actual metric, confidence interval, or validation gate |
| `seamless integration` | the mechanism or interface |
| `highly effective` | the measured effect |

Use strong language only when the evidence is strong and specific. Follow
the target style on the serial (Oxford) comma; where it is optional, add it
only when it removes ambiguity.

## Final Style Checklist

- Australian English mechanics applied (see the hub `au-english.md`).
- No em dashes or prose `---`.
- No generic chapter throat-clearing.
- No inflated novelty or impact language.
- Paragraphs begin with substance, not ceremony.
- Claims carry enough support or a visible flag.
- Technical identifiers, including citation keys, are preserved exactly.
