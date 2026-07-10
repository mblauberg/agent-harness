---
name: legal-writing
description: "Use when drafting, reviewing, condensing, final-scrubbing or source-boundary checking Australian court forms, affidavits, submissions, correspondence, orders or annexures."
---

# Australian Legal Writing

General Australian legal style, document-shape and source-discipline layer. Stricter project and forum instructions override it.

This skill provides drafting assistance, not legal advice. It does not
determine rights, strategy or current procedure. Verify all law, forms and
forum requirements against current official sources, and obtain appropriate
human or qualified legal review before relying on filing-facing work.

Default posture: cut first. Do not add background, explanation, transition, reassurance or polish unless it
serves a listed legal function and belongs in this document.

## Quick Start

1. Read the project's agent instructions, live matter state and source-boundary rules.
2. Load the matching jurisdiction, forum and document skill where one exists.
3. Decide the edit mode: `draft`, `rewrite`, `condense`, `diagnose`, `correspondence` or `final-scrub`.
4. For prose work, load `references/legal-concision-and-anti-ai.md`, plus the relevant forum/document reference.
5. Classify each sentence by function before polishing it.
6. Draft with Australian English, restraint, exact source anchors and no internal agent language.

## Rules

- Facts need real source anchors before filing-facing use: document, date, page/paragraph, exhibit/annexure,
  line, timestamp or file instance.
- Affidavits prove facts; submissions argue; orders command; chronologies organise; internal notes analyse;
  correspondence communicates.
- A deponent's direct-knowledge fact may be anchored by the sworn paragraph itself; route corroboration issues
  to the project's asserted-fact or deponent-account register where one exists.
- PPN/DVO material is dated document or safety context unless another source supports stronger wording.
- Apply the project's verification gates: verify what can be verified, record unresolved issues, and keep
  human-authority steps out of agent autonomy.
- Keep source text, rendered DOCX/PDF pages, OCR/transcripts, field maps and QA reports separate.
- Never humanise by weakening thresholds, deleting anchors, casualising court language or changing forum wording.
- Integrity is a drafting rule: never introduce an unverified authority, invent an instrument or finding, or
  silently alter a rule title or decision-maker label; see `references/source-boundary-and-citations.md`
  (Citation And Content Integrity).
- Default to cutting, not adding. Add only where a missing fact, source anchor, procedural step, safety caveat,
  correspondence protection, enforceability detail or necessary qualification must be stated.

## Modes

- `draft`: organise by document function first. Minimum complete draft, not maximum helpful draft.
- `rewrite` / `condense`: preserve meaning, anchors and legal status; make text clearer and usually shorter.
- `diagnose`: report highest-risk defects first with concrete repairs.
- `correspondence`: preserve labels, offer terms, non-admission/non-waiver wording, deadlines and attachments.
- `final-scrub`: defect fixes only; no new argument, fact, authority, history or courtesy closer unless necessary.

## Concision Pass

Governing rules; full procedures live in `references/legal-concision-and-anti-ai.md` (repair, persuasive
strength, register discipline, condense integrity) and `references/argument-structure-and-paragraphing.md`
(submission architecture):

- Front-load: relief, request, answer or next step in the first paragraph; one proposition per paragraph.
- Prefer active voice and concrete actors, dates, amounts, documents and source anchors; delete
  throat-clearing, duplicate history, intensifiers, additive transitions and AI-polished adjectives.
- Assert with confidence, never overclaim: every contention carries a pinpoint; keep one located qualifier per
  genuine boundary; hold one register per stage (leave/threshold argues `reasonably arguable` contentions, not
  `is established` findings).
- One document does one job and each point has one home: cross-refer rather than restate; move wrong-home
  material before polishing it (argument to submissions, source facts to affidavits/chronologies, reasons for
  orders to submissions).
- For proposed orders, classify first (order, undertaking, notation/recital or reason) and draft the shortest
  enforceable commands; see `references/forum-and-document-recipes.md`.
- Stop cutting when the next cut would remove a source anchor, redaction qualification, party label, amount,
  date, limitation, disputed status, forum wording, exhibit label, cross-reference or human-authority condition.
- If a tighten/condense/final-scrub pass adds more than it removes, redo the cut pass or state the legal need.
  Gate any substantial condense or relocation with the Condense Integrity checks (token set-diff plus an
  independent qualitative pass).
- Preserve legal accuracy, source boundaries, redaction and forum wording over brevity.

## References And Lint

Load only what the task needs from `references/`; `legal-concision-and-anti-ai.md` is required for prose work.
For submissions and written advocacy also load `argument-structure-and-paragraphing.md` (front-loading,
headings-as-contention, one point per paragraph, the one-allowed-echo rule, grounds-selection, adverse
authority and candour, reply craft, density ceiling).
Use the task-specific references as needed: house style, forum/document recipes, source boundaries,
correspondence, family-violence/redaction, forbidden patterns, validation and verification/escalation.
Run the lint with one or more explicit project paths; it deliberately has no project-specific defaults:

```bash
python3 "${AGENTS_HOME:-$HOME/.agents}/skills/legal-writing/scripts/lint_legal_style.py" path/to/source path/to/correspondence
```

Lint is only a guardrail; source checking, forum skills, render checks and human-authority gates still apply.

Maintainer note: changes to this skill's filing-facing rules, source-boundary rules or lint behaviour require
the cross-agent or cross-family review gate designated by the owning harness or project instructions.
