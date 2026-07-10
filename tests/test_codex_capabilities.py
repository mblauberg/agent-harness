import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "skills" / "orchestrate" / "scripts" / "codex_capabilities.py"
SPEC = importlib.util.spec_from_file_location("codex_capabilities", PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_normalize_keeps_model_specific_efforts_only():
    value = MODULE.normalize({"models": [
        {"slug": "gpt-5.6-sol", "supported_reasoning_levels": [{"effort": "ultra"}, {"effort": "max"}]},
        {"slug": "gpt-5.6-luna", "supported_reasoning_levels": [{"effort": "max"}]},
    ]})
    assert value["models"]["gpt-5.6-sol"]["supported_efforts"] == ["ultra", "max"]
    assert value["models"]["gpt-5.6-luna"]["supported_efforts"] == ["max"]


def test_normalize_rejects_empty_or_malformed_catalogue():
    for value in ({}, {"models": []}, {"models": [{"display_name": "missing slug"}]}):
        try:
            MODULE.normalize(value)
        except ValueError:
            pass
        else:
            raise AssertionError("expected malformed catalogue to fail")
