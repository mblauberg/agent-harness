# W017 net-current specification consolidation: TDD contract

Date: 2026-07-14
Work item: W017, after W003/D-024 structural integration
Audience: the W017 implementer and independent reviewers

## Decision

Keep two independent, hash-bound products for Specs 01, 04 and 05:

1. **archive** reconstructs the exact frozen source bytes at
   `0305376624fdb03e14166a2a831e0053fca367c9`; and
2. **binding current** is the default authority, preserves every still-effective
   requirement and omits only history or prose proved superseded slice by slice.

The structural Lane A candidate is navigation evidence, not current authority.
W017 replaces it directly; it does not retain a third compatibility loader.

Minimum risk tier: `crucial`. This leg changes the default normative authority
presented to later Lane C/D implementers. It permits no runtime, provider,
network, release, deployment, credential or external-effect change.

## Grounded correction to F-023

The original “about 72% of Spec 01 and 93% of Spec 04 is amendment history”
measurement is not a safe deletion boundary. The structural split showed:

| Family | Non-history modules loaded | Frozen lines | Non-history byte share |
|---|---:|---:|---:|
| Spec 01 | 11,377 | 11,514 | 98.36% |
| Spec 04 | 11,928 | 12,024 | 98.90% |
| Spec 05 | 1,455 | 1,534 | 93.81% |

The percentages are byte shares; the preceding columns are line counts. Much
of Spec 01 §32 and Spec 04 §9 is cumulative current authority despite its
amendment-era origin. No whole §32/§9 subsection may leave binding current
because of its heading, date, version ancestry or the old percentage. Exact
frozen reconstruction and cumulative current content are separate invariants.

The W003 precondition shall leave D-024 honest: it accepts reversible family
packaging and archive traceability only; F-023 remains partial until this work
passes. Record the exact integrated W003 head before the first RED. Any drift
from the grounded family design requires a fresh diagnosis, not an inferred
schema edit.

W017 re-anchored the physical-module line references against integrated W003
head `b618c789608934e33c0b695cd19bf1bd774354d5` and W017 base
`dfa608f3e75db495ef034f63f963410bd2460e9b` before the first RED. Repair cycle
2 moved each inter-module separator LF to the start of the following module;
every affected byte-identical range therefore moved down one physical line.
An exact-byte search found one and only one match for every residual and
authority anchor. Frozen source ranges and SHA-256 digests did not change.

## Frozen anchors and residual ledger

Digest domain below is the exact UTF-8 byte sequence of the inclusive lines,
with existing LF terminators. Each frozen slice and its current physical-module
slice are byte-identical before W017.

| ID | Frozen source range | Current module range | Slice SHA-256 | Required treatment | Superseding authority |
|---|---|---|---|---|---|
| F023-01 | `01-agent-fabric.md:3784-3786` | `01-agent-fabric/10-project-session-protocol-core.md:118-120` | `sha256:1eae300de6061ec99668d21469067a6adb8374d2664f8e8769e9f1eb743f6e46` | Remove legacy-import/additive-migration mandate; preserve the preceding current recovery-custody sentence. | A01 |
| F023-02 | `01-agent-fabric.md:5829-5833` | `01-agent-fabric/13-operator-artifacts-notifications-budget.md:282-286` | `sha256:9997d38d3e37dae26942090c0d6ac1ed39e2df36f017780acdfcf379c2d00440` | Rewrite AC-038 as exact-current, version-neutral acceptance; preserve its feature negotiation, validation, revision and UI obligations. The source sentence continues through module line 287, so the edit/map boundary must expand to that sentence boundary. | A01 |
| F023-03 | `04-agent-fabric-operational-hardening.md:974-978` | `04-agent-fabric-operational-hardening/03-console-daemon-foundations.md:626-630` | `sha256:deb8c9f8091dec146640b80ba2977cbdc6ab09ca20743a9d1483e3cf42bbadae` | Preserve direct-operation retirement and typed-intent authority; remove the compatibility-decoder path. | A04 |
| F023-04 | `04-agent-fabric-operational-hardening.md:997-1002` | `04-agent-fabric-operational-hardening/04-typed-git-custody-schema.md:9-14` | `sha256:9f29e0218e903eccd92cb5afaa17e6f951168ed356f2c331070c84903ca6c6e8` | Restate as current-baseline Git-grant/custody relations, with no next-migration ordinal. Review the connected paragraph at module lines 4-7 for the same chronology term. | A04 |
| F023-05 | `04-agent-fabric-operational-hardening.md:2063-2072` | `04-agent-fabric-operational-hardening/06-console-effect-and-budget-custody.md:103-112` | `sha256:b0035e4261dbbd9ec004b93a1b19b9c197851813d54ba35c13eb7cccdf97c915` | Preserve every artifacts-registry column, uniqueness, CHECK and projection obligation; remove Migration 0010 chronology. | A04 |
| F023-06 | `04-agent-fabric-operational-hardening.md:2423-2436` | `04-agent-fabric-operational-hardening/06-console-effect-and-budget-custody.md:463-476` | `sha256:d5d5942ccb8e3abdc1da235cbdee6bca2ca73a96856e5c16207fc3a9359eb3e2` | Split the mixed paragraph. Remove legacy import, forward repair and old-client mandates; preserve recovery custody, system-supersession, typed cause, exact feature admission and zero-mutation rejection. | A04 |
| F023-07 | `04-agent-fabric-operational-hardening.md:2459-2478` | `04-agent-fabric-operational-hardening/06-console-effect-and-budget-custody.md:499-518` | `sha256:617c396239d6812d3320141f86152eb3c3c6b645afb7cd0de25e73c3dc80c2ba` | Split and restate current singleton indexes, membership truth and bridge-retirement proof; remove Migration 0013, upgrade and backfill chronology. Preserve the connected current paragraph through module line 521. | A04 |
| F023-08 | `05-project-fabric-console.md:1334-1366` | `05-project-fabric-console/03-integrations-lifecycle-and-acceptance.md:505-537` | `sha256:5e8a4d45c5ccd08253c7eb5b7aec908f53f637381704154d395a4c3e83f2d6a9` | Replace the duplicate version ledger and stale pending-freeze statement with one current implementation gate. Inventory every obligation before removal; move any unique effective obligation into binding current. The source sentence continues through module line 538. | A05, A05-current, D-021 and D-023 |

Superseding authority anchors:

| Ref | Frozen/current range | SHA-256 | Effect |
|---|---|---|---|
| A01 | Spec 01 frozen `119-130`; module `01-version-history.md:108-119` | `sha256:b52205727505d22e48c0411872427ea51340a9a8ab7c4a999d63ed4acff8c4fd` | One pre-release baseline; no import/emulation, incremental migration, vintage peer, retired decoder or compatibility retry. |
| A04 | Spec 04 frozen `99-109`; module `01-version-history.md:86-96` | `sha256:b8aa90be1e1e9d14f4bf98f49973dcdab3285710e59de975bdbf8fc4ea88a04e` | One current baseline/protocol/private wire; earlier clauses survive only where current; legacy migration/import/decoder/retry is superseded. |
| A05 | Spec 05 frozen `80-88`; module `01-version-history.md:64-72` | `sha256:88389b8dda6a315825707f4036ceff59e97d293cb2d78b0fb26f26d35434d3e9` | One current Console/schema epoch; old-daemon retry, vintage wire and implicit import are not requirements. |
| A05-current | Spec 05 header module `00-authority-and-status-header.md:3-16` and v1.14 preamble `01-version-history.md:2-7` | `sha256:396bae2f69cf577a723f4ee06b20a3e8861301b283794e7c9a7f41f46b138b0e`; `sha256:31e565f40fdb9ef3cb240e69517f30d2c09641f7c7f81a7448890a0f4f9876b8` | Current status, authority boundary and v1.14 profile/containment effect. |

These eight entries are the repair-cycle-1 first-red set. D-027 records the
exhaustive two-reader expansion below. No further candidate may be added in
W017: this is repair cycle 2/2, and there is no third discovery cycle.

## D-027 second/final Rule-5 expansion

The native exhaustive audit and the Opus full-set adjudication independently
accepted all fourteen bounded Rule-5 candidates. Each positive amendment,
migration, forward-repair or version-chronology mandate therefore has explicit
archive, map and current-only ownership. R5-03 folds into the pre-existing
F023-04 owner; the other thirteen candidates receive durable F023 IDs:

| Rule-5 candidate | Durable owner | Family | Frozen range | Frozen-range SHA-256 |
|---|---|---|---|---|
| R5-01 | F023-09 | Spec 01 | `3803-3807` | `sha256:a5b7b0c64b76d0abee3e8d30f93142f4facb8d9bcde3496349b4bd227dabb41e` |
| R5-02 | F023-10 | Spec 04 | `350-356` | `sha256:4eaed778c528e24330667179c71895fca75e72cbe5ec8c95237fc38d3950b163` |
| R5-03 | F023-04 (folded) | Spec 04 | `990-995` | `sha256:b0b333ffde75afc2b79579ec4b54ea6d78f817e24ab9935433beed4339c7b7f2` |
| R5-04 | F023-11 | Spec 04 | `1096-1102` | `sha256:877fb24e856803dc7a9afd65bc8a6eaba65604ade6804176bbf171491afc5ecb` |
| R5-05 | F023-12 | Spec 04 | `1394-1401` | `sha256:a889edcfb076ca80b658e9de99959327f3d73cb9ff7e7db382967d89b1e97889` |
| R5-06 | F023-13 | Spec 04 | `1835-1848` | `sha256:1fcb2b023e810997846d90c79ca9d28ad306da031aeee6491a18078dd77e97ff` |
| R5-07 | F023-14 | Spec 04 | `1850-1858` | `sha256:39f2b6f2abd47c012315145797ecb54d9c85801b5d859e0928be15cf2f0c8d2e` |
| R5-08 | F023-15 | Spec 04 | `1860-1866` | `sha256:0be24405ce90781b2a7e6c89d6275a5395ef2b96026869324666720097d29bf3` |
| R5-09 | F023-16 | Spec 04 | `2089-2093` | `sha256:81652e0774d3728ca7318f6873df02021a4f24139cd97755d635aec042d67984` |
| R5-10 | F023-17 | Spec 04 | `2095-2100` | `sha256:168651ca70d5a0a6b32b749679fbfc94fde72f4702d8ba77cb34411de81a1975` |
| R5-11 | F023-18 | Spec 04 | `2108-2115` | `sha256:3467a8e983fa33a389365581d59fb274edd7e84f3f4b02cadddd05869e719461` |
| R5-12 | F023-19 | Spec 04 | `2252-2261` | `sha256:56eac237f8938b9b36500fb9c726f6cd0f879ce2a3f189c833aed83968a15f3d` |
| R5-13 | F023-20 | Spec 04 | `11100-11127` | `sha256:191902e774b0b82ce9891518d5ad811ef1ea15e0b469dd87087225a9ac9b9233` |
| R5-14 | F023-21 | Spec 05 | `105-120` | `sha256:7fc7e8b52a37b5e744d8b2d268e5f0d99ed2c32eab64058d24dce28337f7f38a` |

The tracked crosswalk uses the exact field `frozenRangeSha256`; the checker
rehashes every named range from the reconstructed frozen archive. F023-04 now
maps the complete `990-1008` slice so the R5-03 preamble and the original Git
custody chronology have one non-overlapping owner.

R5-01's current-only replacement restores the leading `A` consumed by the
line-bounded frozen range before the adjacent live close sentence. Its exact
current-stream boundary is `mutation. A\ncancelled or failed project close`;
there is no standalone `A` line. The focused oracle binds those bytes, while
archive reconstruction retains the original `3803-3807` bytes unchanged.

The obligation matrix covers every second-cycle owner plus the original mixed
owners. F023-13 and F023-15 are a symmetric lockstep pair; F023-18 binds the
all-or-nothing baseline-construction invariant; F023-20 preserves every
answer-bearing route field and the exact non-null/nullable split; F023-21 binds
the complete Specs 01-05 owner split. Exact current-slice digests and
representative mutation oracles make every matrix owner removal-sensitive.

The systemic fixture is not an exact-marker allowlist. It normalises Markdown
code spans, Unicode punctuation and separators, and ordinary paired `**`, `*`,
`_` and `__` emphasis around actor terms only at non-identifier token
boundaries. Actor substrings inside snake-case names, including
`route_migration_rows` and `pre__migration__route`, remain byte-preserved and
detectable as named relations. It then classifies clause-local positive
amendment/migration/upgrade/backfill actors, additive persistence, schema-shape
gains, forward-repair and version chronology. A negative arm cannot suppress
an independently-subjected positive `and` arm in the same prose unit. The
splitter requires a new actor and positive action predicate: it does not split
a compound predicate or turn `No compatibility backfill and a forward migration
exist` positive. Every positive fixture names its durable D-027 map owner and
expected pattern; every declared detector arm has a dedicated fixture whose
`expectedPattern` names that arm. Every negative fixture is structurally one of
the seven reviewed exclusions: negative prohibition, fresh baseline, taxonomy,
current optional/pinned compatibility, non-migration additive/forward use,
operational revision or governance/current-version provenance. The family gate
applies this classifier to every binding-current module, including every
shared-current module, and removal/empty-detector mutations fail against the
tracked fixture. Parameterised mutations remove each declared detector arm;
separate mutations remove each paired-emphasis form, the identifier-boundary
guard and independent-positive-`and` split, or restore blanket negation. No
classifier leg or normalisation guard may be deletion-insensitive.

## Target package and loader contract

After W003 schema v2 is integrated, migrate each family atomically to manifest
schema v3. A family cannot validate partly under either schema.

The v3 manifest shall expose exactly:

- `bindingCurrentContentSha256` and `archiveContentSha256`;
- ordered, duplicate-free `sequences.bindingCurrent` and `sequences.archive`;
- one closed module inventory with roles `shared-current`, `current-only` or
  `archive-only`;
- the existing frozen commit/path/line-count/SHA anchors and reversible link/
  fence transformation receipt;
- `supersessionMapPath` and `supersessionMapSha256`; and
- module-set and transformation-receipt digests that commit to both sequences,
  all roles, both content digests and the supersession-map digest.

Unchanged modules may be shared by both sequences. Split an affected module at
a safe section or paragraph boundary so only the original affected slice and
its current replacement need separate modules. Both variants remain bounded to
1,000 lines and independently valid Markdown. Spec 04 fence split points remain
complete top-level SQL statement boundaries.

`sequences.archive` must reconstruct these exact anchors after inverse receipt
normalisation:

- Spec 01: 11,514 lines,
  `sha256:7a2156feb6c7f3f15bd96c9583f51b22a42688fd298d4db42db4396573df60d0`;
- Spec 04: 12,024 lines,
  `sha256:69354c6dc226d81e1b719a2006a54045942e17fbefc8e11ba381721c0880af17`;
- Spec 05: 1,534 lines,
  `sha256:8bef2451fa6b3ac3c2f7ba4a1485c41b88e84e14b8ffd3454e5036c0377e8c32`.

The verified binding-current stream contains exactly 83 modules and 24,812
physical lines: Spec 01 has 29 modules/11,398 lines, Spec 04 has 46/11,936 and
Spec 05 has 8/1,478. The gate binds both the per-family and aggregate counts.

`sequences.bindingCurrent` shall contain every shared current slice plus the
proved replacements. Revision chronology is archive-only. Live baseline and
supersession rules now embedded in version preambles shall move to a dedicated
binding-current authority module and be map-bound; they must not disappear with
history.

Public API cutover:

- `load_family_bytes/text` returns verified binding current;
- `load_family_archive_bytes/text` returns the exact frozen archive;
- `FamilyResult` exposes `binding_current`, `archive` and the current
  requirement inventory; and
- the v2 topical-candidate loader/result/manifest keys are removed after all
  repository callers migrate. No compatibility alias survives.

Root indexes are generated from the manifest. They label binding current as the
default authority, archive as traceability only, explain receipt-normalised
hashes rather than raw physical concatenation, and link every module in both
sequences.

## Hash-bound supersession map

One canonical JSON file per family, stored beside its manifest, uses closed
keys and this shape:

```json
{
  "schemaVersion": 1,
  "familyId": "spec-04-agent-fabric-operational-hardening",
  "frozenSourceSha256": "sha256:...",
  "bindingCurrentContentSha256": "sha256:...",
  "entries": [
    {
      "id": "F023-06",
      "disposition": "replace",
      "frozen": {
        "path": "docs/specs/04-agent-fabric-operational-hardening.md",
        "startLine": 2423,
        "endLine": 2436,
        "sha256": "sha256:..."
      },
      "current": {
        "role": "replacement",
        "modulePath": "docs/specs/04-agent-fabric-operational-hardening/NN-name.md",
        "startLine": 1,
        "endLine": 12,
        "sha256": "sha256:..."
      },
      "authorityRefs": [
        {
          "ref": "A04",
          "path": "docs/specs/04-agent-fabric-operational-hardening/NN-authority.md",
          "startLine": 1,
          "endLine": 11,
          "sha256": "sha256:..."
        }
      ],
      "rationale": "Remove superseded migration chronology; retain current state and admission obligations."
    }
  ]
}
```

Entries are ordered by frozen start, have unique IDs, cannot overlap, and use
canonical JSON UTF-8 for their outer digest. `replace` requires
`current.role = replacement`. `drop` is permitted only for pure chronology; its
`current.role = superseding-authority` points to the current module/digest that
makes the old slice non-effective. Every entry needs at least one exact
authority reference and a rationale that names both removed and preserved
semantics. Decision references additionally bind the exact decision-row digest
in the W017 evidence receipt.

## Mixed-clause and equivalence rules

1. Split only at a complete sentence/paragraph/section boundary. If an audit
   range starts or ends mid-sentence, expand the mapped frozen range and record
   the original audit anchor in `rationale`.
2. Preserve stable FR/NFR/AC IDs. A version label may become version-neutral;
   its observable predicate, error, boundary and acceptance oracle may not
   weaken.
3. Convert migration-time wording to the equivalent current-state invariant.
   The rewrite must retain columns, keys, state transitions, crash behaviour,
   feature admission and negative fixtures described inside the same paragraph.
4. Before replacing a duplicate chronology ledger, enumerate its atomic
   obligations and point each to an unchanged current slice or the replacement.
   An obligation with no other owner must move into binding current.
5. Binding current contains no mandate to implement an incremental/additive/
   forward migration, legacy import, vintage peer, compatibility decoder/retry,
   upgrade/backfill path or version chronology. Exact current optional-feature
   negotiation and pinned adapter checks remain security controls.
6. Byte-identical shared modules are the default. No prose outside a mapped
   slice may change except generated index text and boundary-only heading/fence
   scaffolding committed by the transformation receipt.
7. Keep family versions 0.37, 1.32 and 1.14 only if the obligation matrix and
   independent review prove exact net-effective restatement. Any new, removed
   or weakened effective obligation stops the leg for council adjudication and
   a version bump. “Cleanup” is not proof.

## Red-green sequence

Run one vertical cycle at a time and retain command, exit code and focused
output in the W017 receipt.

### R1: default authority versus frozen archive

Add
`test_default_loader_is_net_current_while_archive_reconstructs_frozen_source`.
It shall require all three archive anchors above, require the default loader to
exclude the original eight residuals plus the complete D-027 Rule-5 set, and require
representative unchanged obligations from early/middle/late §32 and §9 to stay
present. The right-reason RED is that W003's default loader deliberately returns
the frozen binding bytes and therefore still contains the residuals. Missing
files, invalid JSON or archive drift is a wrong-reason RED.

Minimum GREEN: introduce one archive-only slice and one binding-current
replacement through the public loaders, manifest and generated index. Do not
batch all prose rewrites before this tracer passes.

### R2: map closure and current coverage

Add `test_every_nonshared_frozen_slice_has_one_verified_supersession_entry`.
For each family, prove:

- every archive-only normative slice is history or covered once by `drop`/
  `replace`;
- every `replace` target is in binding current and every `drop` witness is in
  binding current;
- every other non-history frozen slice is byte-identical in both sequences;
- every live supersession rule removed with version history has a current
  replacement; and
- requirement IDs/definitions and the obligation matrix have no uncovered or
  duplicate current owner.

The right-reason RED is the v2 manifest/candidate model having no independent
binding-current sequence or supersession map.

### R3: original residuals, then the final exhaustive set

Land F023-01 through F023-08 in ledger order. For each entry first add a focused
test that identifies the obsolete predicate and the current predicates that
must remain. Witness the old text fail, make the minimum rewrite, regenerate
digests/index, then run R1/R2 before the next entry. F023-02, F023-06, F023-07
and F023-08 require explicit obligation matrices because they are mixed or
duplicative.

Repair cycle 2 repeats that vertical proof for R5-01 through R5-14 using the
D-027 crosswalk. R5-03 expands F023-04; the other thirteen use F023-09 through
F023-21. Every second-cycle owner has a matrix entry. F023-13/F023-15,
F023-18, F023-20 and F023-21 carry the explicit lockstep, all-or-nothing,
nullability/action and full-owner-split evidence described above.

### R4: forbidden-semantics and tamper closure

The binding-current stream shall reject the concrete legacy forms in the
residual ledger. A broader terminology scan may report candidates, but cannot
classify them without the two-reader evidence rule. Current negative statements
such as “no compatibility path” are not legacy mandates.

Mutation-sensitive tests shall fail when a test helper:

1. changes one frozen archive byte, source range, archive order or frozen hash;
2. deletes/reorders a shared current module or bulk-removes a §32/§9 slice;
3. changes a map source/current/authority digest or decision-row binding;
4. overlaps map ranges, leaves a mapped gap, duplicates an ID or points outside
   its family;
5. changes `replace` to `drop`, drops a unique obligation or points to an
   archive-only witness;
6. restores any concrete obsolete predicate from either closed repair set to
   binding current;
7. removes an extracted live supersession rule;
8. changes an AC/FR/NFR definition or its stable identifier;
9. includes version history in binding current or retains a candidate API key;
10. tampers with link relocation, SQL-fence scaffolding, module role or either
    sequence without recomputing the full receipt chain; or
11. alters the D-024/F-023 closure receipt without breaking its digest.

## Evidence receipt and governance update

Do not rewrite D-024 as though its structural decision had already closed
F-023. Preserve D-024 as the packaging/archive decision and append the next
decision ID for W017 semantic closure. The new row and W017 `RUN.json` record:

- W003 base head and W017 result head;
- all frozen, archive, binding-current, module-set, transformation and map
  digests;
- all 21 entry IDs, the fourteen-row Rule-5 crosswalk and its frozen-range
  digests, the systemic-classifier fixture and the obligation-matrix digest;
- first-right-reason RED outputs and focused/full GREEN commands;
- unchanged family versions or the council-approved bump and rationale;
- exact changed paths and no out-of-scope changes;
- author, fresh native reviewer, Opus other-primary, bonus-family attempt,
  disagreements and bounded repair cycles; and
- F-023 status: closed only if every criterion below passes.

Update the findings register, effort map and amendment audit to cite that
receipt. The audit must cite `tests/spec_fixtures/`, never a transient run
directory. Durable truth remains in tracked project docs; a private receipt is
supporting evidence, not the sole closure record.

## Ownership and scope

W017 owns only:

- the three spec roots, family directories, manifests and generated indexes;
- the supersession-map files;
- `scripts/check_spec_families.py`, `tests/test_spec_families.py`, the existing
  spec fixtures and their collected wrappers;
- exact family-loader consumers and the `scripts/check-harness` gate; and
- D-024/F-023 decision, finding, effort-map, audit and W017 receipt updates.

The D-021 chair owner call permits the existing
`tests/test_provider_skill_boundaries.py` and `scripts/check-harness` consumer/
gate migration. It does not authorise unrelated cleanup. One writer owns all
spec-family source and manifest files. Later Lane C/D source stays blocked until
W017 acceptance; disjoint Rust work may proceed.

No Fabric runtime, protocol, migration, configuration, provider adapter, skill,
CI/release surface or unrelated spec may change. No branch/worktree topology,
push, PR, merge, provider call, network egress or external-effect action is part
of this leg. The charter-prohibited run directory remains uninspected.

## Verification and acceptance

Run from the W017 worktree at one head:

```sh
if [[ -x "${HARNESS_PYTHON:-}" ]]; then
  PYTHON="$HARNESS_PYTHON"
elif [[ -x "$HOME/miniforge3/bin/python" ]]; then
  PYTHON="$HOME/miniforge3/bin/python"
else
  PYTHON="$(command -v python3)"
fi
"$PYTHON" scripts/check_spec_families.py
"$PYTHON" -m pytest -q tests/test_spec_families.py tests/test_provider_skill_boundaries.py
"$PYTHON" -m pytest -q tests/spec_fixtures
"$PYTHON" skills/engineering-writing/scripts/check_engineering_style.py \
  docs/lab/context/net-current-consolidation-tdd-contract.md
scripts/check-harness
git diff --check
```

Also run a path-limited search proving the family/checker/tests have no
transient-run dependency, and retain the exact clean output. Do not broaden that
search into charter-prohibited state.

Acceptance requires all of the following:

- both independent sequences and all receipt/hash/tamper oracles are green;
- archive reconstruction equals all three frozen anchors exactly;
- default loaders expose only binding current;
- all 21 map entries are owned and every mandate in the fourteen-candidate
  D-027 set is absent from binding current;
- all still-effective mixed-clause obligations and cumulative §32/§9 content
  remain binding;
- live supersession rules have a binding-current owner outside history;
- no candidate/compatibility API remains;
- the version decision is proved and recorded;
- focused, fixture and full harness gates are clean; and
- fresh native plus Opus review are CLEAN, with the required bonus-family
  attempt recorded.

Stop before integration if archive bytes drift, one obligation lacks an owner,
equivalence needs a policy choice, any effective semantics change without a
version decision, a reviewer finds an unmapped residual, scope overlaps another
writer, or a prohibited authority/effect is required. At most two bounded
repair cycles are allowed; after that, return the exact unresolved evidence to
the chair for council adjudication.
