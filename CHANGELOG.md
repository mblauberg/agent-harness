# Changelog

Notable changes to Provenant are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

[`MAINTAINING.md`](MAINTAINING.md) requires eval runs to record the harness
version they ran against, so every entry below needs a matching Git tag.

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-07-13

First public cut. This entry describes the harness as it stands at its first
tag, not a history of earlier releases: before this tag the repository had no
tags and no releases.

### Added

- `HARNESS.md`, the constitution: Claude Code and Codex as equal primary
  orchestrators with one session chair, the scope-to-retrospect lifecycle, the
  human gates, and the rule that no two agents write the same source surface at
  once.
- 33 Agent Skills under `skills/`, covering delivery (`scope`, `deliver`,
  `implement`, `tdd`, `refactor`, `diagnose`, `code-review`, `evaluate`,
  `release`, `retrospect`, `session`, `work-map`), orchestration, writing,
  design and diagrams, web engineering, and harness development.
- `scripts/install-harness`, which installs the skills and the instruction
  bootstrap into Claude Code and Codex, preserves unmanaged content, and leaves
  portable `skill-authoring` canonical over Codex's bundled `skill-creator`.
- `scripts/manage_installation.py`, giving `plan` and `reconcile` against a
  managed manifest plus a public rename registry
  (`config/skill-renames.json`), so a renamed skill migrates without a user
  deleting global links by hand. It never claims or overwrites an unmanaged
  target.
- The delivery kernel: profiles in `config/delivery-profiles.json` for software,
  research, analysis, document and agent-product work, the neutral
  `delivery-run` schema-v1 receipt owned by `deliver`, and
  `scripts/validate_delivery_scenarios.py`.
- Risk and authority policy in `config/risk-policy.json`: the `routine`,
  `substantial`, `crucial` and `terminal` tiers, the factors that raise a tier,
  and review pressure that scales with it.
- Model routing through `scripts/model-route`, resolving the `flagship`,
  `workhorse` and `scout` aliases from runtime capability discovery, with
  receipts that separate adapter, endpoint, model family, requested and
  effective effort, capability source and any substitution.
- The Agent Fabric runtime under `runtime/`: the fabric itself, the wire
  protocol, the console and the Herdr adapter, with an MCP server for agent
  spawn, durable messaging, budgets and run state.
- Gates: `scripts/check-harness` (policy checks, skill trigger fixtures, shell
  parse, `pytest`), `scripts/static-security-check.py` and
  `scripts/public-release-check`, plus a CI workflow that runs the harness gate
  and the fabric, console and Herdr typecheck, tests, evaluation, load and
  production dependency audit.
- The shared worktree invariant and the checked `scripts/worktree` helper: an
  authorised linked worktree lives at the owning repository's
  `.worktrees/<task-agent>` path and nowhere else.
- Repository documentation: `docs/ARCHITECTURE.md`, specs, evals, runbooks,
  `MAINTAINING.md`, `SECURITY.md`, `ACKNOWLEDGEMENTS.md` and
  `THIRD_PARTY_NOTICES.md`, under the MIT licence.
- Community files: this changelog, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` and
  the bug, feature and skill-proposal issue forms.

### Notes

The name Provenant is the public identity. Several internal identifiers keep the
older `agent-harness` string on purpose, because renaming them would break
existing installations: the installation manifest owner in
`scripts/manage_installation.py`, the schema `$id` values under
`runtime/agent-fabric/schemas/`, the run-state path under
`~/.local/state/agent-harness/`, and the `HARNESS.md` filename that installed
global instructions point at by name. `AGENTS_HOME` and `$HOME/.agents` are
unchanged, so no existing installation moves.

[Unreleased]: https://github.com/mblauberg/provenant/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mblauberg/provenant/releases/tag/v0.1.0
