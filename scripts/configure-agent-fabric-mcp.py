#!/usr/bin/env python3
"""Configure project-dynamic Agent Fabric MCP entries for primary clients."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import tomllib
from typing import Any


SERVER_NAME = "agent-fabric"
CODEX_TABLES = {"mcp_servers.agent-fabric", "mcp_servers.agent-fabric.env"}
TABLE_HEADER = re.compile(r"^\s*\[([^\[\]]+)]\s*(?:#.*)?$")


class RegistrationError(ValueError):
    pass


def canonical_path(path: Path, client: str) -> Path:
    try:
        if path.is_symlink():
            target = path.resolve(strict=True)
            if not target.is_file():
                raise RegistrationError(f"{client} config symlink must target a regular file")
            return target
    except (OSError, RuntimeError) as exc:
        raise RegistrationError(f"{client} config symlink cannot be resolved: {exc}") from exc
    return path


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


def claude_update(path: Path, desired: dict[str, Any]) -> tuple[Path, str, str]:
    target = canonical_path(path, "Claude")
    try:
        value: Any = json.loads(target.read_text()) if target.exists() else {}
    except json.JSONDecodeError as exc:
        raise RegistrationError(f"Claude config is invalid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise RegistrationError("Claude config root must be an object")
    servers = value.setdefault("mcpServers", {})
    if not isinstance(servers, dict):
        raise RegistrationError("Claude config mcpServers must be an object")
    if servers.get(SERVER_NAME) == desired:
        return target, target.read_text(), "existing"
    servers[SERVER_NAME] = desired
    return target, json.dumps(value, indent=2, sort_keys=True) + "\n", "ready"


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


def codex_update(path: Path, desired: dict[str, Any]) -> tuple[Path, str, str]:
    target = canonical_path(path, "Codex")
    text = target.read_text() if target.exists() else ""
    value = _codex_value(text)
    servers = value.get("mcp_servers", {})
    if not isinstance(servers, dict):
        raise RegistrationError("Codex config mcp_servers must be a table")
    existing = servers.get(SERVER_NAME)
    if existing == desired:
        return target, text, "existing"
    prefix, found = _remove_codex_tables(text)
    if existing is not None and not found:
        raise RegistrationError("Codex agent-fabric entry uses an unsupported inline or quoted table form")
    updated = (prefix + "\n\n" if prefix else "") + _codex_block(desired)
    parsed = _codex_value(updated)
    if parsed.get("mcp_servers", {}).get(SERVER_NAME) != desired:
        raise RegistrationError("composed Codex agent-fabric entry is invalid")
    return target, updated, "ready"


def _write(target: Path, content: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", dir=target.parent, prefix=f".{target.name}.", suffix=".tmp", delete=False,
        ) as handle:
            temporary = Path(handle.name)
            os.chmod(handle.fileno(), 0o600)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
    finally:
        if temporary and temporary.exists():
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
        proposals: list[tuple[str, Path, str, str]] = []
        if args.platform in {"all", "claude"}:
            proposals.append(("claude", *claude_update(args.claude_config, registration(agents_home, state_directory, "claude"))))
        if args.platform in {"all", "codex"}:
            proposals.append(("codex", *codex_update(args.codex_config, registration(agents_home, state_directory, "codex"))))
        if args.check:
            missing = [client for client, _path, _content, status in proposals if status != "existing"]
            if missing:
                print("missing: agent-fabric MCP registration for " + ", ".join(missing))
                return 1
        elif not args.preflight:
            for _client, path, content, status in proposals:
                if status != "existing":
                    _write(path, content)
        for client, path, _content, status in proposals:
            verb = (
                "verified" if args.check else
                f"preflight-{status}" if args.preflight else
                "existing" if status == "existing" else "configured"
            )
            print(f"agent-fabric MCP {verb} platform={client} config={path}")
        return 0
    except (OSError, RegistrationError) as exc:
        print(f"conflicting: {exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
