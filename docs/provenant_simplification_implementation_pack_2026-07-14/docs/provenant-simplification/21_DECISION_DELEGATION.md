# Decision delegation

Status: proposal extracted from the 2026-07-13 re-review, not yet ratified. Adopt through WP1 ADRs alongside `04_PROGRESSIVE_GOVERNANCE.md`.

## 1. Why this exists

`04_PROGRESSIVE_GOVERNANCE.md` answers *how much* control a piece of work needs (Advisory to Terminal). It does not answer *who* is authorised to resolve a specific decision, or whether an actor may proceed under a default without stopping.

This section adds that orthogonal axis: a per-project charter naming, for each decision class, which actor resolves it (chair / council / human) and how (automatic / soft / hard). It preserves every hard authority boundary; delegation only narrows.

Governing schemas:

- `schemas/decision-delegation.schema.json` (charter) and `schemas/examples/decision-delegation.example.json`;
- `schemas/decision-request.schema.json` (non-blocking decision surface) and `schemas/examples/decision-request.example.json`.

## 2. Precedence

A decision resolves under the highest layer that applies:

1. platform/system safety policy;
2. current direct human instruction;
3. human-approved project decision-delegation charter;
4. accepted ADR and current normative spec;
5. approved issue/run authority and acceptance;
6. chair plan and council decisions;
7. worker instructions.

A lower layer may narrow authority. It may broaden only where a higher layer explicitly delegates that dimension. Prose saying "the LLM may decide" is never sufficient: the charter must be authenticated and digest-bound to the run, or validators and protocols still expect human evidence.

## 3. Decision-delegation charter

Scoping creates or updates one project charter, approved once and digest-bound to the run/project. It lives at its permanent owner (recommended `docs/governance/agent-autonomy.md`) with validated frontmatter, not as a review-pack attachment.

The charter owns: human touch-points; delegated decision classes; council thresholds; issue/PR permissions; merge policy; scope-delta policy; risk/budget ceilings; external-effect exclusions; override/cut-point rules; expiry and revocation.

The charter does not own: current lane status; task lists; current model IDs; active worktree names; specification details. Those belong to issues/Fabric/receipts.

### Default authority table

| Decision class | Default authority |
|---|---|
| Implementation detail inside spec | chair |
| Reversible spec clarification inside outcome/authority | chair |
| Material but reversible design fork | authorised council |
| Issue creation/update inside repository | chair |
| PR topology/change inside Git policy | chair |
| Risk increase within approved ceiling | council |
| ADR supersession | council or human, project-selected |
| Outcome/non-goal change | human |
| New repository/data disclosure/secret scope | human |
| Irreversible migration/destructive action | human |
| External release/deploy/publish/send | human unless explicitly named |
| Merge to protected main | project policy, normally human for Provenant |

### Resolvers

A decision is resolved by exactly one typed resolver. A delegated resolution is never recorded as a human-gate resolution.

- `human-operator` — operator id + attestation;
- `delegated-chair` — agent id + charter digest;
- `delegated-council` — chair agent id + charter digest + deliberation artefact + participant families;
- `system-supersession` — cause.

Each gate or decision request names: decision class; allowed resolvers; required evidence; risk ceiling; expiry; default/override behaviour; affected operations/tasks.

## 4. Non-delegable hard boundaries

The charter may delegate broad implementation decisions while retaining non-delegable defaults:

- new external repository or data disclosure;
- secrets/credential scope;
- network-egress expansion;
- release, deploy, publish or external communication;
- destructive/irreversible migration;
- production mutation;
- risk above the charter ceiling;
- overriding platform/system policy.

A project may explicitly delegate a *named* operation, but never through vague "implement everything" wording.

## 5. Scope-delta classes

Every scope change is typed Class A, B or C. This replaces the blunt "scope/design drift returns to human" rule.

### Class A — implementation detail

Criteria: no observable acceptance change; no authority/risk/effect change; no ADR decision; no new non-goal violation.

Action: update issue/plan; proceed; mention in the PR if material to reviewers. No human or council decision.

### Class B — delegated reversible delta

Criteria: changes current spec wording, acceptance detail or internal design; remains inside approved outcome, non-goals, authority, budget and risk ceiling; reversible without destructive migration or external effect.

Action:

1. chair prepares a delta with options/recommendation;
2. council deliberates when the charter requires it;
3. update spec/ADR/issue atomically;
4. create a non-blocking soft `DecisionRequest` (see §6);
5. proceed under the recorded default;
6. describe the delta and decision evidence in the PR.

The human may steer or override before the declared cut-point. After the cut-point, an override becomes a rework issue rather than erasing history.

### Class C — hard boundary

Includes: changed outcome or non-goal; broader repository/path/data/secret/network authority; higher risk than the approved ceiling; irreversible/destructive migration; release/deploy/publish/send; unresolved safety/security evidence; conflict with platform/system policy.

Action: open a hard gate; stop only the affected dependency subtree; continue independent work when safe; request explicit human authority.

## 6. DecisionRequest — notice / soft / hard

A `DecisionRequest` is a decision surface distinct from a blocking `ScopedGate`. It lets a chair-delegated Class B delta surface itself in the Console/CLI without stopping work. Schema: `schemas/decision-request.schema.json`.

Modes:

- `notice` — no response expected;
- `soft` — non-blocking; the recorded `default_action` may apply at `override_until`/`cut_point`;
- `hard` — represented and enforced by a scoped gate.

Key fields: `decision_id`, `mode`, `class`, `scope` (issue + tasks), `question`, `options`, `recommendation`, `default_action`, `default_applied_at`, `override_until`, `cut_point`, `evidence_refs`, `council_record`, `related_prs`.

Lifecycle (`status`): `open` → `default-applied` | `human-overrode` | `chair-resolved` | `council-resolved` | `superseded` | `closed`.

The Console Attention view distinguishes Notices, Soft decisions, Hard gates and Failures/degradation, with actions to steer/override, approve/reject, open the linked artefact, acknowledge, or defer within policy.

## 7. Council as deliberation, not a vote

The council is a deliberative mechanism, not a majority-vote oracle. Use one only where marginal decorrelated perspective justifies the cost; never for routine implementation.

Protocol:

1. freeze the question, evidence and decision criteria;
2. obtain independent first passes from decorrelated families/lenses;
3. list agreements, disagreements and falsifiable claims;
4. run objective checks where possible;
5. the chair adjudicates against evidence, policy and reversibility;
6. record dissent and residual uncertainty;
7. apply only if the delegation charter permits the class.

Required deliberation record:

```yaml
question:
decision_class:
criteria:
participants:
  - family:
    lens:
    recommendation:
    evidence_refs: []
agreements: []
disagreements: []
objective_checks: []
chair_adjudication:
residual_uncertainty:
charter_digest:
```

A 2–1 split is not proof. The chair decides because the charter delegates that class and the evidence supports the decision, not because of a headcount.

## 8. Human attention policy

Default human touch-points: human-initiated crucial scoping/grill; any Class C hard decision; final PR/merge review where project policy requires it; release/external-effect authority. Everything else is chair/council work inside the approved charter.

The human may intervene at any time through chat or Console. A response should steer live work without requiring agents to have blocked unnecessarily.

## 9. Cross-references

- `03_MINIMAL_CONTRACTS.md` — `DecisionDelegation` and `DecisionRequest` subcontracts.
- `04_PROGRESSIVE_GOVERNANCE.md` — governance levels (the orthogonal *how-much* axis).
- `09_WORK_PACKAGES_AND_SEQUENCE.md` — PR topology selection consumes the same scope-delta typing.
- `22_DOCUMENT_GOVERNANCE.md` — where the charter document lives and how it is checked.
- `07_SECURITY_AUTHORITY_AND_EFFECTS.md` — hard-boundary enforcement and typed effects.
