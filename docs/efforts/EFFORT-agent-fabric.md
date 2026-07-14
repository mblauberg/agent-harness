# EFFORT: shared agent fabric

Updated: 11 July 2026
Status: awaiting final human acceptance

## Destination

Implement and verify Stages 1–5 of the accepted [Agent Fabric
contract](../specs/agent-fabric/scope-and-invariants.md), then stop at final human
acceptance. The human subsequently authorised a coordination-only daemon and
global MCP registration for the five configured clients. Provider-adapter
activation, provider quota use, release and Git publication remain outside it.

## Route

- [x] Leg 1 — accepted contract, run receipt and implementation baseline
- [x] Leg 2 — Stage 1 transactional core, daemon, fencing and recovery
- [x] Leg 3 — Stage 2 symmetric MCP facade and scoped resources
- [x] Leg 4 — Stage 3 primary wrappers, lifecycle, visibility and crash reconciliation
- [x] Leg 5 — Stage 4 optional wrappers, model guards and degradation
- [x] Leg 6 — Stage 5 teams, budgets, dependencies, subtree recovery and evaluation
- [x] Leg 7 — deterministic verification, live MCP registration, independent
  review, bounded repair and scoped commit complete

## Blocked / parked

- Real provider adapters and the optional automatic Herdr event-to-pane bridge
  remain disabled/unimplemented.
- The harness lifecycle implementation is committed. The human assigned ownership of the
  remaining directory state and authorised a scoped fabric integration commit.
- AFAB-001 uses the canonical `delivery-run` v1 receipt. Its validator hashes
  declared artifacts directly and does not depend on a clean Git index or the
  retired implement receipt shape.

## Invariants for every leg

- Follow [HARNESS.md](../../HARNESS.md) and the accepted specification.
- One serial source writer; reviewers remain source-read-only.
- Provider credentials and sessions remain outside deterministic tests. Live
  MCP transport tests use only fabric seat capabilities and the local daemon.
- Durable state lives in this effort map, the implementation run directory and
  owned documentation, not pane transcripts.

## Trail

- 10 July 2026 Codex: human accepted and authorised Stages 1–5; Fable and three native reviewers assigned; implementation baseline started.
- 10 July 2026 Codex/Fable/native team: implemented all deterministic stages, squashed the unreleased schema to one baseline, refactored client/command/persistence/read/receipt/transport boundaries, added disabled provider wrappers, and closed the first review's fencing, crash, receipt, visibility, scope, lock and recovery defects.
- 10 July 2026 verification: 69 files/206 tests, strict typecheck/build, 23-sample evaluation, 32-agent/1,000-operation load gate and zero production dependency vulnerabilities passed. Final fresh reviews are running; live activation remains gated.
- 10 July 2026 registration: provisioned separate Agy, Claude, Codex, Cursor
  and Kiro seats; registered the secret-free proxy configuration in each
  client's global MCP registry; verified five-seat tool/resource/run access;
  and completed an acknowledged Codex↔Claude MCP mailbox round trip. Runtime
  verification now passes 77 files/246 tests. Provider adapters remain off.
- 10 July 2026 post-registration repair: replaced fixed project capability
  paths in all five global registries with cwd-scoped seat selection; added
  socket-plus-database daemon ownership, explicit project authority roots,
  private database files, descriptor-safe credential reads and clean MCP EOF
  shutdown; restarted the visible daemon through the trusted coordination-only
  configuration. Final gates: runtime 78 files/251 tests, harness 306 tests,
  evaluation 13/13, load 1/1 and zero production dependency vulnerabilities.
- 11 July 2026 router integration: made fabric adapter activation the default
  route gate for Claude, Codex, Agy, Cursor, Kiro and Pi; direct CLI executors
  opt in explicitly while retaining family/pattern checks. Added the harness lifecycle contract to the
  specification index and reconciled the full harness suite.
- 11 July 2026 reliability sweep: extended the default activation gate to the
  Claude and Codex fabric adapters, retained rejected route receipts, and
  removed the runtime suite's wall-calendar expiry dependency. Runtime remains
  78 files/251 tests; the whole harness is 309 tests and 18/18 held-out routes.
- 11 July 2026 final hardening: moved daemon ownership into child-held
  OS-backed SQLite lifetime locks; rejected database aliases; made seat renewal
  an immutable staged generation with atomic cutover; re-admitted provider turns
  against delegated authority; enforced trusted model/executable/argv policy;
  aligned public authority and currency schemas; and preserved caller cwd in
  the MCP source launcher. Runtime is 82 files/279 tests; the whole harness is
  312 tests, held-out routing is 18/18, evaluation/load are green, production
  audit is zero-vulnerability, and five-seat health plus acknowledged
  Codex↔Claude MCP round trips pass against the visible daemon.
- 11 July 2026 final integration: native and Fable delta reviews returned clean
  at P0–P2, the canonical AFAB-001 delivery receipt validated with live hashes,
  and the scoped fabric tree was committed on `main`; push remains unperformed.
