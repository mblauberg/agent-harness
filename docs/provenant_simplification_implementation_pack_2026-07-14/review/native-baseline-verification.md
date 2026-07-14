# Native baseline verification — provenant simplification implementation pack

Verifier: `verify-baseline` (fresh-context native, Claude Opus 4.8)
Date: 2026-07-14
Scope: adversarial accuracy check of
`docs/provenant_simplification_implementation_pack_2026-07-14/docs/provenant-simplification/`
against the LIVE repository at head.

Repo head at verification time:
`1ddfe24858b362decb1c507b87a466df26d205eb` — this is exactly the commit the
baseline observations (17) declare as their evidence boundary, so the pack's
factual anchors are checked against the same tree they were derived from.

## Method note

The pack is a target-architecture / implementation plan. Most of its content is
prescriptive ("Target:", "should own", "Remove or demote"). Verification here
targets the falsifiable factual anchors: the baseline observations (17), path
and component existence in the change map (08), and the "existing mechanism"
spot-checks in 05/07 — plus contradictions against accepted ADRs 0001–0008 and
the active human-approved efforts.

Bottom line: the pack's factual anchors are **substantially accurate**. No P0
and no false statements of current fact were found. One P1 governance
divergence against an active human-approved effort is unacknowledged; the rest
are P2 precision / staleness / reconciliation gaps.

---

## Findings

### P1-1 — Governance model diverges from the active chair charter, unacknowledged

- Claim: `05_ROUTING_AND_MODEL_POLICY.md:130-138` — "The chair may not revise
  without approval: objective; material acceptance criteria; risk floor; write
  or disclosure authority; external-effect ceiling; one-way-door decisions."
  Reinforced by the pack's progressive-governance framing (04) and the human
  gate posture implied across 06/07/14.
- Evidence: the active, human-approved `docs/efforts/EFFORT-capability-profiles.md:172-192`
  runs the whole programme under the autonomous chair charter where **"The only
  human gate is PR review"** and the previously human-gated decisions —
  write-profile spec-amendment acceptance, the Step-3 containment-spike verdict,
  risk-tier and lane acceptance, Spec-05 close-out judgements — are now
  **LLM-resolved** (chair discretion or council vote), landing via PR
  (`EFFORT-capability-profiles.md:180-186`).
- Impact: an implementer who follows the pack literally would hold for human
  approval on acceptance/risk/spec-amendment decisions that the active charter
  says to council-resolve. Two human-approved documents disagree on who holds
  the acceptance authority, and the pack does not cite or reconcile the charter.
- Suggested correction: add a note in 04/05 (and the decision register 15)
  pointing to the CHAIR-CHARTER / `EFFORT-capability-profiles.md` governance
  section, and clarify that "approval" for these gates currently means
  council/chair LLM-resolution with the single human PR gate, not a per-decision
  human stop. The pack's "Preserved boundaries" (no standing network egress,
  external-effect, release, production credentials) DO match the charter and can
  be cited as the still-human-bounded set.

### P2-1 — Routing role vocabulary does not match the live model-routing scheme

- Claim: `05_ROUTING_AND_MODEL_POLICY.md:41-54` — "Core policy uses capability
  roles" then lists `chair`, `fast-read-worker`, `deep-reasoning-worker`,
  `implementation-worker`, `independent-reviewer`, `security-reviewer`,
  `mechanical-worker` (present tense).
- Evidence: none of those role names exist in the live routing mechanism.
  `config/model-routing.json:7-9,22-24` uses capability **aliases**
  `flagship`/`workhorse`/`scout`; ultra-eligibility is keyed to roles `lead`
  and `orchestrator` (`config/model-routing.json:33`). `HARNESS.md:71-72`
  routes via `scripts/model-route` using `flagship`, `workhorse`, `scout`.
- Impact: reads as a description of an existing mechanism but is a proposed new
  vocabulary; an implementer spot-checking against `model-routing.json` finds no
  mapping.
- Suggested correction: mark §3 explicitly as target vocabulary and add an
  old→new mapping (flagship/workhorse/scout + lead/orchestrator → the seven
  capability roles).

### P2-2 — Change map gives a package-relative path for fabric.ts

- Claim: `08_REPOSITORY_CHANGE_MAP.md:233` — heading "`src/core/fabric.ts`".
- Evidence: the actual tracked path is
  `runtime/agent-fabric/src/core/fabric.ts` (7,401 lines — confirming the
  "large, highly concentrated Fabric implementation" concern in
  `17_BASELINE_OBSERVATIONS.md:76` is STILL TRUE).
- Impact: minor; path is package-relative and resolvable but not absolute from
  repo root as every other path in the map is.
- Suggested correction: write the repo-root path
  `runtime/agent-fabric/src/core/fabric.ts`.

### P2-3 — Baseline attributes the transition table to "the delivery validator"

- Claim: `17_BASELINE_OBSERVATIONS.md:35` — "The delivery validator contains a
  concrete transition table and receipt checks."
- Evidence: the concrete transition table lives in the TypeScript lifecycle
  kernel, `runtime/agent-fabric/src/lifecycle/engine.ts:286` (`const
  transitions: Readonly<Record<string, readonly string[]>>`, enforced at
  `:303`). The Python `scripts/validate_delivery_scenarios.py` performs receipt
  compilation/checks (`:74,:139`) but contains no transition table; grep for
  "transition" in both Python validators returns nothing.
- Impact: terminology imprecision could send a WP0 implementer to the wrong
  file. The underlying observation (a concrete transition table + receipt checks
  exist) is TRUE.
- Suggested correction: name `runtime/agent-fabric/src/lifecycle/engine.ts` as
  the transition-table owner and `scripts/validate_delivery_scenarios.py` as the
  receipt-check surface.

### P2-4 — Baseline "verify status" items already resolved by the active effort

- Claim: `17_BASELINE_OBSERVATIONS.md:61-70` asks to "Verify: root npm workspace
  and lockfile" and §4/§5 ask to "Confirm current status" of the authority
  programme.
- Evidence: the root npm workspace is already live —
  `package.json` `workspaces` = protocol/fabric/herdr/console, single
  `package-lock.json` present. `EFFORT-capability-profiles.md:43-52,143-157`
  records Lane B (root workspace, F-011) as **landed via PR #7** and Lane C
  read-only characterisation goldens integrated (`:58-59`).
- Impact: not an error (the file explicitly says "verify"), but the baseline
  reads as if this is open when the accepted effort has moved past it. A WP0
  agent should reconcile against the effort's current lane state, not re-derive
  from scratch.
- Suggested correction: pre-fill the WP0 update table
  (`17_BASELINE_OBSERVATIONS.md:89-103`) rows for "Root workspace" and "Active
  authority effort" with the Lane B-landed / PR #7 state and a pointer to
  `EFFORT-capability-profiles.md`.

---

## Confirmed-accurate anchors (adversarial checks that PASSED)

Baseline observations (17):
- §1 "33 Skills" — TRUE: 33 `skills/*/SKILL.md` (and 33 skill dirs excl.
  `_shared`).
- §1 constitution/risk+delivery policy/Agent Fabric/protocol/Console/Herdr/
  provider adapters — all present (`HARNESS.md`, `config/risk-policy.json`,
  `config/delivery-profiles.json`, `runtime/agent-fabric{,-protocol,-console,
  -herdr}`, adapters below).
- §3 "Codex App Server forced read-only sandbox and never-approve" — TRUE:
  `runtime/agent-fabric/src/adapters/providers/codex-app-server.ts:195`
  (`sandbox: "read-only", approvalPolicy: "never"`).
- §3 "Claude Agent SDK used plan mode and read-only tools" — TRUE:
  `claude-agent-sdk.ts:128` (`CLAUDE_READ_ONLY_TOOLS = ["Read","Glob","Grep"]`),
  `:246` (`permissionMode: "plan"`), `:249` (`defaultMode: "plan"`).
- §4 accepted authority direction (capability profiles, review-readonly,
  workspace-write-offline, authority compiler extraction, one/second-provider
  write pilot, workspace/effect separation) — matches accepted ADR 0002
  (`docs/adr/README.md:11`) and `EFFORT-capability-profiles.md:10-25,90-95`.
- §5 structure — root npm workspace + lockfile ✓; protocol/Fabric/Console/Herdr
  packages ✓ (`runtime/`); Rust review-portal supervisor ✓
  (`runtime/agent-fabric-review-portal-supervisor`); spec versions live at
  Spec01 v0.36 / 02 v1.2 / 03 v1.2 / 04 v1.31 / 05 v1.13
  (`docs/specs/00-index.md:5-9`).
- §6 "machine-local compatibility data in tracked configuration" — STILL TRUE:
  `config/adapter-compatibility.yaml` (tracked; only
  `.claude/settings.local.json` is gitignored) carries absolute machine paths
  (`/opt/homebrew/...` at `:21,:60,:100,:130`) and sha256 hashes throughout.
- §6 "large, highly concentrated Fabric implementation" — STILL TRUE:
  `fabric.ts` = 7,401 lines.

Change map (08) — every referenced path/component exists:
- `AGENTS.md` (1.5 KB, already small), `HARNESS.md`, `README.md`,
  `docs/ARCHITECTURE.md`, `docs/specs/`, `docs/adr/` (0001–0008 + README).
- Skills: `scope`, `implement`, `deliver`, `orchestrate`, `code-review`,
  `evaluate`, `session`, `work-map`, `autonomous-lab` — all present.
- Config: `risk-policy.json`, `delivery-profiles.json`, `model-routing.json`,
  `adapter-compatibility.yaml` (+ `adapter-manifests/`) — all present.
- `runtime/agent-fabric-protocol`; `runtime/agent-fabric/src/adapters/providers/`
  (adapter.ts, claude-agent-sdk.ts, codex-app-server.ts, …) — present.
- `scripts/check-harness` — present; already runs `render_skill_catalogue.py
  --check` (i.e. the "skill catalogue drift" check the map asks to "add or
  retain" is already wired), `validate_delivery_scenarios.py`,
  `static-security-check.py`, `public_release_check.py`.

Routing/security spot-checks (05/07):
- `scripts/model-route` → wraps `scripts/model_route.py` ✓;
  `config/model-routing.json` ✓; `config/risk-policy.json` ✓.
- `review-readonly` / `workspace-write-offline` are correctly presented as
  targets ("Implement only") — grep confirms neither named profile exists in
  `runtime/`/`config/` yet, consistent with ADR 0002 not yet shipped and the
  live read-only adapter posture above. No false "already exists" claim.
- Decision register (15, PS-001..PS-016) is consistent with accepted ADRs
  0001–0008 — no contradiction found (PS-006↔ADR0008 risk/oracle review;
  PS-009 typed effects; PS-010 worktrees-not-containment; PS-013↔ADR0006 queue
  controller deferred; PS-014 one-process one-SQLite).

## No-conflict confirmations against ADRs/efforts

- No pack statement contradicts an accepted ADR (0001–0008 all "Accepted";
  0008 "Accepted, spec amendment pending" — pack 15 PS-006 matches).
- Pack security posture (07 §2 "no networked write until offline proven"; §9
  adversarial containment matrix; §3 worktrees-not-security) aligns with
  `EFFORT-capability-profiles.md` Steps 3/4 and PS-010.
- Only the P1-1 governance-authority divergence is a genuine unacknowledged
  conflict with an active human-approved effort.

---

STATUS: VERIFIED-WITH-FINDINGS — 0 P0, 1 P1, 4 P2. Pack factual anchors are
substantially accurate against head 1ddfe24; the single material conflict is the
unacknowledged governance divergence (P1-1) between the pack's human-approval
gates and the active chair-charter LLM-resolution model. Remaining findings are
precision/staleness/vocabulary reconciliation. No fixes applied (read-only).
