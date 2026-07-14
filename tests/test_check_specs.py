from __future__ import annotations

from pathlib import Path

import pytest

from scripts.check_specs import MAX_BYTES, SpecCheckError, check_repository


def write_repo(tmp_path: Path, body: str = "# Authority\n\n### FR-001 Owner\n") -> Path:
    specs = tmp_path / "docs" / "specs"
    domain = specs / "agent-fabric"
    domain.mkdir(parents=True)
    (specs / "README.md").write_text(
        "# Specifications\n\n[Authority](agent-fabric/authority.md)\n"
    )
    path = domain / "authority.md"
    path.write_text(body)
    return path


def assert_code(tmp_path: Path, code: str) -> None:
    with pytest.raises(SpecCheckError) as caught:
        check_repository(tmp_path)
    assert caught.value.code == code


def test_accepts_standalone_semantic_specs(tmp_path: Path) -> None:
    paths = check_repository(tmp_path) if write_repo(tmp_path) else ()
    assert [path.name for path in paths] == ["README.md", "authority.md"]


def test_rejects_spec_missing_from_discovery_index(tmp_path: Path) -> None:
    write_repo(tmp_path)
    (tmp_path / "docs" / "specs" / "README.md").write_text("# Specifications\n")
    assert_code(tmp_path, "index-drift")


def test_rejects_line_cap(tmp_path: Path) -> None:
    write_repo(tmp_path, "# Authority\n" + "line\n" * 999)
    assert_code(tmp_path, "over-cap")


def test_rejects_byte_cap(tmp_path: Path) -> None:
    write_repo(tmp_path, "# Authority\n" + "x" * MAX_BYTES)
    assert_code(tmp_path, "over-cap")


def test_rejects_duplicate_normative_id(tmp_path: Path) -> None:
    write_repo(tmp_path)
    other = tmp_path / "docs" / "specs" / "console" / "attention.md"
    other.parent.mkdir()
    other.write_text("# Attention\n\n- **FR-001:** Duplicate owner\n")
    assert_code(tmp_path, "duplicate-id")


@pytest.mark.parametrize("name", ["01-authority.md", "authority-continued-2.md"])
def test_rejects_positional_or_continued_name(tmp_path: Path, name: str) -> None:
    path = write_repo(tmp_path)
    path.rename(path.with_name(name))
    assert_code(tmp_path, "broken-link")
    (tmp_path / "docs" / "specs" / "README.md").write_text(
        f"# Specifications\n\n[Authority](agent-fabric/{name})\n"
    )
    assert_code(tmp_path, "positional-name")


def test_rejects_broken_local_link(tmp_path: Path) -> None:
    write_repo(tmp_path, "# Authority\n\n[Missing](missing.md)\n")
    assert_code(tmp_path, "broken-link")


def test_rejects_broken_fragment(tmp_path: Path) -> None:
    write_repo(tmp_path, "# Authority\n\n[Missing](#not-here)\n")
    assert_code(tmp_path, "broken-link")


def test_ignores_examples_inside_fences(tmp_path: Path) -> None:
    write_repo(
        tmp_path,
        "# Authority\n\n### FR-001 Owner\n\n"
        "```md\n### FR-001 Example\n[Missing](missing.md)\n```\n",
    )
    check_repository(tmp_path)


def test_nested_spec_cannot_bypass_duplicate_id_check(tmp_path: Path) -> None:
    write_repo(tmp_path)
    nested = tmp_path / "docs" / "specs" / "agent-fabric" / "detail" / "lease.md"
    nested.parent.mkdir()
    nested.write_text("# Lease\n\n### FR-001 Duplicate owner\n")
    assert_code(tmp_path, "duplicate-id")
