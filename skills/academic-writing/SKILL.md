---
name: academic-writing
description: Use when drafting, rewriting, diagnosing, or polishing academic prose — theses, dissertations, journal or conference papers, literature reviews, abstracts, methods, results, discussion, reviewer rebuttals, captions, or academic LaTeX — or when academic writing sounds AI-generated, overclaims results, risks breaking citations or macros, or needs Australian-English engineering style. Use in place of generic humanising or plain-language writing skills.
---

# Academic writing

Write precise, concrete, restrained and defensible academic prose. This skill
owns academic voice cleanup; do not also invoke a general writing skill unless
the user asks. It does not cover source discovery, bibliography management,
invented citations, integrity adjudication or assessment-permission advice.
AI-use disclosure wording and placement are in scope; permission and policy are
not.

## Workflow

1. Identify the section and mode: `draft`, `rewrite`, `condense`, `diagnose`,
   `section-polish`, `match-voice`, `citation-safe` or `final-scrub`.
2. Lock claims, numbers, units, citations, quotations, LaTeX commands, equations,
   labels, cross-references, result macros, paths and technical names.
3. For prose, always load [academic-style-au.md](references/academic-style-au.md),
   [anti-ai-thesis-patterns.md](references/anti-ai-thesis-patterns.md) and
   [concision-and-structure.md](references/concision-and-structure.md). Load the
   matching section/mode from [editing-workflows.md](references/editing-workflows.md),
   then add only the relevant references: [chapter patterns](references/chapter-patterns.md),
   [claim discipline](references/claim-discipline-and-evidence.md),
   [engineering voice](references/engineering-thesis-voice.md), or
   [citation and LaTeX safety](references/citation-and-latex-safety.md).
   If the project supplies a domain-term keep-list or writing adapter, load it
   with the core references.
   Use chapter patterns for section drafting/polish; claim discipline for
   evidence claims, results, discussion and conclusions; engineering voice for
   drafts, rewrites and literature reviews; and citation/LaTeX safety for
   citations, literature reviews, captions, tables, equations, macros, labels
   and final scrub. For a LaTeX-only change, load citation/LaTeX safety first
   and add the core only if prose changes.
4. Preserve meaning and evidence altitude. Separate observation, interpretation,
   limitation and future work. Flag unsupported claims; never strengthen them.
5. Use Australian English, concrete verbs and varied sentence structure. Cut
   noun stacks, inflated phrasing, empty meta-discourse, em dashes, decorative
   negative parallelism and instruction-leaking absence tombstones. Keep honest
   negatives and defined technical terms. Do not edit to beat an AI detector.
6. For a full chapter, paper or document rewrite or final polish, run the
   independent multi-agent review in `editing-workflows.md`. Preserve labels,
   macros and citation keys, then validate the whole work.
7. Run one adversarial final scrub: name and repair only a real remaining tell.

For condensation, follow the reference stop rule, report words before/after and
percentage cut, and verify every locked invariant. If another cut would lose a
fact, caveat, scope condition, term or reference, stop.

For local files, use the checker as a review prompt, not proof:

```sh
python3 "${AGENTS_HOME:-$HOME/.agents}/skills/academic-writing/scripts/check_academic_style.py" path/to/file.tex
```

Return rewritten prose first and concise risk flags second. For diagnosis,
return highest-risk findings first. Leave unsafe sentences unchanged and state
why. Match surrounding project conventions when editing files.
