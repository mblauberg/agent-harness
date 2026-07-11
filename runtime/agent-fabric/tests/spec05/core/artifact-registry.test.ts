import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";

const roots: string[] = [];
const fabrics: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  for (const fabric of fabrics.splice(0)) await fabric.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const sha256 = (value: string): `sha256:${string}` =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

async function registryFixture(options: Readonly<{
  rootEqual?: boolean;
  artifactPaths?: readonly string[];
}> = {}) {
  const root = await mkdtemp(join(tmpdir(), "artifact-registry-"));
  roots.push(root);
  const runDirectory = options.rootEqual === true ? root : join(root, ".agent-run", "run-registry");
  await mkdir(runDirectory, { recursive: true });
  const databasePath = join(root, "fabric.sqlite3");
  const fabric = await openFabric({ databasePath, workspaceRoots: [root] });
  fabrics.push(fabric);
  const run = await fabric.createRun({
    runId: "run-registry",
    projectRunDirectory: runDirectory,
    chair: {
      agentId: "chair",
      authority: {
        workspaceRoots: ["."],
        sourcePaths: ["."],
        artifactPaths: [...(options.artifactPaths ?? [options.rootEqual === true ? "." : ".agent-run/run-registry"])],
        actions: ["read", "write"],
        disclosure: ["local"],
        expiresAt: "2099-01-01T00:00:00.000Z",
        budget: {},
      },
    },
  });
  const database = new Database(databasePath);
  const identity = database.prepare(`
    SELECT project.project_id, session.project_session_id
      FROM projects project JOIN project_sessions session ON session.project_id=project.project_id
  `).get() as { project_id: string; project_session_id: string };
  database.close();
  return {
    root,
    runDirectory,
    databasePath,
    fabric,
    client: fabric.connect(run.chairCapability),
    identity,
  };
}

describe("canonical artifact registry", () => {
  it("replays an exact registration and conflicts on changed provenance or kind", async () => {
    const f = await registryFixture();
    const content = "review evidence\n";
    await mkdir(join(f.runDirectory, "reviews"), { recursive: true });
    await writeFile(join(f.runDirectory, "reviews/review.md"), content);
    const input = {
      commandId: "command_register_01" as never,
      projectSessionId: f.identity.project_session_id as never,
      coordinationRunId: "run-registry" as never,
      requestedSourceKind: "run-file" as const,
      evidenceKind: "review" as const,
      relativePath: "reviews/review.md" as never,
      sourceDigest: sha256(content) as never,
    };
    const first = await f.client.publishEvidence(input);
    const replay = await f.client.publishEvidence(input);
    const secondCommand = await f.client.publishEvidence({
      ...input,
      commandId: "command_register_02" as never,
    });
    expect(replay).toStrictEqual(first);
    expect(secondCommand).toStrictEqual(first);
    expect(first).toMatchObject({
      sourceKind: "run-file",
      evidenceKind: "review",
      artifactRef: { path: "reviews/review.md", digest: sha256(content) },
      publisherKind: "agent",
      publisherRef: "chair",
    });
    await expect(f.client.publishEvidence({
      ...input,
      commandId: "command_register_changed" as never,
      evidenceKind: "test",
    })).rejects.toMatchObject({ code: "DEDUPE_CONFLICT" });

    const database = new Database(f.databasePath);
    expect(database.prepare("SELECT COUNT(*) AS count FROM artifacts WHERE registry_state='active'").get())
      .toEqual({ count: 1 });
    database.close();
  });

  it("reclassifies a root-equal run request only with exact project-file authority", async () => {
    const f = await registryFixture({ rootEqual: true, artifactPaths: ["allowed"] });
    await mkdir(join(f.root, "allowed"), { recursive: true });
    await writeFile(join(f.root, "allowed/spec.md"), "allowed\n");
    await writeFile(join(f.root, "outside.md"), "outside\n");
    const registration = await f.client.publishEvidence({
      commandId: "command_root_equal" as never,
      projectSessionId: f.identity.project_session_id as never,
      coordinationRunId: "run-registry" as never,
      requestedSourceKind: "run-file",
      evidenceKind: "artifact",
      relativePath: "allowed/spec.md" as never,
      sourceDigest: sha256("allowed\n") as never,
    });
    expect(registration.sourceKind).toBe("project-file");
    await expect(f.client.publishEvidence({
      commandId: "command_root_equal_forbidden" as never,
      projectSessionId: f.identity.project_session_id as never,
      coordinationRunId: "run-registry" as never,
      requestedSourceKind: "run-file",
      evidenceKind: "artifact",
      relativePath: "outside.md" as never,
      sourceDigest: sha256("outside\n") as never,
    })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });

    const database = new Database(f.databasePath);
    const source = database.prepare("SELECT * FROM artifacts WHERE artifact_id=?")
      .get(registration.evidenceId) as Record<string, unknown>;
    expect(() => database.prepare(`
      INSERT INTO artifacts(
        artifact_id,project_id,project_session_id,run_id,task_id,publisher_kind,
        publisher_ref,publisher_agent_id,source_kind,evidence_kind,relative_path,
        sha256,registry_state,quarantine_reason,revision,created_at
      ) VALUES ('invalid_root_equal',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      source.project_id,
      source.project_session_id,
      source.run_id,
      null,
      "agent",
      "chair",
      "chair",
      "run-file",
      "artifact",
      "allowed/spec.md",
      sha256("allowed\n"),
      "active",
      null,
      1,
      1,
    )).toThrow(/strict-descendant run root/iu);
    expect(() => database.prepare(`
      INSERT INTO artifacts(
        artifact_id,project_id,project_session_id,run_id,task_id,publisher_kind,
        publisher_ref,publisher_agent_id,source_kind,evidence_kind,relative_path,
        sha256,registry_state,quarantine_reason,revision,created_at
      ) VALUES ('invalid_private_owner',?,NULL,NULL,NULL,'project','project-owned',NULL,
                'project-file','diff',?,?,'active',NULL,1,1)
    `).run(
      source.project_id,
      `private/git-diffs/${"a".repeat(64)}.patch`,
      `sha256:${"a".repeat(64)}`,
    )).toThrow(/private Git diff namespace/iu);
    expect(() => database.prepare(`
      INSERT INTO artifacts(
        artifact_id,project_id,project_session_id,run_id,task_id,publisher_kind,
        publisher_ref,publisher_agent_id,source_kind,evidence_kind,relative_path,
        sha256,registry_state,quarantine_reason,revision,created_at
      ) VALUES ('invalid_private_path',?,NULL,NULL,NULL,'fabric','fabric-git-private-diff',NULL,
                'git-private-diff','diff','private/git-diffs/not-the-digest.patch',?,
                'active',NULL,1,1)
    `).run(source.project_id, `sha256:${"a".repeat(64)}`)).toThrow(/private Git diff namespace/iu);
    database.close();
  });

  it("rejects sensitive paths, digest mismatch and symlinked ancestors", async () => {
    const f = await registryFixture({ rootEqual: true });
    await writeFile(join(f.root, ".env"), "SECRET=value\n");
    await expect(f.client.publishEvidence({
      commandId: "command_sensitive" as never,
      projectSessionId: f.identity.project_session_id as never,
      coordinationRunId: "run-registry" as never,
      requestedSourceKind: "project-file",
      evidenceKind: "artifact",
      relativePath: ".env" as never,
      sourceDigest: sha256("SECRET=value\n") as never,
    })).rejects.toMatchObject({ code: "ARTIFACT_PATH_FORBIDDEN" });

    await writeFile(join(f.root, "mismatch.md"), "actual\n");
    await expect(f.client.publishEvidence({
      commandId: "command_mismatch" as never,
      projectSessionId: f.identity.project_session_id as never,
      coordinationRunId: "run-registry" as never,
      requestedSourceKind: "project-file",
      evidenceKind: "artifact",
      relativePath: "mismatch.md" as never,
      sourceDigest: sha256("claimed\n") as never,
    })).rejects.toMatchObject({ code: "ARTIFACT_DIGEST_INVALID" });

    const outside = await mkdtemp(join(tmpdir(), "artifact-registry-outside-"));
    roots.push(outside);
    await writeFile(join(outside, "escaped.md"), "escaped\n");
    await symlink(outside, join(f.root, "linked"));
    await expect(f.client.publishEvidence({
      commandId: "command_symlink_ancestor" as never,
      projectSessionId: f.identity.project_session_id as never,
      coordinationRunId: "run-registry" as never,
      requestedSourceKind: "project-file",
      evidenceKind: "artifact",
      relativePath: "linked/escaped.md" as never,
      sourceDigest: sha256("escaped\n") as never,
    })).rejects.toMatchObject({ code: "ARTIFACT_PATH_FORBIDDEN" });
  });
});
