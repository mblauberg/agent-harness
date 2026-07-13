import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/core/migrations.ts";
import { canonicalJson, digest } from "../../src/project-session/store-support.ts";

const SHA_A = `sha256:${"a".repeat(64)}`;

function openDatabase(): Database.Database {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applyMigrations(database);
  return database;
}

function seedRun(database: Database.Database): void {
  database.prepare(`
    INSERT INTO projects(
      project_id,canonical_root,revision,authority_generation,created_at,updated_at
    ) VALUES (?,?,?,?,?,?)
  `).run("project", "/tmp/project", 1, 1, 1, 1);
  database.prepare(`
    INSERT INTO project_sessions(
      project_session_id,project_id,mode,state,revision,generation,
      authority_ref,budget_ref,launch_packet_path,launch_packet_digest,
      membership_revision,origin_kind,origin_operator_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    "session", "project", "coordinated", "active", 1, 1,
    SHA_A, "budget-ref", "launch", "launch-digest",
    1, "operator-launch", "operator", 1, 1,
  );
  database.prepare(`
    INSERT INTO runs(
      run_id,chair_agent_id,workspace_root,created_at,project_session_id,
      lifecycle_state,revision,chair_generation,chair_lease_id,authority_ref,
      budget_ref,dependency_revision,topology_slot
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    "run", "chair", "/tmp", 1, "session", "active", 1, 1,
    "chair-lease", SHA_A, "budget-ref", 1, 1,
  );
  database.prepare(`
    INSERT INTO authorities(authority_id,run_id,authority_json,authority_hash,created_at)
    VALUES (?,?,?,?,?)
  `).run("authority", "run", "{}", "a".repeat(64), 1);
  database.prepare(`
    INSERT INTO agents(run_id,agent_id,authority_id,lifecycle) VALUES (?,?,?,?)
  `).run("run", "chair", "authority", "ready");
}

function seedTopologyParents(database: Database.Database): void {
  seedRun(database);
  database.prepare(`
    INSERT INTO tasks(
      run_id,task_id,authority_id,objective,base_revision,state,revision,created_by
    ) VALUES (?,?,?,?,?,?,?,?)
  `).run("run", "task", "authority", "test", "base", "active", 1, "chair");
  database.prepare(`
    INSERT INTO artifacts(
      artifact_id,project_id,publisher_kind,publisher_ref,source_kind,evidence_kind,
      relative_path,sha256,registry_state,revision,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    "rationale", "project", "operator", "operator", "project-file", "artifact",
    "rationale.txt", SHA_A, "active", 1, 1,
  );
  database.prepare(`
    INSERT INTO run_authority_revisions(
      project_session_id,coordination_run_id,authority_revision,authority_ref,
      git_allowlist_epoch,git_allowlist_digest,activated_at_run_revision,created_at
    ) VALUES (?,?,?,?,?,?,?,?)
  `).run("session", "run", 1, SHA_A, 1, null, 1, 1);
}

function seedTopologyCurrency(database: Database.Database): void {
  seedTopologyParents(database);
  database.prepare(`
    INSERT INTO run_chair_leases(
      project_session_id,run_id,lease_id,holder_agent_id,generation,status,updated_at
    ) VALUES (?,?,?,?,?,?,?)
  `).run("session", "run", "chair-lease", "chair", 1, "active", 1);
  database.prepare(`
    INSERT INTO agent_lifecycle_identity_high_water(
      run_id,agent_id,provider_generation,principal_generation,revision
    ) VALUES (?,?,?,?,?)
  `).run("run", "chair", 1, 1, 1);
  database.prepare(`
    INSERT INTO coordination_policy_revisions(
      project_session_id,coordination_run_id,policy_revision,
      policy_ref,policy_digest,created_at
    ) VALUES (?,?,?,?,?,?)
  `).run("session", "run", 1, SHA_A, SHA_A, 1);
  database.prepare(`
    INSERT INTO coordination_policy_current(
      project_session_id,coordination_run_id,policy_revision,
      policy_ref,policy_digest,revision
    ) VALUES (?,?,?,?,?,?)
  `).run("session", "run", 1, SHA_A, SHA_A, 1);
}

function topologyPlan(policyRevision = 1): Readonly<{ json: string; digest: string }> {
  const body = {
    authority: {
      authorityDigest: SHA_A,
      authorityRef: SHA_A,
      authorityRevision: 1,
    },
    budget: {
      maximumParallelAgents: 1,
      providerTurns: 10,
      toolCalls: 10,
      wallClockSeconds: 60,
    },
    chair: {
      agentId: "chair",
      chairLeaseGeneration: 1,
      principalGeneration: 1,
    },
    contention: {
      evidenceRef: SHA_A,
      mode: "none",
      serializationOwnerAgentId: null,
    },
    coordinationRunId: "run",
    createdAt: 1,
    decomposability: {
      evidenceRef: SHA_A,
      kind: "atomic",
    },
    dependencies: [],
    policy: {
      policyDigest: SHA_A,
      policyRef: SHA_A,
      policyRevision,
    },
    predecessor: null,
    projectSessionId: "session",
    rationaleRef: {
      evidenceId: "rationale",
      evidenceRevision: 1,
    },
    schemaVersion: 1,
    stageOwners: [{
      ownerAgentId: "chair",
      stageId: "stage",
      taskId: "task",
      writePartitionId: "partition",
    }],
    state: "approved",
    stopConditions: [{
      conditionId: "complete",
      kind: "objective-complete",
      predicateRef: SHA_A,
    }],
    taskId: "task",
    topology: {
      executionShape: "single-owner",
      maximumConcurrentAgents: 1,
      mode: "serial",
    },
    waveId: "wave",
    waveRevision: 1,
    writePartitions: [{
      authorityRef: SHA_A,
      mode: "exclusive-write",
      ownerAgentId: "chair",
      partitionId: "partition",
      pathSetDigest: SHA_A,
    }],
  };
  const planDigest = digest(body);
  return { json: canonicalJson({ ...body, planDigest }), digest: planDigest };
}

function insertTopologyPlan(
  database: Database.Database,
  plan: Readonly<{ json: string; digest: string }>,
  policyRevision = 1,
): void {
  database.prepare(`
    INSERT INTO topology_wave_plans(
      project_session_id,coordination_run_id,task_id,wave_id,wave_revision,
      chair_agent_id,principal_generation,chair_lease_generation,
      authority_revision,authority_ref,authority_digest,
      policy_revision,policy_ref,policy_digest,
      rationale_evidence_id,rationale_evidence_revision,state,
      plan_json,plan_digest,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    "session", "run", "task", "wave", 1,
    "chair", 1, 1,
    1, SHA_A, SHA_A,
    policyRevision, SHA_A, SHA_A,
    "rationale", 1, "approved",
    plan.json, plan.digest, 1,
  );
}

function seedGenerationLossRecovery(database: Database.Database): void {
  database.prepare(`
    INSERT INTO operator_principals(
      operator_id,project_id,project_session_id,authenticated_subject_hash,
      project_authority_generation,principal_generation,state,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?)
  `).run("operator", "project", "session", "subject-hash", 1, 1, "active", 1, 1);
  database.prepare(`
    INSERT INTO operator_capabilities(
      capability_id,token_hash,operator_id,project_id,project_session_id,
      project_authority_generation,session_generation,principal_generation,
      kind,operations_json,issued_at,expires_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    "parent-capability", "b".repeat(64), "operator", "project", "session",
    1, 1, 1, "session", '["agent-lifecycle-recovery-issue"]', 1, 100,
  );
  database.prepare(`
    INSERT INTO scoped_gates(
      gate_id,project_session_id,coordination_run_id,dedupe_key,scope_kind,
      scope_task_id,dependency_revision,blocked_operation_ids_json,
      enforcement_points_json,question,reason,options_json,recommendation,
      consequences_json,evidence_refs_json,created_by_ref,expected_approver_ref,
      resolved_by_operator_id,resolution_json,status,human_required,
      release_binding_json,revision,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    "recovery-gate", "session", "run",
    "agent-lifecycle-recovery:run:chair:loss", "run", null, 1, "[]",
    '["agent-lifecycle-recovery-issue"]', "Recover chair?", "Stranded lifecycle",
    "[]", "fresh rotate", "[]", "[]", "fabric", "operator", "operator",
    "{}", "approved", 1, null, 1, 1, 1,
  );
  database.prepare(`
    INSERT INTO provider_actions(
      run_id,action_id,adapter_id,operation,target_agent_id,
      provider_session_generation,identity_hash,payload_hash,payload_json,
      status,history_json,execution_count,effect_count,idempotency_proven,
      result_json,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    "run", "source-action", "adapter", "lifecycle-source", "chair", 1,
    "identity", "payload", "{}", "terminal", "[]", 1, 1, 1, "{}", 1,
  );
  database.prepare(`
    INSERT INTO lifecycle_generation_losses(
      run_id,agent_id,generation_loss_id,loss_kind,state,revision,
      old_provider_session_ref,new_provider_session_ref,
      old_provider_generation,new_provider_generation,
      old_context_revision,new_context_revision,
      source_custody_action_id,source_adapter_id,source_adapter_contract_digest,
      source_principal_generation,source_bridge_generation,bridge_owner_kind,
      source_bridge_row_id,source_bridge_revision,source_capability_hash,
      source_project_session_generation,source_run_generation,
      source_chair_lease_generation,checkpoint_state,checkpoint_ref,
      checkpoint_digest,loss_evidence_digest
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    "run", "chair", "loss", "generation-advance", "open", 1,
    "provider-session-1", "provider-session-2", 1, 2, 0, 0,
    "source-action", "adapter", SHA_A, 1, 1, "chair", "bridge-row", 1,
    "source-capability", 1, 1, 1, "last-validated", "checkpoint", SHA_A, SHA_A,
  );
}

function insertGenerationLossRecoveryIssue(
  database: Database.Database,
  sourceBridgeRevision = 1,
): void {
  database.prepare(`
    INSERT INTO agent_lifecycle_recovery_capability_issues(
      issue_id,capability_hash,operator_id,project_id,session_id,run_id,agent_id,
      session_revision,session_generation,run_revision,recovery_source_kind,
      generation_loss_id,generation_loss_revision,checkpoint_digest,
      source_provider_session_ref,source_capability_hash,source_custody_action_id,
      source_adapter_id,source_adapter_contract_digest,source_bridge_row_id,
      source_bridge_revision,source_provider_generation,source_principal_generation,
      source_bridge_generation,source_project_session_generation,source_run_generation,
      source_chair_lease_generation,bridge_owner_kind,parent_capability_id,
      consequential_gate_id,path,status,issued_at,expires_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    "issue", "c".repeat(64), "operator", "project", "session", "run", "chair",
    1, 1, 1, "generation-loss", "loss", 1, SHA_A,
    "provider-session-1", "source-capability", "source-action", "adapter", SHA_A,
    "bridge-row", sourceBridgeRevision, 1, 1, 1, 1, 1, 1, "chair",
    "parent-capability", "recovery-gate", "fresh-rotate", "active", 10, 20,
  );
}

function safeFinding(): Readonly<{ digest: string; json: string }> {
  const body = {
    evidence: "bounded evidence",
    findingId: "F-1",
    originActionRef: { actionId: "action", adapterId: "adapter" },
    originBundleDigest: SHA_A,
    originDeliveryManifestRef: "manifest",
    originDeliveryReviewBasisDigest: SHA_A,
    originResultDigest: SHA_A,
    originTargetGeneration: 1,
    repairCurrency: {
      evidenceRefs: [],
      kind: "repository-source",
      originRepositorySourceStateDigest: SHA_A,
    },
    severity: "P2",
    summary: "bounded summary",
  };
  const findingDigest = digest(body);
  return { digest: findingDigest, json: canonicalJson({ ...body, findingDigest }) };
}

function findingGraph(finding = safeFinding()): Readonly<{
  finding: ReturnType<typeof safeFinding>;
  pageDigest: string;
  pageByteLength: number;
  setDigest: string;
  setByteLength: number;
}> {
  const findingValue = JSON.parse(finding.json) as Record<string, unknown>;
  const page = { members: [findingValue], schemaVersion: 1 };
  const pageDigest = digest(page);
  const set = {
    findingCount: 1,
    pages: [{
      firstFindingDigest: finding.digest,
      lastFindingDigest: finding.digest,
      memberCount: 1,
      ordinal: 0,
      pageDigest,
    }],
    schemaVersion: 1,
  };
  return {
    finding,
    pageDigest,
    pageByteLength: Buffer.byteLength(canonicalJson(page)),
    setDigest: digest(set),
    setByteLength: Buffer.byteLength(canonicalJson(set)),
  };
}

function insertProviderAction(
  database: Database.Database,
  adapterId: string,
  actionId = "shared-action",
): void {
  database.prepare(`
    INSERT INTO provider_actions(
      run_id,action_id,adapter_id,operation,target_agent_id,
      provider_session_generation,identity_hash,payload_hash,payload_json,
      status,history_json,execution_count,effect_count,idempotency_proven,
      result_json,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    "run", actionId, adapterId, "turn", "chair", 1,
    `identity-${adapterId}`, `payload-${adapterId}`, "{}", "terminal", "[]",
    1, 1, 1, "{}", 1,
  );
}

describe("current database baseline invariants", () => {
  it("keys provider actions by the global adapter and action pair", () => {
    const database = openDatabase();
    seedRun(database);

    insertProviderAction(database, "adapter-a");
    insertProviderAction(database, "adapter-b");

    expect(database.prepare(`
      SELECT adapter_id FROM provider_actions
       WHERE run_id='run' AND action_id='shared-action'
       ORDER BY adapter_id
    `).all()).toEqual([{ adapter_id: "adapter-a" }, { adapter_id: "adapter-b" }]);

    database.close();
  });

  it("cannot bind a dependent provider action through the wrong adapter", () => {
    const database = openDatabase();
    seedRun(database);
    insertProviderAction(database, "adapter-a");

    expect(() => database.prepare(`
      INSERT INTO provider_lifecycle_intents(
        run_id,action_id,operation,actor_agent_id,target_agent_id,
        authority_id,adapter_id,intent_hash,status,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      "run", "shared-action", "attach", "chair", "chair",
      "authority", "adapter-b", "intent", "prepared", 1, 1,
    )).toThrow("FOREIGN KEY constraint failed");

    database.close();
  });

  it("owns one immutable current coordination-policy revision", () => {
    const database = openDatabase();
    seedRun(database);

    database.prepare(`
      INSERT INTO coordination_policy_revisions(
        project_session_id,coordination_run_id,policy_revision,
        policy_ref,policy_digest,created_at
      ) VALUES (?,?,?,?,?,?)
    `).run("session", "run", 1, SHA_A, SHA_A, 1);
    database.prepare(`
      INSERT INTO coordination_policy_current(
        project_session_id,coordination_run_id,policy_revision,
        policy_ref,policy_digest,revision
      ) VALUES (?,?,?,?,?,?)
    `).run("session", "run", 1, SHA_A, SHA_A, 1);

    expect(() => database.prepare(`
      UPDATE coordination_policy_revisions SET policy_digest=?
       WHERE project_session_id=? AND coordination_run_id=? AND policy_revision=?
    `).run(`sha256:${"b".repeat(64)}`, "session", "run", 1))
      .toThrow("INVARIANT_coordination_policy_history_immutable");

    database.close();
  });

  it("rejects a topology plan bound to a noncurrent policy revision", () => {
    const database = openDatabase();
    seedTopologyCurrency(database);
    database.prepare(`
      INSERT INTO coordination_policy_revisions(
        project_session_id,coordination_run_id,policy_revision,
        policy_ref,policy_digest,created_at
      ) VALUES (?,?,?,?,?,?)
    `).run("session", "run", 2, SHA_A, SHA_A, 2);

    expect(() => insertTopologyPlan(database, topologyPlan(2), 2))
      .toThrow("INVARIANT_topology_wave_plan_currency");

    database.close();
  });

  it("requires the topology current pointer to start at the exact first plan", () => {
    const database = openDatabase();
    seedTopologyCurrency(database);
    const plan = topologyPlan();
    insertTopologyPlan(database, plan);

    expect(() => database.prepare(`
      INSERT INTO topology_wave_current(
        project_session_id,coordination_run_id,task_id,
        wave_id,wave_revision,plan_digest,revision
      ) VALUES (?,?,?,?,?,?,?)
    `).run("session", "run", "task", "wave", 1, plan.digest, 99))
      .toThrow("INVARIANT_topology_wave_current_cas");

    database.close();
  });

  it("rejects noncanonical or open nested topology-plan objects", () => {
    const database = openDatabase();
    seedTopologyCurrency(database);
    const value = JSON.parse(topologyPlan().json) as Record<string, unknown>;
    const chair = value.chair as Record<string, unknown>;
    chair.unowned = true;
    delete value.planDigest;
    const planDigest = digest(value);
    value.planDigest = planDigest;

    expect(() => insertTopologyPlan(database, {
      json: canonicalJson(value),
      digest: planDigest,
    })).toThrow("INVARIANT_topology_wave_plan_codec");

    database.close();
  });

  it("rejects a recovery capability issue with invented source and authority bindings", () => {
    const database = openDatabase();
    seedRun(database);

    expect(() => database.prepare(`
      INSERT INTO agent_lifecycle_recovery_capability_issues(
        issue_id,capability_hash,operator_id,project_id,session_id,run_id,agent_id,
        session_revision,session_generation,run_revision,recovery_source_kind,
        generation_loss_id,generation_loss_revision,checkpoint_digest,
        source_provider_session_ref,source_capability_hash,source_custody_action_id,
        source_adapter_id,source_adapter_contract_digest,source_bridge_row_id,
        source_bridge_revision,source_provider_generation,source_principal_generation,
        source_bridge_generation,source_project_session_generation,source_run_generation,
        source_chair_lease_generation,bridge_owner_kind,parent_capability_id,
        consequential_gate_id,path,status,issued_at,expires_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      "issue", "capability-hash", "operator", "forged-project", "forged-session",
      "run", "chair", 999, 999, 999, "generation-loss", "missing-loss", 999,
      SHA_A, "forged-provider-session", "forged-source-capability", "forged-action",
      "forged-adapter", SHA_A, "forged-bridge", 999, 999, 999, 999,
      999, 999, 999, "chair", "missing-parent", "missing-gate",
      "fresh-rotate", "consumed", 1, 2,
    )).toThrow("INVARIANT_agent_lifecycle_recovery_issue_binding");

    database.close();
  });

  it("binds a recovery capability to one exact loss and one terminal status transition", () => {
    const database = openDatabase();
    seedRun(database);
    seedGenerationLossRecovery(database);

    expect(() => insertGenerationLossRecoveryIssue(database, 2))
      .toThrow("INVARIANT_agent_lifecycle_recovery_issue_binding");
    insertGenerationLossRecoveryIssue(database);
    database.prepare(`
      UPDATE agent_lifecycle_recovery_capability_issues SET status='consumed'
       WHERE issue_id='issue'
    `).run();
    expect(() => database.prepare(`
      UPDATE agent_lifecycle_recovery_capability_issues SET status='revoked'
       WHERE issue_id='issue'
    `).run()).toThrow("INVARIANT_agent_lifecycle_recovery_issue_status");

    database.close();
  });

  it("refuses to consume a recovery issue after its parent capability is revoked", () => {
    const database = openDatabase();
    seedRun(database);
    seedGenerationLossRecovery(database);
    insertGenerationLossRecoveryIssue(database);
    database.prepare(`
      UPDATE operator_capabilities SET revoked_at=11
       WHERE capability_id='parent-capability'
    `).run();

    expect(() => database.prepare(`
      UPDATE agent_lifecycle_recovery_capability_issues SET status='consumed'
       WHERE issue_id='issue'
    `).run()).toThrow("INVARIANT_agent_lifecycle_recovery_issue_status");

    database.close();
  });

  it("rejects lifecycle identity high-water rollback without a revision advance", () => {
    const database = openDatabase();
    seedRun(database);
    database.prepare(`
      INSERT INTO agent_lifecycle_identity_high_water(
        run_id,agent_id,provider_generation,principal_generation,revision
      ) VALUES (?,?,?,?,?)
    `).run("run", "chair", 10, 10, 1);

    expect(() => database.prepare(`
      UPDATE agent_lifecycle_identity_high_water
         SET provider_generation=1,principal_generation=1,revision=1
       WHERE run_id='run' AND agent_id='chair'
    `).run()).toThrow("INVARIANT_agent_lifecycle_identity_high_water_cas");

    database.close();
  });

  it("advances identity, bridge, and context high-water rows only through monotonic CAS", () => {
    const database = openDatabase();
    seedRun(database);
    database.prepare(`
      INSERT INTO agent_lifecycle_identity_high_water(
        run_id,agent_id,provider_generation,principal_generation,revision
      ) VALUES ('run','chair',10,10,1)
    `).run();
    database.prepare(`
      UPDATE agent_lifecycle_identity_high_water
         SET provider_generation=11,revision=2
       WHERE run_id='run' AND agent_id='chair'
    `).run();
    expect(() => database.prepare(`
      UPDATE agent_lifecycle_identity_high_water
         SET provider_generation=13,revision=3
       WHERE run_id='run' AND agent_id='chair'
    `).run()).toThrow("INVARIANT_agent_lifecycle_identity_high_water_cas");

    database.prepare(`
      INSERT INTO agent_lifecycle_bridge_high_water(
        run_id,agent_id,bridge_owner_kind,bridge_generation,revision
      ) VALUES ('run','chair','chair',5,1)
    `).run();
    database.prepare(`
      UPDATE agent_lifecycle_bridge_high_water
         SET bridge_generation=6,revision=2
       WHERE run_id='run' AND agent_id='chair' AND bridge_owner_kind='chair'
    `).run();
    expect(() => database.prepare(`
      UPDATE agent_lifecycle_bridge_high_water
         SET bridge_generation=6,revision=3
       WHERE run_id='run' AND agent_id='chair' AND bridge_owner_kind='chair'
    `).run()).toThrow("INVARIANT_agent_lifecycle_bridge_high_water_cas");

    database.prepare(`
      INSERT INTO agent_lifecycle_context_high_water(
        run_id,agent_id,provider_generation,context_revision,revision
      ) VALUES ('run','chair',11,5,1)
    `).run();
    database.prepare(`
      UPDATE agent_lifecycle_context_high_water
         SET context_revision=7,revision=2
       WHERE run_id='run' AND agent_id='chair' AND provider_generation=11
    `).run();
    expect(() => database.prepare(`
      UPDATE agent_lifecycle_context_high_water
         SET context_revision=6,revision=3
       WHERE run_id='run' AND agent_id='chair' AND provider_generation=11
    `).run()).toThrow("INVARIANT_agent_lifecycle_context_high_water_cas");

    database.close();
  });

  it("keeps committed finding members immutable under their content digest", () => {
    const database = openDatabase();
    const graph = findingGraph();
    const finding = graph.finding;
    database.prepare(`
      INSERT INTO review_finding_pages(
        page_digest,member_count,canonical_byte_length,private_page_path,created_at
      ) VALUES (?,?,?,?,?)
    `).run(graph.pageDigest, 1, graph.pageByteLength, "/private/page", 1);
    database.prepare(`
      INSERT INTO review_finding_members(
        page_digest,member_ordinal,finding_digest,finding_id,severity,safe_record_json
      ) VALUES (?,?,?,?,?,?)
    `).run(graph.pageDigest, 0, finding.digest, "F-1", "P2", finding.json);

    expect(() => database.prepare(`
      UPDATE review_finding_members
         SET severity='P0',safe_record_json='{"forged":true}'
       WHERE page_digest=? AND member_ordinal=0
    `).run(graph.pageDigest)).toThrow("INVARIANT_review_finding_graph_immutable");

    database.close();
  });

  it("closes finding pages with contiguous members and exact root ranges", () => {
    const database = openDatabase();
    const graph = findingGraph();
    const finding = graph.finding;
    database.prepare(`
      INSERT INTO review_finding_sets(
        finding_set_digest,finding_count,page_count,canonical_byte_length,created_at
      ) VALUES (?,?,?,?,?)
    `).run(graph.setDigest, 1, 1, graph.setByteLength, 1);
    database.prepare(`
      INSERT INTO review_finding_pages(
        page_digest,member_count,canonical_byte_length,private_page_path,created_at
      ) VALUES (?,?,?,?,?)
    `).run(graph.pageDigest, 1, graph.pageByteLength, "/private/page", 1);
    database.prepare(`
      INSERT INTO review_finding_members(
        page_digest,member_ordinal,finding_digest,finding_id,severity,safe_record_json
      ) VALUES (?,?,?,?,?,?)
    `).run(graph.pageDigest, 0, finding.digest, "F-1", "P2", finding.json);
    database.prepare(`
      INSERT INTO review_finding_set_pages(
        finding_set_digest,ordinal,page_digest,member_count,
        first_finding_digest,last_finding_digest
      ) VALUES (?,?,?,?,?,?)
    `).run(graph.setDigest, 0, graph.pageDigest, 1, finding.digest, finding.digest);

    expect(database.prepare(`
      SELECT finding_set_digest FROM review_finding_sets_complete
    `).all()).toEqual([{ finding_set_digest: graph.setDigest }]);

    expect(() => database.prepare(`
      INSERT INTO review_finding_members(
        page_digest,member_ordinal,finding_digest,finding_id,severity,safe_record_json
      ) VALUES (?,?,?,?,?,?)
    `).run(graph.pageDigest, 1, finding.digest, "F-2", "P2", finding.json))
      .toThrow("INVARIANT_review_finding_member_closed");

    database.close();
  });

  it("rejects malformed finding digests and false canonical byte lengths", () => {
    const database = openDatabase();
    const graph = findingGraph();
    const malformed = JSON.parse(graph.finding.json) as Record<string, unknown>;
    malformed.originResultDigest = "not-a-digest";
    malformed.findingDigest = SHA_A;
    database.prepare(`
      INSERT INTO review_finding_pages(
        page_digest,member_count,canonical_byte_length,private_page_path,created_at
      ) VALUES (?,?,?,?,?)
    `).run(graph.pageDigest, 1, graph.pageByteLength, "/private/page", 1);

    expect(() => database.prepare(`
      INSERT INTO review_finding_members(
        page_digest,member_ordinal,finding_digest,finding_id,severity,safe_record_json
      ) VALUES (?,?,?,?,?,?)
    `).run(
      graph.pageDigest, 0, SHA_A, "F-1", "P2", canonicalJson(malformed),
    )).toThrow("INVARIANT_review_finding_member_closed");

    database.close();

    const lengthDatabase = openDatabase();
    lengthDatabase.prepare(`
      INSERT INTO review_finding_sets(
        finding_set_digest,finding_count,page_count,canonical_byte_length,created_at
      ) VALUES (?,?,?,?,?)
    `).run(graph.setDigest, 1, 1, graph.setByteLength, 1);
    lengthDatabase.prepare(`
      INSERT INTO review_finding_pages(
        page_digest,member_count,canonical_byte_length,private_page_path,created_at
      ) VALUES (?,?,?,?,?)
    `).run(graph.pageDigest, 1, graph.pageByteLength - 1, "/private/page", 1);
    lengthDatabase.prepare(`
      INSERT INTO review_finding_members(
        page_digest,member_ordinal,finding_digest,finding_id,severity,safe_record_json
      ) VALUES (?,?,?,?,?,?)
    `).run(
      graph.pageDigest, 0, graph.finding.digest, "F-1", "P2", graph.finding.json,
    );

    expect(() => lengthDatabase.prepare(`
      INSERT INTO review_finding_set_pages(
        finding_set_digest,ordinal,page_digest,member_count,
        first_finding_digest,last_finding_digest
      ) VALUES (?,?,?,?,?,?)
    `).run(
      graph.setDigest, 0, graph.pageDigest, 1,
      graph.finding.digest, graph.finding.digest,
    )).toThrow("INVARIANT_review_finding_set_page_closed");

    lengthDatabase.close();

    const rootLengthDatabase = openDatabase();
    rootLengthDatabase.prepare(`
      INSERT INTO review_finding_sets(
        finding_set_digest,finding_count,page_count,canonical_byte_length,created_at
      ) VALUES (?,?,?,?,?)
    `).run(graph.setDigest, 1, 1, graph.setByteLength - 1, 1);
    rootLengthDatabase.prepare(`
      INSERT INTO review_finding_pages(
        page_digest,member_count,canonical_byte_length,private_page_path,created_at
      ) VALUES (?,?,?,?,?)
    `).run(graph.pageDigest, 1, graph.pageByteLength, "/private/page", 1);
    rootLengthDatabase.prepare(`
      INSERT INTO review_finding_members(
        page_digest,member_ordinal,finding_digest,finding_id,severity,safe_record_json
      ) VALUES (?,?,?,?,?,?)
    `).run(
      graph.pageDigest, 0, graph.finding.digest, "F-1", "P2", graph.finding.json,
    );

    expect(() => rootLengthDatabase.prepare(`
      INSERT INTO review_finding_set_pages(
        finding_set_digest,ordinal,page_digest,member_count,
        first_finding_digest,last_finding_digest
      ) VALUES (?,?,?,?,?,?)
    `).run(
      graph.setDigest, 0, graph.pageDigest, 1,
      graph.finding.digest, graph.finding.digest,
    )).toThrow("INVARIANT_review_finding_set_page_closed");

    rootLengthDatabase.close();
  });

  it("rejects consumers of an incomplete finding-set graph", () => {
    const database = openDatabase();
    seedRun(database);
    const incompleteSet = `sha256:${"e".repeat(64)}`;
    database.prepare(`
      INSERT INTO review_finding_sets(
        finding_set_digest,finding_count,page_count,canonical_byte_length,created_at
      ) VALUES (?,?,?,?,?)
    `).run(incompleteSet, 1, 1, 1, 1);
    database.prepare(`
      INSERT INTO provider_action_pair_preflights(
        adapter_id,action_id,run_id,owner_digest,actor_principal_digest,
        input_digest,state,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      "adapter", "action", "run", "owner", "principal", "input",
      "resolving", 1, 1,
    );

    expect(() => database.prepare(`
      INSERT INTO review_finding_capacity_reservations(
        adapter_id,action_id,run_id,target_generation,slot,owner_digest,
        finding_window_mode,prior_open_finding_set_digest,
        maximum_new_findings,maximum_new_finding_bytes,reservation_digest,
        state,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      "adapter", "action", "run", 1, "native", "owner", "normal",
      incompleteSet, 32, 65536, "reservation", "preflight", 1, 1,
    )).toThrow("INVARIANT_review_finding_set_incomplete");

    database.close();
  });

  it("rejects a topology plan whose closed body and digest are malformed", () => {
    const database = openDatabase();
    seedTopologyCurrency(database);

    expect(() => database.prepare(`
      INSERT INTO topology_wave_plans(
        project_session_id,coordination_run_id,task_id,wave_id,wave_revision,
        chair_agent_id,principal_generation,chair_lease_generation,
        authority_revision,authority_ref,authority_digest,
        policy_revision,policy_ref,policy_digest,
        rationale_evidence_id,rationale_evidence_revision,state,
        plan_json,plan_digest,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      "session", "run", "task", "wave", 1,
      "chair", 1, 1,
      1, SHA_A, SHA_A,
      1, SHA_A, SHA_A,
      "rationale", 1, "approved",
      "{}", "not-a-digest", 1,
    )).toThrow("INVARIANT_topology_wave_plan_codec");

    database.close();
  });
});
