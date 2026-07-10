---
name: engineering-writing
description: "Use when writing, drafting, reviewing, condensing, or tightening software-engineering prose in clear Australian English: technical documentation, READMEs, pull requests, commit messages, changelogs and release notes, code comments, docstrings, error messages, UI text, bug reports, incident postmortems, runbooks, migration guides, design notes, reports, or the formal engineering deliverables written when scoping and starting a project (requirements/SRS, user stories, scoping, stakeholder analysis, business cases, development plans, architecture and ADRs, roadmaps, estimates, presentations, meeting briefs). Also use when engineering text sounds AI-generated, padded, or overpolished. Preserve technical meaning, identifiers, facts, numbers, and behaviour."
---

# Clear Engineering Writing

Write like an engineer explaining real work: clear, brief, accurate, specific, and useful. Default to Australian English. Cover both codebase-facing prose and the formal engineering documents produced before and during a build.

Default posture: cut first. Do not add background, explanation, transition, reassurance, or polish unless it serves the reader's job and belongs in this document.

## Process

Follow the order of work; most weak documents fail at structure, not at the sentence. Full method in `references/process.md`.

1. **Audience and purpose first.** Who reads this, what they know, what they must do or decide after reading, and the constraint (length, format, weight). If you cannot state the reader's job, you are not ready to write.
2. **Choose the document type** from the reader's job, not the material you have. See routing below.
3. **Structure before prose.** Outline headings tied to decisions; front-load the point; one idea per unit; decide what is out of scope and cut it.
4. **Lock the invariants.** Facts, identifiers, numbers, code behaviour, evidence level, obligations.
5. **Draft, then revise in passes:** structure, accuracy, clarity/concision, anti-AI/voice, Australian English.

## Core rules

- Preserve facts, logic, stance, evidence, technical meaning, and code behaviour.
- Preserve API names, file paths, commands, flags, parameters, config keys, error codes, numbers, units, dates, citations, and quoted terms exactly.
- Never name a package, API, flag, version, or URL you have not verified against the codebase or its documentation; mark the unverifiable `[FLAG: verify]`. An invented identifier is a defect, not a style problem.
- Put the main point first. Use definite, specific, concrete language.
- Prefer active voice when it clarifies who does what; use passive when the result matters more than the actor.
- One topic per paragraph or list item; one requirement per statement; keep related words together.
- Cut needless words without dropping conditions, caveats, exact values, or obligations.
- Distinguish observations from interpretations; make the claim verb match the evidence class (see claim discipline in `references/style-standard.md`). Comparatives carry their number: no bare `faster`, `better`, `improved`.
- Calibrate confidence to evidence, sentence by sentence: strong claims plainly with their evidence, weak claims with one located qualifier (`appears`, `likely`, `not measured`, `not verified`). Uniform confidence is a machine tell.
- Replace vague claims with observable facts: inputs, outputs, limits, trade-offs, commands, errors, behaviour. If a claim lacks support, narrow it or flag it: `[FLAG: verify]`.
- Own decisions in the first person and their reasoning; say what was NOT done. When told to cut content, omit it silently; never write an absence tombstone that leaks the editing instruction.
- Default to cutting; add only what the reader's job needs. State each fact once, in the document that owns it, and cross-reference elsewhere.

## Document routing

Match the shape to the reader's job.

- **Codebase and short-form** (README, how-to, tutorial, reference, explanation, PR, commit, changelog/release notes, error, UI text, comment, docstring, bug report, incident postmortem, runbook, migration guide, deprecation notice, contributing doc, report, review findings): `references/document-patterns.md`.
- **Requirements and planning** (SRS/requirements, user stories + acceptance criteria, scope/SOW, stakeholder analysis, business case, development plan, roadmap, estimation/costing): `references/requirements-and-planning.md`.
- **Architecture and communication** (architecture description with C4/42010, full ADR, design document, presentation to non-technical stakeholders, meeting brief): `references/architecture-and-presentations.md`.

When a situation spans several jobs (for example a founder pack before development), produce the set, not one merged document. Each does one job; cross-reference rather than restate.

## Progressive disclosure

Read only what the task needs:

- Light rewrite or correctness pass, and claim discipline (evidence classes, tense trap, comparatives): `references/style-standard.md`.
- A sentence-mechanics fault to name (dangling opener, comma splice, stranded fragment, that/which, misplaced `only`, correlative parallelism, summary tense): `references/strunk-mechanics.md`.
- Australian English mechanics (spelling, licence/practice splits, dates, numbers, hyphenation, terminology, punctuation): `references/australian-english.md`.
- Text sounds artificial, generic, promotional, padded, or like AI; or you want the positive engineer-voice habits: `references/engineer-voice.md`.
- Condense pass, condense integrity check, wrong-home repair, or the function test: `references/process.md`.
- Choosing or structuring a document type: the three routing references above, and `references/process.md`.
- Style conflict, source-backed rule, or a standard to cite (29148, 42010, C4, INVEST, ADR, keepachangelog, SRE postmortems): `references/sources.md`.

## Operating modes

- **Rewrite**: return final text first. Add notes only for changed assumptions, trade-offs, uncertainty, or flags.
- **Condense**: shorten while preserving meaning; lock invariants, follow the condense pass and stop rule in `references/process.md`, gate a substantial cut with the condense integrity check, and report the before/after word delta.
- **Review**: lead with defects or risks; for each give severity, evidence, impact, and fix. Defect-finding, not praise.
- **Draft from notes**: choose structure first, then write. Do not invent facts to fill gaps.
- **Match voice**: when working inside an existing document or repo, match its conventions (heading case, comment density, sentence habits, formality). Borrow the habits, not the fingerprints; do not copy signature phrases.
- **PR, commit, error, UI, comment, docstring**: shortest wording that preserves the contract, actor, result, and next action.
- **Structural edit**: reorganise before polishing sentences; move wrong-home material before rewriting it; keep headings parallel and tied to reader tasks.
- **Final scrub**: defect fixes only, using the tier sweep and final self-audit in `references/engineer-voice.md`; no new content unless a missing fact, condition, or step must be stated.

## Deterministic check

For local files, run the checker when useful:

```bash
python3 ~/.claude/skills/engineering-writing/scripts/check_engineering_style.py path/to/file.md
```

It scans Markdown and plain text for em dashes, spaced en dashes, US spellings, AI-style and inflated phrases, chatbot framing, meta-discourse, copula avoidance, vague benefit and authority claims, internal process language, tool residue strings, placeholders, hyphenation hazards, negative parallelism, and curly quotes inside code. It skips code fences, inline code, frontmatter, and URLs. It cannot see flat rhythm, noun towers, uniform confidence, comma-gloss definitions, or the implicit-completion tense trap; those need the passes in the references. Treat findings as prompts for review, not proof, and silence as necessary, not sufficient. Add `--wordcount` for the condense-pass before/after delta.

## Stop and flag

Flag rather than smoothing over uncertainty: `[FLAG: verify source]` when support is missing; `[FLAG: verify]` for an unconfirmed identifier, package, or value; `[FLAG: define audience]` when wording depends on reader knowledge; `[FLAG: preserve exact term]` when a term may be domain-required; `[FLAG: shortening drops obligation]` when concision would remove a condition, caveat, or duty.

## Failure modes

- Dropping conditions, caveats, exact values, or obligations to make text shorter.
- Replacing precise terms with smoother but vaguer wording, or synonym-cycling technical nouns.
- Naming a package, API, flag, or URL that does not exist, or citing a source that was never checked.
- Treating passive voice as always wrong, or enforcing sentence length mechanically.
- Turning neutral engineering prose into marketing copy.
- Leaving US spelling, em dashes, or chatbot phrases in Australian English text.
- Letting internal process language (agents, workflows, gates, tickets) leak into reader-facing deliverables.
- Merging distinct document jobs into one document, or writing the wrong document type for the reader's decision.
- Positive spin dressed as positive form: softening a real weakness, overrun, or miss into reassurance.
- Announcing an absence that exists only because an instruction removed content.
- Flattening confidence: hedging strong claims, asserting weak ones, or presenting planned work in the present tense as if shipped.
- Editing to beat an AI detector instead of fixing a nameable defect.
