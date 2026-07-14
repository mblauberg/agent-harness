# Documentation governance model

## 1. Design principle

Use **one current owner per claim**, not one file for the whole project.

Provenant's accepted ADR 0004 is correct: skills, protocol, adapters and policies
have different natural owners and change cadences. The missing rule is a
deterministic router that tells an agent:

- which artefact type owns a fact;
- whether to create, update, supersede or delete;
- which other artefacts may only link to it;
- when temporary state stops being live documentation.

The model below is the recommended default for projects initialised by
Provenant. Existing project conventions take precedence when they already have
clear canonical owners.

## 2. Default tree

```text
docs/
  README.md                         generated/validated discovery index
  architecture.md                   current architecture map, no decision history
  adr/
    README.md                       generated/validated decision index
    <stable-slug>.md                one decision and rationale
  specs/
    README.md                       generated/validated spec-family index
    <domain>/
      index.md                      domain scope, owners and module map
      <subject>.md                  current normative contract, <=1,000 lines
  issues/                           only when GitHub/other tracker is unavailable
    <stable-id>-<slug>.md
  runbooks/
    <operation>.md
  research/
    <dated-or-versioned-study>.md
  threat-models/
    <system-or-boundary>.md
  archive/                          only retained evidence with an explicit reason

.provenant/ or .agent-run/
  handoffs/                         run/session continuity, not durable product docs
  notes/                            expiring inbox, not canonical
  evidence/
```

### Provenant repository migration

For this repository:

- keep `docs/adr/0001`–`0008` until the active programme closes; renaming them
  now adds conflict without changing semantics;
- new project defaults may use stable slug filenames with a stable `id` in
  frontmatter;
- migrate `docs/specs/01-*` through `05-*` to unnumbered spec families;
- replace `docs/efforts/` with GitHub Issues/milestones;
- move active hand-off state into run-owned state and issue/PR links;
- freeze the original review pack as evidence, then remove it from the fresh
  agent reading path;
- keep only one compact project governance/decision-delegation document.

## 3. Canonical-owner matrix

| Information | Canonical owner | May link, never restate |
|---|---|---|
| Current architecture structure | `docs/architecture.md` | specs, ADRs, issues |
| Why a material decision was made | one ADR | spec, architecture, issue, PR |
| Current durable behaviour/contract | one spec module | ADR, issue, code docs |
| Implementation outcome/vertical slice | issue tracker | spec, PR, run receipt |
| Live task/agent/lease/decision status | Fabric/Console | issue/project view |
| Implementation evidence | delivery/Fabric receipt and PR checks | issue, spec |
| Operator procedure | runbook | spec, issue |
| Time-bounded external evidence | research record | ADR/spec |
| Session continuation | run-owned handoff | issue, Fabric |
| Untriaged idea | expiring note | none until promoted |
| Release/deployment state | release/effect receipt | issue, PR |
| Historical source evolution | Git history | changelog only when user-facing |

## 4. Document frontmatter

Every canonical document should carry machine-readable frontmatter.

### Common fields

```yaml
---
schema_version: 1
id: spec.agent-fabric.authority
kind: spec
status: current
owner: authority-contract
canonical_keys:
  - authority.envelope
  - authority.delegation
supersedes: []
superseded_by: null
related:
  adrs: [adr.capability-compiled-execution]
  issues: [PROV-123]
reviewed_at: 2026-07-13
---
```

`canonical_keys` are stable semantic claims, not headings. CI rejects two
current documents owning the same key.

## 5. Specifications

### Purpose

A spec owns current durable behaviour, constraints, interfaces and acceptance.
It is not:

- a work log;
- an amendment diary;
- a review transcript;
- a backlog;
- an ADR;
- current runtime status.

### Naming

Use unnumbered stable paths:

```text
docs/specs/agent-fabric/authority.md
docs/specs/agent-fabric/provider-actions.md
docs/specs/agent-fabric/lifecycle.md
docs/specs/agent-fabric/persistence.md
docs/specs/console/operator-workflows.md
```

The version belongs in frontmatter or Git tags, not the filename.

### Size

Hard limits:

- <=1,000 lines per spec module;
- <=100 KiB;
- one primary subject/owner;
- no amendment history longer than a short “current change” note.

A size breach fails CI. It is not merely a suggestion.

### Splitting rule

Split on ownership and independent change cadence, not every arbitrary section.
A spec-family `index.md` owns:

- scope and non-goals;
- module map;
- shared vocabulary;
- cross-module invariants;
- requirement-ID namespaces.

Each requirement ID has exactly one owning module.

### Evolution

When behaviour changes:

1. update the current spec module directly;
2. record a material irreversible choice in an ADR;
3. update affected issue acceptance;
4. let Git preserve the old text;
5. never append another full version narrative to the top.

## 6. ADRs

Create an ADR when the decision:

- selects among materially different architectures;
- establishes a one-way door or difficult reversal;
- changes ownership, protocol, persistence or security posture;
- would otherwise be repeatedly relitigated.

An ADR contains:

- context;
- decision;
- alternatives considered;
- consequences;
- scope of applicability;
- supersession status.

It does not own current normative details. The corresponding spec owns those.

Routine implementation details and reversible local design choices stay in the
issue/PR, not an ADR.

## 7. Work items

### Canonical store selection

Each project chooses exactly one:

```yaml
work_store:
  kind: github-issues
  repository: mblauberg/provenant
```

or:

```yaml
work_store:
  kind: docs-issues
  path: docs/issues
```

Never maintain GitHub Issues and `docs/issues` as mutable mirrors. A migration
tool may export/import losslessly, but only one side is current.

### Vertical-slice rule

A work item should deliver an independently testable outcome across whatever
layers are necessary. It is not a horizontal engineering task such as “write
repository class” unless that task is independently valuable and verifiable.

Every issue has:

- outcome;
- non-goals;
- spec/ADR links;
- acceptance criteria;
- dependencies;
- affected paths and conflict keys;
- risk and authority;
- deterministic evidence;
- review class;
- release/effect needs;
- current PR(s).

### Issue creation during scoping

Scoping produces or updates:

1. the durable spec;
2. any material ADR;
3. one or more vertical-slice issues;
4. the decision-delegation charter when the project does not have one.

After those artefacts are current, the scoping session is complete. It should
not create a large parallel effort map that restates them.

## 8. Runbooks and research

A runbook owns an executable operator procedure and verification. It does not
repeat system requirements.

Research owns dated evidence, uncertainty and source quality. Once a research
conclusion becomes a decision or requirement, promote it into an ADR/spec and
mark the research record supporting, not current policy.

## 9. Handoffs, state and notes

### Handoffs

Create a handoff only when a fresh session or owner transfer is actually
required. It is run-owned, digest-bound and consumed once.

After consumption:

- promote durable facts into specs/ADRs/issues;
- retain the minimum evidence receipt;
- delete the handoff unless audit policy requires retention.

### State

When Fabric is available, live state belongs in Fabric and the Console. A
fallback `docs/STATE.md` is acceptable only for a project without a state
runtime.

### Notes

Notes have:

- owner;
- created date;
- expiry;
- promotion target;
- classification.

Expired unpromoted notes are deleted. They never become an implicit memory
database.

## 10. Create/update/prune decision table

| Observation | Agent action |
|---|---|
| Existing current owner covers it | Update owner |
| Material architecture choice | Create/supersede ADR, then update spec |
| New durable behaviour | Update/create spec module |
| New implementation slice | Create issue |
| Discovered adjacent defect | Create issue if in issue-write authority |
| Operator procedure changed | Update runbook |
| Evidence is only exploratory | Research or expiring note |
| Duplicate current claims | Merge into one owner; delete duplicate |
| Superseded working doc | Repair links, then delete or evidence-archive |
| Live status embedded in policy/spec | Move to issue/Fabric projection |
| Spec exceeds limit | Split by owner before adding more content |

## 11. Deterministic checks

Add `scripts/check-docs` and run it from `scripts/check-harness`.

Checks:

1. schema/frontmatter;
2. no numbered new spec filenames;
3. spec line/byte limits;
4. unique IDs and canonical keys;
5. valid links and requirement references;
6. one current spec owner per requirement;
7. ADR/spec ownership rules;
8. issue links to spec/acceptance/authority;
9. no mutable status sections in policy/ADR/spec;
10. no active handoff without a live issue/run;
11. no consumed handoff in the live reading index;
12. generated indexes are current;
13. superseded documents are not linked as current;
14. changed docs pass style checks;
15. archive entries state the retention reason.

## 12. Reading strategy for agents

At request start:

1. project instructions;
2. project governance/delegation policy;
3. related issue;
4. only the linked spec modules and ADRs;
5. relevant runbook;
6. live Fabric status.

Never read the entire docs tree or all historical review packs by default.

## 13. Completion test

The model is successful when an agent can answer these without ambiguity:

- Where does the current requirement live?
- Why was the decision made?
- What slice is currently being implemented?
- Who may change it?
- Which status is live?
- What can be deleted?
- What requires a human?

Each answer should resolve in one or two links, not a chain of overlapping
briefing documents.
