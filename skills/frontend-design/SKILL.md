---
name: frontend-design
description: Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. Covers websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding, and empty states. Handles UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n, and reusable design systems or tokens. Also use for bland designs that need to become bolder or more delightful, loud designs that should become quieter, live browser iteration on UI elements, or ambitious visual effects that should feel technically extraordinary. Not for backend-only or non-UI tasks.
---

<!-- Modified from Impeccable for this harness; see NOTICE.md. -->

# Frontend design

Design and iterate production-grade frontend interfaces with working code,
committed choices and strong craft.

## Required setup

Before design or file edits:

1. Load project context once:

   ```bash
   node "${AGENTS_HOME:-$HOME/.agents}/skills/frontend-design/scripts/load-context.mjs"
   ```

   Consume the complete JSON; never truncate or filter it. The loader resolves
   case-insensitive `PRODUCT.md` and optional `DESIGN.md` from the project root,
   then `.agents/context/` or `docs/`. Override with
   `IMPECCABLE_CONTEXT_DIR=path`. Do not reload context already present unless
   `teach`, `document`, or the user changed it. `live.mjs` already loads it.
2. If `PRODUCT.md` is missing, empty, placeholder-filled, or under 200
   characters, run `teach`, reload, then resume the original task. A blocked
   `craft` resumes through `shape`. If `DESIGN.md` is missing, suggest
   `document` once, then continue.
3. Classify the surface as **brand** (design is the product) or **product**
   (design serves the product). Prefer the task cue, then focused surface, then
   PRODUCT.md `register`. For legacy context, infer once from Users and Product
   Purpose and suggest `teach`. Load [brand](reference/brand.md) or
   [product](reference/product.md).
4. Load [core design laws](reference/core-laws.md). If the first argument is a
   command, also load its named reference before acting. This is mandatory.

## Routing

Read [command routing](reference/command-routing.md) for the command catalogue,
lookup tables, general-invocation behaviour and pin/unpin procedure.

- No argument: show the grouped command menu and ask what to do.
- Known first word: follow its reference; remaining words are the target.
- Unknown first word: treat the full argument as general design context and
  apply setup, the register reference and core laws.

Setup runs once. Subcommands do not recursively invoke this skill. `craft`
loads context first, then its reference owns the flow.

Implement complexity proportional to the chosen aesthetic. Interpret the
context creatively, vary choices across projects, and reject category-derived
defaults. For live browser work, follow [live](reference/live.md).
