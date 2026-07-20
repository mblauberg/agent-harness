#!/usr/bin/env python3
"""Validate provider-neutral private-memory lifecycle artifacts."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import unicodedata
from typing import Any


SHA256 = re.compile(r"sha256:[0-9a-f]{64}\Z")
IDENTIFIER = re.compile(r"[a-z][a-z0-9_-]{2,127}\Z")
UTC = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\Z")
POINTER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}\Z")
PROHIBITED_TEXT = (
    re.compile(r"(?i)\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*\S+"),
    re.compile(r"(?i)\b(?:api[_ -]?key|access[_ -]?token|password|secret)\s+(?:is|was)\s+\S+"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._-]{8,}\b"),
    re.compile(r"(?i)\b(?:login\s+)?credential(?:s)?\b"),
    re.compile(r"\b(?:sk|ghp|github_pat|AKIA)[-_A-Za-z0-9]{8,}\b"),
    re.compile(r"(?i)\b(?:sudo\s+|rm\s+-rf\b|pkill\b|kill\s+-\d+\b|chmod\s+|chown\s+|find\b[^\n]{0,160}\s-delete\b|git\s+(?:reset|checkout|clean|restore)\b|git\s+push\b[^\n]{0,80}--force\b)"),
    re.compile(r"(?i)\b(?:curl|wget)\b[^\n|]{0,240}\|\s*(?:ba|z|fi)?sh\b"),
    re.compile(r"(?i)\b(?:python\d*(?:\.\d+)?|ruby|perl|node|(?:ba|z|fi)?sh|pwsh|powershell)\s+-(?:[A-Za-z]*[ce])\b"),
    re.compile(r"(?:&&|\|\||`|\$\()"),
    re.compile(r"(?im)^\s*(?:user|assistant|system|tool)\s*:"),
    re.compile(r"(?i)\b(?:response_item|event_msg|rollout_path|session_meta)\b"),
    re.compile(r"(?i)\b(?:claude-(?:opus|sonnet|haiku|fable)|gpt|gemini|grok)-[0-9][A-Za-z0-9._-]*\b"),
    re.compile(r"(?i)\b(?:claude\s+)?(?:opus|sonnet|haiku|fable|gpt|gemini|grok)[ .:_-]*[0-9][A-Za-z0-9._-]*\b"),
    re.compile(r"(?i)\b(?:project status|current status|tests passed|pr\s*#\d+\s+is\s+(?:merged|open|closed)|head is\s+[0-9a-f]{7,40})\b"),
    re.compile(r"(?i)\b(?:active|current)\s+(?:worktree|branch|checkout|issue|task|run|session)\b"),
    re.compile(r"(?i)\b(?:issue|ticket|pr|commit|run[_ -]?id|session[_ -]?id)\s*[:#=]?\s*(?:[0-9]{2,}|[0-9a-f]{7,40})\b"),
    re.compile(r"\b[A-Fa-f0-9]{8}-[A-Fa-f0-9-]{27,}\b"),
    re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"),
    re.compile(r"(?i)\b\d{1,5}\s+[A-Za-z][A-Za-z .'-]{1,60}\s(?:street|st|road|rd|avenue|ave|drive|dr)\b"),
    re.compile(r"(?<!\w)(?:\+?\d[\d ()-]{7,}\d)(?!\w)"),
)


class ContractError(ValueError):
    pass


def normalize(text: str) -> str:
    if not isinstance(text, str):
        raise ContractError("normalized_text must be a string")
    return " ".join(unicodedata.normalize("NFC", text.replace("\r\n", "\n").replace("\r", "\n")).split())


def _digest(text: str) -> str:
    return "sha256:" + hashlib.sha256(normalize(text).encode()).hexdigest()


def _exact(value: Any, keys: set[str], field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{field} must be an object")
    unexpected = set(value) - keys
    missing = keys - set(value)
    if unexpected:
        raise ContractError(f"{field} has unexpected fields: {', '.join(sorted(unexpected))}")
    if missing:
        raise ContractError(f"{field} is missing fields: {', '.join(sorted(missing))}")
    return value


def _text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f"{field} must be non-empty")
    return value


def _pointer(value: Any, field: str) -> str:
    if (
        not isinstance(value, str)
        or not POINTER.fullmatch(value)
        or any(pattern.search(value) for pattern in PROHIBITED_TEXT)
    ):
        raise ContractError(f"{field} must be a bounded pointer")
    return value


def _sha(value: Any, field: str) -> str:
    if not isinstance(value, str) or not SHA256.fullmatch(value):
        raise ContractError(f"{field} must be a sha256 digest")
    return value


def _timestamp(value: Any, field: str) -> str:
    if not isinstance(value, str) or not UTC.fullmatch(value):
        raise ContractError(f"{field} must be a UTC timestamp")
    try:
        datetime_from_utc(value)
    except ValueError as exc:
        raise ContractError(f"{field} must be a valid UTC timestamp") from exc
    return value


def _value_digest(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _supersession(value: Any, field: str) -> None:
    row = _exact(value, {
        "superseded_by", "decision", "adjudication_pointer",
        "adjudication_digest", "reducer", "applied_by", "write_authority_pointer",
        "write_authority_digest",
    }, field)
    _text(row["superseded_by"], f"{field}.superseded_by")
    for key in ("adjudication_pointer", "write_authority_pointer"):
        _pointer(row[key], f"{field}.{key}")
    for key in ("reducer", "applied_by"):
        _text(row[key], f"{field}.{key}")
    _sha(row["adjudication_digest"], f"{field}.adjudication_digest")
    _sha(row["write_authority_digest"], f"{field}.write_authority_digest")
    if row["decision"] not in {"semantic-equivalence", "exact-duplicate", "canonical-owner-precedence", "user-confirmed"}:
        raise ContractError(f"{field}.decision is invalid")


def _entry(value: Any, index: int) -> dict[str, Any]:
    field = f"entries[{index}]"
    entry = _exact(value, {
        "preference_id", "record_kind", "classification", "normalized_text",
        "normalized_text_digest", "status", "canonical_owner", "provenance",
        "freshness", "supersession", "admission",
    }, field)
    if not isinstance(entry["preference_id"], str) or not IDENTIFIER.fullmatch(entry["preference_id"]):
        raise ContractError(f"{field}.preference_id is invalid")
    if entry["record_kind"] not in {"preference", "owner-pointer"}:
        raise ContractError(f"{field}.record_kind is invalid")
    if entry["status"] not in {"active", "superseded"}:
        raise ContractError(f"{field}.status is invalid")
    _sha(entry["normalized_text_digest"], f"{field}.normalized_text_digest")
    freshness = _exact(entry["freshness"], {"verified_at", "invalidation_trigger"}, f"{field}.freshness")
    _timestamp(freshness["verified_at"], f"{field}.freshness.verified_at")
    _text(freshness["invalidation_trigger"], f"{field}.freshness.invalidation_trigger")
    if not isinstance(entry["provenance"], list):
        raise ContractError(f"{field}.provenance must be a list")
    provenance_kinds = set()
    for provenance_index, raw in enumerate(entry["provenance"]):
        prov_field = f"{field}.provenance[{provenance_index}]"
        item = _exact(raw, {"kind", "pointer", "digest", "observed_at"}, prov_field)
        if item["kind"] not in {"direct-user-decision", "canonical-owner", "provider-projection"}:
            raise ContractError(f"{prov_field}.kind is invalid")
        provenance_kinds.add(item["kind"])
        _pointer(item["pointer"], f"{prov_field}.pointer")
        _sha(item["digest"], f"{prov_field}.digest")
        _timestamp(item["observed_at"], f"{prov_field}.observed_at")

    if entry["record_kind"] == "preference":
        if entry["classification"] != "explicit-cross-project-preference":
            raise ContractError(f"{field}: only explicit cross-project preferences enter active private memory")
        text = _text(entry["normalized_text"], f"{field}.normalized_text")
        if any(pattern.search(text) for pattern in PROHIBITED_TEXT):
            raise ContractError(f"{field} contains prohibited active-memory content")
        if _digest(text) != entry["normalized_text_digest"]:
            raise ContractError(f"{field}.normalized_text_digest does not match normalized text")
        if "direct-user-decision" not in provenance_kinds:
            raise ContractError(f"{field} requires direct-user-decision provenance")
        if entry["canonical_owner"] is not None:
            raise ContractError(f"{field}: a preference cannot override a canonical owner")
        admission = _exact(entry["admission"], {"pointer", "digest"}, f"{field}.admission")
        _pointer(admission["pointer"], f"{field}.admission.pointer")
        _sha(admission["digest"], f"{field}.admission.digest")
    else:
        if entry["classification"] != "harness-doctrine-duplicate":
            raise ContractError(f"{field}: owner pointers only represent doctrine duplicates")
        if entry["normalized_text"] is not None:
            raise ContractError(f"{field}: owner pointers cannot copy doctrine text")
        owner = _exact(entry["canonical_owner"], {"kind", "pointer", "digest", "verified_at"}, f"{field}.canonical_owner")
        if owner["kind"] not in {"project", "harness", "skill", "runbook", "adr", "tracker"}:
            raise ContractError(f"{field}.canonical_owner.kind is invalid")
        _pointer(owner["pointer"], f"{field}.canonical_owner.pointer")
        _sha(owner["digest"], f"{field}.canonical_owner.digest")
        _timestamp(owner["verified_at"], f"{field}.canonical_owner.verified_at")
        if entry["status"] != "superseded":
            raise ContractError(f"{field}: owner pointers are non-authoritative and superseded")
        if entry["admission"] is not None:
            raise ContractError(f"{field}: owner pointers cannot declare admission")

    if entry["status"] == "active" and entry["supersession"] is not None:
        raise ContractError(f"{field}: active entries cannot declare supersession")
    if entry["status"] == "superseded" and entry["record_kind"] == "preference":
        _supersession(entry["supersession"], f"{field}.supersession")
    if entry["record_kind"] == "owner-pointer" and entry["supersession"] is not None:
        raise ContractError(f"{field}: owner pointers use canonical-owner precedence, not a second supersession record")
    return entry


def _bound_json(pointer: str, digest: str, artifact_root: Path | None, field: str) -> tuple[dict[str, Any], Path]:
    if artifact_root is None:
        raise ContractError(f"{field} requires an artifact root")
    path = Path(_pointer(pointer, f"{field}.pointer"))
    if path.is_absolute() or ".." in path.parts:
        raise ContractError(f"{field}.pointer must be safe and relative")
    root = artifact_root.resolve()
    target = (root / path).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ContractError(f"{field}.pointer escapes the artifact root") from exc
    try:
        content = target.read_bytes()
    except OSError as exc:
        raise ContractError(f"{field} artifact is missing") from exc
    if "sha256:" + hashlib.sha256(content).hexdigest() != _sha(digest, f"{field}.digest"):
        raise ContractError(f"{field} artifact digest does not match")
    try:
        value = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ContractError(f"{field} artifact is invalid JSON") from exc
    if not isinstance(value, dict):
        raise ContractError(f"{field} artifact must be an object")
    return value, target


def _separate_approval_root(artifact_root: Path | None, approval_root: Path | None) -> None:
    if artifact_root is None or approval_root is None:
        raise ContractError("private-memory preference validation requires artifact and approval roots")
    artifact = artifact_root.resolve()
    approval = approval_root.resolve()
    if not artifact.is_dir() or not approval.is_dir():
        raise ContractError("artifact and approval roots must be existing directories")
    try:
        artifact.relative_to(approval)
        overlaps = True
    except ValueError:
        try:
            approval.relative_to(artifact)
            overlaps = True
        except ValueError:
            overlaps = False
    if overlaps:
        raise ContractError("approval root must be disjoint from projector artifact authority")


def _not_expired(value: Any, field: str) -> None:
    _timestamp(value, field)
    expires = datetime_from_utc(value)
    if expires <= datetime.now(timezone.utc):
        raise ContractError(f"{field} is expired")


def datetime_from_utc(value: str) -> datetime:
    return datetime.fromisoformat(value[:-1] + "+00:00")


def _validate_user_approval(
    pointer: str, digest: str, approval_root: Path | None, *, operation: str,
    preference_id: str, preference_digest: str, scope_digest: str, field: str,
) -> None:
    approval, _ = _bound_json(pointer, digest, approval_root, field)
    approval = _exact(approval, {
        "schema_version", "contract", "approver", "operation",
        "preference_id", "normalized_text_digest", "scope_digest", "approved_at",
    }, field)
    if (
        approval["schema_version"] != 1
        or approval["contract"] != "private-memory-user-approval"
        or approval["approver"] != "user"
        or approval["operation"] != operation
        or approval["preference_id"] != preference_id
        or approval["normalized_text_digest"] != preference_digest
        or approval["scope_digest"] != scope_digest
    ):
        raise ContractError(f"{field} does not bind user approval")
    _timestamp(approval["approved_at"], f"{field}.approved_at")


def _validate_admission(
    entry: dict[str, Any], provider: str, artifact_root: Path | None,
    approval_root: Path | None, field: str,
) -> None:
    admission, _ = _bound_json(
        entry["admission"]["pointer"], entry["admission"]["digest"], artifact_root, field,
    )
    admission = _exact(admission, {
        "schema_version", "contract", "decision", "preference_id",
        "normalized_text_digest", "provider_stores", "lifecycle_owner",
        "expires_at", "approval_evidence_pointer", "approval_evidence_digest",
    }, field)
    if (
        admission["schema_version"] != 1
        or admission["contract"] != "private-memory-admission"
        or admission["decision"] != "admit-cross-project-preference"
        or admission["preference_id"] != entry["preference_id"]
        or admission["normalized_text_digest"] != entry["normalized_text_digest"]
        or not isinstance(admission["provider_stores"], list)
        or provider not in admission["provider_stores"]
        or not isinstance(admission["lifecycle_owner"], str)
        or not IDENTIFIER.fullmatch(admission["lifecycle_owner"])
    ):
        raise ContractError(f"{field} does not bind active preference admission")
    _not_expired(admission["expires_at"], f"{field}.expires_at")
    _validate_user_approval(
        admission["approval_evidence_pointer"], admission["approval_evidence_digest"],
        approval_root, operation="admit-cross-project-preference",
        preference_id=entry["preference_id"], preference_digest=entry["normalized_text_digest"],
        scope_digest=_value_digest({
            key: admission[key] for key in (
                "decision", "preference_id", "normalized_text_digest", "provider_stores",
                "lifecycle_owner", "expires_at",
            )
        }),
        field=f"{field}.approval_evidence",
    )


def _validate_supersession_binding(
    entry: dict[str, Any], entries: dict[str, dict[str, Any]], provider: str,
    artifact_root: Path | None, approval_root: Path | None, field: str,
) -> None:
    supersession = entry["supersession"]
    target_id = supersession["superseded_by"]
    if target_id == entry["preference_id"]:
        raise ContractError(f"{field} cannot supersede itself")
    target = entries.get(target_id)
    if target is None or target["record_kind"] != "preference" or target["status"] != "active":
        raise ContractError(f"{field}.superseded_by must name an active target preference")
    adjudication, _ = _bound_json(
        supersession["adjudication_pointer"], supersession["adjudication_digest"],
        artifact_root, f"{field}.adjudication",
    )
    adjudication = _exact(adjudication, {
        "schema_version", "contract", "decision", "reducer",
        "source_preferences", "target_preference",
    }, f"{field}.adjudication")
    if (
        adjudication["schema_version"] != 1
        or adjudication["contract"] != "private-memory-adjudication"
        or adjudication["decision"] != supersession["decision"]
        or adjudication["reducer"] != supersession["reducer"]
    ):
        raise ContractError(f"{field}.adjudication identity does not match supersession")
    sources = adjudication["source_preferences"]
    expected_source = {"preference_id": entry["preference_id"], "digest": entry["normalized_text_digest"]}
    if not isinstance(sources, list) or expected_source not in sources:
        raise ContractError(f"{field}.adjudication does not bind the source preference")
    target_binding = _exact(
        adjudication["target_preference"], {"preference_id", "digest"},
        f"{field}.adjudication.target_preference",
    )
    if target_binding != {"preference_id": target_id, "digest": target["normalized_text_digest"]}:
        raise ContractError(f"{field}.adjudication does not bind the target preference")
    authority, _ = _bound_json(
        supersession["write_authority_pointer"], supersession["write_authority_digest"],
        artifact_root, f"{field}.write_authority",
    )
    authority = _exact(authority, {
        "schema_version", "contract", "lifecycle_owner", "provider_stores",
        "allowed_operations", "allowed_preference_ids", "allowed_paths",
        "approved_by", "expires_at", "approval_evidence_pointer",
        "approval_evidence_digest",
    }, f"{field}.write_authority")
    if (
        authority["schema_version"] != 1
        or authority["contract"] != "private-memory-write-authority"
        or authority["approved_by"] != "user"
        or authority["lifecycle_owner"] != supersession["applied_by"]
        or not isinstance(authority["provider_stores"], list)
        or provider not in authority["provider_stores"]
        or not isinstance(authority["allowed_operations"], list)
        or "active-index-supersede" not in authority["allowed_operations"]
        or not isinstance(authority["allowed_preference_ids"], list)
        or entry["preference_id"] not in authority["allowed_preference_ids"]
        or not isinstance(authority["allowed_paths"], list)
        or f"provider-memory:{provider}" not in authority["allowed_paths"]
    ):
        raise ContractError(f"{field}.write_authority does not grant this supersession")
    _not_expired(authority["expires_at"], f"{field}.write_authority.expires_at")
    _validate_user_approval(
        authority["approval_evidence_pointer"], authority["approval_evidence_digest"],
        approval_root, operation="active-index-supersede",
        preference_id=entry["preference_id"], preference_digest=entry["normalized_text_digest"],
        scope_digest=_value_digest({
            "authority": {
                key: authority[key] for key in (
                    "lifecycle_owner", "provider_stores", "allowed_operations",
                    "allowed_preference_ids", "allowed_paths", "expires_at",
                )
            },
            "decision": supersession["decision"],
            "reducer": supersession["reducer"],
            "source_preference_id": entry["preference_id"],
            "source_digest": entry["normalized_text_digest"],
            "target_preference_id": target_id,
            "target_digest": target["normalized_text_digest"],
        }),
        field=f"{field}.write_authority.approval_evidence",
    )


def validate_projection(
    value: Any, *, artifact_root: Path | None = None, approval_root: Path | None = None,
) -> dict[str, Any]:
    projection = _exact(value, {"schema_version", "contract", "provider_store", "entries"}, "projection")
    if projection["schema_version"] != 1 or projection["contract"] != "private-memory-projection":
        raise ContractError("unsupported private-memory projection contract")
    if any(isinstance(item, dict) and item.get("record_kind") == "preference" for item in projection.get("entries", [])):
        _separate_approval_root(artifact_root, approval_root)
    _text(projection["provider_store"], "projection.provider_store")
    if not isinstance(projection["entries"], list):
        raise ContractError("projection.entries must be a list")
    active_ids: set[str] = set()
    active_digests: set[str] = set()
    entries: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(projection["entries"]):
        entry = _entry(raw, index)
        if entry["preference_id"] in entries:
            raise ContractError("duplicate active preference_id" if entry["status"] == "active" else "duplicate preference_id")
        entries[entry["preference_id"]] = entry
        if entry["status"] != "active":
            continue
        if entry["preference_id"] in active_ids:
            raise ContractError("duplicate active preference_id")
        if entry["normalized_text_digest"] in active_digests:
            raise ContractError("duplicate active normalized_text_digest")
        active_ids.add(entry["preference_id"])
        active_digests.add(entry["normalized_text_digest"])
    for index, entry in enumerate(entries.values()):
        if entry["record_kind"] == "preference" and entry["status"] == "active":
            _validate_admission(
                entry, projection["provider_store"], artifact_root, approval_root,
                f"entries[{index}].admission",
            )
        if entry["record_kind"] == "preference" and entry["status"] == "superseded":
            _validate_supersession_binding(
                entry, entries, projection["provider_store"], artifact_root, approval_root,
                f"entries[{index}].supersession",
            )
    return {"schema_version": 1, "status": "pass", "entries": len(projection["entries"])}


def validate_projection_set(
    values: list[Any], *, artifact_root: Path | None = None, approval_root: Path | None = None,
) -> dict[str, Any]:
    identities: dict[str, str] = {}
    digest_identities: dict[str, str] = {}
    providers: set[str] = set()
    for projection in values:
        validate_projection(projection, artifact_root=artifact_root, approval_root=approval_root)
        provider = projection["provider_store"]
        if provider in providers:
            raise ContractError("provider_store must be unique in a projection set")
        providers.add(provider)
        for entry in projection["entries"]:
            if entry["record_kind"] != "preference":
                continue
            existing = identities.setdefault(entry["preference_id"], entry["normalized_text_digest"])
            if existing != entry["normalized_text_digest"]:
                raise ContractError("provider projections disagree on a preference digest")
            digest_identity = digest_identities.setdefault(entry["normalized_text_digest"], entry["preference_id"])
            if digest_identity != entry["preference_id"]:
                raise ContractError("same digest uses different preference IDs across provider projections")
    return {"schema_version": 1, "status": "pass", "providers": len(providers)}


def resolve_owner_pointer(entry: Any, current_owner_digest: str) -> dict[str, Any]:
    checked = _entry(entry, 0)
    if checked["record_kind"] != "owner-pointer":
        raise ContractError("owner resolution requires an owner-pointer")
    _sha(current_owner_digest, "current_owner_digest")
    status = "current" if checked["canonical_owner"]["digest"] == current_owner_digest else "stale-owner-pointer"
    return {"schema_version": 1, "status": status, "authority": "canonical-owner"}


def validate_merge_proposal(value: Any, *, artifact_root: Path | None = None) -> dict[str, Any]:
    proposal = _exact(value, {
        "schema_version", "contract", "proposal_id", "source_preferences",
        "proposed_normalized_text", "proposed_normalized_text_digest", "evidence", "status",
    }, "merge proposal")
    if proposal["schema_version"] != 1 or proposal["contract"] != "private-memory-merge-proposal":
        raise ContractError("unsupported private-memory merge proposal")
    _text(proposal["proposal_id"], "merge proposal.proposal_id")
    if proposal["status"] != "pending-reducer":
        raise ContractError("merge proposals must remain pending-reducer")
    text = _text(proposal["proposed_normalized_text"], "merge proposal.proposed_normalized_text")
    if _digest(text) != proposal["proposed_normalized_text_digest"]:
        raise ContractError("merge proposal digest does not match normalized text")
    for field_name in ("source_preferences", "evidence"):
        rows = proposal[field_name]
        if not isinstance(rows, list) or not rows:
            raise ContractError(f"merge proposal.{field_name} must be non-empty")
        keys = {"preference_id", "digest"} if field_name == "source_preferences" else {"pointer", "digest"}
        for index, raw in enumerate(rows):
            row = _exact(raw, keys, f"merge proposal.{field_name}[{index}]")
            _sha(row["digest"], f"merge proposal.{field_name}[{index}].digest")
            _text(row["preference_id" if field_name == "source_preferences" else "pointer"], f"merge proposal.{field_name}[{index}]")
    return {"schema_version": 1, "status": "pass"}


def _promotion_decision(value: dict[str, Any], input_path: Path) -> dict[str, Any]:
    script = Path(__file__).resolve().parents[2] / "skill-craft" / "scripts" / "promotion_readiness.py"
    spec = importlib.util.spec_from_file_location("private_memory_promotion_readiness", script)
    if spec is None or spec.loader is None:
        raise ContractError("promotion readiness validator is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        return module.decide(value, input_path.parent)
    except (OSError, ValueError) as exc:
        raise ContractError(f"promotion readiness is invalid: {exc}") from exc


def validate_promotion_manifest(value: Any, *, artifact_root: Path | None = None) -> dict[str, Any]:
    manifest = _exact(value, {"schema_version", "contract", "rows"}, "promotion manifest")
    if manifest["schema_version"] != 1 or manifest["contract"] != "private-memory-promotion-manifest":
        raise ContractError("unsupported private-memory promotion manifest")
    if not isinstance(manifest["rows"], list):
        raise ContractError("promotion manifest.rows must be a list")
    for index, raw in enumerate(manifest["rows"]):
        field = f"promotion manifest.rows[{index}]"
        row = _exact(raw, {
            "candidate_id", "source_pointer", "normalized_text_digest", "sensitivity",
            "target_owner", "status", "evidence_pointers", "next_user_gate",
            "promotion_readiness_receipt", "target_revision",
        }, field)
        _pointer(row["candidate_id"], f"{field}.candidate_id")
        _pointer(row["source_pointer"], f"{field}.source_pointer")
        _sha(row["normalized_text_digest"], f"{field}.normalized_text_digest")
        if row["sensitivity"] not in {"ordinary", "sensitive", "restricted"}:
            raise ContractError(f"{field}.sensitivity is invalid")
        if row["status"] not in {"staged", "pending-owner", "pending-user-gate", "blocked"}:
            raise ContractError(f"{field}.status is invalid")
        owner = _exact(row["target_owner"], {"kind", "pointer"}, f"{field}.target_owner")
        if owner["kind"] not in {"project", "global-skill", "harness", "runbook", "adr", "tracker"}:
            raise ContractError(f"{field}.target_owner.kind is invalid")
        _pointer(owner["pointer"], f"{field}.target_owner.pointer")
        gate = _exact(row["next_user_gate"], {"kind", "owner", "status"}, f"{field}.next_user_gate")
        if gate["kind"] not in {"user-approval", "owner-creation", "live-verification"}:
            raise ContractError(f"{field}.next_user_gate.kind is invalid")
        if gate["status"] != "pending":
            raise ContractError(f"{field}.next_user_gate.status must be pending")
        if not isinstance(gate["owner"], str) or not IDENTIFIER.fullmatch(gate["owner"]):
            raise ContractError(f"{field}.next_user_gate.owner is invalid")
        if not isinstance(row["evidence_pointers"], list):
            raise ContractError(f"{field}.evidence_pointers must be a list")
        for evidence_index, raw_evidence in enumerate(row["evidence_pointers"]):
            evidence = _exact(raw_evidence, {"project_id", "pointer", "digest"}, f"{field}.evidence_pointers[{evidence_index}]")
            if not isinstance(evidence["project_id"], str) or not IDENTIFIER.fullmatch(evidence["project_id"]):
                raise ContractError(f"{field}.evidence_pointers[{evidence_index}].project_id is invalid")
            _pointer(evidence["pointer"], f"{field}.evidence_pointers[{evidence_index}].pointer")
            _sha(evidence["digest"], f"{field}.evidence_pointers[{evidence_index}].digest")
        readiness = row["promotion_readiness_receipt"]
        if owner["kind"] == "global-skill":
            if readiness is None:
                raise ContractError(f"{field}: global-skill target requires a promotion-readiness receipt")
            receipt = _exact(readiness, {"pointer", "digest"}, f"{field}.promotion_readiness_receipt")
            binding, _ = _bound_json(
                receipt["pointer"], receipt["digest"], artifact_root,
                f"{field}.promotion_readiness_receipt",
            )
            binding = _exact(binding, {
                "schema_version", "contract", "source_pointer", "normalized_text_digest",
                "target_revision", "evidence_pointers", "readiness_input_pointer",
                "readiness_input_digest",
            }, f"{field}.promotion_readiness_receipt")
            if (
                binding["schema_version"] != 1
                or binding["contract"] != "private-memory-promotion-binding"
                or binding["source_pointer"] != row["source_pointer"]
                or binding["normalized_text_digest"] != row["normalized_text_digest"]
                or binding["target_revision"] != row["target_revision"]
                or binding["evidence_pointers"] != row["evidence_pointers"]
            ):
                raise ContractError(f"{field}: promotion binding does not match the manifest row")
            readiness_value, readiness_path = _bound_json(
                binding["readiness_input_pointer"], binding["readiness_input_digest"],
                artifact_root, f"{field}.promotion_readiness_input",
            )
            expected_evidence = [
                {
                    "project_id": item["project_id"],
                    "pointer": item["artifact"]["path"],
                    "digest": item["artifact"]["sha256"],
                }
                for item in readiness_value.get("project_evidence", [])
                if isinstance(item, dict) and isinstance(item.get("artifact"), dict)
            ]
            if expected_evidence != row["evidence_pointers"]:
                raise ContractError(f"{field}: promotion evidence does not match readiness input")
            decision = _promotion_decision(readiness_value, readiness_path)
            if row["target_revision"] != readiness_value.get("candidate_commit"):
                raise ContractError(f"{field}: promotion readiness does not bind target_revision")
            if decision.get("decision") != "evidence-ready-for-human-review" or decision.get("proven_project_count", 0) < 2:
                raise ContractError(f"{field}: global-skill target requires the two-project evidence bar")
        elif readiness is not None or row["target_revision"] is not None:
            raise ContractError(f"{field}: promotion-readiness receipt is only for global skills")
    return {"schema_version": 1, "status": "pass", "rows": len(manifest["rows"])}


def validate_projection_bundle(
    value: Any, *, artifact_root: Path | None = None, owner_root: Path | None = None,
    approval_root: Path | None = None,
) -> dict[str, Any]:
    bundle = _exact(
        value, {"schema_version", "contract", "projections", "current_owners"},
        "projection set",
    )
    if bundle["schema_version"] != 1 or bundle["contract"] != "private-memory-projection-set":
        raise ContractError("unsupported private-memory projection-set contract")
    if not isinstance(bundle["projections"], list):
        raise ContractError("projection set.projections must be a list")
    if not isinstance(bundle["current_owners"], list):
        raise ContractError("projection set.current_owners must be a list")
    current: dict[str, str] = {}
    for index, raw in enumerate(bundle["current_owners"]):
        row = _exact(raw, {"pointer", "digest"}, f"projection set.current_owners[{index}]")
        pointer = _pointer(row["pointer"], f"projection set.current_owners[{index}].pointer")
        digest = _sha(row["digest"], f"projection set.current_owners[{index}].digest")
        if pointer in current:
            raise ContractError("duplicate current owner pointer")
        current[pointer] = digest
    result = validate_projection_set(
        bundle["projections"], artifact_root=artifact_root, approval_root=approval_root,
    )
    for projection in bundle["projections"]:
        for entry in projection["entries"]:
            if entry["record_kind"] != "owner-pointer":
                continue
            owner = entry["canonical_owner"]
            if current.get(owner["pointer"]) != owner["digest"]:
                raise ContractError("stale owner pointer in projection set")
            if owner_root is None:
                raise ContractError("owner-pointer validation requires workspace root")
            path = Path(owner["pointer"])
            root = owner_root.resolve()
            target = (root / path).resolve()
            if path.is_absolute() or ".." in path.parts or not target.is_file():
                raise ContractError("owner pointer must resolve to a live workspace file")
            try:
                target.relative_to(root)
            except ValueError as exc:
                raise ContractError("owner pointer escapes workspace root") from exc
            actual = "sha256:" + hashlib.sha256(target.read_bytes()).hexdigest()
            if actual != owner["digest"]:
                raise ContractError("stale owner pointer does not match live owner bytes")
    return {**result, "current_owners": len(current)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--workspace-root", type=Path)
    parser.add_argument("--approval-root", type=Path)
    args = parser.parse_args(argv)
    try:
        value = json.loads(args.artifact.read_text())
        contract = value.get("contract") if isinstance(value, dict) else None
        validator = {
            "private-memory-projection": validate_projection,
            "private-memory-projection-set": validate_projection_bundle,
            "private-memory-merge-proposal": validate_merge_proposal,
            "private-memory-promotion-manifest": validate_promotion_manifest,
        }.get(contract)
        if validator is None:
            raise ContractError("unknown private-memory contract")
        kwargs = {"artifact_root": args.artifact.resolve().parent}
        if contract in {"private-memory-projection", "private-memory-projection-set"}:
            kwargs["approval_root"] = args.approval_root
        if contract == "private-memory-projection-set":
            kwargs["owner_root"] = args.workspace_root
        print(json.dumps(validator(value, **kwargs), sort_keys=True))
        return 0
    except (OSError, json.JSONDecodeError, ContractError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
