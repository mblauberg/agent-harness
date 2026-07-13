# Contributing to Provenant

Provenant is a gated delivery lifecycle for coding agents: an agent harness of
33 Agent Skills that Claude Code and Codex both load. What lands here installs
into other people's machines, so the bar is evidence rather than enthusiasm.

Read [`HARNESS.md`](HARNESS.md) (the constitution) and
[`MAINTAINING.md`](MAINTAINING.md) first. Report vulnerabilities through
[`SECURITY.md`](SECURITY.md), never in an issue. Work from a fork.

## The gate

```sh
scripts/check-harness
```

One command, and it must pass before you open a pull request. It runs the policy
checks, the skill trigger fixtures, the shell parse, the release and
static-security scanners, and the `pytest` suite in `tests/`. You need Python
3.11+ with `pytest` and `pyyaml`, and Node.js 24: the suite always runs, and some
of those tests shell out to `node`. Changing anything under `runtime/` also means
running `npm ci` and `npm run check` at the repository root, plus the root
evaluation and load scripts when the affected workspaces provide them. Paste the
exact commands and results into the pull request:
a gate you skipped is fine if you say so, a gate you imply is not.

## Risk and authority

The pull request template asks for a risk tier and an authorised write scope.
Tiers come from [`config/risk-policy.json`](config/risk-policy.json) and run
`routine`, `substantial`, `crucial`, `terminal`. Seven factors set the tier, and a
receipt must score every one of them: blast radius, reversibility, data
sensitivity, migration, oracle quality, external effects and critical surface. The
tier is at least the highest any single factor demands, so one regulated data set
or one irreversible external effect lifts the whole change. That is a floor, not a
fixed value: going below it takes a recorded `risk_override` with a named human
approver, a reason and evidence. The write scope names the paths your change may
touch and the actions it must never take.

The template also asks for an independent reviewer and model family. You are not
expected to supply one: for `substantial` and above, a maintainer runs a reviewer
independent of whoever wrote the change, on a different model family. State what
you ran and let the maintainer close that leg.

## What needs a spec first

Get an approved spec in `docs/specs/` before writing code when the change touches
authority, gates, contracts or routing: `HARNESS.md`, the delivery kernel
(`config/delivery-profiles.json`, the `deliver` validator), the risk policy, or a
skill's routing description. Bug fixes, docs and new tests need no spec.

## Adding or changing a skill

An Agent Skill is a directory under `skills/` with a `SKILL.md` whose portable
frontmatter carries only `name` and `description`. That description is all a
model sees when routing, so the first 250 characters hold the trigger terms and
the nearest exclusion.

The bar lives in the "Change a skill" and "Promote and retire" sections of
[`MAINTAINING.md`](MAINTAINING.md): useful in at least two projects, a stable
boundary against its nearest neighbour, positive, negative and boundary trigger
fixtures, and a place inside the catalogue's character budget. Open a skill
proposal issue, which asks for exactly those things.

## House style

Australian English: "licence" as a noun, "authorised", "behaviour". Em dashes are
banned; use a comma, colon, semicolon or full stop.

The repository ships the checker, and `scripts/check-harness` gates it on the
root documents (`README.md`, `HARNESS.md`, `MAINTAINING.md`, `AGENTS.md`,
`CONTRIBUTING.md`, `docs/ARCHITECTURE.md`) and on every `skills/*/SKILL.md`.
Those must report zero findings, so a skill front door you edit has to come back
clean.

The deeper `skills/*/references/` and `docs/` trees are not gated yet and still
carry findings that predate the gate. You are not asked to clean them, only to
avoid adding to them: run the checker on anything else you touch and fix what
your own change introduced.

```sh
python3 skills/engineering-writing/scripts/check_engineering_style.py FILE
```

Silence from the checker is necessary, not sufficient; it cannot see flat rhythm
or padding.

## Git

Agents working inside this repository must not create a branch or a linked
worktree without direct human authorisation; when authorised, worktrees live only
at `.worktrees/<task-agent>`. See [`docs/worktrees.md`](docs/worktrees.md).

By contributing you agree that your work is licensed under the
[MIT licence](LICENSE), and to the [Code of Conduct](CODE_OF_CONDUCT.md).
