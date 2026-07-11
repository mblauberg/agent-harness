---
name: frontend-design
description: "Use for authorised design, implementation, redesign, or polish of frontend interfaces and design systems. Not for read-only UX review or React profiling; use frontend-review or react-performance."
---

<!-- Modified from Impeccable for this harness; see NOTICE.md. -->

# Frontend design

Design and iterate production-grade frontend interfaces with working code,
committed choices and strong craft.

## Lifecycle boundary

This skill supplies the frontend design method; it is not a second delivery
lifecycle. Run every source-changing command inside `implement`. Route
unsettled design intent through `scope`, design-document placement through
`engineering-docs`, read-only inspection through `frontend-review`, and
measured React performance work through `react-performance`. This skill cannot
accept, release or certify its own work.

## Required setup

Before design or file edits:

1. Load project context once:

   ```bash
   node "${AGENTS_HOME:-$HOME/.agents}/skills/frontend-design/scripts/load-context.mjs"
   ```

   The default output contains paths, headings and sizes only. Read just the
   required sections with the host's bounded file tools; do not invoke
   `--full` merely to preload context. The loader resolves
   case-insensitive `PRODUCT.md` and optional `DESIGN.md` from the project root,
   then `.agents/context/` or `docs/`. Override with
   `IMPECCABLE_CONTEXT_DIR=path`. Do not reload context already present unless
   `teach`, `document`, or the user changed it. `live.mjs` already loads it.
2. If product context is missing, continue from code and existing project docs
   when the task is bounded, and report the limitation. Use `teach` or
   `document` only as the design-domain method when `scope` and
   `engineering-docs` have resolved authority, placement and ownership.
3. Classify the surface as **brand** (design is the product) or **product**
   (design serves the product). Prefer the task cue, then focused surface, then
   PRODUCT.md `register`. For legacy context, infer once from Users and Product
   Purpose and suggest `teach`. Load [brand](reference/brand.md) or
   [product](reference/product.md).
4. Load [core design laws](reference/core-laws.md). If the first argument is a
   command, also load its named reference before acting. This is mandatory.

## Routing

Read [command routing](reference/command-routing.md) for the command catalogue,
lookup tables and general-invocation behaviour.

- No argument: show the grouped command menu and ask what to do.
- Known first word: follow its reference; remaining words are the target.
- Unknown first word: treat the full argument as general design context and
  apply setup, the register reference and core laws.

Setup runs once. Subcommands do not recursively invoke this skill. `craft`
loads context first, then its reference owns the flow.

Implement complexity proportional to the chosen aesthetic. Interpret the
context creatively, vary choices across projects, and reject category-derived
defaults. For live browser work, follow [live](reference/live.md).
