# Minimal contracts

## 1. Design rules

### 1.1 One lifecycle, one receipt

Do not create a second lifecycle or receipt system.

Ownership runs in one direction (ADR-0005, `HARNESS.md` "Lifecycle"). The delivery kernel — the `delivery-run` schema-v1 receipt, `config/delivery-profiles.json` and `skills/deliver/scripts/validate_delivery.py` — is the canonical cross-domain owner of lifecycle state: run, review, effect, event and receipt data. The Fabric protocol and runtime own only Fabric-specific transport projections of that state, plus the explicit mappings into it (for example the delivery-V2 to Fabric-V2 authority mapping, `25_AUTHORITY_V2_AND_CONTAINMENT.md §2`).

Fabric is never the canonical owner of cross-domain delivery lifecycle data. A Fabric-side run, review, effect, event or receipt structure that cannot be derived without loss from the delivery kernel is a second lifecycle, and is prohibited.

The structures below are conceptual subcontracts of that one kernel. Existing canonical receipts should project or embed them. Routine work may use a reduced in-memory or ephemeral form where policy permits.

### 1.2 Import authority, do not restate it

`AuthorityEnvelopeV2` is the single authority contract (ADR-0002; canonical schema at `25_AUTHORITY_V2_AND_CONTAINMENT.md §1`, to be protocol-owned at `runtime/agent-fabric-protocol/src/authority.ts` per that document's file plan, §4). Every contract here either references V2 or states an explicit, named projection of it. A narrower parallel authority shape is prohibited.

### 1.3 Class-tag persisted state

Every contract in this file that is persisted on its own carries a `retention_class`, validated against the five ADR-0007 classes:

- `ephemeral` — scratch, temporary renders, disposable worktrees;
- `operational` — detailed events, intermediate checkpoints, provider debug output;
- `evidence` — receipts, approvals, test results, effect records;
- `durable-knowledge` — current specs, ADRs, runbooks, promoted research;
- `sensitive` — credentials, raw private input, secret-bearing debug.

**These five strings are the machine identifiers** — the exact values admitted by the schemas in `schemas/` and written into persisted state. ADR-0007 names the classes in prose; the prose names map 1:1 onto the machine identifiers, and only the fifth differs:

| ADR-0007 prose name | machine identifier |
|---|---|
| ephemeral | `ephemeral` |
| operational | `operational` |
| evidence | `evidence` |
| durable knowledge | `durable-knowledge` |
| sensitive | `sensitive` |

A space is not admissible in a JSON enum or a persisted field value, so `durable knowledge` is a prose name only and `durable-knowledge` is its sole machine identifier. The ADR-0007 amendment records this mapping; no other spelling is accepted in this pack, in any schema or in any example.

The value is validated on admission; an absent or unknown class is refused, not defaulted. Each independently persisted contract below states its default class; a record that carries secret-bearing content is reclassified `sensitive`.

A structure that is only ever embedded in another contract — the loop policy (§8), embedded in a run or node, is the single case — carries no class of its own and inherits its container's class. Every other contract in this file (§2, §3, §4, §5, §6, §7, §9, §10, §11, §12, §13) is independently persisted and states an explicit default class.

Class-tagging is the whole of the near-term obligation (ADR-0007). Governed deletion machinery — preview, protected paths, legal hold, deletion receipts, refuse-unknown-files — ships after the ADR-0002 tranche; archive-only behaviour holds until then.

## 2. Minimal run envelope

A routine or serial run needs only:

```yaml
run_id: PROV-142
goal: Add tenant-scoped API rate limiting
risk: substantial

acceptance:
  - limits are independent per tenant
  - existing unauthenticated behaviour is unchanged
  - declared deterministic checks pass

authority:                        # delivery-side projection of AuthorityEnvelopeV2
  schema_version: 2
  profile: workspace-write-offline
  approved_by: human-operator
  evidence: authority-approval
  evidence_digest: sha256:<approved-artefact-digest>
  workspace_roots:
    - .worktrees/prov-142
  allowed_source_paths:
    - src/api
    - tests/api
  allowed_artifact_paths:
    - src/api
  denied_paths: []
  allowed_fabric_operations:      # exact IDs from the protocol operation registry
    - fabric.v1.task.read
    - fabric.v1.task.claim
  denied_fabric_operations: []
  prohibited_actions:
    - push
    - merge
    - release
  disclosure: local-only
  secrets_access: none
  deployment: false
  irreversible_actions: false
  network:
    tool_egress: none
  expires_at: 2026-07-15T00:00:00Z
  budget:                         # required V2 member; maps to Fabric V2 `budget`
    maximum_turns: 40
    maximum_wall_time_minutes: 90
    maximum_repair_cycles: 2

checks:
  - npm test
  - npm run typecheck

effect_ceiling:
  - propose-pull-request

retention_class: evidence         # persisted run envelope (§1.3)
```

`authority` is not a contract of its own. It is the delivery-side projection of `AuthorityEnvelopeV2` (ADR-0002; `25_AUTHORITY_V2_AND_CONTAINMENT.md §1`), field-for-field per that document's mapping table (§2). Two properties are load-bearing and may not be thinned:

- **Approval and evidence binding.** `approved_by`, `evidence` and `evidence_digest` map to V2 `approval.approvedBy`, `approval.evidenceId` and `approval.evidenceDigest`. The digest is of the artefact linked by the delivery authority's passing `authority-approval` evidence, so the grant is independently bindable rather than a copy of a mutable evidence ID. A child authority keeps the parent's approval binding exactly.
- **Closed dimension set.** V2 closes over `secrets`, `deployment`, `irreversibleActions` and `network` in addition to path, operation, disclosure, expiry and budget scope. No dimension receives an implicit permissive default and there is no unrestricted-network variant; `network` governs model-invoked tool and subprocess egress, not the provider control plane. An enabling variant requires its non-empty set (`references`, `targets`, `actionIds`, `allowedHosts`). An omitted dimension is a refusal, not an allowance.
- **Budget is inside the envelope.** `budget` is a required member of `AuthorityEnvelopeV2` (`25_AUTHORITY_V2_AND_CONTAINMENT.md §1`) and the delivery `budget` map maps directly to Fabric V2 `budget` (that document's §2 mapping table). It is therefore a member of the authority projection, never a sibling of it: budget is an authority dimension, and a budget held outside the envelope would be a parallel authority shape (§1.2). A contained child reduces every budget unit and can never raise one. No contract in this file carries a second, envelope-external budget.

The kernel produces effective authority. The model never supplies trusted provider controls directly.

## 3. ScopePacket

Use for unsettled work.

Required semantics:

- problem or opportunity;
- users or affected systems;
- goals and non-goals;
- acceptance criteria;
- assumptions;
- decisions and one-way doors;
- evidence and source provenance;
- risk assessment;
- requested authority, as an `AuthorityEnvelopeV2` projection (§1.2, §2);
- unresolved owner decisions;
- approved digest;
- `retention_class` (default `evidence`).

The ScopePacket may produce one WorkItem or an Initiative.

## 4. Initiative

Use only when one approved outcome decomposes into several independently valuable WorkItems.

Fields:

```text
initiative_id
title
outcome
scope_digest
approval_digest
risk_floor
dependencies
integration_owner
status
expiry
retention_class            # default durable-knowledge
```

An Initiative is not a standing mandate. Any material scope change invalidates readiness until reapproved.

## 5. WorkItem

The WorkItem is the normal unit of implementation, authority, evidence and PR lineage. Its budget is an authority dimension, carried inside the bound envelope (§2), not a WorkItem field of its own.

Required semantics:

```text
work_item_id
initiative_id or standalone
tracker reference
objective
non-goals
acceptance criteria
verification strategy
dependency list
risk tier
authority                  # the AuthorityEnvelopeV2 projection of §2, carrying
                           #   the requested capability profile, the expected
                           #   source scope, the prohibited scope, the budget
                           #   map and the expiry
governing decision digests
spec_digest                # canonical governing spec
approval_digest            # canonical human approval
authority_envelope_digest  # identity of the bound AuthorityEnvelopeV2
authority_schema_version   # 2
status
retention_class            # default durable-knowledge
```

Capability profile, source scope, prohibited scope, budget and expiry are members of `authority`, so the WorkItem restates none of them. A WorkItem-level `budget`, `expiry` or path-scope field would be a narrower parallel authority shape and is prohibited (§1.2); read them from the envelope.

ADR-0006 makes the WorkItem the canonical backlog-item contract, so the approval/spec digests and the authority-envelope identity are canonical fields, not derivations: the store (repo markdown or GitHub Issues) is pluggable, and a pluggable store may not be the only place the approval or the governing envelope can be found. `authority_envelope_digest` names the exact bound envelope (§1.2); the envelope's own `approval.evidenceDigest` remains its internal binding and is not a substitute for the WorkItem's `approval_digest`.

Readiness is deterministic. Missing material fields route back to scope.

A validated draft-2020-12 seed for this contract is provided at `schemas/work-item.schema.json` (example `schemas/examples/work-item.example.json`) for WP2/WP4. It is current with this section: it already requires `spec_digest`, `approval_digest`, `authority_envelope_digest`, `authority_schema_version`, the validated `retention_class` enum and the envelope-internal `budget` map, and it already carries the enums for `state`, `risk.tier` (`routine|substantial|crucial|terminal`) and `review.class` plus the `conflict_keys`/`pr_strategy` fields used by `09_WORK_PACKAGES_AND_SEQUENCE.md` PR topology. WP2 adopts the seed and enforces it: a work item that omits any required field is refused, not defaulted.

## 6. Optional work graph

Use only for multi-owner or long-running work.

Each node declares:

```text
id
semantic type
objective
dependencies
owner role
expected artefact
verification oracle
completion condition
maximum attempts
authority                  # contained child AuthorityEnvelopeV2 projection (§2),
                           #   carrying the node's read scope, write scope,
                           #   capability profile, budget and expiry
retention_class            # default operational
```

A node's authority is a contained child of the run's `AuthorityEnvelopeV2` (§1.2), never a fresh grant. As with the WorkItem (§5), the node's read/write scope, profile and budget are members of that child envelope, not separate node fields.

A work graph is persisted, not scratch: it exists precisely because the work is multi-owner, cross-session or recovery-bearing (`02_TARGET_ARCHITECTURE.md §4-5`), so its nodes outlive the provider session and must be class-tagged. The default is `operational` — a node is an intermediate coordination checkpoint. A node whose artefact is itself a receipt, approval or test result is `evidence`; a node carrying secret-bearing content is `sensitive`.

Registered semantic node types should remain small:

- explore;
- decide;
- implement;
- verify;
- review;
- integrate;
- effect;
- observe.

Do not create a node for every prompt or command.

## 7. CapabilityDecision

Produced by the authority compiler. Its input is an `AuthorityEnvelopeV2` and its effective result is a contained child V2 (§1.2), never a separate authority shape:

```text
requested profile
effective profile
requested authority envelope digest
effective authority envelope digest
human authority digest          # V2 approval.evidenceDigest, preserved exactly
task/work-item digest
workspace identity and generation
allowed paths
denied paths
secrets decision                # V2 secrets dimension
deployment decision             # V2 deployment dimension
irreversible-action decision    # V2 irreversibleActions dimension
network policy                  # V2 network dimension (tool egress only)
tool policy
external-effect ceiling
provider capability digest
native settings digest
degradations
expiry
compiler version
retention_class                 # default evidence
```

Effective authority is the monotonic intersection of all constraints. A provider cannot broaden it. The child-narrowing algebra is V2's (`25_AUTHORITY_V2_AND_CONTAINMENT.md §1`): keep the approval binding; narrow path, action, host, secret, target and action-ID sets; add rather than remove denials; narrow disclosure; shorten expiry; reduce every budget unit.

## 8. Loop policy

Embed in the run or applicable node:

```text
success condition
progress signal
maximum iterations
maximum repair cycles
maximum wall time
maximum cost or tokens
no-progress window
repeated-error threshold
allowed loop transitions
escalation state
checkpoint requirement
```

Defaults should be conservative and risk-adjusted.

The loop policy is the one structure here that is never persisted on its own: it is embedded in the run (§2) or the node (§6) and inherits that container's `retention_class` (§1.3). Its cost, turn and wall-time ceilings are read from the container's authority budget, which the loop may not exceed.

## 9. ReviewPlan

Generated by policy from risk and evidence:

```text
required deterministic checks
fresh-context review required?
other-primary required?
specialist required?
human acceptance required?
review input boundary
repair ceiling
re-review requirement
retention_class             # default evidence
```

The chair may request additional review. It cannot remove required review.

## 10. DecisionDelegation

Proposal (see `21_DECISION_DELEGATION.md`). An orthogonal axis to `04_PROGRESSIVE_GOVERNANCE.md`: *who* resolves a decision and *how*, not how much process it carries. One charter is approved during scoping and digest-bound to the run. Schema: `schemas/decision-delegation.schema.json`.

```text
charter_digest
decision_table              # class -> default authority (chair|council|human)
resolvers                   # human-operator | delegated-chair | delegated-council | system-supersession
collaboration               # issue_create/update/close, repositories,
                            #   allowed_labels, max_open_per_run
                            #   merge: human-only | agent-when-green | forbidden
hard_boundaries             # non-delegable classes
risk_ceiling
scope_delta_policy          # Class A / B / C rules
override_and_cut_point_rules
expiry
revocation
retention_class             # default evidence
```

Delegation only narrows. It cannot override platform/system policy or a preserved human ceiling. A delegated resolution is never recorded as a human-gate resolution.

## 11. DecisionRequest

Proposal (see `21_DECISION_DELEGATION.md §6`). A non-blocking decision surface distinct from a blocking gate — the form a chair-delegated Class B delta uses to surface in the Console/CLI without stopping work. Schema: `schemas/decision-request.schema.json`.

```text
decision_id
mode                        # notice | soft | hard
class
scope                       # issue + tasks
question
options
recommendation
default_action
default_applied_at
override_until
cut_point
evidence_refs
council_record
related_prs
status                      # open | default-applied | human-overrode |
                            #   chair-resolved | council-resolved | superseded | closed
retention_class             # default evidence
```

Semantics: `notice` expects no response; `soft` is non-blocking and may apply its default at the cut-point; `hard` is represented and enforced by a scoped gate.

## 12. EffectProposal

```text
effect_id
operation
exact target
payload digest
expected revision or precondition
idempotency key
minimum credential class
required gates
expiry
reversibility and rollback
lookup/reconciliation method
retention_class                 # default evidence
```

The executor accepts registered operations only.

## 13. Runtime receipt

The canonical receipt is the delivery kernel's `delivery-run` record (§1.1), validated by `skills/deliver/scripts/validate_delivery.py`. Fabric emits a transport projection of it and stores no competing receipt.

The receipt records:

- actual provider, model and effort;
- session and native agent lineage;
- effective authority;
- workspace and lease;
- material actions;
- artefact digests;
- checks;
- review identity and findings;
- repair cycles;
- budget use;
- degradations;
- effect proposals and results;
- final status;
- `retention_class` (default `evidence`).

Effective authority is recorded as the requested and effective `AuthorityEnvelopeV2` digests plus the compiler version, not as a restated authority object.

Agents should not reconstruct this record from memory.

## 14. Contract economy

Before adding a field, ask:

1. Does it enforce authority, recovery, verification or external-effect safety?
2. Is it required for cross-session or cross-provider continuity?
3. Is it necessary for human decision-making?
4. Can it be derived reliably?

Derived and presentation-only fields should remain projections rather than canonical state.

The authority, approval-digest and `retention_class` fields required by §1.2 and §1.3 answer questions 1–3 by construction. They are not optional and are not candidates for derivation.
