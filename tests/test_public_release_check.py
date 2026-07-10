from pathlib import Path

from scripts.public_release_check import scan_paths


def seed_required(root: Path) -> None:
    for relative in (
        "ACKNOWLEDGEMENTS.md",
        "README.md",
        "LICENSE",
        "MAINTAINING.md",
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
        [
            "notes.md",
            "token.txt",
            "skills/clean-writing/SKILL.md",
            "skills/humanise-text/SKILL.md",
            "skills/tanstack-query-best-practices/SKILL.md",
            "skills/vercel-react-best-practices/SKILL.md",
        ],
        tmp_path,
    )
    assert any("personal absolute home path" in error for error in errors)
    assert any("possible GitHub token" in error for error in errors)
    assert sum("forbidden tracked path" in error for error in errors) == 4


def test_public_scan_accepts_portable_text_tree(tmp_path):
    seed_required(tmp_path)
    (tmp_path / "safe.md").write_text("Use ${AGENTS_HOME:-$HOME/.agents}.\n")
    assert scan_paths(["safe.md"], tmp_path) == []


def test_public_tree_retains_ui_ux_pro_max_attribution():
    root = Path(__file__).resolve().parents[1]
    licence = root / "skills/frontend-design/UI_UX_PRO_MAX_LICENSE"
    notice = (root / "skills/frontend-design/NOTICE.md").read_text()
    repository_notice = (root / "THIRD_PARTY_NOTICES.md").read_text()
    assert "Copyright (c) 2024 Next Level Builder" in licence.read_text()
    assert "UI UX Pro Max" in notice
    assert "UI_UX_PRO_MAX_LICENSE" in notice
    assert "UI UX Pro Max v2.0.0" in repository_notice
    assert "UI_UX_PRO_MAX_LICENSE" in repository_notice


def test_public_tree_retains_natural_writing_attribution():
    root = Path(__file__).resolve().parents[1]
    licence = root / "skills" / "natural-writing" / "BLADER_HUMANIZER_LICENSE"
    notice = (root / "skills" / "natural-writing" / "NOTICE.md").read_text()
    repository_notice = (root / "THIRD_PARTY_NOTICES.md").read_text()
    assert "Copyright (c) 2025 Siqi Chen" in licence.read_text()
    assert "blader/humanizer" in notice
    assert "BLADER_HUMANIZER_LICENSE" in notice
    assert "Natural writing" in repository_notice
    assert "BLADER_HUMANIZER_LICENSE" in repository_notice
