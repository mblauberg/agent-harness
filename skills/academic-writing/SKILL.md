---
name: academic-writing
description: Use when drafting, rewriting, diagnosing, or polishing academic prose — theses, dissertations, journal or conference papers, literature reviews, abstracts, methods, results, discussion, reviewer rebuttals, captions, or academic LaTeX — or when academic writing sounds AI-generated, overclaims results, risks breaking citations or macros, or needs Australian-English engineering style. Use in place of generic humanising or plain-language writing skills.
---

# Academic Writing

Write academic prose like an engineer explaining research: precise, concrete, restrained, readable, and defensible. This skill covers theses and dissertations, journal and conference papers, literature reviews, abstracts, and reviewer rebuttals. It includes the relevant voice cleanup and plain-language discipline; do not invoke `natural-writing` or another writing skill unless the user explicitly asks for it.

## Quick Start

1. Identify the section or document type: abstract, introduction, literature review, theory, methodology, results, discussion, conclusion, caption, reviewer rebuttal, or a shorter note.
2. Lock invariants before editing: claims, numbers, units, citations, LaTeX commands, equations, labels, cross-references, result macros, file paths, model names, dataset names, and quoted text.
3. Decide the edit mode: `draft`, `rewrite`, `condense`, `diagnose`, `section-polish`, `match-voice`, `citation-safe`, or `final-scrub`. Literature review, results/discussion/conclusion, and LaTeX-heavy edits are section contexts routed in the Reference Map below.
4. Load the core writing pass plus the task-specific references in the Reference Map below.
5. Rewrite for academic quality: clear claim, concrete evidence, disciplined caveat, clean rhythm, Australian English, positive form (no weak negatives or negative-parallelism padding), no em dashes, no inflated AI-style phrasing.
6. For full-chapter, whole-document, or full-paper rewrites, run the multi-agent review protocol (Multi-Agent Review Mode in [editing-workflows.md](references/editing-workflows.md)) before finalising.
7. Return final prose first. Add short flags only for unresolved support, claim strength, citation risk, LaTeX risk, or evidence gaps. Before finalising any rewrite, run one adversarial self-audit pass (see Final-Scrub Mode in [editing-workflows.md](references/editing-workflows.md)): ask what still reads as AI-generated, and fix only a real remaining tell.

## Scope

Use this for academic writing style, especially engineering, computer science, data-science, AI/ML, systems, cybersecurity, and other experiment-heavy fields, across theses, dissertations, journal and conference papers, literature reviews, abstracts, and reviewer rebuttals. It covers prose structure, claim discipline, concision, Australian English, anti-AI style scrubbing, citation-safe wording, and LaTeX-preserving edits.

Out of scope: academic-integrity adjudication, assessment-permission advice, source discovery, bibliography management, and inventing citations. Disclosure-statement structure and placement (where an AI-use statement sits in the document) is in scope; AI-use integrity policy and permission are not.

## Core Rules

- Preserve technical and scholarly meaning before improving style.
- Use Australian English: `analyse`, `organise`, `behaviour`, `modelling`, `centre`.
- Remove em dashes and prose `---`; use commas, parentheses, colons, semicolons, or new sentences.
- Hyphenate compound modifiers only before the noun; never hyphenate an `-ly` adverb plus adjective or participle; do not stack three-or-more-word hyphen chains. Do not mass-de-hyphenate correct technical compounds, and do not confuse ordinary hyphens with the em-dash tell (see [academic-style-au.md](references/academic-style-au.md)).
- Unpack dense noun-stacks and nominal compression, the dominant AI-smell tell in technical prose: cap the premodifiers, keep one defined term per phrase, unpack vague container heads, and prefer a verb over a noun pile (see [anti-ai-thesis-patterns.md](references/anti-ai-thesis-patterns.md)).
- Prefer concrete nouns and verbs: `measured`, `trained`, `compared`, `validated`, `rejected`, `exported`, `failed`.
- Avoid inflated verbs and adjectives: `showcases`, `underscores`, `pivotal`, `crucial`, `transformative`, `robust`, `seamless`.
- Put statements in positive form by default (Strunk Rule 11). On every draft and rewrite, replace weak evasive negatives with the direct claim: `does not include` to `excludes`, `is not treated as final` to `is treated as workflow evidence only`, `does not allow` to `rejects`. Cut negative-parallelism padding used as rhythm, not real contrast: `rather than X`, `not just X but Y`, `not from missing work`, `instead of merely`. Exception: keep an honest negative when the absence is the claim (`No federated result table is presented because the extension lacks a claimable artefact`); positive form is a style rule, not a licence to spin (see Positive Form Is Not Positive Spin in [anti-ai-thesis-patterns.md](references/anti-ai-thesis-patterns.md)).
- Separate observation, interpretation, limitation, and future work.
- Keep one term for one concept. Do not synonym-cycle technical nouns for variety.
- Do not strengthen a claim beyond the evidence. Flag unsupported claims instead of smoothing them.
- Default to cutting, not adding. On any AI-authored or over-long passage, prefer the shorter version and remove what does not earn its place; relocate detail to one home rather than restating it, and never pad to fill a shape. When you shorten a passage, report the size cut.
- Preserve LaTeX, references, equations, labels, result tokens, and technical identifiers exactly unless the user explicitly asks to change them.
- Vary sentence length and structure; include at least one short sentence per passage. Flat, uniform rhythm is the strongest machine tell, and it passes the checker clean.
- Write about the subject, not the document. Cut report-referential and instructional meta-discourse (`for this report`, `the aim of this report is to`, `we will now discuss`).
- When told to cut or omit content, omit it silently. Never write an absence tombstone that leaks the editing instruction (`X is not discussed because that section was removed`); keep only genuine, author-owned research-scope statements.
- Do not edit prose to beat an AI detector. A high detector score is not evidence; see the detector note in [anti-ai-thesis-patterns.md](references/anti-ai-thesis-patterns.md).

## Multi-Agent Review Protocol

For full-chapter rewrites, whole-document or whole-paper rewrites, or final-polish passes, use Multi-Agent Review Mode in [editing-workflows.md](references/editing-workflows.md): plan and lock evidence; run independent exploration and section-level review agents (plus Codex and Gemini second opinions where authorised); rewrite one slice at a time, preserving labels, macros, and citation keys; then run whole-work coherence, citation, LaTeX, and diff reviews, and validate. Throughout, "review" means defect-finding, not praise.

## Reference Map

- Core writing pass. Load for any task that drafts, rewrites, diagnoses, or polishes prose, because rhythm, AI-tells, concision, and Australian style apply to every section: [academic-style-au.md](references/academic-style-au.md), [anti-ai-thesis-patterns.md](references/anti-ai-thesis-patterns.md), and [concision-and-structure.md](references/concision-and-structure.md). See the file index below for what each covers.

- Project adapter (optional): if the project supplies its own adapter file — a keep-list of defined domain terms, banned coinages, and known jargon leaks specific to that document — always load it alongside the core pass, before any mode-specific file. Skip it when the project has none.

- Then add the task-specific references:
  - `draft`: + [chapter-patterns.md](references/chapter-patterns.md), [engineering-thesis-voice.md](references/engineering-thesis-voice.md), and [claim-discipline-and-evidence.md](references/claim-discipline-and-evidence.md) for abstracts, results, and any evidence claim; add [citation-and-latex-safety.md](references/citation-and-latex-safety.md) when the passage contains LaTeX or macros.
  - `rewrite` or `section-polish`: + [chapter-patterns.md](references/chapter-patterns.md), [engineering-thesis-voice.md](references/engineering-thesis-voice.md); add [claim-discipline-and-evidence.md](references/claim-discipline-and-evidence.md) for results, discussion, or conclusion, and [citation-and-latex-safety.md](references/citation-and-latex-safety.md) when the passage contains LaTeX or macros.
  - `condense`: + [concision-and-structure.md](references/concision-and-structure.md) (Condense Pass) for the 20 to 50 per cent reduction procedure and stop rule, [claim-discipline-and-evidence.md](references/claim-discipline-and-evidence.md), and [citation-and-latex-safety.md](references/citation-and-latex-safety.md) for the loss check.
  - `diagnose`: core pass, plus [claim-discipline-and-evidence.md](references/claim-discipline-and-evidence.md) when claims or results are involved and [editing-workflows.md](references/editing-workflows.md) for output order.
  - `literature review` or `citation-safe`: + [citation-and-latex-safety.md](references/citation-and-latex-safety.md), [chapter-patterns.md](references/chapter-patterns.md), [engineering-thesis-voice.md](references/engineering-thesis-voice.md).
  - `results`, `discussion`, or `conclusion`: + [claim-discipline-and-evidence.md](references/claim-discipline-and-evidence.md), [chapter-patterns.md](references/chapter-patterns.md), [engineering-thesis-voice.md](references/engineering-thesis-voice.md), [citation-and-latex-safety.md](references/citation-and-latex-safety.md).
  - `match-voice`: + [editing-workflows.md](references/editing-workflows.md) (Match-Voice Mode).
  - `final-scrub`: core pass, plus [citation-and-latex-safety.md](references/citation-and-latex-safety.md) and the checker, then the adversarial self-audit in [editing-workflows.md](references/editing-workflows.md).
  - `LaTeX-heavy` edits, captions, tables, equations, macros, or labels: [citation-and-latex-safety.md](references/citation-and-latex-safety.md) first, then the core pass if prose changes.

- [academic-style-au.md](references/academic-style-au.md): Australian academic English, punctuation, hyphenation and dashes, numbers, capitalisation, tense, and the sentence-rhythm and register tests.
- [engineering-thesis-voice.md](references/engineering-thesis-voice.md): engineering/scientific voice, active/passive choice, terminology, abstraction level, emphatic-end sentences, and defensible claim wording.
- [concision-and-structure.md](references/concision-and-structure.md): the Condense Pass (20 to 50 per cent reduction with a stop rule), sentence repair (Strunk Rule 13), positive form, emphatic position (Strunk Rule 18), and paragraph shape.
- [anti-ai-thesis-patterns.md](references/anti-ai-thesis-patterns.md): the AI-tell catalogue (2025-2026 families and how tells age with the models), noun-stacking, markdown residue, register lifts, repo-jargon leaks, meta-discourse rules, and the detector caution.
- [chapter-patterns.md](references/chapter-patterns.md): section-specific rules for abstract, introduction, literature review, theory, methodology, results, discussion, conclusion, captions, and appendices.
- [citation-and-latex-safety.md](references/citation-and-latex-safety.md): citation wording, source integration, IEEE-style prose habits, LaTeX invariants, labels, macros, equations, and tables.
- [claim-discipline-and-evidence.md](references/claim-discipline-and-evidence.md): observed versus inferred versus pending evidence, result wording, the implicit-completion tense trap, mandatory result magnitude and intervals, limitations, future work, and contribution claims.
- [editing-workflows.md](references/editing-workflows.md): per-mode workflows for drafting, rewriting, section and chapter polishing, voice matching, final scrubbing with the adversarial self-audit, reviewer-style diagnosis, and the multi-agent review protocol.

## Deterministic Check

For local files, run the checker when useful:

```bash
python3 ~/.claude/skills/academic-writing/scripts/check_academic_style.py path/to/file.tex
```

It scans for em dashes, prose triple dashes, common US spellings, AI-style and inflated phrases, complex words with simpler equivalents, hyphenation hazards (`-ly` adverb hyphens, should-be-closed compounds, stacked hyphen chains, `versus`-joined modifiers), meta-discourse and report-referential framing, copula-avoidance verbs, negative-parallelism padding, unescaped percent signs, and invented-looking citation and generic placeholders. It skips LaTeX commands, math, and verbatim spans (`\texttt`, `\verb`, `\lstinline`, code fences), so it does not flag identifiers. It cannot see flat sentence rhythm, noun-stacking, comma-gloss definitions, or implicit-completion tense; those need the human passes in the references. Treat results as prompts for review, not automatic proof of a defect. Add `--wordcount` to print the stripped prose word count instead of findings, for the Condense Pass before/after delta.

## Output Contract

- Rewrites: final prose first, then concise notes.
- Diagnosis: findings first, ordered by writing risk.
- File edits: keep diff focused and preserve the document's existing conventions.
- Condensation and shortening: report the size-cut delta and run the loss check from the Condense Pass in [concision-and-structure.md](references/concision-and-structure.md) (words before and after, the percentage, and invariants intact).
- If a sentence cannot be safely improved without changing meaning, leave it and flag the reason.
