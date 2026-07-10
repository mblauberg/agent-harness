from pathlib import Path

from scripts.public_release_check import scan_paths


def seed_required(root: Path) -> None:
    for relative in (
        "README.md",
        "LICENSE",
        "CONTRIBUTING.md",
        "SECURITY.md",
        "THIRD_PARTY_NOTICES.md",
        "docs/ARCHITECTURE.md",
        "docs/worktrees.md",
    ):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("safe\n")


def test_public_scan_rejects_private_paths_secrets_and_unlicensed_skill(tmp_path):
    seed_required(tmp_path)
    private = tmp_path / "notes.md"
    private.write_text("/" + "Users/alice/secret/file\n")
    token = tmp_path / "token.txt"
    token.write_text("github" + "_pat_abcdefghijklmnopqrstuvwxyz123456\n")
    errors = scan_paths(
        ["notes.md", "token.txt", "skills/tanstack-query-best-practices/SKILL.md"],
        tmp_path,
    )
    assert any("personal absolute home path" in error for error in errors)
    assert any("possible GitHub token" in error for error in errors)
    assert any("forbidden tracked path" in error for error in errors)


def test_public_scan_accepts_portable_text_tree(tmp_path):
    seed_required(tmp_path)
    (tmp_path / "safe.md").write_text("Use ${AGENTS_HOME:-$HOME/.agents}.\n")
    assert scan_paths(["safe.md"], tmp_path) == []
