#!/usr/bin/env python3
"""Check the documented Herdr CLI surface without contacting a live session."""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import shutil
import subprocess
import sys

import yaml


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CONFIG = ROOT / "config" / "adapter-compatibility.yaml"
DEFAULT_REFERENCE = ROOT / "skills" / "orchestrate" / "references" / "herdr-panes.md"
HELP_GROUPS = ((), ("agent",), ("pane",), ("wait",), ("integration",), ("status",), ("api",))
AGENT_WAIT_STATUSES = {"idle", "working", "blocked", "unknown"}
PANE_WAIT_STATUSES = AGENT_WAIT_STATUSES | {"done"}


class ContractError(ValueError):
    """A deterministic compatibility or command-surface mismatch."""


def _load_pin(path: Path) -> tuple[str, int]:
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
        herdr = document["adapters"]["herdr"]
        implementation = herdr["implementation"]
        contract = herdr["contract"]
        runtime = herdr["runtime_range"]
    except (OSError, yaml.YAMLError, KeyError, TypeError) as exc:
        raise ContractError(f"cannot read Herdr compatibility pin: {exc}") from exc

    version = implementation.get("installed_version")
    protocol = contract.get("protocol_version")
    supported_versions = runtime.get("supported_cli_versions")
    supported_protocols = runtime.get("supported_protocol_versions")
    if not isinstance(version, str) or not version:
        raise ContractError("installed_version must be a non-empty string")
    if type(protocol) is not int:
        raise ContractError("protocol_version must be an integer")
    if not isinstance(supported_versions, list) or version not in supported_versions:
        raise ContractError(
            f"CLI pin {version} is not in supported_cli_versions {supported_versions!r}"
        )
    if not isinstance(supported_protocols, list) or protocol not in supported_protocols:
        raise ContractError(
            f"protocol pin {protocol} is not in supported_protocol_versions {supported_protocols!r}"
        )
    if contract.get("protocol") != "herdr-local-api":
        raise ContractError("Herdr protocol must remain herdr-local-api")
    return version, protocol


def _resolve_binary(value: str | None) -> str | None:
    if value is None:
        return shutil.which("herdr")
    path = Path(value)
    if path.is_absolute() or path.parent != Path("."):
        return str(path) if path.is_file() else None
    return shutil.which(value)


def _invoke(binary: str, args: tuple[str, ...]) -> str:
    result = subprocess.run(
        [binary, *args],
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )
    if result.returncode != 0:
        command = " ".join(("herdr", *args))
        detail = (result.stderr or result.stdout).strip()
        raise ContractError(f"non-mutating command failed: {command}: {detail}")
    # Herdr's root help uses stdout while command-group help uses stderr.
    # Both are successful, non-mutating command surfaces.
    return result.stdout + result.stderr


def _help_surfaces(binary: str) -> dict[str, str]:
    surfaces: dict[str, str] = {}
    for group in HELP_GROUPS:
        key = group[0] if group else "root"
        surfaces[key] = _invoke(binary, (*group, "--help"))
    return surfaces


def _documented_commands(reference: str) -> set[str]:
    commands = set(
        re.findall(r"\bherdr(?: --help|(?: [a-z][a-z0-9-]*){1,2})", reference)
    )
    code_spans = {
        " ".join(span.split())
        for span in re.findall(
            r"(?<!`)`(?!`)(.*?)(?<!`)`(?!`)", reference, re.DOTALL
        )
    }
    commands.update(
        span
        for span in code_spans
        if re.fullmatch(r"herdr integration install [a-z0-9-]+", span)
    )
    if "pane run" in code_spans:
        commands.add("herdr pane run")
    return commands


def _has_command(surface: str, command: str) -> bool:
    return re.search(rf"^\s*{re.escape(command)}(?:\s|$)", surface, re.MULTILINE) is not None


def _validate_documented_commands(reference: str, surfaces: dict[str, str]) -> None:
    for command in sorted(_documented_commands(reference)):
        parts = command.split()
        if command == "herdr --help":
            present = "--help" in surfaces["root"]
        elif len(parts) == 2:
            present = _has_command(surfaces["root"], command)
        else:
            present = _has_command(surfaces.get(parts[1], ""), command)
        if not present:
            raise ContractError(f"documented command is absent from help: {command}")


def _status_set(surface: str, command: str) -> set[str]:
    match = re.search(
        rf"^\s*{re.escape(command)}\b.*?--status <([^>]+)>",
        surface,
        re.MULTILINE,
    )
    if not match:
        raise ContractError(f"status surface is absent from help: {command}")
    return set(match.group(1).split("|"))


def _validate_statuses(reference: str, surfaces: dict[str, str]) -> None:
    agent = _status_set(surfaces["agent"], "herdr agent wait")
    pane = _status_set(surfaces["wait"], "herdr wait agent-status")
    if agent != AGENT_WAIT_STATUSES:
        raise ContractError(
            f"agent wait statuses {sorted(agent)!r} do not match {sorted(AGENT_WAIT_STATUSES)!r}"
        )
    if pane != PANE_WAIT_STATUSES:
        raise ContractError(
            f"pane wait statuses {sorted(pane)!r} do not match {sorted(PANE_WAIT_STATUSES)!r}"
        )

    status_paragraphs = [
        paragraph
        for paragraph in reference.split("\n\n")
        if "`idle`" in paragraph and "`done`" in paragraph and "agent" in paragraph
    ]
    if len(status_paragraphs) != 1:
        raise ContractError("cannot identify the documented agent-status paragraph")
    documented = set(re.findall(r"`([a-z][a-z-]+)`", status_paragraphs[0]))
    unsupported = documented - pane
    if unsupported:
        raise ContractError(f"documented status tokens are absent from help: {sorted(unsupported)!r}")

    agent_examples = set(
        re.findall(r"herdr agent wait[^\n]*?--status ([a-z-]+)", reference)
    )
    invalid_agent_examples = agent_examples - agent
    if invalid_agent_examples:
        raise ContractError(
            f"documented agent wait statuses are invalid: {sorted(invalid_agent_examples)!r}"
        )


def check(binary: str, config: Path, reference_path: Path) -> tuple[str, int]:
    expected_version, protocol = _load_pin(config)
    reference = reference_path.read_text(encoding="utf-8")
    version_output = _invoke(binary, ("--version",)).strip()
    match = re.fullmatch(r"herdr\s+([^\s]+)", version_output)
    if not match:
        raise ContractError(f"cannot parse Herdr version output: {version_output!r}")
    actual_version = match.group(1)
    if actual_version != expected_version:
        raise ContractError(
            f"installed version {actual_version} conflicts with compatibility pin {expected_version}"
        )

    surfaces = _help_surfaces(binary)
    _validate_documented_commands(reference, surfaces)
    _validate_statuses(reference, surfaces)
    return expected_version, protocol


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--reference", type=Path, default=DEFAULT_REFERENCE)
    args = parser.parse_args(argv)

    try:
        expected_version, protocol = _load_pin(args.config)
    except ContractError as exc:
        print(f"HERDR CLI CHECK: FAIL - {exc}")
        return 1

    binary = _resolve_binary(args.binary)
    if binary is None:
        print(
            "HERDR CLI CHECK: SKIP - binary not found "
            f"(expected version {expected_version}, protocol {protocol})"
        )
        return 0

    try:
        version, protocol = check(binary, args.config, args.reference)
    except (ContractError, OSError, subprocess.SubprocessError) as exc:
        print(f"HERDR CLI CHECK: FAIL - {exc}")
        return 1

    print(
        "HERDR CLI CHECK: PASS - "
        f"version {version}, protocol {protocol}; version and group help only"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
