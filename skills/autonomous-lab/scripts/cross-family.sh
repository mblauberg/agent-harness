#!/bin/sh
# cross-family.sh — DUAL external cross-family review wrapper (POSIX sh)
# ============================================================================
# Layer 4 of the autonomous-lab discipline. See:
#   references/cross-family-review.md
# This script is DOMAIN-AGNOSTIC. It carries no knowledge of any specific
# mission, constraint, or gate. The caller supplies the review prompt
# (already parameterized over its own {{DOMAIN}}/{{MISSION}}/etc.) and this
# script routes it to model families OUTSIDE the orchestrator's own provider,
# captures each family's RAW verdict verbatim to a timestamped file, and
# prints the paths.
#
# WHY A DIFFERENT FAMILY (two load-bearing payoffs):
#   1. Genuine independence. A reviewer from a different training lineage fails
#      differently and is not anchored by the author's blind spots. A
#      same-family self-review systematically OVER-PASSES.
#   2. 529 / provider-failure immunity. These CLIs hit OpenAI's and Google's
#      endpoints, NOT the orchestrator's own (Anthropic) API, so cross-family
#      verification keeps working when the orchestrator's provider is
#      overloaded (HTTP 529 / rate-limit / session-cap). That is the whole
#      point of routing OUTSIDE your own provider rather than spawning another
#      same-family agent.
#
# ----------------------------------------------------------------------------
# THE NON-NEGOTIABLE RULE: NEVER TRUST A BUILD-AGENT'S SELF-REPORTED VERDICT.
# ----------------------------------------------------------------------------
# A build/worker agent that runs the external reviewer ITSELF will sometimes
# overclaim ("codex VERDICT: FAIL -> PASS"). The AUTHORITATIVE verdict is the
# RAW reviewer stdout this script writes to disk, captured in a SEPARATE
# orchestrator-controlled step — NOT the build agent's prose summary of it.
# Enforce the independence boundary: the agent that builds an artifact must
# never be the agent that reports its external verdict. The orchestrator reads
# the file this script writes, not the build report. If the build report says
# "codex passed" and the captured stdout says FAIL, FAIL is the truth.
#
# A FAIL verdict is the signal WORKING, not a halt. Persist it verbatim
# (this script does that), fold its defects into the next targeted fix, and
# re-verify. Halt only at the genuine endpoint, never on a FAIL.
#
# ----------------------------------------------------------------------------
# COMPOSITION: this script does NOT re-document the Gemini CLI. The agy
# invocation is owned by the dedicated agy-headless scout skill. Its
# run-agy-headless wrapper is resolved dynamically (first match wins): the
# $AGY_WRAPPER env override, then skill-relative
# (<dir-of-this-script>/../../agy-headless/scripts/run-agy-headless), then
# $HOME/.agents/skills/ and $HOME/.claude/skills/ under
# agy-headless/scripts/run-agy-headless, then run-agy-headless on PATH. We
# shell out to that wrapper when present and fall back to a direct `agy` call
# otherwise. Inherit its quirks: an unknown --model slug SILENTLY falls back
# to Gemini Flash (confirm which model answered); --sandbox is read-only
# INTENT, not a certified no-write proof; agy returns prose, not JSON.
#
# INSTALL: chmod +x scripts/cross-family.sh   (so it is directly executable)
# ============================================================================

set -eu

PROG="cross-family.sh"

# ---- defaults (config knobs) -----------------------------------------------
# {{REVIEW_TIMEOUT}}: external reviewers are SLOW and AGENTIC — they explore the
# working dir and run tools. Budget generously. Default ~600s. Overridable via
# --timeout or the CROSS_FAMILY_TIMEOUT env var.
DEFAULT_TIMEOUT_SECONDS=600
TARGET_DIR=""
PROMPT=""
PROMPT_FILE=""
MODELS="codex"          # codex | gemini | claude | both
# Operator family: the ORCHESTRATOR'S OWN provider. Same-family routes fail
# closed (a same-family "cross-check" is a self-review and cannot certify).
# No default: equal-primary operation requires the caller to identify the lead.
OPERATOR_FAMILY="${CROSS_FAMILY_OPERATOR_FAMILY:-}"
CLAUDE_MODEL="${CROSS_FAMILY_CLAUDE_MODEL:-}"   # optional --model for the claude route
TIMEOUT_SECONDS="${CROSS_FAMILY_TIMEOUT:-$DEFAULT_TIMEOUT_SECONDS}"
OUT_DIR=""
GEMINI_MODEL="${CROSS_FAMILY_GEMINI_MODEL:-}"   # optional; unknown slug falls back to Flash
LABEL="review"          # used in output filenames

# ---- resolve the agy-headless wrapper (PORTABILITY) ------------------------
# Resolve the run-agy-headless wrapper DYNAMICALLY, FIRST MATCH WINS, so this
# script works across machines / users / install layouts. Order:
#   1) $AGY_WRAPPER env var, if set AND executable (explicit override);
#   2) skill-relative: <dir-of-this-script>/../../agy-headless/scripts/run-agy-headless;
#   3) $HOME/.agents/skills/agy-headless/scripts/run-agy-headless;
#   4) $HOME/.claude/skills/agy-headless/scripts/run-agy-headless;
#   5) run-agy-headless found on PATH (command -v);
#   else leave EMPTY -> run_gemini() falls back to a direct `agy` call.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HARNESS_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CF_DISPATCH="$SCRIPT_DIR/../../orchestrate/scripts/cf_dispatch.sh"
MODEL_ROUTE="${AGENTS_HOME:-$HARNESS_ROOT}/scripts/model-route"
_agy_env="${AGY_WRAPPER:-}"
AGY_WRAPPER=""
for _cand in \
  "$_agy_env" \
  "$SCRIPT_DIR/../../agy-headless/scripts/run-agy-headless" \
  "$HOME/.agents/skills/agy-headless/scripts/run-agy-headless" \
  "$HOME/.claude/skills/agy-headless/scripts/run-agy-headless"; do
  if [ -n "$_cand" ] && [ -x "$_cand" ]; then
    AGY_WRAPPER="$_cand"
    break
  fi
done
if [ -z "$AGY_WRAPPER" ]; then
  AGY_WRAPPER="$(command -v run-agy-headless 2>/dev/null || true)"
fi
unset _agy_env _cand

# ---- usage -----------------------------------------------------------------
usage() {
  cat <<EOF
$PROG — DUAL external cross-family review (route verification OUTSIDE the
orchestrator's own provider; capture each family's RAW verdict verbatim).

USAGE:
  $PROG --dir <target-dir> (--prompt "<text>" | --prompt-file <path>)
        [--models codex|gemini|claude|both] [--timeout <seconds>]
        [--operator-family anthropic|openai]
        [--out-dir <dir>] [--label <slug>] [--gemini-model <slug>]
        [--claude-model <slug>]

REQUIRED:
  --dir DIR            Target directory the reviewer should inspect (the
                       artifact / corpus / scaffold under review).
  --prompt TEXT        The review prompt. Mutually exclusive with --prompt-file.
  --prompt-file PATH   Read the review prompt from a file. Use this for long,
                       parameterized prompts (the recommended path).

OPTIONS:
  --models WHICH       Which external family(ies) to run (default: codex):
                         codex   — OpenAI family (default single reviewer under
                                   a non-OpenAI operator; strong at re-running
                                   tests/gates, adversarial correctness,
                                   mutation / non-vacuity checks).
                         gemini  — Google family via the agy-headless wrapper
                                   (very-large-context whole-corpus reads).
                         claude  — Anthropic family via claude -p in plan mode
                                   (enforced no-write; the default single
                                   reviewer under a Codex/OpenAI operator).
                         both    — run the TWO families outside the operator's
                                   own, concurrently (terminal / one-way-door /
                                   finish-readiness gates; the caller RECONCILES
                                   the evidence; bonus-family output is advisory).
  --operator-family F  REQUIRED. The orchestrator's own provider: anthropic |
                       openai | google. Same-family routes FAIL CLOSED (a
                       self-review cannot certify), and 'both' resolves to the
                       two families != F. A Codex operator must pass
                       --operator-family openai. Env: CROSS_FAMILY_OPERATOR_FAMILY.
  --timeout SECONDS    Per-reviewer timeout (default: $DEFAULT_TIMEOUT_SECONDS).
                       Env: CROSS_FAMILY_TIMEOUT.
  --out-dir DIR        Where to write the timestamped review files
                       (default: <target-dir>/.cross-family-reviews).
  --label SLUG         Short slug embedded in output filenames (default: review).
  --gemini-model SLUG  Pass an explicit agy --model. NOTE: an unknown slug
                       silently falls back to Gemini Flash — confirm which
                       model actually answered. Env: CROSS_FAMILY_GEMINI_MODEL.
  --claude-model SLUG  Pass an explicit claude --model for the claude route.
                       Env: CROSS_FAMILY_CLAUDE_MODEL.
  -h, --help           Show this help.

OUTPUT:
  Writes one file per reviewer:
    <out-dir>/REVIEW-<UTC-timestamp>-<label>-<family>.md
  Each file holds a metadata header plus the reviewer's RAW stdout, captured
  verbatim (anti-poison: never paraphrased). Prints each path to stdout on its
  own line, prefixed "REVIEW_FILE: ".

EXIT CODES:
   0  all requested reviewers ran and produced output.
   2  usage / argument error.
   3  cross-family UNAVAILABLE — a required CLI is missing or unauthenticated.
      (Fail loud: the run should degrade to crossFamily:false / same-family
      adversarial panels rather than silently skip the gate.)
   4  a reviewer ran but failed / timed out (its file still holds whatever was
      captured; treat as no usable verdict from that family).

REMEMBER: the file this script writes is the authoritative verdict. Do NOT
trust a build agent's prose summary of an external review.
EOF
}

err()  { printf '%s: %s\n' "$PROG" "$*" >&2; }
die()  { err "$*"; exit 2; }

# ---- arg parsing -----------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --dir)          [ $# -ge 2 ] || die "missing value for --dir";          TARGET_DIR="$2"; shift 2 ;;
    --prompt)       [ $# -ge 2 ] || die "missing value for --prompt";       PROMPT="$2"; shift 2 ;;
    --prompt-file)  [ $# -ge 2 ] || die "missing value for --prompt-file";  PROMPT_FILE="$2"; shift 2 ;;
    --models)       [ $# -ge 2 ] || die "missing value for --models";       MODELS="$2"; shift 2 ;;
    --timeout)      [ $# -ge 2 ] || die "missing value for --timeout";      TIMEOUT_SECONDS="$2"; shift 2 ;;
    --out-dir)      [ $# -ge 2 ] || die "missing value for --out-dir";      OUT_DIR="$2"; shift 2 ;;
    --label)        [ $# -ge 2 ] || die "missing value for --label";        LABEL="$2"; shift 2 ;;
    --gemini-model) [ $# -ge 2 ] || die "missing value for --gemini-model"; GEMINI_MODEL="$2"; shift 2 ;;
    --claude-model) [ $# -ge 2 ] || die "missing value for --claude-model"; CLAUDE_MODEL="$2"; shift 2 ;;
    --operator-family) [ $# -ge 2 ] || die "missing value for --operator-family"; OPERATOR_FAMILY="$2"; shift 2 ;;
    -h|--help)      usage; exit 0 ;;
    --)             shift; break ;;
    -*)             die "unknown option: $1 (try --help)" ;;
    *)              die "unexpected argument: $1 (try --help)" ;;
  esac
done

# ---- validation ------------------------------------------------------------
[ -n "$TARGET_DIR" ] || die "--dir is required (try --help)"
[ -d "$TARGET_DIR" ] || die "--dir is not a directory: $TARGET_DIR"

if [ -n "$PROMPT" ] && [ -n "$PROMPT_FILE" ]; then
  die "use exactly one of --prompt or --prompt-file"
fi
if [ -z "$PROMPT" ] && [ -z "$PROMPT_FILE" ]; then
  die "a review prompt is required via --prompt or --prompt-file (try --help)"
fi
if [ -n "$PROMPT_FILE" ]; then
  [ -f "$PROMPT_FILE" ] || die "--prompt-file not found: $PROMPT_FILE"
  PROMPT="$(cat "$PROMPT_FILE")"
fi
[ -n "${PROMPT#"${PROMPT%%[![:space:]]*}"}" ] || die "review prompt is empty"

case "$MODELS" in
  codex|gemini|claude|both) : ;;
  *) die "--models must be one of: codex | gemini | claude | both (got: $MODELS)" ;;
esac

# Normalize + validate the operator family; map reviewer -> provider family.
[ -n "$OPERATOR_FAMILY" ] || die "--operator-family is required (or set CROSS_FAMILY_OPERATOR_FAMILY)"
case "$OPERATOR_FAMILY" in
  anthropic|claude)  OPERATOR_FAMILY=anthropic ;;
  openai|codex)      OPERATOR_FAMILY=openai ;;
  *) die "--operator-family must be one of: anthropic | openai (got: $OPERATOR_FAMILY)" ;;
esac
family_of() {
  case "$1" in
    codex) echo openai ;;
    gemini) echo google ;;
    claude) echo anthropic ;;
  esac
}

# Resolve 'both' operator-relatively: the other primary plus Gemini as a
# non-load-bearing bonus lane.
if [ "$MODELS" = both ]; then
  case "$OPERATOR_FAMILY" in
    anthropic) BOTH_PRIMARY=codex ;;
    openai)    BOTH_PRIMARY=claude ;;
  esac
  BOTH_BONUS=gemini
else
  # Same-family routes FAIL CLOSED: a self-review cannot certify a gate.
  if [ "$(family_of "$MODELS")" = "$OPERATOR_FAMILY" ]; then
    err "SAME-FAMILY ROUTE REFUSED: --models $MODELS is the operator's own family ($OPERATOR_FAMILY)."
    err "A same-family review is a self-review and cannot certify. Pick a different"
    err "family, or pass the correct --operator-family if the operator is not $OPERATOR_FAMILY."
    exit 2
  fi
fi

case "$TIMEOUT_SECONDS" in
  ''|*[!0-9]*) die "--timeout must be a positive integer (seconds), got: $TIMEOUT_SECONDS" ;;
  *) [ "$TIMEOUT_SECONDS" -gt 0 ] || die "--timeout must be > 0" ;;
esac

# Resolve target dir to an absolute path (reviewers cd into it / are scoped to it).
TARGET_DIR_ABS="$(cd "$TARGET_DIR" 2>/dev/null && pwd)" || die "cannot resolve --dir: $TARGET_DIR"

# Default output dir lives under the target so reviews live beside what they review.
[ -n "$OUT_DIR" ] || OUT_DIR="$TARGET_DIR_ABS/.cross-family-reviews"
mkdir -p "$OUT_DIR" || die "cannot create --out-dir: $OUT_DIR"
OUT_DIR_ABS="$(cd "$OUT_DIR" && pwd)"

# Sanitize the label for filenames (alnum, dash, underscore only).
SAFE_LABEL="$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9_-' '-' | sed 's/--*/-/g; s/^-//; s/-$//')"
[ -n "$SAFE_LABEL" ] || SAFE_LABEL="review"

TS="$(date -u +%Y%m%dT%H%M%SZ)"

# ---- preflight: fail loud if a required CLI is missing ---------------------
# Per references/cross-family-review.md: this script MUST fail loud (exit 3) if
# a required CLI is missing/unauthenticated so the orchestrator degrades to
# same-family adversarial panels rather than silently skipping the gate.
need_codex=false
need_gemini=false
need_claude=false
bonus_available=true
bonus_skip_reason=""
case "$MODELS" in
  codex)  need_codex=true ;;
  gemini) need_gemini=true ;;
  claude) need_claude=true ;;
  both)
    case "$BOTH_PRIMARY" in
      codex) need_codex=true ;;
      claude) need_claude=true ;;
    esac
    if [ -z "$GEMINI_MODEL" ]; then
      bonus_available=false
      bonus_skip_reason="no exact Gemini model was supplied"
    elif ! command -v agy >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/agy" ]; then
      bonus_available=false
      bonus_skip_reason="agy CLI is unavailable"
    fi
    ;;
esac

if [ "$need_codex" = true ] && ! command -v codex >/dev/null 2>&1; then
  err "cross-family unavailable: 'codex' CLI not found in PATH."
  err "Install/authenticate the OpenAI Codex CLI, or set crossFamily:false to"
  err "degrade to same-family adversarial review for this gate."
  exit 3
fi

if [ "$need_gemini" = true ]; then
  [ -n "$GEMINI_MODEL" ] || die "--gemini-model is required for a Gemini route; resolve an exact model from 'agy models'"
  if ! command -v agy >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/agy" ]; then
    err "cross-family unavailable: 'agy' (Antigravity/Gemini) CLI not found."
    err "See the agy-headless skill, or set crossFamily:false to degrade to"
    err "same-family adversarial review for this gate."
    exit 3
  fi
fi

if [ "$need_claude" = true ] && ! command -v claude >/dev/null 2>&1; then
  err "cross-family unavailable: 'claude' CLI not found in PATH."
  err "Install/authenticate Claude Code, or set crossFamily:false to degrade to"
  err "same-family adversarial review for this gate."
  exit 3
fi

# ---- header writer ---------------------------------------------------------
# Writes a metadata header, then the reviewer's RAW stdout follows verbatim.
write_header() {
  # $1 = output file, $2 = family, $3 = invocation string
  {
    printf '# Cross-family review — %s\n\n' "$2"
    printf -- '- captured_utc: %s\n' "$TS"
    printf -- '- family: %s\n' "$2"
    printf -- '- target_dir: %s\n' "$TARGET_DIR_ABS"
    printf -- '- label: %s\n' "$SAFE_LABEL"
    printf -- '- timeout_seconds: %s\n' "$TIMEOUT_SECONDS"
    printf -- '- invocation: %s\n\n' "$3"
    printf '> AUTHORITATIVE VERDICT. This is the reviewer'\''s RAW stdout, captured\n'
    printf '> verbatim by cross-family.sh. Do NOT trust any build-agent prose\n'
    printf '> summary of it. A FAIL here is the signal working — fold its defects\n'
    printf '> into the next targeted fix; do not halt on it.\n\n'
  } > "$1"
}

begin_raw() {
  printf -- '--- BEGIN RAW REVIEWER OUTPUT ---\n\n' >> "$1"
}

# ---- timeout helper --------------------------------------------------------
# Prefer GNU/coreutils `timeout`; fall back to `gtimeout` (homebrew). If neither
# exists, run without an external watchdog and rely on each CLI's own timeout.
run_with_timeout() {
  # $1 = seconds; rest = command
  secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "${secs}s" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "${secs}s" "$@"
  else
    "$@"
  fi
}

OVERALL_RC=0
RAN_ANY=false

# ---- codex (OpenAI family) -------------------------------------------------
run_codex() {
  out_file="$OUT_DIR_ABS/REVIEW-$TS-$SAFE_LABEL-codex.md"
  route_file="$OUT_DIR_ABS/REVIEW-$TS-$SAFE_LABEL-codex.route.json"
  raw_file="$(mktemp "$OUT_DIR_ABS/.codex-raw.XXXXXX")"
  invocation="cf_dispatch.sh --tool codex --role other-primary --orchestrator-family $OPERATOR_FAMILY"
  write_header "$out_file" "codex (OpenAI)" "$invocation"
  err "running codex (timeout ${TIMEOUT_SECONDS}s) -> $out_file"

  rc=0
  route_record="$(cd "$TARGET_DIR_ABS" && run_with_timeout "$TIMEOUT_SECONDS" \
    "$CF_DISPATCH" --tool codex --role other-primary \
    --orchestrator-family "$OPERATOR_FAMILY" --out "$raw_file" --prompt "$PROMPT")" || rc=$?
  printf '%s\n' "$route_record" > "$route_file"
  route_status="$(printf '%s' "$route_record" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status", ""))' 2>/dev/null || true)"
  [ "$route_status" = "empty_output" ] && err "WARNING: codex returned empty output; treating it as no usable verdict."
  printf -- '- route_receipt: %s\n\n' "$route_file" >> "$out_file"
  begin_raw "$out_file"
  [ -f "$raw_file" ] && cat "$raw_file" >> "$out_file"
  rm -f "$raw_file"

  finish_review "$out_file" "$rc" "codex"
}

# ---- gemini / Antigravity (Google family) ----------------------------------
# COMPOSE with the agy-headless wrapper rather than re-documenting agy's flags.
# The wrapper's default sandbox is best-effort read-only intent; --include-dir
# maps to agy --add-dir without granting edit authority. If the wrapper is
# absent, use the same sandboxed direct invocation. Gemini remains advisory,
# never a certified no-write reviewer.
run_gemini() {
  out_file="$OUT_DIR_ABS/REVIEW-$TS-$SAFE_LABEL-gemini.md"
  route_file="$OUT_DIR_ABS/REVIEW-$TS-$SAFE_LABEL-gemini.route.json"
  route_rc=0
  "$MODEL_ROUTE" resolve --adapter agy --model "$GEMINI_MODEL" --alias flagship \
    --role bonus-review --lead-family "$OPERATOR_FAMILY" --require-distinct \
    --adapter-gate direct-cli \
    > "$route_file" 2>/dev/null || route_rc=$?
  if [ "$route_rc" -ne 0 ]; then
    write_header "$out_file" "gemini / Antigravity (unresolved)" "route resolution failed"
    printf -- '- route_receipt: %s\n' "$route_file" >> "$out_file"
    begin_raw "$out_file"
    printf '%s\n' 'Model route could not prove a distinct Gemini-family lineage.' >> "$out_file"
    finish_review "$out_file" 4 "gemini"
    return 4
  fi

  if [ -x "$AGY_WRAPPER" ]; then
    invocation="$AGY_WRAPPER --include-dir $TARGET_DIR_ABS --timeout ${TIMEOUT_SECONDS}s -p \"<prompt>\""
    [ -n "$GEMINI_MODEL" ] && invocation="$invocation --model $GEMINI_MODEL"
    write_header "$out_file" "gemini / Antigravity (Google)" "$invocation"
    printf -- '- route_receipt: %s\n\n' "$route_file" >> "$out_file"
    begin_raw "$out_file"
    err "running gemini via agy-headless wrapper (timeout ${TIMEOUT_SECONDS}s) -> $out_file"
    rc=0
    if [ -n "$GEMINI_MODEL" ]; then
      run_with_timeout "$TIMEOUT_SECONDS" \
        "$AGY_WRAPPER" --include-dir "$TARGET_DIR_ABS" --strict-model \
        --timeout "${TIMEOUT_SECONDS}s" --model "$GEMINI_MODEL" \
        --prompt "$PROMPT" >> "$out_file" 2>&1 || rc=$?
    else
      run_with_timeout "$TIMEOUT_SECONDS" \
        "$AGY_WRAPPER" --include-dir "$TARGET_DIR_ABS" \
        --timeout "${TIMEOUT_SECONDS}s" \
        --prompt "$PROMPT" >> "$out_file" 2>&1 || rc=$?
    fi
  else
    # Fallback: canonical direct agy invocation.
    agy_bin="$(command -v agy || true)"
    [ -n "$agy_bin" ] || agy_bin="$HOME/.local/bin/agy"
    invocation="agy --sandbox --add-dir $TARGET_DIR_ABS --print-timeout ${TIMEOUT_SECONDS}s -p \"<prompt>\""
    [ -n "$GEMINI_MODEL" ] && invocation="$invocation --model $GEMINI_MODEL"
    write_header "$out_file" "gemini / Antigravity (Google)" "$invocation"
    printf -- '- route_receipt: %s\n\n' "$route_file" >> "$out_file"
    begin_raw "$out_file"
    err "agy-headless wrapper not found; using direct agy (timeout ${TIMEOUT_SECONDS}s) -> $out_file"
    rc=0
    if [ -n "$GEMINI_MODEL" ]; then
      run_with_timeout "$TIMEOUT_SECONDS" \
        "$agy_bin" --sandbox --add-dir "$TARGET_DIR_ABS" \
        --print-timeout "${TIMEOUT_SECONDS}s" --model "$GEMINI_MODEL" \
        -p "$PROMPT" >> "$out_file" 2>&1 || rc=$?
    else
      run_with_timeout "$TIMEOUT_SECONDS" \
        "$agy_bin" --sandbox --add-dir "$TARGET_DIR_ABS" \
        --print-timeout "${TIMEOUT_SECONDS}s" \
        -p "$PROMPT" >> "$out_file" 2>&1 || rc=$?
    fi
  fi

  finish_review "$out_file" "$rc" "gemini"
}

# ---- claude (Anthropic family) ----------------------------------------------
# Enforced no-write: plan mode blocks all mutations while read tools still work,
# so the reviewer can inspect the target dir. No session persistence, workflows
# disabled. Used when the OPERATOR is a different family (openai/google).
run_claude() {
  out_file="$OUT_DIR_ABS/REVIEW-$TS-$SAFE_LABEL-claude.md"
  route_file="$OUT_DIR_ABS/REVIEW-$TS-$SAFE_LABEL-claude.route.json"
  raw_file="$(mktemp "$OUT_DIR_ABS/.claude-raw.XXXXXX")"
  invocation="cf_dispatch.sh --tool claude --role other-primary --orchestrator-family $OPERATOR_FAMILY"
  [ -n "$CLAUDE_MODEL" ] && invocation="$invocation --model $CLAUDE_MODEL"
  write_header "$out_file" "claude (Anthropic)" "$invocation"
  err "running claude (timeout ${TIMEOUT_SECONDS}s) -> $out_file"

  rc=0
  model_args=""
  [ -n "$CLAUDE_MODEL" ] && model_args="--model $CLAUDE_MODEL"
  # shellcheck disable=SC2086 -- model_args is either empty or one flag/value pair.
  route_record="$(cd "$TARGET_DIR_ABS" && run_with_timeout "$TIMEOUT_SECONDS" \
    "$CF_DISPATCH" --tool claude --role other-primary \
    --orchestrator-family "$OPERATOR_FAMILY" $model_args --out "$raw_file" --prompt "$PROMPT")" || rc=$?
  printf '%s\n' "$route_record" > "$route_file"
  route_status="$(printf '%s' "$route_record" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status", ""))' 2>/dev/null || true)"
  [ "$route_status" = "empty_output" ] && err "WARNING: claude returned empty output; treating it as no usable verdict."
  printf -- '- route_receipt: %s\n\n' "$route_file" >> "$out_file"
  begin_raw "$out_file"
  [ -f "$raw_file" ] && cat "$raw_file" >> "$out_file"
  rm -f "$raw_file"

  finish_review "$out_file" "$rc" "claude"
}

# ---- per-reviewer finalizer ------------------------------------------------
finish_review() {
  # $1 = file, $2 = rc, $3 = family
  fr_file="$1"; fr_rc="$2"; fr_family="$3"
  RAN_ANY=true
  if [ "$fr_rc" -eq 0 ] && ! awk '
    /--- BEGIN RAW REVIEWER OUTPUT ---/ { seen=1; next }
    seen && /^- route_receipt:/ { next }
    seen && NF { found=1 }
    END { exit(found ? 0 : 1) }
  ' "$fr_file"; then
    err "WARNING: $fr_family returned empty output; treating it as no usable verdict."
    fr_rc=4
  fi
  {
    printf '\n--- END RAW REVIEWER OUTPUT ---\n\n'
    printf -- '- exit_code: %s\n' "$fr_rc"
  } >> "$fr_file"

  if [ "$fr_rc" -eq 124 ]; then
    err "WARNING: $fr_family TIMED OUT after ${TIMEOUT_SECONDS}s (partial output captured)."
    printf -- '- note: reviewer TIMED OUT; output may be partial / no usable verdict.\n' >> "$fr_file"
    OVERALL_RC=4
  elif [ "$fr_rc" -ne 0 ]; then
    err "WARNING: $fr_family exited non-zero ($fr_rc); see captured output for cause."
    printf -- '- note: reviewer exited non-zero; treat as no usable verdict from this family.\n' >> "$fr_file"
    OVERALL_RC=4
  fi

  # Print the path on its own line for easy machine parsing by the orchestrator.
  printf 'REVIEW_FILE: %s\n' "$fr_file"
  [ "$fr_rc" -eq 0 ] || return 4
}

# ---- dispatch --------------------------------------------------------------
run_family() {
  case "$1" in
    codex)  run_codex ;;
    gemini) run_gemini ;;
    claude) run_claude ;;
  esac
}

record_bonus_skip() {
  skip_file="$OUT_DIR_ABS/REVIEW-$TS-$SAFE_LABEL-gemini-skip.md"
  write_header "$skip_file" "gemini / Antigravity (Google)" "not started"
  begin_raw "$skip_file"
  {
    printf '%s\n' "BONUS-FAMILY-NOT-RUN: $1"
    printf '\n--- END RAW REVIEWER OUTPUT ---\n\n'
    printf -- '- exit_code: 125\n'
    printf -- '- note: bonus-family route skipped; this does not block the other-primary gate.\n'
  } >> "$skip_file"
  printf 'REVIEW_FILE: %s\n' "$skip_file"
}

terminate_process_tree() {
  tree_pid="$1"
  for child_pid in $(pgrep -P "$tree_pid" 2>/dev/null || true); do
    terminate_process_tree "$child_pid"
  done
  kill "$tree_pid" 2>/dev/null || true
}

case "$MODELS" in
  codex|gemini|claude)
    if ! run_family "$MODELS"; then OVERALL_RC=4; fi
    ;;
  both)
    err "operator family: $OPERATOR_FAMILY -> primary $BOTH_PRIMARY; bonus $BOTH_BONUS"
    bonus_pid=""
    if [ "$bonus_available" = true ]; then
      run_family "$BOTH_BONUS" &
      bonus_pid=$!
    else
      record_bonus_skip "$bonus_skip_reason"
    fi
    if ! run_family "$BOTH_PRIMARY"; then OVERALL_RC=4; fi
    if [ -n "$bonus_pid" ]; then
      if kill -0 "$bonus_pid" 2>/dev/null; then
        terminate_process_tree "$bonus_pid"
        wait "$bonus_pid" 2>/dev/null || true
        record_bonus_skip "still running when the other-primary review finished; cancelled without delaying the gate"
      else
        wait "$bonus_pid" 2>/dev/null || true
      fi
    fi
    ;;
esac

if [ "$RAN_ANY" != true ]; then
  err "no reviewer ran (internal error)"
  exit 2
fi

# Reconcile reminder when both families ran.
if [ "$MODELS" = both ]; then
  err "Other-primary result gates the run. Reconcile any completed Gemini output as"
  err "advisory evidence; corroborate it with a primary-family reviewer before blocking."
fi

exit "$OVERALL_RC"
