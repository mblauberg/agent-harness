# Design/make required setup

Before design or file edits:

1. Load project context once:

   ```bash
   node "${AGENTS_HOME:-$HOME/.agents}/skills/ui-ux-design/scripts/load-context.mjs"
   ```

   The default output contains paths, headings and sizes only. Read just the
   required sections with the host's bounded file tools; do not invoke
   `--full` merely to preload context. The loader resolves case-insensitive
   `PRODUCT.md` and optional `DESIGN.md` from the project root, then
   `.agents/context/` or `docs/`. Override with `IMPECCABLE_CONTEXT_DIR=path`.
   Do not reload context already present unless `teach`, `document`, or the
   user changed it. `live.mjs` already loads it.
2. If product context is missing, continue from code and existing project
   docs when the task is bounded, and report the limitation. Use `teach` or
   `document` only as the design-domain method when `scope` and
   `engineering-docs` have resolved authority, placement and ownership.
3. Classify the surface as **brand** (design is the product) or **product**
   (design serves the product). Prefer the task cue, then focused surface,
   then PRODUCT.md `register`. For legacy context, infer once from Users and
   Product Purpose and suggest `teach`. Load [brand](brand.md) or
   [product](product.md).
4. Load [core design laws](core-laws.md). If the first argument is a command,
   also load its named reference before acting. This is mandatory.

Setup runs once per session. Subcommands do not recursively invoke this
skill. `craft` loads context first, then its reference owns the flow.
