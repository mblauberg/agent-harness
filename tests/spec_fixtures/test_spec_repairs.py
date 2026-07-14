#!/usr/bin/env python3
"""Focused text oracles for CAPA-001 normative spec repairs."""

from pathlib import Path
import sqlite3
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


def trigger_sql(text: str, name: str) -> str:
    start = text.index(f"CREATE TRIGGER {name}\n")
    end = text.index("\nEND;", start) + len("\nEND;")
    return text[start:end]


TRIGGER_FIXTURE_SCHEMA = r"""
CREATE TABLE lifecycle_receipt_batch_completions(
  batch_id TEXT, transition_kind TEXT,
  primary_custody_effect_digest TEXT,
  primary_loss_effect_role TEXT, primary_loss_effect_digest TEXT,
  primary_retirement_effect_digest TEXT,
  linked_loss_effect_role TEXT, linked_loss_effect_digest TEXT
);
CREATE TABLE lifecycle_receipt_custody_effects(
  batch_id TEXT, effect_digest TEXT, project_session_id TEXT, run_id TEXT,
  agent_id TEXT, custody_id TEXT, final_revision INTEGER,
  final_semantic_digest TEXT, final_source_ref_digest TEXT
);
CREATE TABLE lifecycle_receipt_generation_loss_effects(
  batch_id TEXT, role TEXT, effect_digest TEXT, project_session_id TEXT,
  run_id TEXT, agent_id TEXT, generation_loss_id TEXT,
  final_revision INTEGER, final_semantic_digest TEXT,
  final_source_ref_digest TEXT
);
CREATE TABLE lifecycle_receipt_recovery_retirement_effects(
  batch_id TEXT, effect_digest TEXT, retirement_id TEXT
);
CREATE TABLE lifecycle_transition_applies(
  apply_id TEXT, apply_digest TEXT, apply_kind TEXT,
  batch_transition_kind TEXT, receipt_batch_id TEXT,
  fresh_generation_loss_after_key TEXT,
  fresh_project_session_id TEXT, fresh_run_id TEXT, fresh_agent_id TEXT,
  fresh_generation_loss_id TEXT, fresh_generation_loss_after_revision INTEGER,
  fresh_generation_loss_after_semantic_digest TEXT,
  fresh_generation_loss_after_source_ref_digest TEXT,
  fresh_handoff_id TEXT, fresh_source_mode TEXT, new_custody_id TEXT,
  new_custody_semantic_digest TEXT, new_custody_source_ref_digest TEXT
);
CREATE TABLE lifecycle_rotation_custody_revisions(
  project_session_id TEXT, run_id TEXT, agent_id TEXT, custody_id TEXT,
  revision INTEGER, semantic_digest TEXT, source_ref_digest TEXT,
  journal_digest TEXT, receipt_batch_id TEXT, receipt_apply_id TEXT,
  receipt_apply_digest TEXT, origin_fresh_apply_id TEXT,
  origin_fresh_apply_digest TEXT
);
CREATE TABLE lifecycle_rotation_custody_heads(
  project_session_id TEXT, run_id TEXT, agent_id TEXT, custody_id TEXT,
  current_revision INTEGER, semantic_digest TEXT, source_ref_digest TEXT,
  journal_digest TEXT
);
CREATE TABLE lifecycle_generation_loss_revisions(
  project_session_id TEXT, run_id TEXT, agent_id TEXT, generation_loss_id TEXT,
  revision INTEGER, semantic_digest TEXT, source_ref_digest TEXT,
  journal_digest TEXT, receipt_batch_id TEXT, receipt_apply_id TEXT,
  receipt_apply_digest TEXT, origin_fresh_apply_id TEXT,
  origin_fresh_apply_digest TEXT
);
CREATE TABLE lifecycle_generation_loss_heads(
  project_session_id TEXT, run_id TEXT, agent_id TEXT, generation_loss_id TEXT,
  current_revision INTEGER, semantic_digest TEXT, source_ref_digest TEXT,
  journal_digest TEXT
);
CREATE TABLE lifecycle_receipt_batches(
  batch_id TEXT, review_adoption_reservation_id TEXT,
  review_adoption_reservation_digest TEXT
);
CREATE TABLE lifecycle_review_authority_bindings(
  batch_id TEXT, apply_id TEXT, review_reservation_digest TEXT
);
CREATE TABLE agent_lifecycle_recovery_retirements(
  retirement_id TEXT, receipt_batch_id TEXT, receipt_apply_id TEXT,
  receipt_apply_digest TEXT, retirement_effect_digest TEXT
);
CREATE TABLE lifecycle_fresh_rotation_commits(
  handoff_id TEXT, apply_id TEXT, fresh_apply_digest TEXT,
  new_custody_id TEXT, generation_loss_after_id TEXT,
  generation_loss_after_revision INTEGER,
  generation_loss_after_semantic_digest TEXT,
  generation_loss_after_source_ref_digest TEXT
);
"""


def trigger_database() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.executescript(TRIGGER_FIXTURE_SCHEMA)
    for name in (
        "lifecycle_completion_effect_set_exact",
        "lifecycle_custody_effect_set_closed",
        "lifecycle_loss_effect_set_closed",
        "lifecycle_retirement_effect_set_closed",
        "lifecycle_apply_post_state_complete",
    ):
        db.executescript(trigger_sql(SPEC_04, name))
    return db


class SpecRepairTests(unittest.TestCase):
    def test_transition_apply_copies_batch_arm_with_nonnull_sentinels(self) -> None:
        batch = ddl_block(SPEC_04, "lifecycle_receipt_batches")
        apply = ddl_block(SPEC_04, "lifecycle_transition_applies")
        handoff = ddl_block(SPEC_04, "lifecycle_fresh_recovery_handoffs")
        commit = ddl_block(SPEC_04, "lifecycle_fresh_rotation_commits")

        self.assertIn("planned_apply_kind NOT NULL", batch)
        self.assertIn("fresh_handoff_key NOT NULL", batch)
        self.assertIn("batch_transition_kind NOT NULL", apply)
        self.assertIn("fresh_handoff_key NOT NULL", apply)
        self.assertIn("fresh_generation_loss_after_key NOT NULL", apply)
        self.assertIn("affected_generation_loss_after_key NOT NULL", handoff)
        self.assertIn("generation_loss_after_key NOT NULL", commit)
        self.assertIn(
            "FOREIGN KEY(receipt_batch_id,apply_id,batch_transition_kind,"
            "apply_kind,",
            apply,
        )
        terminal_fresh = apply[
            apply.index("(apply_kind='terminal-fresh'") :
            apply.index("(apply_kind='fresh'")
        ]
        self.assertNotIn(
            "applied_mutation_plan_digest=fresh_apply_plan_digest",
            terminal_fresh,
        )

    def test_intents_bind_exact_typed_effect_and_completion_closes_set(self) -> None:
        custody = ddl_block(SPEC_04, "lifecycle_receipt_custody_effects")
        loss = ddl_block(SPEC_04, "lifecycle_receipt_generation_loss_effects")
        retirement = ddl_block(
            SPEC_04, "lifecycle_receipt_recovery_retirement_effects"
        )
        intents = ddl_block(SPEC_04, "lifecycle_receipt_intents")

        self.assertIn("UNIQUE(batch_id,effect_digest,project_session_id", custody)
        self.assertIn(
            "UNIQUE(batch_id,role,effect_digest,project_session_id", loss
        )
        self.assertIn(
            "UNIQUE(batch_id,effect_digest,project_session_id", retirement
        )
        self.assertIn("custody_effect_digest", intents)
        self.assertIn("generation_loss_effect_role", intents)
        self.assertIn("recovery_retirement_effect_digest", intents)
        self.assertIn("subject_owner_kind='custody'", intents)
        self.assertIn("subject_owner_kind='generation-loss'", intents)
        self.assertIn("subject_owner_kind='recovery-retirement'", intents)
        completion = trigger_sql(
            SPEC_04, "lifecycle_completion_effect_set_exact"
        )
        self.assertIn("lifecycle-effect-set-incomplete", completion)
        for name in (
            "lifecycle_custody_effect_set_closed",
            "lifecycle_loss_effect_set_closed",
            "lifecycle_retirement_effect_set_closed",
        ):
            self.assertIn("lifecycle-effect-set-closed", trigger_sql(SPEC_04, name))

    def test_completion_triggers_accept_each_exact_effect_family(self) -> None:
        accepted = (
            (
                "custody",
                "INSERT INTO lifecycle_receipt_custody_effects "
                "(batch_id,effect_digest) VALUES "
                "('batch-custody','custody-effect')",
                "INSERT INTO lifecycle_receipt_batch_completions "
                "(batch_id,transition_kind,primary_custody_effect_digest) "
                "VALUES ('batch-custody','custody-terminal','custody-effect')",
            ),
            (
                "generation-loss",
                "INSERT INTO lifecycle_receipt_generation_loss_effects "
                "(batch_id,role,effect_digest) VALUES "
                "('batch-loss','primary','loss-effect')",
                "INSERT INTO lifecycle_receipt_batch_completions "
                "(batch_id,transition_kind,primary_loss_effect_role,"
                "primary_loss_effect_digest) VALUES "
                "('batch-loss','generation-loss-terminal','primary',"
                "'loss-effect')",
            ),
            (
                "retirement",
                "INSERT INTO lifecycle_receipt_recovery_retirement_effects "
                "(batch_id,effect_digest) VALUES "
                "('batch-retirement','retirement-effect')",
                "INSERT INTO lifecycle_receipt_batch_completions "
                "(batch_id,transition_kind,primary_retirement_effect_digest) "
                "VALUES ('batch-retirement','custody-recovery-retirement',"
                "'retirement-effect')",
            ),
        )
        for family, effect, completion in accepted:
            with self.subTest(effect_family=family):
                db = trigger_database()
                db.execute(effect)
                db.execute(completion)
                self.assertEqual(
                    1,
                    db.execute(
                        "SELECT count(*) FROM lifecycle_receipt_batch_completions"
                    ).fetchone()[0],
                )

    def test_completion_triggers_reject_missing_extra_and_late_effects(self) -> None:
        missing_effects = (
            (
                "custody",
                "INSERT INTO lifecycle_receipt_batch_completions "
                "(batch_id,transition_kind,primary_custody_effect_digest) "
                "VALUES ('batch-missing','custody-terminal','custody-effect')",
            ),
            (
                "loss",
                "INSERT INTO lifecycle_receipt_batch_completions "
                "(batch_id,transition_kind,primary_loss_effect_role,"
                "primary_loss_effect_digest) VALUES "
                "('batch-missing','generation-loss-terminal','primary',"
                "'loss-effect')",
            ),
            (
                "retirement",
                "INSERT INTO lifecycle_receipt_batch_completions "
                "(batch_id,transition_kind,primary_retirement_effect_digest) "
                "VALUES ('batch-missing','custody-recovery-retirement',"
                "'retirement-effect')",
            ),
        )
        for name, statement in missing_effects:
            with self.subTest(missing_effect=name):
                missing = trigger_database()
                with self.assertRaisesRegex(
                    sqlite3.IntegrityError, "lifecycle-effect-set-incomplete"
                ):
                    missing.execute(statement)

        extra = trigger_database()
        extra.execute(
            "INSERT INTO lifecycle_receipt_custody_effects "
            "(batch_id,effect_digest) VALUES ('batch-extra','custody-effect')"
        )
        extra.execute(
            "INSERT INTO lifecycle_receipt_generation_loss_effects "
            "(batch_id,role,effect_digest) "
            "VALUES ('batch-extra','linked','extra-loss')"
        )
        with self.assertRaisesRegex(
            sqlite3.IntegrityError, "lifecycle-effect-set-incomplete"
        ):
            extra.execute(
                "INSERT INTO lifecycle_receipt_batch_completions "
                "(batch_id,transition_kind,primary_custody_effect_digest) "
                "VALUES ('batch-extra','custody-terminal','custody-effect')"
            )

        late_inserts = (
            (
                "custody",
                "INSERT INTO lifecycle_receipt_custody_effects "
                "(batch_id,effect_digest) VALUES ('batch-closed','late')",
            ),
            (
                "loss",
                "INSERT INTO lifecycle_receipt_generation_loss_effects "
                "(batch_id,role,effect_digest) "
                "VALUES ('batch-closed','linked','late')",
            ),
            (
                "retirement",
                "INSERT INTO lifecycle_receipt_recovery_retirement_effects "
                "(batch_id,effect_digest) VALUES ('batch-closed','late')",
            ),
        )
        for name, statement in late_inserts:
            with self.subTest(effect_table=name):
                closed = trigger_database()
                closed.execute(
                    "INSERT INTO lifecycle_receipt_custody_effects "
                    "(batch_id,effect_digest) "
                    "VALUES ('batch-closed','custody-effect')"
                )
                closed.execute(
                    "INSERT INTO lifecycle_receipt_batch_completions "
                    "(batch_id,transition_kind,primary_custody_effect_digest) "
                    "VALUES ('batch-closed','custody-terminal','custody-effect')"
                )
                with self.assertRaisesRegex(
                    sqlite3.IntegrityError, "lifecycle-effect-set-closed"
                ):
                    closed.execute(statement)

    def _valid_apply_database(self) -> sqlite3.Connection:
        db = trigger_database()
        db.executescript(
            r"""
            INSERT INTO lifecycle_receipt_custody_effects
              (batch_id,effect_digest,project_session_id,run_id,agent_id,
               custody_id,final_revision,final_semantic_digest,
               final_source_ref_digest)
            VALUES
              ('batch-custody','effect-custody','p','r','a','custody-old',
               2,'sem-custody','src-custody');
            INSERT INTO lifecycle_receipt_batch_completions
              (batch_id,transition_kind,primary_custody_effect_digest)
            VALUES
              ('batch-custody','custody-terminal','effect-custody');
            INSERT INTO lifecycle_receipt_batches VALUES
              ('batch-custody',NULL,NULL);
            INSERT INTO lifecycle_rotation_custody_revisions VALUES
              ('p','r','a','custody-old',2,'sem-custody','src-custody',
               'journal-custody','batch-custody','apply-custody',
               'digest-custody',NULL,NULL);
            INSERT INTO lifecycle_rotation_custody_heads VALUES
              ('p','r','a','custody-old',2,'sem-custody','src-custody',
               'journal-custody');

            INSERT INTO lifecycle_receipt_generation_loss_effects
              (batch_id,role,effect_digest,project_session_id,run_id,agent_id,
               generation_loss_id,final_revision,final_semantic_digest,
               final_source_ref_digest)
            VALUES
              ('batch-loss','primary','effect-loss','p','r','a','loss-old',
               2,'sem-loss','src-loss');
            INSERT INTO lifecycle_receipt_batch_completions
              (batch_id,transition_kind,primary_loss_effect_role,
               primary_loss_effect_digest)
            VALUES
              ('batch-loss','generation-loss-terminal','primary','effect-loss');
            INSERT INTO lifecycle_generation_loss_revisions VALUES
              ('p','r','a','loss-old',2,'sem-loss','src-loss','journal-loss',
               'batch-loss','apply-loss','digest-loss',NULL,NULL);
            INSERT INTO lifecycle_generation_loss_heads VALUES
              ('p','r','a','loss-old',2,'sem-loss','src-loss','journal-loss');

            INSERT INTO lifecycle_receipt_recovery_retirement_effects
              (batch_id,effect_digest,retirement_id)
            VALUES
              ('batch-retirement','effect-retirement','retirement-1');
            INSERT INTO lifecycle_receipt_batch_completions
              (batch_id,transition_kind,primary_retirement_effect_digest)
            VALUES
              ('batch-retirement','custody-recovery-retirement',
               'effect-retirement');
            INSERT INTO agent_lifecycle_recovery_retirements VALUES
              ('retirement-1','batch-retirement','apply-retirement',
               'digest-retirement','effect-retirement');

            INSERT INTO lifecycle_receipt_custody_effects
              (batch_id,effect_digest,project_session_id,run_id,agent_id,
               custody_id,final_revision,final_semantic_digest,
               final_source_ref_digest)
            VALUES
              ('batch-terminal-fresh','effect-terminal-fresh','p','r','a',
               'custody-terminal-fresh-old',2,'sem-terminal-fresh-old',
               'src-terminal-fresh-old');
            INSERT INTO lifecycle_receipt_batch_completions
              (batch_id,transition_kind,primary_custody_effect_digest)
            VALUES
              ('batch-terminal-fresh','custody-terminal',
               'effect-terminal-fresh');
            INSERT INTO lifecycle_receipt_batches VALUES
              ('batch-terminal-fresh','reservation-terminal-fresh',
               'reservation-digest-terminal-fresh');
            INSERT INTO lifecycle_review_authority_bindings VALUES
              ('batch-terminal-fresh','apply-terminal-fresh',
               'reservation-digest-terminal-fresh');
            INSERT INTO lifecycle_rotation_custody_revisions VALUES
              ('p','r','a','custody-terminal-fresh-old',2,
               'sem-terminal-fresh-old','src-terminal-fresh-old',
               'journal-terminal-fresh-old','batch-terminal-fresh',
               'apply-terminal-fresh','digest-terminal-fresh',NULL,NULL);
            INSERT INTO lifecycle_rotation_custody_heads VALUES
              ('p','r','a','custody-terminal-fresh-old',2,
               'sem-terminal-fresh-old','src-terminal-fresh-old',
               'journal-terminal-fresh-old');
            INSERT INTO lifecycle_rotation_custody_revisions VALUES
              ('p','r','a','custody-terminal-fresh-new',1,
               'sem-terminal-fresh-new','src-terminal-fresh-new',
               'journal-terminal-fresh-new',NULL,NULL,NULL,
               'apply-terminal-fresh','digest-terminal-fresh');
            INSERT INTO lifecycle_rotation_custody_heads VALUES
              ('p','r','a','custody-terminal-fresh-new',1,
               'sem-terminal-fresh-new','src-terminal-fresh-new',
               'journal-terminal-fresh-new');
            INSERT INTO lifecycle_fresh_rotation_commits VALUES
              ('handoff-terminal-fresh','apply-terminal-fresh',
               'digest-terminal-fresh','custody-terminal-fresh-new',
               NULL,NULL,NULL,NULL);

            INSERT INTO lifecycle_rotation_custody_revisions VALUES
              ('p','r','a','custody-reuse',1,'sem-reuse','src-reuse',
               'journal-reuse',NULL,NULL,NULL,'apply-reuse','digest-reuse');
            INSERT INTO lifecycle_rotation_custody_heads VALUES
              ('p','r','a','custody-reuse',1,'sem-reuse','src-reuse',
               'journal-reuse');
            INSERT INTO lifecycle_fresh_rotation_commits VALUES
              ('handoff-reuse','apply-reuse','digest-reuse','custody-reuse',
               NULL,NULL,NULL,NULL);

            INSERT INTO lifecycle_rotation_custody_revisions VALUES
              ('p','r','a','custody-open',1,'sem-open','src-open',
               'journal-open',NULL,NULL,NULL,'apply-open','digest-open');
            INSERT INTO lifecycle_rotation_custody_heads VALUES
              ('p','r','a','custody-open',1,'sem-open','src-open',
               'journal-open');
            INSERT INTO lifecycle_generation_loss_revisions VALUES
              ('p','r','a','loss-open',2,'sem-loss-open','src-loss-open',
               'journal-loss-open',NULL,NULL,NULL,'apply-open','digest-open');
            INSERT INTO lifecycle_generation_loss_heads VALUES
              ('p','r','a','loss-open',2,'sem-loss-open','src-loss-open',
               'journal-loss-open');
            INSERT INTO lifecycle_fresh_rotation_commits VALUES
              ('handoff-open','apply-open','digest-open','custody-open',
               'loss-open',2,'sem-loss-open','src-loss-open');
            """
        )
        return db

    APPLY_STATEMENTS = (
            (
                "terminal-custody",
                "INSERT INTO lifecycle_transition_applies "
                "(apply_id,apply_digest,apply_kind,batch_transition_kind,"
                "receipt_batch_id,fresh_generation_loss_after_key) "
                "VALUES ('apply-custody','digest-custody','terminal',"
                "'custody-terminal','batch-custody','none')",
            ),
            (
                "terminal-generation-loss",
                "INSERT INTO lifecycle_transition_applies "
                "(apply_id,apply_digest,apply_kind,batch_transition_kind,"
                "receipt_batch_id,fresh_generation_loss_after_key) "
                "VALUES ('apply-loss','digest-loss','terminal',"
                "'generation-loss-terminal','batch-loss','none')",
            ),
            (
                "terminal-retirement",
                "INSERT INTO lifecycle_transition_applies "
                "(apply_id,apply_digest,apply_kind,batch_transition_kind,"
                "receipt_batch_id,fresh_generation_loss_after_key) "
                "VALUES ('apply-retirement','digest-retirement','terminal',"
                "'custody-recovery-retirement','batch-retirement','none')",
            ),
            (
                "terminal-fresh",
                "INSERT INTO lifecycle_transition_applies "
                "(apply_id,apply_digest,apply_kind,batch_transition_kind,"
                "receipt_batch_id,fresh_generation_loss_after_key,"
                "fresh_project_session_id,fresh_run_id,fresh_agent_id,"
                "fresh_handoff_id,fresh_source_mode,new_custody_id,"
                "new_custody_semantic_digest,new_custody_source_ref_digest) "
                "VALUES ('apply-terminal-fresh','digest-terminal-fresh',"
                "'terminal-fresh','custody-terminal','batch-terminal-fresh',"
                "'none','p','r','a','handoff-terminal-fresh',"
                "'terminalize-nonfinal-custody',"
                "'custody-terminal-fresh-new','sem-terminal-fresh-new',"
                "'src-terminal-fresh-new')",
            ),
            (
                "fresh-reuse",
                "INSERT INTO lifecycle_transition_applies "
                "(apply_id,apply_digest,apply_kind,batch_transition_kind,"
                "fresh_generation_loss_after_key,fresh_project_session_id,"
                "fresh_run_id,fresh_agent_id,fresh_handoff_id,"
                "fresh_source_mode,new_custody_id,new_custody_semantic_digest,"
                "new_custody_source_ref_digest) VALUES "
                "('apply-reuse','digest-reuse','fresh','none','none','p','r',"
                "'a','handoff-reuse','reuse-final-custody','custody-reuse',"
                "'sem-reuse','src-reuse')",
            ),
            (
                "fresh-open-generation-loss",
                "INSERT INTO lifecycle_transition_applies "
                "(apply_id,apply_digest,apply_kind,batch_transition_kind,"
                "fresh_generation_loss_after_key,fresh_project_session_id,"
                "fresh_run_id,fresh_agent_id,fresh_generation_loss_id,"
                "fresh_generation_loss_after_revision,"
                "fresh_generation_loss_after_semantic_digest,"
                "fresh_generation_loss_after_source_ref_digest,"
                "fresh_handoff_id,fresh_source_mode,new_custody_id,"
                "new_custody_semantic_digest,new_custody_source_ref_digest) "
                "VALUES ('apply-open','digest-open','fresh','none',"
                "'src-loss-open','p','r','a','loss-open',2,'sem-loss-open',"
                "'src-loss-open','handoff-open','open-generation-loss',"
                "'custody-open','sem-open','src-open')",
            ),
        )

    def test_apply_trigger_accepts_all_six_legal_arms(self) -> None:
        db = self._valid_apply_database()
        for arm, statement in self.APPLY_STATEMENTS:
            with self.subTest(apply_arm=arm):
                db.execute(statement)

        self.assertEqual(
            6,
            db.execute(
                "SELECT count(*) FROM lifecycle_transition_applies"
            ).fetchone()[0],
        )

    def test_apply_marker_requires_complete_arm_specific_post_state(self) -> None:
        apply_trigger = trigger_sql(
            SPEC_04, "lifecycle_apply_post_state_complete"
        )
        self.assertIn("lifecycle-apply-post-state-incomplete", apply_trigger)
        self.assertIn("NEW.batch_transition_kind='custody-terminal'", apply_trigger)
        self.assertIn("NEW.apply_kind='terminal-fresh'", apply_trigger)
        self.assertIn("NEW.fresh_source_mode='reuse-final-custody'", apply_trigger)
        self.assertIn("NEW.fresh_source_mode='open-generation-loss'", apply_trigger)

        broken_post_states = (
            (
                "terminal-custody",
                "DELETE FROM lifecycle_rotation_custody_heads "
                "WHERE custody_id='custody-old'",
            ),
            (
                "terminal-generation-loss",
                "DELETE FROM lifecycle_generation_loss_heads "
                "WHERE generation_loss_id='loss-old'",
            ),
            (
                "terminal-retirement",
                "DELETE FROM agent_lifecycle_recovery_retirements "
                "WHERE retirement_id='retirement-1'",
            ),
            (
                "terminal-fresh",
                "UPDATE lifecycle_review_authority_bindings "
                "SET apply_id='crossed-apply' "
                "WHERE batch_id='batch-terminal-fresh'",
            ),
            (
                "fresh-reuse",
                "DELETE FROM lifecycle_fresh_rotation_commits "
                "WHERE apply_id='apply-reuse'",
            ),
            (
                "fresh-open-generation-loss",
                "DELETE FROM lifecycle_generation_loss_heads "
                "WHERE generation_loss_id='loss-open'",
            ),
        )
        apply_statements = dict(self.APPLY_STATEMENTS)
        for arm, break_post_state in broken_post_states:
            with self.subTest(apply_arm=arm):
                db = self._valid_apply_database()
                self.assertEqual(1, db.execute(break_post_state).rowcount)
                with self.assertRaisesRegex(
                    sqlite3.IntegrityError,
                    "lifecycle-apply-post-state-incomplete",
                ):
                    db.execute(apply_statements[arm])

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
