from pathlib import Path
import importlib.util
import json
import shutil
import stat
import subprocess
import sys
import time

import pytest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "install-skills"
MANAGER = ROOT / "scripts" / "manage_installation.py"

WORKER = r'''
import importlib.util
from pathlib import Path
import sys
import time

manager_path, action, source, target, ready, release, fail = sys.argv[1:]
spec = importlib.util.spec_from_file_location("managed_installation_worker", manager_path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
assert spec.loader
spec.loader.exec_module(module)
if ready != "-":
    original = module._write_manifest
    def controlled_write(target_path, manifest):
        Path(ready).write_text("ready\n")
        deadline = time.monotonic() + 10
        while not Path(release).exists():
            if time.monotonic() >= deadline:
                raise TimeoutError("worker release timed out")
            time.sleep(0.01)
        if fail == "true":
            raise OSError("injected manifest failure")
        original(target_path, manifest)
    module._write_manifest = controlled_write
module.execute(action, Path(source), Path(target))
'''


def run(target: Path):
    return subprocess.run(
        [str(SCRIPT), "--target", str(target)],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def load_manager_module(name: str):
    spec = importlib.util.spec_from_file_location(name, MANAGER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


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


def test_installer_preserves_existing_entries(tmp_path):
    target = tmp_path / "skills"
    target.mkdir()
    existing = target / "scope"
    existing.mkdir()
    marker = existing / "keep.txt"
    marker.write_text("owned elsewhere\n")

    result = run(target)
    assert result.returncode == 3
    assert "scope=noncanonical" in result.stderr
    assert marker.read_text() == "owned elsewhere\n"
    assert not existing.is_symlink()


def test_installer_reports_foreign_global_skill_without_removing_it(tmp_path):
    target = tmp_path / "skills"
    target.mkdir()
    private = tmp_path / "private-project" / "private-skill"
    private.mkdir(parents=True)
    foreign = target / "private-skill"
    foreign.symlink_to(private)

    result = run(target)

    assert result.returncode == 0
    assert "warning:" in result.stderr
    assert "private-skill=foreign" in result.stderr
    assert foreign.is_symlink()
    assert foreign.resolve() == private.resolve()


def test_check_rejects_empty_directory_at_required_catalogue_name(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    target.mkdir()
    (target / "alpha").mkdir()

    result = manager(target, "check", source)

    assert result.returncode == 3
    assert "alpha=noncanonical" in result.stderr
    assert (target / "alpha").is_dir()


def test_check_rejects_mismatched_skill_at_required_catalogue_name(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    target.mkdir()
    collision = target / "alpha"
    collision.mkdir()
    (collision / "SKILL.md").write_text(
        "---\nname: alpha\ndescription: Different content.\n---\n"
    )

    result = manager(target, "check", source)

    assert result.returncode == 3
    assert "alpha=noncanonical" in result.stderr
    assert "Different content" in (collision / "SKILL.md").read_text()


def test_installer_reconciles_previously_managed_link_drift(tmp_path):
    target = tmp_path / "skills"
    assert run(target).returncode == 0
    scope = target / "scope"
    scope.unlink()

    result = run(target)

    assert result.returncode == 0, result.stderr
    assert scope.resolve() == (ROOT / "skills" / "scope").resolve()


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


def named_source(root: Path, names: tuple[str, ...]):
    source = root / "source"
    for name in names:
        skill = source / name
        skill.mkdir(parents=True)
        (skill / "SKILL.md").write_text(
            f"---\nname: {name}\ndescription: Use when testing.\n---\n"
        )
    return source


def start_worker(
    action: str,
    source: Path,
    target: Path,
    *,
    ready: Path | None = None,
    release: Path | None = None,
    fail: bool = False,
):
    return subprocess.Popen(
        [
            sys.executable,
            "-c",
            WORKER,
            str(MANAGER),
            action,
            str(source),
            str(target),
            str(ready) if ready else "-",
            str(release) if release else "-",
            "true" if fail else "false",
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def wait_for(path: Path) -> None:
    deadline = time.monotonic() + 5
    while not path.exists():
        if time.monotonic() >= deadline:
            raise AssertionError(f"timed out waiting for {path}")
        time.sleep(0.01)


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


@pytest.mark.parametrize("action", ["plan", "check"])
def test_read_only_actions_create_no_target_manifest_lock_or_recovery(tmp_path, action):
    source = tiny_source(tmp_path)
    target = tmp_path / "absent-parent" / "installed"

    result = manager(target, action, source)

    if action == "check":
        assert result.returncode == 3
    else:
        assert result.returncode == 0, result.stderr
    assert not target.parent.exists()


def test_mutation_lock_is_private_regular_and_rejects_symlink_collision(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    victim = tmp_path / "victim"
    victim.write_text("untouched\n")
    lock = target.parent / ".agent-harness-installation.lock"
    lock.symlink_to(victim)

    rejected = manager(target, "install", source)

    assert rejected.returncode == 3
    assert "installation lock" in rejected.stderr
    assert victim.read_text() == "untouched\n"
    lock.unlink()
    installed = manager(target, "install", source)
    assert installed.returncode == 0, installed.stderr
    info = lock.lstat()
    assert stat.S_ISREG(info.st_mode)
    assert stat.S_IMODE(info.st_mode) == 0o600
    assert info.st_nlink == 1


def test_mutation_lock_timeout_is_bounded(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    ready = tmp_path / "lock-ready"
    release = tmp_path / "lock-release"
    holder_code = r'''
import importlib.util
from pathlib import Path
import sys
import time
manager_path, target, ready, release = sys.argv[1:]
spec = importlib.util.spec_from_file_location("lock_holder", manager_path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
assert spec.loader
spec.loader.exec_module(module)
with module._installation_lock(Path(target)):
    Path(ready).write_text("ready\n")
    deadline = time.monotonic() + 10
    while not Path(release).exists():
        if time.monotonic() >= deadline:
            raise TimeoutError("release timed out")
        time.sleep(0.01)
'''
    holder = subprocess.Popen(
        [sys.executable, "-c", holder_code, str(MANAGER), str(target), str(ready), str(release)],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    wait_for(ready)
    module = load_manager_module("managed_installer_lock_timeout")

    with pytest.raises(module.InstallError, match="lock acquisition timed out"):
        module.execute("install", source, target, lock_timeout_ms=50)

    release.write_text("release\n")
    output = holder.communicate(timeout=10)
    assert holder.returncode == 0, output
    assert not target.exists()
    assert not manifest_for(target).exists()


def test_mutation_lock_prevents_disjoint_manifest_lost_update(tmp_path):
    source = named_source(tmp_path / "owner", ("alpha",))
    target = tmp_path / "installed"
    ready = tmp_path / "ready"
    release = tmp_path / "release"
    first = start_worker(
        "install", source, target, ready=ready, release=release
    )
    wait_for(ready)
    beta = source / "beta"
    beta.mkdir()
    (beta / "SKILL.md").write_text(
        "---\nname: beta\ndescription: Use when testing.\n---\n"
    )
    second = start_worker("install", source, target)
    time.sleep(0.2)
    assert second.poll() is None, second.communicate(timeout=1)

    release.write_text("release\n")
    first_output = first.communicate(timeout=10)
    second_output = second.communicate(timeout=10)

    assert first.returncode == 0, first_output
    assert second.returncode == 0, second_output
    manifest = json.loads(manifest_for(target).read_text())
    assert set(manifest["managed"]) == {"alpha", "beta"}


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


def test_reconcile_preserves_valid_different_managed_symlink_as_conflict(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    external = tmp_path / "external"
    external.mkdir()
    live = target / "alpha"
    live.unlink()
    live.symlink_to(external)
    before = live.lstat()

    result = manager(target, "reconcile", source)

    assert result.returncode == 3
    assert "conflicting managed targets: alpha" in result.stderr
    after = live.lstat()
    assert (after.st_dev, after.st_ino, live.readlink()) == (
        before.st_dev,
        before.st_ino,
        external,
    )


def test_normal_install_repairs_managed_drift_and_retires_safe_old_links(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    (source / "beta" / "SKILL.md").write_text(
        "---\nname: beta\ndescription: Use when changed.\n---\n"
    )
    retired_source = source / "alpha"
    retired_target = target / "alpha"
    retired_source.rename(source / "gamma")

    result = manager(target, "install", source)

    assert result.returncode == 0, result.stderr
    manifest = json.loads(manifest_for(target).read_text())
    assert set(manifest["managed"]) == {"beta", "gamma"}
    assert not retired_target.exists()
    assert (target / "beta").resolve() == (source / "beta").resolve()
    assert manifest["managed"]["beta"]["source_sha256"] != "0" * 64
    assert (target / "gamma").resolve() == (source / "gamma").resolve()


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


def test_reconcile_preserves_compatible_unmanaged_rename_target(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    (source / "alpha").rename(source / "gamma")
    unmanaged = target / "gamma"
    unmanaged.symlink_to(source / "gamma")
    renames = tmp_path / "renames.json"
    renames.write_text(json.dumps({"schema_version": 1, "renames": [{"from": "alpha", "to": "gamma"}]}))

    reconciled = manager(target, "reconcile", source, renames)

    assert reconciled.returncode == 0, reconciled.stderr
    manifest = json.loads(manifest_for(target).read_text())
    assert set(manifest["managed"]) == {"beta"}
    assert unmanaged.is_symlink()
    assert unmanaged.resolve() == (source / "gamma").resolve()

    uninstalled = manager(target, "uninstall-managed", source)

    assert uninstalled.returncode == 0, uninstalled.stderr
    assert unmanaged.is_symlink()
    assert unmanaged.resolve() == (source / "gamma").resolve()


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
    installed = manager(target, "install", source)
    assert installed.returncode == 0
    assert not (target / "alpha").exists()
    assert (target / "gamma").resolve() == (source / "gamma").resolve()
    renames = tmp_path / "renames.json"
    renames.write_text(json.dumps({"schema_version": 1, "renames": [{"from": "alpha", "to": "gamma"}]}))
    result = manager(target, "reconcile", source, renames)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["changed"] == []
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


def test_check_reports_foreign_resolving_link_without_deleting_it(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    private_skill = tmp_path / "private-project" / "secret-skill"
    private_skill.mkdir(parents=True)
    foreign = target / "secret-skill"
    foreign.symlink_to(private_skill)

    result = manager(target, "check", source)

    assert result.returncode == 0
    report = json.loads(result.stdout)
    assert {item["name"]: item["state"] for item in report["items"]}["secret-skill"] == "foreign"
    assert foreign.is_symlink()
    assert foreign.resolve() == private_skill.resolve()


def test_check_verifies_canonical_catalogue_and_ignores_ds_store(tmp_path):
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    assert manager(target, "install", source).returncode == 0
    (target / ".DS_Store").write_bytes(b"metadata")
    (target / "alpha").unlink()

    missing = manager(target, "check", source)

    assert missing.returncode == 3
    report = json.loads(missing.stdout)
    assert {item["name"]: item["state"] for item in report["items"]}["alpha"] == "missing"
    assert ".DS_Store" not in {item["name"] for item in report["items"]}

    assert manager(target, "install", source).returncode == 0
    assert manager(target, "check", source).returncode == 0


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


def test_stale_reconcile_restores_different_target_writer_raced_before_exchange(
    tmp_path, monkeypatch
):
    module = load_manager_module("managed_installer_pre_exchange_race")
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    module.execute("install", source, target)
    stale = target / "alpha"
    stale.unlink()
    stale.symlink_to(tmp_path / "missing")
    external = tmp_path / "external"
    external.mkdir()
    original_exchange = module.atomic_exchange
    raced = False

    def race(candidate, path):
        nonlocal raced
        if path == stale and not raced:
            raced = True
            stale.unlink()
            stale.symlink_to(external)
        original_exchange(candidate, path)

    monkeypatch.setattr(module, "atomic_exchange", race)
    with pytest.raises(module.InstallError, match="restored newer path"):
        module.execute("reconcile", source, target)

    assert stale.resolve() == external
    assert json.loads(manifest_for(target).read_text())["managed"]["alpha"]


def test_same_target_substitution_after_exchange_is_preserved_by_exact_identity(
    tmp_path, monkeypatch
):
    module = load_manager_module("managed_installer_same_target_race")
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    module.execute("install", source, target)
    stale = target / "alpha"
    stale.unlink()
    stale.symlink_to(tmp_path / "missing")
    original_exchange = module.atomic_exchange
    raced_identity = None
    raced = False

    def race(candidate, path):
        nonlocal raced, raced_identity
        original_exchange(candidate, path)
        if path == stale and not raced:
            raced = True
            stale.unlink()
            stale.symlink_to(source / "alpha")
            info = stale.lstat()
            raced_identity = (info.st_dev, info.st_ino, stale.readlink())

    monkeypatch.setattr(module, "atomic_exchange", race)
    with pytest.raises(module.InstallError, match=r"preserve recovery path (.+)") as raised:
        module.execute("reconcile", source, target)

    recovery = Path(str(raised.value).split("preserve recovery path ", 1)[1])
    info = stale.lstat()
    assert (info.st_dev, info.st_ino, stale.readlink()) == raced_identity
    assert stale.resolve() == (source / "alpha").resolve()
    assert recovery.is_symlink()
    assert recovery.resolve(strict=False) == (tmp_path / "missing").resolve(strict=False)
    assert json.loads(manifest_for(target).read_text())["managed"]["alpha"]


def test_same_target_substitution_after_absent_install_is_not_claimed(
    tmp_path, monkeypatch
):
    module = load_manager_module("managed_installer_absent_same_target_race")
    source = named_source(tmp_path / "owner", ("alpha",))
    target = tmp_path / "installed"
    installed = target / "alpha"
    original_link = module._hardlink_if_absent
    raced_identity = None

    def race(candidate, destination):
        nonlocal raced_identity
        original_link(candidate, destination)
        destination.unlink()
        destination.symlink_to(source / "alpha")
        info = destination.lstat()
        raced_identity = (info.st_dev, info.st_ino, destination.readlink())

    monkeypatch.setattr(module, "_hardlink_if_absent", race)
    with pytest.raises(module.InstallError, match="preserved newer path"):
        module.execute("install", source, target)

    info = installed.lstat()
    assert (info.st_dev, info.st_ino, installed.readlink()) == raced_identity
    assert installed.resolve() == (source / "alpha").resolve()
    assert not manifest_for(target).exists()


def test_uninstall_restores_writer_raced_before_atomic_removal(tmp_path, monkeypatch):
    module = load_manager_module("managed_installer_remove_race")
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    module.execute("install", source, target)
    live = target / "alpha"
    external = tmp_path / "external"
    external.mkdir()
    original_rename = module.os.rename
    raced_identity = None
    raced = False

    def race(path, recovery):
        nonlocal raced, raced_identity
        if path == live and not raced:
            raced = True
            live.unlink()
            live.symlink_to(external)
            info = live.lstat()
            raced_identity = (info.st_dev, info.st_ino, live.readlink())
        original_rename(path, recovery)

    monkeypatch.setattr(module.os, "rename", race)
    with pytest.raises(module.InstallError, match="restored newer path"):
        module.execute("uninstall-managed", source, target)

    info = live.lstat()
    assert (info.st_dev, info.st_ino, live.readlink()) == raced_identity
    assert live.resolve() == external
    assert "alpha" in json.loads(manifest_for(target).read_text())["managed"]


def test_writer_after_install_is_preserved_when_manifest_commit_fails(
    tmp_path, monkeypatch
):
    module = load_manager_module("managed_installer_rollback_writer")
    source = named_source(tmp_path / "owner", ("alpha",))
    target = tmp_path / "installed"
    external = tmp_path / "external"
    external.mkdir()

    def fail_commit(_target, _manifest):
        installed = target / "alpha"
        installed.unlink()
        installed.symlink_to(external)
        raise OSError("injected manifest failure")

    monkeypatch.setattr(module, "_write_manifest", fail_commit)
    with pytest.raises(module.InstallError, match="preserved newer or uncertain path: alpha"):
        module.execute("install", source, target)

    assert (target / "alpha").resolve() == external
    assert not manifest_for(target).exists()


def test_skill_directory_fsync_failure_rolls_back_and_fsyncs_rollback(
    tmp_path, monkeypatch
):
    module = load_manager_module("managed_installer_skill_fsync_failure")
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    original_fsync = module._fsync_directory
    target_calls = 0

    def fail_first_target(path):
        nonlocal target_calls
        if path == target:
            target_calls += 1
            if target_calls == 1:
                raise OSError("injected skill directory fsync failure")
        original_fsync(path)

    monkeypatch.setattr(module, "_fsync_directory", fail_first_target)
    with pytest.raises(OSError, match="injected skill directory fsync failure"):
        module.execute("install", source, target)

    assert target_calls == 2
    assert not (target / "alpha").exists()
    assert not (target / "beta").exists()
    assert not manifest_for(target).exists()


def test_manifest_parent_fsync_failure_keeps_manifest_and_links_aligned(
    tmp_path, monkeypatch
):
    module = load_manager_module("managed_installer_manifest_fsync_failure")
    source = tiny_source(tmp_path)
    target = tmp_path / "installed"
    original_fsync = module._fsync_directory
    parent_calls = 0

    def fail_manifest_parent(path):
        nonlocal parent_calls
        if path == target.parent:
            parent_calls += 1
            if parent_calls == 2:
                raise OSError("injected manifest parent fsync failure")
        original_fsync(path)

    monkeypatch.setattr(module, "_fsync_directory", fail_manifest_parent)
    with pytest.raises(module.ManifestCommitUncertainError, match="manifest replaced"):
        module.execute("install", source, target)

    manifest = json.loads(manifest_for(target).read_text())
    assert set(manifest["managed"]) == {"alpha", "beta"}
    assert (target / "alpha").resolve() == (source / "alpha").resolve()
    assert (target / "beta").resolve() == (source / "beta").resolve()
