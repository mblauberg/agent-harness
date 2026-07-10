import importlib.util
import json
import os
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
COLLECTOR_PATH = ROOT / "skills" / "skill-audit" / "scripts" / "collect_telemetry.py"
VALIDATOR_PATH = ROOT / "skills" / "skill-audit" / "scripts" / "validate_telemetry.py"


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def scope_args(source_root: Path):
    return {
        "source_root": source_root,
        "destination_path": source_root.parent / "telemetry.json",
        "source_schema": "codex-session-jsonl-v1",
        "platform": "codex",
        "started_at": "2026-07-01T00:00:00Z",
        "ended_at": "2026-07-08T00:00:00Z",
        "skills": ["scope"],
        "persistence": "local-private",
        "retention_until": "2026-10-10T00:00:00Z",
        "minimum_cell_size": 5,
    }


def test_dry_run_scope_does_not_read_source_content(tmp_path, monkeypatch):
    collector = load(COLLECTOR_PATH, "collect_telemetry_dry")
    source = tmp_path / "sessions"
    source.mkdir()
    (source / "one.jsonl").write_text("PRIVATE CONTENT")

    original = Path.read_text

    def guarded(path, *args, **kwargs):
        if source in path.parents:
            raise AssertionError("dry-run read source content")
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", guarded)
    proposal = collector.build_scope_proposal(**scope_args(source))

    assert proposal["schema_version"] == 1
    assert proposal["authority"]["status"] == "pending-human-approval"
    assert proposal["source"]["file_count"] == 1
    assert "source_root" not in json.dumps(proposal)
    assert str(source) not in json.dumps(proposal)


def test_unsupported_schema_fails_before_source_walk(tmp_path, monkeypatch):
    collector = load(COLLECTOR_PATH, "collect_telemetry_unknown")

    def explode(*_args, **_kwargs):
        raise AssertionError("walked source before schema validation")

    monkeypatch.setattr(Path, "rglob", explode)
    args = scope_args(tmp_path)
    args["source_schema"] = "mystery-v9"
    with pytest.raises(collector.CollectionError, match="unsupported source schema"):
        collector.build_scope_proposal(**args)


def test_collection_requires_matching_approved_scope_receipt(tmp_path):
    collector = load(COLLECTOR_PATH, "collect_telemetry_approval")
    source = tmp_path / "sessions"
    source.mkdir()
    (source / "one.jsonl").write_text("{}\n")
    args = scope_args(source)
    proposal = collector.build_scope_proposal(**args)
    receipt = tmp_path / "scope.json"
    receipt.write_text(json.dumps(proposal))

    with pytest.raises(collector.CollectionError, match="human approval"):
        collector.collect(scope_receipt=receipt, root=ROOT, **args)

    proposal["authority"] = {"status": "approved", "approved_by": "human", "evidence": "direct-instruction"}
    receipt.write_text(json.dumps(proposal))
    args["ended_at"] = "2026-07-09T00:00:00Z"
    with pytest.raises(collector.CollectionError, match="does not match"):
        collector.collect(scope_receipt=receipt, root=ROOT, **args)


def test_approved_scope_cannot_be_replayed_on_another_root_or_output(tmp_path, monkeypatch):
    collector = load(COLLECTOR_PATH, "collect_telemetry_replay")
    source_a = tmp_path / "a"
    source_b = tmp_path / "b"
    source_a.mkdir()
    source_b.mkdir()
    payload = '{"timestamp":"2026-07-02T00:00:00Z","type":"skill_event","skill":"scope","event":"candidate"}\n'
    (source_a / "one.jsonl").write_text(payload)
    (source_b / "one.jsonl").write_text(payload)
    args = scope_args(source_a)
    proposal = collector.build_scope_proposal(**args)
    proposal["authority"] = {"status": "approved", "approved_by": "human", "evidence": "direct-instruction"}
    receipt = tmp_path / "scope.json"
    receipt.write_text(json.dumps(proposal))

    replay = dict(args)
    replay["source_root"] = source_b
    with pytest.raises(collector.CollectionError, match="does not match"):
        collector.collect(scope_receipt=receipt, root=ROOT, generated_at="2026-07-10T00:00:00Z", **replay)
    replay = dict(args)
    replay["destination_path"] = tmp_path / "different-output.json"
    with pytest.raises(collector.CollectionError, match="does not match"):
        collector.collect(scope_receipt=receipt, root=ROOT, generated_at="2026-07-10T00:00:00Z", **replay)


def test_symlinked_source_root_or_file_fails_before_content_read(tmp_path):
    collector = load(COLLECTOR_PATH, "collect_telemetry_symlink")
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.jsonl").write_text("PRIVATE")
    root_link = tmp_path / "root-link"
    root_link.symlink_to(outside, target_is_directory=True)
    with pytest.raises(collector.CollectionError, match="symlink"):
        collector.build_scope_proposal(**scope_args(root_link))

    source = tmp_path / "source"
    source.mkdir()
    (source / "linked.jsonl").symlink_to(outside / "secret.jsonl")
    with pytest.raises(collector.CollectionError, match="symlink"):
        collector.build_scope_proposal(**scope_args(source))


def test_source_swap_after_scope_approval_is_rejected(tmp_path, monkeypatch):
    collector = load(COLLECTOR_PATH, "collect_telemetry_source_swap")
    source = tmp_path / "sessions"
    source.mkdir()
    transcript = source / "one.jsonl"
    original = '{"timestamp":"2026-07-02T00:00:00Z","type":"skill_event","skill":"scope","event":"candidate"}\n'
    replacement = original.replace("candidate", "completed")
    assert len(original) == len(replacement)
    transcript.write_text(original)
    args = scope_args(source)
    proposal = collector.build_scope_proposal(**args)
    proposal["authority"] = {"status": "approved", "approved_by": "human", "evidence": "direct-instruction"}
    receipt = tmp_path / "scope.json"
    receipt.write_text(json.dumps(proposal))
    approved_stat = transcript.stat()
    real_approved_receipt = collector._approved_receipt

    def swap_after_approval(path, expected):
        result = real_approved_receipt(path, expected)
        staged = source / "replacement.jsonl"
        staged.write_text(replacement)
        os.utime(staged, ns=(approved_stat.st_atime_ns, approved_stat.st_mtime_ns))
        os.replace(staged, transcript)
        return result

    monkeypatch.setattr(collector, "_approved_receipt", swap_after_approval)
    with pytest.raises(collector.CollectionError, match="changed after approval"):
        collector.collect(
            scope_receipt=receipt,
            root=ROOT,
            generated_at="2026-07-10T00:00:00Z",
            **args,
        )


def test_destination_cannot_overwrite_or_land_inside_source_tree(tmp_path):
    collector = load(COLLECTOR_PATH, "collect_telemetry_destination")
    source = tmp_path / "sessions"
    source.mkdir()
    transcript = source / "one.jsonl"
    transcript.write_text("PRIVATE\n")
    args = scope_args(source)
    for destination in (transcript, source / "aggregate.json"):
        args["destination_path"] = destination
        with pytest.raises(collector.CollectionError, match="outside"):
            collector.build_scope_proposal(**args)
    link = tmp_path / "telemetry-link.json"
    link.symlink_to(tmp_path / "real.json")
    args["destination_path"] = link
    with pytest.raises(collector.CollectionError, match="symlink"):
        collector.build_scope_proposal(**args)


def test_collection_emits_only_valid_aggregate_metadata(tmp_path):
    collector = load(COLLECTOR_PATH, "collect_telemetry_good")
    validator = load(VALIDATOR_PATH, "validate_telemetry_good")
    source = tmp_path / "sessions"
    source.mkdir()
    rows = [
        {"timestamp": "2026-07-02T01:00:00Z", "type": "skill_event", "skill": "scope", "event": "candidate"},
        {"timestamp": "2026-07-02T01:00:01Z", "type": "skill_event", "skill": "scope", "event": "selected"},
        {"timestamp": "2026-07-02T01:01:00Z", "type": "skill_event", "skill": "scope", "event": "completed"},
        {"timestamp": "2026-07-02T01:01:01Z", "type": "message", "content": "secret prompt", "project": "private"},
    ]
    (source / "one.jsonl").write_text("".join(json.dumps(row) + "\n" for row in rows))
    args = scope_args(source)
    proposal = collector.build_scope_proposal(**args)
    proposal["authority"] = {"status": "approved", "approved_by": "human", "evidence": "direct-instruction"}
    receipt = tmp_path / "scope.json"
    receipt.write_text(json.dumps(proposal))

    result = collector.collect(scope_receipt=receipt, root=ROOT, generated_at="2026-07-10T00:00:00Z", **args)
    validator.validate(result, ROOT)
    encoded = json.dumps(result)
    assert "secret prompt" not in encoded
    assert '"project": "private"' not in encoded
    assert str(source) not in encoded
    assert result["adapters"][0]["records_read"] == 4
    assert result["adapters"][0]["records_emitted"] == 3
    assert result["adapters"][0]["records_rejected"] == 1
    assert result["aggregates"][0]["opportunities"] == 1
    assert result["aggregates"][0]["completions"] == 1


def test_out_of_window_and_unscoped_skill_records_are_rejected_not_leaked(tmp_path):
    collector = load(COLLECTOR_PATH, "collect_telemetry_scope")
    source = tmp_path / "sessions"
    source.mkdir()
    rows = [
        {"timestamp": "2025-01-01T00:00:00Z", "type": "skill_event", "skill": "scope", "event": "candidate"},
        {"timestamp": "2026-07-02T00:00:00Z", "type": "skill_event", "skill": "legal-writing", "event": "candidate"},
    ]
    (source / "one.jsonl").write_text("".join(json.dumps(row) + "\n" for row in rows))
    args = scope_args(source)
    proposal = collector.build_scope_proposal(**args)
    proposal["authority"] = {"status": "approved", "approved_by": "human", "evidence": "direct-instruction"}
    receipt = tmp_path / "scope.json"
    receipt.write_text(json.dumps(proposal))

    result = collector.collect(scope_receipt=receipt, root=ROOT, generated_at="2026-07-10T00:00:00Z", **args)
    assert result["events"] == []
    assert result["aggregates"][0] == {
        "skill": "scope",
        "opportunities": 0,
        "selections": 0,
        "completions": 0,
        "corrections": 0,
        "unknown_outcomes": 0,
        "denominator_source": "explicit-receipts-v1",
    }
    assert result["adapters"][0]["records_rejected"] == 2
