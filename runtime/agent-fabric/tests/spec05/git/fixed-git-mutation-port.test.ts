import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { OperatorGitIntent, Sha256Digest } from "@local/agent-fabric-protocol";

import { FixedGitMutationPort } from "../../../src/operator/fixed-git-mutation-port.ts";

const directories: string[] = [];
const digest = (value: string): Sha256Digest => `sha256:${value.repeat(64).slice(0, 64)}` as Sha256Digest;
const gitBinaryDigest = `sha256:${createHash("sha256").update(readFileSync("/usr/bin/git")).digest("hex")}` as Sha256Digest;

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function run(cwd: string, args: string[], environment: Readonly<Record<string, string>> = {}): string {
  return execFileSync("/usr/bin/git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", ...environment },
  }).trim();
}

function repository(name: string): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), `${name}-`)));
  directories.push(root);
  run(root, ["init", "-q", "-b", "main"]);
  writeFileSync(join(root, "tracked.txt"), "before\n");
  run(root, ["add", "tracked.txt"]);
  run(
    root,
    ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "initial"],
    { GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" },
  );
  writeFileSync(join(root, "tracked.txt"), "after\n");
  return root;
}

describe("fixed typed Git mutation port", () => {
  it("stages only the reviewed path and proves the exact expected repository state", async () => {
    const actualRoot = repository("typed-git-actual");
    const oracleRoot = repository("typed-git-oracle");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-state-")));
    directories.push(stateRoot);
    mkdirSync(join(actualRoot, ".worktrees"));
    mkdirSync(join(oracleRoot, ".worktrees"));
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(actualRoot, actualRoot);
    run(oracleRoot, ["add", "--", "tracked.txt"]);
    const expected = await port.observe(oracleRoot, oracleRoot);
    const profile = {
      profileId: "sealed-git-v1",
      revision: 1,
      digest: digest("1"),
      gitBinaryDigest,
      objectFormat: "sha1",
    } as const;
    const resultRecipeDigest = digest("3");
    const intent = {
      kind: "git",
      authorisation: {
        projectId: "project_01",
        projectSessionId: "session_01",
        expectedSessionRevision: 1,
        expectedSessionGeneration: 1,
        coordinationRunId: "run_01",
        expectedRunRevision: 1,
        expectedDependencyRevision: 1,
        authorityRef: digest("4"),
        expectedAuthorityRevision: 1,
        expectedGitAllowlistEpoch: 1,
        gitAllowlistDigest: digest("5"),
        repositoryRoot: actualRoot,
        worktreePath: actualRoot,
        repositoryStateDigest: before.repositoryStateDigest,
        executionProfileId: profile.profileId,
        executionProfileRevision: 1,
        executionProfileDigest: profile.digest,
        operationVariant: "stage",
        remoteBinding: null,
        resultRecipeDigest,
        operationId: "operation_stage_01",
        effectBindingDigest: digest("6"),
        decision: { kind: "preauthorised", grantId: "grant_01", expectedGrantRevision: 1, grantDigest: digest("7") },
      },
      repository: before,
      executionProfile: profile,
      operation: { variant: "stage", paths: ["tracked.txt"] },
      resultRecipe: {
        schemaVersion: 1,
        executionProfileDigest: profile.digest,
        resultRecipeDigest,
        beforeRepositoryStateDigest: before.repositoryStateDigest,
        expectedSuccessRepositoryStateDigest: expected.repositoryStateDigest,
        expectedConflict: null,
        refUpdates: [],
        configUpdates: [],
        commitMappings: [],
        affectedPaths: [{ path: "tracked.txt", beforeDigest: null, afterDigest: null }],
        bounds: { maximumRefOrConfigUpdates: 64, maximumCommitMappings: 128, maximumConflictPaths: 4096 },
      },
    } as unknown as OperatorGitIntent;

    const result = await port.dispatch(intent, { remoteTarget: null });

    expect(result.outcome).toBe("exact-applied");
    expect(result.repository.repositoryStateDigest).toBe(expected.repositoryStateDigest);
    expect(run(actualRoot, ["diff", "--cached", "--name-only"])).toBe("tracked.txt");
  });

  it("rejects project-selected executable configuration before mutation", async () => {
    const root = repository("typed-git-hostile");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-hostile-state-")));
    directories.push(stateRoot);
    run(root, ["config", "filter.hostile.clean", "/tmp/execute-me"]);
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(root, root);
    const intent = {
      kind: "git",
      repository: before,
      executionProfile: { profileId: "sealed", revision: 1, digest: digest("1"), gitBinaryDigest, objectFormat: "sha1" },
      authorisation: { effectBindingDigest: digest("3") },
      operation: { variant: "stage", paths: ["tracked.txt"] },
      resultRecipe: {
        beforeRepositoryStateDigest: before.repositoryStateDigest,
        expectedSuccessRepositoryStateDigest: digest("4"),
        expectedConflict: null,
      },
    } as unknown as OperatorGitIntent;

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toThrow(/untrusted executable|configuration/iu);
    expect(run(root, ["diff", "--cached", "--name-only"])).toBe("");
  });
});
