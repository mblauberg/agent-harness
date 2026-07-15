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


def map_text(*route_rows: str) -> str:
    rows = "\n".join(route_rows)
    return f"""# EFFORT: Example

## Destination
Ship the accepted outcome. See [the specification](../specs/example.md).

## Route
{rows}

## Invariants
- [Governing decision](../adr/0001-example.md)
"""


def test_link_only_route_map_is_valid(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text(
            "- [Issue #1](https://github.com/example/project/issues/1)",
            "- [PR #2](https://github.com/example/project/pull/2)",
        )
    )

    assert load_module().validate(path) == []


def test_route_row_requires_a_link_to_its_owner(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(map_text("- Implement the next leg"))

    assert "route row must contain a link" in "\n".join(load_module().validate(path))


def test_map_rejects_a_restatement_of_live_status(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text("- [Issue #1](https://github.com/example/project/issues/1)")
        .replace("# EFFORT: Example", "# EFFORT: Example\n\nStatus: active")
    )

    assert "must not restate live status" in "\n".join(load_module().validate(path))


def test_map_rejects_live_state_narration_outside_the_route(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text("- [Issue #1](https://github.com/example/project/issues/1)")
        .replace("Ship the accepted outcome.", "Current status is complete; owner is Alice.")
    )

    assert "must not narrate live work state" in "\n".join(
        load_module().validate(path)
    )


def test_map_rejects_stateful_route_checkboxes(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(map_text("- [x] [Issue #1](https://github.com/example/project/issues/1)"))

    assert "route rows must not encode live state" in "\n".join(
        load_module().validate(path)
    )


def test_map_rejects_live_state_narration_in_route(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text(
            "- [Issue #1](https://github.com/example/project/issues/1) is complete"
        )
    )

    assert "route rows must link, not narrate live state" in "\n".join(
        load_module().validate(path)
    )


def test_map_rejects_bare_completion_state_in_route(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text(
            "- [Issue #1](https://github.com/example/project/issues/1) — complete"
        )
    )

    assert "route rows must link, not narrate live state" in "\n".join(
        load_module().validate(path)
    )


def test_stable_destination_acceptance_condition_is_allowed(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text("- [Issue #1](https://github.com/example/project/issues/1)")
        .replace("Ship the accepted outcome.", "The design is complete when its tests pass.")
    )

    assert load_module().validate(path) == []


def test_live_words_inside_a_link_label_are_not_state_narration(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text(
            "- [Current architecture issue](https://github.com/example/project/issues/1)"
        )
    )

    assert load_module().validate(path) == []


def test_route_rejects_delivery_state_suffixes_outside_the_link(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text("- [PR #2](https://github.com/example/project/pull/2) — merged")
    )

    assert "route section permits only link rows" in "\n".join(
        load_module().validate(path)
    )


def test_route_rejects_handoff_link_targets(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text(
            "- [Session baton](../handoffs/HANDOFF-2026-07-16-example.md)"
        )
    )

    assert "temporary handoffs stay outside route maps" in "\n".join(
        load_module().validate(path)
    )


def test_route_rejects_live_state_smuggled_in_link_labels(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text(
            "- [Issue #1 — DONE, integrated 2026-07-15, owner Alice]"
            "(https://github.com/example/project/issues/1)"
        )
    )

    assert "route link labels must not smuggle live state" in "\n".join(
        load_module().validate(path)
    )


def test_route_rejects_merged_and_parenthetical_label_smuggles(tmp_path):
    module = load_module()
    for label in ("PR #2 — merged", "Issue #1 (DONE)"):
        path = tmp_path / "EFFORT-example.md"
        path.write_text(
            map_text(f"- [{label}](https://github.com/example/project/pull/2)")
        )

        assert "route link labels must not smuggle live state" in "\n".join(
            module.validate(path)
        ), label


def test_route_rejects_prose_around_an_otherwise_valid_link(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text("Maintainer Alice owns this effort.\n- [Issue #1](https://github.com/example/project/issues/1)")
    )

    assert "route section permits only link rows" in "\n".join(
        load_module().validate(path)
    )


def test_map_rejects_temporary_handoff_state(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text(
            "- [Issue #1](https://github.com/example/project/issues/1), handoff: HANDOFF-current.md"
        )
    )

    assert "temporary handoffs stay outside route maps" in "\n".join(
        load_module().validate(path)
    )


def test_invariants_reject_live_status_prose(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text("- [Issue #1](https://github.com/example/project/issues/1)")
        .replace(
            "- [Governing decision](../adr/0001-example.md)",
            "The work is complete.\n- [Governing decision](../adr/0001-example.md)",
        )
    )

    assert "invariants section permits only link rows" in "\n".join(
        load_module().validate(path)
    )


def test_map_rejects_work_state_prose_before_destination(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        map_text("- [Issue #1](https://github.com/example/project/issues/1)")
        .replace("# EFFORT: Example", "# EFFORT: Example\n\nWork complete")
    )

    assert "work map prelude permits only the title" in "\n".join(
        load_module().validate(path)
    )


def test_map_rejects_work_state_prose_before_the_title(tmp_path):
    path = tmp_path / "EFFORT-example.md"
    path.write_text(
        "Work complete\n"
        + map_text("- [Issue #1](https://github.com/example/project/issues/1)")
    )

    assert "work map prelude permits only the title" in "\n".join(
        load_module().validate(path)
    )
