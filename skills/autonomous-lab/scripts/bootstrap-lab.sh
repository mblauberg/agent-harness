#!/bin/sh
# bootstrap-lab.sh — scaffold a fresh filesystem-memory "lab" for a NEW domain.
# ============================================================================
# Layer 2 of the autonomous-lab discipline (the filesystem-as-memory spine).
# See:  references/filesystem-memory.md  ·  references/recovery-and-cadence.md
#       SKILL.md "The 60-second bootstrap"
#
# This script is DOMAIN-AGNOSTIC. It carries NO knowledge of any specific
# mission, constraint, gate, or product. Every domain-specific fact is a NAMED
# CONFIG KNOB ({{DOMAIN}}, {{MISSION}}, {{LOCKED_CONSTRAINTS}}, {{HARD_GATES}},
# {{ESCALATION_GATES}}, {{BUILD_CEILING}}, ...) that the user fills ONCE in the
# CONFIG KNOBS block at the top of the lab's GOAL.md. The same machinery then
# drives a literature review, a codebase migration, a security audit, or a
# product design with zero edits to this script or the workflows.
#
# WHAT IT DOES (two phases, same command, idempotent):
#
#   Phase A — SCAFFOLD (first run on an empty/new lab dir):
#     * create the FLAT memory tree (adr/ adr/_reviews/ adr/_meta/ forks/
#       scaffolds/ context/ tools/ .orchestrator/; plus an empty workflows/).
#     * copy the skill's templates/ into the lab as the working memory files
#       (README.md, GOAL.md, OPERATING_MANUAL.md, STATE.md, DECISION_LOG.md,
#       DECISION_QUEUE.md, HANDOFF.md, reorg-log.md, .orchestrator/runs.md,
#       context/CTX.md, adr/_meta/ADR.template.md). If a template is missing
#       from the skill, a built-in DEFAULT is written instead, so the script is
#       self-sufficient today and forward-compatible when templates land.
#     * copy the skill's spine tools/ (*.mjs) into the lab tools/.
#     * leave {{KNOBS}} UNSUBSTITUTED on purpose — the user now fills them.
#     * print "next steps": fill the CONFIG KNOBS block in GOAL.md, re-run me.
#     NOTE: workflows are DOCUMENTED PATTERNS (references/workflow-patterns.md)
#     the orchestrator AUTHORS per-run — the skill ships NO runnable workflow
#     files and bootstrap copies none. An empty/absent workflows/ is EXPECTED,
#     never an error; bootstrap only drops a one-line pointer README into it.
#
#   Phase B — SUBSTITUTE (re-run after the knob block is filled):
#     * read the fenced CONFIG KNOBS block from GOAL.md
#     * do literal {{KNOB}} -> value substitution into README.md,
#       OPERATING_MANUAL.md, context/CTX.md (and any other lab file with knobs)
#     * seed DASHBOARD.md by running tools/gen-dashboard.mjs (if node is present;
#       else print the one command to run).
#     * report any {{...}} placeholders still left behind (the canary that a
#       knob was missed) before declaring success.
#
# IDEMPOTENT / NON-CLOBBERING: an existing lab file is NEVER overwritten in the
# scaffold phase — it is left as-is and a warning is printed. Re-running only
# re-applies substitution to placeholders that are still present. So you can run
# this as many times as you like; it converges, it does not destroy.
#
# ROBUSTNESS: strict mode (set -eu), explicit arg parsing, structured exit
# codes, and ENVIRONMENT WARNINGS (git repo for worktree isolation; a Workflow()
# harness for the background runs) that DO NOT abort — a lab without git or
# without the harness is still a valid lab, it just degrades (gate off worktree
# spikes / Workflow archetypes). Fail loud, degrade gracefully.
#
# INSTALL:  chmod +x scripts/bootstrap-lab.sh
# ============================================================================

set -eu

PROG="bootstrap-lab.sh"

# The skill root is the parent of this script's scripts/ dir. Resolve it so we
# can find templates/ and tools/ regardless of the caller's cwd.
SCRIPT_PATH="$0"
case "$SCRIPT_PATH" in
  /*) : ;;                                   # already absolute
  *)  SCRIPT_PATH="$(pwd)/$SCRIPT_PATH" ;;   # make absolute from cwd
esac
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_TEMPLATES_DIR="$SKILL_DIR/templates"
SKILL_TOOLS_DIR="$SKILL_DIR/tools"

# ---- defaults --------------------------------------------------------------
LAB_DIR=""
DOMAIN_ARG=""           # optional positional/flag domain name; seeds {{DOMAIN}}
FORCE=false             # --force: re-copy templates over existing files (still warns)
DRY_RUN=false           # --dry-run: print actions, change nothing
QUIET=false

err()  { printf '%s: %s\n' "$PROG" "$*" >&2; }
warn() { printf '%s: WARNING: %s\n' "$PROG" "$*" >&2; }
note() { [ "$QUIET" = true ] || printf '%s\n' "$*"; }
die()  { err "$*"; exit 2; }

# ---- usage -----------------------------------------------------------------
usage() {
  cat <<EOF
$PROG — scaffold a fresh filesystem-memory "lab" for a NEW domain, then
substitute the domain CONFIG KNOBS. Idempotent and non-clobbering.

USAGE:
  $PROG <LAB_DIR> [DOMAIN]
  $PROG --dir <LAB_DIR> [--domain "<text>"] [--force] [--dry-run] [-q] [-h]

ARGUMENTS:
  LAB_DIR            (required) Target directory for the lab. Created if absent.
                    A per-domain INSTANCE of the skill; the skill files never
                    move into it — templates are copied, knobs filled here.
  DOMAIN            (optional) One-line domain name; seeds the {{DOMAIN}} knob
                    in GOAL.md on first scaffold (you still edit the rest).

OPTIONS:
  --dir DIR         Alternative to the positional LAB_DIR.
  --domain TEXT     Alternative to the positional DOMAIN.
  --force           Re-copy templates over existing lab files (still warns;
                    use ONLY to refresh a lab from updated skill templates —
                    it will overwrite your edits to those files).
  --dry-run         Print what WOULD happen; create/modify nothing.
  -q, --quiet       Suppress the informational receipt (warnings still print).
  -h, --help        Show this help.

TWO-PHASE WORKFLOW (same command, run it twice):
  1) $PROG ~/labs/mylab "my domain"     # scaffolds the memory tree
  2) edit ~/labs/mylab/GOAL.md          # fill the CONFIG KNOBS block (only file
                                        #   you must edit: {{MISSION}}, the
                                        #   {{LOCKED_CONSTRAINTS}}, {{HARD_GATES}},
                                        #   {{ESCALATION_GATES}}, {{BUILD_CEILING}})
  3) $PROG ~/labs/mylab                 # substitutes knobs everywhere + reports
                                        #   any {{...}} you left unfilled

WHAT IT CREATES:
  <LAB_DIR>/
    README.md               single human entry point (knobs subst.; -> DASHBOARD)
    GOAL.md                 human-owned: mission + STATUS:RUN/STOP gate + knobs
    OPERATING_MANUAL.md     the orchestrator's constitution (knobs substituted)
    STATE.md                heartbeat / recover-after-compaction anchor (empty)
    DECISION_LOG.md         authoritative decided-index (empty, header only)
    DECISION_QUEUE.md       navigable status index (empty, vocabulary + tiers)
    HANDOFF.md              capstone synthesis stub
    reorg-log.md            reorg history (empty)
    context/CTX.md          per-domain context the workflows read (knobs subst.)
    .orchestrator/runs.md   hot run-ledger: recent history + in-flight tables
    .orchestrator/history/ indexed rotated closed-run/note history
    adr/                    decided records — ONE FILE each: adr/<id>.md
    adr/_reviews/           cross-family review sidecars: <id>-<family>.md
    adr/_meta/              option matrices / heavy research + ADR.template.md
    forks/                  parallel fork paths
    scaffolds/              built artifacts (up to {{BUILD_CEILING}})
    tools/                  spine scanners (*.mjs) copied from the skill
    workflows/              EMPTY + a pointer README (patterns authored per-run)
    DASHBOARD.md            GENERATED status board (regenerable; gitignore-cand.)
    ADR_CODE_INDEX.md       GENERATED ADR->code map (regenerable; gitignore-cand.)
    .decided-adr-manifest.json  GENERATED immutability manifest (regenerable)

EXIT CODES:
   0  success (scaffolded, or substituted with no placeholders left).
   2  usage / argument error.
   3  scaffolded OK, but the lab is INCOMPLETE — the CONFIG KNOBS block has not
      been filled yet (still has {{KNOBS}}). This is the expected code after the
      FIRST run; fill GOAL.md and re-run. (Phase A normal-finish.)
   4  substitution ran but UNSUBSTITUTED {{...}} placeholders remain (a knob was
      missed, or a typo'd knob name). The offending placeholders + files are
      listed on stderr. Fix the knob block and re-run.

ENVIRONMENT NOTES (warnings, never fatal):
  * Worktree isolation for build spikes needs a Git repo plus direct human
    authority. Authorised checkouts use primary-root/.worktrees through the
    global scripts/worktree helper. If Git is absent, keep worktree mode off.
  * The workflow archetypes (authored per-run from references/workflow-patterns.md)
    run natively on a Claude Code operator (Workflow()/resume; Claude-only), or as
    an Ultra/native multi-agent stage graph (explicit waves below Ultra) plus an
    external loop driver on a Codex operator (see
    references/codex-operator.md). With neither CLI detected, $PROG warns; the lab
    still works for manual/agent dispatch.
EOF
}

# ---- arg parsing -----------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --dir)     [ $# -ge 2 ] || die "missing value for --dir";    LAB_DIR="$2"; shift 2 ;;
    --domain)  [ $# -ge 2 ] || die "missing value for --domain"; DOMAIN_ARG="$2"; shift 2 ;;
    --force)   FORCE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -q|--quiet) QUIET=true; shift ;;
    -h|--help) usage; exit 0 ;;
    --)        shift; break ;;
    -*)        die "unknown option: $1 (try --help)" ;;
    *)
      if [ -z "$LAB_DIR" ]; then
        LAB_DIR="$1"
      elif [ -z "$DOMAIN_ARG" ]; then
        DOMAIN_ARG="$1"
      else
        die "unexpected extra argument: $1 (try --help)"
      fi
      shift ;;
  esac
done

[ -n "$LAB_DIR" ] || die "a lab directory is required (try --help)"

# ---- dry-run executor ------------------------------------------------------
# Every filesystem mutation routes through these so --dry-run is honoured in
# exactly one place.
do_mkdir() {
  if [ "$DRY_RUN" = true ]; then note "  [dry-run] mkdir -p $1"; else mkdir -p "$1"; fi
}
# do_write FILE  (content on stdin). Honours non-clobber + --force + --dry-run.
do_write() {
  _f="$1"
  if [ -e "$_f" ] && [ "$FORCE" != true ]; then
    warn "exists, kept (not clobbered): $_f"
    cat >/dev/null              # drain stdin
    return 0
  fi
  if [ -e "$_f" ] && [ "$FORCE" = true ]; then
    warn "--force: overwriting existing file: $_f"
  fi
  if [ "$DRY_RUN" = true ]; then
    cat >/dev/null
    note "  [dry-run] write $_f"
  else
    cat > "$_f"
    note "  wrote $_f"
  fi
}
# do_copy SRC DST. Honours non-clobber + --force + --dry-run.
do_copy() {
  _s="$1"; _d="$2"
  if [ -e "$_d" ] && [ "$FORCE" != true ]; then
    warn "exists, kept (not clobbered): $_d"
    return 0
  fi
  if [ "$DRY_RUN" = true ]; then
    note "  [dry-run] copy $_s -> $_d"
  else
    cp "$_s" "$_d"
    note "  copied $(basename "$_s") -> $_d"
  fi
}

# ---- resolve / create the lab root -----------------------------------------
if [ -e "$LAB_DIR" ] && [ ! -d "$LAB_DIR" ]; then
  die "lab path exists but is not a directory: $LAB_DIR"
fi
if [ ! -d "$LAB_DIR" ]; then
  note "Creating new lab directory: $LAB_DIR"
  do_mkdir "$LAB_DIR"
fi
# Resolve to absolute (skip if dry-run created nothing on disk).
if [ -d "$LAB_DIR" ]; then
  LAB="$(cd "$LAB_DIR" && pwd)"
else
  # dry-run on a not-yet-existing dir: synthesize an absolute-ish path.
  case "$LAB_DIR" in
    /*) LAB="$LAB_DIR" ;;
    *)  LAB="$(pwd)/$LAB_DIR" ;;
  esac
fi

# Detect whether this is a first scaffold or a re-run (GOAL.md present already).
RERUN=false
[ -f "$LAB/GOAL.md" ] && RERUN=true

note ""
note "=============================================================="
note "  autonomous-lab bootstrap"
note "  lab:        $LAB"
note "  skill:      $SKILL_DIR"
note "  phase:      $([ "$RERUN" = true ] && echo 'B (substitute — GOAL.md present)' || echo 'A (scaffold — fresh lab)')"
[ "$DRY_RUN" = true ] && note "  mode:       DRY-RUN (no changes will be made)"
note "=============================================================="

# ============================================================================
# PHASE A — SCAFFOLD (only the missing pieces; never clobber)
# ============================================================================

note ""
note "[1/5] memory tree (flat adr/ layout)"
for d in \
  "$LAB/adr" \
  "$LAB/adr/_reviews" \
  "$LAB/adr/_meta" \
  "$LAB/forks" \
  "$LAB/scaffolds" \
  "$LAB/context" \
  "$LAB/tools" \
  "$LAB/workflows" \
  "$LAB/.orchestrator" \
  "$LAB/.orchestrator/history" ; do
  do_mkdir "$d"
done

# --- helper: install a memory file from the skill template if present, else
#     fall back to a built-in default written via the named generator fn. ----
# install_file  LAB_REL_PATH  TEMPLATE_BASENAME  DEFAULT_FN
install_file() {
  _rel="$1"; _tpl="$2"; _fn="$3"
  _dst="$LAB/$_rel"
  if [ -f "$SKILL_TEMPLATES_DIR/$_tpl" ]; then
    do_copy "$SKILL_TEMPLATES_DIR/$_tpl" "$_dst"
  else
    # generate default into the file (respecting non-clobber via do_write)
    "$_fn" | do_write "$_dst"
  fi
}

note ""
note "[2/5] memory files (template if present, else built-in default)"

# ---------------------------------------------------------------------------
# Built-in default generators. Each emits a domain-AGNOSTIC file carrying
# {{KNOBS}} where domain facts belong. GOAL.md is intentionally the ONLY file
# the user edits; everything else is substituted from it.
# ---------------------------------------------------------------------------

gen_goal() {
  if [ -n "$DOMAIN_ARG" ]; then
    _dom="$DOMAIN_ARG"
  else
    _dom="{{DOMAIN}}"
  fi
  cat <<EOF
# GOAL — the north star + the RUN/STOP gate
<!--
  HUMAN-OWNED. The orchestrator reads this at the START of every iteration and
  obeys it. It must NEVER author content into this file. The ONLY clean exit is
  a human setting STATUS: STOP.
-->

\`\`\`config-knobs
# ============================================================================
# CONFIG KNOBS — fill these ONCE, then re-run scripts/bootstrap-lab.sh to
# substitute them everywhere. This fenced block is the single domain-injection
# point. A thin fill produces thin output across every workflow — be substantive.
# Each knob: replace the {{...}} value (keep the KEY = on the left).
# ============================================================================

DOMAIN            = $_dom
# ^ one line naming the field/system this run operates in.

MISSION           = {{MISSION}}
# ^ the open-ended north star + definition-of-good: what the run PRODUCES, run
#   until STOP. Be concrete and substantive. (worked-ref: "design + scaffold a
#   compliant lending platform to a traceable, human-gated finish.")

LOCKED_CONSTRAINTS = {{LOCKED_CONSTRAINTS}}
# ^ the do-not-relitigate set the run designs AROUND (settled inputs, NOT
#   decisions to reopen). (worked-ref: data-residency + the operating licence +
#   AML + privacy + minimal-cost.)

HARD_GATES        = {{HARD_GATES}}
# ^ high-blast-radius areas that may NEVER be auto-accepted: each needs a
#   passing judge panel AND a cross-family pass before a decision is final or an
#   artifact promoted (drives DECIDED vs DECIDED-PROVISIONAL). (worked-ref:
#   money-movement / ledger-posting / KYC / tenant-isolation / asset-registration.)

ESCALATION_GATES  = {{ESCALATION_GATES}}
# ^ the concrete instances of each generic gate class for THIS domain:
#   human / expert / panel / spike / apply / promotion. (worked-ref: legal
#   sign-off cluster; cloud-vendor human tie-break; promotion gate; worktree spikes.)

BUILD_CEILING     = {{BUILD_CEILING}}
# ^ the explicit line between what the run may build autonomously and what
#   requires human authorization / is owed / escalated. (worked-ref: "scaffold +
#   IaC + local/mocked, no real cloud or money.")

# ---- these DEFAULT; edit only to tune -------------------------------------
RUBRIC            = {{RUBRIC}}
# ^ weighted scoring criteria (weights sum to 1), recomputed deterministically.
#   Default skeleton: Correctness/fit, Risk, Reversibility, Cost, Operability,
#   Build-leverage, Mission-centricity, Evidence-quality — swap risk + mission.

WORK_LAYERS       = {{WORK_LAYERS}}
# ^ the slices of the problem space the enumerate/research/judge workflows fan
#   out across (research lenses / judge lenses). Default array, overridable via args.

RUNAWAY_CAPS      = {{RUNAWAY_CAPS}}
# ^ max-concurrent-jobs (~4), max-active-forks (~3), fork-depth (~2),
#   per-unit-budget (~3 runs), bounded-retry (~2), long-wake (~3600s). Ceilings.

MODEL_MATRIX      = {{MODEL_MATRIX}}
# ^ durable aliases: flagship=judgement/design, workhorse=bounded research/
#   implementation, scout=schema-forced mechanical work; plus effort tier.
#   Resolve aliases to concrete runtime models and record the mapping. Full policy:
#   references/model-effort-policy.md.

CROSS_FAMILY_VERIFIER = {{CROSS_FAMILY_VERIFIER}}
# ^ which independent/different-model-family reviewer(s) underwrite high-stakes
#   verdicts + their route receipts. All answer-bearing external reviewers use
#   Agent Fabric; direct CLIs are degraded preflight/fallback only.

DOMAIN_INVARIANTS = {{DOMAIN_INVARIANTS}}
# ^ OPTIONAL: load-bearing correctness properties that seed the property-test /
#   differential-oracle suite and fail-closed on violation. Leave as "none" if
#   the domain has no checkable correctness core.

EXPERT_AUTHORITIES = {{EXPERT_AUTHORITIES}}
# ^ named domain sign-off authorities for the expert escalation class (fill per domain).
# ============================================================================
\`\`\`

## Mission

{{MISSION}}

The framing is **never self-close the mission.** An empty queue triggers one
bounded re-enumeration pass. If still dry, write an idle checkpoint and pause
dispatch until a material resume trigger; only human STOP closes the mission.

## Traversal order

Default: foundational one-way-doors first, then descend dependency tiers
respecting \`Depends-on\`. Overridable by the Active directives block below.

## Definition of "good"

The acceptance bar for the whole run, judged by the {{RUBRIC}}. Every
\`{{HARD_GATES}}\` item needs a judge-panel pass AND a cross-family pass before it
counts as final.

## Locked constraints (do NOT relitigate)

{{LOCKED_CONSTRAINTS}}

## Escalation-gated items (design around — do not stall on)

{{ESCALATION_GATES}}

## Active directives
<!-- Human-editable steering block. Empty = follow the traversal order above. -->



## STATUS gate

STATUS: RUN
<!-- audit note: who/why/when this last flipped. RUN at scaffold. -->
PREV: (none)

<!--
  Flipping to STOP requires GOAL + STATE + HANDOFF to ALL agree on the terminal
  truth (a STOP written while the capstone is stale is a finish-blocker). Write
  an inline audit note (who/why/when) and update PREV when you flip it.
-->
EOF
}

gen_operating_manual() {
  cat <<'EOF'
# OPERATING MANUAL — the orchestrator's constitution
<!--
  Read this IN FULL at the start of a run; it is load-bearing. Domain knobs
  ({{MISSION}} etc.) are substituted from GOAL.md by scripts/bootstrap-lab.sh.
  Deep detail lives in the skill's references/*.md — this is the operative summary.
-->

## §0 — Identity

You are the **orchestrator** for the autonomous lab pursuing:

> **Mission:** {{MISSION}}
> **Domain:** {{DOMAIN}}

You are the accountable orchestrator. Delegate independent depth, keep durable
pointers, and synthesise/adjudicate from verified artifacts. Your context is
RAM and can be compacted; the filesystem is the recovery record.

## §1 — The five fixed invariants

1. **Protect orchestrator context.** Delegate independent depth; retain
   accountable synthesis, adjudication and gates.
2. **Provenance-before-promotion.** Preserve raw returns/hashes when required,
   then curate verified evidence into durable reasoning. Never promote an
   unreviewed worker return; record and re-dispatch/escalate thin or failed legs.
3. **Record-before-launch + RECONCILE-first.** Journal {run-id, item, what,
   launched, expected-output} to the run-ledger AND STATE BEFORE launching any
   background job. Every iteration begins (step 0) by reconciling the in-flight
   table. Clear an in-flight row ONLY on reconcile.
4. **Never self-close the mission.** An empty queue gets one bounded
   re-enumeration pass; if still dry, write STATE PAUSED with an idle checkpoint
   and resume trigger, release the lease and end without another self-wake.
   Only human \`GOAL\` \`STATUS == STOP\` closes the mission.
5. **Never trust a self-reported verdict.** On {{HARD_GATES}}, an INDEPENDENT
   cross-family review is authoritative over any worker's self-claim.

## §2 — The resumable 8-step mission loop (dry frontier pauses; STOP closes)

```
RECONCILE  re-attach completed/dead in-flight runs (crash-safety; step 0)
READ       GOAL (directives + STOP) · STATE · QUEUE head
SELECT     next unblocked unit within caps + deps; prefer one-way-doors
DISPATCH   journal run->unit to ledger + STATE BEFORE launch; then fan out
RECORD     write returned output VERBATIM to disk; update LOG/QUEUE; clear in-flight
PROPAGATE  add newly-surfaced work to the QUEUE with dependencies
REORG      if a cadence trigger fired (run the integrity sweep)
STATE      rewrite STATE.md to current truth (in-flight, next, forks, blockers)
WAKE/STOP  STOP -> clean handoff + HALT; active work -> matched wake; dry frontier -> PAUSED idle checkpoint, no self-wake
```

## §3 — The file set (roles separated by authority + mutability)

| File | Owner | Mutability | Role |
|---|---|---|---|
| README.md | bootstrap (knobs) | regenerate from template | single human ENTRY POINT — points at DASHBOARD for live state |
| GOAL.md | human | human-only | north star + STATUS gate + {{LOCKED_CONSTRAINTS}} + directives |
| DASHBOARD.md | tools/gen-dashboard.mjs | GENERATED (do not hand-edit) | live status board: lifecycle + counts + in-flight + human gates |
| STATE.md | orchestrator | rewritten each iter | heartbeat / recover anchor |
| DECISION_LOG.md | orchestrator | append-only newest-first | AUTHORITATIVE decided index, 1 row/item (1:1 with adr/*.md) |
| DECISION_QUEUE.md | orchestrator | reorg-rewritten | navigable status INDEX (not authoritative) |
| .orchestrator/runs.md | orchestrator | append + in-flight | run-ledger: history + in-flight + narrative notes |
| adr/<id>.md | delegated agents | immutable once accepted | the per-item ADR — ONE FILE per decision |
| adr/_reviews/<id>-<family>.md | delegated agents | append | cross-family review sidecars (codex / gemini) |
| adr/_meta/ | orchestrator | append | option matrices / heavy research + ADR.template.md |
| tools/*.mjs | skill (copied) | regenerate from skill | spine scanners: dashboard · ADR-immutability · ADR-code-index |
| HANDOFF.md | orchestrator | regenerated on change | capstone synthesis + terminal pickup |
| reorg-log.md | orchestrator | append | one entry per reorg |

**Load-bearing invariant:** no single file is both the steering input and the
authoritative record. GOAL steers · STATE remembers · LOG is truth-of-record ·
QUEUE navigates.

## §4 — Decisions: lifecycle + ADR

7-stage lifecycle: `proposed -> exploring -> forked -> decided -> superseded`.
One decision per ADR = **ONE FILE** `adr/<id>.md`; **immutable once accepted** (to
change, write a new ADR that `Supersedes <id>`); stable sequential IDs, never
reused. Cross-family review sidecars live at `adr/_reviews/<id>-<family>.md`;
heavy option matrices / research at `adr/_meta/<id>-<name>.md` (a sibling
`adr/<id>.research/` dir is the rare exception for genuinely research-heavy
items — flat is the DEFAULT). The ADR schema is `adr/_meta/ADR.template.md`.

Anything touching {{HARD_GATES}} is `DECIDED-PROVISIONAL` until it has a
judge-panel pass AND a cross-family pass; only then `DECIDED`.

## §5 — Forks (only for one-way-doors)

Fork ONLY a contestable one-way-door, and only with all four: named paths +
convergence criterion + kill-switch + deadline. Run candidate paths as parallel
isolated pipelines; converge head-to-head; archive losers WITH their why
(audit evidence); promote the winner to an ADR.

## §6 — Escalation taxonomy (6 generic classes; members are knobs)

human / expert / judge-panel / spike / apply / promotion. The concrete
instances for this domain are {{ESCALATION_GATES}}; named sign-off authorities
are the expert class. Bounded-retry CONVERGENCE RULE: a 2nd fix that still fails
-> ESCALATE to the right gate, do NOT loop a 3rd. Finish WITH a documented
escalation residual, never a green-on-everything claim.

## §7 — Build ceiling

The run may build autonomously only up to: {{BUILD_CEILING}}. Beyond it is
owed / escalated, tracked in STATE owed-lists, never silently auto-executed.

## §8 — Cross-family verification + anti-placebo

High-stakes verdicts are underwritten by {{CROSS_FAMILY_VERIFIER}} via
Agent Fabric under `orchestrate`. The agent that BUILDS a thing is never the
agent that REPORTS its verdict (independence boundary). Prove every gate **RED-on-mutation**
(flip the violation; if the gate still passes it is decoration and must be
fixed — a placebo gate PIERCES any firm-stop). Domain correctness core, if any:
{{DOMAIN_INVARIANTS}} — seed the property-test / differential-oracle suite;
fail-closed on violation.

## §8a — Model + effort per call (the MODEL_MATRIX knob)

Every agent() / Workflow() stage picks a MODEL + EFFORT (full policy +
matrix: references/model-effort-policy.md; domain fill in context/CTX.md).
Resolve durable aliases through the current operator roster at bootstrap and
record concrete IDs. flagship owns judgement/design/synthesis and every judge;
workhorse owns bounded research and contract-driven implementation; scout owns
schema-forced inventory, extraction, persist and format work. Lower-tier models
never decide or judge; code is contract-first. Same-family flagship panels are
the default for contestable calls; add the other primary and distinct families
({{CROSS_FAMILY_VERIFIER}}) for the irreversible core (see §8).

## §9 — Reorg + integrity sweep + traceability

Reorg when a trigger fires (~8-10 completed items, a dir like `adr/` or `forks/`
> ~25 entries, a fork resolves, a human asks, or STATE drifts) — log each in
`reorg-log.md`. Every reorg runs the integrity sweep: every decided `adr/<id>.md`
has a LOG row + closed QUEUE item; every QUEUE "done" has an `adr/<id>.md`; every
resolved fork has a VERDICT; every in-flight run is still running; IDs unique;
refs resolve. The ID-set diff (QUEUE <-> LOG <-> `adr/*.md`) is the canary
(scanners count `adr/*.md` and SKIP `adr/_reviews/` + `adr/_meta/`). Maintain the
<=3-hop traceability spine:
fork -> option+evidence -> panel scores -> adr/<id>.md -> artifact -> output.

## §10 — Runaway caps

{{RUNAWAY_CAPS}} — ceilings, not targets. Respect max-concurrent-jobs,
max-active-forks, fork-depth, per-unit budget before escalation, bounded-retry,
and long-wake seconds.

## §11 — Recovery + wake discipline

Transient provider failures (overload/5xx, rate-limit, session-cap) -> preserve
partials verbatim, RESUME (don't restart), lean on cross-family stages during a
primary outage. After a hard limit, dispatch one cheap probe then long-back-off.
When all selectable work is in-flight, schedule a wake and END THE TURN — do not
busy-loop. Completion-notify is the primary signal; the scheduled wake is a
fallback.
EOF
}

gen_state() {
  cat <<'EOF'
# STATE — heartbeat + recover-after-compaction anchor
Updated: <YYYY-MM-DDTHH:MM:SSZ>
<!--
  Rewritten IN FULL every iteration. This is the ONE file a fresh session reads
  to resume with zero other context. Re-read at the top of every loop (after
  RECONCILE). Two parts: (a) a newest-first hot window of five iteration Notes
  (older notes rotate verbatim to indexed .orchestrator/history/), and (b)
  header sections OVERWRITTEN to current truth each iteration.

  SELF-CHECK each rewrite: "Does every durable conclusion trace to verified
  source artifacts, and is the accountable stage owner clear?"

  A PAUSED idle-frontier state must record: reason idle-frontier, an empty
  in-flight ledger, no selectable DECISION_QUEUE work, a dry next-up frontier,
  release-on-driver-exit, and `restart-on:` followed only by one or more of
  `human-directive`, `gate-answer`, `external-completion`, `material-change`,
  or `explicit-restart`. The shared
  validate_idle_pause.py checks both this section format and the template
  heartbeat format.
-->

## Run status

RUNNING — phase: BOOTSTRAP (no iterations yet).
ORCHESTRATOR LEASE: unclaimed — generation 0 (first operator claims before dispatch).
RESUME PROTOCOL: read OPERATING_MANUAL.md, then GOAL.md (mission + STATUS +
Active directives), then this file, then DECISION_QUEUE.md head. Run iteration 1
of the 8-step loop.

## In flight
<!-- mirror of .orchestrator/runs.md in-flight table: run-id | item | what | launched | expected-output -->

(none)

## Built inventory
<!-- artifacts produced up to {{BUILD_CEILING}} -->

(none)

## Owed-lists
<!-- finite, enumerated work tracked-but-not-chased: beyond-ceiling + escalation-gated -->

(none)

## Next up
<!-- selectable work to launch as concurrency slots free -->

- Iteration 1: enumerate the initial work-units across {{WORK_LAYERS}} (dispatch
  the enumerate-work workflow), assign IDs, populate DECISION_QUEUE.md.

## Blockers
<!-- orphans from the integrity sweep; {{ESCALATION_GATES}} residuals; human-input-needed -->

(none)

---

## Iteration notes (newest first)

- **Note (iter0):** Lab scaffolded by bootstrap-lab.sh. Knob block in GOAL.md
  {{filled?}} · next: run iteration 1 (enumerate initial work-units) · no
  course-corrections yet.
EOF
}

gen_decision_log() {
  cat <<'EOF'
# DECISION LOG — authoritative decided-index (newest first)
<!--
  AUTHORITATIVE for verdicts. One row per DECIDED item, held strictly 1:1 with
  adr/<id>.md files: every decided adr/<id>.md has exactly one row here and
  vice-versa. Append-only by convention (newest at the top, just under the
  header). NEVER rewrite history — to revise a verdict, supersede the ADR and
  add a NEW row. The ID-set diff (this <-> QUEUE <-> adr/*.md) is the integrity canary.

  Column hygiene: escape any literal '|' in a cell as '\|' so the 6-column count
  never breaks (a real, observed drift). Keep IDs unique and never reused.
-->

| ID | Title | Verdict / decision | Reversibility | Cross-family | Date |
|----|-------|--------------------|---------------|--------------|------|
<!-- (no decisions yet) -->
EOF
}

gen_decision_queue() {
  cat <<'EOF'
# DECISION QUEUE — navigable status INDEX
<!--
  NOT authoritative for verdicts (the LOG is). This points at where-to-look:
  status + dependency tiers. Reorg-rewritten. Use ONLY the controlled STATUS
  vocabulary below — never invent ad-hoc statuses inline.
-->

## Locked constraints (echoed from GOAL — every enumerate/judge pass must see these)

{{LOCKED_CONSTRAINTS}}

## STATUS vocabulary (controlled, extensible)

- `DECIDED`               — final; has a LOG row + adr/<id>.md.
- `DECIDED-PROVISIONAL`   — decided but in a {{HARD_GATES}} area: needs a judge
                            panel pass + cross-family pass before promotion/live.
- `FORKED`                — split into parallel one-way-door paths (see forks/).
- `FOLDED` / `MERGED`     — subsumed into another item.
- `*-GATED`               — awaiting an expert / sign-off authority.
- `HUMAN-TIE-BREAK`       — awaiting a human decision.
- `SPIKE`                 — needs a build spike to resolve.
- `DEFERRED`              — intentionally postponed (with a why).
- `BUILD-ARTEFACT`        — a buildable deliverable, not a decision.
- `UNRESOLVED`            — surfaced, not yet triaged.

## Tiers (dependency-ordered; tier-0 = foundational one-way-doors)

### Tier 0 — foundational one-way-doors
<!-- gate everything downstream; decide first -->
| Item | Status | Depends on | Scope / next evidence |
|---|---|---|---|

### Tier 1+
| Item | Status | Depends on | Scope / next evidence |
|---|---|---|---|

## COUNT SUMMARY
<!--
  Reconcile EVERY item to exactly one disposition; assert "0 unresolved loose
  ends", VERIFIED by ID-set diff against the LOG (not by eyeballing).
-->

- decided: 0 · forked: 0 · folded: 0 · gated: 0 · spike: 0 · deferred: 0 · spawned-open: 0
- total items: 0
- unresolved loose ends: 0  (ID-set diff QUEUE <-> LOG: clean)
EOF
}

gen_handoff() {
  cat <<'EOF'
# HANDOFF — capstone synthesis (stub until the run produces artifacts)
<!--
  SYNTHESIS only — introduces NO new decisions; it consolidates existing
  artifacts for the next agent/human. Regenerate on material change. A STALE
  capstone is a finish-blocker: closing a run means GOAL + STATE + HANDOFF all
  AGREE on the terminal truth before STATUS flips to STOP. Re-verify counts
  INDEPENDENTLY (count artifacts on disk; reconcile ledgers to zero orphans).
-->

## TERMINAL PICKUP
<!-- "start here, do #1 first" -->

The lab has been scaffolded but has not run yet. Start by reading
OPERATING_MANUAL.md, then fill the CONFIG KNOBS block in GOAL.md, then run
iteration 1 (enumerate initial work-units across {{WORK_LAYERS}}).

## Verified counts
<!-- N adr/*.md files <-> N LOG rows <-> N QUEUE citations, exact 1:1, zero orphans -->

- adr/*.md files: 0 · LOG rows: 0 · QUEUE citations: 0 — 1:1, zero orphans.

## Built inventory (up to {{BUILD_CEILING}})

(none yet)

## Escalation-gated remainder
<!-- each: id / what / gate-class / where-marked. {{ESCALATION_GATES}} -->

(none yet)

## Recommended build / escalation sequence

1. Fill GOAL.md knobs; re-run bootstrap-lab.sh to substitute.
2. Run iteration 1: enumerate the work frontier.
EOF
}

gen_reorg_log() {
  cat <<'EOF'
# REORG LOG — one entry per reorganization
<!--
  Append one entry each time a reorg fires (every ~8-10 completed items, a dir
  exceeds ~25 entries, a fork resolves, a human asks, or STATE drifts). Each
  entry records: trigger, what was re-tiered/pruned, the integrity-sweep result
  (orphans found + fixed), and the re-confirmed <=3-hop promise.
-->

(no reorgs yet)
EOF
}

gen_runs() {
  cat <<'EOF'
# RUN LEDGER (.orchestrator/runs.md) — the crash-safety spine
<!--
  Three parts: (1) recent history table, (2) in-flight table, (3) newest-first
  narrative RECONCILED/LAUNCHED notes. DISCIPLINE: write the in-flight row
  BEFORE launching any background job (run-id filled after launch returns it);
  clear it ONLY on RECONCILE. This is what re-attaches results to items across a
  crash/compaction.
  Keep in-flight plus the most recent 50 closed rows/notes hot. At reorg rotate
  older closed material verbatim into indexed .orchestrator/history/ segments.
-->

## History
<!-- one row per launch/completion -->

| date | run-id | workflow | one-line purpose |
|------|--------|----------|------------------|
<!-- (no runs yet) -->

## In-flight
<!-- IN-FLIGHT-TABLE: machine-findable marker. Append a row BEFORE launch;
     clear ONLY on reconcile. -->

| run-id | item | what | launched | expected-output |
|--------|------|------|----------|-----------------|
<!-- (nothing in flight) -->

## Narrative notes (newest first)
<!--
  Dense, timestamped RECONCILED/LAUNCHED notes — the run's black box; survives
  compaction verbatim. Capture: what landed, the verdicts, what was launched,
  the NEXT plan, any course-correction.
  e.g.  <!~~ RECONCILED iterN: ... ~~>   <!~~ LAUNCHED iterN: ... ~~>
-->

(none yet)
EOF
}

gen_ctx() {
  cat <<'EOF'
# CTX — per-domain context the workflows read
<!--
  The workflows (enumerate / research / judge / fork / spike / finishing-audit)
  read THIS file for their domain framing. Knobs are substituted from GOAL.md by
  scripts/bootstrap-lab.sh. Keep it a faithful, substantive projection of the
  GOAL knob block — a thin CTX produces thin workflow output.
-->

## Domain

{{DOMAIN}}

## Mission

{{MISSION}}

## Locked constraints (design around — do not relitigate)

{{LOCKED_CONSTRAINTS}}

## Hard gates (no auto-accept; judge-panel + cross-family before final/promoted)

{{HARD_GATES}}

## Escalation gates (human / expert / panel / spike / apply / promotion)

{{ESCALATION_GATES}}

## Build ceiling (autonomous up to here; beyond is owed/escalated)

{{BUILD_CEILING}}

## Rubric (weighted; recomputed deterministically; weights sum to 1)

{{RUBRIC}}

## Work layers (enumerate / research / judge fan-out axes)

{{WORK_LAYERS}}

## Model + effort matrix (per agent() call; full policy in references/model-effort-policy.md)

{{MODEL_MATRIX}}

## Domain invariants (optional correctness core; fail-closed)

{{DOMAIN_INVARIANTS}}
EOF
}

gen_adr_template() {
  cat <<'EOF'
# <id> — <title>
<!--
  The per-item ADR — ONE FILE: adr/<id>.md. ONE decision per file. Immutable once
  accepted — to change, write a NEW ADR that Supersedes this one. Persisted
  VERBATIM from a delegated return where possible; the orchestrator only
  normalizes formatting. Cross-family reviews -> adr/_reviews/<id>-<family>.md;
  heavy option matrices / research -> adr/_meta/<id>-<name>.md.
-->

- **Status:** proposed | exploring | forked | decided | superseded
- **Reversibility:** one-way-door | costly | reversible
- **Gating-Impact:** which {{HARD_GATES}} / {{LOCKED_CONSTRAINTS}} this touches (or `none`)
- **Depends-on:** <ids> · **Blocks:** <ids> · **Fork:** <Fxxx or none>
- **Date:** <UTC>

## Question
<the single decision this ADR settles>

## Context & constraints
<framing; which {{LOCKED_CONSTRAINTS}} apply>

## Options (scored matrix)
| option | <rubric axis> | ... | weighted score |
|--------|---------------|-----|----------------|

## Adversarial review
<who tried to refute the leader, from which lenses; the cross-family verdict
(authoritative over any self-claim); link the persisted REVIEW-*.md>

## Decision
<the chosen option + the why>

## Rejected alternatives
<keep these — the why-not is audit evidence>

## Consequences
<what this commits us to; follow-on risk>

## Spawned follow-ups
<new work-units this surfaced (with ids)>

## Evidence links
<adr/_reviews/<id>-<family>.md, adr/_meta/<id>-<name>.md, source paths — the traceability spine>
EOF
}

gen_readme() {
  cat <<'EOF'
# {{DOMAIN}} — autonomous lab (single entry point)
<!--
  GENERIC, knob-driven. The ONE human entry point to this lab. It NEVER hardcodes
  a live status snapshot — read DASHBOARD.md for current state. Domain lines
  ({{DOMAIN}}/{{MISSION}}) are substituted by scripts/bootstrap-lab.sh.
-->

## What this lab is

A filesystem-memory "lab" where an orchestrator runs an open-ended, multi-agent
job to a traceable, human-gated finish.

> **Mission:** {{MISSION}}
> **Domain:** {{DOMAIN}}

The mission remains open until human STOP. A dry frontier creates a resumable
idle checkpoint instead of endless dispatch. See OPERATING_MANUAL.md.

## Status & what's waiting on you

- **Live status:** DASHBOARD.md (GENERATED — regenerate: `node tools/gen-dashboard.mjs`).
- **The gate:** GOAL.md `STATUS:` (RUN keeps it going; STOP is the only clean exit).
- **Human worklist:** items marked HUMAN-TIE-BREAK / *-GATED in DECISION_QUEUE.md.

## Read path (resume with zero prior context)

1. OPERATING_MANUAL.md — the 8-step loop + the five invariants.
2. GOAL.md — mission, locked constraints, STATUS gate, Active directives.
3. STATE.md — heartbeat: in-flight, next-up, blockers.
4. DECISION_QUEUE.md head — what is selectable next.
5. DASHBOARD.md — counts + lifecycle at a glance.

## How to verify (no trust — just check)

- Decided records are ONE FILE each: adr/<id>.md; reviews in adr/_reviews/,
  heavy matrices in adr/_meta/.
- Integrity canary: the ID-set diff DECISION_QUEUE.md <-> DECISION_LOG.md <-> adr/*.md.
- ADR immutability: `node tools/check-adr-immutability.mjs` (`--baseline` re-freezes).
- ADR -> code map: `node tools/gen-adr-code-index.mjs` writes ADR_CODE_INDEX.md.

## Run / resume / steer / stop

- **Run / resume (Claude):** open a session in this lab at high/ultracode effort and paste:
  > /loop — You are the orchestrator for the autonomous lab in this lab root.
  > Read OPERATING_MANUAL.md IN FULL first, then GOAL.md, then STATE.md, then
  > DECISION_QUEUE.md, and run one 8-step iteration; preserve the RUN mission
  > until human STOP, and pause on a dry frontier using the OPERATING_MANUAL
  > idle checkpoint. Before accepting PAUSED, run `python3
  > "${AGENTS_HOME:-$HOME/.agents}/skills/autonomous-lab/scripts/validate_idle_pause.py"
  > "STATE.md" --runs ".orchestrator/runs.md" --queue "DECISION_QUEUE.md"`; a
  > non-zero result means re-invoke one iteration and do not exit the driver.
- **Steer:** edit the `Active directives` block in GOAL.md.
- **Stop:** set `STATUS: STOP` in GOAL.md (GOAL + STATE + HANDOFF must agree on
  the terminal truth first).

## Guardrails

- Orchestrator PERSISTS, never authors durable reasoning.
- {{HARD_GATES}} items need a judge-panel pass AND a cross-family pass before
  they are final / promoted.
- Build only up to: {{BUILD_CEILING}}. Beyond it is owed / escalated.

## Nav map

- GOAL.md · OPERATING_MANUAL.md · STATE.md · DECISION_LOG.md · DECISION_QUEUE.md · HANDOFF.md · reorg-log.md
- adr/ (decided records) · adr/_reviews/ · adr/_meta/ (incl. ADR.template.md)
- forks/ · scaffolds/ · context/CTX.md · tools/ · workflows/ (patterns authored per-run) · .orchestrator/runs.md
- Generated (regenerable): DASHBOARD.md · ADR_CODE_INDEX.md · .decided-adr-manifest.json
EOF
}

# install each memory file (template-if-present, else default)
install_file "README.md"             "README.template.md"          gen_readme
install_file "GOAL.md"               "GOAL.template.md"            gen_goal
install_file "OPERATING_MANUAL.md"   "OPERATING_MANUAL.template.md" gen_operating_manual
install_file "STATE.md"              "STATE.template.md"           gen_state
install_file "DECISION_LOG.md"       "DECISION_LOG.template.md"    gen_decision_log
install_file "DECISION_QUEUE.md"     "DECISION_QUEUE.template.md"  gen_decision_queue
install_file "HANDOFF.md"            "HANDOFF.template.md"         gen_handoff
install_file "reorg-log.md"          "reorg-log.template.md"       gen_reorg_log
install_file ".orchestrator/runs.md" "runs.template.md"            gen_runs
install_file "context/CTX.md"        "CTX.template.md"             gen_ctx
install_file "adr/_meta/ADR.template.md" "ADR.template.md"         gen_adr_template

# Drop a one-line pointer README into the (intentionally empty) lab workflows/
# dir. Workflows are DOCUMENTED PATTERNS authored per-run, NOT shipped files —
# an empty workflows/ is expected and is NEVER warned about.
gen_workflows_readme() {
  cat <<'EOF'
# workflows/ — author each run's workflows here

This dir is intentionally empty. The 7 archetypes (enumerate-work,
explore-decision, explore-fork, judge-panel, deep-research, build-spike,
finishing-audit) are PATTERNS you author per-run against your host's
primitives — Workflow()/agent on a Claude Code operator, native subagent
waves on a Codex operator — see references/workflow-patterns.md and
references/codex-operator.md.
EOF
}
gen_workflows_readme | do_write "$LAB/workflows/README.md"

# --- seed the DOMAIN knob into the freshly-installed GOAL.md -----------------
# The GOAL.md may have come from a real skill template (which always ships
# DOMAIN = {{DOMAIN}}) OR from the built-in default. Either way, if a domain
# name was supplied on the CLI, seed it into the GOAL knob block now — but ONLY
# while it is still the placeholder (never clobber a value the human already
# filled). This is the one convenience the script offers on the human's file.
if [ -n "$DOMAIN_ARG" ] && [ -f "$LAB/GOAL.md" ] && [ "$DRY_RUN" != true ]; then
  # NOTE: use LITERAL braces {{ }} in the sed pattern, NOT \{\{ — BSD/macOS sed
  # reads \{ as an interval/repetition operator ("invalid repetition count").
  # Bare { } are literal in both BSD and GNU BRE here.
  if grep -qE '^[[:space:]]*DOMAIN[[:space:]]*=[[:space:]]*\{\{DOMAIN\}\}[[:space:]]*$' "$LAB/GOAL.md"; then
    esc_dom="$(printf '%s' "$DOMAIN_ARG" | sed -e 's/[&\\|]/\\&/g')"
    tmpg="$(mktemp 2>/dev/null || echo "/tmp/bootstrap-lab.goal.$$")"
    sed -e "s|^\([[:space:]]*DOMAIN[[:space:]]*=[[:space:]]*\){{DOMAIN}}[[:space:]]*\$|\1$esc_dom|" \
      "$LAB/GOAL.md" > "$tmpg" && cat "$tmpg" > "$LAB/GOAL.md" && rm -f "$tmpg"
    note "  seeded DOMAIN knob in GOAL.md = $DOMAIN_ARG"
  fi
fi

# ---------------------------------------------------------------------------
# [3/5] copy the skill's spine tools/ (*.mjs) into the lab tools/
# ---------------------------------------------------------------------------
# The spine scanners (gen-dashboard, check-adr-immutability, gen-adr-code-index)
# ship with the skill and are copied per-lab so they version with the lab.
# NOTE: no workflow files are copied — workflows are documented patterns the
# orchestrator authors per-run (references/workflow-patterns.md); an empty lab
# workflows/ is EXPECTED and is never warned about.
note ""
note "[3/5] spine tools (*.mjs copied from the skill)"
if [ -d "$SKILL_TOOLS_DIR" ]; then
  _tool_count=0
  for tool in "$SKILL_TOOLS_DIR"/*.mjs ; do
    [ -e "$tool" ] || continue            # empty-dir glob guard
    do_copy "$tool" "$LAB/tools/$(basename "$tool")"
    _tool_count=$((_tool_count + 1))
  done
  if [ "$_tool_count" -eq 0 ]; then
    note "  (skill tools/ has no *.mjs yet — none copied; DASHBOARD seeding skipped)"
  fi
else
  note "  (skill tools/ not found at $SKILL_TOOLS_DIR — none copied; DASHBOARD seeding skipped)"
fi

# ============================================================================
# PHASE B — SUBSTITUTE the CONFIG KNOBS from GOAL.md into the lab files
# ============================================================================
note ""
note "[4/5] substitute CONFIG KNOBS from GOAL.md"

# Targets that carry {{KNOBS}} and SHOULD be substituted. README.md is included
# (its {{DOMAIN}}/{{MISSION}} lines are filled here). GOAL.md is
# excluded — it is the knob SOURCE and the human's file; we never rewrite it. The
# ADR template (adr/_meta/ADR.template.md) is ALSO excluded on purpose: its
# {{HARD_GATES}}/{{LOCKED_CONSTRAINTS}} references are LIVE per-item guidance the
# orchestrator fills when authoring an ADR, not a one-time bootstrap substitution.
SUBST_TARGETS="README.md OPERATING_MANUAL.md context/CTX.md STATE.md DECISION_QUEUE.md HANDOFF.md"

GOAL_FILE="$LAB/GOAL.md"
KNOBS_FILLED=true

if [ ! -f "$GOAL_FILE" ] && [ "$DRY_RUN" = true ]; then
  note "  [dry-run] GOAL.md not on disk; skipping substitution preview."
elif [ ! -f "$GOAL_FILE" ]; then
  warn "GOAL.md missing — cannot substitute. (Unexpected after scaffold.)"
  KNOBS_FILLED=false
else
  # Parse the config-knobs fenced block: lines of the form  KEY = value
  # between the ```config-knobs fence and the closing ```.  Skip comment (#)
  # and blank lines. A value still equal to {{KEY}} (or containing {{ }}) means
  # the user has not filled it.
  #
  # We build a sed script of literal {{KEY}} -> value substitutions, then apply
  # it to each target. Done in awk to robustly slice the fenced block.

  KNOB_PAIRS="$(
    awk '
      /^```config-knobs[[:space:]]*$/ { inblk=1; next }
      /^```[[:space:]]*$/             { if (inblk) { inblk=0 } ; next }
      inblk {
        line=$0
        sub(/^[[:space:]]+/, "", line)
        if (line ~ /^#/ || line == "") next
        # split on the FIRST "="
        eq=index(line, "=")
        if (eq == 0) next
        key=substr(line, 1, eq-1)
        val=substr(line, eq+1)
        # trim key
        sub(/[[:space:]]+$/, "", key); sub(/^[[:space:]]+/, "", key)
        # trim leading space of value (keep internal)
        sub(/^[[:space:]]+/, "", val); sub(/[[:space:]]+$/, "", val)
        if (key == "") next
        printf "%s\t%s\n", key, val
      }
    ' "$GOAL_FILE"
  )"

  if [ -z "$KNOB_PAIRS" ]; then
    warn "no CONFIG KNOBS block found in GOAL.md (expected a \`\`\`config-knobs fence)."
    KNOBS_FILLED=false
  fi

  # Build a temp sed program of {{KEY}} -> value edits, and check fill state.
  SED_PROG="$(mktemp 2>/dev/null || echo "/tmp/bootstrap-lab.sed.$$")"
  : > "$SED_PROG"
  # newline-safety: we operate per-line; multi-line knob values collapse to one.
  printf '%s\n' "$KNOB_PAIRS" | while IFS="$(printf '\t')" read -r k v; do
    [ -n "$k" ] || continue
    # Is this knob still unfilled?  value empty, or value == {{KEY}}, or value
    # still contains a {{...}} placeholder.
    case "$v" in
      ""|"{{$k}}"|*"{{"*"}}"*) : ;;   # unfilled — do NOT emit a substitution
      *)
        # Escape sed-special chars in the replacement (& \ / and the delimiter |)
        esc_v="$(printf '%s' "$v" | sed -e 's/[&\\|]/\\&/g')"
        printf 's|{{%s}}|%s|g\n' "$k" "$esc_v" >> "$SED_PROG"
        ;;
    esac
  done

  # ---- built-in DEFAULTS for fixed-default knobs --------------------------
  # Some knobs have documented fixed defaults (SKILL.md "What is FIXED" + the
  # references) and are NOT carried in the GOAL config-knobs block. Templates
  # may still reference them, so substitute their defaults here — but ONLY if
  # the knob was not already given a filled value in the GOAL block (so a user
  # override always wins). KEY<TAB>DEFAULT, one per line.
  DEFAULT_KNOBS="$(cat <<'DEFS'
MEMORY_FILES	README.md (human entry), GOAL.md, DASHBOARD.md (GENERATED status), STATE.md, DECISION_LOG.md, DECISION_QUEUE.md, .orchestrator/runs.md, HANDOFF.md, reorg-log.md, adr/ (one file per decision), tools/ (spine scanners)
REPO_LAYOUT	adr/<id>.md (ONE file per decision) + adr/_reviews/<id>-<family>.md sidecars + adr/_meta/<id>-<name>.md for heavy matrices/research (flat is the DEFAULT; a sibling adr/<id>.research/ dir is the rare exception)
ID_SCHEME	stable sequential per-item IDs (<id>) + fork IDs (<Fxxx>); never reused
EXPERT_AUTHORITIES	the named domain sign-off authorities for the expert escalation class (fill per domain)
TRANSIENT_FAILURE_SIGNALS	overload/5xx, rate-limit, session-cap
WORKFLOW_RUNNER	Claude Code operator: Workflow() (resumeFromRunId + readable per-run journal). Codex operator: eligible GPT-5.6 Ultra/native multi-agent stage graph (explicit waves below Ultra) + run ledger as journal (references/codex-operator.md)
CROSS_FAMILY_VERIFIER	operator-relative other primary and bonus families through Agent Fabric under orchestrate; direct CLIs are explicit degraded preflight/fallback only. Apply the HARNESS.md risk ladder; REVIEW_TIMEOUT 600s
RUBRIC	Correctness/fit, Risk, Reversibility, Cost, Operability, Build-leverage, Mission-centricity, Evidence-quality (weighted, weights sum to 1; recomputed deterministically)
WORK_LAYERS	the problem-space slices the enumerate/research/judge workflows fan out across (decompose per domain: subsystems / data-model / external-interfaces / risk-surface / operability); overridable per workflow via args
RUNAWAY_CAPS	max-concurrent-jobs 4, max-active-forks 3, fork-depth 2, per-unit-budget 3 runs before escalation, bounded-retry 2, long-wake 3600s (ceilings, not targets)
MODEL_MATRIX	Resolve durable aliases to concrete runtime models and record the mapping. flagship: design, contracts, synthesis, adjudication and every judge (high; xhigh on hard gates; max for one terminal synthesis; eligible GPT-5.6 Codex lead uses Ultra for proactive delegation). workhorse: bounded research, contract-driven implementation and substantive drafts (medium-high). scout: schema-forced inventory, extraction, persist and format (low-medium), never production behaviour or judgement. Apply the HARNESS.md native plus other-primary gate and opportunistic bonus-family lanes to hard gates and finish verification. Full policy: references/model-effort-policy.md
DOMAIN_INVARIANTS	none (optional correctness core; fill only if the domain has a checkable correctness core)
LONG_WAKE_SECONDS	3600
MAX_RETRY_ATTEMPTS	2
MAX_CONCURRENT_JOBS	4
STOP_CONDITION	GOAL.md STATUS == STOP
SALVAGE_DIR	.orchestrator/salvage/
PROCESS_CHECK	an OS-level PID/process liveness check, independent of the task manager
WAKE_SCHEDULER	the host self-pacing scheduler (completion-notify primary + a long fallback wake)
EXTERNAL_FAMILIES	operator-relative other-primary and distinct model families via Agent Fabric; adapter identity never proves model lineage
REVIEW_TIMEOUT	600
DEFS
)"
  printf '%s\n' "$DEFAULT_KNOBS" | while IFS="$(printf '\t')" read -r dk dv; do
    [ -n "$dk" ] || continue
    # skip if the GOAL block already supplied a FILLED value for this key
    gv="$(printf '%s\n' "$KNOB_PAIRS" | awk -F'\t' -v k="$dk" '$1==k{print $2; exit}')"
    case "$gv" in
      ""|"{{$dk}}"|*"{{"*"}}"*) : ;;       # not filled in GOAL -> use default
      *) continue ;;                        # GOAL override wins; skip default
    esac
    esc_dv="$(printf '%s' "$dv" | sed -e 's/[&\\|]/\\&/g')"
    printf 's|{{%s}}|%s|g\n' "$dk" "$esc_dv" >> "$SED_PROG"
  done

  # Determine if ANY required knob is unfilled (report on stderr, do not abort).
  REQUIRED="DOMAIN MISSION LOCKED_CONSTRAINTS HARD_GATES ESCALATION_GATES BUILD_CEILING"
  UNFILLED_REQUIRED=""
  for rk in $REQUIRED; do
    rv="$(printf '%s\n' "$KNOB_PAIRS" | awk -F'\t' -v k="$rk" '$1==k{print $2; exit}')"
    case "$rv" in
      ""|"{{$rk}}"|*"{{"*"}}"*) UNFILLED_REQUIRED="$UNFILLED_REQUIRED $rk"; KNOBS_FILLED=false ;;
    esac
  done

  if [ -n "$UNFILLED_REQUIRED" ]; then
    warn "required CONFIG KNOBS not yet filled in GOAL.md:$UNFILLED_REQUIRED"
  fi

  # Apply the substitution to each target IN PLACE (only if there is anything to
  # substitute and not a dry-run).
  if [ -s "$SED_PROG" ]; then
    for t in $SUBST_TARGETS; do
      tf="$LAB/$t"
      [ -f "$tf" ] || continue
      if [ "$DRY_RUN" = true ]; then
        _n="$(sed -n -f "$SED_PROG" "$tf" 2>/dev/null | grep -c . || true)"
        note "  [dry-run] would substitute knobs in $t"
      else
        tmp="$(mktemp 2>/dev/null || echo "/tmp/bootstrap-lab.$$.$(basename "$t")")"
        sed -f "$SED_PROG" "$tf" > "$tmp" && cat "$tmp" > "$tf" && rm -f "$tmp"
        note "  substituted knobs in $t"
      fi
    done
  else
    note "  (no filled knobs to substitute yet)"
  fi
  rm -f "$SED_PROG"
fi

# ============================================================================
# [5/5] seed DASHBOARD.md by running the spine dashboard tool (regenerable)
# ============================================================================
# DASHBOARD.md is GENERATED — running the tool each bootstrap re-seeds it (it is
# idempotent + safe to overwrite). ADR_CODE_INDEX.md and .decided-adr-manifest.json
# are likewise generated on first run of their tools (check-adr-immutability.mjs
# --baseline / gen-adr-code-index.mjs); they are not seeded here.
note ""
note "[5/5] seed DASHBOARD.md (GENERATED status board)"
if [ "$DRY_RUN" = true ]; then
  note "  [dry-run] would run: (cd $LAB && node tools/gen-dashboard.mjs)"
elif [ ! -f "$LAB/tools/gen-dashboard.mjs" ]; then
  note "  tools/gen-dashboard.mjs not present — skipping (no spine tools copied)."
elif command -v node >/dev/null 2>&1; then
  if ( cd "$LAB" && node tools/gen-dashboard.mjs ) >/dev/null 2>&1; then
    note "  seeded DASHBOARD.md via tools/gen-dashboard.mjs"
  else
    warn "tools/gen-dashboard.mjs failed; seed it manually:"
    warn "     (cd $LAB && node tools/gen-dashboard.mjs)"
  fi
else
  note "  node not found — seed the board later with:"
  note "     (cd $LAB && node tools/gen-dashboard.mjs)"
fi

# ---- placeholder canary: report any {{...}} still left behind ---------------
note ""
note "Scanning for unsubstituted {{...}} placeholders in lab files..."
LEFTOVER_FILE="$(mktemp 2>/dev/null || echo "/tmp/bootstrap-lab.leftover.$$")"
: > "$LEFTOVER_FILE"
# Scan substitution targets + CTX/manual; intentionally SKIP GOAL.md (its knob
# block legitimately holds {{KEY}} hints) and the ADR template (its {{HARD_GATES}}
# reference is a deliberate live knob the orchestrator fills per-item).
SCAN_TARGETS="README.md OPERATING_MANUAL.md context/CTX.md STATE.md DECISION_QUEUE.md HANDOFF.md DECISION_LOG.md reorg-log.md .orchestrator/runs.md"
for t in $SCAN_TARGETS; do
  tf="$LAB/$t"
  [ -f "$tf" ] || continue
  # grep for {{...}} occurrences; record file:placeholder pairs.
  grep -oE '\{\{[A-Za-z0-9_]+\}\}' "$tf" 2>/dev/null | sort -u | while read -r ph; do
    printf '%s\t%s\n' "$t" "$ph" >> "$LEFTOVER_FILE"
  done || true
done

LEFTOVER_COUNT=0
if [ -s "$LEFTOVER_FILE" ]; then
  LEFTOVER_COUNT="$(wc -l < "$LEFTOVER_FILE" | tr -d ' ')"
fi

# ---- environment warnings (never fatal) ------------------------------------
note ""
note "Environment checks (warnings only — a lab without these still works):"

# Owning Git repo is a prerequisite; human authority is still separate.
if command -v git >/dev/null 2>&1 && git -C "$LAB" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  note "  ok   git repo detected (authorised worktree spikes use primary-root/.worktrees via scripts/worktree)."
else
  warn "no git repo at lab root: worktree isolation for build spikes is OFF."
  warn "     A Git repo plus direct human authority is required for linked-checkout spikes."
fi

# Operator-substrate detection — heuristic; we cannot run it, only hint.
# Claude Code = Workflow()/loop/Stop hook substrate. Codex = Ultra/native
# multi-agent stage graph (explicit waves below Ultra) plus an external loop
# driver (references/codex-operator.md).
HAVE_CLAUDE=false; HAVE_CODEX=false
command -v claude >/dev/null 2>&1 && HAVE_CLAUDE=true
command -v codex  >/dev/null 2>&1 && HAVE_CODEX=true
if [ "$HAVE_CLAUDE" = true ]; then
  note "  ok   claude CLI detected — reference operator (Workflow()/loop/Stop hook)."
fi
if [ "$HAVE_CODEX" = true ]; then
  note "  ok   codex CLI detected — Ultra/native multi-agent stage graph (explicit"
  note "       waves below Ultra) + external loop driver; Claude JS is not portable."
fi
if [ "$HAVE_CLAUDE" = false ] && [ "$HAVE_CODEX" = false ]; then
  warn "no operator CLI detected (claude or codex)."
  warn "     Claude Code uses Workflow()/resume; Codex uses Ultra/native multi-agent"
  warn "     or explicit waves + loop driver (references/codex-operator.md)."
  warn "     Manual/agent dispatch still works without either."
fi

# Provider workers use Agent Fabric. The live status/doctor commands are the
# operational preflight; provider binaries alone never prove an available route.
note "  info external model-family dispatch uses Agent Fabric under orchestrate."

# ============================================================================
# RECEIPT + exit code
# ============================================================================
note ""
note "=============================================================="
note "  RECEIPT"
note "=============================================================="
note "  lab root:        $LAB"
note "  memory tree:     adr/ adr/_reviews/ adr/_meta/ forks/ scaffolds/ context/ tools/ .orchestrator/ workflows/ (created-empty; authored per-run)"
note "  memory files:    README.md GOAL OPERATING_MANUAL STATE DECISION_LOG DECISION_QUEUE HANDOFF reorg-log CTX runs + adr/_meta/ADR.template.md"
note "  human entry:     README.md  (single entry point; -> DASHBOARD.md for live state)"
note "  spine tools:     tools/*.mjs (gen-dashboard · check-adr-immutability · gen-adr-code-index)"
note "  generated:       DASHBOARD.md · ADR_CODE_INDEX.md · .decided-adr-manifest.json  (REGENERABLE — gitignore candidates)"
note "  workflows:       authored per-run from references/workflow-patterns.md (none shipped; empty lab workflows/ is expected)"
note "  knob source:     $LAB/GOAL.md  (the ONLY file you edit)"

if [ "$DRY_RUN" = true ]; then
  note "  mode:            DRY-RUN — nothing was changed."
  note "=============================================================="
  rm -f "$LEFTOVER_FILE"
  exit 0
fi

if [ "$KNOBS_FILLED" != true ]; then
  note ""
  note "  STATUS: SCAFFOLDED — CONFIG KNOBS not filled yet."
  note "  NEXT:"
  note "    1) Open  $LAB/GOAL.md  and fill the \`\`\`config-knobs block:"
  note "       {{MISSION}}, {{LOCKED_CONSTRAINTS}}, {{HARD_GATES}},"
  note "       {{ESCALATION_GATES}}, {{BUILD_CEILING}}  (DOMAIN may be pre-seeded)."
  note "    2) Re-run:  $PROG $LAB"
  note "       -> it substitutes the knobs everywhere + reports any left behind."
  note "=============================================================="
  rm -f "$LEFTOVER_FILE"
  exit 3
fi

if [ "$LEFTOVER_COUNT" -gt 0 ]; then
  err ""
  err "UNSUBSTITUTED placeholders remain ($LEFTOVER_COUNT) — a knob was missed or mistyped:"
  # print file\tplaceholder, sorted unique
  sort -u "$LEFTOVER_FILE" | while IFS="$(printf '\t')" read -r f p; do
    err "    $p   in   $f"
  done
  err "Fix the CONFIG KNOBS block in GOAL.md (ensure every {{KEY}} above has a"
  err "matching KEY = <value> line, value not still {{KEY}}), then re-run."
  rm -f "$LEFTOVER_FILE"
  exit 4
fi

note ""
note "  STATUS: READY — knobs substituted, no placeholders remain."
note "  NEXT:"
note "    1) Read  $LAB/README.md  (the single human entry point; live state in"
note "       DASHBOARD.md)."
if [ "$HAVE_CLAUDE" = true ]; then
  note "       Claude path: wire the Stop hook and use the README /loop prompt."
fi
if [ "$HAVE_CODEX" = true ]; then
  note "       Codex path: start the external STOP driver; use Ultra/native waves"
  note "       on an eligible GPT-5.6 lead, or explicit waves below Ultra."
fi
if [ "$HAVE_CLAUDE" = false ] && [ "$HAVE_CODEX" = false ]; then
  note "       No operator detected: follow README.md's manual substrate path."
fi
note "    2) Launch one detected operator using README.md's substrate prompt."
note "    3) Steer via GOAL.md 'Active directives'; stop via STATUS: STOP."
note "=============================================================="
rm -f "$LEFTOVER_FILE"
exit 0
