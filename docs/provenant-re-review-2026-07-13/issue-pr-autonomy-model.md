# Issue, PR and autonomous decision model

## 1. Intended operator experience

The human should engage deeply at the scoping/grill stage they initiate, approve
one project/run delegation envelope, then supervise by exception.

During implementation the agents should be able to:

- decompose issues;
- form and change teams;
- create follow-up issues;
- update specs and acceptance;
- resolve reversible design questions;
- open and update PRs;
- raise non-blocking decisions;
- continue under an authorised default;
- surface evidence and disagreement in the Console.

They should stop only when the decision exceeds the approved envelope or
crosses a preserved hard boundary.

## 2. Decision delegation charter

Scoping creates or updates one project charter.

Example decision table:

| Decision class | Default authority |
|---|---|
| Implementation detail inside spec | chair |
| Reversible spec clarification inside outcome/authority | chair |
| Material but reversible design fork | authorised LLM council |
| Issue creation/update inside repository | chair |
| PR topology/change inside Git policy | chair |
| Risk increase within approved ceiling | council |
| ADR supersession | council or human, project-selected |
| Outcome/non-goal change | human |
| New repository/data disclosure/secret scope | human |
| Irreversible migration/destructive action | human |
| External release/deploy/publish/send | human unless explicitly named |
| Merge to protected main | project policy, normally human for Provenant |

The charter is approved once and digest-bound to the run/project. Delegation
only narrows; it cannot override platform/system policy or a preserved human
ceiling.

## 3. Scope-delta classes

### Class A — implementation detail

Criteria:

- no observable acceptance change;
- no authority/risk/effect change;
- no ADR decision;
- no new non-goal violation.

Action:

- update issue/plan;
- proceed;
- mention in PR if material to reviewers.

No human or council decision.

### Class B — delegated reversible delta

Criteria:

- changes current spec wording, acceptance detail or internal design;
- remains inside approved outcome, non-goals, authority, budget and risk ceiling;
- reversible without destructive migration or external effect.

Action:

1. chair prepares a delta with options/recommendation;
2. council deliberates when the charter requires it;
3. update spec/ADR/issue atomically;
4. create a non-blocking soft decision in Fabric/Console;
5. proceed under the recorded default;
6. describe the delta and decision evidence in the PR.

The human may steer or override before the declared cut-point. After the
cut-point, an override becomes a rework issue rather than erasing history.

### Class C — hard boundary

Includes:

- changed outcome or non-goal;
- broader repository/path/data/secret/network authority;
- higher risk than the approved ceiling;
- irreversible/destructive migration;
- release/deploy/publish/send;
- unresolved safety/security evidence;
- conflict with platform/system policy.

Action:

- open a hard gate;
- stop only the affected dependency subtree;
- continue independent work when safe;
- request explicit human authority.

## 4. LLM council

The council is a deliberative mechanism, not a majority-vote oracle.

Protocol:

1. freeze question, evidence and decision criteria;
2. obtain independent first passes from decorrelated families/lenses;
3. list agreements, disagreements and falsifiable claims;
4. run objective checks where possible;
5. chair adjudicates against evidence, policy and reversibility;
6. record dissent and residual uncertainty;
7. apply only if the delegation charter permits the class.

Use a council for decisions where marginal perspective justifies cost. Do not
convene one for routine implementation.

## 5. Soft decision protocol

Add a separate `DecisionRequest`, not a blocking `ScopedGate`.

Fields:

```yaml
decision_id: DEC-123
mode: soft                  # notice | soft | hard
class: reversible-spec-delta
scope:
  issue: PROV-321
  tasks: [task-a, task-b]
question: ...
options: [...]
recommendation: ...
default_action: ...
default_applied_at: ...
override_until:
cut_point:
evidence_refs: [...]
council_record: ...
status: open                # open | default-applied | human-overrode |
                            # council-resolved | superseded | closed
related_prs: [...]
```

Semantics:

- `notice`: no response expected;
- `soft`: non-blocking, default may apply;
- `hard`: represented/enforced by a scoped gate.

The Console Attention view should visually distinguish them.

## 6. Autonomous issue creation

GitHub issue mutation is an external collaboration effect, but it can be
standing-authorised independently of release or merge.

Project policy may allow:

```yaml
collaboration:
  issue_create: allowed
  issue_update: allowed
  issue_close: allowed_for_agent_created
  repositories: [mblauberg/provenant]
  allowed_labels: [bug, enhancement, documentation, follow-up, blocked]
  max_open_per_run: 20
```

Agent-created issues must:

- link the discovering run/task/PR;
- state whether they block current acceptance;
- use the vertical-slice schema;
- avoid secrets/private evidence;
- deduplicate against open issues;
- be closed or handed off when the run ends.

Creating an issue does not authorise implementing it.

## 7. Work decomposition

During scoping:

1. update spec/ADR;
2. create an initiative/parent issue only when multiple slices share one outcome;
3. create clean vertical-slice child issues;
4. record dependencies and conflict keys;
5. derive preliminary agent topology;
6. ask the human only for crucial scope/delegation choices.

During implementation:

- a chair may split an issue if acceptance remains preserved;
- merging issues requires preserving traceability;
- newly discovered work outside the slice becomes a follow-up issue;
- current issue status is live work truth;
- Fabric owns active claims/leases/agents.

## 8. PR topology

PR topology is a planning output, not a universal rule.

### Independent PR

Use when:

- issues are independently valuable;
- write scopes do not overlap;
- no shared schema/migration/lock/generated owner;
- each passes its own gates;
- merge order is irrelevant.

### Stacked PR

Use when:

- slice B genuinely depends on A;
- A is reviewable and stable independently;
- base relationships are explicit;
- rebases are automated/owned.

### Consolidated PR

Use when:

- changes share a contract or migration;
- paths conflict materially;
- partial merge would leave the project invalid;
- review is more coherent as one vertical tranche.

### Direct commit / no PR

Use only when project policy permits:

- non-GitHub repository;
- new/small personal project;
- reversible low-risk work;
- objective gates are strong;
- no protected collaboration branch is needed.

The agent records the same evidence in a local delivery receipt or review
bundle. It should not invent a fake PR workflow.

## 9. Conflict graph

Before parallel write dispatch, compute conflict keys:

- exact paths;
- generated outputs;
- package lock/workspace graph;
- database migration/baseline;
- protocol schemas;
- central spec/ADR/index files;
- shared test fixtures;
- release manifests.

If two slices share a conflict key:

- serialise them;
- designate one integration owner;
- stack them; or
- consolidate the PR.

Do not rely only on nominal issue boundaries.

## 10. PR content

A PR should link rather than duplicate:

- issues;
- current spec/ADR;
- scope digest;
- decision deltas;
- evidence receipts;
- review findings.

Add these sections:

```text
Issues closed/advanced
Scope/spec deltas
Soft decisions raised or defaults applied
PR dependency/conflict strategy
Deterministic evidence
Independent/council review
Residual risks/follow-up issues
External effects still excluded
```

The PR remains a review and integration surface, not the source of durable
requirements.

## 11. Human attention policy

Default human touch-points:

1. human-initiated crucial scoping/grill;
2. any Class C hard decision;
3. final PR/merge review where project policy requires it;
4. release/external-effect authority.

Everything else is chair/council work inside the approved charter.

The human can intervene at any time through chat or Console. A response should
steer live work without requiring the agents to have blocked unnecessarily.

## 12. Provenant-specific recommendation

For Provenant itself:

- retain human PR merge as the final repository gate;
- allow chair-created/updated issues under a bounded collaboration grant;
- replace the current “one monolithic PR” charter rule with adaptive topology;
- use GitHub Issues as work truth;
- keep Fabric as live execution truth;
- use issues/milestones instead of effort maps;
- surface soft decisions in Console Attention;
- preserve hard human gates only for new authority, destructive/external effects
  and any decision class not delegated in the project charter.
