# Writing Process

Use this reference for the order of work: analyse the audience, choose the document type, structure before prose, then revise in passes. Most weak engineering documents fail here, not at the sentence level. A well-structured plain draft beats a beautifully worded one aimed at the wrong reader. This file also owns the condense pass, the condense integrity check, and wrong-home repair.

## 1. Audience and purpose first

Before writing a word, answer four questions:

1. **Who reads this?** Their role, and their technical depth. A sponsor, a peer engineer, a future maintainer, and a client each need a different document from the same facts.
2. **What do they already know?** This sets what you define, what you assume, and where you start.
3. **What must they do, know, or decide after reading?** This is the document's job. If you cannot state it, you are not ready to write.
4. **What is the constraint?** Length, format, deadline, contractual weight, house style.

Write these down. They decide the document type, the depth, the vocabulary, and where you can cut.

## 2. Choose the document type

Match the shape to the reader's job, not to the material you have. Common mismatches: writing a requirements dump when the reader needs a decision (use a business case or ADR); writing an essay when the reader needs to complete a task (use a how-to); writing a slide wall of text when the reader is non-technical (use assertion-evidence).

Quick routing:

- A reader needs to **decide whether to fund or proceed** → business case, or meeting brief. See `requirements-and-planning.md`, `architecture-and-presentations.md`.
- A reader needs to **agree the boundary** → scope statement / SOW.
- A reader needs to know **exactly what to build and how well** → SRS, or user stories with acceptance criteria.
- A reader needs to know **who is affected and how to communicate** → stakeholder analysis.
- A reader needs to understand **how the system is structured** → architecture description (C4/42010); a single durable choice → ADR; a change before it is built → design document.
- A reader needs to know **how the project will run** → software development plan; **the direction** → roadmap; **how long or how much** → estimate / costing.
- A **non-technical** audience needs the message → presentation (assertion-evidence).
- A reader inside the codebase needs to use, run, review, or maintain something → README, how-to, reference, PR, commit, error, comment, docstring. See `document-patterns.md`.

When the situation spans several jobs (for example a founder pack given before development starts), do not merge them into one document. Produce the set: scope, requirements or stories, stakeholders, architecture and ADRs, plan, roadmap, costing, and a presentation that carries the message. Each does one job; cross-reference rather than restate.

## 3. Structure before prose

- Draft the outline first: headings tied to the reader's decisions, in the order they need them.
- Front-load. Put the point, the ask, or the answer first, then the support. Readers scan; reward the scan.
- One topic per section, one idea per paragraph, one requirement per statement.
- Decide what is out of scope for the document and cut that material before polishing anything.
- Get the structure reviewed before you write sentences if the document is large; reorganising an outline is cheap, rewriting polished prose is not.

## 4. Revise in passes

Do not edit for everything at once. Separate passes catch more and drift less:

1. **Structure pass**: is the order right, is the point first, does each section earn its place, is anything in the wrong document? Fix this before touching wording.
2. **Accuracy pass**: are numbers, identifiers, versions, commands, and claims correct and supported? Is uncertainty marked? Are observations separated from interpretations?
3. **Clarity and concision pass**: is each sentence carrying its weight? Cut needless words without dropping conditions, caveats, exact values, or obligations. Keep related words together.
4. **Anti-AI / voice pass**: sweep the tells and confirm the positive habits. See `engineer-voice.md`.
5. **Australian English pass**: spelling, dates, terminology, punctuation. See `australian-english.md`.

For a light task, passes 3 to 5 may be enough; for a deliverable, run all five.

## 5. Choosing what not to write

The strongest editing move is often removal. A document that says less, more precisely, is trusted more. Before adding background, a transition, a reassurance, or a summary, check that it serves the reader's job. If it does not, leave it out. Default to cutting; add only where a missing fact, condition, caveat, or step must be stated.

## 6. The function test

For each paragraph (each sentence in short-form text), name its one job in a phrase: states a fact or measurement; gives a step or command; records a decision and its reason; states a constraint, assumption, or dependency; names a risk, limitation, or failure mode; defines a term or interface; asks for a decision or action; or is a necessary transition. If it has no job, cut it. If it has two unrelated jobs, split it. If another document owns the job, move it (see Wrong-home repair below).

## 7. Condense pass

Use when prose is AI-authored or over-long and the job is to shorten it while keeping the meaning. A first-draft or machine-drafted document often loses 20 to 50 per cent; there is no percentage target, and a tight document may already be done.

1. **Measure.** Record the word count so you can report the cut (the checker script prints it with `--wordcount`).
2. **Lock invariants.** Facts, numbers, units, identifiers, commands, flags, error text, versions, dates, conditions, caveats, and obligations.
3. **Reverse-outline.** One phrase per paragraph stating its single job (the function test). A paragraph that resists a one-line summary, or repeats another line, is the cut or merge target.
4. **De-duplicate to one home.** State each fact, definition, decision, and number once, in the document or section that owns it; cross-reference elsewhere. Relocate detail to an appendix, table, or linked doc rather than delete it: moved is not lost.
5. **Cut fluff.** Throat-clearing, decorative tails, restated headings, obvious consequences, and recap endings (the Tier lists in engineer-voice.md).
6. **Narrow, do not soften.** Replace a sweeping claim with the precise claim the evidence supports; it is shorter and safer. Never soften an honest negative.
7. **Stop rule.** Stop the moment a further cut would remove a fact, number, unit, condition, caveat, exact term, obligation, or working cross-reference, or would force awkward phrasing. When unsure whether something is load-bearing, keep it. Forced cuts that read strangely are a failure, not a win.
8. **Report the delta**: words before and after, the percentage, and that the invariants survived.

## 8. Condense integrity

A substantial condense, rewrite, or relocation is only safe if what survives is verified; a drafting model's own report that nothing was dropped is untrustworthy, and lossy passes have silently cut qualifiers, numbers, and cross-references while reporting a clean pass.

- Gate the pass with a deterministic token check: set-diff the numbers, identifiers, commands, flags, versions, error strings, dates, and defined terms between the before and after texts. Zero unexplained loss is the pass condition.
- The token check sees tokens, not meaning. Follow it with an independent qualitative pass: is any condition, caveat, obligation, or honest negative now weaker, unowned, or unfindable?
- Relocation can weaken as well as preserve: a constraint moved too far from the decision that depends on it can stop doing its job. After relocating, re-read the passage that relied on the moved material and confirm it still lands, with a pointer to the new home.
- Never patch a gap the checks expose by re-deriving content from memory; restore it from the before-text.

## 9. Wrong-home repair

When a passage is doing the wrong job, move it before rewriting it; wrong-home material usually gets worse when polished in place. Common moves: design rationale buried in a README goes to an ADR or design doc; requirements detail in a business case goes to the SRS; implementation narrative in a PR description goes to code comments or the design doc; status and roadmap material in a README goes to the roadmap or changelog; argument for a decision goes to the ADR, and the ADR is then linked, not restated.
