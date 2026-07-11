from collections import Counter
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
AFFECTED = {
    "scope",
    "grill-me",
    "implement",
    "orchestrate",
    "session",
    "deliver",
    "work-map",
    "release",
    "retrospect",
}
REQUIRED_DOCTRINE = {
    "scope": ("decision context", "digest-bound"),
    "grill-me": ("decision context", "digest-bound"),
    "implement": ("minor work", "fresh implementation session", "adaptive plan"),
    "orchestrate": ("one chair", "leaders", ".worktrees/<task-agent>"),
    "session": ("fresh session", "provider session", "compaction"),
    "deliver": ("project session", "coordination run", "workstream"),
    "work-map": ("project/run/lead", "not live task truth"),
    "release": ("exact accepted-artifact", "target-bound", "project/session authority"),
    "retrospect": ("gate latency", "unnecessary interruption", "next scope cycle"),
}


def test_spec05_affected_skills_have_focused_routes_and_adapter_absent_coverage():
    known_skills = {path.parent.name for path in (ROOT / "skills").glob("*/SKILL.md")}
    prompts = set()

    for skill in sorted(AFFECTED):
        path = ROOT / "skills" / skill / "evals" / "spec05_cases.yaml"
        data = yaml.safe_load(path.read_text())
        assert data == {
            "schema_version": 1,
            "target_skill": skill,
            "cases": data["cases"],
        }
        assert Counter(case["relation"] for case in data["cases"]) == {
            "positive": 1,
            "negative": 1,
            "adjacent": 1,
            "portability": 1,
        }

        for case in data["cases"]:
            assert set(case) == {"id", "relation", "prompt", "tags", "expected"} | (
                {"adapters"} if case["relation"] == "portability" else set()
            )
            assert case["id"].startswith(f"s05-{skill}-")
            assert case["prompt"].strip() and case["prompt"] not in prompts
            prompts.add(case["prompt"])
            assert "spec05" in case["tags"]

            expected = case["expected"]
            assert set(expected) == {"primary_skill", "companion_skills"}
            assert expected["primary_skill"] in known_skills | {None}
            assert set(expected["companion_skills"]) <= known_skills
            if case["relation"] in {"positive", "portability"}:
                assert expected["primary_skill"] == skill
            elif case["relation"] == "negative":
                assert expected["primary_skill"] != skill
                assert skill not in expected["companion_skills"]
            else:
                assert "composition" in case["tags"]
                assert skill == expected["primary_skill"] or skill in expected["companion_skills"]

        portable = next(case for case in data["cases"] if case["relation"] == "portability")
        assert portable["adapters"] == {
            "console": "absent",
            "herdr": "absent",
            "github": "absent",
        }
        assert "project artifacts" in portable["prompt"].lower()


def test_spec05_affected_skill_doctrine_is_adaptive_portable_and_bounded():
    for skill, fragments in REQUIRED_DOCTRINE.items():
        text = " ".join(
            (ROOT / "skills" / skill / "SKILL.md").read_text().lower().split()
        )
        for fragment in fragments:
            assert fragment in text, f"{skill} lacks Spec 05 doctrine: {fragment}"
        assert "import agent-fabric-console" not in text
        assert "parse the console" not in text
        assert "requires herdr" not in text
        assert "requires github" not in text

    release = (ROOT / "skills" / "release" / "SKILL.md").read_text().lower()
    assert "cannot release or deploy" in release
