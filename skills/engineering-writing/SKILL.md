---
name: engineering-writing
description: "Use when writing, drafting, reviewing, condensing, or tightening software-engineering prose in clear Australian English: technical documentation, READMEs, pull requests, commit messages, changelogs and release notes, code comments, docstrings, error messages, UI text, bug reports, incident postmortems, runbooks, migration guides, design notes, reports, or the formal engineering deliverables written when scoping and starting a project (requirements/SRS, user stories, scoping, stakeholder analysis, business cases, development plans, architecture and ADRs, roadmaps, estimates, presentations, meeting briefs). Also use when engineering text sounds AI-generated, padded, or overpolished. Preserve technical meaning, identifiers, facts, numbers, and behaviour."
---

# Engineering writing

Write clear, brief, accurate and useful engineering prose in Australian English.
Cut first. Add only what serves the reader's job and belongs in this document.

## Workflow

1. Name the audience, prior knowledge, required action or decision, and format
   constraint. If the reader's job is unclear, flag it before drafting.
2. Choose the document type from that job. Use [document patterns](references/document-patterns.md)
   for codebase and short-form prose, [requirements and planning](references/requirements-and-planning.md)
   for pre-build deliverables, or [architecture and communication](references/architecture-and-presentations.md)
   for designs, ADRs, presentations and briefs. Separate documents with
   different jobs; cross-reference rather than merge or repeat them.
3. Structure before sentences: front-load the point, use decision-oriented
   headings and one idea or requirement per unit, then move wrong-home material.
4. Lock facts, logic, stance, evidence, obligations, behaviour, identifiers,
   paths, commands, flags, parameters, keys, error codes, numbers, units, dates,
   citations and quoted terms.
5. Revise in separate structure, accuracy, clarity/concision, voice and
   Australian-English passes using [process](references/process.md),
   [style standard](references/style-standard.md), [engineer voice](references/engineer-voice.md)
   and [Australian English](references/australian-english.md). Load
   [sentence mechanics](references/strunk-mechanics.md) or [sources](references/sources.md)
   only when needed.

Preserve technical meaning and evidence altitude. Distinguish observation from
interpretation; attach numbers to comparatives. Verify every package, API,
version, flag and URL against code or documentation, otherwise mark
`[FLAG: verify]`. Never invent facts to fill a document. Keep genuine caveats
and honest negatives while cutting padding, marketing language, AI tells,
instruction-leaking absence tombstones and internal process language from
reader-facing prose. Match existing repository conventions without copying
signature phrases.

For condensation, follow the reference stop and integrity checks and report the
before/after word delta. Review mode returns severity, evidence, impact and fix;
rewrite mode returns text first; final scrub makes defect fixes only.

For local files, use the checker as a review prompt, not proof:

```sh
python3 "${AGENTS_HOME:-$HOME/.agents}/skills/engineering-writing/scripts/check_engineering_style.py" path/to/file.md
```

Flag unverifiable support, audience dependence, domain-required terms, or a cut
that would drop an obligation. Use `[FLAG: verify source]`,
`[FLAG: define audience]`, `[FLAG: preserve exact term]` or
`[FLAG: shortening drops obligation]` where applicable. Do not smooth
uncertainty away.
