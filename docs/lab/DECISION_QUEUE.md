# DECISION QUEUE — navigable status INDEX
<!--
  NOT authoritative for verdicts (the LOG is). This points at where-to-look:
  status + dependency tiers. Reorg-rewritten. Use ONLY the controlled STATUS
  vocabulary below — never invent ad-hoc statuses inline.
-->

## Locked constraints (echoed from GOAL — every enumerate/judge pass must see these)

D-021 chair charter; KICKOFF ordering; one branch and one PR; no merge or origin/main push; worktrees only under owning-repo .worktrees; preserve dirty root; no release deploy publish production credential registry mutation standing egress or external-effect profile; workspace-write-offline stays inert until the exact Step-3 gate; never access list or enumerate .agent-run/AFAB-004; durable truth lives in repo docs and exact per-lane receipts.

## STATUS vocabulary (controlled, extensible)

- `DECIDED`               — final; has a LOG row + adr/<id>.md.
- `DECIDED-PROVISIONAL`   — decided but in a Normative authority and schema one-way doors; security and containment controls; provider-action and lifecycle custody; write-profile containment verdict; irreversible migration or compatibility decisions; Spec-05 80x24 usability adjudication; programme acceptance. Each needs objective mutation-sensitive evidence plus fresh native review and Claude Opus cross-family review; bonus-family attempt where the charter requires it. area: needs a judge
                            panel pass + cross-family pass before promotion/live.
- `FORKED`                — split into parallel one-way-door paths (see forks/).
- `FOLDED` / `MERGED`     — subsumed into another item.
- `*-GATED`               — awaiting an expert / sign-off authority.
- `HUMAN-TIE-BREAK`       — awaiting a human decision.
- `SPIKE`                 — needs a build spike to resolve.
- `DEFERRED`              — intentionally postponed (with a why).
- `BUILD-ARTEFACT`        — a buildable deliverable, not a decision.
- `VERIFIED`              — bounded diagnosis/evidence is complete and independently reproduced; repair may remain downstream.
- `UNRESOLVED`            — surfaced, not yet triaged.

## Tiers (dependency-ordered; tier-0 = foundational one-way-doors)

### Tier 0 — foundational one-way-doors
<!-- gate everything downstream; decide first -->

| Item | Status | Depends on | Scope / next evidence |
|---|---|---|---|
| W001 | VERIFIED | D-023, D-024 | Structural Lane A family split, tracked fixtures and mutation-sensitive checker completed at `b618c78`. |
| W002 | VERIFIED | W001 | Native + Opus repair-2 reviews are CLEAN; CAPA-001 receipt and exact frozen/candidate gates validate. |
| W003 | VERIFIED | W002 | Structural Lane A foundation integrated as `1a3ceb4` + `b618c78`; exact-equivalent lane ref/worktree pruned. |
| W004 | VERIFIED | Lane A semantic freeze, Lane B | Five ordered causes; evidence in `context/lane-d-diagnosis-2026-07-14.md`. |
| W005 | BUILD-ARTEFACT | W003, W004, W017, D-029, D-031 | D-031 is committed as `209e95f`; D-029 exact-pair GREEN is dual-primary CLEAN and committed as `12247d8`. The synchronous boundary tracer now has the intended sole missing-preflight cause. Next: canonical coordinator plus all production/fixture writer migration, then the serial lifecycle direct cut and full Fabric green. |
| W006 | VERIFIED | Lane B | Linux Clippy and macOS ambient-FD/unbounded-accept causes; evidence in `context/rust-ci-diagnosis-2026-07-14.md`. |
| W007 | BUILD-ARTEFACT | W003, W006 | Dual-primary CLEAN repair is integrated as `50065a1` + `5166328`; D-035 keeps it honestly verifying and closes hosted Linux/macOS, Linux mutation, security and receipt acceptance on the single W014 PR SHA because the workflow has no manual trigger. |
| W008 | BUILD-ARTEFACT | W005 | AuthorityEnvelopeV2 direct cutover preserving provider goldens and zero adapter-production diff. |
| W009 | BUILD-ARTEFACT | W008 | Extract pure `AuthorityCompiler` admission with behaviour unchanged. |
| W010 | SPIKE | W009 | Execute the fixed Step-3 containment matrix and council-adjudicate the exact provider tuple; write profile stays inert unless it passes. |
| W011 | BUILD-ARTEFACT | W010 | Admit second provider through the same gate, then provider-action structural extraction. |

### Tier 1+

| Item | Status | Depends on | Scope / next evidence |
|---|---|---|---|
| W012 | UNRESOLVED | W005-W011 | Reconcile roadmap tranches 2-9 and every still-open substantiated finding against live source, including D-036 annotated-tag metadata/message scanning and the test-only duplicate raw-commit parser; enumerate bounded implementation waves. |
| W013 | UNRESOLVED | W012 | Programme-wide deterministic, security, evaluation, load, live MCP, four-family and 80x24 usability gates. |
| W014 | PROMOTION-GATED | W013 | Push only `comprehensive-review`, open the one evidence-index PR; human review/merge is the final gate. |
| W015 | VERIFIED | W004 | Canonical pair-keyed preflight/coordinator and first-red contract is implementation-ready in `context/lane-d-preflight-tdd-contract.md` and handed to W005. |
| W016 | VERIFIED | W006 | Cross-platform Rust first-red and repair contract is implementation-ready in `context/rust-ci-tdd-contract.md`; source remains blocked on W003. |
| W017 | VERIFIED | W003, D-024 | Dual-primary CLEAN exact candidate locally integrated as `d8f4389` + `b59d784`; integrated W017 gates pass and Lane C/D is unblocked. |
| W018 | VERIFIED | D-026, D-028, D-030, D-032 | Exact commits `0bb25d5` + `054ae1a` are locally integrated. Final source/test `dab3dd4f...`/`c57899b8...`, stage `8c16cf34...`, contained Opus CLEAN `2004d2bf...`, M6/M8 mutation kills, 140 combined tests, publication/static-security/diff gates and private-receipt hashes are GREEN. |

## COUNT SUMMARY
<!--
  Reconcile EVERY item to exactly one disposition; assert "0 unresolved loose
  ends", VERIFIED by ID-set diff against the LOG (not by eyeballing).
-->

- decided: 0 · verified: 9 · forked: 0 · folded: 0 · gated: 1 · spike: 1 · deferred: 0 · spawned-open: 7
- total items: 18
- unresolved loose ends: 2 (W012-W013 intentionally await dependency completion; all 18 queue items have an explicit disposition; build units are not ADR/log decisions)
