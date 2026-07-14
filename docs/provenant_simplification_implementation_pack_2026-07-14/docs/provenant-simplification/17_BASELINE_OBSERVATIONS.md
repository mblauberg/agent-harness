# Baseline observations to verify

## Evidence boundary

These observations were derived from a static review of repository head:

`1ddfe24858b362decb1c507b87a466df26d205eb`

Verify them on the current branch before implementation. Update this file during Work Package 0.

## 1. Current product model

- Provenant presents itself as a gated delivery lifecycle for coding agents.
- The harness includes a constitution, 33 Skills, risk and delivery policy, Agent Fabric, protocol, Console, Herdr integration and provider adapters.
- The stated objective is quality per human attention-hour.
- One primary is the session chair; concurrent source writers must not overlap.

## 2. Current lifecycle

The repository documents:

```text
session
→ scope
→ approval
→ execute
→ deterministic verification
→ conditional evaluation
→ independent review
→ human acceptance
→ separately authorised release/effect
→ observation and retrospective
```

The concrete transition table lives in `runtime/agent-fabric/src/lifecycle/engine.ts:286`; the receipt checks live in `scripts/validate_delivery.py`. Related policy also appears in root instructions, Skills, JSON configuration, architecture, specifications and runtime code.

## 3. Current primary-provider posture

At the review baseline:

- Codex App Server thread configuration forced a read-only sandbox and never-approve policy.
- Claude Agent SDK options used plan mode and read-only tools.
- Fabric provider admission independently injected read-only controls and rejected provider permission overrides.

Verify whether the active capability-profile effort has changed any of these paths.

## 4. Current authority programme

The repository has accepted direction for:

- provider-neutral capability profiles;
- `review-readonly`;
- `workspace-write-offline`;
- pure authority compiler extraction;
- one-provider adversarial write pilot;
- second-provider follow-up;
- separation of workspace writes from external effects.

Confirm current status and active handoffs.

## 5. Current repository structure

Verify:

- root npm workspace and lockfile;
- protocol, Fabric, Console and Herdr packages;
- Rust review-portal supervisor;
- current CI jobs and platform matrix;
- active specification versions;
- current test and audit status.

## 6. Current maintainability concerns

Previously identified:

- large, highly concentrated Fabric implementation;
- duplicated lifecycle ownership;
- concentrated Console rendering/interaction code;
- machine-local compatibility data in tracked configuration;
- extensive amendment-heavy specifications;
- declared security controls with uneven implementation status;
- broad review pressure;
- incomplete typed intake/backlog execution bridge.

Record which findings remain, are resolved or were superseded.

## 7. Work Package 0 update table

| Observation | Current evidence | Status | Consequence |
|---|---|---|---|
| Read-only Codex profile |  |  |  |
| Read-only Claude profile |  |  |  |
| Fabric admission profile |  |  |  |
| Root workspace | Lane B (root npm workspace, single lockfile, TS project references) landed via PR #7 per `docs/efforts/EFFORT-capability-profiles.md`; fixed `@local/agent-fabric-protocol` resolution | Resolved (pending confirm on current `main`) | F-011 closed by Lane B; re-verify clean-checkout build |
| Current full test result |  |  |  |
| Provider conformance |  |  |  |
| Active authority effort | Capability-compiled execution authority (ADR-0002): Lane A spec authority in progress; Lane B landed (PR #7); Lane C characterisation goldens integrated (`6748ceb`), V2 cutover BLOCKED on Lane A freeze + Lane B; Lanes C/D deferred | In progress | V2 authority cutover gated on Lane A anchored audit + human-approved spec freeze |
| Lifecycle duplicate surfaces |  |  |  |
| Machine-local tracked data |  |  |  |
| Spec acceptance state |  |  |  |
| Console/Fabric concentration |  |  |  |
| Effect-plane implementation |  |  |  |
| Branch/ruleset status |  |  |  |

## 8. Baseline completion

Work Package 0 is complete only when:

- commands and results are reproducible;
- current failures are categorised;
- the active implementation seam is identified;
- no package depends on a stale assumption in this file.

## 9. Findings-resolution state (folded from `SPEC05-APPLICABILITY.md`)

Source now superseded; captured here before deletion. This overlays the static
findings on merged `main`.

- **Resolved on merged `main`:** F-005 (README reports 33 skills, count
  equality-tested), F-006 (traceability runbook names Specs 01 v0.36 / 04 v1.31
  / 05 v1.13 without claiming completion), F-018 (parallel fan-out value gate +
  nine topology fixtures, isolated commit `97d74d9`), F-010 (Spec 05 intake seam
  exists; broader intake kernel is follow-on), F-020, F-033 partial
  (Console/Herdr seam boundary tests exist), F-027 resolved at spec level
  (threat modes in Specs 01 v0.36 / 04 v1.31).
- **Conflict (needs a binding-spec amendment before applying):** F-001 (write
  profile vs read-only certifying actions in Specs 01/05), F-014/F-016 (route
  learning / risk-adjusted review vs Spec 05 four-slot profile), F-023 (spec
  restructuring must be an approved spec edit only), F-030/F-031/F-032/F-046
  (nonbinding-future / new-scope items in Spec 05).
- Everything else: **Deferred** to fresh sessions (see the superseded source's
  fresh-session dependency order).

### Spec-freeze precondition (from the uncommitted local mod — captured)

The `SPEC05-APPLICABILITY.md` source carried an **uncommitted** local
modification, lost on directory deletion, captured here verbatim in substance:

- The integration precondition Spec 05 is **v1.13 draft**; its material post-v1.0
  additions still need an exact authority trace or human acceptance.
- Current `main` contains those draft amendments through consolidation merge
  `941a72f`; **that satisfies ordering only. It does not freeze or accept them.**
  Lane A's anchored audit and a human-approved spec freeze remain prerequisites
  for the ADR-0002 V2 authority cutover.

This freeze precondition also belongs with `25_AUTHORITY_V2_AND_CONTAINMENT.md`
and `docs/specs/amendment-audit-2026-07-13.md`.

## 10. Verified baseline facts (folded from `findings-register.md` verification annex)

Verified against a live checkout at HEAD `babd47a` (2026-07-13); these are
verified facts, not claims. They fill the WP0 table rows above.

- **F-001:** read-only is enforced **twice** — hardcoded in both adapters
  (`codex-app-server.ts:194-201`, `claude-agent-sdk.ts:219-258`) AND re-forced by
  `fabric.ts:6537` `#admitProviderPayload`, which strips forbidden controls and
  injects `sandbox: "read-only"`. Any write path needs changes at both layers.
- **F-002:** `fabric.ts` is exactly **7,401 lines / 154 methods**; beyond the
  listed 7 responsibility families it also owns task/message orchestration and
  capability/authority issuance.
- **F-003:** the mixing defect is entirely in tracked
  `config/adapter-compatibility.yaml` (Homebrew paths, per-machine sha256s,
  `darwin-arm64`, local verification dates); `config/agent-fabric.yaml` is clean
  (env-var interpolated, no absolute paths/digests).
- **F-007:** **13 of 14** declared security checks have no implementation; the
  scanner covers Python only, so the whole TypeScript runtime is unscanned.
  (`static-security-check.py` is wired into CI and `security-evidence.json` is
  consumed, but only as fixture data for synthetic receipts, not a live gate.)
- **F-023:** amendment sections are **~72% of spec 01** (8,223 lines) and **~93%
  of spec 04** (4,779 lines); spec 05 is only ~8%.
- **F-036:** live `gh api` shows `main` has **no branch protection and no
  rulesets at all** — affirmatively confirmed.
- Live session evidence: `scripts/agent-fabric status` failed on this machine
  with `ERR_MODULE_NOT_FOUND: @local/agent-fabric-protocol` (F-011; since
  addressed by Lane B).

Verification verdict at `babd47a`: 45 CONFIRMED, 1 PARTIALLY CONFIRMED (F-026),
0 refuted. The post-merge supersedence (F-005/F-006/F-018 resolved) is recorded
in §9 above.
