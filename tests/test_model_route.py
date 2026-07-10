import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "model-route"


def resolve(*args):
    result = subprocess.run(
        [str(SCRIPT), "resolve", *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result, json.loads(result.stdout) if result.stdout else None


def capability_snapshot(models):
    return {
        "schema_version": 1,
        "source": "codex debug models",
        "observed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "models": models,
    }


def test_claude_lead_prefers_fable_and_reviewer_prefers_opus():
    lead, lead_route = resolve("--adapter", "claude", "--alias", "flagship", "--role", "lead")
    review, review_route = resolve(
        "--adapter", "claude", "--alias", "flagship", "--role", "critical-review"
    )
    assert lead.returncode == review.returncode == 0
    assert lead_route["resolved_model"] == "fable"
    assert review_route["resolved_model"] == "opus"
    assert lead_route["model_family"] == review_route["model_family"] == "anthropic"


def test_claude_other_primary_uses_fable_not_native_reviewer_route():
    result, route = resolve(
        "--adapter", "claude", "--alias", "flagship", "--role", "other-primary"
    )
    assert result.returncode == 0
    assert route["resolved_model"] == "fable"


def test_fable_unavailable_falls_back_to_opus_and_records_substitution():
    result, route = resolve(
        "--adapter",
        "claude",
        "--alias",
        "flagship",
        "--role",
        "lead",
        "--available-model",
        "opus",
    )
    assert result.returncode == 0
    assert route["resolved_model"] == "opus"
    assert route["substitution"] == "fable unavailable; used opus"


def test_openai_aliases_resolve_to_gpt_56_family():
    expected = {
        "flagship": "gpt-5.6-sol",
        "workhorse": "gpt-5.6-terra",
        "scout": "gpt-5.6-luna",
    }
    for alias, model in expected.items():
        result, route = resolve("--adapter", "codex", "--alias", alias, "--role", "worker")
        assert result.returncode == 0
        assert route["resolved_model"] == model
        assert route["model_family"] == "openai"


def test_aliases_supply_proportionate_default_effort():
    expected = {"flagship": "high", "workhorse": "medium", "scout": "low"}
    for alias, effort in expected.items():
        result, route = resolve("--adapter", "codex", "--alias", alias, "--role", "worker")
        assert result.returncode == 0
        assert route["effort"] == effort


def test_codex_lead_uses_ultra_orchestration_effort():
    result, route = resolve("--adapter", "codex", "--alias", "flagship", "--role", "lead")
    assert result.returncode == 0
    assert route["effort"] == "ultra"


def test_explicit_effort_overrides_codex_ultra_default():
    result, route = resolve(
        "--adapter", "codex", "--alias", "flagship", "--role", "lead", "--effort", "high"
    )
    assert result.returncode == 0
    assert route["effort"] == "high"


def test_explicit_ultra_fails_for_noneligible_routes():
    cases = [
        ("--adapter", "codex", "--alias", "workhorse", "--role", "worker"),
        ("--adapter", "claude", "--alias", "flagship", "--role", "worker"),
    ]
    for route_args in cases:
        result, route = resolve(*route_args, "--effort", "ultra")
        assert result.returncode == 1
        assert route["status"] == "effort_unsupported"
        assert route["requested_effort"] == "ultra"
        assert route["effort"] == ""


def test_ultra_role_default_degrades_for_unsupported_explicit_model():
    result, route = resolve(
        "--adapter", "codex", "--alias", "flagship", "--role", "lead", "--model", "gpt-4.1"
    )
    assert result.returncode == 0
    assert route["requested_effort"] == "ultra"
    assert route["effort"] == "high"
    assert "not ultra-eligible" in route["effort_substitution"]


def test_ultra_role_default_uses_runtime_effort_fallback():
    result, route = resolve(
        "--adapter",
        "codex",
        "--alias",
        "flagship",
        "--role",
        "lead",
        "--available-effort",
        "max",
        "--available-effort",
        "high",
    )
    assert result.returncode == 0
    assert route["effort"] == "max"
    assert "runtime/model capability" in route["effort_substitution"]


def test_capability_snapshot_controls_default_fallback(tmp_path):
    snapshot = tmp_path / "caps.json"
    snapshot.write_text(json.dumps(capability_snapshot({
            "gpt-5.6-sol": {
                "resolved_model": "gpt-5.6-sol",
                "supported_efforts": ["high", "xhigh", "max"],
            }
        })))
    result, route = resolve(
        "--adapter", "codex", "--alias", "flagship", "--role", "lead",
        "--capabilities-file", str(snapshot),
    )
    assert result.returncode == 0
    assert route["requested_effort"] == "ultra"
    assert route["effort"] == "max"
    assert route["effort_capability_source"] == "runtime-model-catalog"


def test_explicit_unsupported_effort_fails_against_runtime_snapshot(tmp_path):
    snapshot = tmp_path / "caps.json"
    snapshot.write_text(json.dumps(capability_snapshot({
            "gpt-5.6-sol": {
                "resolved_model": "gpt-5.6-sol",
                "supported_efforts": ["high", "xhigh", "max"],
            }
        })))
    result, route = resolve(
        "--adapter", "codex", "--alias", "flagship", "--role", "lead",
        "--effort", "ultra", "--capabilities-file", str(snapshot),
    )
    assert result.returncode == 1
    assert route["status"] == "effort_unsupported"
    assert route["effort"] == ""


def test_malformed_capability_snapshot_fails_closed(tmp_path):
    snapshot = tmp_path / "caps.json"
    snapshot.write_text("{}")
    result, route = resolve(
        "--adapter", "codex", "--alias", "flagship", "--role", "lead",
        "--capabilities-file", str(snapshot),
    )
    assert result.returncode == 1
    assert route["status"] == "capability_discovery_failed"


def test_untrusted_capability_snapshot_fails_closed(tmp_path):
    snapshot = tmp_path / "caps.json"
    snapshot.write_text(json.dumps({
        "schema_version": 1,
        "source": "forged",
        "observed_at": "2000-01-01T00:00:00Z",
        "models": {"gpt-5.6-sol": {"resolved_model": "gpt-5.6-sol", "supported_efforts": ["ultra"]}},
    }))
    result, route = resolve(
        "--adapter", "codex", "--alias", "flagship", "--role", "lead",
        "--capabilities-file", str(snapshot),
    )
    assert result.returncode == 1
    assert route["status"] == "capability_snapshot_untrusted"


def test_empty_runtime_capability_snapshot_fails_closed(tmp_path):
    snapshot = tmp_path / "caps.json"
    snapshot.write_text(json.dumps(capability_snapshot({})))
    result, route = resolve(
        "--adapter", "codex", "--alias", "flagship", "--role", "lead",
        "--capabilities-file", str(snapshot),
    )
    assert result.returncode == 1
    assert route["status"] == "capability_discovery_failed"


def test_model_id_effort_uses_last_token_and_explicit_unresolved_fails():
    result, route = resolve(
        "--adapter", "cursor", "--model", "gpt-5.1-codex-max-low", "--alias", "flagship",
        "--role", "reviewer", "--lead-family", "anthropic", "--require-distinct",
    )
    assert result.returncode == 0
    assert route["effort"] == "low"
    result, route = resolve(
        "--adapter", "agy", "--model", "gemini-3.1-pro", "--alias", "flagship",
        "--role", "reviewer", "--effort", "high", "--lead-family", "openai", "--require-distinct",
    )
    assert result.returncode == 1
    assert route["status"] == "adapter_effort_unresolved"
    result, route = resolve(
        "--adapter", "cursor", "--model", "gpt-5.5-extra-high", "--alias", "flagship",
        "--role", "reviewer", "--lead-family", "anthropic", "--require-distinct",
    )
    assert result.returncode == 0
    assert route["effort"] == "xhigh"


def test_distinct_requirement_fails_closed_for_same_family():
    result, route = resolve(
        "--adapter",
        "codex",
        "--alias",
        "flagship",
        "--role",
        "reviewer",
        "--lead-family",
        "openai",
        "--require-distinct",
    )
    assert result.returncode == 1
    assert route["status"] == "same_family_forbidden"


def test_broker_route_records_endpoint_separately_from_model_family():
    result, route = resolve(
        "--adapter",
        "cursor",
        "--model",
        "grok-4.5-xhigh",
        "--alias",
        "flagship",
        "--role",
        "reviewer",
        "--lead-family",
        "openai",
        "--require-distinct",
    )
    assert result.returncode == 0
    assert route["endpoint_provider"] == "cursor"
    assert route["model_family"] == "xai"
    assert route["identity_source"] == "model-pattern"
    assert route["distinct_from_lead"] is True
