from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Callable

import pytest

import scripts.check_spec_families as spec_family_gate
from scripts.check_spec_families import (
    FROZEN_SOURCES,
    SpecFamilyError,
    _canonical_json,
    _scan_markdown_stream,
    _validate_links,
    load_family_archive_bytes,
    load_family_bytes,
    module_set_digest,
    render_index,
    transformation_receipt_digest,
    validate_repository,
)


ROOT = Path(__file__).resolve().parents[1]
FAMILY = "01-agent-fabric"
SYSTEMIC_PATTERN_REMOVAL_CASES = (
    ("forward-migration", "forward-migration-version"),
    ("migration-actor", "migration-normalises"),
    ("schema-upgrade-actor", "schema-upgrade-populates"),
    ("backfill-actor", "backfill-populates"),
    ("migration-preflight", "preflight-forward-repair"),
    ("additive-persistence", "additive-persistence"),
    ("schema-version-chronology", "schema-version-chronology-only"),
    ("forward-repair", "forward-repair-only"),
    ("existing-shape-gains", "existing-row-gains"),
    ("named-relations-gain", "named-relations-gain"),
    ("table-replacement", "table-replacement-only"),
    ("future-amendment", "future-amendment"),
    ("persistence-migration", "persistence-migration-only"),
)


def sha256(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


@pytest.fixture
def repository(tmp_path: Path) -> Path:
    shutil.copytree(ROOT / "docs", tmp_path / "docs", symlinks=True)
    fixture_dir = tmp_path / "tests/spec_fixtures"
    fixture_dir.mkdir(parents=True)
    for name in (
        "f023_obligation_matrix.json",
        "f023_closure_receipt.json",
        "f023_rule5_crosswalk.json",
        "f023_systemic_mandate_cases.json",
    ):
        shutil.copy2(ROOT / "tests/spec_fixtures" / name, fixture_dir / name)
    return tmp_path


def manifest_path(root: Path, family: str = FAMILY) -> Path:
    return root / "docs" / "specs" / family / "manifest.json"


def read_manifest(root: Path, family: str = FAMILY) -> dict:
    return json.loads(manifest_path(root, family).read_text())


def write_manifest(
    root: Path,
    manifest: dict,
    family: str = FAMILY,
    *,
    recompute_commitments: bool = False,
    refresh_index: bool = False,
) -> None:
    if recompute_commitments:
        manifest["transformationReceiptSha256"] = transformation_receipt_digest(
            manifest
        )
        manifest["moduleSetSha256"] = module_set_digest(manifest)
    manifest_text = json.dumps(
        manifest,
        ensure_ascii=False,
        allow_nan=False,
        indent=2,
    )
    if manifest_text.count("\n") + 1 > 1_000:
        manifest_text = json.dumps(
            manifest,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
    data = (manifest_text + "\n").encode()
    manifest_path(root, family).write_bytes(data)
    if refresh_index:
        index = root / "docs" / "specs" / f"{family}.md"
        title = index.read_text().splitlines()[0].removeprefix("# ")
        index.write_bytes(render_index(manifest, title, sha256(data)))


def read_supersession_map(root: Path, family: str = FAMILY) -> dict:
    manifest = read_manifest(root, family)
    return json.loads((root / manifest["supersessionMapPath"]).read_text())


def write_supersession_map(root: Path, family: str, supersession: dict) -> None:
    manifest = read_manifest(root, family)
    canonical = _canonical_json(supersession)
    (root / manifest["supersessionMapPath"]).write_bytes(canonical + b"\n")
    manifest["supersessionMapSha256"] = sha256(canonical)
    write_manifest(
        root,
        manifest,
        family,
        recompute_commitments=True,
        refresh_index=True,
    )


def nonblank_slice(data: bytes) -> tuple[int, int, bytes]:
    lines = data.splitlines(keepends=True)
    populated = [position for position, line in enumerate(lines, start=1) if line.strip()]
    assert populated
    start, end = min(populated), max(populated)
    return start, end, b"".join(lines[start - 1 : end])


def rewrite_current_module(
    root: Path,
    family: str,
    module_path: str,
    transform: Callable[[bytes], bytes],
) -> None:
    old_current = load_family_bytes(root, family)
    manifest = read_manifest(root, family)
    path = root / module_path
    old_data = path.read_bytes()
    new_data = transform(old_data)
    assert old_data != new_data
    assert old_current.count(old_data) == 1
    assert new_data.endswith(b"\n") and not new_data.endswith(b"\n\n")
    path.write_bytes(new_data)

    module = next(item for item in manifest["modules"] if item["path"] == module_path)
    module["lineCount"] = new_data.count(b"\n")
    module["sha256"] = sha256(new_data)
    new_current = old_current.replace(old_data, new_data, 1)
    manifest["bindingCurrentContentSha256"] = sha256(new_current)

    supersession_path = root / manifest["supersessionMapPath"]
    supersession = json.loads(supersession_path.read_text())
    supersession["bindingCurrentContentSha256"] = sha256(new_current)
    start, end, bound = nonblank_slice(new_data)
    for entry in supersession["entries"]:
        current = entry["current"]
        if current["modulePath"] == module_path:
            current["startLine"] = start
            current["endLine"] = end
            current["sha256"] = sha256(bound)
        for authority in entry["authorityRefs"]:
            if authority["path"] == module_path:
                authority["startLine"] = start
                authority["endLine"] = end
                authority["sha256"] = sha256(bound)
    canonical = _canonical_json(supersession)
    supersession_path.write_bytes(canonical + b"\n")
    manifest["supersessionMapSha256"] = sha256(canonical)
    write_manifest(
        root,
        manifest,
        family,
        recompute_commitments=True,
        refresh_index=True,
    )


def test_live_spec_families_pass_the_repository_gate() -> None:
    result = subprocess.run(
        [sys.executable, "scripts/check_spec_families.py"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr


def test_schema_v3_loaders_expose_current_and_archive_without_candidate_api() -> None:
    results = {result.stem: result for result in validate_repository(ROOT)}
    archive_history = {
        "01-agent-fabric": "Version 0.36 is a draft amendment",
        "04-agent-fabric-operational-hardening": "Version 1.31 added",
        "05-project-fabric-console": "Version 1.13 records",
    }

    for family, marker in archive_history.items():
        current = load_family_bytes(ROOT, family)
        archive = load_family_archive_bytes(ROOT, family)
        assert current == results[family].binding_current
        assert archive == results[family].archive
        assert marker.encode() in archive
        assert marker.encode() not in current
        assert sha256(archive) == FROZEN_SOURCES[family]["sha256"]
        assert archive.count(b"\n") == FROZEN_SOURCES[family]["lineCount"]
        root_index = (ROOT / "docs" / "specs" / f"{family}.md").read_text()
        assert "## Binding current (default authority)" in root_index
        assert "## Frozen archive (traceability only)" in root_index

    requirements = results["01-agent-fabric"].current_requirement_definitions
    assert len(requirements) == 210
    assert len(set(requirements)) == 210
    assert not hasattr(results["01-agent-fabric"], "candidate")


def test_default_loader_is_net_current_while_archive_reconstructs_frozen_source() -> None:
    obsolete_markers = {
        "01-agent-fabric": (
            b"Legacy imports create both",
            b"only the v0.36 client/daemon",
        ),
        "04-agent-fabric-operational-hardening": (
            b"Compatibility decoders may explain",
            b"The next unused additive migration",
            b"Migration 0010 rebuilds",
            b"Legacy imports bind",
            b"Migration 0013 is forward-only",
        ),
        "05-project-fabric-console": (
            b"Council freeze and the consolidated PR human review remain pending",
        ),
    }
    unchanged_markers = {
        "01-agent-fabric": (
            b"Each coordination run has exactly one generation-fenced chair.",
            b"resolvedReviewProfileV1:",
            b"Every public, launch, stored and delegated authority payload",
        ),
        "04-agent-fabric-operational-hardening": (
            b"The single current baseline shall create:",
            b"provider_review_results is insert-only and has one closed discriminator:",
            b"The current Console requires that feature",
        ),
    }

    for family, frozen in FROZEN_SOURCES.items():
        archive = load_family_archive_bytes(ROOT, family)
        current = load_family_bytes(ROOT, family)
        assert sha256(archive) == frozen["sha256"]
        assert archive.count(b"\n") == frozen["lineCount"]
        for marker in obsolete_markers[family]:
            assert marker in archive
            assert marker not in current
        for marker in unchanged_markers.get(family, ()):
            assert marker in archive
            assert marker in current


def test_r5_01_restores_the_adjacent_sentence_across_current_module_boundary() -> None:
    current = load_family_bytes(ROOT, "01-agent-fabric")

    assert (
        b"ambiguous duplicate current runs are rejected without\n"
        b"mutation. A\ncancelled or failed project close is valid only from `draft`"
        in current
    )
    assert b"mutation.\nA\ncancelled or failed project close" not in current


def test_binding_current_has_exact_module_and_physical_line_totals() -> None:
    expected = {
        "01-agent-fabric": (29, 11_398),
        "04-agent-fabric-operational-hardening": (46, 11_936),
        "05-project-fabric-console": (8, 1_478),
    }

    actual = {
        family: (
            len(read_manifest(ROOT, family)["sequences"]["bindingCurrent"]),
            load_family_bytes(ROOT, family).count(b"\n"),
        )
        for family in expected
    }

    assert actual == expected
    assert sum(module_count for module_count, _ in actual.values()) == 83
    assert sum(line_count for _, line_count in actual.values()) == 24_812


def test_f023_01_preserves_recovery_custody_without_legacy_import_repair() -> None:
    family = "01-agent-fabric"
    archive = load_family_archive_bytes(ROOT, family)
    current = load_family_bytes(ROOT, family)

    assert b"Legacy imports create both" in archive
    assert b"Legacy imports create both" not in current
    assert b"Public project-session transition cannot enter `quiescing`" in current
    assert b"changes the\nsession and every affected run atomically" in current
    assert b"Work-admitting targets keep the current chair lease active" in current
    assert b"Reactivation requires a\nlive current-chair capability" in current
    assert b"A durable lost launched-chair bridge reserves every" in current


def test_f023_02_preserves_ac038_without_v036_or_migration_acceptance() -> None:
    family = "01-agent-fabric"
    archive = load_family_archive_bytes(ROOT, family)
    current = load_family_bytes(ROOT, family)

    assert b"only the v0.36 client/daemon" in archive
    assert b"only the v0.36 client/daemon" not in current
    assert b"Current-schema migration tests" in archive
    assert b"Current-schema migration tests" not in current
    assert current.count(b"**AC-038:**") == 1
    assert b"current-baseline tests exercise the exact current client/daemon" in current
    assert b"negotiated exact-extension success" in current
    assert b"fails closed before projection or\n  mutation" in current
    assert b"Current-schema persistence tests prove insert, update and delete" in current
    assert b"No notification state\n  change acknowledges, approves, focuses" in current


def test_f023_03_preserves_typed_intent_retirement_without_decoder_path() -> None:
    family = "04-agent-fabric-operational-hardening"
    archive = load_family_archive_bytes(ROOT, family)
    current = load_family_bytes(ROOT, family)

    assert b"Compatibility decoders may explain" in archive
    assert b"Compatibility decoders may explain" not in current
    assert b"The four direct lifecycle protocol operations are retired" in current
    assert b"Only `OperatorActionIntent` lifecycle variants may reach" in current
    assert b"No compatibility decoder\nmay capture a current revision or execute" in current
    assert b"Verification adds crash points before and after every loss/recovery" in current
    assert b"return retirement errors if sent manually" in current


def test_f023_04_preserves_git_custody_relations_without_migration_ordinal() -> None:
    family = "04-agent-fabric-operational-hardening"
    archive = load_family_archive_bytes(ROOT, family)
    current = load_family_bytes(ROOT, family)

    assert b"The next unused additive migration" in archive
    assert b"The next unused additive migration" not in current
    assert b"Its ordinal is assigned at serial\nintegration" in archive
    assert b"Its ordinal is assigned at serial\nintegration" not in current
    assert b"The current baseline stores immutable revisioned Git grants" in current
    assert b"operator_effect_custody" in current
    assert b"neither a second journal nor a parallel state machine" in current
    assert b"run_authority_revisions(project_session_id, coordination_run_id" in current
    assert b"The exact four-column tuple" in current
    assert b"The history has a composite foreign key to `runs`" in current


def test_f023_05_preserves_artifact_registry_shape_without_migration_0010() -> None:
    family = "04-agent-fabric-operational-hardening"
    archive = load_family_archive_bytes(ROOT, family)
    current = load_family_bytes(ROOT, family)

    assert b"Migration 0010 rebuilds `artifacts`" in archive
    assert b"Migration 0010 rebuilds `artifacts`" not in current
    assert b"The current `artifacts` table is the one evidence metadata registry" in current
    assert b"canonical prefixed SHA-256, registry\nstate, quarantine reason" in current
    assert b"Partial unique indexes enforce one" in current
    assert b"disjoint CHECK shapes and producer-owned namespaces" in current
    assert b"exact `UNIQUE(artifact_id, revision)`" in current
    assert b"exact two-column registration revision as its SQLite\nforeign-key parent" in current


def test_f023_06_preserves_supersession_custody_without_legacy_repair_or_old_peer() -> None:
    family = "04-agent-fabric-operational-hardening"
    archive = load_family_archive_bytes(ROOT, family)
    current = load_family_bytes(ROOT, family)

    for obsolete in (
        b"Legacy imports bind\nboth memberships",
        b"a forward-only migration repairs earlier task",
        b"Old-client/new-daemon\nfixtures prove",
    ):
        assert obsolete in archive
        assert obsolete not in current
    assert b"typed recovery custody commits or abandons the loss" in current
    assert b"closed system-supersession\ndisposition" in current
    assert b"closed\n`{kind, ref}` union" in current
    assert b"exact\n`gate-system-supersession.v1` result feature" in current
    assert b"typed feature unavailability and\nzero mutation before projection" in current
    assert b"membership/session revisions in one transaction" in current


def test_f023_07_preserves_singleton_and_retirement_invariants_without_backfill() -> None:
    family = "04-agent-fabric-operational-hardening"
    archive = load_family_archive_bytes(ROOT, family)
    current = load_family_bytes(ROOT, family)

    for obsolete in (
        b"Migration 0013 is forward-only",
        b"Upgrade and\nrestart fixtures cover",
        b"Existing terminal rows are backfilled only under the\nsame proof",
    ):
        assert obsolete in archive
        assert obsolete not in current
    assert b"at most one non-terminal run per project\nsession" in current
    assert b"partial unique active-chair-lease\nindex" in current
    assert b"membership is current\nonly when it agrees with source truth" in current
    assert b"fails without mutation and requires explicit recovery" in current
    assert b"no\nupgrade, backfill or automatic repair path is required" in current
    assert b"fixtures reject zero-delivery messages" in current
    assert b"expired or abandoned delivery" in current
    assert b"cancelled or degraded tasks" in current
    assert b"missing current\nchair membership" in current
    assert b"superseded predecessor leases without mutation" in current
    assert b"persist immutable bridge-retirement evidence" in current
    assert b"Startup excludes retired launched bridges" in current


def test_f023_08_preserves_console_obligations_without_ledger_or_false_acceptance() -> None:
    family = "05-project-fabric-console"
    archive = load_family_archive_bytes(ROOT, family)
    current = load_family_bytes(ROOT, family)

    assert b"Spec 05 v1.0 records the human-approved product direction" in archive
    assert b"Spec 05 v1.0 records the human-approved product direction" not in current
    assert b"Council freeze and the consolidated PR human review remain pending" in archive
    assert b"Council freeze and the consolidated PR human review remain pending" not in current
    assert b"## 16. Net-current implementation-gate candidate" in current
    assert b"Spec 05 1.14 remains a freeze candidate" in current
    assert b"does not\nitself authorise material additions beyond v1.0" in current
    assert b"candidate gate preserves:" in current
    assert b"typed revision-bound review/confirm paths for every shipped" in current
    assert b"no required action\n   is an implementation placeholder" in current
    for ordinal in range(1, 13):
        assert f"\n{ordinal}. ".encode() in current
    assert b"The Console owns neither a codec nor policy" in current
    assert b"Git push,\nrelease, deployment and other separately gated effects remain" in current


@pytest.mark.parametrize(
    "family,r5_id,f023_id,obsolete,current_invariant",
    (
        (
            "01-agent-fabric",
            "R5-01",
            "F023-09",
            b"forward migration deterministically revokes",
            b"ambiguous duplicate current runs are rejected without\nmutation",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-02",
            "F023-10",
            b"This amendment is approved by Spec 05 v1.0",
            b"Spec 01 owns the protocol entities and atomic coordination invariants",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-03",
            "F023-04",
            b"This section owns their additive persistence",
            b"This section owns their current persistence",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-04",
            "F023-11",
            b"migration normalises closed child rows",
            b"current schema stores normalised closed child rows",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-05",
            "F023-12",
            b"migration transactionally widens the canonical",
            b"canonical `operator_effect_custody.state` set includes `conflict`",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-06",
            "F023-13",
            b"Migration preflight shall reject malformed/non-canonical paths",
            b"Incompatible persisted data is preserved without mutation",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-07",
            "F023-14",
            b"before the schema\nversion advances",
            b"revision triggers are live in the current baseline",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-08",
            "F023-15",
            b"migration preflight/rollback",
            b"current-baseline integrity and atomic-install rollback",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-09",
            "F023-16",
            b"Existing receipts and intake bindings gain exact registry IDs",
            b"references an exact registry ID",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-10",
            "F023-17",
            b"`intakes` and `intake_revisions` gain an accepted-scope registry ID",
            b"`intakes` and `intake_revisions` store an accepted-scope registry ID",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-11",
            "F023-18",
            b"before table replacement",
            b"Baseline construction stages every normalised row and binding",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-12",
            "F023-19",
            b"The additive persistence change for operation enforcement shall bind",
            b"Current operation-enforcement persistence binds",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "R5-13",
            "F023-20",
            b"The existing `provider_action_routes` row gains non-null",
            b"Every current `provider_action_routes` row for an answer-bearing action stores",
        ),
        (
            "05-project-fabric-console",
            "R5-14",
            "F023-21",
            b"Specs 01 and 04 shall be amended and accepted before implementation",
            b"Specs 01 and 04 are the accepted canonical owners",
        ),
    ),
    ids=(
        "R5-01",
        "R5-02",
        "R5-03-folded-F023-04",
        "R5-04",
        "R5-05",
        "R5-06",
        "R5-07",
        "R5-08",
        "R5-09",
        "R5-10",
        "R5-11",
        "R5-12",
        "R5-13",
        "R5-14",
    ),
)
def test_rule5_fullset_has_one_current_only_equivalent(
    family: str,
    r5_id: str,
    f023_id: str,
    obsolete: bytes,
    current_invariant: bytes,
) -> None:
    archive = load_family_archive_bytes(ROOT, family)
    current = load_family_bytes(ROOT, family)

    assert obsolete in archive
    assert obsolete not in current
    assert current_invariant in current
    supersession = read_supersession_map(ROOT, family)
    owners = [entry for entry in supersession["entries"] if entry["id"] == f023_id]
    assert len(owners) == 1, r5_id
    owner = owners[0]["current"]["modulePath"]
    module = next(item for item in read_manifest(ROOT, family)["modules"] if item["path"] == owner)
    assert module["role"] == "current-only"


def test_rule5_crosswalk_is_complete_and_folds_only_r5_03() -> None:
    crosswalk = json.loads(
        (ROOT / "tests/spec_fixtures/f023_rule5_crosswalk.json").read_text()
    )

    assert crosswalk["schemaVersion"] == 1
    assert [entry["r5Id"] for entry in crosswalk["entries"]] == [
        f"R5-{ordinal:02d}" for ordinal in range(1, 15)
    ]
    assert len({entry["f023Id"] for entry in crosswalk["entries"]}) == 14
    folded = [entry for entry in crosswalk["entries"] if entry["folded"]]
    assert folded == [
        next(entry for entry in crosswalk["entries"] if entry["r5Id"] == "R5-03")
    ]
    assert folded[0]["f023Id"] == "F023-04"
    archives = {
        family: load_family_archive_bytes(ROOT, family)
        for family in FROZEN_SOURCES
    }
    for entry in crosswalk["entries"]:
        start, end = entry["frozenRange"]
        lines = archives[entry["family"]].splitlines(keepends=True)
        extracted = b"".join(lines[start - 1 : end])
        assert sha256(extracted) == entry["frozenRangeSha256"]


def test_systemic_fixture_binds_candidates_and_all_seven_exclusions() -> None:
    cases = json.loads(
        (ROOT / "tests/spec_fixtures/f023_systemic_mandate_cases.json").read_text()
    )
    crosswalk = json.loads(
        (ROOT / "tests/spec_fixtures/f023_rule5_crosswalk.json").read_text()
    )
    owners = {entry["f023Id"] for entry in crosswalk["entries"]}

    assert all(case["owner"] in owners for case in cases["positiveClauses"])
    assert {case["exclusion"] for case in cases["negativeClauses"]} == {
        "negative-prohibition",
        "fresh-baseline",
        "taxonomy",
        "current-optional",
        "nonmigration-additive-forward",
        "operational-revision",
        "governance-provenance",
    }


def test_systemic_fixture_has_unique_cases_for_previously_unpressured_arms() -> None:
    cases = json.loads(
        (ROOT / "tests/spec_fixtures/f023_systemic_mandate_cases.json").read_text()
    )["positiveClauses"]
    unique_categories = {
        "schema-version-chronology-only",
        "forward-repair-only",
        "table-replacement-only",
        "persistence-migration-only",
    }

    for case in cases:
        if case["category"] not in unique_categories:
            continue
        findings = spec_family_gate.find_unclassified_positive_mandates(case["text"])
        assert [finding.partition(":")[0] for finding in findings] == [
            case["expectedPattern"]
        ]


@pytest.mark.parametrize(
    "case",
    json.loads(
        (ROOT / "tests/spec_fixtures/f023_systemic_mandate_cases.json").read_text()
    )["positiveClauses"],
    ids=lambda case: case["category"],
)
def test_systemic_scan_classifies_novel_positive_migration_mandates(case: dict) -> None:
    detector = getattr(
        spec_family_gate,
        "find_unclassified_positive_mandates",
        lambda _text: [],
    )

    findings = detector(case["text"])

    assert any(
        finding.startswith(f"{case['expectedPattern']}:") for finding in findings
    ), (case["category"], findings)


@pytest.mark.parametrize(
    "text,expected_finding",
    (
        (
            "`route_migration_rows` gains required authority columns.",
            "named-relations-gain: route_migration_rows gains",
        ),
        (
            "`pre__migration__route` and `post__migration__route` gain required "
            "authority columns.",
            "named-relations-gain: pre__migration__route and "
            "post__migration__route gain",
        ),
    ),
)
def test_systemic_scan_preserves_actor_infix_relation_identifiers(
    text: str,
    expected_finding: str,
) -> None:
    assert expected_finding in spec_family_gate.find_unclassified_positive_mandates(
        text
    )


@pytest.mark.parametrize(
    "case",
    json.loads(
        (ROOT / "tests/spec_fixtures/f023_systemic_mandate_cases.json").read_text()
    )["negativeClauses"],
    ids=lambda case: case["category"],
)
def test_systemic_scan_preserves_negative_and_current_baseline_language(case: dict) -> None:
    detector = getattr(
        spec_family_gate,
        "find_unclassified_positive_mandates",
        lambda _text: [],
    )

    assert detector(case["text"]) == []


@pytest.mark.parametrize(
    "case",
    json.loads(
        (ROOT / "tests/spec_fixtures/f023_systemic_mandate_cases.json").read_text()
    )["positiveClauses"],
    ids=lambda case: case["category"],
)
def test_systemic_scan_rejects_novel_positive_clause_after_full_rehash(
    repository: Path,
    case: dict,
) -> None:
    rewrite_current_module(
        repository,
        "01-agent-fabric",
        "docs/specs/01-agent-fabric/31-f023-09-current.md",
        lambda data: data + b"\n" + case["text"].encode() + b"\n",
    )

    with pytest.raises(
        SpecFamilyError,
        match=(
            "unclassified positive binding-current migration mandate.*"
            f"{case['expectedPattern']}:"
        ),
    ):
        validate_repository(repository)


@pytest.mark.parametrize(
    "pattern_name,expected_category",
    SYSTEMIC_PATTERN_REMOVAL_CASES,
)
def test_systemic_pattern_removal_mutation_fails_for_classifier_reason(
    monkeypatch: pytest.MonkeyPatch,
    pattern_name: str,
    expected_category: str,
) -> None:
    monkeypatch.setattr(
        spec_family_gate,
        "POSITIVE_MIGRATION_MANDATE_PATTERNS",
        tuple(
            item
            for item in spec_family_gate.POSITIVE_MIGRATION_MANDATE_PATTERNS
            if item[0] != pattern_name
        ),
    )

    with pytest.raises(
        SpecFamilyError,
        match=f"systemic-mandate classifier polarity drift: {expected_category}",
    ):
        validate_repository(ROOT)


def test_systemic_pattern_removal_matrix_covers_every_declared_arm() -> None:
    declared = tuple(
        pattern_name
        for pattern_name, _pattern in spec_family_gate.POSITIVE_MIGRATION_MANDATE_PATTERNS
    )
    pressured = tuple(
        pattern_name for pattern_name, _category in SYSTEMIC_PATTERN_REMOVAL_CASES
    )

    assert declared == pressured


@pytest.mark.parametrize(
    "excluded_marker,expected_category",
    (
        (r"\*\*", "migration-strong-asterisk-normalises"),
        (r"\*", "migration-emphasis-asterisk-normalises"),
        (r"_", "migration-emphasis-underscore-normalises"),
        (r"__", "migration-strong-underscore-normalises"),
    ),
)
def test_systemic_emphasis_normalisation_mutation_fails_for_classifier_reason(
    monkeypatch: pytest.MonkeyPatch,
    excluded_marker: str,
    expected_category: str,
) -> None:
    all_markers = (r"\*\*", r"__", r"\*", r"_")
    surviving_markers = "|".join(
        marker for marker in all_markers if marker != excluded_marker
    )
    monkeypatch.setattr(
        spec_family_gate,
        "MANDATE_EMPHASIS_RE",
        re.compile(
            rf"(?P<mark>{surviving_markers})(?P<actor>migration)(?P=mark)",
            re.IGNORECASE,
        ),
    )

    with pytest.raises(
        SpecFamilyError,
        match=f"systemic-mandate classifier polarity drift: {expected_category}",
    ):
        validate_repository(ROOT)


def test_systemic_identifier_guard_removal_mutation_fails_for_classifier_reason(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        spec_family_gate,
        "MANDATE_EMPHASIS_RE",
        re.compile(
            rf"(?P<mark>\*\*|__|\*|_)"
            rf"(?P<actor>{spec_family_gate.MANDATE_ACTOR_FRAGMENT})(?P=mark)",
            re.IGNORECASE,
        ),
    )

    with pytest.raises(
        SpecFamilyError,
        match=(
            "systemic-mandate classifier polarity drift: "
            "named-relation-migration-infix"
        ),
    ):
        validate_repository(ROOT)


def test_systemic_independent_and_arm_mutation_fails_for_classifier_reason(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        spec_family_gate,
        "INDEPENDENT_POSITIVE_AND_ARM_RE",
        re.compile(r"(?!x)x"),
    )

    with pytest.raises(
        SpecFamilyError,
        match=(
            "systemic-mandate classifier polarity drift: "
            "negative-and-positive-independent-subjects"
        ),
    ):
        validate_repository(ROOT)


def test_systemic_blanket_polarity_mutation_fails_for_classifier_reason(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def blanket_negation(clause: str, _match: object) -> bool:
        lower = clause.lower()
        return any(
            marker in lower
            for marker in (" no ", " not ", " never ", " without ", " rejects")
        )

    monkeypatch.setattr(
        spec_family_gate,
        "_mandate_match_is_negated",
        blanket_negation,
    )

    with pytest.raises(
        SpecFamilyError,
        match=(
            "systemic-mandate classifier polarity drift: "
            "positive-and-negative-independent-subjects"
        ),
    ):
        validate_repository(ROOT)


def test_systemic_empty_detector_mutation_fails_for_classifier_reason(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        spec_family_gate,
        "find_unclassified_positive_mandates",
        lambda _text: [],
    )

    with pytest.raises(
        SpecFamilyError,
        match="systemic-mandate classifier polarity drift: forward-migration-version",
    ):
        validate_repository(ROOT)


def test_mixed_clause_obligation_matrix_has_one_current_only_owner_per_obligation() -> None:
    matrix_path = ROOT / "tests/spec_fixtures/f023_obligation_matrix.json"
    matrix = json.loads(matrix_path.read_text())
    assert set(matrix) == {"schemaVersion", "entries"}
    assert matrix["schemaVersion"] == 1
    assert [entry["id"] for entry in matrix["entries"]] == [
        "F023-09",
        "F023-02",
        "F023-10",
        "F023-04",
        "F023-11",
        "F023-12",
        "F023-13",
        "F023-14",
        "F023-15",
        "F023-16",
        "F023-17",
        "F023-18",
        "F023-19",
        "F023-06",
        "F023-07",
        "F023-20",
        "F023-21",
        "F023-08",
    ]
    lockstep = {entry["id"]: entry["lockstepWith"] for entry in matrix["entries"]}
    assert lockstep["F023-13"] == ["F023-15"]
    assert lockstep["F023-15"] == ["F023-13"]
    assert all(
        not owners
        for entry_id, owners in lockstep.items()
        if entry_id not in {"F023-13", "F023-15"}
    )

    all_keys: set[str] = set()
    results = {result.stem: result for result in validate_repository(ROOT)}
    for entry in matrix["entries"]:
        family = entry["family"]
        result = results[family]
        manifest = result.manifest
        supersession = json.loads((ROOT / manifest["supersessionMapPath"]).read_text())
        map_entry = next(item for item in supersession["entries"] if item["id"] == entry["id"])
        assert entry["frozenRange"] == [
            map_entry["frozen"]["startLine"],
            map_entry["frozen"]["endLine"],
        ]
        assert entry["ownerModulePath"] == map_entry["current"]["modulePath"]
        owner = next(
            module
            for module in manifest["modules"]
            if module["path"] == entry["ownerModulePath"]
        )
        assert owner["role"] == "current-only"
        owner_text = (ROOT / entry["ownerModulePath"]).read_text()
        for obligation in entry["obligations"]:
            qualified_key = f"{entry['id']}:{obligation['key']}"
            assert qualified_key not in all_keys
            all_keys.add(qualified_key)
            assert owner_text.count(obligation["marker"]) == 1
            assert result.binding_current.decode().count(obligation["marker"]) == 1


def _rule5_owner_mutation_cases() -> tuple[tuple[str, str, str, str], ...]:
    matrix = json.loads(
        (ROOT / "tests/spec_fixtures/f023_obligation_matrix.json").read_text()
    )
    critical_keys = {
        "F023-13": "zero-inference",
        "F023-15": "four-owner-combinations",
        "F023-18": "all-or-nothing-publication",
        "F023-20": "nullable-identity-split",
        "F023-21": "product-invariant-split",
    }
    cases = []
    for entry in matrix["entries"]:
        key = critical_keys.get(entry["id"], entry["obligations"][0]["key"])
        obligation = next(item for item in entry["obligations"] if item["key"] == key)
        cases.append(
            (
                entry["family"],
                entry["ownerModulePath"],
                entry["id"],
                obligation["marker"],
            )
        )
    return tuple(cases)


@pytest.mark.parametrize(
    "family,module_path,entry_id,marker",
    _rule5_owner_mutation_cases(),
    ids=lambda value: value if isinstance(value, str) and value.startswith("F023-") else None,
)
def test_each_rule5_obligation_owner_rejects_semantic_removal_after_full_rehash(
    repository: Path,
    family: str,
    module_path: str,
    entry_id: str,
    marker: str,
) -> None:
    rewrite_current_module(
        repository,
        family,
        module_path,
        lambda data: data.replace(marker.encode(), b"removed semantic obligation", 1),
    )

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


def test_r4_binding_current_rejects_concrete_residual_mandates() -> None:
    forbidden = {
        "01-agent-fabric": (
            b"Legacy imports create both",
            b"forward migration deterministically revokes",
            b"only the v0.36 client/daemon",
        ),
        "04-agent-fabric-operational-hardening": (
            b"This amendment is approved by Spec 05 v1.0",
            b"Compatibility decoders may explain",
            b"This section owns their additive persistence",
            b"The next unused additive migration",
            b"migration normalises closed child rows",
            b"migration transactionally widens the canonical",
            b"Migration preflight shall reject malformed/non-canonical paths",
            b"before the schema\nversion advances",
            b"Recovery is forward repair",
            b"migration preflight/rollback",
            b"Migration 0010 rebuilds `artifacts`",
            b"Existing receipts and intake bindings gain exact registry IDs",
            b"`intakes` and `intake_revisions` gain an accepted-scope registry ID",
            b"before table replacement",
            b"The additive persistence change for operation enforcement shall bind",
            b"Legacy imports bind\nboth memberships",
            b"Migration 0013 is forward-only",
            b"The existing `provider_action_routes` row gains non-null",
        ),
        "05-project-fabric-console": (
            b"Specs 01 and 04 shall be amended and accepted before implementation",
            b"Spec 05 v1.0 records the human-approved product direction",
        ),
    }
    for family, markers in forbidden.items():
        current = load_family_bytes(ROOT, family)
        for marker in markers:
            assert marker not in current


@pytest.mark.parametrize(
    "mutation_kind",
    ("archive-byte", "source-range", "archive-order", "frozen-hash"),
)
def test_r4_archive_byte_source_range_order_and_frozen_hash_tamper(
    repository: Path, mutation_kind: str
) -> None:
    manifest = read_manifest(repository)
    if mutation_kind == "archive-byte":
        archive_only = next(
            module for module in manifest["modules"] if module["role"] == "archive-only"
        )
        path = repository / archive_only["path"]
        data = path.read_bytes()
        path.write_bytes(bytes((data[0] ^ 1,)) + data[1:])
    elif mutation_kind == "source-range":
        manifest["transformation"]["sourceRanges"][0]["sourceEndLine"] -= 1
        write_manifest(
            repository,
            manifest,
            recompute_commitments=True,
            refresh_index=True,
        )
    elif mutation_kind == "archive-order":
        archive = manifest["sequences"]["archive"]
        archive[0], archive[1] = archive[1], archive[0]
        write_manifest(
            repository,
            manifest,
            recompute_commitments=True,
            refresh_index=True,
        )
    else:
        manifest["transformation"]["frozenSourceSha256"] = "sha256:" + "0" * 64
        write_manifest(
            repository,
            manifest,
            recompute_commitments=True,
            refresh_index=True,
        )

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


@pytest.mark.parametrize(
    "mutation_kind",
    ("delete-shared", "reorder-shared", "bulk-remove-cumulative-slices"),
)
def test_r4_shared_current_deletion_reorder_and_cumulative_slice_removal(
    repository: Path, mutation_kind: str
) -> None:
    manifest = read_manifest(repository)
    binding = manifest["sequences"]["bindingCurrent"]
    shared = [
        ordinal
        for ordinal in binding
        if manifest["modules"][ordinal]["role"] == "shared-current"
    ]
    if mutation_kind == "delete-shared":
        binding.remove(shared[1])
    elif mutation_kind == "reorder-shared":
        left, right = binding.index(shared[1]), binding.index(shared[2])
        binding[left], binding[right] = binding[right], binding[left]
    else:
        markers = (
            b"Each coordination run has exactly one generation-fenced chair.",
            b"resolvedReviewProfileV1:",
            b"Every public, launch, stored and delegated authority payload",
        )
        for marker in markers:
            ordinal = next(
                module["ordinal"]
                for module in manifest["modules"]
                if marker in (repository / module["path"]).read_bytes()
                and module["ordinal"] in binding
            )
            binding.remove(ordinal)
    write_manifest(
        repository,
        manifest,
        recompute_commitments=True,
        refresh_index=True,
    )

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


@pytest.mark.parametrize(
    "mutation_kind",
    ("source-digest", "current-digest", "authority-digest", "decision-row"),
)
def test_r4_map_source_current_authority_and_decision_binding_tamper(
    repository: Path, mutation_kind: str
) -> None:
    family = "05-project-fabric-console" if mutation_kind == "decision-row" else FAMILY
    supersession = read_supersession_map(repository, family)
    entry = supersession["entries"][0]
    if mutation_kind == "source-digest":
        entry["frozen"]["sha256"] = "sha256:" + "0" * 64
    elif mutation_kind == "current-digest":
        entry["current"]["sha256"] = "sha256:" + "0" * 64
    elif mutation_kind == "authority-digest":
        entry["authorityRefs"][0]["sha256"] = "sha256:" + "0" * 64
    else:
        authority = next(item for item in entry["authorityRefs"] if item["ref"] == "D-021")
        authority["startLine"] = 31
        authority["endLine"] = 31
        decision = repository / authority["path"]
        authority["sha256"] = sha256(decision.read_bytes().splitlines(keepends=True)[30])
    write_supersession_map(repository, family, supersession)

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


@pytest.mark.parametrize(
    "mutation_kind",
    ("overlap", "gap", "duplicate-id", "outside-family"),
)
def test_r4_map_overlap_gap_duplicate_id_and_outside_family_tamper(
    repository: Path, mutation_kind: str
) -> None:
    family = (
        "04-agent-fabric-operational-hardening"
        if mutation_kind in {"overlap", "duplicate-id"}
        else FAMILY
    )
    supersession = read_supersession_map(repository, family)
    entries = supersession["entries"]
    if mutation_kind == "overlap":
        entries[1]["frozen"]["startLine"] = entries[0]["frozen"]["endLine"]
    elif mutation_kind == "gap":
        entries[0]["frozen"]["endLine"] -= 1
    elif mutation_kind == "duplicate-id":
        entries[1]["id"] = entries[0]["id"]
    else:
        entries[0]["current"]["modulePath"] = (
            "docs/specs/04-agent-fabric-operational-hardening/47-f023-03-current.md"
        )
    write_supersession_map(repository, family, supersession)

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


@pytest.mark.parametrize(
    "mutation_kind",
    ("replace-to-drop", "drop-unique-obligation", "archive-only-witness"),
)
def test_r4_replace_drop_unique_obligation_and_archive_witness_tamper(
    repository: Path, mutation_kind: str
) -> None:
    if mutation_kind == "drop-unique-obligation":
        rewrite_current_module(
            repository,
            FAMILY,
            "docs/specs/01-agent-fabric/32-f023-02-current.md",
            lambda data: data.replace(
                b"unnegotiated base success", b"unnegotiated base result", 1
            ),
        )
    else:
        manifest = read_manifest(repository)
        supersession = read_supersession_map(repository)
        entry = supersession["entries"][0]
        if mutation_kind == "replace-to-drop":
            entry["disposition"] = "drop"
        else:
            start = entry["frozen"]["startLine"]
            end = entry["frozen"]["endLine"]
            ranges = {
                item["moduleOrdinal"]: (
                    item["sourceStartLine"],
                    item["sourceEndLine"],
                )
                for item in manifest["transformation"]["sourceRanges"]
            }
            ordinal = next(
                ordinal
                for ordinal, (range_start, range_end) in ranges.items()
                if range_start <= start <= end <= range_end
            )
            module = manifest["modules"][ordinal]
            data = (repository / module["path"]).read_bytes()
            current_start, current_end, bound = nonblank_slice(data)
            entry["current"].update(
                {
                    "modulePath": module["path"],
                    "startLine": current_start,
                    "endLine": current_end,
                    "sha256": sha256(bound),
                }
            )
        write_supersession_map(repository, FAMILY, supersession)

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


@pytest.mark.parametrize(
    "family,module_path,obsolete",
    (
        (
            "01-agent-fabric",
            "docs/specs/01-agent-fabric/30-f023-01-current.md",
            b"Legacy imports create both",
        ),
        (
            "01-agent-fabric",
            "docs/specs/01-agent-fabric/31-f023-09-current.md",
            b"forward migration deterministically revokes",
        ),
        (
            "01-agent-fabric",
            "docs/specs/01-agent-fabric/32-f023-02-current.md",
            b"only the v0.36 client/daemon",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/46-f023-10-current.md",
            b"This amendment is approved by Spec 05 v1.0",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/47-f023-03-current.md",
            b"Compatibility decoders may explain",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/48-f023-04-current.md",
            b"The next unused additive migration",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/48-f023-04-current.md",
            b"This section owns their additive persistence",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/49-f023-11-current.md",
            b"migration normalises closed child rows",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/50-f023-12-current.md",
            b"migration transactionally widens the canonical",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/51-f023-13-current.md",
            b"Migration preflight shall reject malformed/non-canonical paths",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/52-f023-14-current.md",
            b"before the schema\nversion advances",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/52-f023-14-current.md",
            b"Recovery is forward repair",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/53-f023-15-current.md",
            b"migration preflight/rollback",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/54-f023-05-current.md",
            b"Migration 0010 rebuilds `artifacts`",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/55-f023-16-current.md",
            b"Existing receipts and intake bindings gain exact registry IDs",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/56-f023-17-current.md",
            b"`intakes` and `intake_revisions` gain an accepted-scope registry ID",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/57-f023-18-current.md",
            b"before table replacement",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/58-f023-19-current.md",
            b"The additive persistence change for operation enforcement shall bind",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/59-f023-06-current.md",
            b"Legacy imports bind\nboth memberships",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/60-f023-07-current.md",
            b"Migration 0013 is forward-only",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/61-f023-20-current.md",
            b"The existing `provider_action_routes` row gains non-null",
        ),
        (
            "05-project-fabric-console",
            "docs/specs/05-project-fabric-console/08-f023-21-current.md",
            b"Specs 01 and 04 shall be amended and accepted before implementation",
        ),
        (
            "05-project-fabric-console",
            "docs/specs/05-project-fabric-console/09-f023-08-current.md",
            b"Spec 05 v1.0 records the human-approved product direction",
        ),
    ),
    ids=(
        "F023-01",
        "F023-09",
        "F023-02",
        "F023-10",
        "F023-03",
        "F023-04",
        "R5-03-folded-F023-04",
        "F023-11",
        "F023-12",
        "F023-13",
        "F023-14-version",
        "F023-14-repair",
        "F023-15",
        "F023-05",
        "F023-16",
        "F023-17",
        "F023-18",
        "F023-19",
        "F023-06",
        "F023-07",
        "F023-20",
        "F023-21",
        "F023-08",
    ),
)
def test_r4_restoring_each_obsolete_predicate_after_full_rehash_is_rejected(
    repository: Path, family: str, module_path: str, obsolete: bytes
) -> None:
    rewrite_current_module(
        repository,
        family,
        module_path,
        lambda data: data + b"\n" + obsolete + b"\n",
    )

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


def test_r4_removing_a_live_supersession_authority_rule_is_rejected(
    repository: Path,
) -> None:
    rewrite_current_module(
        repository,
        "04-agent-fabric-operational-hardening",
        "docs/specs/04-agent-fabric-operational-hardening/62-binding-current-authority.md",
        lambda data: data.replace(
            b"one current database baseline and manifest",
            b"one database baseline and manifest",
            1,
        ),
    )

    with pytest.raises(SpecFamilyError, match="authority binding drift"):
        validate_repository(repository)


@pytest.mark.parametrize("mutation_kind", ("identifier", "definition"))
def test_r4_ac_identifier_or_definition_drift_after_full_rehash_is_rejected(
    repository: Path, mutation_kind: str
) -> None:
    old, new = (
        (b"AC-038", b"AC-039")
        if mutation_kind == "identifier"
        else (b"unnegotiated base success", b"unnegotiated base failure")
    )
    rewrite_current_module(
        repository,
        FAMILY,
        "docs/specs/01-agent-fabric/32-f023-02-current.md",
        lambda data: data.replace(old, new, 1),
    )

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


@pytest.mark.parametrize(
    "family,module_path,obligation",
    (
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/60-f023-07-current.md",
            b"fixtures reject zero-delivery messages",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/60-f023-07-current.md",
            b"expired or abandoned delivery",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/60-f023-07-current.md",
            b"cancelled or degraded tasks",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/60-f023-07-current.md",
            b"missing current\nchair membership",
        ),
        (
            "04-agent-fabric-operational-hardening",
            "docs/specs/04-agent-fabric-operational-hardening/60-f023-07-current.md",
            b"superseded predecessor leases without mutation",
        ),
        (
            "05-project-fabric-console",
            "docs/specs/05-project-fabric-console/09-f023-08-current.md",
            b"typed revision-bound review/confirm paths for every shipped",
        ),
        (
            "05-project-fabric-console",
            "docs/specs/05-project-fabric-console/09-f023-08-current.md",
            b"no required action\n   is an implementation placeholder",
        ),
        (
            "05-project-fabric-console",
            "docs/specs/05-project-fabric-console/09-f023-08-current.md",
            b"The Console owns neither a codec nor policy",
        ),
    ),
    ids=(
        "F023-07-zero-delivery",
        "F023-07-expired-abandoned-delivery",
        "F023-07-cancelled-degraded-task",
        "F023-07-missing-chair",
        "F023-07-superseded-predecessor",
        "F023-08-revision-bound-confirm",
        "F023-08-no-placeholder",
        "F023-08-no-console-policy",
    ),
)
def test_repair1_recovered_obligation_removal_after_full_rehash_is_rejected(
    repository: Path, family: str, module_path: str, obligation: bytes
) -> None:
    rewrite_current_module(
        repository,
        family,
        module_path,
        lambda data: data.replace(obligation, b"recovered obligation removed", 1),
    )

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


@pytest.mark.parametrize("mutation_kind", ("version-history", "candidate-key"))
def test_r4_version_history_or_candidate_api_key_in_binding_package_is_rejected(
    repository: Path, mutation_kind: str
) -> None:
    if mutation_kind == "version-history":
        rewrite_current_module(
            repository,
            FAMILY,
            "docs/specs/01-agent-fabric/30-f023-01-current.md",
            lambda data: data + b"\nVersion 0.36 is a draft amendment\n",
        )
    else:
        manifest = read_manifest(repository)
        manifest["candidateContentSha256"] = manifest[
            "bindingCurrentContentSha256"
        ]
        write_manifest(repository, manifest)

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


def test_r4_public_checker_has_no_candidate_loader_api() -> None:
    import scripts.check_spec_families as checker

    assert not hasattr(checker, "load_family_candidate_bytes")
    assert not hasattr(checker, "load_family_candidate_text")


@pytest.mark.parametrize(
    "mutation_kind",
    ("link", "sql-fence", "role", "binding-sequence", "archive-sequence"),
)
def test_r4_receipt_chain_rejects_link_fence_role_and_sequence_tamper(
    repository: Path, mutation_kind: str
) -> None:
    family = (
        "04-agent-fabric-operational-hardening"
        if mutation_kind == "sql-fence"
        else FAMILY
    )
    manifest = read_manifest(repository, family)
    if mutation_kind == "link":
        manifest["transformation"]["relocatedLinks"][0]["logicalByteOffset"] += 1
    elif mutation_kind == "sql-fence":
        manifest["transformation"]["scaffolding"][0]["leftAppendUtf8"] = "```\n"
    elif mutation_kind == "role":
        manifest["modules"][1]["role"] = "shared-current"
    elif mutation_kind == "binding-sequence":
        sequence = manifest["sequences"]["bindingCurrent"]
        sequence[0], sequence[1] = sequence[1], sequence[0]
    else:
        sequence = manifest["sequences"]["archive"]
        sequence[0], sequence[1] = sequence[1], sequence[0]
    write_manifest(repository, manifest, family)

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


def test_r4_d024_f023_closure_receipt_tamper_is_rejected(
    repository: Path,
) -> None:
    receipt = repository / "tests/spec_fixtures/f023_closure_receipt.json"
    receipt.write_bytes(receipt.read_bytes().replace(b'"status": "verifying"', b'"status": "closed"'))

    with pytest.raises(SpecFamilyError, match="closure-receipt digest drift"):
        validate_repository(repository)


def test_every_nonshared_frozen_slice_has_one_verified_supersession_entry() -> None:
    expected_ids = {
        "01-agent-fabric": {"F023-01", "F023-09", "F023-02"},
        "04-agent-fabric-operational-hardening": {
            "F023-10",
            "F023-03",
            "F023-04",
            "F023-11",
            "F023-12",
            "F023-13",
            "F023-14",
            "F023-15",
            "F023-05",
            "F023-16",
            "F023-17",
            "F023-18",
            "F023-19",
            "F023-06",
            "F023-07",
            "F023-20",
        },
        "05-project-fabric-console": {"F023-21", "F023-08"},
    }
    history_ranges = {
        "01-agent-fabric": {(12, 130), (3_596, 3_613)},
        "04-agent-fabric-operational-hardening": {(14, 109)},
        "05-project-fabric-console": {(17, 95)},
    }

    results = {result.stem: result for result in validate_repository(ROOT)}
    for family, result in results.items():
        manifest = result.manifest
        assert manifest["schemaVersion"] == 3
        binding = set(manifest["sequences"]["bindingCurrent"])
        archive = set(manifest["sequences"]["archive"])
        modules = {module["ordinal"]: module for module in manifest["modules"]}
        source_ranges = {
            item["moduleOrdinal"]: (
                item["sourceStartLine"],
                item["sourceEndLine"],
            )
            for item in manifest["transformation"]["sourceRanges"]
        }
        map_path = ROOT / manifest["supersessionMapPath"]
        supersession = json.loads(map_path.read_text())
        entries = supersession["entries"]

        assert {entry["id"] for entry in entries} == expected_ids[family]
        assert supersession["bindingCurrentContentSha256"] == sha256(
            result.binding_current
        )
        mapped_archive = set()
        for entry in entries:
            frozen = entry["frozen"]
            owners = {
                ordinal
                for ordinal, (start, end) in source_ranges.items()
                if start <= frozen["startLine"] <= frozen["endLine"] <= end
            }
            assert len(owners) == 1
            owner = owners.pop()
            assert modules[owner]["role"] == "archive-only"
            assert owner in archive - binding
            mapped_archive.add(owner)

            current_path = entry["current"]["modulePath"]
            current_module = next(
                module for module in modules.values() if module["path"] == current_path
            )
            assert current_module["role"] == "current-only"
            assert current_module["ordinal"] in binding - archive
            assert entry["authorityRefs"]

        unshared_history = {
            source_ranges[ordinal]
            for ordinal in archive - binding - mapped_archive
        }
        assert unshared_history == history_ranges[family]


def test_spec04_root_discloses_receipt_normalised_logical_hashing() -> None:
    family = "04-agent-fabric-operational-hardening"
    manifest = read_manifest(ROOT, family)
    raw = b"".join((ROOT / module["path"]).read_bytes() for module in manifest["modules"])
    root_text = (ROOT / "docs" / "specs" / f"{family}.md").read_text()

    assert sha256(raw) != manifest["archiveContentSha256"]
    assert "raw concatenation\nis not the logical content hash" in root_text
    assert "closes and reopens its long SQL fence" in root_text
    assert "Receipt normalisation" in root_text


def test_every_published_family_file_is_bounded_and_standalone() -> None:
    for family in FROZEN_SOURCES:
        root_index = ROOT / "docs" / "specs" / f"{family}.md"
        manifest = manifest_path(ROOT, family)
        assert root_index.read_bytes().count(b"\n") <= 1_000
        assert manifest.read_bytes().count(b"\n") <= 1_000
        for path in (ROOT / "docs" / "specs" / family).glob("*.md"):
            assert path.read_bytes().count(b"\n") <= 1_000
            _scan_markdown_stream(ROOT, [(path, path.read_text())])


def test_loader_never_returns_a_partially_validated_family(repository: Path) -> None:
    manifest = read_manifest(repository)
    last = repository / manifest["modules"][-1]["path"]
    last.unlink()

    with pytest.raises(SpecFamilyError):
        load_family_bytes(repository, FAMILY)


def test_missing_module_is_rejected(repository: Path) -> None:
    manifest = read_manifest(repository)
    (repository / manifest["modules"][2]["path"]).unlink()

    with pytest.raises(SpecFamilyError, match="missing module"):
        validate_repository(repository)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda manifest: manifest["modules"][1].__setitem__("ordinal", 0),
        lambda manifest: manifest["modules"][1].__setitem__(
            "path", manifest["modules"][0]["path"]
        ),
    ],
    ids=("duplicate-ordinal", "duplicate-path"),
)
def test_duplicate_module_identity_is_rejected(
    repository: Path, mutation: Callable[[dict], None]
) -> None:
    manifest = read_manifest(repository)
    mutation(manifest)
    write_manifest(repository, manifest)

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


@pytest.mark.parametrize(
    "invalid_path",
    (
        "../escape.md",
        "/absolute.md",
        "docs\\specs\\01-agent-fabric\\00.md",
    ),
)
def test_noncanonical_module_paths_are_rejected(
    repository: Path, invalid_path: str
) -> None:
    manifest = read_manifest(repository)
    manifest["modules"][0]["path"] = invalid_path
    write_manifest(repository, manifest)

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


@pytest.mark.parametrize("extra_name", ("unlisted.txt", "unlisted-directory"))
def test_every_unlisted_family_entry_is_rejected(
    repository: Path, extra_name: str
) -> None:
    extra = repository / "docs" / "specs" / FAMILY / extra_name
    if extra_name.endswith("directory"):
        extra.mkdir()
    else:
        extra.write_text("not in the closed manifest\n")

    with pytest.raises(SpecFamilyError, match="unlisted"):
        validate_repository(repository)


def test_symlinked_module_is_rejected(repository: Path) -> None:
    manifest = read_manifest(repository)
    module = repository / manifest["modules"][0]["path"]
    target = repository / manifest["modules"][2]["path"]
    module.unlink()
    os.symlink(target.name, module)

    with pytest.raises(SpecFamilyError, match="symlink forbidden"):
        validate_repository(repository)


def test_symlinked_family_directory_is_rejected(repository: Path) -> None:
    family_dir = repository / "docs" / "specs" / FAMILY
    real_dir = family_dir.with_name(f"{FAMILY}-real")
    family_dir.rename(real_dir)
    os.symlink(real_dir.name, family_dir)

    with pytest.raises(SpecFamilyError, match="symlink forbidden"):
        validate_repository(repository)


def test_module_hash_drift_is_rejected(repository: Path) -> None:
    manifest = read_manifest(repository)
    module = repository / manifest["modules"][2]["path"]
    module.write_bytes(module.read_bytes() + b"tamper\n")

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


def test_physical_module_cannot_end_with_a_blank_separator_line(
    repository: Path,
) -> None:
    manifest = read_manifest(repository)
    module = repository / manifest["modules"][2]["path"]
    assert not module.read_bytes().endswith(b"\n\n")
    module.write_bytes(module.read_bytes() + b"\n")

    with pytest.raises(SpecFamilyError, match="ends with a blank separator line"):
        validate_repository(repository)


@pytest.mark.parametrize(
    "field",
    ("moduleSetSha256", "transformationReceiptSha256"),
)
def test_package_and_receipt_digest_drift_is_rejected(
    repository: Path, field: str
) -> None:
    manifest = read_manifest(repository)
    manifest[field] = "sha256:" + "0" * 64
    write_manifest(repository, manifest)

    with pytest.raises(SpecFamilyError, match="digest drift"):
        validate_repository(repository)


def test_duplicate_json_keys_are_rejected(repository: Path) -> None:
    path = manifest_path(repository)
    text = path.read_text().replace(
        '  "familyId":',
        '  "familyId": "duplicate",\n  "familyId":',
        1,
    )
    path.write_text(text)

    with pytest.raises(SpecFamilyError, match="duplicate JSON key"):
        validate_repository(repository)


@pytest.mark.parametrize("constant", ("NaN", "Infinity", "-Infinity"))
def test_nonfinite_json_numbers_are_rejected(
    repository: Path, constant: str
) -> None:
    path = manifest_path(repository)
    text = path.read_text().replace('"schemaVersion": 3', f'"schemaVersion": {constant}', 1)
    path.write_text(text)

    with pytest.raises(SpecFamilyError, match="non-finite"):
        validate_repository(repository)


def test_boolean_is_not_accepted_as_an_integer(repository: Path) -> None:
    manifest = read_manifest(repository)
    manifest["modules"][0]["ordinal"] = True
    write_manifest(repository, manifest)

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


@pytest.mark.parametrize(
    "mutation",
    (
        lambda data: b"\xef\xbb\xbf" + data,
        lambda data: data.replace(b"\n", b"\r\n", 1),
        lambda data: b"\xff" + data[1:],
        lambda data: data.removesuffix(b"\n"),
    ),
    ids=("bom", "crlf", "invalid-utf8", "missing-terminal-lf"),
)
def test_manifest_byte_contract_is_closed(
    repository: Path, mutation: Callable[[bytes], bytes]
) -> None:
    path = manifest_path(repository)
    path.write_bytes(mutation(path.read_bytes()))

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


@pytest.mark.parametrize("target", ("manifest", "index", "module"))
def test_thousand_line_cap_applies_to_every_family_artifact(
    repository: Path, target: str
) -> None:
    manifest = read_manifest(repository)
    if target == "manifest":
        path = manifest_path(repository)
    elif target == "index":
        path = repository / "docs" / "specs" / f"{FAMILY}.md"
    else:
        path = repository / manifest["modules"][2]["path"]
    path.write_bytes(path.read_bytes() + b"padding\n" * 1_001)

    with pytest.raises(SpecFamilyError, match="line cap"):
        validate_repository(repository)


def test_raw_manifest_hash_is_committed_by_the_root_index(repository: Path) -> None:
    path = manifest_path(repository)
    path.write_bytes(path.read_bytes() + b"\n")

    with pytest.raises(SpecFamilyError, match="root manifest drift"):
        validate_repository(repository)


def test_root_index_drift_is_rejected(repository: Path) -> None:
    index = repository / "docs" / "specs" / f"{FAMILY}.md"
    index.write_bytes(index.read_bytes() + b"drift\n")

    with pytest.raises(SpecFamilyError, match="root manifest drift"):
        validate_repository(repository)


def test_version_drift_is_rejected_after_recomputed_commitments(
    repository: Path,
) -> None:
    manifest = read_manifest(repository)
    manifest["familyVersion"] = "999"
    write_manifest(
        repository,
        manifest,
        recompute_commitments=True,
        refresh_index=True,
    )

    with pytest.raises(SpecFamilyError, match="family version drift"):
        validate_repository(repository)


def test_archive_sequence_reordering_is_rejected(repository: Path) -> None:
    manifest = read_manifest(repository)
    archive = manifest["sequences"]["archive"]
    archive[0], archive[1] = archive[1], archive[0]
    write_manifest(
        repository,
        manifest,
        recompute_commitments=True,
        refresh_index=True,
    )

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


def test_binding_current_sequence_reordering_is_rejected(repository: Path) -> None:
    manifest = read_manifest(repository)
    binding = manifest["sequences"]["bindingCurrent"]
    binding[0], binding[1] = binding[1], binding[0]
    write_manifest(
        repository,
        manifest,
        recompute_commitments=True,
        refresh_index=True,
    )

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


def test_reclassification_is_rejected_even_after_rehashing(repository: Path) -> None:
    manifest = read_manifest(repository)
    old_module_set = manifest["moduleSetSha256"]
    manifest["modules"][1]["role"] = "shared-current"
    manifest["sequences"]["bindingCurrent"].insert(1, 1)
    write_manifest(
        repository,
        manifest,
        recompute_commitments=True,
        refresh_index=True,
    )
    assert manifest["moduleSetSha256"] != old_module_set

    with pytest.raises(SpecFamilyError):
        validate_repository(repository)


def mutate_sql_boundary(manifest: dict) -> None:
    split_point = next(
        point
        for point in manifest["transformation"]["splitPoints"]
        if point["boundaryKind"] == "sql-statement"
    )
    split_point["boundaryKind"] = "paragraph"


@pytest.mark.parametrize(
    "mutation, message",
    (
        (
            lambda manifest: manifest["transformation"]["splitPoints"][0].__setitem__(
                "logicalByteOffset",
                manifest["transformation"]["splitPoints"][0]["logicalByteOffset"] + 1,
            ),
            "offset drift",
        ),
        (
            lambda manifest: manifest["transformation"]["scaffolding"][0].__setitem__(
                "leftAppendUtf8", "```\n"
            ),
            "scaffolding receipt drift",
        ),
        (
            mutate_sql_boundary,
            "must be a SQL statement",
        ),
    ),
    ids=("split-offset", "scaffold", "sql-boundary"),
)
def test_reversible_split_receipt_tamper_is_rejected(
    repository: Path,
    mutation: Callable[[dict], None],
    message: str,
) -> None:
    family = "04-agent-fabric-operational-hardening"
    manifest = read_manifest(repository, family)
    mutation(manifest)
    write_manifest(
        repository,
        manifest,
        family,
        recompute_commitments=True,
        refresh_index=True,
    )

    with pytest.raises(SpecFamilyError, match=message):
        validate_repository(repository)


def test_independent_frozen_anchor_is_not_mutable_receipt_state(repository: Path) -> None:
    manifest = read_manifest(repository)
    manifest["transformation"]["frozenSourceSha256"] = "sha256:" + "0" * 64
    write_manifest(
        repository,
        manifest,
        recompute_commitments=True,
        refresh_index=True,
    )

    with pytest.raises(SpecFamilyError, match="frozen source digest drift"):
        validate_repository(repository)


def test_relocated_link_offset_tamper_is_rejected(repository: Path) -> None:
    manifest = read_manifest(repository)
    relocation = manifest["transformation"]["relocatedLinks"][0]
    relocation["logicalByteOffset"] += 1
    write_manifest(
        repository,
        manifest,
        recompute_commitments=True,
        refresh_index=True,
    )

    with pytest.raises(SpecFamilyError, match="target bytes drift"):
        validate_repository(repository)


def test_broken_relative_link_and_fragment_are_rejected(tmp_path: Path) -> None:
    source = tmp_path / "source.md"
    target = tmp_path / "target.md"
    source.write_text("# Source\n")
    target.write_text("# Existing heading\n")

    with pytest.raises(SpecFamilyError, match="broken link"):
        _validate_links(tmp_path, source, "[missing](absent.md)", 2)
    with pytest.raises(SpecFamilyError, match="broken fragment"):
        _validate_links(tmp_path, source, "[missing](target.md#absent)", 2)


def test_duplicate_requirement_definition_is_rejected(tmp_path: Path) -> None:
    first = tmp_path / "first.md"
    second = tmp_path / "second.md"
    first.write_text("# First\n- **FR-001:** first\n")
    second.write_text("## Second\n- **FR-001:** second\n")

    with pytest.raises(SpecFamilyError, match="duplicate requirement"):
        _scan_markdown_stream(
            tmp_path,
            [(first, first.read_text()), (second, second.read_text())],
        )


def test_each_module_must_close_its_own_fence(tmp_path: Path) -> None:
    module = tmp_path / "module.md"
    module.write_text("# Module\n```sql\nselect 1;\n")

    with pytest.raises(SpecFamilyError, match="unclosed Markdown fence"):
        _scan_markdown_stream(tmp_path, [(module, module.read_text())])
