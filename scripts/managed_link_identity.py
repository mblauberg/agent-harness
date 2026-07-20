"""Exact, JSON-safe identity for managed symbolic links."""

from __future__ import annotations

import os
from pathlib import Path
import stat
from typing import Any, Callable, NamedTuple


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


def path_identity(value: os.stat_result) -> PathIdentity:
    return PathIdentity(
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
    )


def manifest_link_identity(snapshot: PathSnapshot) -> dict[str, int | str]:
    if snapshot.kind != "symlink" or snapshot.identity is None or snapshot.link_target is None:
        raise ValueError("managed manifest identity requires a symlink snapshot")
    return {
        "device": snapshot.identity.device,
        "inode": snapshot.identity.inode,
        "mode": snapshot.identity.mode,
        "size": snapshot.identity.size,
        "modified_ns": snapshot.identity.modified_ns,
        "link_target": snapshot.link_target,
    }


def valid_manifest_link_identity(value: Any) -> bool:
    fields = {"device", "inode", "mode", "size", "modified_ns", "link_target"}
    return (
        isinstance(value, dict)
        and set(value) == fields
        and all(
            isinstance(value[field], int)
            and not isinstance(value[field], bool)
            and value[field] >= 0
            for field in fields - {"link_target"}
        )
        and isinstance(value["link_target"], str)
        and stat.S_ISLNK(value["mode"])
    )


def matches_manifest_link_identity(snapshot: PathSnapshot, value: Any) -> bool:
    return (
        snapshot.kind == "symlink"
        and valid_manifest_link_identity(value)
        and manifest_link_identity(snapshot) == value
    )


def expected_managed_snapshots(
    managed_names: set[str],
    snapshots: dict[str, PathSnapshot],
    journal: list[Any],
) -> dict[str, PathSnapshot]:
    expected = {name: snapshots[name] for name in managed_names if name in snapshots}
    for mutation in journal:
        name = mutation.path.name
        if name in managed_names:
            expected[name] = mutation.installed
        else:
            expected.pop(name, None)
    if set(expected) != managed_names or any(
        snapshot.kind != "symlink" for snapshot in expected.values()
    ):
        raise ValueError("managed identity set is incomplete before manifest commit")
    return expected


def changed_managed_snapshots(
    target: Path,
    expected: dict[str, PathSnapshot],
    capture: Callable[[Path], PathSnapshot],
) -> list[str]:
    return sorted(
        name for name, snapshot in expected.items()
        if capture(target / name) != snapshot
    )
