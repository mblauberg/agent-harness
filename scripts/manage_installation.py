#!/usr/bin/env python3
"""Plan, install, reconcile or remove only harness-managed skill links."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import ctypes
import fcntl
import json
import os
from pathlib import Path
import secrets
import stat
import tempfile
import sys
import time
from typing import Any, NamedTuple

try:
    import scripts.managed_link_identity as link_identity
    import scripts.managed_installation_manifest as manifest_io
except ModuleNotFoundError as exc:
    if exc.name != "scripts":
        raise
    import managed_link_identity as link_identity  # type: ignore[no-redef]
    import managed_installation_manifest as manifest_io  # type: ignore[no-redef]

PathIdentity = link_identity.PathIdentity
PathSnapshot = link_identity.PathSnapshot

ROOT = Path(__file__).resolve().parents[1]
LOCK_NAME = ".agent-harness-installation.lock"
SKILL_NAME = manifest_io.SKILL_NAME
InstallError = manifest_io.InstallError
ManifestCommitUncertainError = manifest_io.ManifestCommitUncertainError
ManifestCommitRaceError = manifest_io.ManifestCommitRaceError
_now = manifest_io.now
_sha_skill = manifest_io.sha_skill
_load_manifest = manifest_io.load_manifest
_entry = manifest_io.entry


class StagedLink(NamedTuple):
    path: Path
    snapshot: PathSnapshot


class LinkMutation(NamedTuple):
    path: Path
    before: PathSnapshot
    installed: PathSnapshot
    displaced: StagedLink | None


class RollbackFailure(NamedTuple):
    name: str
    error_type: str
    detail: str


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

    def cleanup(self) -> bool:
        if self.directory is None:
            return True
        try:
            self.directory.rmdir()
        except FileNotFoundError:
            pass
        except OSError:
            return False
        self.directory = None
        return True


def _skills(source: Path) -> dict[str, Path]:
    if not source.is_dir():
        raise InstallError("source must be an existing skill directory")
    skills = {path.parent.name: path.parent.resolve() for path in sorted(source.glob("*/SKILL.md"))}
    if any(not SKILL_NAME.fullmatch(name) for name in skills):
        raise InstallError("source contains an invalid skill name")
    return skills


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


def _capture_path(path: Path) -> PathSnapshot:
    try:
        before = path.lstat()
    except FileNotFoundError:
        return PathSnapshot("absent", None, None)
    identity = link_identity.path_identity(before)
    if not stat.S_ISLNK(before.st_mode):
        return PathSnapshot("other", identity, None)
    try:
        link_target = os.readlink(path)
        after = path.lstat()
    except FileNotFoundError as exc:
        raise InstallError(f"managed path changed while snapshotting: {path.name}") from exc
    if link_identity.path_identity(after) != identity or os.readlink(path) != link_target:
        raise InstallError(f"managed path changed while snapshotting: {path.name}")
    return PathSnapshot("symlink", identity, link_target)


def _matches_managed_snapshot(manifest: dict[str, Any], name: str, snapshot: PathSnapshot) -> bool:
    identity = manifest["managed_link_identities"].get(name)
    return identity is None or link_identity.matches_manifest_link_identity(snapshot, identity)


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
) -> tuple[PathSnapshot, StagedLink | None]:
    candidate = workspace.stage(link_target)
    if expected.kind == "absent":
        try:
            _hardlink_if_absent(candidate.path, path)
            installed = _capture_path(path)
            if installed != candidate.snapshot:
                raise InstallError(
                    f"managed path changed after atomic install; preserved newer path: {path.name}"
                )
            return installed, None
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
    return installed, displaced_link


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
) -> tuple[PathSnapshot, StagedLink | None]:
    if expected.kind == "absent":
        return expected, None
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
    return installed, displaced


def _mutate_link(
    path: Path,
    expected: PathSnapshot,
    source: str | None,
    journal: list[LinkMutation],
    workspace: LinkRecoveryWorkspace,
) -> None:
    installed, displaced = (
        _atomic_remove_link(path, expected, workspace)
        if source is None
        else _atomic_replace_link(path, expected, source, workspace)
    )
    journal.append(LinkMutation(path, expected, installed, displaced))


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
    changed_recoveries = [
        mutation.path.name
        for mutation in journal
        if mutation.displaced is not None
        and _capture_path(mutation.displaced.path) != mutation.displaced.snapshot
    ]
    if changed_recoveries:
        raise InstallError(
            "managed recovery paths changed before manifest commit: "
            + ", ".join(sorted(changed_recoveries))
        )


def _restore_replaced_mutation(
    mutation: LinkMutation,
    workspace: LinkRecoveryWorkspace,
) -> None:
    displaced = mutation.displaced
    if displaced is None or displaced.snapshot != mutation.before:
        raise InstallError("managed rollback lacks the exact displaced link")
    if (
        _capture_path(mutation.path) != mutation.installed
        or _capture_path(displaced.path) != mutation.before
    ):
        raise InstallError(
            f"managed rollback identity changed; preserve recovery path {displaced.path}"
        )

    atomic_exchange(displaced.path, mutation.path)
    restored = _capture_path(mutation.path)
    moved_installed = _capture_path(displaced.path)
    if restored == mutation.before and moved_installed == mutation.installed:
        if not workspace.discard_exact(StagedLink(displaced.path, moved_installed)):
            raise InstallError(
                "managed rollback could not discard the replaced installer link; "
                f"preserve recovery path {displaced.path}"
            )
        return

    if restored == mutation.before and moved_installed.kind != "absent":
        raced = StagedLink(displaced.path, moved_installed)
        if _restore_exchange(
            mutation.path,
            raced,
            restored,
            moved_installed,
        ):
            raise InstallError(
                "managed rollback preserved a newer live path; "
                f"preserve recovery path {displaced.path}"
            )
    raise InstallError(
        f"managed rollback identity changed; preserve recovery path {displaced.path}"
    )


def _restore_removed_mutation(
    mutation: LinkMutation,
    workspace: LinkRecoveryWorkspace,
) -> None:
    displaced = mutation.displaced
    if displaced is None or displaced.snapshot != mutation.before:
        raise InstallError("managed rollback lacks the exact removed link")
    if not _restore_removed_link(mutation.path, displaced):
        raise InstallError(
            "managed rollback preserved a newer live path; "
            f"preserve recovery path {displaced.path}"
        )
    if not workspace.discard_exact(displaced):
        raise InstallError(
            "managed rollback could not discard the restored recovery link; "
            f"preserve recovery path {displaced.path}"
        )


def _discard_committed_recoveries(
    journal: list[LinkMutation],
    workspace: LinkRecoveryWorkspace,
) -> None:
    for mutation in journal:
        displaced = mutation.displaced
        if displaced is None:
            continue
        try:
            discarded = workspace.discard_exact(displaced)
        except OSError as exc:
            raise ManifestCommitUncertainError(
                "installation manifest committed but exact recovery cleanup failed; "
                f"preserve recovery path {displaced.path}"
            ) from exc
        if not discarded:
            raise ManifestCommitUncertainError(
                "installation manifest committed but recovery identity changed; "
                f"preserve recovery path {displaced.path}"
            )


def _rollback_mutations(
    journal: list[LinkMutation],
    workspace: LinkRecoveryWorkspace,
) -> list[RollbackFailure]:
    failures: list[RollbackFailure] = []
    for mutation in reversed(journal):
        try:
            if mutation.before.kind == "symlink":
                if mutation.installed.kind == "absent":
                    _restore_removed_mutation(mutation, workspace)
                else:
                    _restore_replaced_mutation(mutation, workspace)
            elif mutation.before.kind == "absent":
                _, displaced = _atomic_remove_link(
                    mutation.path, mutation.installed, workspace
                )
                if displaced is not None and not workspace.discard_exact(displaced):
                    raise InstallError(
                        "managed rollback could not discard the new link; "
                        f"preserve recovery path {displaced.path}"
                    )
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
        elif snapshot.kind == "absent":
            state = "stale"
        elif not _matches_managed_snapshot(manifest, name, snapshot):
            state = "conflicting"
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
        if snapshot.kind == "absent":
            state = "retired-missing"
        elif not _matches_managed_snapshot(manifest, name, snapshot):
            state = "conflicting"
        elif _same_link_snapshot(
            destination,
            Path(managed[name].get("source_target", "/missing")),
            snapshot,
        ):
            state = "retired-managed"
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


def _integrity(
    source: Path,
    target: Path,
    manifest: dict[str, Any],
) -> list[dict[str, str]]:
    """Report the installed catalogue without claiming ownership of foreign entries."""
    skills = _skills(source)
    items: list[dict[str, str]] = []
    for name, source_path in skills.items():
        destination = target / name
        snapshot = _capture_path(destination)
        if (
            name in manifest["managed"]
            and snapshot.kind != "absent"
            and not _matches_managed_snapshot(manifest, name, snapshot)
        ):
            state = "replaced-managed"
        elif _same_link_snapshot(destination, source_path, snapshot):
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

    for name in sorted(set(manifest["managed"]) - set(skills)):
        snapshot = _capture_path(target / name)
        if snapshot.kind == "absent":
            scope, state = "extra", "retired-missing"
        elif not _matches_managed_snapshot(manifest, name, snapshot):
            scope, state = "required", "replaced-managed"
        else:
            scope, state = "extra", "retired-managed"
        items.append({"name": name, "scope": scope, "state": state})

    if target.is_dir():
        for destination in sorted(target.iterdir()):
            name = destination.name
            if (
                name == ".DS_Store"
                or name in skills
                or name in manifest["managed"]
                or not destination.is_symlink()
            ):
                continue
            try:
                destination.resolve(strict=False).relative_to(source)
                state = "noncanonical"
            except (OSError, ValueError):
                state = "foreign"
            items.append({"name": name, "scope": "extra", "state": state})
    return items


def _write_manifest(target: Path, manifest: dict[str, Any]) -> None:
    manifest_io.write_manifest(target, manifest, _fsync_directory)


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
        if old_snapshot.kind != "absent" and (
            not _matches_managed_snapshot(manifest, old, old_snapshot)
            or not _same_link_snapshot(old_destination, old_source, old_snapshot)
        ):
            raise InstallError(f"conflicting managed rename source: {old}")
        new_is_correct = _same_link_snapshot(new_destination, skills[new], new_snapshot)
        if new_snapshot.kind != "absent" and not new_is_correct:
            raise InstallError(f"conflicting rename target: {new}")
        if (
            new in managed
            and new_snapshot.kind != "absent"
            and not _matches_managed_snapshot(manifest, new, new_snapshot)
        ):
            raise InstallError(f"conflicting managed rename target: {new}")
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
        items = _integrity(source, target, manifest)
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
    manifest_published = False
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
                ) and _matches_managed_snapshot(manifest, name, snapshot):
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
        try:
            expected_managed = link_identity.expected_managed_snapshots(
                set(manifest["managed"]), snapshots, journal
            )
        except ValueError as exc:
            raise InstallError(str(exc)) from exc
        changed_managed = link_identity.changed_managed_snapshots(target, expected_managed, _capture_path)
        if changed_managed:
            raise InstallError(
                "managed identities changed before manifest commit: "
                + ", ".join(changed_managed)
            )
        manifest["managed_link_identities"] = {
            name: link_identity.manifest_link_identity(snapshot)
            for name, snapshot in expected_managed.items()
        }
        if journal:
            # Link directory entries and any private displaced recovery must be
            # durable before the manifest can describe the new ownership set.
            _fsync_directory(target)
            workspace.sync()
            _validate_journal(journal)
            changed_managed = link_identity.changed_managed_snapshots(target, expected_managed, _capture_path)
            if changed_managed:
                raise InstallError(
                    "managed identities changed before manifest commit: "
                    + ", ".join(changed_managed)
                )
        elif target_created:
            _fsync_directory(target)
            _fsync_directory(target.parent)
        _write_manifest(target, manifest)
        manifest_published = True
        changed_managed = link_identity.changed_managed_snapshots(target, expected_managed, _capture_path)
        if changed_managed:
            raise ManifestCommitRaceError(
                "managed identity changed after manifest publication; "
                "preserved live path and retained exact manifest evidence: "
                + ", ".join(changed_managed)
            )
        result_items = _plan(source, target, manifest)
        _discard_committed_recoveries(journal, workspace)
        if not workspace.cleanup():
            raise ManifestCommitUncertainError(
                "installation manifest committed but recovery-directory cleanup failed; "
                "retained the recovery directory"
            )
    except ManifestCommitUncertainError:
        # Replacement already made manifest and links mutually visible. Rolling
        # back here would create a known inconsistency.
        raise
    except (OSError, InstallError) as exc:
        if manifest_published:
            raise ManifestCommitUncertainError(
                "installation manifest committed but post-publication validation failed; "
                "preserved the manifest and live links; retained remaining recovery evidence"
            ) from exc
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
        if not manifest_published:
            workspace.cleanup()
    return {"schema_version": 1, "action": action, "items": result_items, "changed": changed}


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
