# Changelog

Notable changes to Provenant are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Changes remain under `Unreleased` until a tag and release are separately
authorised. [`MAINTAINING.md`](MAINTAINING.md) requires evaluation runs to
record the harness revision they ran against.

## [Unreleased]

The current pre-release tree includes:

### Added

- `HARNESS.md`, the constitution: Claude Code and Codex as equal primary
  orchestrators with one session chair, the scope-to-retrospect lifecycle, the
  user gates, and the rule that no two agents write the same source surface at
  once.
- 32 Agent Skills under `skills/`, covering delivery (`scope`, `deliver`,
  `implement`, `tdd`, `refactor`, `diagnose`, `code-review`, `evaluate`,
  `release`, `retrospect`, `session`, `work-map`), orchestration, writing,
  design and diagrams, web engineering, and harness development.
- `scripts/install-harness`, which installs the skills and the instruction
  bootstrap into Claude Code and Codex, preserves unmanaged content, and leaves
  portable `skill-craft` canonical over Codex's bundled `skill-creator`.
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
- Community files: this changelog and the bug, feature and skill-proposal issue
  forms.
- Standalone Agent Fabric specifications for run-plan declaration, agent
  topology projection and work-facts projection.
- The `setup-repo` skill, extending the former `github-setup` owner with
  inspect-first repository process, tracker and documentation setup.

### Changed

- Applied the `writing-great-skills` doctrine across the catalogue (epic #124):
  merged `skill-audit` + `skill-authoring` into the branched `skill-craft`,
  merged `frontend-design` + `frontend-review` into the branched `ui-ux-design`,
  gutted and renamed `autonomous-lab` to `autopilot` (run state now lives under
  `.agent-run/<mission-id>/`), made `natural-writing` the single-owner writing
  hub the domain writing skills link to, and added an autonomous
  ready-issue-implementation mode to `orchestrate` that stops at the user PR
  gate. The catalogue is now 32 skills; managed renames are recorded in
  `config/skill-renames.json`.
- Completed the progressive-disclosure refactor tracked by #335: compact
  ambient instructions, repository-managed Claude workflows, enforced
  cross-skill reference boundaries and conditional comparative evaluations.
- Landed the implemented #141 Attention Deck slices through phases A, B1, B2,
  B3 and C: renderer extraction, session-local filters and pins, declared run
  plans, topology and workflow facts, and adaptive grouping. Later phases
  remain tracked by issue #141.

### Fixed

- Prevented `scripts/configure-agent-fabric-mcp.py` from crashing under Python
  3.14 when its standard-output stream is already closed (#396).

### Notes

The name Provenant is the public identity. Several internal identifiers keep the
older `agent-harness` string on purpose, because renaming them would break
existing installations: the installation manifest owner in
`scripts/manage_installation.py`, the schema `$id` values under
`runtime/agent-fabric/schemas/`, the run-state path under
`~/.local/state/agent-harness/`, and the `HARNESS.md` filename that installed
global instructions point at by name. `AGENTS_HOME` and `$HOME/.agents` are
unchanged, so no existing installation moves.

No release or tag is claimed here. Move these notes under a version only after
that tag and release are separately authorised.
