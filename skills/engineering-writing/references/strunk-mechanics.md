# Strunk Mechanics

Grammar and sentence-mechanics rules from Strunk's *Elements of Style* that the
rest of this skill assumes but does not spell out. The voice, concision, and
anti-AI material already covers active voice, positive form, concrete language,
omitting needless words, keeping related words together, emphatic-last order,
one-topic paragraphs, topic sentences, and parallel ideas. This file adds the
mechanical faults those references do not name. It does not restate them.

Australian English governs punctuation choices here: for the serial comma,
quotation marks, dashes, and semicolons, the `natural-writing` skill's hub
default wins over Strunk's American conventions (Strunk mandates the Oxford comma;
Australian style makes it optional, used only to remove ambiguity). Use the
rules below for sentence structure, not for house punctuation style.

## Dangling and misrelated openers

A participial, adjectival, or prepositional phrase at the start of a sentence
attaches to the grammatical subject. If the subject is not the thing doing or
being it, the sentence misreads.

- Wrong: `Running the migration, the users table locked.` (the table did not run
  the migration)
- Right: `Running the migration, we locked the users table.` or `When the
  migration ran, the users table locked.`
- Wrong: `Once deployed, engineers monitored the canary.` (the engineers were not
  deployed)
- Right: `Once the canary was deployed, engineers monitored it.`

This is common in commit messages, postmortems, and runbooks where the actor is
implicit. Name the actor or recast.

## No comma splice; no run-together fragment

- Do not join two independent clauses with a comma. Use a full stop or, for two
  short balanced clauses, a semicolon: `The cache is write-through; reads never
  miss.` not `The cache is write-through, reads never miss.`
- Do not break one sentence into two with a full stop where a comma belongs:
  `He built the parser. A tool that rejects malformed JSON.` should be `He built
  the parser, a tool that rejects malformed JSON.` A deliberate fragment for
  emphasis (`Retried three times. Still failed.`) is fine when the emphasis is
  intended and obvious.

## Restrictive vs non-restrictive clauses

`that` introduces a defining clause the sentence needs, with no comma; `which`
introduces an aside, set off by commas. The comma test decides meaning:

- `The worker that holds the lock retries.` (identifies which worker)
- `The worker, which holds the lock, retries.` (one worker, mentioned in passing)

Dropping or adding the commas changes which claim you are making. Get it right in
specs and requirements, where a defining clause is a condition.

## Limiting-modifier placement

Put `only`, `just`, `almost`, `even`, and similar limiters immediately before the
word they limit. Placement changes the claim.

- `He found only two mistakes.` (two, not more) vs `He only found two mistakes.`
  (found but did not fix them)
- `Not all nodes responded.` (some did) vs `All nodes did not respond.` (none did)

## Correlative parallelism

Correlatives take the same grammatical construction on both sides:
`both A and B`, `either A or B`, `not only A but also B`, `not A but B`.

- Wrong: `It was both a long ceremony and very tedious.`
- Right: `The ceremony was both long and tedious.`
- Wrong: `Either you grant the request or incur his ill will.`
- Right: `You must either grant the request or incur his ill will.`

An article or preposition applying to every term in a series appears once before
the first term, or is repeated before each: `in spring, summer, or winter`, or
`in spring, in summer, or in winter`, not `in spring, summer, or in winter`.

## One tense in summaries

When summarising a document, spec, paper, or sequence of events, hold one tense
throughout; shifting tense reads as uncertainty. Express earlier action with the
perfect. Do not intercalate `the author states`, `the spec then says`, `it goes
on to add`: signal once that what follows is a summary, then report it directly.
This applies to changelogs, release notes, review summaries, and design-doc
recaps.
