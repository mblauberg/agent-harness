# Document governance

Status: proposal extracted from the 2026-07-13 re-review, not yet ratified. It operationalises accepted ADR 0004 (per-domain truth owners, no god manifest) and seeds `08_REPOSITORY_CHANGE_MAP.md` and the WP6 docs work.

## 1. Design principle

Use **one current owner per claim**, not one file for the whole project. ADR 0004 already decided that skills, protocol, adapters and policies have different natural owners and change cadences. The missing mechanism is a deterministic router telling an agent: which artefact type owns a fact; whether to create, update, supersede or delete; which other artefacts may only link to it; and when temporary state stops being live documentation.

This is the recommended default for Provenant-initialised projects. Existing project conventions take precedence where they already name clear canonical owners.

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
  issues/                           only when no external tracker is available
    <stable-id>-<slug>.md
  runbooks/<operation>.md
  research/<dated-or-versioned-study>.md
  threat-models/<system-or-boundary>.md
  archive/                          only retained evidence with an explicit reason

.provenant/ or .agent-run/
  handoffs/                         run/session continuity, not durable product docs
  notes/                            expiring inbox, not canonical
  evidence/
```

Provenant repository migration: keep `docs/adr/0001`–`0008` until the active programme closes (renaming now adds conflict without changing semantics); migrate `docs/specs/01-*`…`05-*` to unnumbered spec families; replace `docs/efforts/` with GitHub Issues/milestones; move active hand-off state into run-owned state and issue/PR links; freeze the original review pack as evidence then remove it from the fresh reading path; keep one compact governance/decision-delegation document.

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

## 4. Frontmatter and canonical keys

Every canonical document carries machine-readable frontmatter. Schema: `schemas/document-frontmatter.schema.json`, example `schemas/examples/document-frontmatter.example.json`.

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

`canonical_keys` are stable semantic claims, not headings. The drift check rejects two current documents owning the same key — this is the mechanism ADR 0004 left unspecified.

## 5. Specs, ADRs and naming

A spec owns current durable behaviour, constraints, interfaces and acceptance. It is not a work log, amendment diary, review transcript, backlog, ADR or runtime status.

Naming uses unnumbered stable-slug paths; the version lives in frontmatter or Git tags, not the filename:

```text
docs/specs/agent-fabric/authority.md
docs/specs/agent-fabric/provider-actions.md
docs/specs/agent-fabric/lifecycle.md
docs/specs/agent-fabric/persistence.md
docs/specs/console/operator-workflows.md
```

Hard limits (a breach fails CI, not merely advised): <=1,000 lines per module; <=100 KiB; one primary subject/owner; no amendment history beyond a short "current change" note. Split on ownership and independent change cadence; each requirement ID has exactly one owning module, and the family `index.md` owns scope/non-goals, module map, shared vocabulary, cross-module invariants and requirement-ID namespaces.

When behaviour changes: update the current spec module directly; record a material irreversible choice in an ADR; update affected issue acceptance; let Git preserve the old text; never append a full version narrative to the top.

## 6. Precedence: ADR owns decision, spec owns behaviour, Git owns history

Create an ADR when the decision selects among materially different architectures, establishes a one-way door, changes ownership/protocol/persistence/security posture, or would otherwise be relitigated. An ADR contains context, decision, alternatives, consequences, applicability scope and supersession status.

An ADR does **not** own current normative details — the corresponding spec owns those. Git owns historical source evolution. A spec must not re-litigate its own decisions in place of a separate ADR (the re-review's UR-016 flagged exactly this in `docs/specs/01-agent-fabric.md`). Routine reversible local choices stay in the issue/PR, not an ADR.

## 7. Work store

Each project selects exactly one canonical work store — `github-issues` (repository named) or `docs-issues` (path named). Never maintain both as mutable mirrors; a migration tool may export/import losslessly, but only one side is current. Provenant uses GitHub Issues as canonical work truth. An issue does not grant implementation authority.

## 8. Create / update / prune

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

Pruning default: Git history is the archive. Delete a superseded working document only after durable decisions/requirements are promoted, current links are repaired, evidence retention is satisfied, and no live run/issue points to it. Unknown or user-owned files are never deleted automatically.

## 9. check-docs

Add `scripts/check-docs`, run from `scripts/check-harness` (see `08_REPOSITORY_CHANGE_MAP.md §9`). Checks:

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

## 10. Reading strategy for agents

At request start, read in order and no further: project instructions; project governance/delegation policy; the related issue; only the linked spec modules and ADRs; the relevant runbook; live Fabric status. Never read the entire docs tree or all historical review packs by default.

## 11. Completion test

The model succeeds when an agent can answer each of these in one or two links, not a chain of overlapping briefings: Where does the current requirement live? Why was the decision made? What slice is being implemented? Who may change it? Which status is live? What can be deleted? What requires a human?

## 12. Templates and cross-references

Authoring templates wired to this frontmatter model live in `templates/` — `adr.md`, `governance.md`, `local-issue.md`, `spec.md`. A short-form restatement suitable for a project root is captured by the re-review's `PROJECT-DOCUMENTATION-POLICY.md`.

- `08_REPOSITORY_CHANGE_MAP.md` — `docs/specs/` and `docs/adr/` migration targets and `check-harness`.
- `21_DECISION_DELEGATION.md` — the governance charter document this policy stores and checks.
- `23_SKILL_DELTAS.md` — `engineering-docs`/`session`/`work-map`/`code-review` changes that enact this model.
