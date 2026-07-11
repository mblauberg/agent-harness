#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: herdr_prompt.sh TARGET --fire-and-forget --task-ref ID [--prompt TEXT | --prompt-file PATH]

Send one reference-labelled fire-and-forget steering prompt to an interactive
Herdr agent with Herdr's atomic pane runner. If no prompt option is supplied,
read the prompt from stdin.
This helper never waits for completion and cannot return an answer. Use Fabric
request/reply for assignments, reviews or any work whose result the lead needs.
EOF
}

[[ $# -ge 1 ]] || { usage >&2; exit 2; }
if [[ "$1" = "-h" || "$1" = "--help" ]]; then
  usage
  exit 0
fi
target="$1"
shift
prompt=""
fire_and_forget=false
task_ref=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fire-and-forget)
      fire_and_forget=true
      shift
      ;;
    --task-ref)
      [[ $# -ge 2 ]] || { echo "missing value for --task-ref" >&2; exit 2; }
      task_ref="$2"
      shift 2
      ;;
    --prompt)
      [[ $# -ge 2 ]] || { echo "missing value for --prompt" >&2; exit 2; }
      prompt="$2"
      shift 2
      ;;
    --prompt-file)
      [[ $# -ge 2 ]] || { echo "missing value for --prompt-file" >&2; exit 2; }
      [[ -r "$2" ]] || { echo "cannot read prompt file: $2" >&2; exit 2; }
      prompt="$(<"$2")"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ "$fire_and_forget" != true ]]; then
  echo "herdr_prompt.sh is one-way; pass --fire-and-forget only for steering with no expected answer, or use Fabric request/reply" >&2
  exit 2
fi
if [[ -z "$task_ref" || ! "$task_ref" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo "fire-and-forget steering requires --task-ref with a tracked Fabric task/message identifier" >&2
  exit 2
fi

if [[ -z "$prompt" && ! -t 0 ]]; then
  prompt="$(cat)"
fi
[[ -n "$prompt" ]] || { echo "prompt is required" >&2; exit 2; }
prompt_bytes="$(printf '%s' "$prompt" | wc -c | tr -d ' ')"
if (( prompt_bytes > 4096 )); then
  echo "prompt exceeds 4096-byte Herdr steering limit; write an artifact and send its path plus digest" >&2
  exit 2
fi

agent_json="$(herdr agent get "$target")"
pane_id="$(printf '%s' "$agent_json" | python3 -c '
import json, sys
try:
    value = json.load(sys.stdin)["result"]["agent"]["pane_id"]
except (KeyError, TypeError, json.JSONDecodeError):
    raise SystemExit(1)
print(value)
')" || { echo "could not resolve pane for Herdr agent: $target" >&2; exit 1; }

herdr pane run "$pane_id" "$prompt" >/dev/null
sleep 0.15
# Herdr 0.7.3 can acknowledge pane-run after pasting into Claude/Codex while
# leaving the draft unsubmitted. A trailing Enter is harmless after a
# successful submit (empty composers do nothing) and closes that gap.
herdr pane send-keys "$pane_id" enter >/dev/null
printf 'dispatched-unconfirmed fire-and-forget task-ref-unverified target=%s task_ref=%s pane=%s bytes=%s\n' "$target" "$task_ref" "$pane_id" "$prompt_bytes"
