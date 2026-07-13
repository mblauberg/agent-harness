# Source and coverage map

## Review baseline and method

- Repository: `mblauberg/agent-harness`
- Branch: `main`
- Baseline commit: `0ea935f8ccaad550d8db0f9ea40324f58bdda569`
- Review date: 13 July 2026
- Method: static inspection through the connected GitHub interface, with
  current primary-source comparison.
- Limitation: no local checkout was available in the execution environment.
  The build, tests, provider calls, database migrations, daemon, Console,
  installer and security scripts were not executed.

The review distinguishes:

- source inspection;
- tests/configuration that exist;
- current-head verification evidence;
- live provider/human acceptance.

The existence of a test or CI definition is not treated as proof that the
baseline commit passed it.

## Repository evidence by area

| Area | Principal paths examined |
|---|---|
| Product and lifecycle | `README.md`, `HARNESS.md`, `AGENTS.md`, `docs/ARCHITECTURE.md` |
| Specifications | `docs/specs/00-index.md`, Specs 01–05 |
| Skills | core delivery/orchestration skill entry points, authoring/audit guidance, trigger fixtures |
| Fabric | `runtime/agent-fabric/src/core/fabric.ts`, package root, persistence, profiles, adapters, tests, README and runbook |
| Protocol | operations, codecs/client and package configuration |
| Primary providers | Codex App Server and Claude Agent SDK adapters and unit tests |
| Console | model, controller, protocol adapter, production composition, renderer/interaction entry point, tests/spec |
| Herdr | package README, production integration and support boundary |
| Configuration/routing | model routing, adapter compatibility, Fabric activation, risk, delivery profiles and security evidence |
| Tooling | installers, installation manager, worktree helper, harness checks, security/public-release scripts |
| CI/governance | workflow, CODEOWNERS, Dependabot, pull-request template and assurance tests |
| Operations | Fabric operations/traceability runbooks, worktree policy, retention behaviour |
| Research | native orchestration/discovery, 2026 agentic SDLC and skill portfolio research |
| History | recent commits, branches, pull requests/issues and status evidence available through the connector |

## External primary sources

| Topic | Primary source inspected | Relevance |
|---|---|---|
| Codex session integration | OpenAI Codex `codex-rs/app-server/README.md` | Threads, turns, items, resume/fork, permissions, goals, subagent lineage and streaming |
| Codex instructions/subagents/hooks | Official OpenAI Codex repository/documentation | Native instruction discovery, subagent and hook capabilities/limitations |
| Claude Code integration | Official Anthropic Claude Code documentation/repository | Agent SDK, subagents, worktree isolation, instructions/rules and hooks |
| MCP architecture/security | Model Context Protocol specification and security guidance | Host/client/server roles, focused servers, authorization and confused-deputy controls |
| Autonomous repository work | OpenAI Symphony specification | Tracker-to-workspace orchestration, bounded concurrency and isolated runs |
| Staged agentic effects | GitHub Agentic Workflows documentation/repository | Read-only defaults, safe outputs, trust layers and staged writes |
| Architecture-review technique | `mattpocock/skills`, `improve-codebase-architecture` and `codebase-design` | Candidate exploration, deep modules, deletion and interface tests |

## Coverage exclusions

The following require a separate, explicitly authorised implementation or
release-candidate exercise:

- clean checkout and dependency installation;
- full Python/TypeScript gates;
- database baseline and migration tests;
- real Codex and Claude provider calls;
- authenticated desktop/native UI tests;
- human Console identification/usability gate;
- operating-system isolation and network enforcement;
- branch protection/ruleset verification outside connector-visible metadata;
- artefact reproducibility, SBOM, provenance and signing;
- load behaviour on the user's target machine.
