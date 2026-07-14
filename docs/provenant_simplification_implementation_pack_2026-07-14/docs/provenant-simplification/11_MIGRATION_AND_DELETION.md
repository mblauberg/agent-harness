# Migration and deletion

## 1. Migration posture

Prefer direct pre-release cutover over indefinite dual paths.

Preserve:

- user-owned project state;
- accepted decisions;
- canonical evidence and approvals;
- live effect ambiguity records;
- required migration provenance.

Do not preserve:

- unused internal schemas;
- duplicate transition tables;
- dead adapters;
- stale generated artefacts;
- old model identities;
- superseded workflow prose;
- compatibility for hypothetical consumers.

## 2. Lifecycle migration

1. Characterise accepted current transitions.
2. Introduce the canonical transition kernel.
3. Make runtime actions consult it.
4. Make validators consume or compare against it.
5. Generate or validate documentation.
6. delete duplicated tables and prose-level pseudo-enforcement.

## 3. Receipt migration

Do not create a parallel canonical receipt.

Options, in order:

1. add compatible optional substructures to the current receipt;
2. direct version cutover with explicit migration;
3. reset local pre-release run state where human-approved and safe.

Any retained reader for an old version needs:

- named stored data;
- removal milestone;
- fixture;
- conversion or rejection rule.

## 4. Fabric extraction

For each vertical slice:

1. add characterisation and fault tests;
2. define use-case-shaped interface;
3. extract store/policy/handler;
4. delegate from the compatibility facade;
5. migrate callers;
6. prove receipt and event equivalence;
7. delete the old code path;
8. add architecture-boundary test.

Do not merely move methods into new files while retaining the same coupling.

## 5. Skill simplification

For each Skill:

- identify lifecycle, technique, domain and presentation content;
- retain only its unique method and trigger;
- move deterministic rules into scripts/kernel;
- move shared procedure into one reference owner;
- demote non-distinct Skills;
- update routing fixtures;
- delete retired names and references.

## 6. Specification simplification

For each specification:

- produce current normative text;
- record important choices in ADRs;
- move revision history to a ledger or changelog;
- archive materially useful superseded versions;
- update conformance matrix;
- delete amendment sections from the active normative document.

## 7. Provider adapters

Read-only becomes a named profile, not a special hard-coded adapter architecture.

Migration:

1. snapshot current native settings;
2. introduce capability compiler interface;
3. route current behaviour through `review-readonly`;
4. prove exact compatibility;
5. add offline write profile for one provider;
6. prove containment;
7. repeat for second provider;
8. delete hard-coded single-posture helpers.

## 8. Configuration

Split current compatibility configuration into:

- portable tracked policy;
- local ignored attestation;
- activation overlay.

Add migration tooling or doctor output. Do not silently discard local security evidence.

## 9. Console

Move direct Fabric implementation dependencies behind protocol/projection interfaces where necessary.

Retain Console features only when they improve:

- operator comprehension;
- attention handling;
- recovery;
- effect confirmation.

Do not make Console a lifecycle owner.

## 10. Deletion register

Maintain a table:

| Surface | Reason retained | Owner | Delete when | Proving test | Status |
|---|---|---|---|---|---|

No temporary path is complete until deletion is scheduled.

## 11. Rollback

Each work package defines:

- database/schema rollback or reset policy;
- code rollback point;
- provider profile disable switch;
- effect executor disable switch;
- retained evidence;
- incompatibility consequences.

Rollback must not silently restore broader authority.
