#!/usr/bin/env python3
"""Executable Spec 05 lifecycle-skill routing and portability evaluation."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any

import yaml


SCHEMA_VERSION = 1
EVALUATION_ID = "spec05-skill-routing-20260712-v1"
ROUTE = "generated MCP -> daemon -> task-bound ephemeral provider action"
AFFECTED = (
    "deliver",
    "grill-me",
    "implement",
    "orchestrate",
    "release",
    "retrospect",
    "scope",
    "session",
    "work-map",
)
FAMILIES = {
    "anthropic": "claude-agent-sdk",
    "google": "agy",
    "xai": "cursor-agent",
}
ARTIFACT_KINDS = {
    "deliver": "delivery-receipt",
    "grill-me": "decision-context",
    "implement": "implementation-checkpoint",
    "orchestrate": "coordination-summary",
    "release": "promotion-receipt",
    "retrospect": "retrospective-receipt",
    "scope": "scope-handoff",
    "session": "session-handoff",
    "work-map": "effort-map",
}
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
CLASSIFIER_INSTRUCTION = """You are a blind skill-routing evaluator. For every opaque case, choose exactly one primary skill and zero or more genuinely required companion skills from the complete catalogue. The primary skill's built-in obligations do not become companions: add a companion only when the user explicitly requests a separate second lifecycle, domain, tool, or presentation outcome. Preserving decision context, starting or checkpointing a session, adapting topology, and feeding evidence forward stay inside the named primary when its own contract already requires them. Copy skill names exactly. For portability cases, also complete the requested workflow using project artifacts only and return the named artifact kind without Console, Herdr, or GitHub. Return only one JSON object with schema_version 1 and a selections array. Each selection must contain exactly case_id, primary_skill, companion_skills, and portable_workflow. portable_workflow is null for ordinary cases; otherwise it contains exactly artifact_kind, artifact_basis (project-artifacts), adapters_used (an empty array), and status (completed). Do not use tools, infer from case IDs, or include commentary.
"""
PROVIDER_PREAMBLE = (
    "Perform the frozen blind routing evaluation below.\n\n"
    "Do not call tools. Return only the required JSON object; no Markdown fence or commentary."
)


class Invalid(ValueError):
    pass


def fail(condition: bool, message: str) -> None:
    if condition:
        raise Invalid(message)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def _skill_description(path: Path) -> str:
    text = path.read_text()
    match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    fail(match is None, f"{path} lacks frontmatter")
    frontmatter = yaml.safe_load(match.group(1))
    fail(not isinstance(frontmatter, dict), f"{path} frontmatter is invalid")
    description = frontmatter.get("description")
    fail(not isinstance(description, str) or not description.strip(), f"{path} description is invalid")
    return " ".join(description.split())


def live_catalogue(root: Path) -> str:
    rows = []
    for skill_path in sorted((root / "skills").glob("*/SKILL.md")):
        rows.append(f"- {skill_path.parent.name}: {_skill_description(skill_path)}")
    fail(not rows, "live skill catalogue is empty")
    return "\n".join(rows) + "\n"


def live_cases(root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    sequence = 0
    for skill in AFFECTED:
        path = root / "skills" / skill / "evals" / "spec05_cases.yaml"
        payload = yaml.safe_load(path.read_text())
        fail(payload.get("target_skill") != skill, f"{skill} focused cases target another skill")
        for case in payload.get("cases", []):
            sequence += 1
            expected = case.get("expected")
            fail(not isinstance(expected, dict), f"{skill} case lacks expected route")
            rows.append({
                "id": f"c{sequence:03d}",
                "relation": case.get("relation"),
                "prompt": case.get("prompt"),
                "expected": {
                    "primary_skill": expected.get("primary_skill"),
                    "companion_skills": expected.get("companion_skills"),
                },
                "portable_artifact_kind": ARTIFACT_KINDS[skill]
                if case.get("relation") == "portability" else None,
            })
    fail(len(rows) != len(AFFECTED) * 4, "focused cases are incomplete")
    fail(len({row["id"] for row in rows}) != len(rows), "opaque case ids are not unique")
    return rows


def routing_packet(catalogue: str, cases: list[dict[str, Any]]) -> str:
    prompts = "\n".join(f'{case["id"]}: {case["prompt"]}' for case in cases)
    portability = "\n".join(
        f'{case["id"]}: {case["portable_artifact_kind"]}'
        for case in cases if case["portable_artifact_kind"] is not None
    )
    return (
        f"{CLASSIFIER_INSTRUCTION}\n## Skill catalogue\n\n{catalogue}"
        f"\n## Opaque cases\n\n{prompts}\n"
        f"\n## Portability artifact contracts\n\n{portability}\n"
    )


def provider_prompt(packet: str) -> str:
    return f"{PROVIDER_PREAMBLE}\n\n{packet}"


def _dataset_payload(root: Path) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "dataset_id": EVALUATION_ID,
        "cases": live_cases(root),
    }


def _routing_plan(root: Path, evidence: Path) -> dict[str, Any]:
    cases = live_cases(root)
    return {
        "schema_version": SCHEMA_VERSION,
        "evaluation_id": EVALUATION_ID,
        "dataset": {
            "path": "routing-holdout.yaml",
            "sha256": sha256_file(evidence / "routing-holdout.yaml"),
            "cases": len(cases),
        },
        "catalogue": {
            "path": "catalogue.txt",
            "sha256": sha256_file(evidence / "catalogue.txt"),
        },
        "classifier": {
            "path": "classifier-instruction.txt",
            "sha256": sha256_file(evidence / "classifier-instruction.txt"),
            "packet_path": "routing-packet.txt",
            "packet_sha256": sha256_file(evidence / "routing-packet.txt"),
            "provider_prompt_sha256": sha256_bytes(
                provider_prompt((evidence / "routing-packet.txt").read_text()).encode()
            ),
        },
        "schedule": {
            "families": sorted(FAMILIES),
            "minimum_families": len(FAMILIES),
            "case_rows": len(cases) * len(FAMILIES),
        },
        "thresholds": {
            "primary_accuracy": 1.0,
            "companion_fidelity": 0.9,
            "critical_portability_failures": 0,
        },
    }


def validate_frozen_routing_inputs(root: Path, evidence: Path) -> None:
    fail(not evidence.is_dir(), "Spec 05 routing evidence directory is missing")
    dataset = yaml.safe_load((evidence / "routing-holdout.yaml").read_text())
    fail(dataset != _dataset_payload(root), "frozen routing holdout differs from live focused cases")
    catalogue = live_catalogue(root)
    fail((evidence / "catalogue.txt").read_text() != catalogue, "frozen catalogue differs from live descriptions")
    fail((evidence / "classifier-instruction.txt").read_text() != CLASSIFIER_INSTRUCTION,
         "frozen classifier instruction differs")
    expected_packet = routing_packet(catalogue, dataset["cases"])
    fail((evidence / "routing-packet.txt").read_text() != expected_packet,
         "frozen routing packet is not the exact blind composition")
    plan = json.loads((evidence / "routing-plan.json").read_text())
    fail(plan != _routing_plan(root, evidence), "routing plan or input digests differ")


def _expected_workflow(case: dict[str, Any]) -> dict[str, Any] | None:
    artifact = case["portable_artifact_kind"]
    if artifact is None:
        return None
    return {
        "artifact_kind": artifact,
        "artifact_basis": "project-artifacts",
        "adapters_used": [],
        "status": "completed",
    }


def _parse_output(path: Path, cases: list[dict[str, Any]], known_skills: set[str]) -> dict[str, Any]:
    try:
        output = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise Invalid(f"provider output is invalid JSON: {exc}") from exc
    fail(not isinstance(output, dict) or set(output) != {"schema_version", "selections"},
         "provider output keys are invalid")
    fail(output["schema_version"] != SCHEMA_VERSION or not isinstance(output["selections"], list),
         "provider output schema is invalid")
    by_id = {case["id"]: case for case in cases}
    fail(len(output["selections"]) != len(cases), "provider output does not cover every case")
    seen: set[str] = set()
    for row in output["selections"]:
        required = {"case_id", "primary_skill", "companion_skills", "portable_workflow"}
        fail(not isinstance(row, dict) or set(row) != required, "provider selection keys are invalid")
        case_id = row["case_id"]
        fail(case_id not in by_id or case_id in seen, "provider selection identity is unknown or duplicate")
        seen.add(case_id)
        fail(row["primary_skill"] not in known_skills, "provider selected an unknown primary skill")
        companions = row["companion_skills"]
        fail(not isinstance(companions, list) or len(companions) != len(set(companions)),
             "provider companion skills must be a unique list")
        fail(any(value not in known_skills for value in companions), "provider selected an unknown companion skill")
        expected_workflow = _expected_workflow(by_id[case_id])
        fail(row["portable_workflow"] != expected_workflow,
             f"provider portability workflow is invalid for {case_id}")
    return output


def _action_evidence(
    path: Path,
    invocation: dict[str, Any],
    expected_prompt_sha256: str,
) -> dict[str, Any]:
    try:
        action = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise Invalid(f"Fabric action evidence is invalid: {exc}") from exc
    required = {
        "schema_version", "route", "run_id", "task_id", "action_id",
        "adapter_id", "model_family", "model", "status", "result_digest",
        "provider_answer_sha256", "base_revision", "prompt_sha256",
    }
    fail(not isinstance(action, dict) or set(action) != required, "Fabric action evidence keys are invalid")
    family = invocation["family"]
    fail(action["schema_version"] != SCHEMA_VERSION or action["route"] != ROUTE,
         "action evidence is not from the generated MCP Fabric route")
    fail(action["adapter_id"] != FAMILIES.get(family), "action evidence does not use a real Agent Fabric adapter")
    fail(action["model_family"] != family, "action evidence family is inconsistent")
    fail(action["prompt_sha256"] != expected_prompt_sha256,
         "action evidence is not bound to the frozen provider prompt")
    for field in ("task_id", "action_id", "adapter_id", "model"):
        fail(action[field] != invocation[field], f"action evidence {field} is inconsistent")
    fail(action["status"] != "terminal" or not DIGEST.fullmatch(str(action["result_digest"])),
         "action evidence is not a terminal answer-bearing result")
    fail(not isinstance(action["run_id"], str) or not action["run_id"], "action run identity is missing")
    fail(not isinstance(action["base_revision"], str) or not action["base_revision"], "action base revision is missing")
    return action


def validate_routing_result(
    result: Any,
    root: Path,
    evidence: Path,
    *,
    evidence_root: Path | None = None,
) -> None:
    validate_frozen_routing_inputs(root, evidence)
    required = {
        "schema_version", "evaluation_id", "harness_revision", "dataset_sha256",
        "catalogue_sha256", "classifier_sha256", "packet_sha256", "invocations",
        "metrics", "status",
    }
    fail(not isinstance(result, dict) or set(result) != required, "routing result keys are invalid")
    plan = json.loads((evidence / "routing-plan.json").read_text())
    fail(result["schema_version"] != SCHEMA_VERSION or result["evaluation_id"] != EVALUATION_ID,
         "routing result identity is invalid")
    fail(result["dataset_sha256"] != plan["dataset"]["sha256"], "routing result dataset digest differs")
    fail(result["catalogue_sha256"] != plan["catalogue"]["sha256"], "routing result catalogue digest differs")
    fail(result["classifier_sha256"] != plan["classifier"]["sha256"], "routing result classifier digest differs")
    fail(result["packet_sha256"] != plan["classifier"]["packet_sha256"], "routing result packet digest differs")
    fail(not isinstance(result["harness_revision"], str) or not result["harness_revision"],
         "routing result harness revision is missing")
    invocations = result["invocations"]
    fail(not isinstance(invocations, list) or len(invocations) != len(FAMILIES),
         "routing result requires all real Agent Fabric families")
    cases = live_cases(root)
    known_skills = {path.parent.name for path in (root / "skills").glob("*/SKILL.md")}
    seen_families: set[str] = set()
    primary = companions = rows = critical_failures = 0
    for index, invocation in enumerate(invocations):
        fields = {
            "invocation_id", "family", "adapter_id", "model", "task_id", "action_id",
            "action_evidence_artifact", "action_evidence_sha256", "output_artifact", "output_sha256",
        }
        fail(not isinstance(invocation, dict) or set(invocation) != fields,
             f"routing invocation {index} keys are invalid")
        family = invocation["family"]
        fail(family not in FAMILIES or family in seen_families, "routing family is unknown or duplicate")
        seen_families.add(family)
        fail(invocation["adapter_id"] != FAMILIES[family], "routing invocation is not a real Agent Fabric adapter")
        base = evidence_root if evidence_root is not None else evidence
        action_relative = Path(invocation["action_evidence_artifact"])
        output_relative = Path(invocation["output_artifact"])
        fail(action_relative.is_absolute() or ".." in action_relative.parts,
             "routing action evidence path escapes evidence root")
        fail(output_relative.is_absolute() or ".." in output_relative.parts,
             "routing output evidence path escapes evidence root")
        action_path = base / action_relative
        output_path = base / output_relative
        for path, digest, label in (
            (action_path, invocation["action_evidence_sha256"], "action"),
            (output_path, invocation["output_sha256"], "output"),
        ):
            fail(not path.is_file() or sha256_file(path) != digest, f"routing {label} evidence is missing or changed")
        action = _action_evidence(
            action_path,
            invocation,
            plan["classifier"]["provider_prompt_sha256"],
        )
        fail(action["provider_answer_sha256"] != sha256_file(output_path),
             "routing output is not the exact Fabric provider answer")
        output = _parse_output(output_path, cases, known_skills)
        by_id = {row["case_id"]: row for row in output["selections"]}
        for case in cases:
            row = by_id[case["id"]]
            expected = case["expected"]
            primary += int(row["primary_skill"] == expected["primary_skill"])
            companions += int(
                sorted(row["companion_skills"]) == sorted(expected["companion_skills"])
            )
            rows += 1
            if case["relation"] == "portability":
                critical_failures += int(row["portable_workflow"] != _expected_workflow(case))
    fail(seen_families != set(FAMILIES), "routing result family coverage is incomplete")
    metrics = {
        "case_rows": rows,
        "primary_correct": primary,
        "primary_accuracy": primary / rows if rows else 0,
        "companion_correct": companions,
        "companion_fidelity": companions / rows if rows else 0,
        "critical_portability_failures": critical_failures,
    }
    fail(result["metrics"] != metrics, "routing metrics do not match raw retained outputs")
    passed = (
        metrics["primary_accuracy"] >= plan["thresholds"]["primary_accuracy"]
        and metrics["companion_fidelity"] >= plan["thresholds"]["companion_fidelity"]
        and critical_failures == plan["thresholds"]["critical_portability_failures"]
    )
    fail(result["status"] != ("pass" if passed else "fail"), "routing status does not match metrics")
    fail(not passed, "Spec 05 retained semantic routing evaluation did not pass")


def _expected_output(root: Path) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "selections": [{
            "case_id": case["id"],
            "primary_skill": case["expected"]["primary_skill"],
            "companion_skills": sorted(case["expected"]["companion_skills"]),
            "portable_workflow": _expected_workflow(case),
        } for case in live_cases(root)],
    }


def make_contract_test_result(root: Path, evidence: Path, output_root: Path) -> dict[str, Any]:
    output_root.mkdir(parents=True, exist_ok=True)
    plan = json.loads((evidence / "routing-plan.json").read_text())
    invocations = []
    for family, adapter in sorted(FAMILIES.items()):
        model = f"contract-{family}"
        task_id = f"contract-task-{family}"
        action_id = f"contract-action-{family}"
        action_path = output_root / f"{family}-action.json"
        output_path = output_root / f"{family}-output.json"
        provider_answer = json.dumps(_expected_output(root), sort_keys=True)
        output_path.write_text(provider_answer)
        action_path.write_text(json.dumps({
            "schema_version": SCHEMA_VERSION,
            "route": ROUTE,
            "run_id": "contract-test-run",
            "task_id": task_id,
            "action_id": action_id,
            "adapter_id": adapter,
            "model_family": family,
            "model": model,
            "status": "terminal",
            "result_digest": sha256_bytes(family.encode()),
            "provider_answer_sha256": sha256_bytes(provider_answer.encode()),
            "base_revision": "contract-test-revision",
            "prompt_sha256": plan["classifier"]["provider_prompt_sha256"],
        }, sort_keys=True) + "\n")
        invocations.append({
            "invocation_id": f"contract-{family}",
            "family": family,
            "adapter_id": adapter,
            "model": model,
            "task_id": task_id,
            "action_id": action_id,
            "action_evidence_artifact": action_path.name,
            "action_evidence_sha256": sha256_file(action_path),
            "output_artifact": output_path.name,
            "output_sha256": sha256_file(output_path),
        })
    rows = len(live_cases(root)) * len(FAMILIES)
    return {
        "schema_version": SCHEMA_VERSION,
        "evaluation_id": EVALUATION_ID,
        "harness_revision": "contract-test-revision",
        "dataset_sha256": plan["dataset"]["sha256"],
        "catalogue_sha256": plan["catalogue"]["sha256"],
        "classifier_sha256": plan["classifier"]["sha256"],
        "packet_sha256": plan["classifier"]["packet_sha256"],
        "invocations": invocations,
        "metrics": {
            "case_rows": rows,
            "primary_correct": rows,
            "primary_accuracy": 1.0,
            "companion_correct": rows,
            "companion_fidelity": 1.0,
            "critical_portability_failures": 0,
        },
        "status": "pass",
    }


def import_fabric_bundle(root: Path, evidence: Path, bundle_path: Path) -> Path:
    bundle = json.loads(bundle_path.read_text())
    fail(not isinstance(bundle, dict) or set(bundle) != {
        "schemaVersion", "evaluationId", "route", "head", "results",
    }, "Fabric routing bundle keys are invalid")
    fail(bundle["schemaVersion"] != SCHEMA_VERSION or bundle["evaluationId"] != EVALUATION_ID,
         "Fabric routing bundle identity is invalid")
    fail(bundle["route"] != ROUTE or not isinstance(bundle["head"], str) or not bundle["head"],
         "Fabric routing bundle route or revision is invalid")
    results = bundle["results"]
    fail(not isinstance(results, list) or len(results) != len(FAMILIES),
         "Fabric routing bundle family coverage is incomplete")
    by_family = {row.get("family"): row for row in results if isinstance(row, dict)}
    fail(set(by_family) != set(FAMILIES), "Fabric routing bundle families are unknown or duplicate")
    raw = evidence / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    cases = live_cases(root)
    known_skills = {path.parent.name for path in (root / "skills").glob("*/SKILL.md")}
    primary = companions = rows = critical_failures = 0
    invocations = []
    for family in sorted(FAMILIES):
        row = by_family[family]
        required = {
            "family", "adapterId", "model", "runId", "taskId", "actionId",
            "status", "resultDigest", "baseRevision", "promptSha256", "answer",
        }
        fail(set(row) != required, f"Fabric routing bundle {family} result keys are invalid")
        fail(row["adapterId"] != FAMILIES[family], f"Fabric routing bundle {family} adapter differs")
        fail(row["status"] != "terminal" or not DIGEST.fullmatch(str(row["resultDigest"])),
             f"Fabric routing bundle {family} is not terminal")
        fail(row["baseRevision"] != bundle["head"], f"Fabric routing bundle {family} revision differs")
        fail(row["promptSha256"] != json.loads((evidence / "routing-plan.json").read_text())["classifier"]["provider_prompt_sha256"],
             f"Fabric routing bundle {family} prompt digest differs")
        for field in ("model", "runId", "taskId", "actionId", "answer"):
            fail(not isinstance(row[field], str) or not row[field],
                 f"Fabric routing bundle {family} {field} is missing")
        action_path = raw / f"{family}-action.json"
        output_path = raw / f"{family}-output.json"
        provider_answer = row["answer"]
        output_path.write_text(provider_answer)
        action_path.write_text(json.dumps({
            "schema_version": SCHEMA_VERSION,
            "route": ROUTE,
            "run_id": row["runId"],
            "task_id": row["taskId"],
            "action_id": row["actionId"],
            "adapter_id": row["adapterId"],
            "model_family": family,
            "model": row["model"],
            "status": row["status"],
            "result_digest": row["resultDigest"],
            "provider_answer_sha256": sha256_bytes(provider_answer.encode()),
            "base_revision": row["baseRevision"],
            "prompt_sha256": row["promptSha256"],
        }, indent=2, sort_keys=True) + "\n")
        try:
            json.loads(provider_answer)
        except json.JSONDecodeError as exc:
            raise Invalid(f"Fabric routing bundle {family} answer is not exact JSON: {exc}") from exc
        parsed = _parse_output(output_path, cases, known_skills)
        selected = {selection["case_id"]: selection for selection in parsed["selections"]}
        for case in cases:
            selection = selected[case["id"]]
            primary += int(selection["primary_skill"] == case["expected"]["primary_skill"])
            companions += int(
                sorted(selection["companion_skills"])
                == sorted(case["expected"]["companion_skills"])
            )
            rows += 1
            if case["relation"] == "portability":
                critical_failures += int(selection["portable_workflow"] != _expected_workflow(case))
        invocations.append({
            "invocation_id": f"fabric-{family}-01",
            "family": family,
            "adapter_id": row["adapterId"],
            "model": row["model"],
            "task_id": row["taskId"],
            "action_id": row["actionId"],
            "action_evidence_artifact": str(action_path.relative_to(evidence)),
            "action_evidence_sha256": sha256_file(action_path),
            "output_artifact": str(output_path.relative_to(evidence)),
            "output_sha256": sha256_file(output_path),
        })
    plan = json.loads((evidence / "routing-plan.json").read_text())
    metrics = {
        "case_rows": rows,
        "primary_correct": primary,
        "primary_accuracy": primary / rows if rows else 0,
        "companion_correct": companions,
        "companion_fidelity": companions / rows if rows else 0,
        "critical_portability_failures": critical_failures,
    }
    passed = (
        metrics["primary_accuracy"] >= plan["thresholds"]["primary_accuracy"]
        and metrics["companion_fidelity"] >= plan["thresholds"]["companion_fidelity"]
        and metrics["critical_portability_failures"] == plan["thresholds"]["critical_portability_failures"]
    )
    result = {
        "schema_version": SCHEMA_VERSION,
        "evaluation_id": EVALUATION_ID,
        "harness_revision": bundle["head"],
        "dataset_sha256": plan["dataset"]["sha256"],
        "catalogue_sha256": plan["catalogue"]["sha256"],
        "classifier_sha256": plan["classifier"]["sha256"],
        "packet_sha256": plan["classifier"]["packet_sha256"],
        "invocations": invocations,
        "metrics": metrics,
        "status": "pass" if passed else "fail",
    }
    result_path = evidence / "routing-result.json"
    result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    validate_routing_result(result, root, evidence)
    return result_path


def run_portability_probe(
    root: Path,
    probe_root: Path,
    *,
    workflow_runner: Path | None = None,
) -> dict[str, Any]:
    empty_bin = probe_root / "empty-bin"
    artifacts = probe_root / "project-artifacts"
    empty_bin.mkdir(parents=True, exist_ok=True)
    artifacts.mkdir(parents=True, exist_ok=True)
    absent = {command: shutil.which(command, path=str(empty_bin)) is None
              for command in ("agent-fabric-console", "gh", "herdr")}
    context = {
        "project": "spec05-portability-probe",
        "source": "canonical-project-artifacts",
        "authority": "local-evaluation-only",
        "accepted_artifact_digest": sha256_bytes(b"accepted-artifact"),
    }
    context_path = artifacts / "project-context.json"
    context_path.write_text(json.dumps(context, sort_keys=True) + "\n")
    runner = workflow_runner or root / "skills" / "_shared" / "portable_workflow.py"
    cases = []
    for skill in AFFECTED:
        fixture = yaml.safe_load(
            (root / "skills" / skill / "evals" / "spec05_cases.yaml").read_text()
        )
        portable = next(case for case in fixture["cases"] if case["relation"] == "portability")
        output_path = artifacts / f"{skill}-{ARTIFACT_KINDS[skill]}.json"
        subprocess.run(
            [
                sys.executable,
                str(runner),
                "--skill-root", str(root / "skills" / skill),
                "--context", str(context_path),
                "--output", str(output_path),
            ],
            check=True,
            cwd=artifacts,
            env={"PATH": str(empty_bin), "PYTHONUTF8": "1"},
            capture_output=True,
            text=True,
        )
        observed = json.loads(output_path.read_text())
        fail(not isinstance(observed, dict) or set(observed) != {
            "schema_version", "skill", "artifact_kind", "artifact_basis",
            "source_digest", "adapters_used", "status",
        }, f"portable workflow output is invalid for {skill}")
        fail(observed["schema_version"] != SCHEMA_VERSION or observed["skill"] != skill,
             f"portable workflow identity differs for {skill}")
        fail(observed["artifact_kind"] != ARTIFACT_KINDS[skill],
             f"portable workflow artifact kind differs for {skill}")
        fail(observed["source_digest"] != sha256_file(context_path),
             f"portable workflow source digest differs for {skill}")
        cases.append({
            "case_id": portable["id"],
            "skill": skill,
            "artifact_kind": ARTIFACT_KINDS[skill],
            "input_sha256": sha256_file(context_path),
            "output_sha256": sha256_file(output_path),
            "artifact_only": observed["artifact_basis"] == "project-artifacts",
            "adapters_used": observed["adapters_used"],
            "status": "pass" if absent == {"agent-fabric-console": True, "gh": True, "herdr": True}
            and observed["status"] == "completed" else "fail",
        })
    return {
        "schema_version": SCHEMA_VERSION,
        "evaluation_id": f"{EVALUATION_ID}-portability",
        "environment": {
            "mode": "isolated-empty-path",
            "absent_commands": absent,
        },
        "cases": cases,
        "status": "pass" if all(case["status"] == "pass" for case in cases) else "fail",
    }


def validate_portability_result(result: Any, root: Path, evidence: Path) -> None:
    required = {"schema_version", "evaluation_id", "environment", "cases", "status"}
    fail(not isinstance(result, dict) or set(result) != required, "portability result keys are invalid")
    fail(result["schema_version"] != SCHEMA_VERSION or result["evaluation_id"] != f"{EVALUATION_ID}-portability",
         "portability result identity is invalid")
    environment = result["environment"]
    fail(environment != {
        "mode": "isolated-empty-path",
        "absent_commands": {"agent-fabric-console": True, "gh": True, "herdr": True},
    }, "portability probe did not remove every optional adapter")
    fail(not isinstance(result["cases"], list) or len(result["cases"]) != len(AFFECTED),
         "portability result case coverage is incomplete")
    fail({case.get("skill") for case in result["cases"]} != set(AFFECTED),
         "portability result skill coverage differs")
    for case in result["cases"]:
        skill = case["skill"]
        fail(case.get("artifact_kind") != ARTIFACT_KINDS[skill], "portable artifact kind differs")
        fail(case.get("artifact_only") is not True or case.get("adapters_used") != [],
             "portable workflow used an optional adapter")
        fail(case.get("status") != "pass", f"portable workflow failed for {skill}")
        for field in ("input_sha256", "output_sha256"):
            fail(not DIGEST.fullmatch(str(case.get(field))), f"portable {field} is invalid")
    fail(result["status"] != "pass", "Spec 05 adapter-absent portability probe failed")
    plan = json.loads((evidence / "portability-plan.json").read_text())
    fail(plan != {
        "schema_version": SCHEMA_VERSION,
        "evaluation_id": f"{EVALUATION_ID}-portability",
        "affected_skills": list(AFFECTED),
        "absent_commands": ["agent-fabric-console", "gh", "herdr"],
        "artifact_kinds": ARTIFACT_KINDS,
    }, "portability plan differs from the executable contract")


def freeze(root: Path, evidence: Path) -> None:
    evidence.mkdir(parents=True, exist_ok=True)
    dataset = _dataset_payload(root)
    catalogue = live_catalogue(root)
    (evidence / "routing-holdout.yaml").write_text(yaml.safe_dump(dataset, sort_keys=False))
    (evidence / "catalogue.txt").write_text(catalogue)
    (evidence / "classifier-instruction.txt").write_text(CLASSIFIER_INSTRUCTION)
    (evidence / "routing-packet.txt").write_text(routing_packet(catalogue, dataset["cases"]))
    (evidence / "routing-plan.json").write_text(json.dumps(_routing_plan(root, evidence), indent=2, sort_keys=True) + "\n")
    portability_plan = {
        "schema_version": SCHEMA_VERSION,
        "evaluation_id": f"{EVALUATION_ID}-portability",
        "affected_skills": list(AFFECTED),
        "absent_commands": ["agent-fabric-console", "gh", "herdr"],
        "artifact_kinds": ARTIFACT_KINDS,
    }
    (evidence / "portability-plan.json").write_text(json.dumps(portability_plan, indent=2, sort_keys=True) + "\n")
    probe_root = evidence / ".probe-tmp"
    result = run_portability_probe(root, probe_root)
    (evidence / "portability-result.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    shutil.rmtree(probe_root)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=(
        "freeze", "import-bundle", "validate-inputs", "validate-routing", "probe",
    ))
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument("--evidence", type=Path)
    parser.add_argument("--result", type=Path)
    parser.add_argument("--bundle", type=Path)
    args = parser.parse_args(argv)
    root = args.root.resolve()
    evidence = (args.evidence or root / "docs" / "evals" / "spec05-skill-routing-2026").resolve()
    try:
        if args.command == "freeze":
            freeze(root, evidence)
        elif args.command == "import-bundle":
            fail(args.bundle is None, "--bundle is required")
            import_fabric_bundle(root, evidence, args.bundle)
        elif args.command == "validate-inputs":
            validate_frozen_routing_inputs(root, evidence)
        elif args.command == "validate-routing":
            fail(args.result is None, "--result is required")
            validate_routing_result(json.loads(args.result.read_text()), root, evidence)
        else:
            probe_root = evidence / ".probe-check"
            observed = run_portability_probe(root, probe_root)
            shutil.rmtree(probe_root)
            retained = json.loads((evidence / "portability-result.json").read_text())
            fail(observed != retained, "retained portability result differs from executable probe")
            validate_portability_result(retained, root, evidence)
    except (OSError, json.JSONDecodeError, Invalid, yaml.YAMLError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"PASS: {args.command}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
