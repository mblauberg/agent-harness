# Implementation priorities

## 1. Programme rule

Do not add another broad feature lane until:

- current decision authority is coherent;
- specs are split/frozen;
- active work is issue-backed;
- Lane D and Rust are green.

The work-profile plan remains the strategic destination, but its prerequisite
contracts and baseline must become trustworthy first.

## 2. Proposed issues

### PROV-DOC-1 — Canonical document routing and checks

Outcome:

- permanent documentation policy;
- schemas/frontmatter;
- unnumbered <=1,000-line spec-family rules;
- canonical-key/index checks;
- delete/prune policy;
- changed-doc style gate.

Writes:

- docs policy;
- `engineering-docs`, `session`, `work-map`;
- check scripts/tests.

No runtime authority change.

### PROV-GOV-1 — Decision delegation and scope-delta contract

Outcome:

- project charter schema;
- Class A/B/C deltas;
- delegated chair/council evidence;
- hard-boundary defaults;
- coherent HARNESS/Spec 02/delivery-kernel semantics.

This is a crucial contract change and needs its own ADR/spec work.

### PROV-WORK-1 — Vertical-slice issue schema and GitHub store

Outcome:

- work-item schema;
- issue forms/templates;
- bounded agent issue operations;
- migration/export for docs/issues fallback;
- current initiative issue/milestone.

### PROV-SPEC-1 — Split and repair Spec 01

### PROV-SPEC-2 — Split and repair Spec 04

### PROV-SPEC-3 — Split Spec 05 and reconcile review/autonomy

These may use one spec integration owner. Avoid parallel edits to the same
family/index.

### PROV-RUNTIME-1 — Lane D baseline reconciliation

Owns only runtime/database/protocol semantic failures listed in the current
effort map.

### PROV-RUST-1 — Cross-platform review portal reconciliation

Owns Rust-only Linux/macOS failures and containment evidence.

### PROV-AUTH-1 — AuthorityEnvelopeV2 direct cutover

Starts only after specs and runtime baseline are current.

### PROV-AUTH-2 — Pure AuthorityCompiler extraction

### PROV-AUTH-3 — One-provider containment/write pilot

### PROV-AUTH-4 — Second-provider parity and provider-action extraction

### PROV-CONSOLE-1 — Soft decision projection

Starts after PROV-GOV-1 defines the contract.

## 3. Parallel plan

```text
Wave 0
  DOC-1 ─┐
  GOV-1 ─┼─ coordinated docs/policy owner; avoid central-file races
  WORK-1 ┘

  RUNTIME-1          disjoint runtime lane
  RUST-1             disjoint Rust lane

Wave 1
  SPEC-1/2/3         serial spec-family integration, fed by Lane A audit
  merge/rebase DOC/GOV policy

Wave 2
  current main full green + branch rules
  AUTH-1

Wave 3
  AUTH-2
  CONSOLE-1 contract/projection

Wave 4
  containment spike -> AUTH-3

Wave 5
  AUTH-4
  subsequent Fabric/Console modular extraction
```

## 4. PR topology

Recommended for Provenant:

### PR A — Documentation governance and work-item infrastructure

Can include DOC-1 + WORK-1 if their central-file ownership is serialised.
GOV-1 may be separate because it changes constitutional authority.

### PR B — Delegated autonomy contract

HARNESS, Spec 02, delivery schema/validator, protocol design and skill changes.
Merge before soft-decision runtime work.

### PR C — Spec-family split and repaired normative contracts

Large but documentation-only. It may be one coordinated PR because Specs
01/04/05 have cross-references and a single freeze point.

### PR D — Lane D runtime reconciliation

No broad spec edits. References the frozen contracts.

### PR E — Rust reconciliation

Independent where Cargo/CI paths are disjoint.

### PR F — AuthorityEnvelopeV2

Only after C/D/E are current and green.

This is preferable to one monolithic programme PR. It gives the human coherent
review units while avoiding overlapping implementation PRs.

## 5. Merge/conflict rules

- central generated indexes have one serial owner;
- a spec and its implementing runtime PR are not edited concurrently unless the
  spec PR is frozen and the code PR is stacked on it;
- lockfile/schema/baseline ownership is explicit;
- no two PRs mutate the same migration or protocol shape;
- stacked PRs state their base and rebase owner;
- any PR invalidated by a new spec digest is refreshed before review;
- early PRs may merge only when later work cannot invalidate their contract.

## 6. Current release gates

Before write pilot:

- spec P0/P1 clean;
- all root/Fabric/Console/Herdr/Rust checks green;
- branch/ruleset current;
- portable/local attestation split or explicit containment treatment;
- AuthorityEnvelopeV2;
- exact read-only goldens;
- adversarial containment.

Before stable release:

- write parity both primaries;
- live-provider bounded smoke;
- Console human evaluation;
- current-head required checks;
- no contradictory governance owner;
- issue/backlog/document cleanup;
- retention classification;
- security evidence implementation map;
- release provenance.

## 7. Human interaction plan

The human should be asked now only to ratify:

1. the permanent project documentation model;
2. the project decision-delegation table;
3. the preserved hard boundaries;
4. the final Provenant PR/merge policy.

After ratification, agents can create the issues, update specs, deliberate and
implement without repeated human gates, except Class C and final merge.
