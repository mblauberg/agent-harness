import json
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import subprocess
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "model-route"


def resolve(*args, adapter_gate="direct-cli"):
    arguments = [str(SCRIPT), "resolve", *args]
    if "--adapter-gate" not in args:
        arguments.extend(("--adapter-gate", adapter_gate))
    result = subprocess.run(
        arguments,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result, json.loads(result.stdout) if result.stdout else None


def capability_snapshot(models, source="codex debug models"):
    return {
        "schema_version": 1,
        "source": source,
        "observed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "models": models,
    }


def load_router():
    path = ROOT / "scripts" / "model_route.py"
    spec = importlib.util.spec_from_file_location("model_route_under_test", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


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


def test_openai_aliases_resolve_to_account_default_dispatch():
    # The Codex account is a ChatGPT subscription: explicit model ids are
    # rejected by the runtime (HTTP 400), so codex routes dispatch on the
    # account default while retaining the catalog id for effort/audit (#190).
    expected = {
        "flagship": "gpt-5.6-sol",
        "workhorse": "gpt-5.6-terra",
        "scout": "gpt-5.6-luna",
    }
    for alias, model in expected.items():
        result, route = resolve("--adapter", "codex", "--alias", alias, "--role", "worker")
        assert result.returncode == 0
        assert route["resolved_model"] == ""
        assert route["catalog_model"] == model
        assert route["model_selection"] == "account-default"
        assert route["identity_source"] == "account-default"
        assert route["model_family"] == "openai"


def test_account_default_codex_ignores_runtime_selectable_model_list():
    result, route = resolve(
        "--adapter", "codex", "--alias", "flagship", "--role", "worker",
        "--available-model", "gpt-5.6-terra",
    )
    assert result.returncode == 0
    assert route["resolved_model"] == ""
    assert route["catalog_model"] == "gpt-5.6-sol"
    assert route["model_selection"] == "account-default"


def test_aliases_supply_proportionate_default_effort():
    expected = {"flagship": "high", "workhorse": "medium", "scout": "low"}
    for alias, effort in expected.items():
        result, route = resolve("--adapter", "codex", "--alias", alias, "--role", "worker")
        assert result.returncode == 0
        assert route["effort"] == effort


@pytest.mark.parametrize(
    ("task_class", "alias", "effort", "catalog_model"),
    (
        ("mechanical", "scout", "low", "gpt-5.6-luna"),
        ("legwork", "workhorse", "medium", "gpt-5.6-terra"),
        ("critical-review", "flagship", "max", "gpt-5.6-sol"),
        ("orchestration", "flagship", "ultra", "gpt-5.6-sol"),
    ),
)
def test_task_classes_bind_codex_policy_identity_without_transport_model(
    tmp_path, task_class, alias, effort, catalog_model
):
    snapshot = tmp_path / f"{task_class}.json"
    snapshot.write_text(json.dumps(capability_snapshot({
        catalog_model: {
            "resolved_model": catalog_model,
            "supported_efforts": [effort],
        },
    })))
    result, route = resolve(
        "--adapter", "codex", "--task-class", task_class,
        "--role", "orchestrator" if task_class == "orchestration" else "critical-review" if task_class == "critical-review" else "worker",
        "--capabilities-file", str(snapshot),
    )
    assert result.returncode == 0
    assert route["task_class"] == task_class
    assert route["route_source"] == "task-class"
    assert route["alias"] == alias
    assert route["requested_effort"] == effort
    assert route["effort"] == effort
    assert route["resolved_model"] == ""
    assert route["catalog_model"] == catalog_model
    assert route["model_selection"] == "account-default"
    assert route["identity_source"] == "account-default"


def test_claude_critical_review_task_class_uses_trusted_runtime_reviewer_route(tmp_path):
    snapshot = tmp_path / "claude-caps.json"
    snapshot.write_text(json.dumps(capability_snapshot({
        "opus": {"resolved_model": "opus", "supported_efforts": ["high"]},
    }, source="claude runtime models")))
    result, route = resolve(
        "--adapter", "claude", "--task-class", "critical-review",
        "--role", "critical-review", "--capabilities-file", str(snapshot),
    )
    assert result.returncode == 0
    assert route["alias"] == "flagship"
    assert route["requested_effort"] == "high"
    assert route["resolved_model"] == "opus"
    assert route["identity_source"] == "runtime-capability+catalog"
    assert route["effort_capability_source"] == "runtime-model-catalog"


def test_task_class_without_trusted_capability_evidence_fails_closed():
    result, route = resolve(
        "--adapter", "claude", "--task-class", "critical-review",
        "--role", "critical-review", "--available-model", "opus",
    )
    assert result.returncode == 1
    assert route["status"] == "task_class_capability_unverified"


def test_critical_review_task_class_rejects_worker_role_before_model_resolution():
    result, route = resolve(
        "--adapter", "claude", "--task-class", "critical-review", "--role", "worker"
    )
    assert result.returncode == 2
    assert route["status"] == "task_class_role_mismatch"
    assert route["role"] == "worker"
    assert route["task_class"] == "critical-review"


def test_legacy_alias_route_does_not_claim_task_class_binding():
    result, route = resolve(
        "--adapter", "codex", "--alias", "scout", "--role", "worker"
    )
    assert result.returncode == 0
    assert "task_class" not in route
    assert "route_source" not in route


@pytest.mark.parametrize(
    "arguments",
    (
        ("--alias", "scout", "--task-class", "mechanical"),
        ("--task-class", "mechanical", "--effort", "medium"),
        ("--task-class", "unknown"),
    ),
)
def test_task_class_rejects_ambiguous_or_unknown_routing_inputs(arguments):
    result, route = resolve("--adapter", "codex", *arguments, "--role", "worker")
    assert result.returncode == 2
    assert route["schema_version"] == 1
    assert route["adapter"] == "codex"
    assert route["role"] == "worker"
    assert route["status"] in {
        "route_input_conflict", "task_class_effort_conflict", "unknown_task_class",
    }


def test_invalid_task_class_effort_vocabulary_fails_closed(tmp_path, monkeypatch, capsys):
    router = load_router()
    catalog = json.loads((ROOT / "config" / "model-routing.json").read_text())
    catalog["task_class_routes"]["critical-review"]["effort"] = "hgh"
    catalog_path = tmp_path / "model-routing.json"
    catalog_path.write_text(json.dumps(catalog))
    monkeypatch.setattr(router, "CATALOG_PATH", catalog_path)

    result = router.main([
        "resolve", "--adapter", "claude", "--task-class", "critical-review",
        "--role", "critical-review", "--adapter-gate", "direct-cli",
    ])

    route = json.loads(capsys.readouterr().out)
    assert result == 2
    assert route["status"] == "task_class_config_invalid"
    assert route["effort"] == ""


def test_task_class_role_policy_cannot_be_reconfigured_to_worker(tmp_path, monkeypatch, capsys):
    router = load_router()
    catalog = json.loads((ROOT / "config" / "model-routing.json").read_text())
    catalog["task_class_routes"]["critical-review"]["role"] = "worker"
    catalog_path = tmp_path / "model-routing.json"
    catalog_path.write_text(json.dumps(catalog))
    monkeypatch.setattr(router, "CATALOG_PATH", catalog_path)

    result = router.main([
        "resolve", "--adapter", "claude", "--task-class", "critical-review",
        "--role", "worker", "--adapter-gate", "direct-cli",
    ])

    route = json.loads(capsys.readouterr().out)
    assert result == 2
    assert route["status"] == "task_class_config_invalid"


def test_role_default_cannot_lower_task_class_effort(tmp_path, monkeypatch, capsys):
    router = load_router()
    catalog = json.loads((ROOT / "config" / "model-routing.json").read_text())
    catalog["families"]["openai"]["role_effort_defaults"]["orchestrator"]["flagship"] = "low"
    catalog_path = tmp_path / "model-routing.json"
    catalog_path.write_text(json.dumps(catalog))
    snapshot = tmp_path / "caps.json"
    snapshot.write_text(json.dumps(capability_snapshot({
        "gpt-5.6-sol": {"resolved_model": "gpt-5.6-sol", "supported_efforts": ["high"]},
    })))
    monkeypatch.setattr(router, "CATALOG_PATH", catalog_path)

    result = router.main([
        "resolve", "--adapter", "codex", "--task-class", "orchestration",
        "--role", "orchestrator", "--capabilities-file", str(snapshot),
        "--adapter-gate", "direct-cli",
    ])

    route = json.loads(capsys.readouterr().out)
    assert result == 0
    assert route["requested_effort"] == "high"
    assert route["effort_source"] == "task-class"


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


def test_codex_failure_records_never_expose_a_dispatchable_model():
    # Non-ok records must not present the catalog id as resolved_model:
    # a consumer keying on resolved_model would dispatch an id the
    # subscription runtime rejects (#190).
    result, route = resolve(
        "--adapter", "codex", "--alias", "workhorse", "--role", "worker", "--effort", "ultra"
    )
    assert result.returncode == 1
    assert route["status"] == "effort_unsupported"
    assert route["resolved_model"] == ""
    assert route["catalog_model"] == "gpt-5.6-terra"
    assert route["model_selection"] == "account-default"


def test_codex_rejects_explicit_model_for_account_default_adapter():
    # An explicit id would be sent to the runtime and rejected with HTTP 400,
    # so the resolver fails closed instead of emitting a doomed route (#190).
    result, route = resolve(
        "--adapter", "codex", "--alias", "flagship", "--role", "lead", "--model", "gpt-5.6-sol"
    )
    assert result.returncode == 1
    assert route["status"] == "adapter_account_default_only"
    assert route["resolved_model"] == ""
    assert route["requested_model"] == "gpt-5.6-sol"
    assert route["catalog_model"] == "gpt-5.6-sol"
    assert route["model_selection"] == "account-default"
    assert route["identity_source"] == "account-default"
    assert route["model_family"] == "openai"


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


def test_account_default_missing_catalog_model_uses_audited_dated_efforts(tmp_path):
    snapshot = tmp_path / "caps.json"
    snapshot.write_text(json.dumps(capability_snapshot({
            "gpt-5.6-terra": {
                "resolved_model": "gpt-5.6-terra",
                "supported_efforts": ["high", "xhigh", "max"],
            }
        })))
    result, route = resolve(
        "--adapter", "codex", "--alias", "flagship", "--role", "lead",
        "--capabilities-file", str(snapshot),
    )
    assert result.returncode == 0
    assert route["catalog_model"] == "gpt-5.6-sol"
    assert route["resolved_model"] == ""
    assert route["effort"] == "ultra"
    assert route["effort_capability_source"] == "dated-catalog"
    assert "catalog model absent from runtime snapshot" in route["effort_substitution"]


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


@pytest.mark.parametrize(
    "models",
    [
        {"gpt-unrelated": {"resolved_model": "gpt-unrelated", "supported_efforts": []}},
        {"gpt-unrelated": {"resolved_model": "gpt-unrelated", "supported_efforts": [" "]}},
        {"gpt-key": {"resolved_model": "gpt-other", "supported_efforts": ["high"]}},
        {"gpt-key": {"resolved_model": "", "supported_efforts": ["high"]}},
        {
            "GPT-Duplicate": {
                "resolved_model": "GPT-Duplicate",
                "supported_efforts": ["high"],
            },
            "gpt-duplicate": {
                "resolved_model": "gpt-duplicate",
                "supported_efforts": ["max"],
            },
        },
    ],
)
def test_capability_snapshot_rejects_incomplete_or_inconsistent_models(tmp_path, models):
    snapshot = tmp_path / "caps.json"
    snapshot.write_text(json.dumps(capability_snapshot(models)))
    result, route = resolve(
        "--adapter", "codex", "--alias", "flagship", "--role", "lead",
        "--capabilities-file", str(snapshot),
    )
    assert result.returncode == 1
    assert route["status"] == "capability_discovery_failed"


@pytest.mark.parametrize(
    "duplicate_fragment",
    [
        '"schema_version":1,"schema_version":1',
        '"models":{"gpt-5.6-sol":{"resolved_model":"gpt-5.6-sol",'
        '"supported_efforts":["high"]},"gpt-5.6-sol":{"resolved_model":"gpt-5.6-sol",'
        '"supported_efforts":["max"]}}',
        '"models":{"gpt-5.6-sol":{"resolved_model":"gpt-5.6-sol",'
        '"resolved_model":"gpt-5.6-sol","supported_efforts":["high"]}}',
        '"models":{"gpt-5.6-sol":{"resolved_model":"gpt-5.6-sol",'
        '"supported_efforts":["high"],"supported_efforts":["max"]}}',
    ],
)
def test_persisted_capability_snapshot_rejects_duplicate_json_members(
    tmp_path, duplicate_fragment
):
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    default_models = (
        '"models":{"gpt-5.6-sol":{"resolved_model":"gpt-5.6-sol",'
        '"supported_efforts":["high"]}}'
    )
    fields = [
        duplicate_fragment,
        '"source":"codex debug models"',
        f'"observed_at":"{observed_at}"',
    ]
    if not duplicate_fragment.startswith('"models"'):
        fields.append(default_models)
    if not duplicate_fragment.startswith('"schema_version"'):
        fields.append('"schema_version":1')
    snapshot = tmp_path / "caps.json"
    snapshot.write_text("{" + ",".join(fields) + "}")
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
        "--adapter", "cursor", "--model", "cursor-grok-4.5-low", "--alias", "flagship",
        "--role", "reviewer", "--lead-family", "anthropic", "--require-distinct",
        "--adapter-gate", "direct-cli",
    )
    assert result.returncode == 0
    assert route["status"] == "ok"
    assert route["effort"] == "low"
    result, route = resolve(
        "--adapter", "agy", "--model", "gemini-3.1-pro", "--alias", "flagship",
        "--role", "reviewer", "--effort", "high", "--lead-family", "openai", "--require-distinct",
        "--adapter-gate", "direct-cli",
    )
    assert result.returncode == 1
    assert route["status"] == "adapter_effort_unresolved"
    result, route = resolve(
        "--adapter", "cursor", "--model", "composer-2-extra-high", "--alias", "flagship",
        "--role", "reviewer", "--lead-family", "anthropic", "--require-distinct",
        "--adapter-gate", "direct-cli",
    )
    assert result.returncode == 0
    assert route["status"] == "ok"
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
        "--adapter-gate",
        "direct-cli",
    )
    assert result.returncode == 1
    assert route["status"] == "same_family_forbidden"


def test_broker_route_records_endpoint_separately_from_model_family():
    result, route = resolve(
        "--adapter",
        "cursor",
        "--model",
        "cursor-grok-4.5-high",
        "--alias",
        "flagship",
        "--role",
        "reviewer",
        "--lead-family",
        "openai",
        "--require-distinct",
        "--adapter-gate",
        "direct-cli",
    )
    assert result.returncode == 0
    assert route["status"] == "ok"
    assert route["endpoint_provider"] == "cursor"
    assert route["model_family"] == "xai"
    assert route["identity_source"] == "model-pattern"
    assert route["distinct_from_lead"] is True


def test_cursor_composer_route_uses_cursor_model_family():
    result, route = resolve(
        "--adapter",
        "cursor",
        "--model",
        "composer-2-high",
        "--alias",
        "flagship",
        "--role",
        "worker",
        "--lead-family",
        "openai",
        "--require-distinct",
        "--adapter-gate",
        "direct-cli",
    )
    assert result.returncode == 0
    assert route["status"] == "ok"
    assert route["endpoint_provider"] == "cursor"
    assert route["model_family"] == "cursor-composer"
    assert route["effort"] == "high"
    assert route["distinct_from_lead"] is True


def test_disabled_agy_remains_available_only_for_explicit_direct_routing():
    allowed, allowed_route = resolve(
        "--adapter", "agy", "--model", "gemini-3.1-pro", "--alias", "flagship", "--role", "worker",
        "--adapter-gate", "direct-cli",
    )
    forbidden, forbidden_route = resolve(
        "--adapter", "agy", "--model", "grok-4", "--alias", "flagship", "--role", "worker"
    )

    assert allowed.returncode == 0
    assert allowed_route["status"] == "ok"
    assert allowed_route["model_family"] == "google"
    assert allowed_route["adapter_enabled"] is False
    assert forbidden.returncode == 1
    assert forbidden_route["status"] == "adapter_family_forbidden"


def test_cursor_accepts_only_composer_and_grok_models():
    for model, family in (("composer-2-high", "cursor-composer"), ("cursor-grok-4.5-high", "xai")):
        allowed, allowed_route = resolve(
            "--adapter", "cursor", "--model", model, "--alias", "flagship", "--role", "worker",
            "--adapter-gate", "direct-cli",
        )
        assert allowed.returncode == 0
        assert allowed_route["status"] == "ok"
        assert allowed_route["model_family"] == family

    wrong_family, wrong_family_route = resolve(
        "--adapter", "cursor", "--model", "gemini-3.1-pro", "--alias", "flagship", "--role", "worker"
    )
    wrong_pattern, wrong_pattern_route = resolve(
        "--adapter", "cursor", "--model", "grokish-high", "--alias", "flagship", "--role", "worker"
    )
    assert wrong_family.returncode == 1
    assert wrong_family_route["status"] == "adapter_family_forbidden"
    assert wrong_pattern.returncode == 1
    assert wrong_pattern_route["status"] == "adapter_model_forbidden"


def test_kiro_accepts_only_open_weight_models():
    allowed_models = (
        ("deepseek-3.2", "deepseek"),
        ("glm-5", "zhipu"),
        ("minimax-m2.5", "minimax"),
        ("qwen3-coder-next", "alibaba"),
    )
    for model, family in allowed_models:
        allowed, allowed_route = resolve(
            "--adapter", "kiro", "--model", model, "--alias", "scout", "--role", "worker",
            "--adapter-gate", "direct-cli",
        )
        assert allowed.returncode == 0
        assert allowed_route["status"] == "ok"
        assert allowed_route["model_family"] == family
        assert allowed_route["compatibility_model_family"] == "open-weight"

    forbidden, forbidden_route = resolve(
        "--adapter", "kiro", "--model", "gemini-3.1-pro", "--alias", "scout", "--role", "worker"
    )

    assert forbidden.returncode == 1
    assert forbidden_route["status"] == "adapter_family_forbidden"


def test_pi_without_model_patterns_fails_closed_for_provider_families():
    for model in ("gpt-5.6-sol", "claude-opus-4.5", "gemini-3.1-pro"):
        result, route = resolve(
            "--adapter", "pi", "--model", model, "--alias", "scout", "--role", "worker"
        )
        assert result.returncode == 1
        assert route["status"] == "adapter_family_forbidden"


def test_same_family_rejection_precedes_adapter_family_rejection():
    result, route = resolve(
        "--adapter", "cursor", "--model", "gpt-5.6-sol", "--alias", "flagship",
        "--role", "reviewer", "--lead-family", "openai", "--require-distinct",
    )

    assert result.returncode == 1
    assert route["status"] == "same_family_forbidden"


def test_disabled_optional_broker_is_unavailable_through_fabric_only():
    arguments = (
        "--adapter", "agy", "--model", "gemini-3.1-pro", "--alias", "flagship",
        "--role", "reviewer", "--lead-family", "openai", "--require-distinct",
    )

    fabric, fabric_route = resolve(*arguments, adapter_gate="fabric")
    direct, direct_route = resolve(*arguments, "--adapter-gate", "direct-cli")

    assert fabric.returncode == 1
    assert fabric_route["status"] == "adapter_disabled"
    assert fabric_route["adapter_enabled"] is False
    assert direct.returncode == 0
    assert direct_route["status"] == "ok"
    assert direct_route["adapter_gate"] == "direct-cli"


def test_primary_adapters_honour_fabric_activation_gate():
    for adapter in ("claude", "codex"):
        fabric, fabric_route = resolve(
            "--adapter", adapter, "--alias", "flagship", "--role", "lead",
            adapter_gate="fabric",
        )
        direct, direct_route = resolve(
            "--adapter", adapter, "--alias", "flagship", "--role", "lead",
            "--adapter-gate", "direct-cli",
        )

        assert fabric.returncode == 0
        assert fabric_route["status"] == "ok"
        assert fabric_route["adapter_enabled"] is True
        assert fabric_route["adapter_unresolved_pins"] == []
        assert direct.returncode == 0
        assert direct_route["status"] == "ok"


def test_fabric_gate_rejects_catalogue_adapter_without_compatibility_contract():
    arguments = (
        "--adapter", "copilot", "--model", "gemini-3.1-pro",
        "--alias", "flagship", "--role", "worker",
    )

    fabric, fabric_route = resolve(*arguments, adapter_gate="fabric")
    direct, direct_route = resolve(*arguments)

    assert fabric.returncode == 2
    assert fabric_route["status"] == "adapter_compatibility_unknown"
    assert direct.returncode == 0
    assert direct_route["status"] == "ok"


def test_fabric_gate_rejects_disabled_adapter_before_activation_state(tmp_path):
    fabric_config = tmp_path / "agent-fabric.yaml"
    fabric_config.write_text("schemaVersion: 1\nactiveAdapters: []\n")

    result, route = resolve(
        "--adapter", "agy", "--model", "gemini-3.1-pro", "--alias", "flagship",
        "--role", "reviewer", "--lead-family", "openai", "--require-distinct",
        "--fabric-config", str(fabric_config), adapter_gate="fabric",
    )

    assert result.returncode == 1
    assert route["status"] == "adapter_disabled"
    assert route["adapter_enabled"] is False


def test_fabric_gate_fails_closed_for_invalid_activation_config(tmp_path):
    fabric_config = tmp_path / "agent-fabric.yaml"
    fabric_config.write_text("schemaVersion: 1\nactiveAdapters: agy\n")

    result, route = resolve(
        "--adapter", "agy", "--model", "gemini-3.1-pro", "--alias", "flagship",
        "--role", "worker", "--fabric-config", str(fabric_config), adapter_gate="fabric",
    )

    assert result.returncode == 2
    assert route["status"] == "fabric_activation_invalid"
