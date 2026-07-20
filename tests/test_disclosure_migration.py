from pathlib import Path
import re

import yaml


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tests" / "fixtures" / "disclosure-migration.yaml"


REFERENCE_PATHS = (
    re.compile(
        r"(?P<path>(?:\$\{[^}\n]+\}/)?skills/"
        r"(?P<skill>[a-z0-9]+(?:-[a-z0-9]+)*)/references?/"
        r"[^\s`'\"()\[\]{}<>]+)"
    ),
    re.compile(
        r"(?P<path>(?:\.\./)+"
        r"(?P<skill>[a-z0-9]+(?:-[a-z0-9]+)*)/references?/"
        r"[^\s`'\"()\[\]{}<>]+)"
    ),
)


def _in_tree_contract_files():
    roots = [ROOT / "skills", ROOT / "scripts", ROOT / "tests" / "fixtures"]
    workflows = ROOT / "workflows"
    if workflows.is_dir():
        roots.append(workflows)
    for root in roots:
        if root.is_dir():
            yield from (path for path in root.rglob("*") if path.is_file())
    yield ROOT / "AGENTS.md"
    yield ROOT / "HARNESS.md"


def test_cross_skill_reference_paths_are_private_to_the_owning_skill():
    """AC-S2: in-tree consumers name a skill, never another skill's internals."""
    violations = []
    for path in _in_tree_contract_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        relative = path.relative_to(ROOT)
        owner = relative.parts[1] if relative.parts[:1] == ("skills",) else None
        for pattern in REFERENCE_PATHS:
            for match in pattern.finditer(text):
                if match.group("skill") != owner:
                    violations.append(f"{relative}: {match.group('path')}")

    assert not violations, "cross-skill reference path(s):\n" + "\n".join(violations)


def test_disclosure_migration_manifest_is_complete_and_anchored():
    """AC-S3: the single manifest is structurally complete and destinations exist."""
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    assert set(manifest) == {"schema", "ambient", "orchestrate"}
    assert manifest["schema"] == "disclosure-migration.v1"

    ambient = manifest["ambient"]
    assert len(ambient) == 12
    assert all(set(row) == {"section", "disposition", "destination"} for row in ambient)
    assert all(all(isinstance(value, str) and value for value in row.values()) for row in ambient)
    sections = [row["section"] for row in ambient]
    assert len(sections) == len(set(sections)), "ambient manifest has duplicate sections"

    stripped = [row for row in ambient if row["disposition"].startswith("strip")]
    skill_owners = []
    for row in stripped:
        destination = row["destination"]
        if "repo-surface" in destination:
            anchors = re.findall(r"[A-Za-z0-9_.-]+\.md", destination)
            assert anchors, f"stripped repo-surface row has no named anchor: {row}"
            for anchor in anchors:
                assert (ROOT / anchor).is_file(), f"missing repo-surface anchor {anchor}: {row}"
            continue

        owners = re.findall(r"`([a-z0-9]+(?:-[a-z0-9]+)*)`", destination)
        assert len(owners) == 1, f"stripped skill row has no canonical owner: {row}"
        owner = owners[0]
        skill_owners.append(owner)
        assert (ROOT / "skills" / owner / "SKILL.md").is_file(), (
            f"missing destination skill anchor skills/{owner}/SKILL.md: {row}"
        )

    assert len(skill_owners) == len(set(skill_owners)), (
        f"duplicate canonical owner(s) for stripped rows: {skill_owners}"
    )

    orchestrate = manifest["orchestrate"]
    assert len(orchestrate) == 17
    assert all(set(row) == {"file", "verdict", "notes"} for row in orchestrate)
    assert all(all(isinstance(value, str) and value for value in row.values()) for row in orchestrate)
    files = [row["file"] for row in orchestrate]
    assert len(files) == len(set(files)), "orchestrate manifest has duplicate files"
    assert {row["verdict"] for row in orchestrate} <= {
        "keep",
        "slim",
        "archive",
        "merge-then-delete",
    }
    # AC-S4 deliberately activates in PR3. Do not compare the reference
    # directory with keep+slim rows in this PR.
