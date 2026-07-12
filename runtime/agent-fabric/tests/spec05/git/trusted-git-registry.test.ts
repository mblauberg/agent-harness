import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import type { Sha256Digest } from "@local/agent-fabric-protocol";

import { applyMigrations } from "../../../src/core/migrations.ts";
import {
  TrustedGitRegistry,
  deriveTrustedGitExecutionProfileDigest,
  deriveTrustedGitRemoteTargetDigest,
  deriveTrustedRunGitAllowlistDigest,
  type TrustedGitConfiguration,
  type TrustedRunGitAllowlist,
} from "../../../src/operator/trusted-git-registry.ts";

const databases: Database.Database[] = [];
const sha = (value: string): Sha256Digest => `sha256:${value.repeat(64).slice(0, 64)}` as Sha256Digest;

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("trusted Git production registry", () => {
  it("materialises exact profiles, remotes and an already-approved run allow-list idempotently", () => {
    const database = new Database(":memory:");
    databases.push(database);
    applyMigrations(database);
    const profileWithoutDigest = {
      profileId: "sealed-git-v1",
      revision: 1,
      gitBinaryPath: "/usr/bin/git",
      gitBinaryVersion: "2.39.5",
      gitBinaryDigest: sha("5"),
      objectFormat: "sha1" as const,
      mergeBackendId: "merge-unavailable-v1",
      rebaseBackendId: "rebase-unavailable-v1",
      environmentDigest: sha("6"),
      helperRegistryDigest: sha("7"),
      inspectorDigest: sha("8"),
    };
    const profile = {
      ...profileWithoutDigest,
      profileDigest: deriveTrustedGitExecutionProfileDigest(profileWithoutDigest),
    };
    const remoteWithoutDigest = {
      registrationId: "remote_registration_01",
      revision: 1,
      generation: 1,
      projectId: "project_01",
      remoteName: "origin",
      transportKind: "provider-port" as const,
      targetIdentity: "github.example:443/owner/repository",
      adapterId: "registered-remote-v1",
      adapterContractDigest: sha("9"),
      credentialSelectorDigest: sha("a"),
    };
    const remote = {
      ...remoteWithoutDigest,
      targetDigest: deriveTrustedGitRemoteTargetDigest(remoteWithoutDigest),
    };
    const remoteBinding = {
      registrationId: remote.registrationId,
      revision: remote.revision,
      generation: remote.generation,
      remoteName: remote.remoteName,
      targetDigest: remote.targetDigest,
      adapterId: remote.adapterId,
      adapterContractDigest: remote.adapterContractDigest,
    };
    const allowlistWithoutDigest = {
      projectSessionId: "session_01",
      coordinationRunId: "run_01",
      authorityRevision: 1,
      gitAllowlistEpoch: 1,
      allowWorktreeCreation: false,
      maximumExpiry: Date.parse("2027-01-01T00:00:00Z"),
      operationVariants: ["stage" as const, "commit" as const],
      profiles: [{ profileId: profile.profileId, revision: profile.revision, digest: profile.profileDigest }],
      remotes: [remoteBinding],
      refs: ["refs/heads/main"],
      paths: [{ repositoryRoot: "/repo", worktreePath: "/repo", canonicalPrefix: "src" }],
    } satisfies Omit<TrustedRunGitAllowlist, "gitAllowlistDigest">;
    const gitAllowlistDigest = deriveTrustedRunGitAllowlistDigest(allowlistWithoutDigest);
    const currentAllowlist = {
      ...allowlistWithoutDigest,
      gitAllowlistDigest,
    } satisfies TrustedRunGitAllowlist;
    const configuration = {
      executionProfiles: [profile],
      remoteRegistrations: [remote],
      runAllowlists: [currentAllowlist],
    } satisfies TrustedGitConfiguration;
    database.exec(`
      INSERT INTO projects(project_id,canonical_root,trust_record_digest,revision,authority_generation,created_at,updated_at)
      VALUES('project_01','/repo','${sha("1")}',1,1,1,1);
      INSERT INTO project_sessions(
        project_session_id,project_id,mode,state,revision,generation,authority_ref,budget_ref,
        launch_packet_path,launch_packet_digest,membership_revision,origin_kind,origin_operator_id,created_at,updated_at
      ) VALUES('session_01','project_01','coordinated','active',2,1,'${sha("2")}','budget_01',
        'launch.json','${sha("3")}',1,'operator-launch','operator_01',1,1);
      INSERT INTO runs(
        run_id,chair_agent_id,workspace_root,project_run_directory,created_at,project_session_id,lifecycle_state,
        revision,chair_generation,chair_lease_id,authority_ref,budget_ref,dependency_revision,topology_slot,
        project_run_directory_basis,authority_revision,git_allowlist_epoch,git_allowlist_digest
      ) VALUES('run_01','chair_01','/repo','.agent-run/current',1,'session_01','active',4,1,'chair:run_01:1',
        '${sha("2")}','budget_01',1,1,'project-relative',1,1,'${gitAllowlistDigest}');
      INSERT INTO run_authority_revisions(
        project_session_id,coordination_run_id,authority_revision,authority_ref,git_allowlist_epoch,
        git_allowlist_digest,activated_at_run_revision,created_at
      ) VALUES('session_01','run_01',1,'${sha("2")}',1,'${gitAllowlistDigest}',4,1);
    `);
    const registry = new TrustedGitRegistry(database, () => 10);

    expect(() => registry.materialize({
      ...configuration,
      runAllowlists: [{ ...currentAllowlist, refs: ["refs/heads/unapproved"] }],
    })).toThrow(/allow-list digest/iu);
    expect(registry.materialize(configuration)).toEqual({ profiles: 1, remotes: 1, runAllowlists: 1 });
    expect(registry.materialize(configuration)).toEqual({ profiles: 1, remotes: 1, runAllowlists: 1 });
    expect(database.prepare("SELECT state,profile_digest FROM git_execution_profiles").get())
      .toEqual({ state: "active", profile_digest: profile.profileDigest });
    expect(database.prepare("SELECT state,target_digest FROM git_remote_registrations").get())
      .toEqual({ state: "active", target_digest: remote.targetDigest });
    expect(database.prepare("SELECT allow_worktree_creation FROM run_git_allowlists").get())
      .toEqual({ allow_worktree_creation: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM run_git_allowlist_variants").get()).toEqual({ count: 2 });

    expect(() => database.prepare(`
      UPDATE git_execution_profiles SET profile_digest=? WHERE profile_id='sealed-git-v1' AND revision=1
    `).run(sha("f"))).toThrow(/git_profile_immutable/iu);
    expect(() => database.prepare(`
      DELETE FROM git_remote_registrations WHERE registration_id='remote_registration_01' AND revision=1
    `).run()).toThrow(/git_remote_immutable/iu);
    expect(() => database.prepare(`
      UPDATE run_git_allowlists SET allow_worktree_creation=1 WHERE coordination_run_id='run_01'
    `).run()).toThrow(/run_git_allowlist_immutable/iu);
    expect(() => database.prepare(`
      DELETE FROM run_git_allowlist_variants WHERE coordination_run_id='run_01' AND operation_variant='stage'
    `).run()).toThrow(/run_git_allowlist_child_immutable/iu);

    expect(() => registry.materialize({
      executionProfiles: [{ ...profile, gitBinaryVersion: "tampered" }],
    })).toThrow(/digest|changed/iu);
    const renamedRemoteWithoutDigest = {
      ...remoteWithoutDigest,
      revision: 2,
      generation: 2,
      remoteName: "renamed-origin",
      targetIdentity: "github.example:443/owner/repository-two",
    };
    expect(() => registry.materialize({
      remoteRegistrations: [{
        ...renamedRemoteWithoutDigest,
        targetDigest: deriveTrustedGitRemoteTargetDigest(renamedRemoteWithoutDigest),
      }],
    })).toThrow(/registration identity changed/iu);
    const credentialedRemoteWithoutDigest = {
      ...remoteWithoutDigest,
      registrationId: "remote_registration_credentialed",
      targetIdentity: "https://user:secret@github.example/owner/repository",
    };
    expect(() => registry.materialize({
      remoteRegistrations: [{
        ...credentialedRemoteWithoutDigest,
        targetDigest: deriveTrustedGitRemoteTargetDigest(credentialedRemoteWithoutDigest),
      }],
    })).toThrow(/secret-free/iu);

    const rotatedAllowlistWithoutDigest = {
      ...allowlistWithoutDigest,
      authorityRevision: 2,
      gitAllowlistEpoch: 2,
      refs: ["refs/heads/main", "refs/heads/reviewed"],
    } satisfies Omit<TrustedRunGitAllowlist, "gitAllowlistDigest">;
    const rotatedGitAllowlistDigest = deriveTrustedRunGitAllowlistDigest(rotatedAllowlistWithoutDigest);
    database.transaction(() => {
      database.prepare(`
        INSERT INTO run_authority_revisions(
          project_session_id,coordination_run_id,authority_revision,authority_ref,git_allowlist_epoch,
          git_allowlist_digest,activated_at_run_revision,created_at
        ) VALUES('session_01','run_01',2,?,2,?,5,2)
      `).run(sha("b"), rotatedGitAllowlistDigest);
      database.prepare(`
        UPDATE runs SET revision=5,authority_ref=?,authority_revision=2,git_allowlist_epoch=2,git_allowlist_digest=?
         WHERE project_session_id='session_01' AND run_id='run_01'
      `).run(sha("b"), rotatedGitAllowlistDigest);
    })();

    expect(registry.materialize({
      runAllowlists: [
        currentAllowlist,
        { ...rotatedAllowlistWithoutDigest, gitAllowlistDigest: rotatedGitAllowlistDigest },
      ],
    })).toEqual({ profiles: 0, remotes: 0, runAllowlists: 2 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM run_git_allowlists").get()).toEqual({ count: 2 });
  });
});
