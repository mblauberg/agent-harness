#!/usr/bin/env python3
"""Plan, install, reconcile or remove only harness-managed skill links."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_NAME = ".agent-harness-installation.json"
SKILL_NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class InstallError(ValueError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _sha_skill(path: Path) -> str:
    digest = hashlib.sha256()
    for child in sorted(path.rglob("*")):
        if any(part in {"__pycache__", ".DS_Store"} for part in child.relative_to(path).parts) or child.suffix == ".pyc":
            continue
        if child.is_symlink():
            raise InstallError(f"skill source contains a symlink: {child.relative_to(path)}")
        if not child.is_file():
            continue
        digest.update(child.relative_to(path).as_posix().encode())
        digest.update(b"\0")
        digest.update(b"x" if child.stat().st_mode & 0o111 else b"-")
        digest.update(b"\0")
        digest.update(child.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _skills(source: Path) -> dict[str, Path]:
    if not source.is_dir():
        raise InstallError("source must be an existing skill directory")
    skills = {path.parent.name: path.parent.resolve() for path in sorted(source.glob("*/SKILL.md"))}
    if any(not SKILL_NAME.fullmatch(name) for name in skills):
        raise InstallError("source contains an invalid skill name")
    return skills


def _manifest_path(target: Path) -> Path:
    return target.parent / MANIFEST_NAME


def _empty_manifest(target: Path) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "owner": "agent-harness",
        "target_root": str(target.resolve()),
        "updated_at": _now(),
        "managed": {},
    }


def _load_manifest(target: Path) -> dict[str, Any]:
    path = _manifest_path(target)
    if not path.exists():
        return _empty_manifest(target)
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise InstallError(f"installation manifest is unreadable: {exc}") from exc
    if not isinstance(data, dict) or data.get("schema_version") != 1 or data.get("owner") != "agent-harness" or not isinstance(data.get("managed"), dict):
        raise InstallError("installation manifest is invalid or not owned by agent-harness")
    if data.get("target_root") != str(target.resolve()):
        raise InstallError("installation manifest belongs to a different target root")
    required_entry = {"owner", "source_target", "source_sha256", "installed_at", "history"}
    for name, entry in data["managed"].items():
        if not isinstance(name, str) or not SKILL_NAME.fullmatch(name):
            raise InstallError("installation manifest contains an invalid skill name")
        if not isinstance(entry, dict) or set(entry) != required_entry or entry.get("owner") != "agent-harness":
            raise InstallError(f"installation manifest entry is invalid: {name}")
        if not isinstance(entry.get("source_target"), str) or not Path(entry["source_target"]).is_absolute():
            raise InstallError(f"installation manifest source target is invalid: {name}")
        if not isinstance(entry.get("source_sha256"), str) or not SHA256.fullmatch(entry["source_sha256"]):
            raise InstallError(f"installation manifest digest is invalid: {name}")
        if not isinstance(entry.get("history"), list):
            raise InstallError(f"installation manifest history is invalid: {name}")
    return data


def _same_link(destination: Path, source: Path) -> bool:
    if not destination.is_symlink():
        return False
    try:
        return destination.resolve(strict=False) == source.resolve()
    except OSError:
        return False


def _plan(source: Path, target: Path, manifest: dict[str, Any]) -> list[dict[str, str]]:
    skills = _skills(source)
    managed = manifest["managed"]
    items = []
    for name, source_path in skills.items():
        destination = target / name
        entry = managed.get(name)
        if entry is None:
            state = "unmanaged" if destination.exists() or destination.is_symlink() else "missing"
        elif _same_link(destination, source_path):
            state = "managed" if entry.get("source_sha256") == _sha_skill(source_path) else "stale"
        elif destination.is_symlink() and not destination.exists():
            state = "stale"
        elif not destination.exists() and not destination.is_symlink():
            state = "stale"
        else:
            state = "conflicting"
        items.append({"name": name, "state": state})
    for name in sorted(set(managed) - set(skills)):
        destination = target / name
        if _same_link(destination, Path(managed[name].get("source_target", "/missing"))):
            state = "retired-managed"
        elif not destination.exists() and not destination.is_symlink():
            state = "retired-missing"
        else:
            state = "conflicting"
        items.append({"name": name, "state": state})
    return items


def _integrity(source: Path, target: Path) -> list[dict[str, str]]:
    """Report the installed catalogue without claiming ownership of foreign entries."""
    skills = _skills(source)
    items: list[dict[str, str]] = []
    for name, source_path in skills.items():
        destination = target / name
        if _same_link(destination, source_path):
            state = "present"
        elif not destination.exists() and not destination.is_symlink():
            state = "missing"
        elif destination.is_symlink():
            state = "foreign"
        else:
            try:
                state = "present" if _sha_skill(destination) == _sha_skill(source_path) else "noncanonical"
            except (OSError, InstallError):
                state = "noncanonical"
        items.append({"name": name, "scope": "required", "state": state})

    if target.is_dir():
        for destination in sorted(target.iterdir()):
            name = destination.name
            if name == ".DS_Store" or name in skills or not destination.is_symlink():
                continue
            try:
                destination.resolve(strict=False).relative_to(source)
                state = "noncanonical"
            except (OSError, ValueError):
                state = "foreign"
            items.append({"name": name, "scope": "extra", "state": state})
    return items


def _write_manifest(target: Path, manifest: dict[str, Any]) -> None:
    path = _manifest_path(target)
    path.parent.mkdir(parents=True, exist_ok=True)
    manifest["updated_at"] = _now()
    temp: Path | None = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=path.parent, prefix=".installation.", suffix=".tmp", delete=False) as handle:
            temp = Path(handle.name)
            json.dump(manifest, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        if temp and temp.exists():
            temp.unlink()


def _entry(name: str, source: Path, history: list[dict[str, str]] | None = None) -> dict[str, Any]:
    return {
        "owner": "agent-harness",
        "source_target": str(source),
        "source_sha256": _sha_skill(source),
        "installed_at": _now(),
        "history": history or [],
    }


def _load_renames(path: Path | None) -> list[dict[str, str]]:
    if path is None:
        return []
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise InstallError(f"rename registry is unreadable: {exc}") from exc
    renames = data.get("renames") if isinstance(data, dict) and data.get("schema_version") == 1 else None
    if not isinstance(renames, list) or any(
        not isinstance(item, dict) or set(item) != {"from", "to"}
        or not SKILL_NAME.fullmatch(str(item["from"])) or not SKILL_NAME.fullmatch(str(item["to"]))
        for item in renames
    ):
        raise InstallError("rename registry is invalid")
    return renames


def _prepare_renames(source: Path, target: Path, manifest: dict[str, Any], renames: list[dict[str, str]]) -> list[dict[str, Any]]:
    skills = _skills(source)
    managed = manifest["managed"]
    operations: list[dict[str, Any]] = []
    # Several sources may converge on one target (a many-to-one skill merge):
    # only the first such rename creates the shared link, the rest just retire
    # their old link, and every source's history merges into the one target entry.
    creating: set[str] = set()
    target_history: dict[str, list[dict[str, str]]] = {}
    for rename in renames:
        old, new = rename["from"], rename["to"]
        if old not in managed or new not in skills:
            continue
        old_destination = target / old
        new_destination = target / new
        old_source = Path(managed[old]["source_target"])
        if (old_destination.exists() or old_destination.is_symlink()) and not _same_link(old_destination, old_source):
            raise InstallError(f"conflicting managed rename source: {old}")
        new_is_correct = _same_link(new_destination, skills[new])
        if (new_destination.exists() or new_destination.is_symlink()) and not new_is_correct:
            raise InstallError(f"conflicting rename target: {new}")
        if new_is_correct and new in managed and Path(managed[new]["source_target"]).resolve() != skills[new]:
            raise InstallError(f"conflicting managed rename target: {new}")
        if new not in target_history:
            target_history[new] = list(managed.get(new, {}).get("history", []))
        target_history[new].extend(managed.get(old, {}).get("history", []))
        target_history[new].append({"from": old, "to": new, "at": _now()})
        create_new = not new_is_correct and new not in creating
        if create_new:
            creating.add(new)
        operations.append({
            "old": old,
            "new": new,
            "old_destination": old_destination,
            "old_source": old_source,
            "new_destination": new_destination,
            "new_source": skills[new],
            "create_new": create_new,
            "entry": _entry(new, skills[new], list(target_history[new])),
        })
    return operations


def _apply_renames(manifest: dict[str, Any], operations: list[dict[str, Any]]) -> None:
    applied: list[dict[str, Any]] = []
    try:
        for operation in operations:
            if operation["create_new"]:
                operation["new_destination"].symlink_to(operation["new_source"])
            try:
                if operation["old_destination"].is_symlink():
                    operation["old_destination"].unlink()
            except OSError:
                if operation["create_new"]:
                    operation["new_destination"].unlink(missing_ok=True)
                raise
            applied.append(operation)
    except OSError as exc:
        for operation in reversed(applied):
            if operation["create_new"] and operation["new_destination"].is_symlink():
                operation["new_destination"].unlink()
            if not operation["old_destination"].exists() and not operation["old_destination"].is_symlink():
                operation["old_destination"].symlink_to(operation["old_source"])
        raise InstallError(f"rename application failed and was rolled back: {exc}") from exc
    for operation in operations:
        manifest["managed"][operation["new"]] = operation["entry"]
        manifest["managed"].pop(operation["old"], None)


def _snapshot_links(target: Path, names: set[str]) -> dict[str, str | None]:
    return {name: os.readlink(target / name) if (target / name).is_symlink() else None for name in names}


def _restore_links(target: Path, snapshot: dict[str, str | None]) -> None:
    for name, raw in snapshot.items():
        destination = target / name
        if destination.is_symlink():
            destination.unlink()
        if raw is not None:
            destination.symlink_to(raw)


def execute(action: str, source: Path, target: Path, renames: Path | None = None) -> dict[str, Any]:
    source = source.resolve()
    target = target.resolve()
    manifest = _load_manifest(target)
    if action == "plan":
        return {"schema_version": 1, "action": action, "items": _plan(source, target, manifest), "changed": []}
    if action == "check":
        items = _integrity(source, target)
        return {
            "schema_version": 1,
            "action": action,
            "ok": all(item["state"] == "present" for item in items if item["scope"] == "required"),
            "items": items,
            "changed": [],
        }
    target.mkdir(parents=True, exist_ok=True)
    rename_operations: list[dict[str, Any]] = []
    if action == "reconcile":
        rename_operations = _prepare_renames(source, target, manifest, _load_renames(renames))
    items = _plan(source, target, manifest)
    renamed_old = {operation["old"] for operation in rename_operations}
    conflicts = [item["name"] for item in items if item["state"] == "conflicting" and item["name"] not in renamed_old]
    if conflicts:
        raise InstallError("conflicting managed targets: " + ", ".join(conflicts))
    tracked = set(manifest["managed"]) | {item["name"] for item in items}
    tracked |= {operation["new"] for operation in rename_operations}
    snapshot = _snapshot_links(target, tracked)
    changed: list[str] = [operation["new"] for operation in rename_operations]
    try:
        if rename_operations:
            _apply_renames(manifest, rename_operations)
            items = _plan(source, target, manifest)
        if action in {"install", "reconcile"}:
            skills = _skills(source)
            for item in items:
                name, state = item["name"], item["state"]
                if state in {"missing", "stale"}:
                    destination = target / name
                    if destination.is_symlink():
                        destination.unlink()
                    destination.symlink_to(skills[name])
                    history = list(manifest["managed"].get(name, {}).get("history", []))
                    manifest["managed"][name] = _entry(name, skills[name], history)
                    changed.append(name)
                elif state == "retired-managed":
                    (target / name).unlink()
                    del manifest["managed"][name]
                    changed.append(name)
                elif state == "retired-missing":
                    del manifest["managed"][name]
                    changed.append(name)
        elif action == "uninstall-managed":
            for name, entry in list(manifest["managed"].items()):
                destination = target / name
                if _same_link(destination, Path(entry.get("source_target", "/missing"))):
                    destination.unlink()
                    del manifest["managed"][name]
                    changed.append(name)
                elif destination.exists() or destination.is_symlink():
                    raise InstallError(f"conflicting managed target changed outside harness: {name}")
                else:
                    del manifest["managed"][name]
        else:
            raise InstallError(f"unsupported action: {action}")
        _write_manifest(target, manifest)
    except (OSError, InstallError):
        _restore_links(target, snapshot)
        raise
    return {"schema_version": 1, "action": action, "items": _plan(source, target, manifest), "changed": changed}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("plan", "check", "install", "reconcile", "uninstall-managed"))
    parser.add_argument("--target", required=True, type=Path)
    parser.add_argument("--source", type=Path, default=ROOT / "skills")
    parser.add_argument("--renames", type=Path)
    parser.add_argument("--summary", action="store_true")
    args = parser.parse_args(argv)
    try:
        result = execute(args.action, args.source, args.target, args.renames)
    except (OSError, InstallError) as exc:
        print(f"conflicting: {exc}", file=sys.stderr)
        return 3
    if args.action == "check":
        warnings = [item for item in result["items"] if item["scope"] == "extra" and item["state"] != "present"]
        if warnings:
            detail = ", ".join(f'{item["name"]}={item["state"]}' for item in warnings)
            print(f"warning: unmanaged skill links outside catalogue: {detail}", file=sys.stderr)
    if args.action == "check" and not result["ok"]:
        print(json.dumps(result, indent=2))
        failures = ", ".join(
            f'{item["name"]}={item["state"]}'
            for item in result["items"]
            if item["scope"] == "required" and item["state"] != "present"
        )
        print(f"conflicting: skill installation integrity failed: {failures}", file=sys.stderr)
        return 3
    if args.summary:
        if args.action == "check":
            print(f"skills checked={len(result['items'])} target={args.target}")
            return 0
        linked = len(result["changed"])
        existing = sum(item["state"] in {"managed", "unmanaged"} for item in result["items"]) - linked
        print(f"skills linked={linked} existing={existing} target={args.target}")
    else:
        print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
