#!/usr/bin/env python3
"""Atomically acquire, renew, transfer or release a single-driver run lease."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import sys
import tempfile


def now() -> datetime:
    return datetime.now(timezone.utc)


def stamp(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def write_atomic(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def mutate(path: Path, action: str, holder: str, ttl: int, expected: int | None, target: str, handoff: str = "") -> dict:
    lock_path = path.with_suffix(path.suffix + ".lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            state = json.loads(path.read_text()) if path.exists() else {}
        except json.JSONDecodeError as exc:
            raise ValueError(f"invalid lease JSON: {exc}") from exc
        generation = state.get("generation", 0)
        if not isinstance(generation, int):
            raise ValueError("lease generation is invalid")
        if expected is not None and generation != expected:
            raise ValueError(f"generation mismatch: expected {expected}, found {generation}")
        active = bool(state.get("status") == "active" and state.get("expires_at") and parse(state["expires_at"]) > now())
        current = state.get("holder", "")
        if action == "acquire":
            if active:
                raise ValueError(f"active lease belongs to {current}; use renew")
            if state and current and current != holder:
                raise ValueError(f"lease belongs to {current}; use takeover with generation and handoff evidence")
            new_holder = holder
        elif action == "renew":
            if not active or current != holder:
                raise ValueError("only the active holder may renew")
            new_holder = holder
        elif action == "transfer":
            if not active or current != holder or not target:
                raise ValueError("active holder and --target are required for transfer")
            new_holder = target
        elif action == "takeover":
            evidence_path = Path(handoff).resolve() if handoff else Path("/")
            try:
                evidence_path.relative_to(path.parent.resolve())
                evidence = json.loads(evidence_path.read_text())
            except (ValueError, OSError, json.JSONDecodeError):
                evidence = {}
            evidence_valid = (
                evidence.get("schema_version") == 1
                and evidence.get("from_holder") == current
                and evidence.get("to_holder") == holder
                and evidence.get("generation") == expected
                and bool(evidence.get("approved_by"))
            )
            if active or not current or current == holder or expected is None or not evidence_valid:
                raise ValueError("expired lease takeover requires a new holder, expected generation and handoff evidence")
            new_holder = holder
        else:
            if current != holder:
                raise ValueError("only the holder may release")
            new_holder = ""
        instant = now()
        updated = {
            "schema_version": 1,
            "status": "released" if action == "release" else "active",
            "holder": new_holder,
            "previous_holder": current if current != new_holder else state.get("previous_holder", ""),
            "generation": generation + 1,
            "updated_at": stamp(instant),
            "expires_at": "" if action == "release" else stamp(instant + timedelta(seconds=ttl)),
            "handoff_evidence": handoff if action == "takeover" else state.get("handoff_evidence", ""),
        }
        write_atomic(path, updated)
        return updated


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("acquire", "renew", "transfer", "takeover", "release"))
    parser.add_argument("lease", type=Path)
    parser.add_argument("--holder", required=True)
    parser.add_argument("--target", default="")
    parser.add_argument("--ttl", type=int, default=900)
    parser.add_argument("--expected-generation", type=int)
    parser.add_argument("--handoff-evidence", default="")
    args = parser.parse_args(argv)
    if args.ttl <= 0:
        parser.error("--ttl must be positive")
    try:
        value = mutate(args.lease, args.action, args.holder, args.ttl, args.expected_generation, args.target, args.handoff_evidence)
    except (OSError, ValueError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(value, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
