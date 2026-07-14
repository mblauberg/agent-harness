#!/usr/bin/env python3
"""Focused text oracles for CAPA-001 normative spec repairs."""

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


def load_family_text(root: Path, family: str) -> str:
    """Read the still-authoritative monolithic draft for this repair lane."""
    return (root / "docs" / "specs" / f"{family}.md").read_text()


SPEC_01 = load_family_text(ROOT, "01-agent-fabric")
SPEC_04 = load_family_text(ROOT, "04-agent-fabric-operational-hardening")


def ddl_block(text: str, table: str) -> str:
    start = text.index(f"\n{table}(") + 1
    end = text.index("\n)\n", start) + 3
    return text[start:end]


class SpecRepairTests(unittest.TestCase):
    def test_review_reservation_binds_same_prepare_effect_then_apply(self) -> None:
        reservation = ddl_block(
            SPEC_04, "lifecycle_review_adoption_reservations"
        )
        batch = ddl_block(SPEC_04, "lifecycle_receipt_batches")
        binding = ddl_block(SPEC_04, "lifecycle_review_authority_bindings")

        self.assertIn("decision_loss_effect_key NOT NULL", reservation)
        self.assertNotIn(
            "FOREIGN KEY(project_session_id,run_id,agent_id,decision_loss_after_id",
            reservation,
        )
        self.assertIn("review_decision_loss_effect_key NOT NULL", batch)
        self.assertIn(
            "REFERENCES lifecycle_receipt_generation_loss_effects(\n"
            "      batch_id,role,effect_digest,project_session_id,run_id,agent_id,",
            batch,
        )
        self.assertIn(
            "final_source_ref_digest)\n    DEFERRABLE INITIALLY DEFERRED",
            batch,
        )
        self.assertIn("decision_loss_effect_key NOT NULL", binding)
        self.assertIn(
            "review_decision_loss_effect_role,review_decision_loss_effect_digest,",
            binding,
        )
        self.assertIn(
            "REFERENCES lifecycle_transition_applies(apply_id,receipt_batch_id)\n"
            "    DEFERRABLE INITIALLY DEFERRED",
            binding,
        )

    def test_capability_snapshot_source_is_closed_in_persistence(self) -> None:
        block = ddl_block(SPEC_04, "adapter_capability_snapshots")
        self.assertIn("host_id, host_version, source NOT NULL", block)
        self.assertIn(
            "CHECK(source IN ('runtime-discovery','version-pinned-conformance',\n"
            "    'unavailable'))",
            block,
        )
        self.assertIn(
            "capability_kind GENERATED ALWAYS AS\n"
            "    (json_extract(snapshot_json, '$.capabilities.kind')) STORED NOT NULL",
            block,
        )
        self.assertIn(
            "(source='unavailable' AND capability_kind='unavailable')",
            block,
        )

    def test_route_children_bind_the_exact_admission(self) -> None:
        route = ddl_block(SPEC_04, "provider_action_routes")
        dispatch = ddl_block(SPEC_04, "provider_action_route_dispatches")
        observation = ddl_block(SPEC_04, "provider_action_route_observations")
        self.assertIn(
            "UNIQUE(adapter_id, action_id, deployed_route_admission_digest)",
            route,
        )
        self.assertIn(
            "UNIQUE(adapter_id, action_id, deployed_route_admission_digest,\n"
            "    capability_body_digest, effective_configuration_id",
            route,
        )
        self.assertIn("discovery_surface_digest", dispatch)
        self.assertIn(
            "FOREIGN KEY(adapter_id, action_id, admission_digest,\n"
            "      capability_body_digest, effective_configuration_id",
            dispatch,
        )
        self.assertIn(
            "REFERENCES provider_action_routes(\n"
            "      adapter_id, action_id, deployed_route_admission_digest,",
            dispatch,
        )
        self.assertIn(
            "FOREIGN KEY(adapter_id, action_id, admission_digest)",
            observation,
        )

    def test_route_admission_inserts_parents_before_route(self) -> None:
        section_start = SPEC_04.index("Admission and dispatch use this order:")
        section_end = SPEC_04.index("Topology waves use one append-only store", section_start)
        section = SPEC_04[section_start:section_end]
        self.assertIn(
            "insert the admitted compilation receipt; insert or attach every "
            "authority/budget reservation parent; insert the canonical provider "
            "action with its receipt foreign key; insert its route last",
            " ".join(section.split()),
        )
        self.assertIn(
            "insert the preflight finding-capacity reservation before router "
            "I/O",
            " ".join(section.split()),
        )

    def test_rotation_clears_current_pressure_before_binding_change(self) -> None:
        section = " ".join(SPEC_04.split())
        self.assertIn("`BEGIN IMMEDIATE` adoption transaction", section)
        self.assertIn(
            "provider generation, context revision, evidence digest and "
            "projection revision",
            section,
        )
        self.assertIn("compare-and-deletes that exact row", section)
        self.assertIn(
            "binding UPDATE or DELETE aborts while any current pressure row "
            "remains",
            section,
        )

    def test_effective_configuration_parent_is_same_adapter_activation(self) -> None:
        block = ddl_block(SPEC_04, "adapter_effective_configurations")
        self.assertIn("activation_configuration_subject_kind", block)
        self.assertIn(
            "UNIQUE(adapter_id, subject_kind, configuration_id,\n"
            "    configuration_revision, configuration_digest)",
            block,
        )
        self.assertIn(
            "FOREIGN KEY(adapter_id, activation_configuration_subject_kind,\n"
            "      activation_configuration_id, activation_configuration_revision,\n"
            "      activation_configuration_digest, host_identity_digest,\n"
            "      executable_identity_digest, capability_body_digest,\n"
            "      native_settings_schema_digest)",
            block,
        )
        self.assertIn(
            "activation_configuration_subject_kind='activation'",
            block,
        )

    def test_lifecycle_heads_use_nonnullable_canonical_parent_keys(self) -> None:
        scope = ddl_block(SPEC_04, "lifecycle_receipt_scope_heads")
        self.assertNotIn("receipt_count", scope)
        self.assertNotIn("head_receipt_digest", scope)
        self.assertIn("checkpoint_digest NOT NULL", scope)
        self.assertIn(
            "FOREIGN KEY(project_session_id,run_id,checkpoint_digest)",
            scope,
        )

        loss_revision = ddl_block(
            SPEC_04, "lifecycle_generation_loss_revisions"
        )
        loss_head = ddl_block(SPEC_04, "lifecycle_generation_loss_heads")
        self.assertIn(
            "UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,"
            "revision,\n    state,abandon_kind_code,semantic_digest,"
            "source_ref_digest,journal_digest)",
            loss_revision,
        )
        self.assertNotIn("recovery_action_adapter_id", loss_head)
        self.assertNotIn("active_recovery_custody_id", loss_head)
        self.assertIn(
            "current_revision,state,abandon_kind_code,semantic_digest,",
            loss_head,
        )
        self.assertIn("head_revision NOT NULL CHECK(head_revision >= 1)", loss_head)

        custody = ddl_block(SPEC_04, "lifecycle_rotation_custody_heads")
        self.assertIn("disposition_code NOT NULL", custody)
        self.assertIn("head_revision NOT NULL CHECK(head_revision >= 1)", custody)
        self.assertIn(
            "CHECK((state='finalized')=(disposition_code<>'none'))",
            custody,
        )

    def test_review_evidence_and_slot_head_are_relationally_closed(self) -> None:
        actual = ddl_block(
            SPEC_04, "provider_action_actual_route_identities"
        )
        evidence = ddl_block(SPEC_04, "provider_review_evidence")
        head = ddl_block(SPEC_04, "review_slot_heads")

        self.assertIn(
            "FOREIGN KEY(adapter_id,action_id,admission_digest,"
            "observation_digest)",
            actual,
        )
        self.assertIn(
            "CHECK(actual_route_identity_digest IS NULL OR\n"
            "    route_observation_digest IS NOT NULL)",
            evidence,
        )
        self.assertIn(
            "FOREIGN KEY(action_adapter_id,action_id,route_admission_digest,\n"
            "      route_observation_digest,actual_route_identity_digest)",
            evidence,
        )
        self.assertIn(
            "CHECK((head_generation=0 AND head_evidence_id IS NULL) OR",
            head,
        )
        self.assertIn(
            "FOREIGN KEY(run_id,target_generation,slot,head_generation,\n"
            "      head_evidence_id)",
            head,
        )

    def test_recovery_issue_source_head_closes_both_race_orders(self) -> None:
        source_head = ddl_block(
            SPEC_04, "agent_lifecycle_recovery_source_heads"
        )
        handoff = ddl_block(SPEC_04, "lifecycle_fresh_recovery_handoffs")
        self.assertNotIn("issued_at", source_head)
        self.assertNotIn("expires_at", source_head)
        self.assertIn("issue_id NOT NULL UNIQUE", source_head)
        self.assertIn(
            "FOREIGN KEY(issue_id)\n"
            "    REFERENCES agent_lifecycle_recovery_source_heads(issue_id)",
            handoff,
        )
        self.assertIn("LIFECYCLE_RECOVERY_SOURCE_BUSY", SPEC_04)
        self.assertIn("LIFECYCLE_RECOVERY_ISSUE_REVOKED", SPEC_04)
        self.assertIn("LIFECYCLE_RECOVERY_ISSUE_COMMIT_PENDING", SPEC_04)
        self.assertIn(
            "Every issue, handoff and revocation writer uses "
            "`BEGIN IMMEDIATE`",
            " ".join(SPEC_04.split()),
        )
        self.assertIn(
            "new issue's canonical `(issued_at,issue_id)` tuple must be "
            "strictly greater",
            " ".join(SPEC_04.split()),
        )

    def test_retirement_evidence_tuple_is_carried_end_to_end(self) -> None:
        plan = ddl_block(SPEC_04, "lifecycle_recovery_retirement_plans")
        effect = ddl_block(
            SPEC_04, "lifecycle_receipt_recovery_retirement_effects"
        )
        result = ddl_block(SPEC_04, "agent_lifecycle_recovery_retirements")
        evidence = (
            "finalized_terminal_evidence_digest",
            "admission_digest",
            "transition_proof_digest",
            "mutation_plan_digest",
            "retirement_evidence_digest",
        )
        for column in evidence:
            self.assertIn(column, plan)
            self.assertIn(column, effect)
            self.assertIn(column, result)
        retirement_subject = SPEC_01[
            SPEC_01.index("lifecycleCustodyRecoveryRetirementReceiptSubjectV1:") :
            SPEC_01.index("lifecycleReviewDecisionReceiptSubjectV1:")
        ]
        self.assertIn("transitionProofDigest: exact-digest", retirement_subject)
        self.assertIn("mutationPlanDigest: exact-digest", retirement_subject)

    def test_generic_route_integrity_has_a_separate_named_owner(self) -> None:
        start = SPEC_01.index("### 32.22 Exact Console read identity completion")
        section = SPEC_01[start:]
        self.assertIn(
            "`GenericProviderRouteRecoveryService` is the sole owner for an "
            "otherwise-generic task-bound answer-bearing action whose route is "
            "missing or integrity-failed",
            " ".join(section.split()),
        )
        self.assertNotIn(
            "`ProviderRouteIntegrityRecoveryService` is also the sole owner for "
            "a generic task-bound answer-bearing action",
            " ".join(section.split()),
        )

    def test_new_route_sections_have_unique_requirement_anchors(self) -> None:
        expected = [
            *(f"FR-{number:03d}" for number in range(77, 96)),
            *(f"NFR-{number:03d}" for number in range(34, 43)),
            *(f"AC-{number:03d}" for number in range(56, 71)),
        ]
        for requirement_id in expected:
            with self.subTest(requirement_id=requirement_id):
                self.assertEqual(SPEC_01.count(f"**{requirement_id}:**"), 1)

    def test_authority_profiles_are_closed_inert_and_never_downgrade(self) -> None:
        spec_03 = (ROOT / "docs/specs/03-agent-fabric-activation.md").read_text()
        section = SPEC_01[SPEC_01.index(
            "## 33. Capability-compiled execution authority"
        ) :]
        flattened = " ".join(section.split())
        self.assertIn(
            "initial closed enum is exactly `review-readonly | "
            "workspace-write-offline`",
            flattened,
        )
        self.assertIn("There is no implicit fallback", flattened)
        self.assertIn("`network.toolEgress:none`", flattened)
        self.assertIn("`workspace-write-offline` is defined but inert", flattened)
        self.assertIn("before provider I/O", flattened)
        self.assertIn(
            "Activation recognises only `review-readonly` and the currently "
            "inert `workspace-write-offline`",
            " ".join(spec_03.split()),
        )


if __name__ == "__main__":
    unittest.main()
