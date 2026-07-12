import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";

import Database from "better-sqlite3";

import { normalizeRunArtifactDirectory } from "../../src/artifacts/run-root.ts";
import { normaliseAuthority } from "../../src/core/fabric.ts";
import type { AuthorityInput } from "../../src/domain/types.ts";

type CurrentSessionFixtureInput = {
  databasePath: string;
  workspaceRoot: string;
  runId: string;
  projectRunDirectory?: string;
  projectSessionId?: string;
  chair: { agentId: string; authority: AuthorityInput };
  now?: number;
};

export type CurrentSessionFixtureResult = {
  projectId: string;
  projectSessionId: string;
  sessionRevision: 1;
  sessionGeneration: 1;
  runId: string;
  runRevision: 1;
  chairAgentId: string;
  chairGeneration: 1;
  chairLeaseId: string;
  chairAuthorityId: string;
  chairCapability: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new TypeError("current-session fixture value is not JSON-compatible");
}

/**
 * Test-only seed for behaviour suites whose subject starts after operator launch.
 * Production authority/run creation remains owned exclusively by launch custody.
 */
export async function createCurrentSessionRun(input: CurrentSessionFixtureInput): Promise<CurrentSessionFixtureResult> {
  const workspaceRoot = realpathSync(input.workspaceRoot);
  const projectRunDirectory = normalizeRunArtifactDirectory(
    workspaceRoot,
    input.projectRunDirectory ?? null,
  );
  const authority = normaliseAuthority(input.chair.authority, workspaceRoot);
  const authorityJson = canonicalJson(authority);
  const authorityHash = sha256(authorityJson);
  const rootDigest = sha256(workspaceRoot);
  const runDigest = sha256(`${workspaceRoot}\0${input.runId}`);
  const projectId = `project:test:${rootDigest}`;
  const projectSessionId = input.projectSessionId ?? `session:test:${runDigest}`;
  const operatorId = `operator:test:${rootDigest}`;
  const trustRecordDigest = `sha256:${sha256(`test-trust\0${workspaceRoot}`)}`;
  const authorityRef = `sha256:${authorityHash}`;
  const budgetRef = `budget:test:${runDigest}`;
  const launchPacketPath = `.agent-run/test-fixtures/${input.runId}.json`;
  const launchPacketDigest = `sha256:${sha256(canonicalJson({
    projectId,
    projectSessionId,
    runId: input.runId,
    chairAgentId: input.chair.agentId,
    authorityRef,
    budgetRef,
  }))}`;
  const chairAuthorityId = `authority:test:${runDigest}`;
  const chairLeaseId = `chair:${input.runId}:1`;
  const chairCapability = `afc_${createHash("sha256")
    .update(`current-session-fixture\0${input.databasePath}\0${input.runId}\0${input.chair.agentId}`)
    .digest("base64url")}`;
  const now = input.now ?? Date.now();
  const result: CurrentSessionFixtureResult = {
    projectId,
    projectSessionId,
    sessionRevision: 1,
    sessionGeneration: 1,
    runId: input.runId,
    runRevision: 1,
    chairAgentId: input.chair.agentId,
    chairGeneration: 1,
    chairLeaseId,
    chairAuthorityId,
    chairCapability,
  };

  const database = new Database(input.databasePath);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  try {
    database.transaction(() => {
      const existing = database.prepare(`
        SELECT run.chair_agent_id, run.workspace_root, run.project_run_directory,
               run.project_session_id, authority.authority_hash
          FROM runs run
          JOIN agents agent ON agent.run_id=run.run_id AND agent.agent_id=run.chair_agent_id
          JOIN authorities authority ON authority.authority_id=agent.authority_id
         WHERE run.run_id=?
      `).get(input.runId) as Record<string, unknown> | undefined;
      if (existing !== undefined) {
        if (
          existing.chair_agent_id !== input.chair.agentId ||
          existing.workspace_root !== workspaceRoot ||
          existing.project_run_directory !== projectRunDirectory ||
          existing.project_session_id !== projectSessionId ||
          existing.authority_hash !== authorityHash
        ) throw new Error("current-session fixture run ID was reused with changed input");
        return;
      }

      database.prepare(`
        INSERT INTO projects(
          project_id, canonical_root, trust_record_digest, revision,
          authority_generation, created_at, updated_at
        ) VALUES (?, ?, ?, 1, 1, ?, ?)
        ON CONFLICT(project_id) DO NOTHING
      `).run(projectId, workspaceRoot, trustRecordDigest, now, now);
      const project = database.prepare(`
        SELECT canonical_root, trust_record_digest FROM projects WHERE project_id=?
      `).get(projectId) as Record<string, unknown> | undefined;
      if (project?.canonical_root !== workspaceRoot || project.trust_record_digest !== trustRecordDigest) {
        throw new Error("current-session fixture project identity changed");
      }
      database.prepare(`
        INSERT INTO project_sessions(
          project_session_id, project_id, mode, state, revision, generation,
          authority_ref, budget_ref, launch_packet_path, launch_packet_digest,
          membership_revision, origin_kind, origin_operator_id,
          terminal_path_json, created_at, updated_at
        ) VALUES (?, ?, 'coordinated', 'active', 1, 1, ?, ?, ?, ?, 1,
                  'operator-launch', ?, NULL, ?, ?)
      `).run(
        projectSessionId,
        projectId,
        authorityRef,
        budgetRef,
        launchPacketPath,
        launchPacketDigest,
        operatorId,
        now,
        now,
      );
      database.prepare(`
        INSERT INTO runs(
          run_id, chair_agent_id, workspace_root, project_run_directory, created_at,
          project_session_id, lifecycle_state, revision, chair_generation, chair_lease_id,
          authority_ref, budget_ref, dependency_revision, topology_slot,
          project_run_directory_basis
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', 1, 1, ?, ?, ?, 1, 1, ?)
      `).run(
        input.runId,
        input.chair.agentId,
        workspaceRoot,
        projectRunDirectory,
        now,
        projectSessionId,
        chairLeaseId,
        authorityRef,
        budgetRef,
        projectRunDirectory === null ? "none" : "project-relative",
      );
      database.prepare(`
        INSERT INTO authorities(
          authority_id, run_id, parent_authority_id, authority_json, authority_hash, created_at
        ) VALUES (?, ?, NULL, ?, ?, ?)
      `).run(chairAuthorityId, input.runId, authorityJson, authorityHash, now);
      const insertAuthorityBudget = database.prepare(`
        INSERT INTO authority_budget(authority_id, unit_key, granted) VALUES (?, ?, ?)
      `);
      for (const [unit, granted] of Object.entries(authority.budget)) {
        insertAuthorityBudget.run(chairAuthorityId, unit, granted);
      }
      database.prepare(`
        INSERT INTO agents(run_id, agent_id, parent_agent_id, authority_id, lifecycle)
        VALUES (?, ?, NULL, ?, 'ready')
      `).run(input.runId, input.chair.agentId, chairAuthorityId);
      database.prepare(`
        INSERT INTO run_chair_leases(
          project_session_id, run_id, lease_id, holder_agent_id, generation, status, updated_at
        ) VALUES (?, ?, ?, ?, 1, 'active', ?)
      `).run(projectSessionId, input.runId, chairLeaseId, input.chair.agentId, now);
      const insertMembership = database.prepare(`
        INSERT INTO project_session_memberships(
          project_session_id, coordination_run_id, member_kind, member_id,
          required, state, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 'active', 1, ?, ?)
      `);
      insertMembership.run(projectSessionId, input.runId, "coordination-run", input.runId, now, now);
      insertMembership.run(projectSessionId, input.runId, "lease", chairLeaseId, now, now);

      const projectScopeId = `scope:test:project:${rootDigest}`;
      const sessionScopeId = `scope:test:session:${runDigest}`;
      const runScopeId = `scope:test:run:${runDigest}`;
      database.prepare(`
        INSERT INTO resource_scopes(
          scope_id, project_id, project_session_id, coordination_run_id,
          parent_scope_id, scope_kind, owner_ref, state, revision
        ) VALUES (?, ?, NULL, NULL, NULL, 'project', ?, 'active', 1)
        ON CONFLICT(project_id, scope_kind, owner_ref) DO NOTHING
      `).run(projectScopeId, projectId, projectId);
      database.prepare(`
        INSERT INTO resource_scopes(
          scope_id, project_id, project_session_id, coordination_run_id,
          parent_scope_id, scope_kind, owner_ref, state, revision
        ) VALUES (?, ?, ?, NULL, ?, 'project-session', ?, 'active', 1)
      `).run(sessionScopeId, projectId, projectSessionId, projectScopeId, projectSessionId);
      database.prepare(`
        INSERT INTO resource_scopes(
          scope_id, project_id, project_session_id, coordination_run_id,
          parent_scope_id, scope_kind, owner_ref, state, revision
        ) VALUES (?, ?, ?, ?, ?, 'coordination-run', ?, 'active', 1)
      `).run(runScopeId, projectId, projectSessionId, input.runId, sessionScopeId, input.runId);
      const insertDimension = database.prepare(`
        INSERT INTO resource_dimensions(scope_id, unit_key, limit_value, used, reserved, usage_unknown)
        VALUES (?, ?, ?, 0, 0, 0)
        ON CONFLICT(scope_id, unit_key) DO UPDATE SET limit_value=MAX(limit_value, excluded.limit_value)
      `);
      for (const [unit, limit] of Object.entries(authority.budget)) {
        insertDimension.run(projectScopeId, unit, limit);
        insertDimension.run(sessionScopeId, unit, limit);
        insertDimension.run(runScopeId, unit, limit);
      }
      database.prepare("INSERT INTO mailbox_state(run_id, recipient_id) VALUES (?, ?)")
        .run(input.runId, input.chair.agentId);
      database.prepare("INSERT INTO run_metadata(run_id, execution_profile) VALUES (?, 'headless')")
        .run(input.runId);
      database.prepare(`
        INSERT INTO capabilities(token_hash, run_id, agent_id, principal_generation, expires_at)
        VALUES (?, ?, ?, 1, ?)
      `).run(sha256(chairCapability), input.runId, input.chair.agentId, Date.parse(authority.expiresAt));
      const eventId = randomUUID();
      database.prepare(`
        INSERT INTO events(event_id, run_id, type, actor_agent_id, payload_json, created_at)
        VALUES (?, ?, 'run-created', ?, ?, ?)
      `).run(eventId, input.runId, input.chair.agentId, canonicalJson({ authorityId: chairAuthorityId }), now);
      database.prepare("INSERT INTO observer_event_sequence(event_id) VALUES (?)").run(eventId);
    })();
  } finally {
    database.close();
  }
  return result;
}
