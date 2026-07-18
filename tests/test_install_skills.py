from pathlib import Path
import importlib.util
import json
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "install-skills"
MANAGER = ROOT / "scripts" / "manage_installation.py"


def run(target: Path, *arguments: str):
    return subprocess.run(
        [str(SCRIPT), "--target", str(target), *arguments],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def test_installer_links_every_skill_and_is_idempotent(tmp_path):
    target = tmp_path / "skills"
    first = run(target)
    assert first.returncode == 0, first.stderr
    expected = {path.parent.name for path in (ROOT / "skills").glob("*/SKILL.md")}
    assert {path.name for path in target.iterdir()} == expected
    assert all((target / name).is_symlink() for name in expected)
    assert f"linked={len(expected)} existing=0" in first.stdout

    second = run(target)
    assert second.returncode == 0, second.stderr
    assert f"linked=0 existing={len(expected)}" in second.stdout


def test_check_detects_and_install_reconciles_stale_managed_skill(tmp_path):
    target = tmp_path / "skills"
    assert run(target).returncode == 0
    stale = target / "deliver"
    stale.unlink()

    checked = run(target, "--check")
    assert checked.returncode == 1
    assert "stale=deliver" in checked.stdout

    reconciled = run(target)
    assert reconciled.returncode == 0, reconciled.stderr
    assert stale.is_symlink()
    assert stale.resolve() == ROOT / "skills" / "deliver"
    assert run(target, "--check").returncode == 0


def test_installer_preserves_existing_entries(tmp_path):
    target = tmp_path / "skills"
    target.mkdir()
    existing = target / "scope"
    existing.mkdir()
    marker = existing / "keep.txt"
    marker.write_text("owned elsewhere\n")

    result = run(target)
    assert result.returncode == 0, result.stderr
    assert marker.read_text() == "owned elsewhere\n"
    assert not existing.is_symlink()


def test_directory_symlink_to_canonical_skills_is_preserved_without_manifest(tmp_path):
    fixture_root = tmp_path / "agents"
    scripts = fixture_root / "scripts"
    scripts.mkdir(parents=True)
    shutil.copy2(SCRIPT, scripts / "install-skills")
    shutil.copy2(MANAGER, scripts / "manage_installation.py")
    shutil.copytree(ROOT / "skills", fixture_root / "skills")
    platform_home = tmp_path / "claude"
    platform_home.mkdir()
    target = platform_home / "skills"
    target.symlink_to(fixture_root / "skills", target_is_directory=True)

    result = subprocess.run(
        [str(scripts / "install-skills"), "--target", str(target)],
        cwd=fixture_root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert target.is_symlink()
    assert target.resolve() == fixture_root / "skills"
    assert "skills existing=" in result.stdout
    assert not (fixture_root / ".agent-harness-installation.json").exists()
    assert not (platform_home / ".agent-harness-installation.json").exists()


def test_installer_requires_a_target():
    result = subprocess.run(
        [str(SCRIPT)],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    assert result.returncode == 2
    assert "usage:" in result.stderr


def manager(target: Path, action: str, source: Path | None = None, renames: Path | None = None):
    command = [str(MANAGER), action, "--target", str(target)]
    if source:
        command.extend(["--source", str(source)])
    if renames:
        command.extend(["--renames", str(renames)])
    return subprocess.run(command, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def manifest_for(target: Path):
    return target.parent / ".agent-harness-installation.json"


def tiny_source(tmp_path: Path):
    source = tmp_path / "source"
    for name in ("alpha", "beta"):
        skill = source / name
        skill.mkdir(parents=True)
        (skill / "SKILL.md").write_text(f"---\nname: {name}\ndescription: Use when testing.\n---\n")
    return source


def test_plan_is_read_only_and_distinguishes_missing_and_unmanaged(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    target.mkdir()
    (target / "alpha").mkdir()
    result = manager(target, "plan", source)
    assert result.returncode == 0, result.stderr
    plan = json.loads(result.stdout)
    assert {item["name"]: item["state"] for item in plan["items"]} == {"alpha": "unmanaged", "beta": "missing"}
    assert not manifest_for(target).exists()
    assert not (target / "beta").exists()


def test_install_records_versioned_ownership_without_overwriting_unmanaged(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    target.mkdir()
    unmanaged = target / "alpha"
    unmanaged.mkdir()
    (unmanaged / "keep").write_text("mine")
    result = manager(target, "install", source)
    assert result.returncode == 0, result.stderr
    manifest = json.loads(manifest_for(target).read_text())
    assert manifest["schema_version"] == 1
    assert set(manifest["managed"]) == {"beta"}
    assert manifest["managed"]["beta"]["owner"] == "agent-harness"
    assert (target / "beta").is_symlink()
    assert (unmanaged / "keep").read_text() == "mine"


def test_reconcile_repairs_broken_managed_link_and_rejects_conflict(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    (target / "alpha").unlink()
    (target / "alpha").symlink_to(tmp_path / "missing")
    repaired = manager(target, "reconcile", source)
    assert repaired.returncode == 0, repaired.stderr
    assert (target / "alpha").resolve() == (source / "alpha").resolve()

    (target / "beta").unlink()
    (target / "beta").mkdir()
    conflict = manager(target, "reconcile", source)
    assert conflict.returncode == 3
    assert "conflicting" in conflict.stderr
    assert (target / "beta").is_dir()


def test_uninstall_managed_removes_only_owned_exact_links(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    unmanaged = target / "mine"
    unmanaged.mkdir()
    result = manager(target, "uninstall-managed", source)
    assert result.returncode == 0, result.stderr
    assert unmanaged.is_dir()
    assert not (target / "alpha").exists()
    assert not (target / "beta").exists()
    assert json.loads(manifest_for(target).read_text())["managed"] == {}


def test_reconcile_applies_safe_managed_rename_with_history(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    (source / "alpha").rename(source / "gamma")
    renames = tmp_path / "renames.json"
    renames.write_text(json.dumps({"schema_version": 1, "renames": [{"from": "alpha", "to": "gamma"}]}))
    result = manager(target, "reconcile", source, renames)
    assert result.returncode == 0, result.stderr
    manifest = json.loads(manifest_for(target).read_text())
    assert "alpha" not in manifest["managed"]
    assert manifest["managed"]["gamma"]["history"][-1]["from"] == "alpha"
    assert not (target / "alpha").exists()
    assert (target / "gamma").resolve() == (source / "gamma").resolve()


def test_reconcile_merges_two_sources_into_one_target(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    # A many-to-one skill merge: alpha + beta collapse into a single gamma.
    (source / "alpha").rename(source / "gamma")
    (source / "beta" / "SKILL.md").unlink()
    (source / "beta").rmdir()
    renames = tmp_path / "renames.json"
    renames.write_text(json.dumps({"schema_version": 1, "renames": [
        {"from": "alpha", "to": "gamma"},
        {"from": "beta", "to": "gamma"},
    ]}))
    result = manager(target, "reconcile", source, renames)
    assert result.returncode == 0, result.stderr
    manifest = json.loads(manifest_for(target).read_text())
    assert set(manifest["managed"]) == {"gamma"}
    assert not (target / "alpha").exists()
    assert not (target / "beta").exists()
    assert (target / "gamma").resolve() == (source / "gamma").resolve()
    froms = {entry["from"] for entry in manifest["managed"]["gamma"]["history"]}
    assert {"alpha", "beta"} <= froms


def test_plain_install_then_reconcile_merges_an_already_installed_rename(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    (source / "alpha").rename(source / "gamma")
    assert manager(target, "install", source).returncode == 0
    renames = tmp_path / "renames.json"
    renames.write_text(json.dumps({"schema_version": 1, "renames": [{"from": "alpha", "to": "gamma"}]}))
    result = manager(target, "reconcile", source, renames)
    assert result.returncode == 0, result.stderr
    assert "gamma" in json.loads(result.stdout)["changed"]
    manifest = json.loads(manifest_for(target).read_text())
    assert set(manifest["managed"]) == {"beta", "gamma"}
    assert not (target / "alpha").exists()


def test_manifest_is_bound_to_one_target_root(tmp_path):
    source = tiny_source(tmp_path)
    first = tmp_path / "first"
    second = tmp_path / "second"
    assert manager(first, "install", source).returncode == 0
    result = manager(second, "install", source)
    assert result.returncode == 3
    assert "different target root" in result.stderr


def test_retired_missing_entry_does_not_block_uninstall(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    (source / "alpha").rename(source / "gamma")
    (target / "alpha").unlink()
    result = manager(target, "uninstall-managed", source)
    assert result.returncode == 0, result.stderr
    assert json.loads(manifest_for(target).read_text())["managed"] == {}


def test_full_skill_tree_digest_marks_reference_change_stale(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    (source / "alpha" / "reference.md").write_text("one\n")
    assert manager(target, "install", source).returncode == 0
    (source / "alpha" / "reference.md").write_text("two\n")
    plan = json.loads(manager(target, "plan", source).stdout)
    assert {item["name"]: item["state"] for item in plan["items"]}["alpha"] == "stale"


def test_full_skill_tree_digest_marks_executable_mode_change_stale(tmp_path):
    source = tiny_source(tmp_path)
    helper = source / "alpha" / "run"
    helper.write_text("#!/bin/sh\nexit 0\n")
    helper.chmod(0o755)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    helper.chmod(0o644)
    plan = json.loads(manager(target, "plan", source).stdout)
    assert {item["name"]: item["state"] for item in plan["items"]}["alpha"] == "stale"


def test_manifest_commit_failure_rolls_back_link_mutations(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("managed_installer_failure", MANAGER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"

    def fail_commit(_target, _manifest):
        raise OSError("injected manifest failure")

    monkeypatch.setattr(module, "_write_manifest", fail_commit)
    with pytest.raises(OSError, match="injected"):
        module.execute("install", source, target)
    assert not (target / "alpha").exists()
    assert not (target / "beta").exists()
    assert not manifest_for(target).exists()


def test_manifest_key_traversal_fails_before_uninstall_mutation(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    target.mkdir()
    victim = tmp_path / "victim"
    victim.symlink_to(source / "alpha")
    manifest_for(target).write_text(json.dumps({
        "schema_version": 1,
        "owner": "agent-harness",
        "updated_at": "2026-07-10T00:00:00Z",
        "managed": {"../victim": {"owner": "agent-harness", "source_target": str(source / "alpha"), "source_sha256": "a" * 64, "installed_at": "2026-07-10T00:00:00Z", "history": []}},
    }))
    result = manager(target, "uninstall-managed", source)
    assert result.returncode == 3
    assert "manifest" in result.stderr
    assert victim.is_symlink()


def test_rename_reconcile_preflights_all_conflicts_before_mutation(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    (source / "alpha").rename(source / "gamma")
    (target / "beta").unlink()
    (target / "beta").mkdir()
    renames = tmp_path / "renames.json"
    renames.write_text(json.dumps({"schema_version": 1, "renames": [{"from": "alpha", "to": "gamma"}]}))
    result = manager(target, "reconcile", source, renames)
    assert result.returncode == 3
    assert (target / "alpha").is_symlink()
    assert not (target / "gamma").exists()
    assert "alpha" in json.loads(manifest_for(target).read_text())["managed"]
