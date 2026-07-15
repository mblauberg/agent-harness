#!/bin/sh
set -eu

script_path=$0
while [ -L "$script_path" ]; do
  link=$(readlink "$script_path")
  case "$link" in
    /*) script_path=$link ;;
    *) script_path=$(dirname "$script_path")/$link ;;
  esac
done
script_dir=$(CDPATH= cd -- "$(dirname -- "$script_path")" && pwd)
harness_root=$(CDPATH= cd -- "$script_dir/../../.." && pwd)
agents_home=${AGENTS_HOME:-$harness_root}
case "$agents_home" in /*) ;; *) echo "AGENTS_HOME must be absolute" >&2; exit 2 ;; esac

# Fabric owns validation, idempotency, the Herdr effect and its receipt. This
# bundled helper is intentionally only an argument-preserving client.
exec "$agents_home/scripts/agent-fabric" herdr steer "$@"
