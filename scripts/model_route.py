#!/usr/bin/env python3
"""Resolve durable harness model aliases into auditable concrete routes."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fnmatch import fnmatchcase
import json
from pathlib import Path
import re
import sys
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "config" / "model-routing.json"
COMPATIBILITY_PATH = ROOT / "config" / "adapter-compatibility.yaml"
FABRIC_CONFIG_PATH = ROOT / "config" / "agent-fabric.yaml"
COMPATIBILITY_ADAPTER_IDS = {
    "claude": "claude-agent-sdk",
    "codex": "codex-app-server",
    "agy": "agy",
    "cursor": "cursor-agent",
    "kiro": "kiro-acp",
    "pi": "pi-rpc",
}


def load_catalog() -> dict[str, Any]:
    return json.loads(CATALOG_PATH.read_text())


def load_adapter_compatibility(adapter: str) -> tuple[dict[str, Any] | None, str]:
    compatibility_id = COMPATIBILITY_ADAPTER_IDS.get(adapter)
    if compatibility_id is None:
        return None, "adapter_compatibility_unknown"
    try:
        data = yaml.safe_load(COMPATIBILITY_PATH.read_text())
    except (OSError, yaml.YAMLError):
        return None, "adapter_compatibility_unavailable"
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        return None, "adapter_compatibility_invalid"
    adapters = data.get("adapters")
    entry = adapters.get(compatibility_id) if isinstance(adapters, dict) else None
    if not isinstance(entry, dict):
        return None, "adapter_compatibility_unknown"
    constraints = entry.get("model_family_constraints")
    allowed = constraints.get("allowed") if isinstance(constraints, dict) else None
    patterns = constraints.get("allowed_model_patterns", []) if isinstance(constraints, dict) else None
    if (
        not isinstance(entry.get("enabled"), bool)
        or not isinstance(entry.get("unresolved_pins"), list)
        or any(not isinstance(item, str) for item in entry.get("unresolved_pins", []))
        or not isinstance(allowed, list)
        or any(not isinstance(item, str) for item in allowed)
        or not isinstance(patterns, list)
        or any(not isinstance(item, str) for item in patterns)
    ):
        return None, "adapter_compatibility_invalid"
    return {
        "compatibility_adapter": compatibility_id,
        "enabled": entry["enabled"],
        "unresolved_pins": entry["unresolved_pins"],
        "allowed_families": allowed,
        "allowed_model_patterns": patterns,
        "requires_explicit_model": constraints.get("requires_explicit_model") is True
        if isinstance(constraints, dict)
        else False,
    }, ""


def load_active_adapters(path: Path) -> tuple[set[str], str]:
    try:
        data = yaml.safe_load(path.read_text())
    except (OSError, yaml.YAMLError):
        return set(), "fabric_activation_unavailable"
    active = data.get("activeAdapters") if isinstance(data, dict) else None
    if not isinstance(data, dict) or data.get("schemaVersion") != 1 or not isinstance(active, list) or any(
        not isinstance(item, str) for item in active
    ):
        return set(), "fabric_activation_invalid"
    return set(active), ""


def check_adapter_compatibility(
    compatibility: dict[str, Any], family: str, model: str
) -> tuple[str, str]:
    allowed = compatibility["allowed_families"]
    patterns = compatibility["allowed_model_patterns"]
    lowered_model = model.lower()
    pattern_match = not patterns or any(
        fnmatchcase(lowered_model, pattern.lower()) for pattern in patterns
    )

    compatibility_family = family if family in allowed else ""
    if not compatibility_family and patterns and "open-weight" in allowed and pattern_match:
        compatibility_family = "open-weight"
    if not compatibility_family:
        return "", "adapter_family_forbidden"
    if not pattern_match:
        return compatibility_family, "adapter_model_forbidden"
    return compatibility_family, ""


def infer_family(model: str, catalog: dict[str, Any]) -> str | None:
    lowered = model.lower()
    for item in catalog["model_patterns"]:
        if re.search(item["pattern"], lowered):
            return item["family"]
    return None


def emit(record: dict[str, Any], code: int) -> int:
    print(json.dumps(record, sort_keys=True))
    return code


def load_capabilities(path: str | None) -> tuple[dict[str, Any], str]:
    if not path:
        return {}, ""
    try:
        data = json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError):
        return {}, "capability_discovery_failed"
    if not isinstance(data, dict) or data.get("schema_version") != 1 or not isinstance(data.get("models"), dict):
        return {}, "capability_discovery_failed"
    if data.get("source") != "codex debug models":
        return {}, "capability_snapshot_untrusted"
    try:
        observed = datetime.fromisoformat(str(data.get("observed_at", "")).replace("Z", "+00:00"))
    except ValueError:
        return {}, "capability_snapshot_untrusted"
    if observed.tzinfo is None:
        return {}, "capability_snapshot_untrusted"
    age = (datetime.now(timezone.utc) - observed).total_seconds()
    if age < -60 or age > 300:
        return {}, "capability_snapshot_stale"
    models = data["models"]
    if not models:
        return {}, "capability_discovery_failed"
    for key, item in models.items():
        if not isinstance(key, str) or not isinstance(item, dict):
            return {}, "capability_discovery_failed"
        if not isinstance(item.get("resolved_model"), str) or not isinstance(item.get("supported_efforts"), list):
            return {}, "capability_discovery_failed"
        if any(not isinstance(effort, str) for effort in item["supported_efforts"]):
            return {}, "capability_discovery_failed"
    return models, ""


def resolve_effort(
    args: argparse.Namespace,
    family: str,
    model: str,
    family_config: dict[str, Any],
    requested_effort: str,
) -> tuple[str | None, str, str, str]:
    """Return effective effort, substitution, failure status, capability source."""
    if args.capability_models and model.lower() not in args.capability_models:
        return None, "", "capability_model_unavailable", "runtime-model-catalog"

    ultra_eligible = (
        args.adapter == "codex"
        and family == "openai"
        and args.alias == "flagship"
        and args.role in family_config.get("ultra_eligible_roles", [])
        and model.lower() in {item.lower() for item in family_config.get("ultra_eligible_models", [])}
    )
    if requested_effort == "ultra" and not ultra_eligible:
        if args.effort:
            return None, "", "effort_unsupported", "policy"
        policy_efforts = set(family_config.get("supported_efforts", {}).get(model.lower(), []))
        fallback = next(
            (item for item in family_config.get("effort_fallback_order", []) if item in policy_efforts),
            "high",
        )
        return fallback, f"ultra unavailable (route is not ultra-eligible); used {fallback}", "", "policy"

    if args.effort_transport == "model-id":
        normalized_model = re.sub(r"(?:^|[-_])extra[-_]high(?=$|[-_])", "-xhigh", model.lower())
        matches = re.findall(r"(?:^|[-_])(low|medium|high|xhigh|max|ultra)(?=$|[-_])", normalized_model)
        derived = matches[-1] if matches else ""
        if args.effort and derived and args.effort != derived:
            return None, "", "adapter_effort_mismatch", "model-id"
        if args.effort and not derived:
            return None, "", "adapter_effort_unresolved", "model-id-unresolved"
        substitution = ""
        if derived and derived != requested_effort:
            substitution = f"adapter model id controls effort; used {derived}"
        return derived, substitution, "", "model-id" if derived else "model-id-unresolved"
    if args.effort_transport == "none":
        if args.effort:
            return None, "", "effort_unsupported", "adapter-no-effort-control"
        return "", "adapter does not expose effort control", "", "adapter-no-effort-control"

    capability_models = args.capability_models
    if capability_models:
        item = capability_models.get(model.lower())
        if not item:
            return None, "", "capability_model_unavailable", "runtime-model-catalog"
        supported = {value.lower() for value in item["supported_efforts"]}
        capability_source = "runtime-model-catalog"
    elif args.available_effort:
        supported = {item.lower() for item in args.available_effort}
        capability_source = "caller-runtime"
    elif family == "openai" and args.adapter == "codex":
        supported = {
            item.lower()
            for item in family_config.get("supported_efforts", {}).get(model.lower(), [])
        }
        capability_source = "dated-catalog"
    else:
        return requested_effort, "", "", "provider-unverified"

    if requested_effort in supported:
        return requested_effort, "", "", capability_source
    if args.effort:
        return None, "", "effort_unsupported", capability_source
    fallback = next(
        (item for item in family_config.get("effort_fallback_order", []) if item in supported),
        None,
    )
    if not fallback:
        return None, "", "no_effort_available", capability_source
    return (
        fallback,
        f"{requested_effort} unavailable (runtime/model capability); used {fallback}",
        "",
        capability_source,
    )


def resolve(args: argparse.Namespace, catalog: dict[str, Any]) -> int:
    capability_models, capability_error = load_capabilities(args.capabilities_file)
    args.capability_models = capability_models
    adapter = catalog["adapters"].get(args.adapter)
    fixed_family = adapter.get("fixed_model_family") if adapter else None
    family_config = catalog["families"].get(fixed_family, {}) if fixed_family else {}
    role_effort = family_config.get("role_effort_defaults", {}).get(args.role, {}).get(args.alias)
    requested_effort = args.effort or role_effort or {"flagship": "high", "workhorse": "medium", "scout": "low"}[args.alias]
    effort_source = "explicit" if args.effort else ("role-default" if role_effort else "alias-default")
    base = {
        "schema_version": 1,
        "catalog_date": catalog["catalog_date"],
        "adapter": args.adapter,
        "alias": args.alias,
        "role": args.role,
        "requested_effort": requested_effort,
        "effort": requested_effort,
        "effort_source": effort_source,
        "lead_family": args.lead_family,
        "adapter_gate": args.adapter_gate,
    }
    if not adapter:
        return emit({**base, "status": "unknown_adapter"}, 2)
    args.effort_transport = adapter.get("effort_transport", "none")
    # account-default adapters dispatch on the provider account's default
    # model: the runtime rejects explicit model ids, so the resolver keeps the
    # catalog id for effort/audit lookups but emits an empty dispatch model.
    account_default = adapter.get("model_selection") == "account-default"

    endpoint = adapter["endpoint_provider"]
    compatibility: dict[str, Any] | None = None
    compatibility_metadata: dict[str, Any] = {}
    active_adapters: set[str] = set()
    if args.adapter_gate == "fabric" and args.adapter not in COMPATIBILITY_ADAPTER_IDS:
        return emit(
            {
                **base,
                "status": "adapter_compatibility_unknown",
                "endpoint_provider": endpoint,
            },
            2,
        )
    if args.adapter in COMPATIBILITY_ADAPTER_IDS:
        compatibility, compatibility_status = load_adapter_compatibility(args.adapter)
        if compatibility_status:
            return emit(
                {
                    **base,
                    "status": compatibility_status,
                    "endpoint_provider": endpoint,
                },
                2,
            )
        compatibility_metadata = {
            "compatibility_adapter": compatibility["compatibility_adapter"],
            "adapter_enabled": compatibility["enabled"],
            "adapter_unresolved_pins": compatibility["unresolved_pins"],
        }
        if args.adapter_gate == "fabric":
            active_adapters, activation_status = load_active_adapters(Path(args.fabric_config))
            if activation_status:
                return emit(
                    {
                        **base,
                        "status": activation_status,
                        "endpoint_provider": endpoint,
                        **compatibility_metadata,
                    },
                    2,
                )
            compatibility_metadata["adapter_active"] = (
                compatibility["compatibility_adapter"] in active_adapters
            )
        if account_default and compatibility["requires_explicit_model"]:
            return emit(
                {
                    **base,
                    "status": "account_default_conflicts_with_compatibility",
                    "endpoint_provider": endpoint,
                    **compatibility_metadata,
                },
                2,
            )
    substitution = ""
    fallback_model = ""
    identity_source = ""

    if args.model:
        if account_default:
            return emit(
                {
                    **base,
                    "status": "adapter_account_default_only",
                    "endpoint_provider": endpoint,
                    "resolved_model": args.model,
                    **compatibility_metadata,
                },
                1,
            )
        model = args.model
        family = infer_family(model, catalog)
        identity_source = "model-pattern"
        if not family:
            return emit(
                {
                    **base,
                    "status": "model_family_unknown",
                    "endpoint_provider": endpoint,
                    "resolved_model": model,
                },
                1,
            )
        if fixed_family and family != fixed_family:
            return emit(
                {
                    **base,
                    "status": "adapter_family_mismatch",
                    "endpoint_provider": endpoint,
                    "model_family": family,
                    "resolved_model": model,
                },
                1,
            )
    else:
        if not fixed_family:
            return emit(
                {**base, "status": "model_required_for_broker", "endpoint_provider": endpoint},
                2,
            )
        family = fixed_family
        family_config = catalog["families"][family]
        candidates = family_config.get("role_overrides", {}).get(args.role, {}).get(args.alias)
        candidates = candidates or family_config["aliases"].get(args.alias)
        if not candidates:
            return emit({**base, "status": "alias_unavailable", "model_family": family}, 1)
        available = {item.lower(): item for item in args.available_model}
        if capability_models:
            available.update(
                {key.lower(): item["resolved_model"] for key, item in capability_models.items()}
            )
        if available:
            chosen = next((candidate for candidate in candidates if candidate.lower() in available), None)
            if not chosen:
                return emit(
                    {
                        **base,
                        "status": "no_candidate_available",
                        "endpoint_provider": endpoint,
                        "model_family": family,
                        "candidates": candidates,
                    },
                    1,
                )
            model = available[chosen.lower()]
            if chosen != candidates[0]:
                substitution = f"{candidates[0]} unavailable; used {chosen}"
            identity_source = "runtime-available+catalog"
        else:
            model = candidates[0]
            fallback_model = candidates[1] if len(candidates) > 1 else ""
            identity_source = "dated-catalog"

    compatibility_family = ""
    if compatibility:
        if args.adapter_gate == "fabric" and not compatibility["enabled"]:
            return emit(
                {
                    **base,
                    "status": "adapter_disabled",
                    "endpoint_provider": endpoint,
                    "model_family": family,
                    "resolved_model": model,
                    "identity_source": identity_source,
                    **compatibility_metadata,
                },
                1,
            )
        if args.adapter_gate == "fabric" and not compatibility_metadata["adapter_active"]:
            return emit(
                {
                    **base,
                    "status": "adapter_inactive",
                    "endpoint_provider": endpoint,
                    "model_family": family,
                    "resolved_model": model,
                    "identity_source": identity_source,
                    **compatibility_metadata,
                },
                1,
            )
        if args.adapter_gate == "fabric" and compatibility["unresolved_pins"]:
            return emit(
                {
                    **base,
                    "status": "adapter_unresolved_pins",
                    "endpoint_provider": endpoint,
                    "model_family": family,
                    "resolved_model": model,
                    "identity_source": identity_source,
                    **compatibility_metadata,
                },
                1,
            )
    distinct = bool(args.lead_family and family != args.lead_family)
    if compatibility and args.require_distinct and not args.lead_family:
        return emit(
            {
                **base,
                "status": "lead_family_required",
                "endpoint_provider": endpoint,
                "model_family": family,
                "resolved_model": model,
                "identity_source": identity_source,
                **compatibility_metadata,
            },
            2,
        )
    if compatibility and args.require_distinct and not distinct:
        return emit(
            {
                **base,
                "status": "same_family_forbidden",
                "endpoint_provider": endpoint,
                "model_family": family,
                "resolved_model": model,
                "identity_source": identity_source,
                "distinct_from_lead": False,
                **compatibility_metadata,
            },
            1,
        )

    if compatibility:
        compatibility_family, compatibility_status = check_adapter_compatibility(
            compatibility, family, model
        )
        if compatibility_status:
            return emit(
                {
                    **base,
                    "status": compatibility_status,
                    "endpoint_provider": endpoint,
                    "model_family": family,
                    "resolved_model": model,
                    "identity_source": identity_source,
                    "compatibility_model_family": compatibility_family,
                    **compatibility_metadata,
                },
                1,
            )

    if capability_error:
        return emit(
            {
                **base,
                "status": capability_error,
                "effort": "",
                "effort_substitution": "",
                "effort_capability_source": "runtime-discovery-failed",
                "endpoint_provider": endpoint,
                "model_family": family,
                "resolved_model": model,
                "identity_source": identity_source,
            },
            1,
        )

    effort, effort_substitution, effort_status, capability_source = resolve_effort(
        args, family, model, family_config, requested_effort
    )
    if effort_status:
        return emit(
            {
                **base,
                "status": effort_status,
                "effort": "",
                "effort_substitution": "",
                "effort_capability_source": capability_source,
                "endpoint_provider": endpoint,
                "model_family": family,
                "resolved_model": model,
                "identity_source": identity_source,
            },
            1,
        )

    record = {
        **base,
        "effort": effort,
        "effort_substitution": effort_substitution,
        "effort_capability_source": capability_source,
        "status": "ok",
        "endpoint_provider": endpoint,
        "model_family": family,
        "resolved_model": model,
        "identity_source": identity_source,
        "substitution": substitution,
        "fallback_model": fallback_model,
        "distinct_from_lead": distinct,
    }
    if account_default:
        record.update(
            {
                "resolved_model": "",
                "catalog_model": model,
                "model_selection": "account-default",
                "identity_source": "account-default",
            }
        )
    if compatibility:
        record.update(
            {
                **compatibility_metadata,
                "compatibility_model_family": compatibility_family,
            }
        )
    if args.require_distinct and not args.lead_family:
        return emit({**record, "status": "lead_family_required"}, 2)
    if args.require_distinct and not distinct:
        return emit({**record, "status": "same_family_forbidden"}, 1)
    return emit(record, 0)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    command = commands.add_parser("resolve")
    command.add_argument("--adapter", required=True)
    command.add_argument("--alias", choices=("flagship", "workhorse", "scout"), required=True)
    command.add_argument("--role", required=True)
    command.add_argument("--effort")
    command.add_argument("--model")
    command.add_argument("--available-model", action="append", default=[])
    command.add_argument("--available-effort", action="append", default=[])
    command.add_argument("--capabilities-file")
    command.add_argument("--lead-family")
    command.add_argument("--require-distinct", action="store_true")
    command.add_argument(
        "--adapter-gate",
        choices=("fabric", "direct-cli"),
        default="fabric",
        help="Apply fabric activation pins (default) or defer activation to a direct CLI caller.",
    )
    command.add_argument(
        "--fabric-config",
        default=str(FABRIC_CONFIG_PATH),
        help=argparse.SUPPRESS,
    )
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    catalog = load_catalog()
    if args.command == "resolve":
        return resolve(args, catalog)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
