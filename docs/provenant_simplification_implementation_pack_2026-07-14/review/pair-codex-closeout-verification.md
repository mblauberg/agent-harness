# Pair-Codex close-out verification

Final verification basis: clean `main@d5b3fd804552e8a92dc5b5ce795b0ad22a0dd06f`.
The six repair verdicts below are deliberately judged against `428d231`, as
requested; later commits are called out where they completed or changed the
current result. The deletion sweep covers the requested roots at final `HEAD`
and necessarily excludes this report, which did not exist when the sweep ran.

## 1. The six H2b repairs

### Finding 1 — SATISFIED

The missing V2 budget dimension landed inside the authority envelope. The
WorkItem schema now requires `authority.budget`
(`schemas/work-item.schema.json:61-86,217-239`), no longer permits a sibling
WorkItem budget, and the example follows that shape
(`schemas/examples/work-item.example.json:46-99`). The contract prose says the
same thing and prohibits an envelope-external budget
(`03_MINIMAL_CONTRACTS.md:90-109,158-191`). This closes the precise H2b gap.

### Finding 4 — STILL-PARTIAL

The repair added every surface named in H2b, including Specs 01/04,
`provider-review.ts`, generated schemas, runtime completion, SQLite constraints,
the four-slot config, `validate_delivery.py`, and the Spec 05 selector/catalogue
(`08_REPOSITORY_CHANGE_MAP.md:194-248`). It still does not enumerate every live
normative/enforcement owner as required. At least these binding restatements are
missing from the migration list:

- `docs/ARCHITECTURE.md:20-24,96-99,239-245,292-295` — substantial+ requires
  native plus other-primary, and the validator rejects acceptance without both;
- `docs/specs/02-adaptive-agent-harness.md:271-275` — the normative Spec 02 rule;
- `skills/deliver/SKILL.md:40-42` — “Substantial+ requires a fresh native
  reviewer and the other primary family” in the lifecycle owner itself;
- `skills/orchestrate/SKILL.md:27-28` — other-primary remains load-bearing at
  substantial+; and
- `skills/autonomous-lab/SKILL.md:58-60` plus
  `skills/autonomous-lab/scripts/bootstrap-lab.sh:1169` — hard-gate/generated
  lab instructions still bind the other primary.

`08_REPOSITORY_CHANGE_MAP.md:250` concedes that its list is “not a guarantee of
completeness” and defers another sweep to migration authoring. That safeguard is
useful, but it does not satisfy the accepted finding that the atomic migration
itself enumerate every enforcement surface. The remaining gap is not cosmetic:
these omitted current-policy owners would continue instructing the old gate if
the listed surfaces alone were migrated.

### Finding 5 — STILL-PARTIAL at `428d231`; closed later at current `HEAD`

Commit `428d231` added retention classes to the run envelope and durable work
graph (`03_MINIMAL_CONTRACTS.md:102,209-217`) and used the five hyphenated machine
identifiers consistently in schemas/examples. It did not contain the ADR-0007
amendment it claimed existed, and its `03_MINIMAL_CONTRACTS.md:29` said the
“fifth” prose name differed even though the differing class is fourth. Thus the
repair was not self-contained at `428d231`.

Later commit `eb2fbc9` added the explicit prose-to-machine mapping to ADR-0007
and corrected “fifth” to “fourth”; current `HEAD` therefore closes the original
finding. Section 4 records a separate literal-occurrence defect in WP2.

### Finding 6 — SATISFIED

The first extraction is now only the pure `#admitProviderPayload` authority
compiler, with its exact callers, ordering, and supporting pure helpers
enumerated (`08_REPOSITORY_CHANGE_MAP.md:294-305`). Coordinator concurrency,
ownership, reconciliation, and merged-dispatch residuals are explicitly a later
provider-action tranche (`:306-325`). The original slice conflation is gone.

### Finding 7 — SATISFIED

WP4 now emits every ReviewPlan field and applies the binding present policy,
including other-primary at substantial+ and the Spec 05 four-slot profile
(`09_WORK_PACKAGES_AND_SEQUENCE.md:260-287`). WP5 extends the derivation with
calibration/risk signals and introduces no required field outside the atomic
migration (`:289-294,316-336`). The contract and sequence now agree.

### Finding 10 — SATISFIED

The adoption table now has status, owner, gate, digest-bound evidence, residual,
and disposition columns for every row
(`18_IMPLEMENTATION_STATUS_TEMPLATE.md:49-62`). Lane B is `complete`, cites the
merged ancestor `90a10f7`, has no outstanding merge residual, and tracks
current-head reverification separately (`:52,64-67,75-80`). Lane A remains
explicitly pending D-021 (`:51`). This closes the H2b contradictions.

## 2. Deletion fallout

Both deleted directories are absent at final `HEAD`. The pre-report sweep found
40 matching lines: four BROKEN and 36 benign. No match occurred under `skills/`,
`scripts/`, `config/`, `runtime/`, `HARNESS.md`, `AGENTS.md`, `README.md`, or
`tests/`; there is no surviving import, glob, runtime dependency, or test fixture
to either deleted directory.

### BROKEN — every hit

1. `docs/handoffs/HANDOFF-2026-07-14-agent-harness-comprehensive-review.md:47`
   says the deleted re-review directory “remain[s] outside this branch's work”.
   This handoff is still `Status: active` and is the canonical handoff linked by
   `docs/lab/HANDOFF.md`; the statement is false on current main.
2. `docs/handoffs/HANDOFF-2026-07-14-agent-harness-comprehensive-review.md:94`
   directs the active programme to adjudicate and implement the deleted re-review
   directory. There is no source left at that path.
3. `docs/handoffs/HANDOFF-2026-07-14-agent-harness-comprehensive-review.md:112`
   runs `node docs/agent-harness-comprehensive-review/lab/tools/gen-dashboard.mjs
   --check`; the live tool moved to `docs/lab/tools/gen-dashboard.mjs`, so the
   command fails by path.
4. `docs/lab/STATE.md:44` repeats the instruction to read and execute the deleted
   re-review directory as a future programme. The relocation note at `:4-13`
   itself says those documents were committed to history and deleted, so the live
   state is internally contradictory.

### Benign — every remaining hit

- `docs/handoffs/HANDOFF-2026-07-14-simplification-pack-consolidation.md:39` —
  relocation provenance from the deleted directory to `docs/lab/`.
- `docs/handoffs/HANDOFF-2026-07-14-simplification-pack-consolidation.md:132` —
  historical/satisfied issue #19 condition requiring the old branch copy to be
  dropped before merge.
- `docs/handoffs/HANDOFF-2026-07-14-agent-harness-comprehensive-review.md:5` —
  effort identifier, not a path dependency.
- `docs/lab/HANDOFF.md:5` — the same effort identifier.
- `docs/lab/HANDOFF.md:16` — a valid link to the surviving handoff file at
  `docs/handoffs/HANDOFF-2026-07-14-agent-harness-comprehensive-review.md`.
- `docs/lab/STATE.md:5` — explicit relocation provenance.
- `docs/lab/STATE.md:45` — the matching token is in the valid surviving handoff
  filename, not a reference to the deleted directory.
- `docs/lab/.orchestrator/runs.md:233,315` — immutable historical run comments.
- `review/pair-codex-assignment.md:24,25` — historical assignment recording the
  completed deletion objective.
- `review/pair-codex-findings.md:116,219,237,239,244,246,247` — immutable
  round-one evidence citations.
- `review/native-mine-re-review.md:1,6,14,26,232,272` — historical extraction
  scope/provenance.
- `review/native-mine-comprehensive.md:1,7,8,24,36,113` — historical extraction
  audit/provenance.
- `docs/provenant-simplification/10_ACCEPTANCE_TESTS.md:267` — explicitly says
  the criteria were folded from the now-superseded source; the criteria follow
  in the current file.
- `docs/provenant-simplification/15_DECISION_REGISTER.md:132` — explicitly
  labelled superseded-source crosswalk provenance.
- `docs/provenant-simplification/24_AUTONOMOUS_CHARTER.md:4,16` — extracted
  provenance and quoted former scope; the preserved charter is local.
- `docs/provenant-simplification/25_AUTHORITY_V2_AND_CONTAINMENT.md:4` —
  extracted-before-deletion provenance; the package is self-contained.
- `docs/provenant-simplification/26_IMPLEMENTATION_SEEDS.md:4` — selective
  extraction provenance; the current advisory seeds follow locally.

### `scripts/check-harness`

PASS at final tree. The command exited `0`. Material output was:

```text
PASS: 33 skills; descriptions=6863 chars; catalogue=7409/8000 chars (7409 bytes, within target); frontmatter, fixtures, links and sidecars clean
SKILL DOCTRINE CHECK: PASS (23 doctrine, 21 reference, 9 topology, 490 words; routing evidence is external)
PASS: validate-inputs
PASS: probe
PASS: validate-routing
PASS: checked 40 skill JavaScript files
PASS: public tree clean
{
  "schema_version": 1,
  "status": "pass",
  "findings": []
}
PASS: 20/20 held-out attempts matched across 16 cases (100%)
PASS: README.md catalogue and headline count match 33 skills in 7 areas
README.md through all gated root docs and 33 skill front doors: no findings
608 passed in 58.77s
CHECK_HARNESS_EXIT=0
```

The harness gate does not scan links in these historical/live handoff documents,
so its green result does not refute the four broken references above.

## 3. New ADR audit

### ADR 0009 — claims verified, requested worktree unavailable

The requested `.worktrees/net-current-consolidation` path does not exist and is
not in `git worktree list`; that oracle is unavailable. The current ADR no longer
names it. Instead `docs/adr/0009-spec-families-unnumbered-durable-modules.md:9-21`
identifies the attempted split as `comprehensive-review@d773cf0`. Reading that
immutable commit object (without reading or modifying another worktree) verifies:

- current Specs 01/04 are 9,731 and 8,456 lines (18,187 total);
- the attempted split uses numbered modules, including
  `10-project-session-protocol-core.md`;
- it contains 3/12/1 `continued-N` files under Specs 01/04/05 (16 total);
- the 01+04 module bodies total exactly 23,827 lines;
- `scripts/check_spec_families.py` is 2,523 lines;
- manifests declare family versions `0.37` and `1.32`; and
- `docs/specs/amendment-audit-2026-07-13.md:238-240` still says Specs 01/04 are
  not frozen.

No current ADR-0009 factual claim is false. The only unverifiable part is the
prompt's superseded worktree location, not the ADR's current commit citation.

### ADR 0010 — FALSE live-schema and runtime-wiring claims

Two load-bearing claims do not match current main:

1. `docs/adr/0010-lifecycle-receipt-authority-distinct-trust-boundary.md:10-15,38-43`
   says `lifecycle_authority_receipts` and `lifecycle_admitted_run_scopes` exist
   in `runtime/agent-fabric/migrations/0001-current-baseline.sql`, with an
   `authority_id` FK and exactly one authority per `(project_session_id, run_id)`.
   Neither table name occurs in that migration. Its cited `:1153-1155` is a
   custody-delivery FK; `:1873-1879` is `operator_git_grant_paths`; and `:1924`,
   `:2147`, and `:2171` are unrelated columns. The FK/uniqueness claim is
   therefore false for the live schema.
2. `ADR-0010:32-37` says `FabricRuntimeOpenOptions` exposes
   `lifecycleReceiptAuthority?: LifecycleIntegrityReceiptAuthorityPort` at
   `fabric.ts:232`. The actual options at
   `runtime/agent-fabric/src/core/fabric.ts:192-206` contain no such member;
   `:232` is `StoredAuthority.expiresAt`. The interface exists at
   `runtime/agent-fabric/src/lifecycle/types.ts:435-440` and is optional only as
   `LifecycleDomainPorts.integrityReceipts` at `:310-317`, not as the claimed
   runtime-open port.

The other two requested checks pass:

- no live `.ts` or `.tsx` file contains `AuthorityEnvelopeV2`; and
- `docs/lab/DECISION_QUEUE.md:41` has W008 with dependency `W005`.

Thus the trust-boundary decision may be sound as a target, but ADR-0010 presents
prospective/unmerged schema and wiring as current implementation fact.

### ADR 0007 — correct mapping-only amendment

`docs/adr/0007-retention-classes-then-governed-deletion.md:20-37` only records
the prose-to-machine mapping. The original five classes and decision at `:11-18`
are unchanged. The amendment states exactly five machine identifiers and changes
only the fourth spelling; no new class or deletion-policy decision was added.

## 4. Pack consistency

- **Manifest digests — PASS.** All 46 entries in
  `20_PACK_MANIFEST.md` match the current file bytes; zero mismatches. This
  assignment's newly created report is not added to the manifest because the
  authority envelope permits writing only this file.
- **06 pointer — PASS.** `06_LOOP_AND_REVIEW_POLICY.md:132-139` points to
  `08_REPOSITORY_CHANGE_MAP.md §4`; §4 exists at `08:180` and its atomic
  review-policy migration starts at `08:198`.
- **Retention literal — FAIL.** Schemas and examples use only the five machine
  identifiers, but `09_WORK_PACKAGES_AND_SEQUENCE.md:159` still contains the
  spaced prose spelling. It is explanatory rather than a persisted value, but
  the chair's literal close-out rule allowed occurrences only in 03 §1.3 and the
  H2b review artifact. The permitted occurrences are
  `03_MINIMAL_CONTRACTS.md:36,39` and
  `review/pair-codex-h2b-verification.md:79,86,177,195`; `09:159` is the sole
  extra pack occurrence.

## Verification receipt

- Requested route resolved exactly to `gpt-5.6-sol`, effective effort `low`,
  `status=ok`, no substitution, capability source `runtime-model-catalog`.
- Three bounded native subagent slices ran read-only. Native collaboration does
  not expose an independent per-agent effective-model receipt, so no stronger
  model attestation is claimed.
- The chair re-ran every retained oracle against final clean
  `main@d5b3fd804552e8a92dc5b5ce795b0ad22a0dd06f` after the concurrent merge and
  follow-on documentation commits settled.
- No pack source, Git state, or `.worktrees/` path was modified. The named review
  artifact is the only file written by pair-codex.

STATUS: complete
