# Codebase Primer: Agent Harness (`~/.agents`)

Dated 2026-07-13. Generated to support the review-pack scoping session
(companion to `COMPREHENSIVE_REVIEW.md`, `target-architecture.md` and the
other documents in this directory). This is a plain-language orientation for
someone who has not worked closely with the code and needs to make
architecture decisions about it.

## 1. What this project is

This repository is a personal, cross-project **agent harness**: a set of
rules, reusable workflows and a small piece of custom runtime software that
governs how Claude Code and Codex (and, more recently, other AI coding
agents) work on the owner's projects. It is not itself a product for
end-users — it is infrastructure the owner installs into `~/.claude` and
`~/.codex` on their own machine so that every project benefits from the same
discipline: scope before you build, verify before it reaches a human, get
independent review, and never silently expand authority.

Four things make up the harness:

- **`HARNESS.md`** is the constitution. It says who is in charge (Claude Code
  and Codex are "equal primary orchestrators," one of them is always the
  "chair" for a given session), what the work lifecycle looks like (session →
  scope → human approval → deliver → execute → verify → review → human
  acceptance → release → retrospect), how risk tiers map to review pressure,
  and the hard safety rules (no unauthorised git branches/worktrees, no
  concurrent writers to the same file, credentials never imply permission).
- **`AGENTS.md`** is a short pointer file, installed at the top of both
  Claude's and Codex's global instructions, that tells the agent to go read
  `HARNESS.md` before making orchestration, delegation, model-routing or
  memory decisions, and restates the same non-negotiables (git discipline,
  memory policy, terse "caveman" style).
- **`skills/`** is a library of 34 Agent Skills — modular, triggerable
  instruction sets (each a `SKILL.md` plus references/scripts/tests) that
  encode specific workflows such as `scope`, `implement`, `diagnose`,
  `code-review`, `orchestrate`, `session`. These are the operational
  "how-to" layer underneath the constitution.
- **The runtime** (`runtime/agent-fabric*`) is actual TypeScript software: a
  local daemon plus supporting packages that give the harness's abstract
  ideas (runs, tasks, leases, receipts) a durable, machine-checkable home
  instead of living only in agents' transient context windows.

In short: `HARNESS.md`/`AGENTS.md` are policy, `skills/` are the codified
procedures that implement the policy, and `agent-fabric` is the persistence
and coordination substrate so that policy claims ("this was reviewed," "this
task is claimed by agent X") are backed by real state rather than an agent's
say-so.

The repo also functions as its own dogfood project: `docs/specs/`,
`docs/efforts/`, `docs/handoffs/` and this very review-pack directory are the
harness being used to build itself.

## 2. The four runtime packages

All four live under `runtime/`, are private npm packages (`@local/...`), pinned
to Node `>=24.15.0 <25`, built with TypeScript 7 and tested with Vitest. They
form a strict dependency chain: `agent-fabric-protocol` is the base; `agent-fabric`
depends on it; `agent-fabric-console` and `agent-fabric-herdr` depend on both.

### `agent-fabric` (the daemon — ~61k lines of TypeScript, by far the largest package)

This is the actual coordination server: a background daemon that owns one
SQLite/WAL database behind a private Unix socket, and is described in its own
README as "the current pre-release runtime... implemented [but] final
integrated verification, independent review and human acceptance remain
pending." It is the single source of truth for runs, tasks, agents, leases,
mailboxes, receipts, provider-session state and lifecycle checkpoints.

Key entry points (from `package.json` bins): `dist/cli/main.js` (the
`agent-fabric` CLI — `status`, `doctor`, `retention preview`, `observe`, etc.)
and `dist/mcp/main.js` (`agent-fabric-mcp`, the Model Context Protocol proxy
each client — Claude Code, Codex — launches to talk to the daemon). Internally
it is organised into `src/core` (the `Fabric` façade and `FabricClient`,
`migrations.ts`, `read-policy.ts` for chair/owner/participant-scoped views),
`src/daemon` (single-instance process and socket transport), `src/adapters/providers`
(provider adapters, including `claude-agent-sdk.ts` and `codex-app-server.ts`,
described in the README as "isolated, pinned"), `src/operator` (typed Git
read/mutation services and an optional pinned GitHub-hosted-checks adapter),
`src/gates`, `src/exports` (receipt projection and schema enforcement),
`src/mcp` (the one shared input/output schema surface used by both primary
clients) and `src/cli`.

Core concepts worth knowing:
- **Fabric** = the daemon's coordination authority. It is "not a login
  service"; clients attach to a compatible running daemon or elect a new one.
- **Runs / tasks / agents / leases**: the daemon's basic units of work
  tracking — a run contains tasks, tasks are claimed under time-bound leases
  by agents, preventing two agents from silently colliding on the same work.
- **Receipts**: machine-readable, schema-enforced records (see `src/exports/receipt.ts`)
  that capture what happened — risk/authority, reviewer identity, adapter/model
  lineage — so that "this was reviewed" is auditable rather than asserted.
- **Provider adapters**: `codex-app-server` and `claude-agent-sdk` are the two
  currently enabled adapters (see `config/adapter-compatibility.yaml`); others
  (Agy, Cursor, Kiro ACP, Pi) exist as "optional" adapters gated behind
  separate activation.
- **Effects / typed git**: `src/operator/typed-git-service.ts`,
  `git-repository-read.ts`, `fixed-git-mutation-port.ts` and
  `trusted-git-registry.ts` give the daemon a narrow, typed way to read and
  (in a controlled fashion) mutate a git repository rather than shelling out
  freely — this is the "effects" boundary the harness's git-safety rules are
  built on.

### `agent-fabric-protocol` (~14k lines)

The shared contract layer: wire schemas, operation codecs, MCP tool
descriptors, and fixtures. Its README-equivalent role (stated directly in the
main fabric README) is "sole public operation, schema and MCP descriptor
owner." No binary/CLI — it exports typed modules (`operations.ts`,
`schema.ts`, `mcp-projection.ts`, `git-actions.ts`, `request-result.ts`, etc.)
and two published JSON schemas (`protocol.schema.json`,
`mcp-agent-tools.json`). Both `agent-fabric` and its siblings build against
this package rather than duplicating wire definitions, so a protocol change
here is a breaking change everywhere.

### `agent-fabric-console` (~12.7k lines)

A standalone, responsive terminal UI (TUI) — "operator client" — for watching
and steering the daemon: reviewing runs, seeing task/agent state, reading
receipts. Entry point `dist/cli.js` (bin `agent-fabric-console`). Structured
as a fairly classic app: `model.ts`/`controller.ts`/`presenter.ts`/`terminal.ts`,
plus `production-composition.ts` (real wiring) and `protocol-adapter.ts`
(translates daemon protocol into UI state). It depends on `agent-fabric`
directly (not just the protocol), and ships its own `evals/usability-fixtures.v1.json`
for a human-facing usability evaluation gate — separate from ordinary unit
tests, reflecting that a chunk of its acceptance criteria are about human
UX, not just correctness.

### `agent-fabric-herdr` (~2.3k lines, smallest package)

A narrow, explicitly "optional, non-authoritative" adapter to a third-party
tool called Herdr, which provides visible terminal panes and wake-up signals
for observing/nudging running agents. Its own README is emphatic about the
boundary: Herdr "does not own coordination state, authority, persistence or
provider sessions" — it only gets typed pane/presence/focus/wake/steer
operations, and even its one-way "direct steer" capability requires Fabric to
have already prepared and validated the action first. Bin: `agent-fabric-herdr`
(`doctor`, `steer` subcommands). This is the smallest, most conceptually
simple of the four, essentially a permissioned remote-control shim that
cannot itself create authority.

**Relationship summary**: protocol (contracts) → fabric (daemon/authority) →
{console (view/control UI), herdr (external visibility adapter)}. Fabric is
the only one that opens the SQLite database or owns process authority; the
other three are clients or adapters around it.

## 3. `skills/`

A **skill** here is a directory under `skills/<name>/` containing a
`SKILL.md` with strict YAML frontmatter (`name`, `description` — description
must start with "Use" and include an explicit exclusion clause in its first
250 characters, e.g. "Not for X; use Y"), a body capped at 500 words, and
usually `references/`, `scripts/`, `templates/`, `tests/` and an
`evals/trigger_cases.yaml` fixture. There are **34 skills** today (per the
README's catalogue table and a direct directory count), grouped into Delivery
(`session`, `scope`, `deliver`, `implement`, `tdd`, `refactor`, `diagnose`,
`code-review`, `evaluate`, `release`, `retrospect`, `work-map`),
Orchestration (`orchestrate`, `autonomous-lab`), Writing, Design/diagrams, Web
engineering, Harness development (`grill-me`, `skill-audit`,
`skill-authoring`) and Presentation (`caveman`).

They are validated by `scripts/check_harness.py` (wrapped by
`scripts/check-harness`, which CI runs on every push). This script enforces:
directory name = frontmatter `name` (lowercase kebab-case), only `name`/`description`
keys permitted in frontmatter, description length and "Use ... Not for ..."
shape, no duplicate descriptions across skills, a combined skill-catalogue
string kept under an 8,000-character hard limit (a real constraint — it's
sized against "OpenAI's documented fallback catalogue budget"), a mandatory
`evals/trigger_cases.yaml` per skill, no broken relative links, valid
`agents/openai.yaml` sidecars where present, and a check that retired skill
names (e.g. `write-a-skill`, `wayfinder`) don't linger anywhere.

The lifecycle a skill encodes mirrors `HARNESS.md`'s global lifecycle: skills
like `scope` produce a human-approved spec; `deliver`/`implement`/`tdd`/`diagnose`
execute it; `code-review`/`evaluate` verify it; `release` promotes it under
separate human authority; `retrospect` closes the loop. `session` and
`work-map` exist purely for continuity across context resets. This is a
meta-framework for *how to do work correctly*, independent of what the work
is — the same skills apply whether the task is a code change, a document, or
a research report (see the README's "delivery profiles" table).

## 4. `config/` and `scripts/`

`config/` holds the machine-readable policy the skills and runtime consult:
- **`risk-policy.json`**: maps concrete factors (blast radius, reversibility,
  data sensitivity, migration type, oracle quality, external effects,
  critical surface) to one of four risk tiers (`routine`/`substantial`/`crucial`/`terminal`)
  — this is what `scope` uses to decide how much review pressure a task needs.
- **`model-routing.json`**: the alias system (`flagship`/`workhorse`/`scout`)
  that lets skills say "use the flagship model" without hardcoding a specific
  model ID; it currently maps Anthropic (fable/opus, sonnet, haiku) and OpenAI
  (gpt-5.6-sol/terra/luna) families, with adapter-specific effort-transport
  rules (flag vs. model-id) and reasoning-effort fallback ordering.
- **`adapter-compatibility.yaml`**: lists which provider adapters are allowed
  at all (`claude-agent-sdk`, `codex-app-server`, `pi-rpc`, `agy`,
  `cursor-agent`, `kiro-acp`) versus actually active, and the exact spawn
  command for each.
- **`agent-fabric.yaml`**: daemon-level config — allowed adapters, allowed
  session profiles (headless/observed/interactive/paired-visible/paired-observed),
  workspace roots and concurrency limits (max 8 concurrent provider turns).
- **`security-evidence.json`**: maps risk surfaces (source, dependency,
  auth-boundary, agent-tools, inter-agent, etc.) to required deterministic
  checks (secrets-scan, SAST, dependency-advisory, prompt-injection-tests,
  etc.) and enumerates named "agentic risks" (goal-hijack, tool-misuse,
  excessive-privilege, memory/context poisoning...) the harness is explicitly
  designed against.
- Also present: `delivery-profiles.json`, `skill-renames.json`,
  `adapter-manifests/` (per-adapter pinned executable/package digests — see
  the `claude-agent-sdk` entry: exact npm tarball hash, exact `claude.exe`
  SHA-256, exact wrapper hash), and the large `spec05-*.v1.json` files, which
  are structured requirements/evidence registries feeding Spec 05 (the
  Console spec) directly.

`scripts/` is where policy becomes executable: `install-harness` (installer —
copies skills into `~/.claude` or `~/.codex`, writes the `AGENTS.md`/`HARNESS.md`
bootstrap pointer into the platform's instructions file if not already
present), `install-skills`, `manage_installation.py` (plan/reconcile against
unmanaged content), `check_harness.py`/`check-harness` (the skill-lint gate
described above, run in CI), `model_route.py` (resolves the flagship/workhorse/scout
aliases into concrete, auditable model routes using the three config files
above), `worktree.py`/`worktree` (creates/removes shared git worktrees only
under `.worktrees/<name>`, with a name-safety regex and policy-error
guardrails — enforcing the "no ad hoc worktrees" rule from `HARNESS.md`),
plus `validate_delivery_scenarios.py`, `validate_lifecycle_routing.py`,
`static-security-check.py` and `public_release_check.py` for other policy
gates.

## 5. `docs/specs/`

Five specs, indexed in `docs/specs/00-index.md`:

| ID | Spec | One-line purpose | Declared status |
|---|---|---|---|
| 01 | Shared agent fabric | The core daemon/protocol design — schema, provider-task model, review snapshots, route lineage, seat generations | v0.35; approved; implementation in progress; final verification/acceptance pending |
| 02 | Adaptive agent harness lifecycle | The abstract session→scope→...→retrospect lifecycle and route-evaluation evidence rules that `HARNESS.md` implements | v1.2; base implementation machine-verified; amendment implementation/acceptance pending |
| 03 | Agent fabric activation and operations | How provider adapters get safely turned on (capability pinning, permission profiles, fail-closed compatibility) | v1.2; base activation implemented; amendment implementation/acceptance pending |
| 04 | Agent fabric operational hardening | Daemon robustness — capability refresh, crash recovery, receipt/bundle digesting, lifecycle exits, terminal geometry minimums | v1.30; implementation in progress; final verification/acceptance pending |
| 05 | Project Fabric Console and adaptive session orchestration | The Console TUI's exact behaviour — topology, route-arm display, review-family projections | v1.13 draft amendment under acceptance; v1.0 approved; implementation, authority trace, final verification and provider review pending |

Two things stand out reading these: the version numbers are unusually high
(0.35, 1.30, 1.13) for a repo this size, meaning each spec has been through
dozens of incremental amendment rounds rather than being written once, and
every single spec's status line ends with some variant of "implementation in
progress; final verification and human acceptance pending" — none is marked
fully closed out.

## 6. What's actually runnable today vs. aspirational

**Runnable / wired up:**
- All four runtime packages have real `build`/`typecheck`/`test`/`check`
  npm scripts, and `agent-fabric` ships a **built `dist/`** directory
  (compiled `adapters`, `application`, `cli`, `config`, `core`, etc.), so the
  daemon and its CLI (`agent-fabric`, `agent-fabric-mcp`) are not just source
  — they can run.
- CI (`.github/workflows/ci.yml`) has four real jobs — `harness` (Python
  policy checks + skill lint), `fabric`, `console`, `herdr` — each doing
  install → typecheck → build → test (→ evaluation/load suites for fabric and
  console, → `npm audit` for console/herdr). This is a genuine, non-trivial CI
  setup, not a stub.
- Test volume is substantial: 169 TypeScript test files under `agent-fabric/tests`,
  31 under protocol, 20 under console, 10 under herdr, plus 36 Python test
  files under the repo-level `tests/` covering harness policy (delivery
  contracts, lifecycle routing, install scripts, skill triggers, etc.).
- `scripts/install-harness`, `check_harness.py`/`check-harness`,
  `model_route.py` and `worktree.py` are complete, executable, and exercised
  by both CI and their own tests — the installer/policy tooling layer is the
  most mature part of the repo.
- `config/security-evidence.json`'s `adapters.claude-agent-sdk` entry shows
  the adapter-pinning machinery is live, not aspirational: it records an
  actual installed npm version, a real lock-integrity hash, and real
  SHA-256s of the on-disk executable and wrapper.

**Aspirational / explicitly incomplete (by the project's own admission):**
- The `agent-fabric` README states outright: "final integrated verification,
  independent review and human acceptance remain pending," and warns its own
  README does not cache live daemon/adapter/registration state — you must
  query the running process.
- Every one of the five specs declares implementation in progress with human
  acceptance still pending — there is no spec marked fully done.
- Normal test suites explicitly do **not** prove real-world integration:
  the fabric README notes tests "use temporary databases and fake provider
  boundaries. They do not log into providers, register MCP servers or prove
  the Console's human timed-identification acceptance gate" — that gate is
  evaluated separately and is a human-in-the-loop requirement, not something
  CI can close.
- Several provider adapters are present as source but are "optional" and
  disabled by default (`pi-rpc`, `agy`, `cursor-agent`, `kiro-acp` all exist
  under `src/adapters/providers/optional/` and are listed in
  `adapter-compatibility.yaml`'s `allowedAdapters` but not all are in
  `activeAdapters`); only `claude-agent-sdk`, `codex-app-server`, `agy`,
  `cursor-agent` and `kiro-acp` are currently marked active, with Pi called
  out elsewhere as "ready but unavailable until an open-weight
  provider/model is installed."
- This directory itself (`docs/agent-harness-comprehensive-review/`) already
  contains a large prior review pack (`COMPREHENSIVE_REVIEW.md`,
  `findings-register.md`, `target-architecture.md`, a `fabric-refactor-plan.md`,
  etc., dated 13 July) — meaning a scoping/review effort on exactly this
  question was already underway before this primer was requested, and this
  primer should be read alongside those documents rather than as the first
  word on the subject.

**Bottom line for architecture decisions**: the daemon, protocol, Console and
Herdr adapter are real, buildable, tested TypeScript systems with a genuine
CI gate — this is not vapourware. But the project's own specs and READMEs are
consistent and candid that nothing here has cleared final human acceptance;
the daemon in particular is pre-release, and its own documentation instructs
readers to distrust any cached description of live state (including,
implicitly, parts of this primer) in favour of querying the running process
directly (`agent-fabric status --json`, `agent-fabric doctor --json`).
