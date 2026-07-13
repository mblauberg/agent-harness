# Decision register

These are recommendations for approval, not decisions already made.

| ID | Recommended decision | Status | Rationale |
|---|---|---|---|
| D-001 | Use a modular monolith with one SQLite authority | Recommend | Best balance of transaction safety, local operation and maintainability |
| D-002 | Provider-native APIs own session mechanics | Recommend | Avoids recreating threads, turns, subagents, compaction and UI semantics |
| D-003 | Fabric owns neutral authority, work, evidence and reconciliation | Recommend | Core differentiator and cross-provider source of truth |
| D-004 | Add capability/authority profiles | Recommend | Closes read-only implementation gap safely |
| D-005 | Separate workspace writes from external effects | Recommend | Enables useful autonomy without privileged credentials |
| D-006 | Add one generated harness manifest | Recommend | Eliminates catalogue/config/documentation drift |
| D-007 | Make lifecycle an executable policy | Recommend | Removes repeated prose and inconsistent gates |
| D-008 | Add `architecture-review`; keep `refactor` implementation-focused | Recommend | Clean trigger/authority/artefact boundary |
| D-009 | Implement intake, execution plans and backlog as schemas/runtime | Recommend | They are state/control contracts, not occasional prose methods |
| D-010 | Default paired Claude/Codex scoping for broad consequential work | Recommend | Increases option coverage while retaining one chair |
| D-011 | Use risk/oracle-adjusted certifying review | Recommend | Preserves independence without indiscriminate cost |
| D-012 | Use MCP for focused tools/context, not whole orchestration | Recommend | Fits MCP's composable server model and avoids control-plane coupling |
| D-013 | Keep Herdr optional and non-authoritative | Recommend | Current boundary is correct |
| D-014 | Add governed retention deletion | Recommend | Prevents unbounded state and context growth |
| D-015 | Split portable configuration from local attestations | Recommend | Enables distribution and reproducibility |
| D-016 | Use one root workspace before advanced build tooling | Recommend | Removes duplicated installs with minimal machinery |
| D-017 | Console core depends on protocol only | Recommend | Enables local, desktop and remote presentation |
| D-018 | Direct cutover by default before stable release | Recommend | Avoids unnecessary compatibility debt |
| D-019 | Add explicit local threat modes | Recommend | Prevents overclaiming same-user isolation |
| D-020 | Proposal-first, evaluated self-improvement | Recommend | Enables learning without silent policy mutation |

## Rejected or deferred

| Alternative | Decision | Reason |
|---|---|---|
| Rewrite Fabric as microservices | Reject now | Distributed transactions and operations exceed demonstrated need |
| Replace Fabric with provider-native coordination | Reject | Loses neutral authority/evidence/reconciliation |
| Make MCP the scheduler/event bus/process supervisor | Reject | Wrong centre of gravity for local durable control |
| Add many persona/team skills | Reject | Increases routing/context competition; team composition should be data |
| Require GPT, Claude, Gemini and Grok on every change | Reject | High cost and correlated noise; use marginal expected value |
| Archive all state forever | Reject | Unsustainable; use retention classes and legal holds |
| Never delete compatibility code | Reject | Contradicts pre-release status and maintainability |
| Let model sessions hold release credentials | Reject | External effects require separate executor |
| Rely on hooks as security enforcement | Reject | Hooks are useful telemetry/policy assists, not sole hard boundary |
| Move all Python to TypeScript | Reject | No outcome benefit demonstrated |
| Introduce Nx/Turbo immediately | Defer | Root workspace likely sufficient initially |
| Support Windows implicitly | Reject | Declare unsupported/experimental until IPC/install/permissions are tested |
| Adopt an external orchestration framework wholesale | Reject | Importing a second lifecycle would undermine the repository's strengths |
