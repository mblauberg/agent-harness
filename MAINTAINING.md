# Maintaining Provenant

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
2. Use `skill-audit` for read-only assessment and `skill-authoring` for a new or
   materially revised skill. `implement` owns an end-to-end delivery and its
   verification.
3. Write a consistent kebab-case capability name. Related writing skills use
   parallel names: `engineering-writing`, `academic-writing`, `legal-writing`.
4. This harness's portable frontmatter profile contains only `name` and
   `description`; provenance lives in a notice and provider UI metadata in a
   validated sidecar. Metadata or tool lists may narrow invocation but never
   grant authority.
5. Put trigger terms and the nearest exclusion in the first 250 description
   characters. Keep the complete canonical catalogue at or below 8,000
   characters, targeting 7,600 for wrapper/version headroom; per-entry brevity
   cannot compensate for an omitted skill.
6. Keep `SKILL.md` roughly 500 words or less. Move depth into narrowly named
   references loaded only when needed; put deterministic behaviour in scripts.
7. Add canonical positive, negative and boundary fixtures with exact primary
   and companion routes plus contract tests for machine-enforceable invariants.
8. For material changes, freeze held-out cases and compare candidate,
   without-skill and previous-package arms on current primary families. Retain
   every invalid, omitted, timed-out and failed attempt with model lineage.
9. Re-run the public-safety and full harness gates.

Split a skill when its triggers, authority, artifacts or completion gates are
meaningfully different. Merge skills when they compete for the same request and
cannot explain a stable boundary. Condense duplicated model knowledge; retain
only rules that change behaviour or prevent observed failures.

Choose the smallest correct container: always-loaded project rule, occasional
skill, deterministic script/hook, external MCP/app capability, or stable
independently versioned plugin. Do not import popular packs wholesale. Extract
only licensed, evidence-backed mechanisms into the nearest local owner; create a
new skill only when trigger, authority, artifact and gate remain distinct.

The writing parity set shares a tiered anti-AI base. Structural changes to one
of `engineering-writing`, `academic-writing` or `legal-writing` must be checked
against the other two. `natural-writing` remains the general fallback.

## Promote and retire

A project skill earns global promotion after proving useful in at least two
projects. Generalise project-specific values into knobs and leave a thin local
override. Project rules stay authoritative inside their workspace.

Audit usage periodically. Retire zero-use skills that add no durable capability,
but preserve required third-party notices and use repository history rather than
live backup folders as the normal safety boundary.

Record a public rename in `config/skill-renames.json`. Test the managed
reconciliation path; do not rely on users deleting or replacing global links
by hand. Preview with `scripts/manage_installation.py plan`, then reconcile
with the rename registry. Never claim or overwrite an unmanaged target.

## Change the delivery kernel

Keep profile policy in `config/delivery-profiles.json`, surface-selected checks
in `config/security-evidence.json` and machine invariants in the `deliver`
validator. New domains should first compose an existing base profile plus a
domain skill. Add a base profile only when its artifacts, deterministic gates,
judgement gates and release meaning are materially distinct.

Every skill needs positive, negative and boundary trigger fixtures. Changes to
routing descriptions also run the held-out portfolio/lifecycle
dataset with repeated trials and record raw numerator/denominator, model and
harness versions.

## Public and third-party hygiene

- No personal absolute paths, private project names, credentials, local plugin
  caches, matter facts or private symlink targets.
- Do not import material without a redistribution licence. Preserve upstream
  licence, copyright, notice and modification requirements beside the component.
- Prefer source links and small adaptations over vendoring large generated
  bundles. Record why a third-party component is present.
- Treat plugins as supply-chain packages: pin source/ref, inventory manifests,
  scripts, hooks, binaries, MCP/app endpoints, network/data flows, permissions,
  update/rollback and component licences before execution or installation.
- Keep runtime examples synthetic and visibly placeholder-based.

## Verify

```sh
scripts/check-harness
scripts/static-security-check.py
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
`implement` run gets a fresh native reviewer and the other primary family; `crucial` work
also attempts a non-blocking bonus family. Fix and re-run until the gate is
clean, then ask the human for final acceptance or promotion authority.
