from pathlib import Path
import re
import shutil
import subprocess
import sys

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = Path.home() / ".claude" / "workflows"


def frontmatter_name(path: Path) -> str:
    text = path.read_text()
    match = re.search(r"^name:\s*([^\n]+)$", text, re.MULTILINE)
    assert match, f"missing name in {path}"
    return match.group(1).strip()


def test_lifecycle_skills_are_portable_and_named_for_their_directory():
    for name in ("implement", "code-review"):
        skill = ROOT / "skills" / name / "SKILL.md"
        assert skill.is_file(), f"missing portable {name} skill"
        assert frontmatter_name(skill) == name


def test_claude_workflows_do_not_reference_retired_orchestration_skill():
    offenders = []
    for path in WORKFLOWS.glob("*.js"):
        if "multi-agent-orchestration" in path.read_text():
            offenders.append(path.name)
    assert offenders == []


def test_constitution_names_equal_primaries_and_router_has_current_codex_family():
    text = (ROOT / "HARNESS.md").read_text()
    assert "fallback orchestrator" not in text.lower()
    assert all(alias in text for alias in ("flagship", "workhorse", "scout"))
    assert "equal primary orchestrators" in text
    assert "never block on absence" in text
    routing = (ROOT / "skills" / "orchestrate" / "references" / "routing-and-tiers.md").read_text()
    assert "GPT-5.6" in routing


def test_constitution_is_a_compact_core_with_progressive_disclosure():
    text = (ROOT / "HARNESS.md").read_text()
    assert len(text.split()) <= 700
    assert "paired-primary.md" in text
    assert "config/risk-policy.json" in text
    assert "skills/release/" in text
    assert "skills/evaluate/" in text


def test_release_and_evaluate_complete_the_delivery_spine():
    for name in ("release", "evaluate"):
        skill = ROOT / "skills" / name / "SKILL.md"
        assert skill.is_file()
        assert frontmatter_name(skill) == name


def test_autonomous_lab_external_reviewers_fail_closed_read_only():
    script = (ROOT / "skills" / "autonomous-lab" / "scripts" / "cross-family.sh").read_text()
    dispatcher = (ROOT / "skills" / "orchestrate" / "scripts" / "cf_dispatch.sh").read_text()
    assert "CF_DISPATCH" in script
    assert "codex exec -s read-only" in dispatcher
    assert "--editable" not in script
    assert "--dangerously-skip-permissions" not in script
    assert "BOTH_PRIMARY" in script
    assert "cancelled without delaying the gate" in script


def test_root_harness_checker_is_available():
    checker = ROOT / "scripts" / "check-harness"
    assert checker.is_file()
    assert checker.stat().st_mode & 0o111


def test_dispatchers_default_to_their_checkout_not_a_home_install():
    dispatcher = (ROOT / "skills" / "orchestrate" / "scripts" / "cf_dispatch.sh").read_text()
    cross_family = (ROOT / "skills" / "autonomous-lab" / "scripts" / "cross-family.sh").read_text()
    assert 'AGENTS_ROOT="${AGENTS_HOME:-$HARNESS_ROOT}"' in dispatcher
    assert 'MODEL_ROUTE="${AGENTS_HOME:-$HARNESS_ROOT}/scripts/model-route"' in cross_family
    assert '${AGENTS_HOME:-$HOME/.agents}/scripts/model-route' not in dispatcher + cross_family


@pytest.mark.skipif(
    not all((WORKFLOWS / name).is_file() for name in ("implement-run.js", "codebase-polish.js", "cross-verify.js")),
    reason="optional local Claude workflow installation is absent",
)
def test_claude_workflows_use_router_and_safe_implement_loop():
    for name in ("implement-run.js", "codebase-polish.js", "cross-verify.js"):
        text = (WORKFLOWS / name).read_text()
        assert "model-route" in text
        assert "claude-haiku-" not in text
    implementation = (WORKFLOWS / "implement-run.js").read_text()
    assert "cycle <= 2" in implementation
    assert "state: 'awaiting-human'" in implementation
    assert "git checkout" not in implementation
    assert "git restore" not in implementation
    assert "git reset" not in implementation
    assert "required: false" in implementation
    assert "otherPrimaryRan" in implementation
    assert "bonus availability never blocks" in implementation
    assert "Copy the global deliver RUN.template.json" in implementation
    assert "refusing the next dispatch" in implementation
    assert "do not recreate or replace it" in implementation
    assert "Review verdicts and dispatcher lineage" in implementation
    assert "certification_eligible" in implementation
    assert "Machine gate FAILED" in implementation
    assert "state: 'failed'" in implementation


def test_implement_skill_uses_canonical_delivery_completion_states():
    text = (ROOT / "skills" / "implement" / "SKILL.md").read_text()
    assert "`awaiting_acceptance`" in text
    assert "`accepted`" in text
    assert "`complete` only after" not in text
    assert "`awaiting-human` is a successful machine-gate state" not in text
    assert not (ROOT / "skills" / "implement" / "scripts" / "validate_run.py").exists()
    assert not (ROOT / "skills" / "implement" / "templates" / "RUN.template.json").exists()


def test_read_only_review_allows_scoped_artifacts_but_forbids_unscoped_scratch():
    text = " ".join((ROOT / "skills" / "code-review" / "SKILL.md").read_text().split())
    assert "Artifact-only authority permits named outputs under the assigned run directory" in text
    assert "does not permit arbitrary repo-root scratch" in text


def test_code_review_uses_task_selected_multi_agent_lenses_without_voting():
    skill = (ROOT / "skills" / "code-review" / "SKILL.md").read_text()
    topology = (ROOT / "skills" / "code-review" / "references" / "multi-agent-review.md").read_text()
    assert "2–4 blind independent agents" in skill
    assert "Correctness/spec alignment" in skill
    assert "anonymised claim challenge" in skill
    assert "Never rank prose or majority-vote" in skill
    assert "fresh-context reducer" in topology


def test_default_agent_run_directory_is_ignored_in_the_harness_repo():
    assert ".agent-run/" in (ROOT / ".gitignore").read_text().splitlines()


def test_context_hygiene_is_owned_by_session_and_delivery_checkpoints():
    harness = " ".join((ROOT / "HARNESS.md").read_text().split())
    implementation = (ROOT / "skills" / "implement" / "references" / "run-contract.md").read_text()
    assert "`session` owns context hygiene" in harness
    assert "RUN.json" in implementation
    assert "checkpoint" in (ROOT / "skills" / "deliver" / "templates" / "RUN.template.json").read_text()


def test_retired_change_identity_is_absent_and_readme_diagram_has_human_gates():
    assert not (ROOT / "skills" / "change").exists()
    readme = (ROOT / "README.md").read_text()
    assert "$change" not in readme
    assert "deliver · profile and typed RUN.json" in readme
    lifecycle = readme.split("## Lifecycle", 1)[1].split("## Core workflows", 1)[0]
    diagrams = re.findall(r"```mermaid\n(.*?)\n```", lifecycle, re.DOTALL)
    semantics = "\n".join(diagrams)
    assert len(diagrams) == 1
    assert all("accTitle:" in diagram and "accDescr:" in diagram for diagram in diagrams)
    assert semantics.count("HUMAN ·") == 3
    for stage in (
        "session",
        "scope",
        "implement",
        "deliver",
        "verify",
        "review",
        "release",
        "observe",
        "retrospect",
    ):
        assert stage in semantics


@pytest.mark.skipif(shutil.which("mmdc") is None, reason="optional local Mermaid CLI is absent")
def test_readme_mermaid_parses_with_available_local_renderer(tmp_path):
    readme = (ROOT / "README.md").read_text()
    diagrams = re.findall(r"```mermaid\n(.*?)\n```", readme, re.DOTALL)
    for index, diagram in enumerate(diagrams):
        source = tmp_path / f"diagram-{index}.mmd"
        output = tmp_path / f"diagram-{index}.svg"
        source.write_text(diagram)
        subprocess.run(
            ["mmdc", "-i", str(source), "-o", str(output)],
            cwd=tmp_path,
            check=True,
            capture_output=True,
            text=True,
        )
        assert output.is_file()


def test_engineering_docs_requires_visual_diagram_qa():
    skill_root = ROOT / "skills" / "engineering-docs"
    skill = (skill_root / "SKILL.md").read_text()
    quality = (skill_root / "references" / "diagram-quality.md").read_text()
    assert "visually inspect" in skill
    assert "narrow widths" in skill
    assert '(cd "$out" && mmdc' in skill
    assert "one conceptual level per diagram" in quality
    assert "target's Mermaid version" in quality
    assert "temporary working directory" in quality
    assert "accTitle" in quality and "accDescr" in quality
    assert "Never draw a false transition" in quality


def test_readme_catalogue_contains_every_portable_skill():
    skills = {path.parent.name for path in (ROOT / "skills").glob("*/SKILL.md")}
    readme = (ROOT / "README.md").read_text()
    catalogue = readme.split("<!-- skill-catalogue:start -->", 1)[1].split(
        "<!-- skill-catalogue:end -->", 1
    )[0]
    listed = set(re.findall(r"`([a-z0-9-]+)`", catalogue))
    assert listed == skills
    for name in skills:
        assert f"(skills/{name}/SKILL.md)" in catalogue


def test_openai_skill_sidecar_descriptions_fit_provider_contract():
    for path in (ROOT / "skills").glob("*/agents/openai.yaml"):
        value = yaml.safe_load(path.read_text())
        description = value["interface"]["short_description"]
        assert 25 <= len(description) <= 64, path


def test_orchestrate_static_checker_does_not_claim_model_routing_passes():
    checker = ROOT / "skills" / "orchestrate" / "evals" / "check_skill_triggers.py"
    result = subprocess.run(
        [sys.executable, str(checker)],
        check=True,
        capture_output=True,
        text=True,
    )
    assert "SKILL DOCTRINE CHECK: PASS" in result.stdout
    assert "routing evidence is external" in result.stdout
    assert " explicit" not in result.stdout
    assert " inferred" not in result.stdout


@pytest.mark.parametrize(
    "content",
    (
        "schema_version: 1\ndoctrine_invariants: []\nreference_invariants: []\n",
        "schema_version: 1\ndoctrine_invariants:\n  - only one\n",
        "[]\n",
    ),
)
def test_orchestrate_doctrine_checker_rejects_empty_or_malformed_contracts(
    tmp_path, content
):
    cases = tmp_path / "contract_cases.yaml"
    cases.write_text(content)
    checker = ROOT / "skills" / "orchestrate" / "evals" / "check_skill_triggers.py"
    result = subprocess.run(
        [sys.executable, str(checker), "--cases", str(cases)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert "SKILL CHECK: FAIL" in result.stdout


def test_readme_is_concise_public_facing_and_free_of_process_commentary():
    readme = (ROOT / "README.md").read_text()
    assert len(readme.split()) <= 1000
    for retired_phrase in (
        "Experimental:",
        "made public for reuse",
        "stay out of the geometry",
        "The short constitution",
        "Skill maintainers should start",
        "Before publishing a fork",
    ):
        assert retired_phrase not in readme
    assert "scripts/install-harness" in readme
    assert "SECURITY.md" in readme
    installer = ROOT / "scripts" / "install-harness"
    assert installer.is_file()
    assert installer.stat().st_mode & 0o111


def test_react_performance_skill_is_vendor_neutral_lean_and_vite_aware():
    root = ROOT / "skills" / "react-performance"
    skill = (root / "SKILL.md").read_text()
    assert frontmatter_name(root / "SKILL.md") == "react-performance"
    assert len(skill.split()) <= 500
    assert "Vite" in skill
    assert not (ROOT / "skills" / "vercel-react-best-practices").exists()
    assert not any((root / name).exists() for name in ("AGENTS.md", "README.md", "metadata.json"))
    assert not list((root / "rules").glob("js-*.md"))
    assert (root / "references" / "vite.md").is_file()


def test_natural_writing_replaces_humanise_text_with_a_lean_general_fallback():
    root = ROOT / "skills" / "natural-writing"
    skill = (root / "SKILL.md").read_text()
    patterns = (root / "references" / "patterns.md").read_text()
    interface = (root / "agents" / "openai.yaml").read_text()
    tracked_text = "\n".join(
        path.read_text()
        for path in (ROOT / "README.md", ROOT / "HARNESS.md", ROOT / "MAINTAINING.md")
    )
    assert frontmatter_name(root / "SKILL.md") == "natural-writing"
    assert len(skill.split()) <= 500
    assert not (ROOT / "skills" / "humanise-text").exists()
    assert not (ROOT / "skills" / "clean-writing").exists()
    assert "humanise-text" not in tracked_text
    assert "clean-writing" not in tracked_text
    assert "engineering-writing" in skill
    assert "academic-writing" in skill
    assert "legal-writing" in skill
    assert "never proof of authorship" in patterns
    assert "2026.eacl-long.307" in patterns
    assert "2026.acl-long.2030" in patterns
    assert "full-humanise" not in skill + patterns
    assert "$natural-writing" in interface


def test_retrospect_closes_the_quality_flywheel_without_log_bloat():
    path = ROOT / "skills" / "retrospect" / "SKILL.md"
    skill = path.read_text()
    assert frontmatter_name(path) == "retrospect"
    assert len(skill.split()) <= 500
    for term in ("Benchmark", "Diagnose", "Verify", "Monitor"):
        assert term in skill
    assert "one dated log per run" in skill
    assert "proposal-first and read-only by default" in skill
    assert "human-approved scope" in skill
