import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "skills" / "orchestrate" / "scripts" / "lease.py"
SPEC = importlib.util.spec_from_file_location("lease", PATH)
LEASE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(LEASE)


def test_lease_has_one_holder_and_generation_checked_transfer(tmp_path):
    path = tmp_path / "LEASE.json"
    first = LEASE.mutate(path, "acquire", "claude", 60, None, "")
    assert first["generation"] == 1
    try:
        LEASE.mutate(path, "acquire", "claude", 60, None, "")
    except ValueError as exc:
        assert "use renew" in str(exc)
    else:
        raise AssertionError("same identity reacquired an active lease")
    try:
        LEASE.mutate(path, "acquire", "codex", 60, None, "")
    except ValueError as exc:
        assert "belongs to claude" in str(exc)
    else:
        raise AssertionError("competing holder acquired active lease")
    moved = LEASE.mutate(path, "transfer", "claude", 60, 1, "codex")
    assert moved["holder"] == "codex" and moved["generation"] == 2
    try:
        LEASE.mutate(path, "renew", "claude", 60, 2, "")
    except ValueError as exc:
        assert "active holder" in str(exc)
    else:
        raise AssertionError("old holder renewed transferred lease")


def test_expired_lease_requires_explicit_takeover_evidence(tmp_path):
    path = tmp_path / "LEASE.json"
    LEASE.write_atomic(path, {
        "schema_version": 1, "status": "active", "holder": "claude", "previous_holder": "",
        "generation": 1, "updated_at": "2000-01-01T00:00:00Z", "expires_at": "2000-01-01T00:00:01Z",
    })
    try:
        LEASE.mutate(path, "acquire", "codex", 60, None, "")
    except ValueError as exc:
        assert "use takeover" in str(exc)
    else:
        raise AssertionError("expired lease was silently acquired")
    handoff = tmp_path / "handoff.md"
    handoff.write_text(__import__("json").dumps({
        "schema_version": 1, "from_holder": "claude", "to_holder": "codex",
        "generation": 1, "approved_by": "human",
    }))
    moved = LEASE.mutate(path, "takeover", "codex", 60, 1, "", str(handoff))
    assert moved["holder"] == "codex" and moved["generation"] == 2
