import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import type {
  GitConflictRecipe,
  GitLookupOutcome,
  GitOperation,
  GitRepositoryBinding,
  OperatorGitIntent,
  Sha256Digest,
} from "@local/agent-fabric-protocol";

import { ProjectFabricCoreError } from "../project-session/contracts.js";
import { canonicalJson, sha256 } from "../project-session/store-support.js";
import { observeGitRepositoryForMutation, readGitObjectDigest } from "./git-repository-read.js";

const DEFAULT_GIT = "/usr/bin/git";
const MAX_OUTPUT = 8 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

export type GitMutationInspection = {
  outcome: GitLookupOutcome;
  repository: GitRepositoryBinding;
  evidenceDigest: Sha256Digest;
  failureSignatureDigest: Sha256Digest | null;
  conflict: GitConflictRecipe | null;
};

export type GitMutationDispatchContext = {
  remoteTarget: string | null;
};

export interface GitMutationPort {
  observe(repositoryRoot: string, worktreePath: string): Promise<GitRepositoryBinding>;
  dispatch(intent: OperatorGitIntent, context: GitMutationDispatchContext): Promise<GitMutationInspection>;
  inspect(intent: OperatorGitIntent, context: GitMutationDispatchContext): Promise<GitMutationInspection>;
}

export type FixedGitMutationPortOptions = {
  gitExecutable?: string;
  privateStateRoot: string;
  clock?: () => number;
};

/** Fixed, bounded Git process owner. Callers provide typed data, never argv. */
export class FixedGitMutationPort implements GitMutationPort {
  readonly #gitExecutable: string;
  readonly #privateStateRoot: string;
  readonly #clock: () => number;

  constructor(options: FixedGitMutationPortOptions) {
    this.#gitExecutable = options.gitExecutable ?? DEFAULT_GIT;
    this.#privateStateRoot = resolve(options.privateStateRoot);
    this.#clock = options.clock ?? Date.now;
    if (!this.#gitExecutable.startsWith("/")) throw new TypeError("Git executable must be absolute");
  }

  observe(repositoryRoot: string, worktreePath: string): Promise<GitRepositoryBinding> {
    return observeGitRepositoryForMutation(repositoryRoot, worktreePath);
  }

  async dispatch(intent: OperatorGitIntent, context: GitMutationDispatchContext): Promise<GitMutationInspection> {
    await this.#assertBoundary(intent);
    const before = await this.observe(intent.repository.repositoryRoot, intent.repository.worktreePath);
    assertSameRepositoryBinding(before, intent.repository, "Git repository changed before lock/CAS");
    await this.#assertTypedInputs(intent.operation, intent.repository.worktreePath, context);
    try {
      await this.#mutate(intent, context);
    } catch (error: unknown) {
      const inspected = await this.#inspectAgainstRecipe(intent);
      if (inspected.outcome !== "exact-no-effect") return inspected;
      return {
        ...inspected,
        outcome: "exact-no-effect",
        failureSignatureDigest: digest({
          class: "git-process-failed-with-no-effect",
          name: error instanceof Error ? error.name : "unknown",
        }),
      };
    }
    return await this.#inspectAgainstRecipe(intent);
  }

  async inspect(intent: OperatorGitIntent, _context: GitMutationDispatchContext): Promise<GitMutationInspection> {
    await this.#assertBoundary(intent);
    return await this.#inspectAgainstRecipe(intent);
  }

  async #assertBoundary(intent: OperatorGitIntent): Promise<void> {
    const root = await realpath(intent.repository.repositoryRoot);
    const worktree = await realpath(intent.repository.worktreePath);
    if (root !== intent.repository.repositoryRoot || worktree !== intent.repository.worktreePath) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "Git mutation paths are not canonical");
    }
    if (!contains(root, worktree)) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "Git worktree is outside the trusted repository");
    }
    const hostile = await this.#run(worktree, [
      "config", "--local", "--get-regexp",
      "^(alias\\.|core\\.(hooksPath|sshCommand|pager|attributesFile)|filter\\.|merge\\..*\\.driver|diff\\..*\\.command|credential\\.|gpg\\.|commit\\.gpgSign|include|includeIf|remote\\..*\\.(url|pushurl))",
    ], { allowedExitCodes: [1] });
    if (hostile.stdout.trim().length > 0) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "repository configuration selects an untrusted executable or target");
    }
  }

  async #assertTypedInputs(
    operation: GitOperation,
    worktreePath: string,
    context: GitMutationDispatchContext,
  ): Promise<void> {
    for (const path of operationPaths(operation)) assertRelativeGitPath(path);
    for (const ref of operationRefs(operation)) assertFullRef(ref);
    if (requiresRemote(operation) && context.remoteTarget === null) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "remote Git operation lacks a registered target");
    }
    if (context.remoteTarget !== null && /[\r\n\0]/u.test(context.remoteTarget)) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "registered Git target is malformed");
    }
    if (usesWorktreeContent(operation)) {
      const attributes = await this.#run(worktreePath, ["ls-files", "--", ".gitattributes", "**/.gitattributes"]);
      if (attributes.stdout.trim().length > 0) {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "project attributes make the typed Git effect unavailable");
      }
    }
    for (const [ref, expected] of refDigestChecks(operation)) {
      const observed = await readGitObjectDigest(worktreePath, ref);
      if (observed.digest !== expected) {
        throw new ProjectFabricCoreError("STALE_REVISION", `Git ref ${ref} changed before mutation`);
      }
    }
  }

  async #mutate(intent: OperatorGitIntent, context: GitMutationDispatchContext): Promise<void> {
    const cwd = intent.repository.worktreePath;
    const operation = intent.operation;
    switch (operation.variant) {
      case "fetch":
        await this.#run(cwd, ["fetch", "--no-tags", "--no-write-fetch-head", requiredRemote(context), `${operation.sourceRef}:${operation.destinationRef}`]);
        return;
      case "pull-fast-forward-only":
        await this.#run(cwd, ["fetch", "--no-tags", "--no-write-fetch-head", requiredRemote(context), `${operation.sourceRef}:${operation.destinationRef}`]);
        await this.#run(cwd, ["merge", "--ff-only", operation.destinationRef]);
        return;
      case "pull-merge-commit-start":
        await this.#run(cwd, ["fetch", "--no-tags", "--no-write-fetch-head", requiredRemote(context), `${operation.sourceRef}:${operation.destinationRef}`]);
        await this.#run(cwd, ["merge", "--no-ff", "--no-edit", operation.destinationRef], { allowedExitCodes: [1] });
        return;
      case "pull-rebase-start":
        await this.#run(cwd, ["fetch", "--no-tags", "--no-write-fetch-head", requiredRemote(context), `${operation.sourceRef}:${operation.destinationRef}`]);
        await this.#run(cwd, ["rebase", "--no-autostash", operation.destinationRef], { allowedExitCodes: [1] });
        return;
      case "stage":
        await this.#run(cwd, ["add", "--", ...operation.paths]);
        return;
      case "unstage":
        await this.#run(cwd, ["restore", "--staged", "--", ...operation.paths]);
        return;
      case "commit": {
        const tree = (await this.#run(cwd, ["write-tree"])).stdout.trim();
        const treeDigest = await objectDigestByNativeId(cwd, tree, this.#gitExecutable, await this.#environment());
        if (treeDigest !== operation.treeDigest) throw new ProjectFabricCoreError("STALE_REVISION", "Git index tree changed");
        const parent = (await this.#run(cwd, ["rev-parse", "--verify", "HEAD^{commit}"])).stdout.trim();
        const env = commitEnvironment(operation.author, operation.committer);
        const commit = (await this.#run(cwd, ["commit-tree", tree, "-p", parent], { stdin: `${operation.message}\n`, environment: env })).stdout.trim();
        const mapping = await objectDigestByNativeId(cwd, commit, this.#gitExecutable, await this.#environment());
        if (mapping !== operation.resultingCommitDigest) {
          throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "derived Git commit does not match the reviewed recipe");
        }
        const headRef = (await this.#run(cwd, ["symbolic-ref", "-q", "HEAD"])).stdout.trim();
        assertFullRef(headRef);
        await this.#run(cwd, ["update-ref", headRef, commit, parent]);
        return;
      }
      case "merge-fast-forward-only-start":
        await this.#run(cwd, ["merge", "--ff-only", operation.sourceRef]);
        return;
      case "merge-commit-start":
        await this.#run(cwd, ["merge", "--no-ff", "--no-edit", operation.sourceRef], { allowedExitCodes: [1] });
        return;
      case "merge-continue":
        await this.#run(cwd, ["commit", "--no-edit"], { allowedExitCodes: [1] });
        return;
      case "merge-abort":
        await this.#run(cwd, ["merge", "--abort"]);
        return;
      case "rebase-current-branch-no-autostash-start":
        await this.#run(cwd, ["rebase", "--no-autostash", operation.destinationRef], { allowedExitCodes: [1] });
        return;
      case "rebase-continue":
        await this.#run(cwd, ["rebase", "--continue"], { allowedExitCodes: [1] });
        return;
      case "rebase-abort":
        await this.#run(cwd, ["rebase", "--abort"]);
        return;
      case "push-fast-forward-only":
        await this.#run(cwd, ["push", "--porcelain", requiredRemote(context), `${operation.sourceRef}:${operation.destinationRef}`]);
        return;
      case "push-force-with-lease": {
        const nativeExpected = (await this.#run(cwd, ["rev-parse", "--verify", `${operation.destinationRef}^{object}`], { allowedExitCodes: [1] })).stdout.trim();
        await this.#run(cwd, [
          "push", "--porcelain", `--force-with-lease=${operation.destinationRef}:${nativeExpected}`,
          requiredRemote(context), `${operation.sourceRef}:${operation.destinationRef}`,
        ]);
        return;
      }
      case "branch-create": {
        const native = await nativeIdForDigest(cwd, operation.sourceObjectDigest, this.#gitExecutable, await this.#environment());
        await this.#run(cwd, ["update-ref", operation.destinationRef, native, zeroObject(native.length)]);
        return;
      }
      case "branch-rename":
        await this.#run(cwd, ["branch", "--move", branchShort(operation.sourceRef), branchShort(operation.destinationRef)]);
        return;
      case "branch-delete-merged-only":
        await this.#run(cwd, ["branch", "--delete", branchShort(operation.sourceRef)]);
        return;
      case "branch-delete-force":
        await this.#run(cwd, ["branch", "--delete", "--force", branchShort(operation.sourceRef)]);
        return;
      case "worktree-create-detached": {
        assertWorktreeDestination(intent.repository.repositoryRoot, operation.destinationWorktreePath);
        const native = await nativeIdForDigest(cwd, operation.sourceObjectDigest, this.#gitExecutable, await this.#environment());
        await this.#run(cwd, ["worktree", "add", "--detach", operation.destinationWorktreePath, native]);
        return;
      }
      case "worktree-create-new-branch": {
        assertWorktreeDestination(intent.repository.repositoryRoot, operation.destinationWorktreePath);
        const native = await nativeIdForDigest(cwd, operation.sourceObjectDigest, this.#gitExecutable, await this.#environment());
        await this.#run(cwd, ["worktree", "add", "-b", branchShort(operation.branchRef), operation.destinationWorktreePath, native]);
        return;
      }
      case "worktree-create-existing-branch":
        assertWorktreeDestination(intent.repository.repositoryRoot, operation.destinationWorktreePath);
        await this.#run(cwd, ["worktree", "add", operation.destinationWorktreePath, operation.branchRef]);
        return;
      case "worktree-move":
        assertWorktreeDestination(intent.repository.repositoryRoot, operation.destinationWorktreePath);
        await this.#run(cwd, ["worktree", "move", operation.sourceWorktreePath, operation.destinationWorktreePath]);
        return;
      case "worktree-remove-clean":
        await this.#run(cwd, ["worktree", "remove", operation.sourceWorktreePath]);
        return;
      case "worktree-remove-force":
        await this.#run(cwd, ["worktree", "remove", "--force", operation.sourceWorktreePath]);
        return;
      case "upstream-set": {
        const name = branchShort(operation.localBranchRef);
        await this.#run(cwd, ["config", "--local", `branch.${name}.remote`, operation.remote.remoteName]);
        await this.#run(cwd, ["config", "--local", `branch.${name}.merge`, operation.remoteBranchRef]);
        return;
      }
      case "upstream-unset": {
        const name = branchShort(operation.localBranchRef);
        await this.#run(cwd, ["config", "--local", "--unset-all", `branch.${name}.remote`], { allowedExitCodes: [5] });
        await this.#run(cwd, ["config", "--local", "--unset-all", `branch.${name}.merge`], { allowedExitCodes: [5] });
        return;
      }
    }
  }

  async #inspectAgainstRecipe(intent: OperatorGitIntent): Promise<GitMutationInspection> {
    const repository = await this.observe(intent.repository.repositoryRoot, intent.repository.worktreePath);
    const conflict = await this.#readConflict(intent.repository.worktreePath, repository);
    let outcome: GitLookupOutcome;
    if (repository.repositoryStateDigest === intent.resultRecipe.expectedSuccessRepositoryStateDigest) outcome = "exact-applied";
    else if (conflict !== null && sameConflict(conflict, intent.resultRecipe.expectedConflict)) outcome = "exact-conflict";
    else if (repository.repositoryStateDigest === intent.resultRecipe.beforeRepositoryStateDigest) outcome = "exact-no-effect";
    else outcome = "inconsistent";
    const evidenceDigest = digest({
      schemaVersion: 1,
      observedAt: this.#clock(),
      custodyEffectBindingDigest: intent.authorisation.effectBindingDigest,
      repository,
      conflict,
      outcome,
    });
    return {
      outcome,
      repository,
      evidenceDigest,
      failureSignatureDigest: outcome === "inconsistent"
        ? digest({ class: "typed-git-result-mismatch", repositoryStateDigest: repository.repositoryStateDigest })
        : null,
      conflict,
    };
  }

  async #readConflict(worktreePath: string, repository: GitRepositoryBinding): Promise<GitConflictRecipe | null> {
    const operationState = await this.#operationState(worktreePath);
    if (operationState === "clean") return null;
    const output = await this.#run(worktreePath, ["ls-files", "--unmerged", "-z"]);
    const records = output.stdout.split("\0").filter(Boolean);
    const byPath = new Map<string, { stage1Digest: Sha256Digest | null; stage2Digest: Sha256Digest | null; stage3Digest: Sha256Digest | null }>();
    for (const record of records) {
      const match = /^\d+ ([0-9a-f]{40,64}) ([123])\t(.+)$/u.exec(record);
      if (match === null) throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "Git conflict index record is malformed");
      const [, native = "", stage = "", path = ""] = match;
      assertRelativeGitPath(path);
      const digestValue = await objectDigestByNativeId(worktreePath, native, this.#gitExecutable, await this.#environment());
      const value = byPath.get(path) ?? { stage1Digest: null, stage2Digest: null, stage3Digest: null };
      if (stage === "1") value.stage1Digest = digestValue;
      if (stage === "2") value.stage2Digest = digestValue;
      if (stage === "3") value.stage3Digest = digestValue;
      byPath.set(path, value);
    }
    const conflictPaths = [...byPath].sort(([left], [right]) => left.localeCompare(right)).map(([path, stages]) => ({ path, ...stages }));
    return {
      kind: operationState,
      operationStateDigest: digest({ kind: operationState, conflictPaths }),
      indexDigest: repository.indexDigest,
      worktreeDigest: repository.worktreeDigest,
      conflictPaths,
    };
  }

  async #operationState(worktreePath: string): Promise<"clean" | "merge" | "rebase"> {
    const paths = (await this.#run(worktreePath, [
      "rev-parse", "--path-format=absolute", "--git-path", "rebase-merge", "--git-path", "rebase-apply", "--git-path", "MERGE_HEAD",
    ])).stdout.trim().split("\n");
    const { existsSync } = await import("node:fs");
    if (paths.slice(0, 2).some((path) => existsSync(path))) return "rebase";
    if (paths[2] !== undefined && existsSync(paths[2])) return "merge";
    return "clean";
  }

  async #environment(): Promise<NodeJS.ProcessEnv> {
    const home = join(this.#privateStateRoot, "git-home");
    const hooks = join(this.#privateStateRoot, "empty-hooks");
    await mkdir(home, { recursive: true, mode: 0o700 });
    await mkdir(hooks, { recursive: true, mode: 0o700 });
    return {
      PATH: "/usr/bin:/bin",
      HOME: home,
      LANG: "C",
      LC_ALL: "C",
      TZ: "UTC",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "/usr/bin/false",
      GIT_EDITOR: "/usr/bin/true",
      GIT_SEQUENCE_EDITOR: "/usr/bin/true",
      GIT_PAGER: "cat",
      PAGER: "cat",
      GIT_MERGE_AUTOEDIT: "no",
      AGENT_FABRIC_EMPTY_HOOKS: hooks,
    };
  }

  async #run(
    cwd: string,
    args: readonly string[],
    options: {
      allowedExitCodes?: readonly number[];
      stdin?: string;
      environment?: NodeJS.ProcessEnv;
    } = {},
  ): Promise<{ stdout: string; stderr: string }> {
    const environment = { ...(await this.#environment()), ...options.environment };
    const hooks = environment.AGENT_FABRIC_EMPTY_HOOKS;
    if (typeof hooks !== "string") throw new Error("sealed hooks directory is unavailable");
    const fixedArgs = [
      "-c", `core.hooksPath=${hooks}`,
      "-c", "core.pager=cat",
      "-c", "color.ui=false",
      "-c", "commit.gpgSign=false",
      "-c", "tag.gpgSign=false",
      "-c", "credential.helper=",
      ...args,
    ];
    return await new Promise((resolvePromise, rejectPromise) => {
      const child = execFile(this.#gitExecutable, fixedArgs, {
        cwd,
        env: environment,
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT,
        encoding: "utf8",
      }, (error, stdout, stderr) => {
        const exitCode = typeof (error as NodeJS.ErrnoException & { code?: unknown } | null)?.code === "number"
          ? (error as unknown as { code: number }).code
          : error === null ? 0 : -1;
        if (error !== null && !(options.allowedExitCodes ?? []).includes(exitCode)) {
          rejectPromise(new ProjectFabricCoreError("CONFLICT", "bounded Git operation failed", {
            exitCode,
            stderrDigest: sha256(String(stderr).slice(0, 4096)),
          }));
          return;
        }
        resolvePromise({ stdout: String(stdout), stderr: String(stderr) });
      });
      if (options.stdin !== undefined) child.stdin?.end(options.stdin, "utf8");
    });
  }
}

function digest(value: unknown): Sha256Digest {
  return `sha256:${sha256(canonicalJson(value))}` as Sha256Digest;
}

function contains(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !path.startsWith(sep));
}

function assertSameRepositoryBinding(actual: GitRepositoryBinding, expected: GitRepositoryBinding, message: string): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new ProjectFabricCoreError("STALE_REVISION", message);
}

function assertRelativeGitPath(path: string): void {
  if (path.length === 0 || path.startsWith("/") || path.includes("\0") || path.split("/").includes("..") || path.startsWith(":")) {
    throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "Git path is not canonical repository-relative data");
  }
}

function assertFullRef(ref: string): void {
  if (!/^refs\/[A-Za-z0-9._/-]+$/u.test(ref) || ref.includes("..") || ref.includes("@{") || ref.endsWith("/") || ref.includes("//")) {
    throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "Git ref is not fully qualified safe data");
  }
}

function branchShort(ref: string): string {
  assertFullRef(ref);
  if (!ref.startsWith("refs/heads/")) throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "Git branch ref is not local");
  return ref.slice("refs/heads/".length);
}

function operationPaths(operation: GitOperation): string[] {
  if (operation.variant === "stage" || operation.variant === "unstage") return [...operation.paths];
  return [];
}

function operationRefs(operation: GitOperation): string[] {
  switch (operation.variant) {
    case "fetch": case "pull-fast-forward-only": case "pull-merge-commit-start": case "pull-rebase-start":
    case "push-fast-forward-only": case "push-force-with-lease": return [operation.sourceRef, operation.destinationRef];
    case "merge-fast-forward-only-start": case "merge-commit-start":
    case "rebase-current-branch-no-autostash-start": return [operation.sourceRef, operation.destinationRef];
    case "branch-create": return [operation.destinationRef];
    case "branch-rename": return [operation.sourceRef, operation.destinationRef];
    case "branch-delete-merged-only": case "branch-delete-force": return [operation.sourceRef];
    case "worktree-create-new-branch": case "worktree-create-existing-branch": return [operation.branchRef];
    case "upstream-set": case "upstream-unset": return [operation.localBranchRef, operation.remoteBranchRef];
    default: return [];
  }
}

function refDigestChecks(operation: GitOperation): Array<[string, Sha256Digest]> {
  switch (operation.variant) {
    case "merge-fast-forward-only-start": case "merge-commit-start":
    case "rebase-current-branch-no-autostash-start": return [
      [operation.sourceRef, operation.sourceObjectDigest],
      [operation.destinationRef, operation.destinationObjectDigest],
    ];
    case "branch-rename": case "branch-delete-force": return [[operation.sourceRef, operation.sourceObjectDigest]];
    case "branch-delete-merged-only": return [[operation.sourceRef, operation.sourceObjectDigest]];
    default: return [];
  }
}

function requiresRemote(operation: GitOperation): boolean {
  return ["fetch", "pull-fast-forward-only", "pull-merge-commit-start", "pull-rebase-start", "push-fast-forward-only", "push-force-with-lease"]
    .includes(operation.variant);
}

function usesWorktreeContent(operation: GitOperation): boolean {
  return ["stage", "unstage", "commit", "pull-fast-forward-only", "pull-merge-commit-start", "pull-rebase-start",
    "merge-fast-forward-only-start", "merge-commit-start", "merge-continue", "merge-abort",
    "rebase-current-branch-no-autostash-start", "rebase-continue", "rebase-abort"].includes(operation.variant);
}

function requiredRemote(context: GitMutationDispatchContext): string {
  if (context.remoteTarget === null) throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "registered remote target is unavailable");
  return context.remoteTarget;
}

function assertWorktreeDestination(repositoryRoot: string, destination: string): void {
  if (dirname(destination) !== join(repositoryRoot, ".worktrees") || basename(destination).length === 0) {
    throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "worktree destination is not a direct repository-owned child");
  }
}

function commitEnvironment(author: { name: string; email: string; timestamp: string }, committer: { name: string; email: string; timestamp: string }): NodeJS.ProcessEnv {
  return {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_AUTHOR_DATE: author.timestamp,
    GIT_COMMITTER_NAME: committer.name,
    GIT_COMMITTER_EMAIL: committer.email,
    GIT_COMMITTER_DATE: committer.timestamp,
  };
}

function zeroObject(length: number): string {
  return "0".repeat(length);
}

async function objectDigestByNativeId(
  cwd: string,
  nativeId: string,
  gitExecutable: string,
  environment: NodeJS.ProcessEnv,
): Promise<Sha256Digest> {
  const result = await runRaw(gitExecutable, cwd, ["cat-file", "--batch"], `${nativeId}\n`, environment);
  const firstLf = result.indexOf("\n");
  if (firstLf < 0) throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "Git object response is incomplete");
  const header = result.slice(0, firstLf).split(" ");
  const type = header[1];
  const size = Number(header[2]);
  if (type === undefined || !Number.isSafeInteger(size) || size < 0) throw new ProjectFabricCoreError("RECOVERY_REQUIRED", "Git object response is invalid");
  const content = Buffer.from(result.slice(firstLf + 1, firstLf + 1 + size), "binary");
  const hash = createHash("sha256").update(Buffer.from(`${type} ${String(size)}\0`)).update(content).digest("hex");
  return `sha256:${hash}` as Sha256Digest;
}

async function nativeIdForDigest(
  cwd: string,
  target: Sha256Digest,
  gitExecutable: string,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  const refs = await runRaw(gitExecutable, cwd, ["for-each-ref", "--format=%(objectname)"], undefined, environment);
  for (const nativeId of [...new Set(refs.trim().split("\n").filter(Boolean))].slice(0, 4096)) {
    if (await objectDigestByNativeId(cwd, nativeId, gitExecutable, environment) === target) return nativeId;
  }
  throw new ProjectFabricCoreError("NOT_FOUND", "reviewed Git object is not reachable from a bounded ref");
}

function runRaw(
  executable: string,
  cwd: string,
  args: readonly string[],
  stdin: string | undefined,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = execFile(executable, args, { cwd, env: environment, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, encoding: "buffer" }, (error, stdout) => {
      if (error !== null) return rejectPromise(error);
      resolvePromise((stdout as Buffer).toString("binary"));
    });
    if (stdin !== undefined) child.stdin?.end(stdin);
  });
}

function sameConflict(actual: GitConflictRecipe, expected: GitConflictRecipe | null): boolean {
  return expected !== null && canonicalJson(actual) === canonicalJson(expected);
}
