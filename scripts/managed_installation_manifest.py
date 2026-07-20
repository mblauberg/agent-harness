"""Schema, digest and durable persistence for managed-skill manifests."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any, Callable

try:
    import scripts.managed_link_identity as link_identity
except ModuleNotFoundError as exc:
    if exc.name != "scripts":
        raise
    import managed_link_identity as link_identity  # type: ignore[no-redef]


MANIFEST_NAME = ".agent-harness-installation.json"
SKILL_NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class InstallError(ValueError):
    pass


class ManifestCommitUncertainError(InstallError):
    """The manifest pathname changed but its directory fsync failed."""


class ManifestCommitRaceError(ManifestCommitUncertainError):
    """The manifest was published but a bound managed identity then differed."""


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def sha_skill(path: Path) -> str:
    digest = hashlib.sha256()
    for child in sorted(path.rglob("*")):
        relative = child.relative_to(path)
        if (
            any(part in {"__pycache__", ".DS_Store"} for part in relative.parts)
            or child.suffix == ".pyc"
        ):
            continue
        if child.is_symlink():
            raise InstallError(f"skill source contains a symlink: {relative}")
        if not child.is_file():
            continue
        digest.update(relative.as_posix().encode())
        digest.update(b"\0")
        digest.update(b"x" if child.stat().st_mode & 0o111 else b"-")
        digest.update(b"\0")
        digest.update(child.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def manifest_path(target: Path) -> Path:
    return target.parent / MANIFEST_NAME


def empty_manifest(target: Path) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "owner": "agent-harness",
        "target_root": str(target.resolve()),
        "updated_at": now(),
        "managed": {},
        "managed_link_identities": {},
    }


def load_manifest(target: Path) -> dict[str, Any]:
    path = manifest_path(target)
    if not path.exists():
        return empty_manifest(target)
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise InstallError(f"installation manifest is unreadable: {exc}") from exc
    if (
        not isinstance(data, dict)
        or data.get("schema_version") != 1
        or data.get("owner") != "agent-harness"
        or not isinstance(data.get("managed"), dict)
    ):
        raise InstallError("installation manifest is invalid or not owned by agent-harness")
    if data.get("target_root") != str(target.resolve()):
        raise InstallError("installation manifest belongs to a different target root")
    required_entry = {
        "owner",
        "source_target",
        "source_sha256",
        "installed_at",
        "history",
    }
    for name, item in data["managed"].items():
        if not isinstance(name, str) or not SKILL_NAME.fullmatch(name):
            raise InstallError("installation manifest contains an invalid skill name")
        if (
            not isinstance(item, dict)
            or set(item) != required_entry
            or item.get("owner") != "agent-harness"
        ):
            raise InstallError(f"installation manifest entry is invalid: {name}")
        if not isinstance(item.get("source_target"), str) or not Path(
            item["source_target"]
        ).is_absolute():
            raise InstallError(f"installation manifest source target is invalid: {name}")
        if not isinstance(item.get("source_sha256"), str) or not SHA256.fullmatch(
            item["source_sha256"]
        ):
            raise InstallError(f"installation manifest digest is invalid: {name}")
        if not isinstance(item.get("history"), list):
            raise InstallError(f"installation manifest history is invalid: {name}")
    has_identities = "managed_link_identities" in data
    identities = data.get("managed_link_identities", {})
    if (
        not isinstance(identities, dict)
        or any(
            not link_identity.valid_manifest_link_identity(identity)
            for identity in identities.values()
        )
        or (has_identities and set(identities) != set(data["managed"]))
    ):
        raise InstallError("installation manifest managed-link identities are invalid")
    # Whole-field absence identifies a legacy schema-v1 manifest. The next
    # successful locked mutation baselines every currently managed link.
    data["managed_link_identities"] = identities
    return data


def write_manifest(
    target: Path,
    manifest: dict[str, Any],
    sync_directory: Callable[[Path], None],
) -> None:
    path = manifest_path(target)
    path.parent.mkdir(parents=True, exist_ok=True)
    manifest["updated_at"] = now()
    temp: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            dir=path.parent,
            prefix=".installation.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temp = Path(handle.name)
            json.dump(manifest, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
        try:
            sync_directory(path.parent)
        except OSError as exc:
            raise ManifestCommitUncertainError(
                "installation manifest replaced but parent-directory durability "
                f"is uncertain: {path}"
            ) from exc
    finally:
        if temp and temp.exists():
            temp.unlink()


def entry(
    _name: str,
    source: Path,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    return {
        "owner": "agent-harness",
        "source_target": str(source),
        "source_sha256": sha_skill(source),
        "installed_at": now(),
        "history": history or [],
    }
