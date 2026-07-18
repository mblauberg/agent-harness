#!/usr/bin/env python3
"""Plan, install, reconcile or remove only harness-managed skill links."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_NAME = ".agent-harness-installation.json"
SKILL_NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class InstallError(ValueError):
    pass


@dataclass(frozen=True)
class PathIdentity:
    device: int
    inode: int
    mode: int
    size: int
    modified_ns: int


@dataclass(frozen=True)
class PathSnapshot:
    kind: str
    identity: PathIdentity | None
    link_target: str | None


@dataclass(frozen=True)
class LinkMutation:
    path: Path
    before: PathSnapshot
    installed: PathSnapshot


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


def _path_identity(value: os.stat_result) -> PathIdentity:
    return PathIdentity(
        value.st_dev, value.st_ino, value.st_mode, value.st_size, value.st_mtime_ns,
    )


def _capture_path(path: Path) -> PathSnapshot:
    try:
        before = path.lstat()
    except FileNotFoundError:
        return PathSnapshot("absent", None, None)
    identity = _path_identity(before)
    if not stat.S_ISLNK(before.st_mode):
        return PathSnapshot("other", identity, None)
    try:
        link_target = os.readlink(path)
        after = path.lstat()
    except FileNotFoundError as exc:
        raise InstallError(f"managed path changed while snapshotting: {path.name}") from exc
    if _path_identity(after) != identity or os.readlink(path) != link_target:
        raise InstallError(f"managed path changed while snapshotting: {path.name}")
    return PathSnapshot("symlink", identity, link_target)


def _snapshot_paths(target: Path, names: set[str]) -> dict[str, PathSnapshot]:
    return {name: _capture_path(target / name) for name in names}


def _same_link_snapshot(destination: Path, source: Path, snapshot: PathSnapshot) -> bool:
    if snapshot.kind != "symlink" or snapshot.link_target is None:
        return False
    try:
        return (destination.parent / snapshot.link_target).resolve(strict=False) == source.resolve()
    except (OSError, RuntimeError):
        return False


def _assert_path_unchanged(path: Path, expected: PathSnapshot) -> None:
    if _capture_path(path) != expected:
        raise InstallError(f"managed path changed before managed mutation: {path.name}")


def _mutate_link(
    path: Path,
    expected: PathSnapshot,
    source: Path | None,
    journal: list[LinkMutation],
) -> None:
    _assert_path_unchanged(path, expected)
    if expected.kind == "symlink":
        path.unlink()
    elif expected.kind != "absent":
        raise InstallError(f"managed mutation refuses non-link path: {path.name}")
    if source is not None:
        path.symlink_to(source)
    journal.append(LinkMutation(path, expected, _capture_path(path)))


def _rollback_mutations(journal: list[LinkMutation]) -> list[str]:
    preserved: list[str] = []
    for mutation in reversed(journal):
        current = _capture_path(mutation.path)
        if current != mutation.installed:
            preserved.append(mutation.path.name)
            continue
        try:
            if current.kind == "symlink":
                mutation.path.unlink()
            elif current.kind != "absent":
                preserved.append(mutation.path.name)
                continue
            if mutation.before.kind == "symlink":
                assert mutation.before.link_target is not None
                mutation.path.symlink_to(mutation.before.link_target)
            elif mutation.before.kind != "absent":
                preserved.append(mutation.path.name)
        except FileExistsError:
            preserved.append(mutation.path.name)
    return sorted(set(preserved))


def _plan(
    source: Path,
    target: Path,
    manifest: dict[str, Any],
    snapshots: dict[str, PathSnapshot] | None = None,
) -> list[dict[str, str]]:
    skills = _skills(source)
    managed = manifest["managed"]
    snapshots = snapshots or _snapshot_paths(target, set(skills) | set(managed))
    items = []
    for name, source_path in skills.items():
        destination = target / name
        snapshot = snapshots[name]
        entry = managed.get(name)
        if entry is None:
            if _same_link_snapshot(destination, source_path, snapshot):
                state = "compatible"
            else:
                state = "missing" if snapshot.kind == "absent" else "unmanaged"
        elif _same_link_snapshot(destination, source_path, snapshot):
            state = "managed" if entry.get("source_sha256") == _sha_skill(source_path) else "stale"
        elif snapshot.kind == "symlink":
            state = "stale"
        elif snapshot.kind == "absent":
            state = "stale"
        else:
            state = "conflicting"
        items.append({"name": name, "state": state})
    for name in sorted(set(managed) - set(skills)):
        destination = target / name
        snapshot = snapshots[name]
        if _same_link_snapshot(destination, Path(managed[name].get("source_target", "/missing")), snapshot):
            state = "retired-managed"
        elif snapshot.kind == "absent":
            state = "retired-missing"
        else:
            state = "conflicting"
        items.append({"name": name, "state": state})
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


def _prepare_renames(
    source: Path,
    target: Path,
    manifest: dict[str, Any],
    renames: list[dict[str, str]],
    snapshots: dict[str, PathSnapshot],
) -> list[dict[str, Any]]:
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
        old_snapshot = snapshots[old]
        new_snapshot = snapshots[new]
        old_source = Path(managed[old]["source_target"])
        if old_snapshot.kind != "absent" and not _same_link_snapshot(old_destination, old_source, old_snapshot):
            raise InstallError(f"conflicting managed rename source: {old}")
        new_is_correct = _same_link_snapshot(new_destination, skills[new], new_snapshot)
        if new_snapshot.kind != "absent" and not new_is_correct:
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
            "old_snapshot": old_snapshot,
            "new_destination": new_destination,
            "new_source": skills[new],
            "new_snapshot": new_snapshot,
            "create_new": create_new,
            "claim_new": create_new or new in managed,
            "entry": _entry(new, skills[new], list(target_history[new])),
        })
    return operations


def _apply_renames(
    manifest: dict[str, Any],
    operations: list[dict[str, Any]],
    journal: list[LinkMutation],
) -> None:
    for operation in operations:
        if operation["create_new"]:
            _mutate_link(
                operation["new_destination"], operation["new_snapshot"], operation["new_source"], journal,
            )
        if operation["old_snapshot"].kind == "symlink":
            _mutate_link(
                operation["old_destination"], operation["old_snapshot"], None, journal,
            )
    claimed = {operation["new"] for operation in operations if operation["claim_new"]}
    for operation in operations:
        manifest["managed"].pop(operation["old"], None)
    for name in claimed:
        manifest["managed"][name] = next(
            operation["entry"] for operation in reversed(operations) if operation["new"] == name
        )


def execute(action: str, source: Path, target: Path, renames: Path | None = None) -> dict[str, Any]:
    source = source.resolve()
    target = target.resolve()
    manifest = _load_manifest(target)
    if action in {"plan", "check"}:
        return {"schema_version": 1, "action": action, "items": _plan(source, target, manifest), "changed": []}
    target.mkdir(parents=True, exist_ok=True)
    rename_registry = _load_renames(renames) if action == "reconcile" else []
    skills = _skills(source)
    tracked = set(manifest["managed"]) | set(skills)
    tracked |= {item[key] for item in rename_registry for key in ("from", "to")}
    snapshots = _snapshot_paths(target, tracked)
    rename_operations: list[dict[str, Any]] = []
    if action == "reconcile":
        rename_operations = _prepare_renames(source, target, manifest, rename_registry, snapshots)
    items = _plan(source, target, manifest, snapshots)
    renamed_old = {operation["old"] for operation in rename_operations}
    conflicts = [item["name"] for item in items if item["state"] == "conflicting" and item["name"] not in renamed_old]
    if conflicts:
        raise InstallError("conflicting managed targets: " + ", ".join(conflicts))
    changed: list[str] = [operation["new"] for operation in rename_operations]
    journal: list[LinkMutation] = []
    try:
        if rename_operations:
            _apply_renames(manifest, rename_operations, journal)
            post_rename_snapshots = _snapshot_paths(target, set(manifest["managed"]) | set(skills))
            items = _plan(source, target, manifest, post_rename_snapshots)
        else:
            post_rename_snapshots = snapshots
        if action in {"install", "reconcile"}:
            for item in items:
                name, state = item["name"], item["state"]
                if state == "missing" or (action == "reconcile" and state == "stale"):
                    destination = target / name
                    _mutate_link(destination, post_rename_snapshots[name], skills[name], journal)
                    history = list(manifest["managed"].get(name, {}).get("history", []))
                    manifest["managed"][name] = _entry(name, skills[name], history)
                    changed.append(name)
                elif action == "reconcile" and state == "retired-missing":
                    del manifest["managed"][name]
                    changed.append(name)
        elif action == "uninstall-managed":
            for name, entry in list(manifest["managed"].items()):
                destination = target / name
                snapshot = snapshots[name]
                if _same_link_snapshot(destination, Path(entry.get("source_target", "/missing")), snapshot):
                    _mutate_link(destination, snapshot, None, journal)
                    del manifest["managed"][name]
                    changed.append(name)
                elif snapshot.kind != "absent":
                    raise InstallError(f"conflicting managed target changed outside harness: {name}")
                else:
                    del manifest["managed"][name]
        else:
            raise InstallError(f"unsupported action: {action}")
        _write_manifest(target, manifest)
    except (OSError, InstallError) as exc:
        preserved = _rollback_mutations(journal)
        if preserved:
            raise InstallError("rollback preserved newer path: " + ", ".join(preserved)) from exc
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
    if args.summary:
        linked = len(result["changed"])
        existing = sum(item["state"] in {"managed", "compatible", "unmanaged"} for item in result["items"]) - linked
        print(f"skills linked={linked} existing={existing} target={args.target}")
    else:
        print(json.dumps(result, indent=2))
    if args.action == "check":
        drift = [item for item in result["items"] if item["state"] not in {"managed", "compatible"}]
        if drift:
            rendered = " ".join(
                f"{state}={','.join(item['name'] for item in drift if item['state'] == state)}"
                for state in sorted({item["state"] for item in drift})
            )
            print(f"skills {rendered}")
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
