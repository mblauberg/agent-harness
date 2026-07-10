# Maintaining the harness

## Start with the contracts

Read `AGENTS.md`, `HARNESS.md` and `docs/ARCHITECTURE.md` before changing the
harness. Inspect the live diff and preserve unrelated work. This repository is
loaded by multiple agent platforms, so a convenient Claude-only or Codex-only
change is a regression unless its scope is deliberately platform-specific.

Do not create a branch or linked worktree without direct human authorisation.
When authorised, use `scripts/worktree` and `docs/worktrees.md`; the shared path
is a harness invariant, not an agent-platform preference.

## Change a skill

1. Confirm the capability belongs globally and is not better kept in a project.
2. Use `skill-audit` for an existing skill or `skill-authoring` for a new one.
3. Write a consistent kebab-case capability name. Related writing skills use
   parallel names: `engineering-writing`, `academic-writing`, `legal-writing`.
4. Put trigger terms and exclusions in the frontmatter description. Keep it
   under 1024 characters and optimise the first 250 characters for discovery.
5. Keep `SKILL.md` roughly 500 words or less. Move depth into narrowly named
   references loaded only when needed; put deterministic behaviour in scripts.
6. Add positive, negative and boundary trigger fixtures plus contract tests for
   any machine-enforceable invariant.
7. Re-run the public-safety and full harness gates.

Split a skill when its triggers, authority, artifacts or completion gates are
meaningfully different. Merge skills when they compete for the same request and
cannot explain a stable boundary. Condense duplicated model knowledge; retain
only rules that change behaviour or prevent observed failures.

The writing parity set shares a tiered anti-AI base. Structural changes to one
of `engineering-writing`, `academic-writing` or `legal-writing` must be checked
against the other two. `humanise-text` remains the general fallback.

## Promote and retire

A project skill earns global promotion after proving useful in at least two
projects. Generalise project-specific values into knobs and leave a thin local
override. Project rules stay authoritative inside their workspace.

Audit usage periodically. Retire zero-use skills that add no durable capability,
but preserve required third-party notices and use repository history rather than
live backup folders as the normal safety boundary.

## Public and third-party hygiene

- No personal absolute paths, private project names, credentials, local plugin
  caches, matter facts or private symlink targets.
- Do not import material without a redistribution licence. Preserve upstream
  licence, copyright, notice and modification requirements beside the component.
- Prefer source links and small adaptations over vendoring large generated
  bundles. Record why a third-party component is present.
- Keep runtime examples synthetic and visibly placeholder-based.

## Verify

```sh
scripts/check-harness
scripts/public-release-check
git diff --check
```

Before a public push, also run:

```sh
scripts/public-release-check --history
```

The first public release must use a fresh root commit. Never push private
pre-publication refs merely because the current tree is clean.

Review must be independent of authorship and proportionate to risk. A substantial
change gets a fresh native reviewer and the other primary family; crucial work
also attempts a non-blocking bonus family. Fix and re-run until the gate is
clean, then ask the human for final acceptance or promotion authority.
