# Skill portfolio redesign

## 1. Portfolio strategy

The portfolio is already broad enough. The design problem is not a shortage of skills; it is the division of responsibility between:

- always-loaded constitution;
- executable lifecycle policy;
- occasional technique skills;
- domain rules;
- deterministic scripts/hooks;
- provider-native features;
- project-specific specialisation.

The recommended direction is to reduce repeated lifecycle prose, retain deep method skills and add only one clearly distinct top-level capability: `architecture-review`.

## 2. Container test

Place a rule in the smallest stable owner:

| Requirement | Correct owner |
|---|---|
| Applies to every run and defines authority | constitution/policy |
| Determines state transition or required evidence | lifecycle engine |
| Is an occasional reasoning method | skill |
| Is deterministic and machine-checkable | script/hook |
| Applies only to one provider | provider adapter/config |
| Applies only to one directory/project | nested instruction/rule |
| Is independently released and versioned | plugin/package |
| Is a one-off idea | notes inbox with expiry |

## 3. Recommended portfolio

### Retain as core

- `session`
- `scope`
- `deliver`
- `implement`
- `tdd`
- `refactor`
- `diagnose`
- `code-review`
- `evaluate`
- `release`
- `retrospect`
- `work-map`
- `orchestrate`
- `autonomous-lab`

### Add

- `architecture-review` — read-only analysis of architecture, boundaries, locality, deletion and candidate redesigns.

### Implement as runtime artefacts, not top-level skills

- request intake;
- execution plan;
- backlog controller;
- authority profile selection;
- retention;
- hook compilation;
- route scoring.

### Prefer recipes/overlays over new skills

- incident response;
- dependency update;
- migration;
- performance optimisation;
- security hardening;
- accessibility review;
- data/privacy review.

A recipe selects existing skills, lifecycle policy and evidence profiles. It does not compete in global trigger discovery.

## 4. Cross-skill changes

### 4.1 Remove duplicated constitution

Each delivery skill should state:

1. trigger and exclusion;
2. method;
3. artefacts;
4. skill-specific gates;
5. return contract.

It should reference lifecycle state and authority through a common helper or policy version. It should not restate universal review, human approval, repair-loop, release and memory rules.

### 4.2 Structured exceptions

Use one `ExceptionRecord`:

```yaml
kind: emergency-containment | generated-output | exploratory-spike |
      declarative-change | legacy-no-test-seam | external-outage
scope:
reason:
compensating_evidence: []
owner:
expires_at:
follow_up:
```

Skills may allow different kinds, but the record and lifecycle treatment remain uniform.

### 4.3 Structured skill metadata

Move machine-routing fields into the manifest:

```yaml
id: diagnose
triggers: [bug, failure, regression, incident]
excludes: [approved permanent implementation]
authority: read-only-by-default
artefacts: [diagnosis, reproduction, evidence-map]
lifecycle_routes: [diagnose]
companion_skills: [implement, tdd]
```

Keep a concise natural-language `description` for provider discovery.

## 5. Skill-by-skill recommendations

### `scope`

**Retain:** specification, acceptance criteria, one-way-door identification, approval.
**Change:**

- replace mandatory one-question rounds with decision packets;
- add an option-space table and explicit recommendation;
- permit parallel research while decisions are pending;
- produce a scope digest used by approval/backlog;
- include session-rotation advice;
- include initial agent topology options for wide work.

**Do not:** let scope create implementation branches or claim permanent changes.

### `deliver`

**Retain:** neutral delivery envelope and evidence receipt.
**Change:**

- make it a thin entry to the executable lifecycle;
- generate profile requirements from policy;
- separate outcome, trajectory and effect evidence;
- represent unavailable checks explicitly;
- require actual implementation binding for security checks.

### `implement`

**Retain:** approved change delivery, deterministic checks, review and bounded repair.
**Change:**

- consume an execution plan;
- permit dynamic topology within authority;
- select team pattern by dependency graph;
- support fresh-session implementation;
- use staged external effects;
- make review requirements risk-derived;
- record compatibility decisions.

### `tdd`

**Retain:** red/green/refactor and behavioural contract.
**Change:**

- use the shared exception record;
- distinguish contract, characterisation, property, migration and evaluation tests;
- prevent generated low-value tests written only to satisfy a rule;
- require mutation/negative evidence selectively for critical policy.

### `refactor`

**Retain:** behaviour-preserving structural improvement.
**Change:**

- default direct cutover for pre-release/no-consumer systems;
- add deletion, locality and interface tests;
- include before/after architecture diagrams for broad changes;
- use compatibility only with a waiver record;
- route broad architecture uncertainty to `architecture-review` then `scope`;
- permit deep internal redesign when behaviour/contract evidence is strong.

### `diagnose`

**Retain:** evidence-backed cause and no unapproved permanent edit.
**Change:**

- add emergency containment and irreproducible incident states;
- distinguish cause confidence;
- permit instrumentation-only changes under authority;
- output falsified hypotheses as durable evidence;
- create an approved implementation scope only after diagnosis.

### `code-review`

**Retain:** multi-lens review beyond the diff and evidence rather than votes.
**Change:**

- add `investigate`;
- separate certification from advisory review;
- select lenses from risk/change type;
- detect compatibility debt and deletion opportunities;
- measure reviewer yield/overlap;
- include architecture locality and effect-boundary review.

### `evaluate`

**Retain:** frozen plan, lineage, blinded grading and held-out cases.
**Change:**

- add evaluator calibration;
- add negative/counterfactual controls;
- allow sequential stopping when confidence is adequate;
- record cost/latency alongside quality;
- distinguish benchmark gain from production utility;
- evaluate team topology and harness changes, not only model output.

### `release`

**Retain:** separate effect authority, rollback and observation.
**Change:**

- execute through typed effect proposals;
- bind release evidence to exact commit/artefact;
- add provenance/SBOM/signing where distributed;
- model can prepare but not self-authorise;
- release status is independent from implementation acceptance.

### `retrospect`

**Retain:** root-cause clusters, regression promotion and proposal-first learning.
**Change:**

- consume route/topology/cost/review metrics;
- require a falsifiable predicted benefit for harness changes;
- distinguish local project learning from global skill promotion;
- prune superseded operational detail after promotion.

### `session`

**Retain:** continuity, hand-off and context hygiene.
**Change:**

- replace archive-everything with retention classes;
- trigger rotation by phase/context health;
- keep provider resume references as supporting continuity;
- make canonical hand-off machine-readable;
- delete harness-owned ephemeral state after verified close.

### `work-map`

**Retain:** curated orientation for long efforts.
**Change:**

- state explicitly that it is not live queue truth;
- derive status links from Fabric/backlog;
- show current spec/ADR/runbook owners;
- expire stale entries automatically.

### `orchestrate`

**Retain:** bounded scopes, non-overlapping writes, cross-family synthesis.
**Change:**

- use a decomposition/value test before fan-out;
- show preliminary topology;
- support team leaders and hierarchical groups only when the graph warrants them;
- permit dynamic reconfiguration within authority;
- make expected-return schemas explicit;
- cap concurrency from machine and provider facts.

### `autonomous-lab`

**Retain:** resumability, anti-placebo evaluation, bounded state.
**Change:**

- add automatic terminal/pause states;
- integrate approved backlog claims;
- enforce queue/run budgets;
- use staged self-improvement;
- avoid infinite re-enumeration;
- allow human steering at any time without requiring it for routine continuation.

## 6. `architecture-review` boundary

### Trigger

Use for:

- architectural debt;
- unclear module boundaries;
- broad refactor candidates;
- dependency cycles;
- high change amplification;
- deletion/locality problems;
- competing target architectures;
- a request to “improve architecture” before implementation approval.

### Exclusion

Do not use for:

- a small known refactor;
- ordinary diff review;
- implementation already approved;
- style-only cleanup;
- a debugging task.

### Output

- architecture map;
- domain vocabulary;
- pressure points;
- 2–4 candidates;
- before/after diagrams;
- deletion and interface tests;
- trade-offs;
- recommendation;
- scope/ADR proposal;
- no permanent code edits.

### Relationship to `refactor`

```text
architecture-review -> human selects/approves -> scope/ADR -> implement/refactor
```

`refactor` remains behaviour-preserving implementation. `architecture-review` is exploratory design.

## 7. Trigger evaluation

For every skill:

- positive cases;
- negative nearest-neighbour cases;
- boundary/ambiguous cases;
- direct-vs-scope cases;
- multi-skill composition cases;
- provider-specific discovery;
- held-out repeated trials.

Metrics:

- routing precision/recall;
- unnecessary skill loads;
- token/context cost;
- task success;
- policy violations;
- false blocking;
- time to approved scope;
- reviewer yield.

## 8. Deletion and consolidation candidates

Do not merge skills solely to reduce count. Merge only where trigger, authority, artefact and gate are indistinguishable.

Likely consolidation opportunities should be evaluated, not assumed:

- writing skills can share a common reference package while retaining distinct domain triggers;
- diagram skills may share render/verification scripts;
- web-stack skills should remain project/local unless their global use is demonstrated;
- `$caveman` should not be a universal global style requirement and may be better as an explicit presentation preference.

The manifest should report skill use and trigger confusion so retirement is evidence-based.
