#!/usr/bin/env python3
"""Resolve durable harness model aliases into auditable concrete routes."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "config" / "model-routing.json"


def load_catalog() -> dict[str, Any]:
    return json.loads(CATALOG_PATH.read_text())


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
    }
    if not adapter:
        return emit({**base, "status": "unknown_adapter"}, 2)
    args.effort_transport = adapter.get("effort_transport", "none")

    endpoint = adapter["endpoint_provider"]
    substitution = ""
    fallback_model = ""
    identity_source = ""

    if args.model:
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

    distinct = bool(args.lead_family and family != args.lead_family)
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
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    catalog = load_catalog()
    if args.command == "resolve":
        return resolve(args, catalog)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
