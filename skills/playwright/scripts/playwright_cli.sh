#!/usr/bin/env bash
set -euo pipefail

has_session_flag="false"
for arg in "$@"; do
  case "$arg" in
    --session|--session=*)
      has_session_flag="true"
      break
      ;;
  esac
done

if command -v playwright-cli >/dev/null 2>&1; then
  cmd=(playwright-cli)
elif [[ "${PLAYWRIGHT_CLI_ALLOW_NPX_INSTALL:-0}" == "1" ]]; then
  if ! command -v npx >/dev/null 2>&1; then
    echo "Error: npx is required for authorised package resolution." >&2
    exit 1
  fi
  cmd=(npx --yes --package "@playwright/cli@0.1.17" playwright-cli)
else
  echo "Error: playwright-cli not found. Set PLAYWRIGHT_CLI_ALLOW_NPX_INSTALL=1 only after authorising network/package retrieval." >&2
  exit 1
fi
if [[ "${has_session_flag}" != "true" && -n "${PLAYWRIGHT_CLI_SESSION:-}" ]]; then
  cmd+=(--session "${PLAYWRIGHT_CLI_SESSION}")
fi
cmd+=("$@")

exec "${cmd[@]}"
