import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "work-map" / "scripts" / "validate_work_map.py"


def load_module():
    spec = importlib.util.spec_from_file_location("validate_work_map", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def map_text(*route_rows: str, status: str = "active") -> str:
    rows = "\n".join(route_rows)
    return f"""# EFFORT: Example        Updated: 2026-07-14  Status: {status}

## Destination
Ship the accepted outcome.

## Route (legs, ordered)
{rows}

## Blocked / parked
- none

## Invariants for every leg
- Preserve user work.

## Trail (one line per route transition, newest first)
- 2026-07-14: activated leg 2.
"""


def test_active_map_has_one_claimed_leg_and_a_live_handoff(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text(
            "- [x] Leg 1 — scoped (done 2026-07-13)",
            "- [>] Leg 2 — implement — IN PROGRESS, handoff: HANDOFF-current.md",
            "- [ ] Leg 3 — verify (depends: leg 2)",
        )
    )

    assert load_module().validate(path) == []


def test_active_map_rejects_multiple_claimed_legs(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text(
            "- [>] Leg 1 — implement — handoff: HANDOFF-one.md",
            "- [>] Leg 2 — verify — handoff: HANDOFF-two.md",
        )
    )

    assert "at most one active [>] leg" in "\n".join(load_module().validate(path))


def test_completed_leg_cannot_retain_an_apparently_current_handoff(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text(
            "- [x] Leg 1 — scoped, handoff: HANDOFF-stale.md",
            "- [>] Leg 2 — implement — handoff: HANDOFF-current.md",
        )
    )

    assert "completed [x] leg still names a handoff" in "\n".join(
        load_module().validate(path)
    )


def test_done_map_has_no_active_or_pending_legs(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(map_text("- [x] Leg 1 — shipped", status="done"))

    assert load_module().validate(path) == []


def test_active_leg_requires_a_real_handoff_target(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(map_text("- [>] Leg 1 — implement — handoff:"))

    assert "non-empty handoff target" in "\n".join(load_module().validate(path))


def test_completed_leg_rejects_markdown_handoff_link(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text(
            "- [x] Leg 1 — scoped ([handoff](HANDOFF-stale.md))",
            "- [>] Leg 2 — implement — handoff: HANDOFF-current.md",
        )
    )

    assert "completed [x] leg still names a handoff" in "\n".join(
        load_module().validate(path)
    )


def test_current_harness_effort_map_uses_supported_repository_format():
    path = ROOT / "docs" / "efforts" / "EFFORT-harness-lifecycle-refactor.md"

    assert load_module().validate(path) == []


def test_trail_rejects_oldest_first_order(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text("- [>] Leg 1 — implement — handoff: HANDOFF-current.md")
        + "- 2026-07-15: later transition appended in the wrong direction.\n"
    )

    assert "trail must be newest first" in "\n".join(load_module().validate(path))
