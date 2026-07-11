# Filesystem-as-Memory: the durable spine of a long-running autonomous run

> The single idea: **context-window = RAM, filesystem = disk.** A multi-week autonomous run will be summarized, compacted, crash, or hit transient API failures many times. Nothing in the conversation survives. So the orchestrator does **no deep work in its own context** — it delegates work, persists every meaningful result to a file, and keeps only a one-line pointer in-head. A fresh session (or a human) must be able to resume from the files alone.

This layer defines the files, their schemas, and the disciplines — append-log heartbeat, record-before-launch, RECONCILE-first, 1:1 traceability, reorg-for-navigability — that make resumption reliable. Read this when you need to know *what to write where, in what shape, and in what order.*

*Implemented by `templates/STATE.template.md`, `templates/HANDOFF.template.md`, `templates/ADR.template.md`, `templates/README.template.md`, the three spine generators in `tools/`, and `scripts/bootstrap-lab.sh` (which scaffolds the file set into a new lab, copies the tools, installs the README, and substitutes the knobs below).*

---

## 0. Config knobs this layer reads

The mechanism is fixed; these are the seams you fill at bootstrap (in `GOAL.md`'s knob block) so the same machinery drives any domain:

- `{{MEMORY_FILES}}` — the on-disk names of the file set below. The **set** is fixed; the **names** are a knob. Defaults: `README.md` (human entry), `GOAL.md`, `STATE.md`, `DECISION_LOG.md`, `DECISION_QUEUE.md`, `DASHBOARD.md` (generated), `.orchestrator/runs.md`, `HANDOFF.md`, `reorg-log.md`.
- `{{REPO_LAYOUT}}` — the flat ADR root + its sidecar dirs. Default: a decided record is **ONE file, `adr/<id>.md`** (e.g. `adr/D003-tenancy-model.md`); cross-family review sidecars live at `adr/_reviews/<id>-<family>.md` (e.g. `adr/_reviews/D003-codex.md`); heavy option matrices / research / specs that don't fit inline go to `adr/_meta/<id>-<name>.md`. (A sibling `adr/<id>.research/` dir is allowed only for genuinely research-heavy items — flat is the **DEFAULT**, the dir is the rare exception.) The **one-file-per-decision (`adr/<id>.md`)** shape is fixed; the dir names and the unit-of-work noun are knobs (a "decision" in a design lab is a "finding" in a literature review, a "task" in a migration — see §4).
- `{{ID_SCHEME}}` — stable sequential per-item IDs + fork IDs. The **scheme** (stable, sequential, never-reused) is fixed; the **prefix letters** are a knob (e.g. `<id>` for items, `<Fxxx>` for forks).
- `STATUS vocabulary` — the controlled, extensible enum the QUEUE uses (§5). Add domain dispositions as knobs; never invent ad-hoc statuses inline.

---

## 1. The file set and their roles (separated by authority + mutability)

| File | Owner | Mutability | Role |
|---|---|---|---|
| `GOAL.md` | **human** | edited by human only | North star (`{{MISSION}}`/`{{DOMAIN}}`) + the `STATUS: RUN/STOP` gate + `{{LOCKED_CONSTRAINTS}}` + steering directives |
| `STATE.md` | orchestrator | **rewritten every iteration** | The heartbeat + the single recover-after-compaction anchor |
| `DECISION_LOG.md` | orchestrator | append-only (newest-first) | **Authoritative** index of decided items, 1 row per item |
| `DECISION_QUEUE.md` | orchestrator | reorg-rewritten | Navigable **status INDEX** (points at where-to-look; *not* authoritative for verdicts) |
| `.orchestrator/runs.md` | orchestrator | hot ledger + in-flight table | Recent history + in-flight + narrative RECONCILE/LAUNCHED notes |
| `.orchestrator/history/` | orchestrator | append-only rotated segments | Closed run-ledger/note history, indexed and outside the hot resume path |
| `adr/<id>.md` | named stage owner from verified evidence | immutable once accepted | The per-decision reasoning artifact (the ADR) — **ONE flat file per decided item** |
| `adr/_reviews/<id>-<family>.md` | delegated cross-family reviewers (persist verbatim) | append (one per reviewer) | Cross-family review sidecars; **SKIPPED** by the `adr/*.md` scanners |
| `adr/_meta/<id>-<name>.md` | delegated agents | as needed | Heavy option matrices / research / specs + the installed `ADR.template.md`; **SKIPPED** by the scanners |
| `HANDOFF.md` | orchestrator | regenerated on material change | Capstone synthesis + terminal pickup |
| `reorg-log.md` | orchestrator | append | One entry per reorganization |
| `README.md` | template → human | regenerated only on layout change | The **single human entry point**: what-this-lab-is + read-path + how-to-run; points at DASHBOARD for live state |
| `DASHBOARD.md` | `tools/gen-dashboard.mjs` | **generated — never hand-edited** | Live status snapshot: lifecycle + decided/fork/queue counts + in-flight + human-gate count |
| `tools/*.mjs` | shipped by skill, copied at bootstrap | stable | The 3 spine generators (see below) |

**The load-bearing invariant: no single file is both the steering input and the authoritative record.** Four distinct jobs, four distinct files:

- **GOAL steers** (human intent + the run/stop gate).
- **STATE remembers** (current truth + how to resume).
- **LOG is truth-of-record** (what was decided, append-only, authoritative for verdicts).
- **QUEUE navigates** (where to look, status, tiers — never authoritative).

If you ever find yourself reading verdicts out of the QUEUE, or recording decisions into STATE, you have collapsed two roles and the audit trail will rot. Keep them separate.

### The human-entry, generated-status, and tooling files

Three members of the set sit on a different axis (human-entry + generated-status + tooling), not the steering-vs-record axis above:

- **`README.md` — the single human entry point.** Installed by bootstrap from `templates/README.template.md` ({{KNOB}}-driven for the domain/mission lines), then human-owned. It **never hardcodes a status snapshot** — it points at `DASHBOARD.md` for live state, and carries the read-path, how-to-verify, run/resume/steer/stop, and nav-map sections.
- **`DASHBOARD.md` — generated status, never hand-edited.** Produced by `tools/gen-dashboard.mjs` (GOAL lifecycle + `adr/*.md` count + `forks/*` + DECISION_QUEUE status summary + `.orchestrator/runs.md` in-flight + a human-gate count). It carries a "GENERATED — do not hand-edit" header and a stable footer, and `--check` is an idempotent staleness gate. **Regenerable / a gitignore candidate.**
- **`tools/` — the 3 shipped spine generators** (copied into the lab at bootstrap):
  - `gen-dashboard.mjs` — writes `DASHBOARD.md` (above).
  - `check-adr-immutability.mjs` — content-hashes each frozen ADR (Status `decided`|`superseded`) under `adr/*.md` into `.decided-adr-manifest.json` (`--baseline` re-freezes); skips `_reviews/`/`_meta/`.
  - `gen-adr-code-index.mjs` — maps each `adr/<id>.md` to its implementing-code refs (parsed from the ADR's Evidence-links) and writes `ADR_CODE_INDEX.md`.
  - `DASHBOARD.md`, `ADR_CODE_INDEX.md`, and `.decided-adr-manifest.json` are the three **generated** (regenerable / gitignore-candidate) outputs.

### The bootstrap memory tree

`scripts/bootstrap-lab.sh` creates exactly: `adr/`  `adr/_reviews/`  `adr/_meta/`  `forks/`  `scaffolds/`  `context/`  `tools/`  `.orchestrator/`  + `workflows/` (created empty; workflows are authored per-run, not part of the memory spine) — plus the flat files above. There is **no `decisions/` dir and no `decisions/templates/`** — a decided record is the flat file `adr/<id>.md`, and the ADR template installs into the lab at `adr/_meta/ADR.template.md`.

---

## 2. GOAL.md — mission + the RUN/STOP gate

Human-owned. The orchestrator reads it at the **start of every iteration** and obeys it. Only a human edit of `STATUS:` to `STOP` halts the run; **an empty queue does not** (see §8). It is the *only* file the orchestrator must never author content into. Contains:

- **Mission** (`{{MISSION}}`): the open-ended objective. The framing is "never declare done — run until STOP."
- **Traversal order**: the default work order (e.g. one-way-doors / foundational items first, then descend dependency tiers), overridable by directives.
- **Definition of "good"**: the acceptance bar for the whole run.
- **Active directives**: a human-editable steering block. Empty = follow traversal order.
- **`{{LOCKED_CONSTRAINTS}}`**: the do-not-relitigate set — design *around* them, never reopen them. Echoed at the top of the QUEUE so every enumerate/judge pass sees them.
- **`{{ESCALATION_GATES}}`-flagged items**: human/expert/judge-gated decisions to design-around, not stall on.
- **The STOP gate**, written exactly like this:
  ```
  STATUS: RUN
  <!-- audit note: who/why/when this last flipped -->
  PREV: <prior value>
  ```
  When the orchestrator (or human) flips it, it writes an inline HTML-comment audit note recording the reason and the terminal condition, plus a `PREV:` line preserving the prior value. **Flipping to STOP requires GOAL + STATE + HANDOFF to all agree on the terminal truth** (see §9 and gotcha §10.8) — a STOP written while the capstone is stale is a finish-blocker.

---

## 3. STATE.md — the heartbeat (the recover anchor)

> Rewritten **in full** every iteration. It is the **one file** from which a fresh session resumes with zero other context. Re-read at the top of every loop, before doing anything else except RECONCILE.

Two-part structure. Both parts matter: the header is *current truth*, the note-log is *audit trail*.

### (a) A newest-first append-log of iteration Notes

Each iteration **prepends** one bullet:
```
- **Note (iterN):** <what completed + verdicts> · <what was launched> · <what's NEXT> · <any course-correction>.
```
Keep only the newest five notes in `STATE.md`. Before removing an older note from
the hot recovery file, preserve it exactly once in the indexed
`.orchestrator/history/` ledger. Hard-won course-corrections survive verbatim,
but they do not grow the file a fresh session must read on every iteration.

### (b) Rewritten-to-current-truth header sections

These are *overwritten* each iteration to reflect reality now (not appended):

- **Run status** — `RUNNING` / current phase / `STOPPED`, plus a **RESUME PROTOCOL** line: literally what the next wake should do (e.g. *"dispatch a cheap probe; if OK, re-dispatch the N voided tasks listed in In-flight; salvaged partials already on disk = KEEP, do not re-run"*).
- **In flight** — a mirror of the run-ledger's in-flight table (§5). This is what lets the next iteration re-attach background results.
- **Built inventory** — the artifacts produced *up to* `{{BUILD_CEILING}}`.
- **Owed-lists** — work tracked-but-not-chased: items beyond the build ceiling, and escalation-gated residuals. (A *finite, enumerated* owed-list is legitimate to drain; an open-ended "find more" loop is not — see anti-placebo layer.)
- **Next up** — selectable work to launch as concurrency slots free.
- **Blockers** — orphans found by the integrity sweep (§8); `{{ESCALATION_GATES}}` residuals; anything needing human input.

**Self-check at each rewrite:** *"Does every durable conclusion trace to a
verified source artifact, and is the accountable stage owner clear?"* Keep this
as an HTML comment in the template.

---

## 4. The decided-INDEX and the flat ADR files (the authoritative record + 1:1)

**`DECISION_LOG.md`** — authoritative for verdicts. A newest-first append table, **one row per decided item**, held strictly **1:1 with `adr/*.md` files**: every `adr/<id>.md` has exactly one LOG row and vice-versa. This 1:1 is the canary the integrity sweep verifies by ID-set diff (QUEUE ↔ LOG ↔ `adr/*.md`) (§8). Append-only by convention — never rewrite history here; to revise a verdict, supersede (below), don't edit.

**`adr/<id>.md`** — the per-decision reasoning artifact (the ADR), **ONE flat file per decided item**. The *unit of work* noun is itself a knob (decision / finding / source / task / risk); the **one-file-per-decision** shape is fixed. Standard schema (a MADR-style workhorse; collapse to a one-liner for trivial reversible calls; use the full matrix only when an option comparison is warranted):

- **Status:** `proposed → exploring → forked → decided → superseded`
- **Reversibility:** `one-way-door | costly | reversible`
- **Gating-Impact:** which `{{HARD_GATES}}` / `{{LOCKED_CONSTRAINTS}}` it touches (or `none`)
- **Depends-on / Blocks**; **Fork** (if it spawned one)
- **Question** · **Context & constraints** · **Options** (with a scored matrix) · **Adversarial review** (who tried to refute the leader, from which lenses, and the cross-family verdict) · **Decision** · **Rejected alternatives** (keep these — the why-not is valuable audit evidence) · **Consequences** · **Spawned follow-ups** · **Evidence links**

**Hard rules:**
- **One decision per ADR.**
- **Immutable once accepted** — to change a decided item, write a *new* ADR that `Supersedes <id>` and mark the old one `Superseded by <id>`. Never edit an accepted ADR in place.
- **Stable sequential IDs**, never reused.
- Sidecars hang off the flat file, they do not replace it: cross-family reviews persist to `adr/_reviews/<id>-<family>.md` (e.g. `adr/_reviews/D003-codex.md`, `adr/_reviews/D003-gemini.md`); heavy option matrices / research / specs that don't fit inline go to `adr/_meta/<id>-<name>.md`. A sibling `adr/<id>.research/` dir is allowed **only** for genuinely research-heavy items — flat is the **DEFAULT**, the dir is the rare exception. The immutability / dashboard / code-index scanners count `adr/*.md` and **SKIP** `adr/_reviews/` and `adr/_meta/`. The sidecar set is extensible; the one-file-per-decision ADR is not.

*The ADR schema, plus inline FORK and QUEUE-ITEM blocks, is implemented by `templates/ADR.template.md` — which ships at skill `templates/` and bootstrap installs into the lab at `adr/_meta/ADR.template.md`. The decision lifecycle that produces these records is the decision-lifecycle layer.*

---

## 5. The QUEUE, the run-ledger, and the RECONCILE discipline

### DECISION_QUEUE.md — the navigable status INDEX

Explicitly **not authoritative** (it points at where-to-look; the LOG holds verdicts). Carries:

- A **controlled STATUS vocabulary** (extensible enum — add domain dispositions as knobs, never inline ad-hoc strings):
  `DECIDED` · `DECIDED-PROVISIONAL` (decided but `{{HARD_GATES}}`-gated for promotion/live) · `FORKED` · `FOLDED`/`MERGED` · `*-GATED` (expert/lawyer signoff) · `HUMAN-TIE-BREAK` · `SPIKE` · `DEFERRED` · `BUILD-ARTEFACT` · `UNRESOLVED`.
  The `DECIDED` vs `DECIDED-PROVISIONAL` split is driven by `{{HARD_GATES}}`: anything in a hard-gate area cannot be plain `DECIDED` until it has a panel pass + cross-family pass.
- **Dependency-ordered tiers.** Tier-0 = the foundational one-way-doors that gate everything downstream. The **tiering mechanism** is fixed; the tier *contents* are domain instance data.
- A **COUNT SUMMARY** that reconciles *every* item to exactly one disposition (decided / forked / folded / gated / spike / deferred / spawned-open) and asserts **"0 unresolved loose ends"** — verified by **ID-set diff against the LOG**, not by eyeballing.

### .orchestrator/runs.md — the crash-safety spine

Three parts:

1. **History table:** `date | run-id | workflow | one-line purpose` — one row per launch/completion.
2. **In-flight table** (under an explicit marker comment so it's machine-findable): `run-id | item | what | launched | expected-output`.
3. **Newest-first narrative notes** as HTML comments: `<!-- RECONCILED iterN: ... -->` and `<!-- LAUNCHED iterN: ... -->`. Each is a dense capture of what landed, verdicts, launches, NEXT and course-corrections. Keep the in-flight table plus the most recent 50 closed rows/notes hot. At reorg, rotate older closed material verbatim into an indexed `.orchestrator/history/runs-<range>.md`; never rotate an in-flight row.

### The two disciplines that make crashes survivable

- **DISPATCH writes the in-flight row BEFORE launching** (the run-id is filled in *after* the launch returns it). Journaling the run→item link *before* you move on means a crash/compaction mid-launch never orphans the work. (Compaction does **not** kill already-running background tasks — but without the in-flight row, the next iteration has no way to find their results.)
- **RECONCILE is loop step 0.** *Every* iteration begins by reading the in-flight table and, for each entry: **completed →** ingest the output (RECORD verbatim into the ADR file `adr/<id>.md` + LOG), then clear the row; **dead/errored →** re-dispatch, or mark blocked. This re-attaches results to items even if the prior iteration was compacted mid-flight. **Clear an in-flight row only here** — never at launch, never speculatively.

### The canonical loop

```
RECONCILE → READ(GOAL/STATE/QUEUE) → SELECT → DISPATCH(ledger-then-launch)
          → RECORD(verbatim) → PROPAGATE(new items) → REORG(if due)
          → rewrite STATE → WAKE/STOP
```
(Full loop semantics — caps, delegation choice, anti-patterns — are in the operating-loop layer.)

---

## 6. Persist-not-author (the rule that keeps records trustworthy)

Durable reasoning files preserve provenance to delegated artifacts and objective
checks. A named stage owner may curate and synthesise them from verified
evidence; raw returns remain sidecars when auditability requires them. Thin or
`ok:false` legs are recorded and re-dispatched or escalated, never silently
filled. Persist the synthesis before compaction so it does not live only in
transient context.

Reviews are persisted **verbatim** as `adr/_reviews/<id>-<family>.md` sidecars.
Worker and reviewer verdicts are claims, not authority. When they disagree,
persist both, verify their cited evidence or rerun the objective gate, then let
the named decision owner adjudicate and correct the record.

**Dirty-ADR normalize-on-persist note.** Delegated ADRs arrive dirty more often than not. Delegated agents *usually* self-write the ADR file, but **not always** — so always **verify the dir exists after a delegated run.** If the file is absent or wrapped, persist it via a clean-up pass:
- keep the `# <id> ...` heading;
- drop a trailing lone ` ``` ` code-fence;
- strip a leading ` ```markdown ` wrapper and any conversational preamble (e.g. *"Now I have what I need…"*).
A self-written ADR that lands at a nested or non-standard path must be **moved to the flat `adr/<id>.md` convention** so the 1:1 LOG ↔ `adr/*.md` invariant holds.

---

## 7. The traceability spine (the ≤3-hop promise)

An unbroken chain, every link on disk:

```
Branch-point (fork) → Option + evidence → Panel scores → adr/<id>.md (decision + rationale) → commit/PR/artifact → output
```

Every output artifact cites its `adr/<id>.md`; every decision cites its evidence. **A human (or fresh agent) must be able to trace any decision → rationale → research → output in ≤3 hops.** For each load-bearing `{{LOCKED_CONSTRAINT}}`, keep a **Constraint → Decision → output** trace map — in a regulated/audited domain *this map is the audit evidence.* Rejected alternatives and archived fork losers are part of the spine, not clutter: the *why-not* is the audit trace.

---

## 8. Reorg-for-navigability cadence + the integrity sweep

**Ledgers are append-by-convention, so they drift.** (Real drift seen in practice: an unescaped pipe-char silently breaking a LOG row's column count; a byte-identical duplicate ID breaking the audit; a self-written ADR landing at a nested path that needed a flat-convention move.) The reorg + sweep is what keeps the ≤3-hop promise from rotting over weeks.

**Reorganize when any trigger fires** — and log every reorg in `reorg-log.md` (one entry each):
- every ~8–10 completed items, **or** a directory exceeds ~25 entries,
- a fork resolves (archive losers with their why, promote the winner),
- a human asks, **or** STATE has visibly drifted from reality.

(All thresholds are tunable knobs.) A reorg **re-tiers the QUEUE, refreshes the navigation map + INDEX, ensures every decided item has a current `adr/<id>.md`, rotates hot STATE/run-ledger history, and re-confirms the ≤3-hop promise.** Dead scratch means a run-owned, manifest-classified ephemeral file with no live reference; unknown or unmanifested material is never pruned.

**Integrity sweep — run at every reorg (mandatory):**
- every `adr/<id>.md` has a LOG row **and** a closed QUEUE item;
- every QUEUE "done" has a dir;
- every resolved fork has a VERDICT record;
- every in-flight run is *still actually running* (else re-dispatch or clear);
- IDs are unique; references resolve.

The **ID-set diff (QUEUE ↔ LOG ↔ `adr/*.md`)** is the canary — it surfaces orphans, duplicates, and column-count breaks before they compound. **List every orphan found in STATE "Blockers" and fix it.**

**Resumability recall check (functional, complements the structural sweep).** The ID-set diff proves the records *exist*; it does not prove a cold reader could *act* on them. At each STATE rewrite — and always before flipping `STATUS: STOP` — pose these probes against STATE + the file set **alone** (imagine zero prior context), and if any fails, the summary lost signal: re-persist it verbatim from the source artifact, don't paper over it in your own prose.

- **Recall:** what was just decided, and the verdict? (the LOG row + its `adr/<id>.md`)
- **Artifact:** which artifacts exist, and at what paths? (built inventory ↔ files on disk)
- **Continuation:** what does the next wake do first? (STATE's RESUME PROTOCOL / HANDOFF's TERMINAL PICKUP)
- **Reasoning:** why is each open fork / `{{ESCALATION_GATES}}` residual still open? (traceable in ≤3 hops)

**An empty queue is a trigger to re-enumerate + deepen, not to halt** (gotcha §10.5). Only `STATUS: STOP` halts.

---

## 9. HANDOFF.md — the capstone

A synthesis deliverable that **introduces no new decisions** — it consolidates existing artifacts for the next agent or human. It opens with a **TERMINAL PICKUP** block (*"start here, do #1 first"*), then re-states **verified counts** (N `adr/*.md` files ↔ N LOG rows ↔ N QUEUE citations, exact 1:1, **zero orphans**, independently re-verified), the built inventory, the `{{ESCALATION_GATES}}` remainder (each: id / what / gate-class / where-marked), and a recommended build/escalation sequence. **Every claim traces to a source file path.** Regenerate it on material change; **a stale capstone is a finish-blocker** — closing a run means making GOAL + STATE + HANDOFF *all agree* on the terminal truth before flipping `STATUS: STOP` (gotcha §10.8).

---

## 10. Gotchas (cite the run note when you record the lesson)

1. **Never trust a build-agent's self-reported verdict.** A worker once overclaimed *"verdict FAIL→PASS"*; the **independent** cross-review was authoritative = still FAIL. Persist and read the independent reviewer's verdict, not the worker's self-claim. The persisted `adr/_reviews/<id>-<family>.md` sidecar is corrected to the independent truth.
2. **Transient-API-death recovery via resume.** Background workflows die mid-run on transient overload errors. Completed phases are *cached* and partial findings preserved verbatim to a file, then the run is **resumed (not restarted)** so only the killed phases re-run. Lesson: persist partial outputs verbatim *immediately*; resume, don't restart; cross-family/non-same-provider CLIs are immune to your provider's overload for the verification step.
3. **Bounded-retry CONVERGENCE RULE: a 2nd fix that still fails → escalate, don't loop a 3rd.** When a gate-integrity fix was attempted twice and the 2nd still failed, the orchestrator stopped mechanically re-greening it and **escalated it as a promotion-gated item with the failing checklist as the spec** — finishing *with* an escalation residual rather than an infinite fix loop.
4. **Firm-stop vs genuine-placebo PIERCE.** A firm-stop on open-ended harden loops normally holds, **but** a hard gate that cross-family review *proves* is decorative/placebo/vacuous (or a real correctness bug) **pierces** the firm-stop — a decorative gate cannot underwrite "thoroughly complete," so it must be fixed. Diminishing-returns coverage findings go to the owed-list instead. Distinguish genuine-placebo (pierces) from divergent-scope harden (held).
5. **"Exhausted" was wrong once — re-enumerate before declaring done.** The orchestrator twice declared the frontier exhausted while genuine work remained (items wrongly parked "blocked", cross-cutting gaps with no ADR). **An empty queue is a trigger to re-enumerate + deepen, not to halt.** A periodic gap-re-enumeration pass keeps the deepening backlog honest.
6. **Ledgers drift — the integrity sweep is mandatory.** Append-by-convention means they *can* drift: unescaped pipe-chars breaking LOG column counts, a duplicate ID breaking the audit, a self-written ADR at a nested path. The ID-set diff (QUEUE ↔ LOG) is the canary; run it every reorg.
7. **Write the in-flight row BEFORE launching; clear it only on RECONCILE.** Else a crash/compaction mid-flight loses the run→item link. (Compaction does *not* kill the background task — but the in-flight ledger is the only thing that lets the next iteration re-attach its result.)
8. **A stale capstone is a finish-blocker.** A finishing audit returned *not-ready* chiefly because HANDOFF was stale (cited an old iteration's counts) and GOAL/STATE disagreed on finish-state. Make GOAL + STATE + HANDOFF all agree on the terminal truth before flipping `STATUS: STOP`.
9. **Persisted ADRs from delegated agents arrive dirty — normalize on persist** (§6). Verify the dir exists after every delegated run; strip wrappers/preamble; move nested ADRs to the flat convention.
10. **Wake discipline / no busy-loop.** When everything selectable is in-flight, schedule a wake and exit the turn rather than re-reading "everything in flight." The in-flight table + the harness completion-notify are the primary signals; the scheduled wake is a fallback. This prevents burning iterations re-reading unchanged state.

---

### Worked reference instance (aside — strip when reusing)

This layer was distilled from a ~101-iteration AU-fintech design-lab run that produced ~100 ADRs (each a flat `adr/<id>.md`, 1:1 with LOG rows), several live forks, dual codex+gemini cross-family review, and a substantial test suite — a point-in-time snapshot, not a running tally — all traced through `STATE.md` / `DECISION_LOG.md` / `DECISION_QUEUE.md` / `.orchestrator/runs.md` / `HANDOFF.md`. There the `{{HARD_GATES}}` were money-movement / ledger-posting / KYC-AML / tenant-isolation / asset-registration, `{{LOCKED_CONSTRAINTS}}` were data-residency + the operating-licence + AML + privacy + minimal-cost, and `{{BUILD_CEILING}}` was *"scaffold + IaC + local/mocked, no real cloud or money."* **None of those specifics are load-bearing for the mechanism** — they are exactly the config knobs in §0, shown only to make the abstract slots concrete.
