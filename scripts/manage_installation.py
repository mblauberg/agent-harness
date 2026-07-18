#!/usr/bin/env python3
"""Plan, install, reconcile or remove only harness-managed skill links."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import ctypes
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import tempfile
import sys
import time
from typing import Any, NamedTuple


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_NAME = ".agent-harness-installation.json"
LOCK_NAME = ".agent-harness-installation.lock"
SKILL_NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class InstallError(ValueError):
    pass


class ManifestCommitUncertainError(InstallError):
    """The manifest pathname changed but its directory fsync failed."""


class PathIdentity(NamedTuple):
    device: int
    inode: int
    mode: int
    size: int
    modified_ns: int


class PathSnapshot(NamedTuple):
    kind: str
    identity: PathIdentity | None
    link_target: str | None


class LinkMutation(NamedTuple):
    path: Path
    before: PathSnapshot
    installed: PathSnapshot


class RollbackFailure(NamedTuple):
    name: str
    error_type: str
    detail: str


class StagedLink(NamedTuple):
    path: Path
    snapshot: PathSnapshot


class LinkRecoveryWorkspace:
    """Private, same-filesystem staging that retains displaced writers on conflict."""

    def __init__(self, parent: Path):
        self.parent = parent
        self.directory: Path | None = None

    def stage(self, link_target: str | None = None) -> StagedLink:
        if self.directory is None:
            self.directory = Path(tempfile.mkdtemp(
                dir=self.parent,
                prefix=".agent-harness-links.",
            ))
            os.chmod(self.directory, 0o700)
            info = self.directory.lstat()
            if (
                not stat.S_ISDIR(info.st_mode)
                or info.st_uid != os.geteuid()
                or stat.S_IMODE(info.st_mode) != 0o700
            ):
                raise InstallError(
                    "private managed-link recovery directory could not be established"
                )
        path = self.directory / f"link-{secrets.token_hex(12)}"
        if link_target is not None:
            path.symlink_to(link_target)
        return StagedLink(path, _capture_path(path))

    def discard_exact(self, staged: StagedLink) -> bool:
        if _capture_path(staged.path) != staged.snapshot:
            return False
        staged.path.unlink()
        return True

    def sync(self) -> None:
        if self.directory is not None:
            _fsync_directory(self.directory)
            _fsync_directory(self.parent)

    def cleanup(self) -> None:
        if self.directory is None or not self.directory.exists():
            return
        try:
            self.directory.rmdir()
        except OSError:
            return


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


def _lock_identity(value: os.stat_result) -> tuple[int, int, int]:
    return value.st_dev, value.st_ino, value.st_mode


def _validate_lock_file(descriptor: int, path: Path, phase: str) -> None:
    opened = os.fstat(descriptor)
    try:
        pathname = path.lstat()
    except FileNotFoundError as exc:
        raise InstallError(f"installation lock disappeared {phase}: {path}") from exc
    if (
        not stat.S_ISREG(opened.st_mode)
        or opened.st_uid != os.geteuid()
        or opened.st_nlink != 1
        or stat.S_IMODE(opened.st_mode) != 0o600
        or _lock_identity(opened) != _lock_identity(pathname)
    ):
        raise InstallError(
            f"installation lock must be one owner-only regular file {phase}: {path}"
        )


@contextmanager
def _installation_lock(target: Path, timeout_ms: int = 10_000):
    if not isinstance(timeout_ms, int) or not 1 <= timeout_ms <= 60_000:
        raise InstallError("installation lock timeout must be from 1 to 60000 milliseconds")
    target.parent.mkdir(parents=True, exist_ok=True)
    path = target.parent / LOCK_NAME
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags, 0o600)
    except OSError as exc:
        raise InstallError(f"installation lock cannot be opened safely: {path}") from exc
    locked = False
    try:
        _validate_lock_file(descriptor, path, "before acquisition")
        deadline = time.monotonic() + timeout_ms / 1000
        while True:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                locked = True
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise InstallError(f"installation lock acquisition timed out: {path}")
                time.sleep(0.02)
        _validate_lock_file(descriptor, path, "after acquisition")
        yield
    finally:
        if locked:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


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
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
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


def _same_link_snapshot(
    destination: Path,
    source: Path,
    snapshot: PathSnapshot,
) -> bool:
    if snapshot.kind != "symlink" or snapshot.link_target is None:
        return False
    try:
        return (
            (destination.parent / snapshot.link_target).resolve(strict=False)
            == source.resolve()
        )
    except (OSError, RuntimeError):
        return False


def atomic_exchange(first: Path, second: Path) -> None:
    """Atomically exchange two same-filesystem paths."""
    library = ctypes.CDLL(None, use_errno=True)
    first_bytes = os.fsencode(first)
    second_bytes = os.fsencode(second)
    if sys.platform == "darwin":
        operation = library.renamex_np
        operation.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        arguments = (first_bytes, second_bytes, 0x00000002)
    elif sys.platform.startswith("linux"):
        try:
            operation = library.renameat2
        except AttributeError as exc:
            raise InstallError("atomic managed-link exchange is unavailable") from exc
        operation.argtypes = [
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_uint,
        ]
        arguments = (-100, first_bytes, -100, second_bytes, 0x00000002)
    else:
        raise InstallError("atomic managed-link exchange is unavailable")
    operation.restype = ctypes.c_int
    if operation(*arguments) != 0:
        number = ctypes.get_errno()
        raise OSError(number, os.strerror(number), str(second))


def _hardlink_if_absent(candidate: Path, destination: Path) -> None:
    try:
        os.link(candidate, destination, follow_symlinks=False)
    except FileExistsError as exc:
        raise InstallError(
            f"managed path changed during atomic install: {destination.name}"
        ) from exc


def _restore_exchange(
    path: Path,
    recovery: StagedLink,
    installed: PathSnapshot,
    displaced: PathSnapshot,
) -> bool:
    if _capture_path(path) != installed or _capture_path(recovery.path) != displaced:
        return False
    atomic_exchange(recovery.path, path)
    return (
        _capture_path(path) == displaced
        and _capture_path(recovery.path) == installed
    )


def _atomic_replace_link(
    path: Path,
    expected: PathSnapshot,
    link_target: str,
    workspace: LinkRecoveryWorkspace,
) -> PathSnapshot:
    candidate = workspace.stage(link_target)
    if expected.kind == "absent":
        try:
            _hardlink_if_absent(candidate.path, path)
            installed = _capture_path(path)
            if installed != candidate.snapshot:
                raise InstallError(
                    f"managed path changed after atomic install; preserved newer path: {path.name}"
                )
            return installed
        finally:
            workspace.discard_exact(candidate)
    if expected.kind != "symlink":
        workspace.discard_exact(candidate)
        raise InstallError(f"managed mutation refuses non-link path: {path.name}")

    try:
        atomic_exchange(candidate.path, path)
    except (OSError, InstallError):
        workspace.discard_exact(candidate)
        raise
    displaced = _capture_path(candidate.path)
    installed = _capture_path(path)
    if displaced != expected:
        if installed == candidate.snapshot and _restore_exchange(
            path, candidate, installed, displaced
        ):
            restored_candidate = StagedLink(candidate.path, candidate.snapshot)
            workspace.discard_exact(restored_candidate)
            raise InstallError(
                f"managed path changed before atomic exchange; restored newer path: {path.name}"
            )
        raise InstallError(
            f"managed path changed during atomic exchange: {path.name}; "
            f"preserve recovery path {candidate.path}"
        )
    if installed != candidate.snapshot:
        raise InstallError(
            f"managed path changed after atomic exchange: {path.name}; "
            f"preserve recovery path {candidate.path}"
        )
    displaced_link = StagedLink(candidate.path, displaced)
    if not workspace.discard_exact(displaced_link):
        raise InstallError(
            f"managed recovery changed after atomic exchange: {path.name}; "
            f"preserve recovery path {candidate.path}"
        )
    return installed


def _restore_removed_link(path: Path, displaced: StagedLink) -> bool:
    if _capture_path(path).kind != "absent":
        return False
    try:
        _hardlink_if_absent(displaced.path, path)
    except InstallError:
        return False
    return _capture_path(path) == displaced.snapshot


def _atomic_remove_link(
    path: Path,
    expected: PathSnapshot,
    workspace: LinkRecoveryWorkspace,
) -> PathSnapshot:
    if expected.kind == "absent":
        return expected
    if expected.kind != "symlink":
        raise InstallError(f"managed mutation refuses non-link path: {path.name}")
    empty = workspace.stage()
    try:
        os.rename(path, empty.path)
    except FileNotFoundError as exc:
        raise InstallError(f"managed path changed before atomic removal: {path.name}") from exc
    displaced = StagedLink(empty.path, _capture_path(empty.path))
    installed = _capture_path(path)
    if displaced.snapshot != expected or installed.kind != "absent":
        if installed.kind == "absent" and _restore_removed_link(path, displaced):
            workspace.discard_exact(displaced)
            raise InstallError(
                f"managed path changed before atomic removal; restored newer path: {path.name}"
            )
        raise InstallError(
            f"managed path changed during atomic removal: {path.name}; "
            f"preserve recovery path {empty.path}"
        )
    if not workspace.discard_exact(displaced):
        raise InstallError(
            f"managed recovery changed after atomic removal: {path.name}; "
            f"preserve recovery path {empty.path}"
        )
    return installed


def _mutate_link(
    path: Path,
    expected: PathSnapshot,
    source: str | None,
    journal: list[LinkMutation],
    workspace: LinkRecoveryWorkspace,
) -> None:
    installed = (
        _atomic_remove_link(path, expected, workspace)
        if source is None
        else _atomic_replace_link(path, expected, source, workspace)
    )
    journal.append(LinkMutation(path, expected, installed))


def _validate_journal(journal: list[LinkMutation]) -> None:
    changed = [
        mutation.path.name
        for mutation in journal
        if _capture_path(mutation.path) != mutation.installed
    ]
    if changed:
        raise InstallError(
            "managed paths changed before manifest commit: " + ", ".join(sorted(changed))
        )


def _rollback_mutations(
    journal: list[LinkMutation],
    workspace: LinkRecoveryWorkspace,
) -> list[RollbackFailure]:
    failures: list[RollbackFailure] = []
    for mutation in reversed(journal):
        try:
            if mutation.before.kind == "symlink":
                if mutation.before.link_target is None:
                    raise InstallError("managed rollback snapshot is invalid")
                _atomic_replace_link(
                    mutation.path,
                    mutation.installed,
                    mutation.before.link_target,
                    workspace,
                )
            elif mutation.before.kind == "absent":
                _atomic_remove_link(mutation.path, mutation.installed, workspace)
            else:
                raise InstallError("managed rollback refuses non-link snapshot")
        except (OSError, InstallError) as exc:
            failures.append(
                RollbackFailure(
                    mutation.path.name,
                    type(exc).__name__,
                    str(exc),
                )
            )
    return failures


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
            state = "missing" if snapshot.kind == "absent" else "unmanaged"
        elif _same_link_snapshot(destination, source_path, snapshot):
            state = "managed" if entry.get("source_sha256") == _sha_skill(source_path) else "stale"
        elif snapshot.kind == "symlink":
            assert snapshot.link_target is not None
            resolved = destination.parent / snapshot.link_target
            state = "stale" if not resolved.exists() else "conflicting"
        elif snapshot.kind == "absent":
            state = "stale"
        else:
            state = "conflicting"
        items.append({"name": name, "state": state})
    for name in sorted(set(managed) - set(skills)):
        destination = target / name
        snapshot = snapshots[name]
        if _same_link_snapshot(
            destination,
            Path(managed[name].get("source_target", "/missing")),
            snapshot,
        ):
            state = "retired-managed"
        elif snapshot.kind == "absent":
            state = "retired-missing"
        else:
            state = "conflicting"
        items.append({"name": name, "state": state})
    return items


def _fsync_directory(path: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _integrity(source: Path, target: Path) -> list[dict[str, str]]:
    """Report the installed catalogue without claiming ownership of foreign entries."""
    skills = _skills(source)
    items: list[dict[str, str]] = []
    for name, source_path in skills.items():
        destination = target / name
        snapshot = _capture_path(destination)
        if _same_link_snapshot(destination, source_path, snapshot):
            state = "present"
        elif snapshot.kind == "absent":
            state = "missing"
        elif snapshot.kind == "symlink":
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
        try:
            _fsync_directory(path.parent)
        except OSError as exc:
            raise ManifestCommitUncertainError(
                "installation manifest replaced but parent-directory durability "
                f"is uncertain: {path}"
            ) from exc
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
        if old_snapshot.kind != "absent" and not _same_link_snapshot(
            old_destination, old_source, old_snapshot
        ):
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
            "manage_new": new in managed or new in creating,
            "entry": _entry(new, skills[new], list(target_history[new])),
        })
    return operations


def _apply_renames(
    manifest: dict[str, Any],
    operations: list[dict[str, Any]],
    journal: list[LinkMutation],
    workspace: LinkRecoveryWorkspace,
) -> None:
    for operation in operations:
        if operation["create_new"]:
            _mutate_link(
                operation["new_destination"],
                operation["new_snapshot"],
                str(operation["new_source"]),
                journal,
                workspace,
            )
        if operation["old_snapshot"].kind == "symlink":
            _mutate_link(
                operation["old_destination"],
                operation["old_snapshot"],
                None,
                journal,
                workspace,
            )
    claimed = {operation["new"] for operation in operations if operation["manage_new"]}
    for operation in operations:
        manifest["managed"].pop(operation["old"], None)
    for name in claimed:
        manifest["managed"][name] = next(
            operation["entry"]
            for operation in reversed(operations)
            if operation["new"] == name
        )


def _execute_locked(action: str, source: Path, target: Path, renames: Path | None = None) -> dict[str, Any]:
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
    target_created = not target.is_dir()
    target.mkdir(parents=True, exist_ok=True)
    rename_registry = _load_renames(renames) if action == "reconcile" else []
    skills = _skills(source)
    tracked = set(manifest["managed"]) | set(skills)
    tracked |= {item[key] for item in rename_registry for key in ("from", "to")}
    snapshots = _snapshot_paths(target, tracked)
    rename_operations: list[dict[str, Any]] = []
    if action == "reconcile":
        rename_operations = _prepare_renames(
            source, target, manifest, rename_registry, snapshots
        )
    items = _plan(source, target, manifest, snapshots)
    renamed_old = {operation["old"] for operation in rename_operations}
    conflicts = [item["name"] for item in items if item["state"] == "conflicting" and item["name"] not in renamed_old]
    if conflicts:
        raise InstallError("conflicting managed targets: " + ", ".join(conflicts))
    changed: list[str] = []
    journal: list[LinkMutation] = []
    workspace = LinkRecoveryWorkspace(target.parent)
    try:
        if rename_operations:
            _apply_renames(manifest, rename_operations, journal, workspace)
            changed.extend(operation["old"] for operation in rename_operations)
            changed.extend(
                operation["new"]
                for operation in rename_operations
                if operation["create_new"]
            )
            post_rename_snapshots = _snapshot_paths(
                target, set(manifest["managed"]) | set(skills)
            )
            items = _plan(source, target, manifest, post_rename_snapshots)
        else:
            post_rename_snapshots = snapshots
        if action in {"install", "reconcile"}:
            for item in items:
                name, state = item["name"], item["state"]
                if state in {"missing", "stale"}:
                    destination = target / name
                    _mutate_link(
                        destination,
                        post_rename_snapshots[name],
                        str(skills[name]),
                        journal,
                        workspace,
                    )
                    history = list(manifest["managed"].get(name, {}).get("history", []))
                    manifest["managed"][name] = _entry(name, skills[name], history)
                    changed.append(name)
                elif state == "retired-managed":
                    _mutate_link(
                        target / name,
                        post_rename_snapshots[name],
                        None,
                        journal,
                        workspace,
                    )
                    del manifest["managed"][name]
                    changed.append(name)
                elif state == "retired-missing":
                    del manifest["managed"][name]
                    changed.append(name)
        elif action == "uninstall-managed":
            for name, entry in list(manifest["managed"].items()):
                destination = target / name
                snapshot = snapshots[name]
                if _same_link_snapshot(
                    destination,
                    Path(entry.get("source_target", "/missing")),
                    snapshot,
                ):
                    _mutate_link(destination, snapshot, None, journal, workspace)
                    del manifest["managed"][name]
                    changed.append(name)
                elif snapshot.kind != "absent":
                    raise InstallError(f"conflicting managed target changed outside harness: {name}")
                else:
                    del manifest["managed"][name]
        else:
            raise InstallError(f"unsupported action: {action}")

        _validate_journal(journal)
        if journal:
            # Link directory entries and any private displaced recovery must be
            # durable before the manifest can describe the new ownership set.
            _fsync_directory(target)
            workspace.sync()
            _validate_journal(journal)
        elif target_created:
            _fsync_directory(target)
            _fsync_directory(target.parent)
        _write_manifest(target, manifest)
    except ManifestCommitUncertainError:
        # Replacement already made manifest and links mutually visible. Rolling
        # back here would create a known inconsistency.
        raise
    except (OSError, InstallError) as exc:
        rollback_failures = _rollback_mutations(journal, workspace)
        sync_failure: OSError | None = None
        if journal or workspace.directory is not None:
            try:
                _fsync_directory(target)
                workspace.sync()
            except OSError as sync_exc:
                sync_failure = sync_exc
        if rollback_failures or sync_failure is not None:
            details = [
                f"{failure.name}: {failure.error_type}: {failure.detail}"
                for failure in rollback_failures
            ]
            if sync_failure is not None:
                details.append(
                    f"directory-fsync: {type(sync_failure).__name__}: {sync_failure}"
                )
            raise InstallError("rollback incomplete: " + "; ".join(details)) from exc
        raise
    finally:
        workspace.cleanup()
    return {"schema_version": 1, "action": action, "items": _plan(source, target, manifest), "changed": changed}


def execute(
    action: str,
    source: Path,
    target: Path,
    renames: Path | None = None,
    lock_timeout_ms: int = 10_000,
) -> dict[str, Any]:
    read_only = {"plan", "check"}
    mutations = {"install", "reconcile", "uninstall-managed"}
    if action not in read_only | mutations:
        raise InstallError(f"unsupported action: {action}")
    source = source.resolve()
    target = target.resolve()
    if action in read_only:
        return _execute_locked(action, source, target, renames)
    with _installation_lock(target, lock_timeout_ms):
        # Every mutable read and decision is deliberately recomputed only after
        # the cooperating-writer lock has been acquired.
        return _execute_locked(action, source, target, renames)


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
