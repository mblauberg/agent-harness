import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { link, mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FABRIC_OPERATIONS,
  parseOperatorCapabilityGrant,
} from "@local/agent-fabric-protocol";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { AUTHORITY_ACTION_VOCABULARY, openFabric } from "../../../src/index.ts";
import { ArtifactContentReadService } from "../../../src/operator/artifact-content-read.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";

const directories: string[] = [];
const databases: Database.Database[] = [];

afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

const sha256 = (value: string | Buffer): `sha256:${string}` =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

async function fixture<Content extends string | Buffer>(
  content: Content,
  options: Readonly<{
    relativePath?: string;
    projectFile?: boolean;
  }> = {},
) {
  const root = await mkdtemp(join(tmpdir(), "artifact-content-read-"));
  directories.push(root);
  const runDirectory = join(root, ".agent-run", "run-content");
  await mkdir(runDirectory, { recursive: true });
  const relativePath = options.relativePath ?? "reviews/review.md";
  const sourceRoot = options.projectFile === true ? root : runDirectory;
  const sourcePath = join(sourceRoot, relativePath);
  await mkdir(dirnameFor(sourcePath), { recursive: true });
  await writeFile(sourcePath, content);
  const databasePath = join(root, "fabric.sqlite3");
  const fabric = await openFabric({ databasePath, workspaceRoots: [root] });
  const run = await createCurrentSessionRun({
    databasePath,
    workspaceRoot: root,
    runId: "run-content",
    projectRunDirectory: sourceRoot,
    chair: {
      agentId: "chair",
      authority: {
        workspaceRoots: ["."],
        sourcePaths: ["."],
        artifactPaths: [options.projectFile === true ? "." : ".agent-run/run-content"],
        actions: [...AUTHORITY_ACTION_VOCABULARY],
        disclosure: { level: "scoped", scopes: ["local"] } as const,
        expiresAt: "2099-01-01T00:00:00.000Z",
        budget: {},
      },
    },
  });
  const identityDatabase = new Database(databasePath);
  const identity = identityDatabase.prepare(`
    SELECT project.project_id, project.authority_generation,
           session.project_session_id, session.generation
      FROM projects project JOIN project_sessions session ON session.project_id=project.project_id
  `).get() as {
    project_id: string;
    authority_generation: number;
    project_session_id: string;
    generation: number;
  };
  identityDatabase.close();
  const artifact = await fabric.connect(run.chairCapability).publishEvidence({
    commandId: "command_content_publish" as never,
    projectSessionId: identity.project_session_id as never,
    coordinationRunId: "run-content" as never,
    requestedSourceKind: options.projectFile === true ? "project-file" : "run-file",
    evidenceKind: "review",
    relativePath: relativePath as never,
    sourceDigest: sha256(content) as never,
  });
  await fabric.close();

  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  databases.push(database);
  const operators = new OperatorStore({ database });
  operators.registerPrincipal({
    operatorId: "operator_content",
    projectId: identity.project_id,
    authenticatedSubjectHash: "subject_content",
    projectAuthorityGeneration: identity.authority_generation,
  });
  const token = "afop_content_read_secret_abcdefghijklmnopqrstuvwxyz";
  operators.issueCapability(parseOperatorCapabilityGrant({
    capabilityId: "capability_content",
    operatorId: "operator_content",
    projectId: identity.project_id,
    projectAuthorityGeneration: identity.authority_generation,
    principalGeneration: 1,
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2099-01-01T00:00:00Z",
    status: "active",
    kind: "session",
    projectSessionId: identity.project_session_id,
    sessionGeneration: identity.generation,
    actions: ["read"],
  }), token);
  return {
    root,
    runDirectory,
    sourcePath,
    databasePath,
    database,
    operators,
    identity,
    artifact,
    token,
    content,
  };
}

function request(f: Awaited<ReturnType<typeof fixture>>, cursor: string | null = null) {
  return {
    credential: { capabilityId: "capability_content" as never, token: f.token },
    projectId: f.identity.project_id as never,
    projectSessionId: f.identity.project_session_id as never,
    evidenceId: f.artifact.evidenceId,
    expectedEvidenceRevision: f.artifact.evidenceRevision,
    artifactRef: f.artifact.artifactRef,
    cursor,
    maximumBytes: 12,
    maximumLines: 2,
  };
}

describe("bounded operator artifact content reads", () => {
  it("allows unrelated global activity between its two short transactions", async () => {
    const f = await fixture("alpha\nbeta\ngamma\n");
    const writer = new Database(f.databasePath);
    databases.push(writer);
    let writerCommitted = false;
    const service = new ArtifactContentReadService({
      database: f.database,
      operatorStore: f.operators,
      privateStateRoot: join(dirnameFor(f.databasePath), "private"),
      afterPhaseA: () => {
        writer.prepare("UPDATE projects SET updated_at=updated_at+1 WHERE project_id=?")
          .run(f.identity.project_id);
        writerCommitted = true;
      },
    });

    const result = service.read(request(f));
    expect(writerCommitted).toBe(true);
    expect(result).toMatchObject({
      available: true,
      artifactRef: f.artifact.artifactRef,
      mediaType: "text/markdown",
      pageIndex: 0,
      terminalNeutralised: true,
      capabilityValuesRedacted: true,
      credentialValuesRedacted: true,
    });
  });

  it("dispatches the negotiated closed operation through the public daemon protocol", async () => {
    const f = await fixture("public content read\n");
    f.database.close();
    databases.splice(databases.indexOf(f.database), 1);
    const fabric = await openFabric({ databasePath: f.databasePath, workspaceRoots: [f.root] });
    try {
      const verified = fabric.verifyProtocolCredential(f.token);
      if (verified.principal.kind !== "operator") throw new Error("expected operator principal");
      expect(verified.grantedOperations).toContain(FABRIC_OPERATIONS.operatorArtifactContentRead);
      const context = {
        principal: verified.principal,
        allowedOperations: new Set(verified.grantedOperations),
        features: ["artifact-content-read.v1"],
        connectionNonce: "connection_artifact_content",
        credentialHash: createHash("sha256").update(f.token).digest("hex"),
        daemonInstanceGeneration: 1,
      } as const;
      const input = {
        ...request(f),
        maximumBytes: 131_072,
        maximumLines: 2_000,
      };
      const result = await fabric.dispatchPublicProtocol(
        context,
        FABRIC_OPERATIONS.operatorArtifactContentRead,
        input,
      );
      expect(result).toMatchObject({
        available: true,
        content: "public content read\n",
        artifactRef: f.artifact.artifactRef,
      });
      const concurrent = await Promise.all(Array.from({ length: 32 }, async () => (
        await fabric.dispatchPublicProtocol(
          context,
          FABRIC_OPERATIONS.operatorArtifactContentRead,
          input,
        )
      )));
      expect(concurrent).toHaveLength(32);
      expect(concurrent.every((candidate) => (
        typeof candidate === "object"
        && candidate !== null
        && "available" in candidate
        && candidate.available === true
        && "content" in candidate
        && candidate.content === "public content read\n"
      )))
        .toBe(true);
    } finally {
      await fabric.close();
    }
  });

  it("fails stale when a relevant evidence revision changes between phases", async () => {
    const f = await fixture("review body\n");
    const writer = new Database(f.databasePath);
    databases.push(writer);
    const service = new ArtifactContentReadService({
      database: f.database,
      operatorStore: f.operators,
      privateStateRoot: join(dirnameFor(f.databasePath), "private"),
      afterPhaseA: () => {
        writer.prepare("UPDATE artifacts SET evidence_kind='test', revision=revision+1 WHERE artifact_id=?")
          .run(f.artifact.evidenceId);
      },
    });

    expect(service.read(request(f))).toEqual({
      available: false,
      artifactRef: f.artifact.artifactRef,
      reason: "stale",
    });
  });

  it("fails closed before filesystem work for every wrong authority tuple", async () => {
    const f = await fixture("review body\n");
    let filesystemBoundaryReached = 0;
    const service = new ArtifactContentReadService({
      database: f.database,
      operatorStore: f.operators,
      privateStateRoot: join(dirnameFor(f.databasePath), "private"),
      afterPhaseA: () => { filesystemBoundaryReached += 1; },
    });
    const valid = request(f);
    const wrongRequests = [
      { ...valid, credential: { ...valid.credential, token: "afop_wrong" } },
      { ...valid, credential: { ...valid.credential, capabilityId: "wrong_capability" as never } },
      { ...valid, projectId: "wrong_project" as never },
      { ...valid, projectSessionId: "wrong_session" as never },
      { ...valid, evidenceId: "wrong_evidence" },
      { ...valid, expectedEvidenceRevision: valid.expectedEvidenceRevision + 1 },
      { ...valid, artifactRef: { ...valid.artifactRef, digest: sha256("wrong") as never } },
      { ...valid, cursor: "forged-cursor" },
    ];
    for (const candidate of wrongRequests) {
      const result = service.read(candidate);
      expect(result.available).toBe(false);
      if (result.available) continue;
      expect(["forbidden", "not-found", "stale"]).toContain(result.reason);
    }
    expect(filesystemBoundaryReached).toBe(0);
  });

  it("reconstructs all cursor pages with exact complete coverage", async () => {
    const f = await fixture("alpha\nβeta-long-line\nomega\n");
    const service = new ArtifactContentReadService({
      database: f.database,
      operatorStore: f.operators,
      privateStateRoot: join(dirnameFor(f.databasePath), "private"),
    });
    const pages: string[] = [];
    let cursor: string | null = null;
    let expectedIndex = 0;
    let renderedDigest = "";
    do {
      const result = service.read(request(f, cursor));
      expect(result.available).toBe(true);
      if (!result.available) return;
      expect(result.pageIndex).toBe(expectedIndex);
      pages.push(result.content);
      renderedDigest = result.renderedArtifactDigest;
      cursor = result.nextCursor;
      expectedIndex += 1;
    } while (cursor !== null);
    expect(pages.join("")).toBe(f.content);
    expect(sha256(pages.join(""))).toBe(renderedDigest);
  });

  it("continues a daemon-issued cursor after service restart and rejects cross-artifact reuse", async () => {
    const f = await fixture("alpha\nbeta-long-line\nomega\n");
    const firstService = new ArtifactContentReadService({
      database: f.database,
      operatorStore: f.operators,
      privateStateRoot: f.root,
    });
    const first = firstService.read(request(f));
    expect(first.available).toBe(true);
    if (!first.available || first.nextCursor === null) throw new Error("fixture must paginate");

    const restarted = new ArtifactContentReadService({
      database: f.database,
      operatorStore: f.operators,
      privateStateRoot: f.root,
    });
    const continued = restarted.read(request(f, first.nextCursor));
    expect(continued).toMatchObject({ available: true, pageIndex: 1 });

    const otherContent = "other review\n";
    const otherPath = "reviews/other.md";
    await writeFile(join(f.runDirectory, otherPath), otherContent);
    const source = f.database.prepare("SELECT * FROM artifacts WHERE artifact_id=?")
      .get(f.artifact.evidenceId) as Record<string, unknown>;
    f.database.prepare(`
      INSERT INTO artifacts(
        artifact_id,project_id,project_session_id,run_id,task_id,publisher_kind,
        publisher_ref,publisher_agent_id,source_kind,evidence_kind,relative_path,
        sha256,registry_state,quarantine_reason,revision,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      "evidence_other",
      source.project_id,
      source.project_session_id,
      source.run_id,
      null,
      source.publisher_kind,
      source.publisher_ref,
      source.publisher_agent_id,
      source.source_kind,
      "review",
      otherPath,
      sha256(otherContent),
      "active",
      null,
      1,
      1,
    );
    expect(restarted.read({
      ...request(f, first.nextCursor),
      evidenceId: "evidence_other",
      expectedEvidenceRevision: 1,
      artifactRef: { path: otherPath as never, digest: sha256(otherContent) as never },
    })).toMatchObject({ available: false, reason: "stale" });
  });

  it("routes project and daemon-private Git sources only through their registered owners", async () => {
    const project = await fixture("# project scope\n", { projectFile: true });
    expect(project.artifact.sourceKind).toBe("project-file");
    const projectService = new ArtifactContentReadService({
      database: project.database,
      operatorStore: project.operators,
      privateStateRoot: project.root,
    });
    expect(projectService.read({
      ...request(project),
      maximumBytes: 131_072,
      maximumLines: 2_000,
    })).toMatchObject({
      available: true,
      content: "# project scope\n",
    });

    const git = await fixture("run source\n");
    const gitContent = "diff --git a/a b/a\n-old\n+new\n";
    const gitDigest = sha256(gitContent);
    const privatePath = `private/git-diffs/${gitDigest.slice(7)}.patch`;
    await mkdir(join(git.root, "private", "git-diffs"), { recursive: true });
    await writeFile(join(git.root, privatePath), gitContent);
    git.database.prepare(`
      INSERT INTO artifacts(
        artifact_id,project_id,project_session_id,run_id,task_id,publisher_kind,
        publisher_ref,publisher_agent_id,source_kind,evidence_kind,relative_path,
        sha256,registry_state,quarantine_reason,revision,created_at
      ) VALUES ('evidence_git',?,NULL,NULL,NULL,'fabric','fabric-git-private-diff',NULL,
                'git-private-diff','diff',?,?,'active',NULL,1,1)
    `).run(git.identity.project_id, privatePath, gitDigest);
    const gitService = new ArtifactContentReadService({
      database: git.database,
      operatorStore: git.operators,
      privateStateRoot: await realpath(git.root),
    });
    const gitResult = gitService.read({
      ...request(git),
      evidenceId: "evidence_git",
      expectedEvidenceRevision: 1,
      artifactRef: { path: privatePath as never, digest: gitDigest as never },
      maximumBytes: 131_072,
      maximumLines: 2_000,
    });
    if (!gitResult.available) throw new Error(`private Git read failed: ${gitResult.reason}`);
    expect(gitResult).toMatchObject({
      available: true,
      mediaType: "text/x-diff",
      content: gitContent,
    });
  });

  it("rejects symlink and hard-link aliases without projecting bytes", async () => {
    const linked = await fixture("linked review\n");
    await link(linked.sourcePath, `${linked.sourcePath}.alias`);
    const linkedService = new ArtifactContentReadService({
      database: linked.database,
      operatorStore: linked.operators,
      privateStateRoot: linked.root,
    });
    expect(linkedService.read(request(linked))).toMatchObject({
      available: false,
      reason: "forbidden",
    });

    const symbolic = await fixture("symbolic review\n");
    const target = `${symbolic.sourcePath}.target`;
    await writeFile(target, symbolic.content);
    await unlink(symbolic.sourcePath);
    await symlink(target, symbolic.sourcePath);
    const symbolicService = new ArtifactContentReadService({
      database: symbolic.database,
      operatorStore: symbolic.operators,
      privateStateRoot: symbolic.root,
    });
    expect(symbolicService.read(request(symbolic))).toMatchObject({
      available: false,
      reason: "forbidden",
    });
  });

  it("returns stale when source, root or credential identity changes between phases", async () => {
    const changedSource = await fixture("before\n");
    const sourceService = new ArtifactContentReadService({
      database: changedSource.database,
      operatorStore: changedSource.operators,
      privateStateRoot: changedSource.root,
      afterPhaseA: () => writeFileSync(changedSource.sourcePath, "after\n"),
    });
    expect(sourceService.read(request(changedSource))).toMatchObject({
      available: false,
      reason: "stale",
    });

    const changedRoot = await fixture("root before\n");
    const rootService = new ArtifactContentReadService({
      database: changedRoot.database,
      operatorStore: changedRoot.operators,
      privateStateRoot: changedRoot.root,
      afterPhaseA: () => {
        changedRoot.database.prepare(`
          UPDATE runs SET project_run_directory='.agent-run/other'
           WHERE run_id='run-content'
        `).run();
      },
    });
    expect(rootService.read(request(changedRoot))).toMatchObject({
      available: false,
      reason: "stale",
    });

    const revoked = await fixture("credential before\n");
    const revokedService = new ArtifactContentReadService({
      database: revoked.database,
      operatorStore: revoked.operators,
      privateStateRoot: revoked.root,
      afterPhaseA: () => revoked.operators.revokeCapability("capability_content"),
    });
    expect(revokedService.read(request(revoked))).toMatchObject({
      available: false,
      reason: "stale",
    });
  });

  it.each([
    ["unsupported extension", "plain bytes", "reviews/review.exe", "unsupported-media"],
    ["invalid JSON", "{\"missing\":", "reviews/review.json", "unsupported-media"],
    ["deep JSON", `${"[".repeat(129)}0${"]".repeat(129)}`, "reviews/review.json", "unsupported-media"],
    ["NUL binary", Buffer.from([0x61, 0x00, 0x62]), "reviews/review.txt", "unsupported-media"],
    ["invalid UTF-8", Buffer.from([0xc3, 0x28]), "reviews/review.txt", "unsupported-media"],
  ] as const)("classifies %s without partial content", async (_label, content, relativePath, reason) => {
    const f = await fixture(content, { relativePath });
    const service = new ArtifactContentReadService({
      database: f.database,
      operatorStore: f.operators,
      privateStateRoot: f.root,
    });
    expect(service.read(request(f))).toEqual({
      available: false,
      artifactRef: f.artifact.artifactRef,
      reason,
    });
  });

  it("rejects a source that grows beyond the inspection ceiling before digest projection", async () => {
    const f = await fixture("small", { relativePath: "reviews/review.txt" });
    await writeFile(f.sourcePath, Buffer.alloc(1_048_577, 0x61));
    const service = new ArtifactContentReadService({
      database: f.database,
      operatorStore: f.operators,
      privateStateRoot: f.root,
    });
    expect(service.read(request(f))).toEqual({
      available: false,
      artifactRef: f.artifact.artifactRef,
      reason: "oversized",
    });
  });
});

function dirnameFor(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}
