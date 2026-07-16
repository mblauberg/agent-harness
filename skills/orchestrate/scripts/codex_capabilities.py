#!/usr/bin/env python3
"""Capture a normalized, model-specific Codex runtime capability snapshot."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


def normalize(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict) or not isinstance(raw.get("models"), list):
        raise ValueError("catalogue root must contain a models list")
    models: dict[str, Any] = {}
    for item in raw["models"]:
        if not isinstance(item, dict):
            raise ValueError("catalogue model entry must be an object")
        slug = item.get("slug")
        if not isinstance(slug, str) or not slug.strip():
            raise ValueError("catalogue model slug must be a non-empty string")
        levels = item.get("supported_reasoning_levels")
        if not isinstance(levels, list):
            raise ValueError("catalogue reasoning levels must be a list")
        efforts = []
        for level in levels:
            if not isinstance(level, dict):
                raise ValueError("catalogue reasoning-level entry must be an object")
            effort = level.get("effort")
            if not isinstance(effort, str) or not effort.strip():
                raise ValueError("catalogue reasoning effort must be a non-empty string")
            efforts.append(effort.lower())
        models[slug.lower()] = {
            "resolved_model": slug,
            "supported_efforts": efforts,
        }
    if not models:
        raise ValueError("catalogue contains no usable model entries")
    return {
        "schema_version": 1,
        "source": "codex debug models",
        "observed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "models": models,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--codex-bin", default="codex")
    args = parser.parse_args(argv)
    try:
        result = subprocess.run(
            [args.codex_bin, "debug", "models"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10,
            check=False,
        )
        if result.returncode != 0:
            raise ValueError(f"codex debug models exited {result.returncode}: {result.stderr.strip()}")
        snapshot = normalize(json.loads(result.stdout))
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError, ValueError) as exc:
        print(f"capability discovery failed: {exc}", file=sys.stderr)
        return 1
    encoded = json.dumps(snapshot, indent=2, sort_keys=True) + "\n"
    if args.out:
        args.out.write_text(encoded)
    else:
        print(encoded, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
