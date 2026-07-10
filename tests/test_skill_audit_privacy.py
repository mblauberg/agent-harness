import copy
import importlib.util
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "skills" / "skill-audit" / "SKILL-TELEMETRY.template.json"
MODULE_PATH = ROOT / "skills" / "skill-audit" / "scripts" / "validate_telemetry.py"


def load_module():
    spec = importlib.util.spec_from_file_location("validate_telemetry", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def data():
    return json.loads(TEMPLATE.read_text())


def test_template_is_valid_and_skill_body_is_compact():
    module = load_module()
    module.validate(data(), ROOT)
    skill = (ROOT / "skills" / "skill-audit" / "SKILL.md").read_text()
    assert len(skill.split()) <= 500
    assert "Do not scan provider transcripts" in " ".join(skill.split())
    assert "Absent or unsupported telemetry is `N/A`" in skill


@pytest.mark.parametrize("forbidden", ["prompt", "messages", "path", "session_id", "tool_arguments"])
def test_raw_or_identifying_fields_are_rejected(forbidden):
    module = load_module()
    candidate = data()
    candidate["events"][0][forbidden] = "private-value"
    with pytest.raises(module.Invalid, match="forbidden telemetry key"):
        module.validate(candidate, ROOT)


def test_privacy_flags_cannot_be_relaxed():
    module = load_module()
    candidate = data()
    candidate["privacy"]["content_captured"] = True
    with pytest.raises(module.Invalid, match="content_captured must be false"):
        module.validate(candidate, ROOT)


def test_unknown_skills_and_unscoped_events_are_rejected():
    module = load_module()
    candidate = data()
    candidate["scope"]["skills"] = ["not-a-real-skill"]
    with pytest.raises(module.Invalid, match="unknown skill"):
        module.validate(candidate, ROOT)


def test_portable_event_cells_enforce_minimum_cell_size():
    module = load_module()
    candidate = copy.deepcopy(data())
    candidate["privacy"]["persistence"] = "portable-aggregate"
    candidate["events"][2]["count"] = 4
    with pytest.raises(module.Invalid, match="minimum cell size"):
        module.validate(candidate, ROOT)


def test_portable_summary_counts_cannot_bypass_event_reconciliation():
    module = load_module()
    candidate = data()
    candidate["privacy"]["persistence"] = "portable-aggregate"
    candidate["aggregates"][0]["corrections"] = 1
    with pytest.raises(module.Invalid, match="does not reconcile"):
        module.validate(candidate, ROOT)


@pytest.mark.parametrize(("field", "value"), [("limitations", ["private sentence here"]), ("reason", "private sentence here")])
def test_free_text_cannot_hide_in_metadata_fields(field, value):
    module = load_module()
    candidate = data()
    if field == "limitations":
        candidate[field] = value
    else:
        candidate["adapters"][0]["status"] = "partial"
        candidate["adapters"][0][field] = value
    with pytest.raises(module.Invalid, match="unknown .* code"):
        module.validate(candidate, ROOT)


def test_adapter_accounting_must_conserve_records():
    module = load_module()
    candidate = data()
    candidate["adapters"][0]["records_emitted"] = 7
    with pytest.raises(module.Invalid, match="does not conserve"):
        module.validate(candidate, ROOT)


def test_event_and_aggregate_counts_must_reconcile():
    module = load_module()
    candidate = data()
    candidate["aggregates"][0]["completions"] = 7
    with pytest.raises(module.Invalid, match="does not reconcile"):
        module.validate(candidate, ROOT)


@pytest.mark.parametrize("bucket", ["1999-W99", "1999-01-01"])
def test_buckets_must_be_real_and_overlap_scope(bucket):
    module = load_module()
    candidate = data()
    candidate["events"][0]["bucket"] = bucket
    with pytest.raises(module.Invalid, match="calendar bucket|outside the scope"):
        module.validate(candidate, ROOT)


def test_retention_must_follow_generation():
    module = load_module()
    candidate = data()
    candidate["privacy"]["retention_until"] = candidate["generated_at"]
    with pytest.raises(module.Invalid, match="retention_until"):
        module.validate(candidate, ROOT)


@pytest.mark.parametrize(
    ("target", "value", "message"),
    [
        ("collection_id", "Anese_Legal", "opaque STEL"),
        ("platform", "Anese_Legal", "unknown platform"),
        ("adapter", "client-Anese_Legal", "unknown adapter"),
        ("limitation", "client-Anese_Legal", "unknown limitation"),
    ],
)
def test_portable_metadata_rejects_project_or_client_identifiers(target, value, message):
    module = load_module()
    candidate = data()
    candidate["privacy"]["persistence"] = "portable-aggregate"
    if target == "collection_id":
        candidate["collection_id"] = value
    elif target == "platform":
        candidate["scope"]["platforms"] = [value]
    elif target == "adapter":
        candidate["adapters"][0]["id"] = value
    else:
        candidate["limitations"] = [value]
    with pytest.raises(module.Invalid, match=message):
        module.validate(candidate, ROOT)


def test_rates_need_a_named_opportunity_denominator():
    module = load_module()
    candidate = data()
    candidate["aggregates"][0]["denominator_source"] = ""
    with pytest.raises(module.Invalid, match="denominator_source"):
        module.validate(candidate, ROOT)
