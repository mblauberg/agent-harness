import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import Database from "better-sqlite3";
import {
  FABRIC_OPERATIONS,
  parseIdentifier,
  parseOperationResult,
  parseOperatorCapabilityGrant,
  type GitRepositoryReadRequest,
  type GitRepositoryReadResult,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { openFabric, type Fabric } from "../../src/index.ts";
import type { PublicProtocolContext } from "../../src/daemon/public-protocol.ts";
import {
  GitRepositoryReadService,
  type GitHostedChecksPort,
} from "../../src/operator/git-repository-read.ts";
import { OperatorStore } from "../../src/operator/store.ts";
import { ROOT_AUTHORITY } from "../support/stage1-fixture.ts";

const execFileAsync = promisify(execFile);
const now = Date.parse("2027-01-01T00:00:00Z");
const cleanups: string[] = [];

type Fixture = {
  fabric: Fabric;
  context: PublicProtocolContext;
  request: GitRepositoryReadRequest;
  repositoryRoot: string;
  stateRoot: string;
};

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["--no-pager", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return result.stdout.trim();
}

async function setupFixture(options: {
  worktree?: "admitted" | "unadmitted";
  untrackedCount?: number;
  largeDiff?: boolean;
  hostedChecks?: GitHostedChecksPort;
} = {}): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "fabric-git-read-"));
  cleanups.push(directory);
  const repositoryPath = join(directory, "repository");
  const stateRoot = join(directory, "state");
  await mkdir(repositoryPath);
  await mkdir(stateRoot);
  const repositoryRoot = await realpath(repositoryPath);
  await git(repositoryRoot, "init", "--initial-branch=main");
  await writeFile(join(repositoryRoot, "tracked.txt"), "first\n", "utf8");
  await git(repositoryRoot, "add", "--", "tracked.txt");
  await git(
    repositoryRoot,
    "-c",
    "user.name=Agent Fabric Test",
    "-c",
    "user.email=fabric@example.invalid",
    "commit",
    "-m",
    "initial commit",
  );
  await writeFile(
    join(repositoryRoot, "tracked.txt"),
    options.largeDiff === true ? `first\n${"x".repeat(2 * 1024 * 1024)}\n` : "first\nsecond\n",
    "utf8",
  );
  await writeFile(join(repositoryRoot, "untracked.txt"), "untracked\n", "utf8");
  for (let index = 0; index < (options.untrackedCount ?? 0); index += 1) {
    await writeFile(join(repositoryRoot, `untracked-${String(index).padStart(3, "0")}.txt`), `${String(index)}\n`, "utf8");
  }

  const databasePath = join(stateRoot, "fabric.sqlite3");
  const initial = await openFabric({ databasePath, workspaceRoots: [repositoryRoot], clock: () => now });
  await initial.createRun({
    runId: "run_git_read",
    workspaceRoot: repositoryRoot,
    chair: { agentId: "chair", authority: ROOT_AUTHORITY },
  });
  await initial.close();

  const database = new Database(databasePath);
  let projectId = "";
  let projectSessionId = "";
  let snapshotRevision = 0;
  let worktreePath: string | undefined;
  try {
    database.pragma("foreign_keys = ON");
    const identity = database.prepare(`
      SELECT p.project_id, p.authority_generation, s.project_session_id, s.generation
        FROM projects p JOIN project_sessions s ON s.project_id=p.project_id
    `).get() as {
      project_id: string;
      authority_generation: number;
      project_session_id: string;
      generation: number;
    };
    projectId = identity.project_id;
    projectSessionId = identity.project_session_id;
    snapshotRevision = (database.prepare(
      "SELECT revision FROM daemon_global_state WHERE singleton=1",
    ).get() as { revision: number }).revision;
    const store = new OperatorStore({ database, clock: () => now });
    store.registerPrincipal({
      operatorId: "operator_git_read",
      projectId,
      authenticatedSubjectHash: "subject-hash",
      projectAuthorityGeneration: identity.authority_generation,
    });
    store.issueCapability(parseOperatorCapabilityGrant({
      capabilityId: "cap_git_read",
      operatorId: "operator_git_read",
      projectId,
      projectAuthorityGeneration: identity.authority_generation,
      principalGeneration: 1,
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2099-01-01T00:00:00Z",
      status: "active",
      kind: "session",
      projectSessionId,
      sessionGeneration: identity.generation,
      actions: ["read"],
    }), "git-read-secret");
    if (options.worktree !== undefined) {
      const worktreeParent = join(repositoryRoot, ".worktrees");
      await mkdir(worktreeParent);
      worktreePath = join(worktreeParent, "git-reader");
      await git(repositoryRoot, "worktree", "add", "-b", "reader-branch", worktreePath, "HEAD");
      if (options.worktree === "admitted") {
        const runScope = database.prepare(`
          SELECT scope_id FROM resource_scopes
           WHERE project_session_id=? AND coordination_run_id='run_git_read'
             AND scope_kind='coordination-run'
        `).get(projectSessionId) as { scope_id: string };
        database.prepare(`
          INSERT INTO resource_reservations(
            reservation_id, project_session_id, coordination_run_id, leaf_scope_id,
            operation_id, actor_agent_id, state, revision, generation, identity_hash,
            path_json, amounts_json, created_at, updated_at
          ) VALUES (
            'reservation_git_reader', ?, 'run_git_read', ?, NULL, 'chair',
            'reserved', 1, 1, 'writer-admission-test', '[]', '{}', ?, ?
          )
        `).run(projectSessionId, runScope.scope_id, now, now);
        database.prepare(`
          INSERT INTO writer_admissions(
            writer_admission_id, reservation_id, repository_root, worktree_path,
            writer_generation, state
          ) VALUES (
            'writer_git_reader', 'reservation_git_reader', ?, ?, 1, 'active'
          )
        `).run(repositoryRoot, worktreePath);
      }
    }
  } finally {
    database.close();
  }

  const fabric = await openFabric({
    databasePath,
    workspaceRoots: [repositoryRoot],
    clock: () => now,
    ...(options.hostedChecks === undefined ? {} : { gitHostedChecks: options.hostedChecks }),
  });
  const verified = fabric.verifyProtocolCredential("git-read-secret");
  if (verified.principal.kind !== "operator") throw new Error("expected operator principal");
  const requestBase = {
    credential: {
      capabilityId: parseIdentifier<"CapabilityId">("cap_git_read", "test.capabilityId"),
      token: "git-read-secret",
    },
    projectId: projectId as never,
    projectSessionId: projectSessionId as never,
    snapshotRevision,
    diff: { kind: "working-tree" } as const,
    log: { limit: 10 },
  };
  const request: GitRepositoryReadRequest = worktreePath === undefined
    ? { ...requestBase, target: { kind: "project-root" } }
    : { ...requestBase, target: { kind: "session-worktree", canonicalWorktreePath: worktreePath } };
  return {
    fabric,
    repositoryRoot,
    stateRoot,
    context: {
      principal: verified.principal,
      allowedOperations: new Set(verified.grantedOperations),
      features: ["operator-repository-read.v1"],
      connectionNonce: "connection_git_read_01",
      credentialHash: createHash("sha256").update("git-read-secret").digest("hex"),
      daemonInstanceGeneration: 1,
    },
    request,
  };
}

afterEach(async () => {
  for (const directory of cleanups.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("operator repository read", () => {
  it("projects enabled hosted checks without coupling them to local Git availability", async () => {
    const fixture = await setupFixture({
      hostedChecks: {
        read: async (binding) => ({
          freshness: "live",
          source: "github",
          revision: 41,
          observedAt: "2027-01-01T00:00:00Z" as never,
          value: {
            repository: "example/project",
            headObjectDigest: binding.headObjectDigest,
            state: "passing",
            total: 2,
            passing: 2,
            failing: 0,
            pending: 0,
          },
        }),
      },
    });
    try {
      const result = await fixture.fabric.dispatchPublicProtocol(
        fixture.context,
        FABRIC_OPERATIONS.operatorRepositoryRead,
        fixture.request,
      );

      expect(result).toMatchObject({
        status: "current",
        repository: {
          freshness: "live",
          source: "git",
          hostedChecks: {
            freshness: "live",
            source: "github",
            revision: 41,
            value: {
              repository: "example/project",
              state: "passing",
              total: 2,
            },
          },
        },
      });
    } finally {
      await fixture.fabric.close();
    }
  });

  it("fails closed when the repository changes during hosted-check lookup", async () => {
    const fixture = await setupFixture();
    await fixture.fabric.close();
    const database = new Database(join(fixture.stateRoot, "fabric.sqlite3"));
    try {
      const service = new GitRepositoryReadService({
        database,
        operatorStore: new OperatorStore({ database, clock: () => now }),
        privateStateRoot: await realpath(fixture.stateRoot),
        clock: () => now,
        hostedChecks: {
          read: async (binding) => {
            await writeFile(join(fixture.repositoryRoot, "tracked.txt"), "changed during hosted lookup\n", "utf8");
            return {
              freshness: "live",
              source: "github",
              revision: 42,
              observedAt: "2027-01-01T00:00:00Z" as never,
              value: {
                repository: "example/project",
                headObjectDigest: binding.headObjectDigest,
                state: "passing",
                total: 1,
                passing: 1,
                failing: 0,
                pending: 0,
              },
            };
          },
        },
      });

      await expect(service.read(fixture.request)).rejects.toMatchObject({
        code: "PROJECTION_RESNAPSHOT_REQUIRED",
      });
    } finally {
      database.close();
    }
  });

  it("returns resnapshot-required when Fabric state changes during hosted-check lookup", async () => {
    const fixture = await setupFixture();
    await fixture.fabric.close();
    const database = new Database(join(fixture.stateRoot, "fabric.sqlite3"));
    try {
      const service = new GitRepositoryReadService({
        database,
        operatorStore: new OperatorStore({ database, clock: () => now }),
        privateStateRoot: await realpath(fixture.stateRoot),
        clock: () => now,
        hostedChecks: {
          read: async (binding) => {
            database.prepare("UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1").run();
            return {
              freshness: "live",
              source: "github",
              revision: 43,
              observedAt: "2027-01-01T00:00:00Z" as never,
              value: {
                repository: "example/project",
                headObjectDigest: binding.headObjectDigest,
                state: "passing",
                total: 1,
                passing: 1,
                failing: 0,
                pending: 0,
              },
            };
          },
        },
      });

      await expect(service.read(fixture.request)).resolves.toEqual({
        status: "resnapshot-required",
        reason: "snapshot-mismatch",
        currentSnapshotRevision: fixture.request.snapshotRevision + 1,
      });
    } finally {
      database.close();
    }
  });

  it("fails closed when local branch projection changes during hosted-check lookup", async () => {
    const fixture = await setupFixture();
    await fixture.fabric.close();
    const database = new Database(join(fixture.stateRoot, "fabric.sqlite3"));
    try {
      const service = new GitRepositoryReadService({
        database,
        operatorStore: new OperatorStore({ database, clock: () => now }),
        privateStateRoot: await realpath(fixture.stateRoot),
        clock: () => now,
        hostedChecks: {
          read: async (binding) => {
            await git(fixture.repositoryRoot, "branch", "created-during-hosted-lookup");
            return {
              freshness: "live",
              source: "github",
              revision: 44,
              observedAt: "2027-01-01T00:00:00Z" as never,
              value: {
                repository: "example/project",
                headObjectDigest: binding.headObjectDigest,
                state: "passing",
                total: 1,
                passing: 1,
                failing: 0,
                pending: 0,
              },
            };
          },
        },
      });

      await expect(service.read(fixture.request)).rejects.toMatchObject({
        code: "PROJECTION_RESNAPSHOT_REQUIRED",
      });
    } finally {
      database.close();
    }
  });

  it("keeps the local Git projection current when the optional hosted adapter fails", async () => {
    const fixture = await setupFixture();
    await fixture.fabric.close();
    const database = new Database(join(fixture.stateRoot, "fabric.sqlite3"));
    try {
      const service = new GitRepositoryReadService({
        database,
        operatorStore: new OperatorStore({ database, clock: () => now }),
        privateStateRoot: await realpath(fixture.stateRoot),
        clock: () => now,
        hostedChecks: {
          read: async () => ({
            freshness: "unavailable" as const,
            source: "github" as const,
            revision: 41,
            observedAt: "2027-01-01T00:00:00Z" as never,
            reason: `credential afop_${"x".repeat(32)}`,
          }),
        },
      });

      const result = await service.read(fixture.request);

      expect(result).toMatchObject({
        status: "current",
        repository: {
          freshness: "live",
          source: "git",
          hostedChecks: {
            freshness: "unavailable",
            source: "github",
            reason: "hosted checks integration failed safely; local Git observation is independent",
          },
        },
      });
      expect(JSON.stringify(result)).not.toContain("afop_");
    } finally {
      database.close();
    }
  });

  it("returns a bounded typed local Git projection through the public operator dispatcher", async () => {
    const fixture = await setupFixture();
    try {
      const result = await fixture.fabric.dispatchPublicProtocol(
        fixture.context,
        FABRIC_OPERATIONS.operatorRepositoryRead,
        fixture.request,
      ) as GitRepositoryReadResult;

      expect(result).toMatchObject({
        status: "current",
        projectId: fixture.request.projectId,
        projectSessionId: fixture.request.projectSessionId,
        snapshotRevision: fixture.request.snapshotRevision,
        repository: {
          freshness: "live",
          source: "git",
          revision: fixture.request.snapshotRevision,
          canonicalRepositoryRoot: fixture.repositoryRoot,
          canonicalWorktreePath: fixture.repositoryRoot,
          head: { detached: false, refName: "refs/heads/main" },
          changes: {
            staged: { paths: [], truncated: false },
            unstaged: { paths: ["tracked.txt"], truncated: false },
            untracked: { paths: ["untracked.txt"], truncated: false },
            conflicted: { paths: [], truncated: false },
          },
          operationState: { kind: "clean" },
          log: {
            items: [{ subject: "initial commit" }],
            hasMore: false,
            nextCursor: null,
          },
          hostedChecks: {
            freshness: "unavailable",
            source: "github",
          },
        },
      });
      if (result.status !== "current") throw new Error("expected current Git projection");
      expect(parseOperationResult(FABRIC_OPERATIONS.operatorRepositoryRead, result)).toStrictEqual(result);
      expect(result.repository.repositoryStateDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(result.repository.diff.artifactRef).toMatchObject({
        path: expect.stringMatching(/^private\/git-diffs\/[0-9a-f]{64}\.patch$/u),
        digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      });
      const artifactPath = join(fixture.stateRoot, result.repository.diff.artifactRef.path);
      expect((await stat(artifactPath)).mode & 0o777).toBe(0o400);
      expect((await readFile(artifactPath, "utf8"))).toContain("+second");
    } finally {
      await fixture.fabric.close();
    }
  });

  it("reads only an exact active worktree admitted to the credential-bound session", async () => {
    const fixture = await setupFixture({ worktree: "admitted" });
    try {
      const result = await fixture.fabric.dispatchPublicProtocol(
        fixture.context,
        FABRIC_OPERATIONS.operatorRepositoryRead,
        fixture.request,
      ) as GitRepositoryReadResult;
      expect(result).toMatchObject({
        status: "current",
        projectSessionId: fixture.request.projectSessionId,
        repository: {
          canonicalRepositoryRoot: fixture.repositoryRoot,
          canonicalWorktreePath: fixture.request.target.kind === "session-worktree"
            ? fixture.request.target.canonicalWorktreePath
            : "unreachable",
          worktrees: {
            items: expect.arrayContaining([
              expect.objectContaining({
                current: true,
                head: expect.objectContaining({ detached: false, refName: "refs/heads/reader-branch" }),
              }),
            ]),
          },
        },
      });
    } finally {
      await fixture.fabric.close();
    }
  });

  it("fails the snapshot fence before creating a private Git artifact", async () => {
    const fixture = await setupFixture();
    try {
      const result = await fixture.fabric.dispatchPublicProtocol(
        fixture.context,
        FABRIC_OPERATIONS.operatorRepositoryRead,
        { ...fixture.request, snapshotRevision: fixture.request.snapshotRevision - 1 },
      );
      expect(result).toEqual({
        status: "resnapshot-required",
        reason: "snapshot-mismatch",
        currentSnapshotRevision: fixture.request.snapshotRevision,
      });
      await expect(stat(join(fixture.stateRoot, "private"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fixture.fabric.close();
    }
  });

  it("rejects a session-bound credential when the request strips its exact session", async () => {
    const fixture = await setupFixture();
    const sessionless: GitRepositoryReadRequest = {
      credential: fixture.request.credential,
      projectId: fixture.request.projectId,
      snapshotRevision: fixture.request.snapshotRevision,
      target: { kind: "project-root" },
      diff: fixture.request.diff,
      log: fixture.request.log,
    };
    try {
      await expect(fixture.fabric.dispatchPublicProtocol(
        fixture.context,
        FABRIC_OPERATIONS.operatorRepositoryRead,
        sessionless,
      )).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    } finally {
      await fixture.fabric.close();
    }
  });

  it("rejects a real Git worktree that lacks an active session writer admission", async () => {
    const fixture = await setupFixture({ worktree: "unadmitted" });
    try {
      await expect(fixture.fabric.dispatchPublicProtocol(
        fixture.context,
        FABRIC_OPERATIONS.operatorRepositoryRead,
        fixture.request,
      )).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    } finally {
      await fixture.fabric.close();
    }
  });

  it("marks bounded path pages as truncated without losing repository state", async () => {
    const fixture = await setupFixture({ untrackedCount: 260 });
    try {
      const result = await fixture.fabric.dispatchPublicProtocol(
        fixture.context,
        FABRIC_OPERATIONS.operatorRepositoryRead,
        fixture.request,
      ) as GitRepositoryReadResult;
      if (result.status !== "current") throw new Error("expected current Git projection");
      expect(result.repository.changes.untracked).toMatchObject({ truncated: true });
      expect(result.repository.changes.untracked.paths).toHaveLength(256);
      expect(result.repository.repositoryStateDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    } finally {
      await fixture.fabric.close();
    }
  });

  it("caps an oversized immutable diff artifact with an explicit marker", async () => {
    const fixture = await setupFixture({ largeDiff: true });
    try {
      const result = await fixture.fabric.dispatchPublicProtocol(
        fixture.context,
        FABRIC_OPERATIONS.operatorRepositoryRead,
        fixture.request,
      ) as GitRepositoryReadResult;
      if (result.status !== "current") throw new Error("expected current Git projection");
      const artifactPath = join(fixture.stateRoot, result.repository.diff.artifactRef.path);
      const artifact = await readFile(artifactPath);
      expect(artifact.length).toBeLessThanOrEqual(1024 * 1024);
      expect(artifact.toString("utf8")).toContain("[agent-fabric: diff truncated at 1048576 bytes]");
      expect((await stat(artifactPath)).mode & 0o777).toBe(0o400);
    } finally {
      await fixture.fabric.close();
    }
  });

  it("uses returned exact object digests for typed object diff and log continuation", async () => {
    const fixture = await setupFixture();
    try {
      const first = await fixture.fabric.dispatchPublicProtocol(
        fixture.context,
        FABRIC_OPERATIONS.operatorRepositoryRead,
        fixture.request,
      ) as GitRepositoryReadResult;
      if (first.status !== "current") throw new Error("expected current Git projection");
      const objectDigest = first.repository.head.objectDigest;
      const continuation: GitRepositoryReadRequest = {
        ...fixture.request,
        diff: { kind: "objects", baseObjectDigest: objectDigest, targetObjectDigest: objectDigest },
        log: {
          cursor: {
            repositoryStateDigest: first.repository.repositoryStateDigest,
            afterObjectDigest: objectDigest,
          },
          limit: 10,
        },
      };
      const second = await fixture.fabric.dispatchPublicProtocol(
        fixture.context,
        FABRIC_OPERATIONS.operatorRepositoryRead,
        continuation,
      ) as GitRepositoryReadResult;
      if (second.status !== "current") throw new Error("expected current Git continuation");
      expect(second.repository.diff).toMatchObject({
        selector: continuation.diff,
        baseDigest: objectDigest,
        targetDigest: objectDigest,
      });
      expect(second.repository.log).toEqual({ items: [], hasMore: false, nextCursor: null });
      expect(await readFile(join(fixture.stateRoot, second.repository.diff.artifactRef.path))).toHaveLength(0);
    } finally {
      await fixture.fabric.close();
    }
  });
});
