# Patterns, Voice Matching, and Genres

Use this when a draft still reads like generated prose after one pass, when you need the fuller checklist behind the three tiers, or when voice matching or a genre matters.

## Reading the tiers

Density and convergence are the signal, never a lone word. Remove Tier 1 artefacts outright; cap Tier 2 density (any single item is fine, a pile is the tell); police Tier 3 structural tells hardest, because they survive synonym swaps and register changes. As the lexical fashions age out, structure carries more weight.

## Deeper checklist

**Inflated importance and promotional framing.** `pivotal`, `transformative`, `vital role`, `underscores the importance`, `stands as a testament`, empty claims about broader trends or lasting significance. Fix: replace ceremony with the direct fact; prefer `is`, `has`, `does`, `led to` over prestige verbs.

**Vague authority and fake analysis.** `experts say`, `observers note`, `studies suggest` with no source; dangling `-ing` phrases that pretend to add depth; symbolism asserted without evidence. Fix: name the source if it exists, else cut the attribution or narrow the claim.

**Predictable sentence architecture.** `it's not just X, it's Y`; rule-of-three lists everywhere; false ranges (`from X to Y` with unrelated poles); synonym-cycling the clearest noun; copula avoidance (`serves as`, `boasts`, `features`); subjectless fragments that hide the actor. Fix: state the point once; use the natural number of examples; repeat the best noun; name the actor.

**Formatting tells.** Emoji bullets, bold inline labels followed by a colon as a fake definition list, Title Case headings in ordinary prose, headers that say nothing new, and the em dash used for manufactured punchiness. Fix: convert decoration to plain prose; do not "fix" a banned em dash with a colon or spaced hyphen that stages the same dramatic pivot.

**Assistant residue.** `great question`, `of course`, `I hope this helps`, knowledge-cutoff disclaimers, `let's dive in`, generic upbeat endings, filler hedges. Fix: delete the wrapper; start with the content; end on the strongest concrete point.

**Low-variance rhythm.** Every sentence a similar length, every paragraph opening the same way, prose that glides with no friction or point of view. Human writing is more heterogeneous; model output clusters tighter by style. Fix: vary sentence length and paragraph weight on purpose; let a short sentence land; keep transitions natural, not signposted.

**Additive drafting.** Adding a sentence because the text "feels incomplete", then joining it with a neutral connector. Before adding, name the job it does for the reader. `Sets the scene`, `sounds more complete`, `adds a transition`, `summarises what was just said` are failed reasons; cut instead.

**Defensive over-qualification.** Wrapping a point in pre-emptive disclaimers no one asked for. Keep the one qualifier that marks a real boundary; cut the anxious repetition around it.

## Aggressive pass (`full-humanise` only)

Low stakes, or an explicit request for a stronger transformation:

- Cut scaffolding instead of line-editing every sentence; allow paragraph reshaping.
- Replace neutral summary with a firmer point of view when the source already supports it.
- Prefer a specific ending over a generic conclusion.
- Run the audit question: "what still makes this obviously AI?" Stop the moment the rewrite starts inventing texture instead of revealing it.

## Voice matching

When the user supplies their own writing, match: sentence-length distribution; paragraph density; how they open sentences and paragraphs; punctuation habits; pronoun use; certainty level; jargon tolerance; humour, warmth, or bluntness. Borrow habits, not signature catchphrases. The sample outranks these defaults where they conflict.

## Safety guard

- Preserve meaning before style.
- Never fabricate evidence or lived experience; never worsen a draft to trick a scoring system.
- Be careful with ESL and highly formal writing: detector heuristics are biased toward predictable prose, so "looks AI" proves nothing.
- In high-stakes genres, prefer inline flags over a smooth but unsupported rewrite.

## Genre quick-reference

- **Creative** (`full-humanise`): replace abstract emotion labels with concrete action or sensation; vary rhythm hard; preserve authored quirks. Watch: flattening voice, swapping one cliché for another.
- **Marketing** (`full-humanise`, unless claims are legally sensitive): deflate superlatives into concrete benefit; second person where natural; cut empty CTAs. Watch: invented product claims, `seamless` hand-waving.
- **Social** (`full-humanise`): remove announcement phrases; keep one strong idea; allow contractions and fragments. Watch: LinkedIn-template tone, fake anecdotes, engagement-bait endings.
- **Journalistic** (`precision-preserving`): named attribution, a concrete news peg, no "here's what you need to know". Watch: vague sourcing, missing dates or jurisdictions.

## Defer to a specialised skill

These domains have their own maintained skills; hand off rather than half-cover them:

- Software-engineering prose, technical docs, READMEs, code comments, docstrings, sample code: `engineering-writing`.
- Academic theses, papers, literature reviews, citation-heavy scholarly prose: `academic-writing`.
- Australian legal drafting, clauses, obligations, defined terms: `legal-writing`.

If a task is mostly one of these, invoke that skill. Use `humanise-text` for general, mixed, or unclassified prose, or when the specialised skill is unavailable.

## Sources

- `blader/humanizer` — original workflow, voice-calibration idea, anti-pattern inventory.
- Wikipedia, *Signs of AI writing* — baseline pattern catalogue.
- Liang et al., *GPT detectors are biased against non-native English writers* (arXiv:2304.02819) — the detector-bias warning.
- O'Sullivan et al. (*Humanities and Social Sciences Communications*, 2025) — human writing is heterogeneous; model output clusters tightly by style.
