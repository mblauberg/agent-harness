import copy
import importlib.util
import json
from pathlib import Path

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "evals" / "lifecycle-routing.yaml"
VALIDATOR = ROOT / "scripts" / "validate_lifecycle_routing.py"


def load_validator():
    spec = importlib.util.spec_from_file_location("validate_lifecycle_routing", VALIDATOR)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def receipt(tmp_path):
    cases = yaml.safe_load(DATASET.read_text())["cases"]
    catalogue = tmp_path / "catalogue.txt"
    catalogue.write_text("".join(f"- {name}: test description\n" for name in sorted({case["expected_skill"] for case in cases})))
    instruction = tmp_path / "instruction.txt"
    instruction.write_text("choose exactly one retained skill\n")
    packet = tmp_path / "packet.txt"
    prompts = "\n".join(f"c{index:02d}: {case['prompt']}" for index, case in enumerate(cases, 1)) + "\n"
    packet.write_text(instruction.read_text() + "\n## Skill catalogue\n\n" + catalogue.read_text() + "\n## Prompts\n\n" + prompts)
    invocations = []
    trials = []
    for index in range(3):
        output = tmp_path / f"trial-{index + 1}.json"
        output.write_text(json.dumps({"trial": index + 1, "selections": [
            {"case_id": case["id"], "selected_skill": case["expected_skill"]} for case in cases
        ]}))
        invocations.append({
            "trial": index + 1,
            "invocation_id": f"INV-{index + 1}",
            "adapter": "recorded-eval",
            "provider_family": "openai" if index % 2 == 0 else "anthropic",
            "model": "runtime-resolved",
            "input_packet_sha256": "sha256:" + __import__("hashlib").sha256(packet.read_bytes()).hexdigest(),
            "input_packet_artifact": packet.name,
            "output_artifact": output.name,
            "output_sha256": "sha256:" + __import__("hashlib").sha256(output.read_bytes()).hexdigest(),
            "parser_version": "skill-name-exact-v1",
        })
        for case in cases:
            trials.append({
                "case_id": case["id"],
                "trial": index + 1,
                "invocation_id": f"INV-{index + 1}",
                "selected_skill": case["expected_skill"],
                "status": "pass",
                "reason_code": "expected-route",
            })
    return {
        "schema_version": 1,
        "dataset_sha256": "sha256:" + __import__("hashlib").sha256(DATASET.read_bytes()).hexdigest(),
        "harness_revision": "test-revision",
        "catalogue_sha256": "sha256:" + __import__("hashlib").sha256(catalogue.read_bytes()).hexdigest(),
        "catalogue_artifact": catalogue.name,
        "classifier_prompt_sha256": "sha256:" + __import__("hashlib").sha256(instruction.read_bytes()).hexdigest(),
        "classifier_prompt_artifact": instruction.name,
        "minimum_trials": 3,
        "threshold": {"numerator": len(trials), "denominator": len(trials), "minimum_rate": 0.9},
        "invocations": invocations,
        "selections": trials,
    }


def test_held_out_dataset_covers_profiles_negatives_and_boundaries():
    data = yaml.safe_load(DATASET.read_text())
    cases = data["cases"]
    assert {case["profile"] for case in cases if case["profile"]} == {"software", "research", "analysis", "document", "agent-product"}
    assert {case["kind"] for case in cases} == {"positive", "negative", "boundary"}
    assert len({case["id"] for case in cases}) == len(cases)
    assert all(case["prompt"].strip() and case["expected_skill"].strip() for case in cases)


def test_repeated_trial_receipt_passes_with_raw_numerator_and_denominator(tmp_path):
    load_validator().validate(receipt(tmp_path), DATASET, evidence_root=tmp_path)


def test_missing_trials_and_wrong_routes_fail(tmp_path):
    module = load_validator()
    candidate = receipt(tmp_path)
    candidate["selections"] = candidate["selections"][:-1]
    with pytest.raises(module.Invalid, match="trial count"):
        module.validate(candidate, DATASET, evidence_root=tmp_path)
    candidate = receipt(tmp_path)
    candidate["selections"][0]["selected_skill"] = "scope"
    candidate["selections"][0]["status"] = "pass"
    with pytest.raises(module.Invalid, match="status disagrees"):
        module.validate(candidate, DATASET, evidence_root=tmp_path)


def test_threshold_cannot_hide_missing_or_failed_trials(tmp_path):
    module = load_validator()
    candidate = receipt(tmp_path)
    candidate["selections"][0]["selected_skill"] = "scope"
    candidate["selections"][0]["status"] = "fail"
    output = tmp_path / candidate["invocations"][0]["output_artifact"]
    value = json.loads(output.read_text())
    value["selections"][0]["selected_skill"] = "scope"
    output.write_text(json.dumps(value))
    candidate["invocations"][0]["output_sha256"] = "sha256:" + __import__("hashlib").sha256(output.read_bytes()).hexdigest()
    with pytest.raises(module.Invalid, match="numerator"):
        module.validate(candidate, DATASET, evidence_root=tmp_path)


def test_duplicate_invocation_or_tampered_output_evidence_fails(tmp_path):
    module = load_validator()
    candidate = receipt(tmp_path)
    candidate["invocations"][1]["invocation_id"] = candidate["invocations"][0]["invocation_id"]
    with pytest.raises(module.Invalid, match="invocation"):
        module.validate(candidate, DATASET, evidence_root=tmp_path)
    candidate = receipt(tmp_path)
    (tmp_path / candidate["invocations"][0]["output_artifact"]).write_text("tampered")
    with pytest.raises(module.Invalid, match="output evidence"):
        module.validate(candidate, DATASET, evidence_root=tmp_path)


def test_selected_skill_must_exist_in_retained_catalogue(tmp_path):
    module = load_validator()
    candidate = receipt(tmp_path)
    candidate["selections"][0].update({"selected_skill": "invented-skill", "status": "fail", "reason_code": "wrong-skill"})
    output = tmp_path / candidate["invocations"][0]["output_artifact"]
    value = json.loads(output.read_text())
    value["selections"][0]["selected_skill"] = "invented-skill"
    output.write_text(json.dumps(value))
    candidate["invocations"][0]["output_sha256"] = "sha256:" + __import__("hashlib").sha256(output.read_bytes()).hexdigest()
    with pytest.raises(module.Invalid, match="absent from the retained catalogue"):
        module.validate(candidate, DATASET, evidence_root=tmp_path)


def test_input_packet_must_be_exact_composition_of_retained_inputs(tmp_path):
    module = load_validator()
    candidate = receipt(tmp_path)
    packet = tmp_path / candidate["invocations"][0]["input_packet_artifact"]
    packet.write_text("unrelated packet\n")
    digest = "sha256:" + __import__("hashlib").sha256(packet.read_bytes()).hexdigest()
    for invocation in candidate["invocations"]:
        invocation["input_packet_sha256"] = digest
    with pytest.raises(module.Invalid, match="does not match retained components"):
        module.validate(candidate, DATASET, evidence_root=tmp_path)
