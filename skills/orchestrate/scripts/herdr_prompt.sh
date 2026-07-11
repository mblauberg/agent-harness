#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: herdr_prompt.sh TARGET [--prompt TEXT | --prompt-file PATH]

Send one prompt to an interactive Herdr agent with Herdr's atomic pane runner.
If no prompt option is supplied, read the prompt from stdin. This helper never
waits for completion.
EOF
}

[[ $# -ge 1 ]] || { usage >&2; exit 2; }
target="$1"
shift
prompt=""
while [[ $# -gt 0 ]]; do
  case "$1" in
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
printf 'dispatched-unconfirmed target=%s pane=%s bytes=%s\n' "$target" "$pane_id" "$prompt_bytes"
