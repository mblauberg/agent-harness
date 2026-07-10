import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "skills" / "evaluate" / "scripts" / "validate_evaluation.py"
SPEC = importlib.util.spec_from_file_location("validate_evaluation", PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def receipt():
    return {
        "schema_version": 1,
        "evaluation_id": "E-1",
        "updated_at": "2026-07-10T04:00:00Z",
        "decision": "ship ranking change",
        "status": "pass",
        "dataset": {
            "id": "set", "version": "1", "provenance": "owned",
            "holdout_boundary": "frozen", "data_policy": "internal"
        },
        "runtime": {"models": ["model"], "configuration": {"temperature": 0}, "seed_policy": "fixed", "seeds": [1], "sample_policy": "all"},
        "metrics": [{"name": "quality", "direction": "gte", "threshold": 0.8}],
        "safety_applicability": "not-applicable",
        "safety_cases": [],
        "baseline": {"id": "base", "regression_budget": 0.1, "metrics": [{"name": "quality", "value": 0.85}]},
        "evaluator": {"rubric_version": "1", "independent": True, "disagreement_protocol": "adjudicate"},
        "results": {"metrics": [{"name": "quality", "value": 0.9}], "failure_examples": [], "excluded_cases": []},
        "conclusion": {"status": "pass", "limitations": [], "evidence": ["results"]},
    }


def test_valid_evaluation_passes():
    assert MODULE.validate(receipt()) == []


def test_missing_holdout_and_posthoc_threshold_fail():
    value = receipt()
    value["dataset"]["holdout_boundary"] = ""
    del value["metrics"][0]["threshold"]
    errors = MODULE.validate(value)
    assert "dataset.holdout_boundary is required" in errors
    assert "metrics[0] must record name, direction and numeric threshold" in errors


def test_independent_evaluator_and_evidence_are_required():
    value = receipt()
    value["evaluator"]["independent"] = False
    value["conclusion"]["evidence"] = []
    errors = MODULE.validate(value)
    assert "evaluator must be independent with a rubric_version" in errors
    assert "conclusion must match status and contain evidence" in errors


def test_pass_cannot_ignore_failed_metric_threshold():
    value = receipt()
    value["results"]["metrics"][0]["value"] = 0.7
    assert any(error.startswith("passing conclusion violates metric thresholds: quality") for error in MODULE.validate(value))


def test_reproducibility_baseline_and_unique_metrics_are_enforced():
    value = receipt()
    value["runtime"]["configuration"] = {}
    value["runtime"]["seeds"] = []
    value["baseline"] = {}
    value["metrics"].append(dict(value["metrics"][0]))
    errors = MODULE.validate(value)
    assert "runtime models, configuration and sample_policy are required" in errors
    assert "fixed seed_policy requires scalar seeds" in errors
    assert "baseline id and non-negative numeric regression_budget are required" in errors
    assert "baseline.metrics must not be empty" in errors
    assert "duplicate declared metric name: quality" in errors


def test_non_finite_and_boolean_metrics_are_rejected():
    value = receipt()
    value["metrics"][0]["threshold"] = True
    value["results"]["metrics"][0]["value"] = float("inf")
    errors = MODULE.validate(value)
    assert "metrics[0] must record name, direction and numeric threshold" in errors
    assert "results.metrics[0] must record name and finite numeric value" in errors


def test_required_safety_cases_must_pass_with_evidence():
    value = receipt()
    value["safety_applicability"] = "required"
    value["safety_cases"] = [{"id": "prompt-injection", "status": "fail", "evidence": ["case-1"]}]
    assert "passing conclusion has failed required safety cases" in MODULE.validate(value)


def test_baseline_regression_blocks_a_pass():
    value = receipt()
    value["results"]["metrics"][0]["value"] = 0.81
    value["baseline"]["regression_budget"] = 0.01
    assert any("baseline regression" in error for error in MODULE.validate(value))


def test_negative_regression_budget_is_rejected():
    value = receipt()
    value["baseline"]["regression_budget"] = -0.1
    assert "baseline id and non-negative numeric regression_budget are required" in MODULE.validate(value)


def test_runtime_models_and_seeds_reject_null_entries():
    value = receipt()
    value["runtime"]["models"] = [None]
    value["runtime"]["seeds"] = [None]
    errors = MODULE.validate(value)
    assert "runtime models, configuration and sample_policy are required" in errors
    assert "fixed seed_policy requires scalar seeds" in errors
