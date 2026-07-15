---
name: ui-ux-design
description: "Use for frontend UI/UX: read-only review (default — visual, accessibility, responsive, interaction) or authorised design, redesign, and live iteration. Not for source-diff review or React profiling; use code-review or react-performance."
---

<!-- Modified from Impeccable for this harness; see the repository THIRD_PARTY_NOTICES.md. -->

# UI/UX design

Review or design production-grade frontend interfaces. Two branches share one
entry point; the model picks the branch from what the request authorises,
never a slash command.

## Branches

- **review** (default, read-only). Evidence-bearing critique of the rendered
  UI: visual hierarchy, accessibility, responsiveness, interaction states,
  copy and brand fit. No `Write`/`Edit`/`NotebookEdit` calls. Load
  [review](reference/review.md).
- **design/make** (write authority required). Design, implement, redesign or
  polish an interface, including the interactive `live` codegen protocol.
  Load [setup](reference/setup.md), then [command
  routing](reference/command-routing.md); for live browser work,
  [live](reference/live.md).

A request framed as review stays on the review branch even when a fix looks
obvious; escalate to design/make only under an explicit authority grant
naming `implement` (or this skill under `implement`) as action-owner. Never
infer write authority from review findings alone.

## Lifecycle boundary

This skill supplies the frontend review and design methods; it is not a
delivery lifecycle. Run every source-changing command inside `implement`.
Route unsettled design intent through `scope`, design-document placement
through `engineering-docs`, general source-diff review through `code-review`,
and measured React performance work through `react-performance`. This skill
cannot accept, release or certify its own work.

## Detector evidence engine

`scripts/detector/` is an antipattern and contrast-ratio engine (static
HTML/CSS analysis, regex text scanning, full browser rendering) shared by
both branches:

```bash
node "${AGENTS_HOME:-$HOME/.agents}/skills/ui-ux-design/scripts/detect.mjs" [file-or-dir-or-url...]
```

Review treats it as one evidence lane among several, never a substitute for
manual inspection. Design/make may run it after edits to check for
contrast/antipattern regressions; a clean result is evidence, not proof of
completion.

## Routing (design/make)

[Command routing](reference/command-routing.md) holds the full command
catalogue, lookup tables and dispatch rules. No argument shows the grouped
menu; a known first word follows its reference; an unknown first word is
general design context. Implement complexity proportional to the chosen
aesthetic; interpret context creatively and reject category-derived
defaults.
