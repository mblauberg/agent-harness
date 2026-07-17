#!/usr/bin/env python3
"""Configure project-dynamic Agent Fabric MCP entries for primary clients."""

from __future__ import annotations

import argparse
import ctypes
from dataclasses import dataclass
import errno
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import tomllib
from typing import Any


SERVER_NAME = "agent-fabric"
CODEX_TABLES = {"mcp_servers.agent-fabric", "mcp_servers.agent-fabric.env"}
TABLE_HEADER = re.compile(r"^\s*\[([^\[\]]+)]\s*(?:#.*)?$")


class RegistrationError(ValueError):
    pass


class RegistrationConflictError(RegistrationError):
    pass


@dataclass(frozen=True)
class FileIdentity:
    device: int
    inode: int
    mode: int
    size: int
    modified_ns: int


@dataclass(frozen=True)
class ConfigSnapshot:
    requested_path: Path
    target_path: Path
    source_kind: str
    source_identity: FileIdentity | None
    symlink_value: str | None
    target_identity: FileIdentity | None
    digest: str | None
    content: bytes


@dataclass(frozen=True)
class ConfigProposal:
    client: str
    snapshot: ConfigSnapshot
    content: str
    status: str


def _identity(value: os.stat_result) -> FileIdentity:
    return FileIdentity(value.st_dev, value.st_ino, value.st_mode, value.st_size, value.st_mtime_ns)


def _lstat(path: Path) -> os.stat_result | None:
    try:
        return path.lstat()
    except FileNotFoundError:
        return None


def _read_regular(path: Path, client: str) -> tuple[os.stat_result, bytes]:
    descriptor: int | None = None
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise RegistrationError(f"{client} config must be a regular file")
        with os.fdopen(descriptor, "rb") as handle:
            descriptor = None
            content = handle.read()
            after = os.fstat(handle.fileno())
        if _identity(after) != _identity(before):
            raise RegistrationConflictError(f"{client} config changed while it was being read")
        return before, content
    except OSError as exc:
        if exc.errno == errno.ELOOP:
            raise RegistrationError(f"{client} config must not resolve through a symbolic link") from exc
        raise
    finally:
        if descriptor is not None:
            os.close(descriptor)


def _capture(path: Path, client: str) -> ConfigSnapshot:
    source_before = _lstat(path)
    if source_before is None:
        return ConfigSnapshot(path, path, "absent", None, None, None, None, b"")
    source_identity = _identity(source_before)
    symlink_value: str | None = None
    if stat.S_ISLNK(source_before.st_mode):
        try:
            symlink_value = os.readlink(path)
            target = path.resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            raise RegistrationError(f"{client} config symlink cannot be resolved: {exc}") from exc
        source_kind = "symlink"
    else:
        target = path
        source_kind = "direct"
    try:
        target_before, content = _read_regular(target, client)
    except OSError as exc:
        raise RegistrationError(f"{client} config cannot be read: {exc}") from exc
    source_after = _lstat(path)
    target_after = _lstat(target)
    if (
        source_after is None or target_after is None or
        _identity(source_after) != source_identity or
        _identity(target_after) != _identity(target_before) or
        (source_kind == "symlink" and os.readlink(path) != symlink_value)
    ):
        raise RegistrationConflictError(f"{client} config changed while it was being read")
    return ConfigSnapshot(
        path, target, source_kind, source_identity, symlink_value,
        _identity(target_before), sha256(content).hexdigest(), content,
    )


def _text(snapshot: ConfigSnapshot, client: str) -> str:
    try:
        return snapshot.content.decode()
    except UnicodeDecodeError as exc:
        raise RegistrationError(f"{client} config is not UTF-8: {exc}") from exc


def registration(agents_home: Path, state_directory: Path, seat: str) -> dict[str, Any]:
    environment = {
        "AGENT_FABRIC_STATE_DIRECTORY": str(state_directory),
        "AGENT_FABRIC_SEAT": seat,
        "AGENT_FABRIC_CLIENT_LABEL": seat,
    }
    result: dict[str, Any] = {
        "command": str(agents_home / "scripts" / "agent-fabric-mcp"),
        "env": environment,
    }
    if seat == "claude":
        result = {"type": "stdio", **result, "args": []}
    return result


def claude_update(path: Path, desired: dict[str, Any]) -> ConfigProposal:
    snapshot = _capture(path, "Claude")
    text = _text(snapshot, "Claude")
    try:
        value: Any = json.loads(text) if snapshot.source_kind != "absent" else {}
    except json.JSONDecodeError as exc:
        raise RegistrationError(f"Claude config is invalid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise RegistrationError("Claude config root must be an object")
    servers = value.setdefault("mcpServers", {})
    if not isinstance(servers, dict):
        raise RegistrationError("Claude config mcpServers must be an object")
    if servers.get(SERVER_NAME) == desired:
        return ConfigProposal("claude", snapshot, text, "existing")
    servers[SERVER_NAME] = desired
    return ConfigProposal("claude", snapshot, json.dumps(value, indent=2, sort_keys=True) + "\n", "ready")


def _codex_value(text: str) -> dict[str, Any]:
    try:
        value = tomllib.loads(text) if text.strip() else {}
    except tomllib.TOMLDecodeError as exc:
        raise RegistrationError(f"Codex config is invalid TOML: {exc}") from exc
    if not isinstance(value, dict):
        raise RegistrationError("Codex config root must be a table")
    return value


def _remove_codex_tables(text: str) -> tuple[str, bool]:
    output: list[str] = []
    skipping = False
    found = False
    for line in text.splitlines(keepends=True):
        match = TABLE_HEADER.match(line)
        if match:
            name = match.group(1).strip()
            skipping = name in CODEX_TABLES
            found = found or skipping
        if not skipping:
            output.append(line)
    return "".join(output).rstrip(), found


def _toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=True)


def _codex_block(desired: dict[str, Any]) -> str:
    environment = desired["env"]
    return "\n".join([
        "# agent-harness: project-dynamic agent-fabric MCP",
        "[mcp_servers.agent-fabric]",
        f"command = {_toml_string(desired['command'])}",
        "",
        "[mcp_servers.agent-fabric.env]",
        *[f"{key} = {_toml_string(value)}" for key, value in environment.items()],
        "",
    ])


def codex_update(path: Path, desired: dict[str, Any]) -> ConfigProposal:
    snapshot = _capture(path, "Codex")
    text = _text(snapshot, "Codex")
    value = _codex_value(text)
    servers = value.get("mcp_servers", {})
    if not isinstance(servers, dict):
        raise RegistrationError("Codex config mcp_servers must be a table")
    existing = servers.get(SERVER_NAME)
    if existing == desired:
        return ConfigProposal("codex", snapshot, text, "existing")
    prefix, found = _remove_codex_tables(text)
    if existing is not None and not found:
        raise RegistrationError("Codex agent-fabric entry uses an unsupported inline or quoted table form")
    updated = (prefix + "\n\n" if prefix else "") + _codex_block(desired)
    parsed = _codex_value(updated)
    if parsed.get("mcp_servers", {}).get(SERVER_NAME) != desired:
        raise RegistrationError("composed Codex agent-fabric entry is invalid")
    return ConfigProposal("codex", snapshot, updated, "ready")


def _assert_unchanged(proposal: ConfigProposal) -> None:
    current = _capture(proposal.snapshot.requested_path, proposal.client.title())
    if current != proposal.snapshot:
        raise RegistrationConflictError(f"{proposal.client.title()} config changed after registration was composed")


def atomic_exchange(first: Path, second: Path) -> None:
    """Atomically exchange two same-filesystem paths without an overwrite gap."""
    library = ctypes.CDLL(None, use_errno=True)
    first_bytes = os.fsencode(first)
    second_bytes = os.fsencode(second)
    if sys.platform == "darwin":
        operation = library.renamex_np
        operation.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        arguments = (first_bytes, second_bytes, 0x00000002)  # RENAME_SWAP
    elif sys.platform.startswith("linux"):
        try:
            operation = library.renameat2
        except AttributeError as exc:
            raise RegistrationError("atomic config exchange is unavailable on this platform") from exc
        operation.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        arguments = (-100, first_bytes, -100, second_bytes, 0x00000002)  # AT_FDCWD, RENAME_EXCHANGE
    else:
        raise RegistrationError("atomic config exchange is unavailable on this platform")
    operation.restype = ctypes.c_int
    if operation(*arguments) != 0:
        error_number = ctypes.get_errno()
        raise OSError(error_number, os.strerror(error_number), str(second))


def _displaced_matches(proposal: ConfigProposal, displaced: Path) -> bool:
    try:
        identity, content = _read_regular(displaced, proposal.client.title())
    except (OSError, RegistrationError):
        return False
    return _identity(identity) == proposal.snapshot.target_identity \
        and sha256(content).hexdigest() == proposal.snapshot.digest \
        and content == proposal.snapshot.content


def _requested_resolves_to_installed(proposal: ConfigProposal, installed: FileIdentity) -> bool:
    try:
        source = _lstat(proposal.snapshot.requested_path)
        if source is None:
            return False
        if proposal.snapshot.source_kind == "symlink":
            if (
                _identity(source) != proposal.snapshot.source_identity or
                os.readlink(proposal.snapshot.requested_path) != proposal.snapshot.symlink_value
            ):
                return False
        elif _identity(source) != installed:
            return False
        resolved = proposal.snapshot.requested_path.resolve(strict=True)
        if resolved != proposal.snapshot.target_path:
            return False
        target, _ = _read_regular(resolved, proposal.client.title())
        return _identity(target) == installed
    except (OSError, RegistrationError, RuntimeError):
        return False


def write_proposal(proposal: ConfigProposal) -> None:
    target = proposal.snapshot.target_path
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    retain_temporary = False
    try:
        with tempfile.NamedTemporaryFile(
            "w", dir=target.parent, prefix=f".{target.name}.", suffix=".tmp", delete=False,
        ) as handle:
            temporary = Path(handle.name)
            os.chmod(handle.fileno(), 0o600)
            handle.write(proposal.content)
            handle.flush()
            os.fsync(handle.fileno())
        installed_identity = _identity(temporary.stat(follow_symlinks=False))
        _assert_unchanged(proposal)
        if proposal.snapshot.target_identity is None:
            try:
                os.link(temporary, target, follow_symlinks=False)
            except FileExistsError as exc:
                raise RegistrationConflictError(
                    f"{proposal.client.title()} config changed after registration was composed",
                ) from exc
            retain_temporary = True
            if not _requested_resolves_to_installed(proposal, installed_identity):
                raise RegistrationConflictError(
                    f"{proposal.client.title()} config changed during atomic install; "
                    f"preserve recovery file {temporary}",
                )
            temporary.unlink()
            retain_temporary = False
        else:
            atomic_exchange(temporary, target)
            retain_temporary = True
            if (
                not _displaced_matches(proposal, temporary) or
                not _requested_resolves_to_installed(proposal, installed_identity)
            ):
                raise RegistrationConflictError(
                    f"{proposal.client.title()} config changed during atomic exchange; "
                    f"preserve displaced recovery file {temporary}",
                )
            temporary.unlink()
            retain_temporary = False
    finally:
        if temporary and not retain_temporary and temporary.exists():
            temporary.unlink()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=("all", "claude", "codex"), default="all")
    parser.add_argument("--agents-home", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--state-directory", type=Path,
        default=Path(os.environ.get("AGENT_FABRIC_STATE_DIRECTORY", Path.home() / ".local/state/agent-harness/fabric")),
    )
    parser.add_argument("--claude-config", type=Path, default=Path.home() / ".claude.json")
    parser.add_argument(
        "--codex-config", type=Path,
        default=Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "config.toml",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--preflight", action="store_true")
    args = parser.parse_args(argv)
    try:
        agents_home = args.agents_home.resolve(strict=True)
        state_directory = args.state_directory.expanduser()
        if not state_directory.is_absolute():
            raise RegistrationError("Agent Fabric state directory must be absolute")
        if not (agents_home / "scripts" / "agent-fabric-mcp").is_file():
            raise RegistrationError("Agent Fabric MCP wrapper is missing from AGENTS_HOME")
        proposals: list[ConfigProposal] = []
        if args.platform in {"all", "claude"}:
            proposals.append(claude_update(args.claude_config, registration(agents_home, state_directory, "claude")))
        if args.platform in {"all", "codex"}:
            proposals.append(codex_update(args.codex_config, registration(agents_home, state_directory, "codex")))
        if args.check:
            missing = [proposal.client for proposal in proposals if proposal.status != "existing"]
            if missing:
                print("missing: agent-fabric MCP registration for " + ", ".join(missing))
                return 1
        elif not args.preflight:
            for proposal in proposals:
                if proposal.status != "existing":
                    write_proposal(proposal)
        for proposal in proposals:
            verb = (
                "verified" if args.check else
                f"preflight-{proposal.status}" if args.preflight else
                "existing" if proposal.status == "existing" else "configured"
            )
            print(f"agent-fabric MCP {verb} platform={proposal.client} config={proposal.snapshot.target_path}")
        return 0
    except (OSError, RegistrationError) as exc:
        print(f"conflicting: {exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
