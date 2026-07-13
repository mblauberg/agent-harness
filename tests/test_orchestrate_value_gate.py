from collections import Counter
from pathlib import Path
import subprocess
import sys

import yaml


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "orchestrate" / "SKILL.md"
CASES = ROOT / "skills" / "orchestrate" / "evals" / "topology_value_cases.yaml"
CHECKER = ROOT / "skills" / "orchestrate" / "evals" / "check_skill_triggers.py"


def test_orchestrate_requires_the_complete_decomposition_value_gate():
    text = " ".join(SKILL.read_text().lower().split())

    for fragment in (
        "independent information",
        "stable interfaces",
        "non-overlapping writes",
        "independently checkable return contracts",
        "expected information gain",
        "coordination, shared-state and tool-density cost",
        "one chair",
        "serial ownership",
    ):
        assert fragment in text

    assert "default to fan-out for bounded work" not in text


def test_orchestrate_topology_cases_bind_parallelism_to_positive_value():
    data = yaml.safe_load(CASES.read_text())
    assert set(data) == {"schema_version", "target_skill", "cases"}
    assert data["schema_version"] == 1
    assert data["target_skill"] == "orchestrate"

    expected_factor_keys = {
        "independent_information",
        "stable_interfaces",
        "non_overlapping_writes",
        "independently_checkable_returns",
        "expected_information_gain",
        "coordination_shared_state_tool_density_cost",
    }
    outcomes = Counter()
    tags = set()
    for case in data["cases"]:
        assert set(case) == {
            "id", "prompt", "tags", "factors", "expected_topology",
        }
        assert case["id"].startswith("topology-")
        assert case["prompt"].strip()
        assert case["tags"]
        tags.update(case["tags"])

        factors = case["factors"]
        assert set(factors) == expected_factor_keys
        structural_gate = all(
            factors[key]
            for key in (
                "independent_information",
                "stable_interfaces",
                "non_overlapping_writes",
                "independently_checkable_returns",
            )
        )
        value_gate = (
            factors["expected_information_gain"]
            > factors["coordination_shared_state_tool_density_cost"]
        )
        expected = "parallel" if structural_gate and value_gate else "serial"
        assert case["expected_topology"] == expected
        outcomes[expected] += 1

    assert outcomes["parallel"] >= 2
    assert outcomes["serial"] >= 4
    assert {
        "decomposable",
        "bounded",
        "tightly-coupled",
        "shared-error",
        "overlapping-writes",
        "tool-density",
    } <= tags


def test_orchestrate_static_checker_rejects_a_false_parallel_value_claim(tmp_path):
    data = yaml.safe_load(CASES.read_text())
    shared_error = next(
        case for case in data["cases"] if "shared-error" in case["tags"]
    )
    shared_error["expected_topology"] = "parallel"
    invalid = tmp_path / "topology_value_cases.yaml"
    invalid.write_text(yaml.safe_dump(data, sort_keys=False))

    result = subprocess.run(
        [sys.executable, str(CHECKER), "--topology-cases", str(invalid)],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "expected_topology violates the decomposition/value gate" in result.stdout
