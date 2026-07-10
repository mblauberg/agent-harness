#!/usr/bin/env python3
"""Validate a portable stochastic/judgement evaluation receipt."""

from __future__ import annotations

import argparse
from datetime import datetime
import json
import math
from pathlib import Path
import sys
from typing import Any


def obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def seq(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value.endswith("Z"):
        return False
    try:
        datetime.fromisoformat(value[:-1] + "+00:00")
        return True
    except ValueError:
        return False


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def validate(receipt: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if receipt.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if not receipt.get("evaluation_id") or not receipt.get("decision"):
        errors.append("evaluation_id and decision are required")
    if not timestamp(receipt.get("updated_at")):
        errors.append("updated_at must be a UTC timestamp")
    dataset = obj(receipt.get("dataset"))
    for field in ("id", "version", "provenance", "holdout_boundary", "data_policy"):
        if not dataset.get(field):
            errors.append(f"dataset.{field} is required")
    runtime = obj(receipt.get("runtime"))
    models = seq(runtime.get("models"))
    if not models or any(not isinstance(model, str) or not model for model in models) or not runtime.get("sample_policy") or not obj(runtime.get("configuration")):
        errors.append("runtime models, configuration and sample_policy are required")
    if runtime.get("seed_policy") not in {"fixed", "not-applicable"}:
        errors.append("runtime.seed_policy must be fixed or not-applicable")
    seeds = seq(runtime.get("seeds"))
    if runtime.get("seed_policy") == "fixed" and (
        not seeds or any(isinstance(seed, bool) or not isinstance(seed, (int, str)) or seed == "" for seed in seeds)
    ):
        errors.append("fixed seed_policy requires scalar seeds")
    metrics = seq(receipt.get("metrics"))
    if not metrics:
        errors.append("metrics must not be empty")
    definitions: dict[str, tuple[str, float]] = {}
    for index, raw in enumerate(metrics):
        metric = obj(raw)
        name = metric.get("name")
        direction = metric.get("direction")
        threshold = metric.get("threshold")
        if not isinstance(name, str) or not name or direction not in {"gte", "lte", "eq"} or not finite_number(threshold):
            errors.append(f"metrics[{index}] must record name, direction and numeric threshold")
        elif name in definitions:
            errors.append(f"duplicate declared metric name: {name}")
        else:
            definitions[name] = (direction, float(threshold))
    safety_applicability = receipt.get("safety_applicability")
    if safety_applicability not in {"required", "not-applicable"}:
        errors.append("safety_applicability must be required or not-applicable")
    safety_cases = seq(receipt.get("safety_cases"))
    if safety_applicability == "required" and not safety_cases:
        errors.append("required safety evaluation needs safety_cases")
    safety_failed = False
    seen_safety: set[str] = set()
    for index, raw in enumerate(safety_cases):
        case = obj(raw)
        case_id = case.get("id")
        if not isinstance(case_id, str) or not case_id or case_id in seen_safety:
            errors.append(f"safety_cases[{index}] requires a unique id")
        else:
            seen_safety.add(case_id)
        if case.get("status") not in {"pass", "fail"} or not seq(case.get("evidence")):
            errors.append(f"safety_cases[{index}] requires pass/fail status and evidence")
        if case.get("status") != "pass":
            safety_failed = True
    baseline = obj(receipt.get("baseline"))
    if not baseline.get("id") or not finite_number(baseline.get("regression_budget")) or float(baseline.get("regression_budget", -1)) < 0:
        errors.append("baseline id and non-negative numeric regression_budget are required")
    baseline_metrics = seq(baseline.get("metrics"))
    if not baseline_metrics:
        errors.append("baseline.metrics must not be empty")
    baseline_observed: dict[str, float] = {}
    for index, raw in enumerate(baseline_metrics):
        metric = obj(raw)
        if not isinstance(metric.get("name"), str) or not finite_number(metric.get("value")):
            errors.append(f"baseline.metrics[{index}] must record name and finite numeric value")
        elif metric["name"] in baseline_observed:
            errors.append(f"duplicate baseline metric name: {metric['name']}")
        else:
            baseline_observed[metric["name"]] = float(metric["value"])
    evaluator = obj(receipt.get("evaluator"))
    if not evaluator.get("rubric_version") or evaluator.get("independent") is not True:
        errors.append("evaluator must be independent with a rubric_version")
    if not evaluator.get("disagreement_protocol"):
        errors.append("evaluator.disagreement_protocol is required")
    results = obj(receipt.get("results"))
    result_metrics = seq(results.get("metrics"))
    if not result_metrics:
        errors.append("results.metrics must not be empty")
    observed: dict[str, float] = {}
    for index, raw in enumerate(result_metrics):
        result = obj(raw)
        if not isinstance(result.get("name"), str) or not finite_number(result.get("value")):
            errors.append(f"results.metrics[{index}] must record name and finite numeric value")
        elif result["name"] in observed:
            errors.append(f"duplicate result metric name: {result['name']}")
        else:
            observed[result["name"]] = float(result["value"])
    failed: list[str] = []
    for name, (direction, threshold) in definitions.items():
        if name not in observed:
            errors.append(f"results.metrics missing declared metric: {name}")
            continue
        value = observed[name]
        passed = value >= threshold if direction == "gte" else value <= threshold if direction == "lte" else value == threshold
        if not passed:
            failed.append(name)
        if name not in baseline_observed:
            errors.append(f"baseline.metrics missing declared metric: {name}")
        elif finite_number(baseline.get("regression_budget")):
            budget = float(baseline["regression_budget"])
            baseline_value = baseline_observed[name]
            regressed = value < baseline_value - budget if direction == "gte" else value > baseline_value + budget if direction == "lte" else abs(value - baseline_value) > budget
            if regressed:
                failed.append(f"{name} (baseline regression)")
    conclusion = obj(receipt.get("conclusion"))
    if receipt.get("status") not in {"pass", "fail"}:
        errors.append("status must be pass or fail")
    if conclusion.get("status") != receipt.get("status") or not seq(conclusion.get("evidence")):
        errors.append("conclusion must match status and contain evidence")
    if not isinstance(conclusion.get("limitations"), list):
        errors.append("conclusion.limitations must be a list")
    if receipt.get("status") == "pass" and failed:
        errors.append(f"passing conclusion violates metric thresholds: {', '.join(failed)}")
    if receipt.get("status") == "pass" and safety_failed:
        errors.append("passing conclusion has failed required safety cases")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    args = parser.parse_args(argv)
    try:
        data = json.loads(args.receipt.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"invalid evaluation receipt: {exc}", file=sys.stderr)
        return 2
    errors = validate(data if isinstance(data, dict) else {})
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print("PASS: evaluation gate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
