from pathlib import Path
import runpy
import re

import pytest
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
    """AC-S3/S4: the manifest is complete and its migrations are active."""
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
    retained = {
        row["file"] for row in orchestrate if row["verdict"] in {"keep", "slim"}
    }
    archived = [row["file"] for row in orchestrate if row["verdict"] == "archive"]
    merged = [
        row["file"] for row in orchestrate if row["verdict"] == "merge-then-delete"
    ]
    assert len(retained) == 15
    assert len(archived) == len(merged) == 1

    orchestrate_root = ROOT / "skills" / "orchestrate"
    reference_dir = orchestrate_root / "references"
    actual = {path.name for path in reference_dir.glob("*.md")}
    assert actual == retained

    skill = (orchestrate_root / "SKILL.md").read_text(encoding="utf-8")
    reference_loader = skill.split("## References", 1)[1].split(
        "## Adapter-absent path", 1
    )[0]
    loader_entries = set(re.findall(r"`([^`]+\.md)`", reference_loader))
    assert loader_entries == retained

    research = ROOT / "docs" / "research"
    research_index = (research / "README.md").read_text(encoding="utf-8")
    archived_name = archived[0]
    assert not (reference_dir / archived_name).exists()
    assert (research / archived_name).is_file()
    assert re.search(
        rf"\]\({re.escape(archived_name)}\)\n\s+: [^\n]*normative owner[^\n]*`orchestrate`",
        research_index,
        re.IGNORECASE,
    )

    merged_name = merged[0]
    assert not (reference_dir / merged_name).exists()
    verification = (reference_dir / "verification.md").read_text(encoding="utf-8")
    for invariant in (
        "Do not treat panel agreement as ground truth",
        "Use voting only for low-stakes or objective candidate filtering",
        "supported`, `contradicted`, or `needs-evidence",
        "They do not score prose quality or vote on truth",
        "Do not let a reviewer judge its own authored surface",
        "Use a fresh-context reducer for crucial decisions",
        "A council adds pressure, not authority",
    ):
        assert invariant in verification
    assert merged_name not in verification

    contract_cases = yaml.safe_load(
        (orchestrate_root / "evals" / "contract_cases.yaml").read_text(
            encoding="utf-8"
        )
    )
    reference_invariants = set(contract_cases["reference_invariants"])
    assert merged_name not in reference_invariants
    assert "Claude-only Workflow adapter" in reference_invariants
    assert "saved-workflow conventions" in reference_invariants

    checker = runpy.run_path(
        str(orchestrate_root / "evals" / "check_skill_triggers.py")
    )
    assert checker["REQUIRED_REFS"] == retained

    dynamic = (reference_dir / "dynamic-workflows.md").read_text(encoding="utf-8")
    assert "orchestration-contract.md" in dynamic
    assert "saved-workflow conventions" in dynamic
    assert "memory-scratchpad.md" in dynamic
    assert all(
        duplicated not in dynamic
        for duplicated in ("MANIFEST.md", "RUN_RECEIPT.json", "FINAL_GATE.md")
    )

    routing = (reference_dir / "routing-and-tiers.md").read_text(encoding="utf-8")
    assert "Never route by a memorised model name" in routing
    assert "hard-code a dated model ID" not in dynamic

    paired = (reference_dir / "paired-primary.md").read_text(encoding="utf-8")
    assert "[herdr-panes.md](herdr-panes.md)" in paired
    assert "Fabric carries answer-bearing" not in paired

    retrieval = (reference_dir / "retrieval-and-tool-routing.md").read_text(
        encoding="utf-8"
    )
    assert "(orchestration-contract.md#worker-contract)" in retrieval
    assert "source-scope:" not in retrieval

    cli = (reference_dir / "cli-headless.md").read_text(encoding="utf-8")
    runtime_routing = cli.split("## Runtime routing", 1)[1].split(
        "## Output normalisation", 1
    )[0]
    assert "[routing-and-tiers.md](routing-and-tiers.md)" in runtime_routing
    assert "hard-code a dated model ID" not in runtime_routing


@pytest.mark.parametrize(
    "mutation, message",
    (
        (
            lambda manifest: manifest["orchestrate"][0].update(verdict="kepe"),
            "invalid verdict",
        ),
        (
            lambda manifest: manifest["orchestrate"][1].update(
                file=manifest["orchestrate"][0]["file"]
            ),
            "duplicate filenames",
        ),
        (
            lambda manifest: manifest["orchestrate"].pop(),
            "must have 17 orchestrate rows",
        ),
    ),
)
def test_orchestrate_required_refs_reject_malformed_manifest(
    tmp_path, mutation, message
):
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    mutation(manifest)
    malformed = tmp_path / "disclosure-migration.yaml"
    malformed.write_text(yaml.safe_dump(manifest), encoding="utf-8")
    checker = runpy.run_path(
        str(ROOT / "skills" / "orchestrate" / "evals" / "check_skill_triggers.py")
    )

    with pytest.raises(ValueError, match=message):
        checker["required_refs_from_manifest"](malformed)


def test_orchestrate_required_refs_reject_unreadable_manifest(tmp_path):
    checker = runpy.run_path(
        str(ROOT / "skills" / "orchestrate" / "evals" / "check_skill_triggers.py")
    )

    with pytest.raises(ValueError, match="manifest is unreadable"):
        checker["required_refs_from_manifest"](tmp_path / "missing.yaml")
