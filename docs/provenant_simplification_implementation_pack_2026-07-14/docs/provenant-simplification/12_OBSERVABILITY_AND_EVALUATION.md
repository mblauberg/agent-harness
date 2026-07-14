# Observability and evaluation

## 1. Objective

Measure whether the harness improves accepted outcomes per human attention-hour.

Do not optimise only for:

- number of agents;
- autonomous duration;
- token volume;
- subjective speed;
- number of reviews;
- architectural sophistication.

## 2. Canonical evidence versus telemetry

Canonical receipt:

- authority;
- ownership;
- lifecycle;
- artefacts;
- checks;
- review;
- effects;
- approvals;
- final status.

Operational telemetry:

- detailed provider events;
- token and latency data;
- tool traces;
- transient logs;
- UI interaction.

Telemetry may expire. Canonical evidence follows project and risk retention.

## 3. Core metrics

### Outcome quality

- accepted task success;
- escaped defect;
- regression;
- spec non-conformance;
- security violation;
- rollback or incident.

### Human attention

- clarification rounds;
- approval decisions;
- review minutes;
- intervention count;
- time to identify blocker;
- time to understand final evidence.

### Execution

- wall time;
- model cost;
- turns and tokens;
- retries;
- repair cycles;
- provider failures;
- environment/setup failures.

### Review

- useful findings;
- duplicate findings;
- false blockers;
- findings repaired;
- marginal value by reviewer type.

### Recovery

- successful resume;
- lost work;
- duplicate effect;
- ambiguity resolution time;
- stale-state detection.

### Maintainability

- largest application module;
- dependency cycles;
- public API size;
- files changed per operation;
- test setup breadth;
- duplicated lifecycle rules;
- permanent-context size.

## 4. Private evaluation set

Build from real Provenant and representative project work:

- small local bug;
- cross-module feature;
- refactor with characterisation;
- ambiguous requirement needing scope;
- dependency/environment failure;
- security-sensitive change;
- stateful migration;
- documentation and architecture update;
- parallel independent WorkItems;
- external PR effect;
- crash and resume;
- adversarial prompt/tool content.

Keep held-out cases that implementation agents do not see.

## 5. Evaluation arms

### Baseline A

Strong current chair model plus repository instructions, one workspace, ordinary tools and tests.

### Baseline B

Baseline A plus minimal Provenant authority and evidence kernel.

### Arm C

B plus conditional independent review.

### Arm D

C plus bounded read-only workers.

### Arm E

C plus parallel independent WorkItems.

Do not compare the full system only against an artificially weak prompt.

## 6. Ablation

For each major mechanism, compare with and without:

- work graph;
- other-primary review;
- specialist review;
- extra worker fan-out;
- session rotation;
- elaborate receipt fields;
- Console intervention;
- dynamic routing.

Delete or demote mechanisms that do not justify their cost.

## 7. Routing calibration

Store outcome records keyed by task class and capability role, not merely model identity.

Routing may later use:

- observed quality;
- cost;
- latency;
- availability;
- context/tool capability;
- privacy/locality;
- recent degradation;
- reviewer independence.

Initial routing remains policy-driven and human-auditable.

## 8. Trace interoperability

Where useful, export OpenTelemetry-compatible spans for:

- runs;
- provider sessions;
- model calls;
- tool calls;
- checks;
- reviews;
- effects.

The Provenant receipt remains canonical for authority and acceptance.

## 9. Reporting

A completed substantial run should show:

```text
outcome
effective authority
artefacts and diff
checks
review required and why
review findings
repair cycles
cost and wall time
degradations
remaining human decision
effect status
```

Raw event streams remain available but are not the default human handoff.

## 10. Improvement policy

Retrospective output is proposal-first:

- observed problem;
- hypothesis;
- minimal change;
- evaluation case;
- expected benefit;
- rollback;
- deletion/replacement impact.

No automatic harness mutation.
