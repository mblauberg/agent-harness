import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseTimestamp, type OperatorGitIntent, type Sha256Digest } from "@local/agent-fabric-protocol";

import { FixedGitMutationPort } from "../../../src/operator/fixed-git-mutation-port.ts";
import { readGitObjectDigest } from "../../../src/operator/git-repository-read.ts";

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

function executionProfile() {
  return {
    profileId: "sealed-git-v1",
    revision: 1,
    digest: digest("1"),
    gitBinaryDigest,
    objectFormat: "sha1",
  } as const;
}

function intentFor(
  repositoryRoot: string,
  before: Awaited<ReturnType<FixedGitMutationPort["observe"]>>,
  expected: Awaited<ReturnType<FixedGitMutationPort["observe"]>>,
  operation: OperatorGitIntent["operation"],
): OperatorGitIntent {
  const profile = executionProfile();
  return {
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
      repositoryRoot,
      worktreePath: repositoryRoot,
      repositoryStateDigest: before.repositoryStateDigest,
      executionProfileId: profile.profileId,
      executionProfileRevision: profile.revision,
      executionProfileDigest: profile.digest,
      operationVariant: operation.variant,
      remoteBinding: null,
      resultRecipeDigest: digest("3"),
      operationId: `operation_${operation.variant}_01`,
      effectBindingDigest: digest("6"),
      decision: { kind: "preauthorised", grantId: "grant_01", expectedGrantRevision: 1, grantDigest: digest("7") },
    },
    repository: before,
    executionProfile: profile,
    operation,
    resultRecipe: {
      schemaVersion: 1,
      executionProfileDigest: profile.digest,
      resultRecipeDigest: digest("3"),
      beforeRepositoryStateDigest: before.repositoryStateDigest,
      expectedSuccessRepositoryStateDigest: expected.repositoryStateDigest,
      expectedConflict: null,
      refUpdates: [],
      configUpdates: [],
      commitMappings: [],
      affectedPaths: [],
      bounds: { maximumRefOrConfigUpdates: 64, maximumCommitMappings: 128, maximumConflictPaths: 4096 },
    },
  } as unknown as OperatorGitIntent;
}

describe("fixed typed Git mutation port", () => {
  it("stages only the reviewed path and proves the exact expected repository state", async () => {
    const actualRoot = repository("typed-git-actual");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-state-")));
    directories.push(stateRoot);
    mkdirSync(join(actualRoot, ".worktrees"));
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(actualRoot, actualRoot);
    run(actualRoot, ["add", "--", "tracked.txt"]);
    const expected = await port.observe(actualRoot, actualRoot);
    run(actualRoot, ["restore", "--staged", "--", "tracked.txt"]);
    expect((await port.observe(actualRoot, actualRoot)).repositoryStateDigest).toBe(before.repositoryStateDigest);
    const profile = executionProfile();
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

  it("rejects a commit whose reviewed source index or parent does not match the bound repository", async () => {
    const root = repository("typed-git-commit-cas");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-commit-cas-state-")));
    directories.push(stateRoot);
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    run(root, ["add", "--", "tracked.txt"]);
    const before = await port.observe(root, root);
    const head = await readGitObjectDigest(root, "refs/heads/main");
    const operation = {
      variant: "commit",
      sourceIndexDigest: digest("9"),
      parentObjectDigest: head.digest,
      treeDigest: digest("8"),
      message: "reviewed message",
      author: { name: "Author", email: "author@example.invalid", timestamp: parseTimestamp("2026-01-02T00:00:00.000Z", "test.author") },
      committer: { name: "Committer", email: "committer@example.invalid", timestamp: parseTimestamp("2026-01-02T00:00:00.000Z", "test.committer") },
      resultingCommitDigest: digest("7"),
    } as const;
    const intent = intentFor(root, before, before, operation);

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect((await readGitObjectDigest(root, "refs/heads/main")).digest).toBe(head.digest);
  });

  it("deletes a merged branch against the exact reviewed base rather than the current branch", async () => {
    const actualRoot = repository("typed-git-safe-delete-actual");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-safe-delete-state-")));
    directories.push(stateRoot);
    for (const root of [actualRoot]) {
      run(root, ["restore", "tracked.txt"]);
      run(root, ["switch", "-qc", "topic"]);
      writeFileSync(join(root, "topic.txt"), "topic\n");
      run(root, ["add", "topic.txt"]);
      run(
        root,
        ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "topic"],
        { GIT_AUTHOR_DATE: "2026-01-02T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-02T00:00:00Z" },
      );
      run(root, ["branch", "base"]);
      run(root, ["switch", "main"]);
    }
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(actualRoot, actualRoot);
    const topic = await readGitObjectDigest(actualRoot, "refs/heads/topic");
    const base = await readGitObjectDigest(actualRoot, "refs/heads/base");
    run(actualRoot, ["update-ref", "-d", "refs/heads/topic", topic.nativeObjectId]);
    const expected = await port.observe(actualRoot, actualRoot);
    run(actualRoot, ["update-ref", "refs/heads/topic", topic.nativeObjectId, "0000000000000000000000000000000000000000"]);
    expect((await port.observe(actualRoot, actualRoot)).repositoryStateDigest).toBe(before.repositoryStateDigest);
    const intent = intentFor(actualRoot, before, expected, {
      variant: "branch-delete-merged-only",
      sourceRef: "refs/heads/topic",
      sourceObjectDigest: topic.digest,
      mergedIntoObjectDigest: base.digest,
    });

    await expect(port.dispatch(intent, { remoteTarget: null })).resolves.toMatchObject({ outcome: "exact-applied" });
    expect(() => run(actualRoot, ["show-ref", "--verify", "refs/heads/topic"])).toThrow();
  });

  it("rejects a worktree move when the source worktree state digest is stale", async () => {
    const root = repository("typed-git-worktree-cas");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-worktree-cas-state-")));
    directories.push(stateRoot);
    mkdirSync(join(root, ".worktrees"));
    const source = join(root, ".worktrees", "source");
    const destination = join(root, ".worktrees", "destination");
    run(root, ["worktree", "add", "--detach", source, "HEAD"]);
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(root, root);
    const intent = intentFor(root, before, before, {
      variant: "worktree-move",
      sourceWorktreePath: source,
      destinationWorktreePath: destination,
      expectedWorktreeStateDigest: digest("f"),
    });

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect(realpathSync(source)).toBe(source);
  });

  it("rejects a worktree destination whose repository-owned parent is a symlink", async () => {
    const root = repository("typed-git-worktree-symlink");
    const outside = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-worktree-outside-")));
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-worktree-symlink-state-")));
    directories.push(outside, stateRoot);
    symlinkSync(outside, join(root, ".worktrees"));
    const destination = join(root, ".worktrees", "escape");
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(root, root);
    const head = await readGitObjectDigest(root, "refs/heads/main");
    const intent = intentFor(root, before, before, {
      variant: "worktree-create-detached",
      destinationWorktreePath: destination,
      sourceObjectDigest: head.digest,
    });

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    expect(existsSync(join(outside, "escape"))).toBe(false);
  });

  it("rechecks the complete repository fence immediately before the first mutation", async () => {
    const root = repository("typed-git-final-fence");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-final-fence-state-")));
    directories.push(stateRoot);
    let injected = false;
    const port = new FixedGitMutationPort({
      privateStateRoot: stateRoot,
      faultInjector: (point) => {
        if (point === "before-first-mutation") {
          injected = true;
          writeFileSync(join(root, "tracked.txt"), "competing change\n");
        }
        return Promise.resolve();
      },
    });
    const before = await port.observe(root, root);
    const intent = intentFor(root, before, before, { variant: "stage", paths: ["tracked.txt"] });

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect(injected).toBe(true);
    expect(run(root, ["diff", "--cached", "--name-only"])).toBe("");
  });
});
