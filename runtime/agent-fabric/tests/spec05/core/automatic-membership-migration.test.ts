import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations, type Migration } from "../../../src/core/migrations.ts";
import { preflightArtifactRegistry } from "../../../src/persistence/artifact-registry-preflight.ts";
import { preflightExternalEffectCustody } from "../../../src/persistence/external-effect-custody-preflight.ts";
import { preflightAdditiveInvariants } from "../../../src/persistence/invariants.ts";
import { preflightLaunchedChairBridgeLoss } from "../../../src/persistence/launched-chair-bridge-loss-preflight.ts";
import { preflightLaunchCustody } from "../../../src/persistence/launch-custody-preflight.ts";
import { preflightProjectSessionOperations } from "../../../src/persistence/project-session-preflight.ts";
import { preflightProviderBridgeCustody } from "../../../src/persistence/provider-bridge-custody-preflight.ts";

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const filenames = [
  "0001-core.sql",
  "0002-observer-event-sequence.sql",
  "0003-integrity-and-query-plans.sql",
  "0004-project-session-operations.sql",
  "0005-launch-custody.sql",
  "0006-operator-lifecycle.sql",
  "0007-provider-bridge-custody.sql",
  "0008-external-effect-custody.sql",
  "0009-launched-chair-bridge-loss.sql",
  "0010-artifact-registry.sql",
  "0011-automatic-session-membership.sql",
] as const;

const preflights = new Map<number, Migration["preflight"]>([
  [3, preflightAdditiveInvariants],
  [4, preflightProjectSessionOperations],
  [5, preflightLaunchCustody],
  [7, preflightProviderBridgeCustody],
  [8, preflightExternalEffectCustody],
  [9, preflightLaunchedChairBridgeLoss],
  [10, preflightArtifactRegistry],
]);

function migrationsThrough(version: number): Migration[] {
  return filenames.slice(0, version).map((filename, index) => {
    const preflight = preflights.get(index + 1);
    return {
      version: index + 1,
      name: filename.replace(/^[0-9]+-/u, "").replace(/\.sql$/u, ""),
      sql: readFileSync(new URL(`../../../migrations/${filename}`, import.meta.url), "utf8"),
      ...(preflight === undefined ? {} : { preflight }),
    };
  });
}

describe("automatic session membership migration 0011", () => {
  it("backfills active and terminal sources while a session is quiescing without widening authority", () => {
    const database = new Database(":memory:");
    databases.push(database);
    database.pragma("foreign_keys = ON");
    expect(applyMigrations(database, migrationsThrough(10))).toMatchObject({ currentVersion: 10 });
    database.exec(`
      INSERT INTO projects(project_id, canonical_root, revision, authority_generation, created_at, updated_at)
      VALUES ('project_m11', '/project/m11', 1, 1, 1, 1);
      INSERT INTO project_sessions(
        project_session_id, project_id, mode, state, revision, generation,
        authority_ref, budget_ref, launch_packet_path, launch_packet_digest,
        membership_revision, origin_kind, origin_operator_id, created_at, updated_at
      ) VALUES (
        'session_m11', 'project_m11', 'independent', 'active', 1, 1,
        'authority-session', 'budget-session', 'docs/spec.md', 'sha256:${"a".repeat(64)}',
        1, 'operator-launch', 'operator_m11', 1, 1
      );
      INSERT INTO runs(
        run_id, chair_agent_id, workspace_root, project_run_directory,
        project_run_directory_basis, created_at, project_session_id,
        lifecycle_state, revision, chair_generation, chair_lease_id,
        authority_ref, budget_ref, dependency_revision, topology_slot
      ) VALUES (
        'run_m11', 'chair_m11', '/project/m11', NULL, 'none', 1, 'session_m11',
        'active', 1, 1, 'chair:run_m11:1', 'authority-run', 'budget-run', 1, NULL
      );
      INSERT INTO authorities(authority_id, run_id, authority_json, authority_hash, created_at)
      VALUES ('authority_m11', 'run_m11', '{}', 'authority-hash', 1);
      INSERT INTO agents(run_id, agent_id, authority_id, lifecycle)
      VALUES ('run_m11', 'chair_m11', 'authority_m11', 'ready');
      INSERT INTO tasks(
        run_id, task_id, authority_id, objective, base_revision, state,
        owner_agent_id, revision, owner_lease_generation, created_by
      ) VALUES
        ('run_m11', 'task_active', 'authority_m11', 'active', 'base', 'active', 'chair_m11', 1, 1, 'chair_m11'),
        ('run_m11', 'task_complete', 'authority_m11', 'complete', 'base', 'complete', 'chair_m11', 2, 1, 'chair_m11');
      INSERT INTO messages(
        message_id, run_id, sender_id, dedupe_key, payload_hash, audience_json,
        kind, body, requires_ack, conversation_id, hop_count, created_at
      ) VALUES
        ('message_active', 'run_m11', 'chair_m11', 'active', 'hash-a', '{}', 'request', 'active', 1, 'conversation-a', 0, 2),
        ('message_done', 'run_m11', 'chair_m11', 'done', 'hash-b', '{}', 'request', 'done', 1, 'conversation-b', 0, 2);
      INSERT INTO deliveries(
        delivery_id, message_id, run_id, recipient_id, mailbox_sequence, state,
        attempt_count, acknowledged_at
      ) VALUES
        ('delivery_active', 'message_active', 'run_m11', 'chair_m11', 1, 'ready', 0, NULL),
        ('delivery_done', 'message_done', 'run_m11', 'chair_m11', 2, 'acknowledged', 1, 3);
      INSERT INTO leases(
        lease_id, run_id, kind, holder_agent_id, generation, status, expires_at, updated_at
      ) VALUES
        ('lease_active', 'run_m11', 'write', 'chair_m11', 1, 'active', 999999, 4),
        ('lease_released', 'run_m11', 'write', 'chair_m11', 1, 'released', 5, 5);
      UPDATE runs SET lifecycle_state='quiescing', revision=revision+1 WHERE run_id='run_m11';
      UPDATE project_sessions SET state='quiescing', revision=revision+1 WHERE project_session_id='session_m11';
    `);

    expect(applyMigrations(database, migrationsThrough(11))).toEqual({ applied: [11], currentVersion: 11 });
    expect(database.prepare(`
      SELECT member_kind, member_id, required, state, revision
        FROM project_session_memberships
       WHERE project_session_id='session_m11'
       ORDER BY member_kind, member_id
    `).all()).toEqual([
      { member_kind: "lease", member_id: "lease_active", required: 1, state: "active", revision: 1 },
      { member_kind: "lease", member_id: "lease_released", required: 1, state: "reconciled", revision: 1 },
      { member_kind: "required-message", member_id: "message_active", required: 1, state: "active", revision: 1 },
      { member_kind: "required-message", member_id: "message_done", required: 1, state: "reconciled", revision: 1 },
      { member_kind: "task", member_id: "task_active", required: 1, state: "active", revision: 1 },
      { member_kind: "task", member_id: "task_complete", required: 1, state: "reconciled", revision: 1 },
    ]);
    expect(database.prepare(`
      SELECT state, membership_revision, revision FROM project_sessions
       WHERE project_session_id='session_m11'
    `).get()).toEqual({ state: "quiescing", membership_revision: 2, revision: 3 });
    expect(database.prepare(`
      SELECT name FROM sqlite_master
       WHERE type='table' AND name='result_deadline_sweep_state'
    `).get()).toEqual({ name: "result_deadline_sweep_state" });
  });
});
