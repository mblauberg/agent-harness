import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { parseSha256Digest, parseTimestamp } from "@local/agent-fabric-protocol";
import type { ProjectionFact, GitHostedChecks, Timestamp } from "@local/agent-fabric-protocol";
import { isAbsolute } from "node:path";

import type { GitHostedChecksBinding, GitHostedChecksPort } from "./git-repository-read.js";

export type GitHubHostedChecksProcessRequest = Readonly<{
  executable: string;
  arguments: readonly string[];
  timeoutMs: number;
  maximumOutputBytes: number;
}>;

export interface GitHubHostedChecksProcessPort {
  run(request: GitHubHostedChecksProcessRequest): Promise<Buffer>;
}

export type GitHubCliHostedChecksOptions = Readonly<{
  executable: string;
  executableDigest: string;
  hostname: "github.com";
  repository: string;
  canonicalRepositoryRoot: string;
  process: GitHubHostedChecksProcessPort;
  clock?: () => number;
}>;

export type OptionalGitHubHostedChecksConfiguration =
  | Readonly<{ enabled: false }>
  | Readonly<{
      enabled: true;
      executable: string;
      executableDigest: string;
      hostname: "github.com";
      repository: string;
      canonicalRepositoryRoot: string;
    }>;

export async function createOptionalGitHubHostedChecksAdapter(
  configuration: OptionalGitHubHostedChecksConfiguration,
): Promise<GitHostedChecksPort | undefined> {
  assertClosedConfiguration(configuration);
  if (!configuration.enabled) return undefined;
  assertOptions({ ...configuration, process: SEALED_GITHUB_PROCESS });
  const executable = await realpath(configuration.executable).catch(() => null);
  if (executable === null || executable !== configuration.executable) {
    throw new TypeError("GitHub CLI executable is missing, non-canonical or resolves through a symlink");
  }
  const executableInfo = await lstat(executable);
  if (!executableInfo.isFile() || (executableInfo.mode & 0o111) === 0) {
    throw new TypeError("GitHub CLI executable is not an executable regular file");
  }
  const digest = parseSha256Digest(
    `sha256:${createHash("sha256").update(await readFile(executable)).digest("hex")}`,
    "githubHostedChecks.observedExecutableDigest",
  );
  if (digest !== configuration.executableDigest) throw new TypeError("GitHub CLI executable digest changed");
  const repositoryRoot = await realpath(configuration.canonicalRepositoryRoot).catch(() => null);
  if (repositoryRoot === null || repositoryRoot !== configuration.canonicalRepositoryRoot) {
    throw new TypeError("GitHub hosted checks repository root is missing or non-canonical");
  }
  if (!(await lstat(repositoryRoot)).isDirectory()) {
    throw new TypeError("GitHub hosted checks repository root is not a directory");
  }
  return new GitHubCliHostedChecksAdapter({
    ...configuration,
    process: new PinnedGitHubProcess(configuration.executable, configuration.executableDigest),
  });
}

function assertClosedConfiguration(configuration: OptionalGitHubHostedChecksConfiguration): void {
  if (!isRecord(configuration) || typeof configuration.enabled !== "boolean") {
    throw new TypeError("GitHub hosted checks configuration is invalid");
  }
  const expected = configuration.enabled
    ? ["canonicalRepositoryRoot", "enabled", "executable", "executableDigest", "hostname", "repository"]
    : ["enabled"];
  if (!exactKeys(configuration, expected)) throw new TypeError("GitHub hosted checks configuration is not closed");
}

const SEALED_GITHUB_PROCESS: GitHubHostedChecksProcessPort = {
  run: async (request) => await runSealedGitHubProcess(request),
};

class PinnedGitHubProcess implements GitHubHostedChecksProcessPort {
  readonly #executable: string;
  readonly #digest: string;

  constructor(executable: string, digest: string) {
    this.#executable = executable;
    this.#digest = digest;
  }

  async run(request: GitHubHostedChecksProcessRequest): Promise<Buffer> {
    if (request.executable !== this.#executable) throw new TypeError("GitHub CLI process target changed");
    const canonical = await realpath(this.#executable).catch(() => null);
    if (canonical === null || canonical !== this.#executable) throw new TypeError("GitHub CLI executable changed");
    const info = await lstat(this.#executable);
    if (!info.isFile() || (info.mode & 0o111) === 0) throw new TypeError("GitHub CLI executable changed");
    const digest = `sha256:${createHash("sha256").update(await readFile(this.#executable)).digest("hex")}`;
    if (digest !== this.#digest) throw new TypeError("GitHub CLI executable digest changed");
    return runSealedGitHubProcess(request);
  }
}

function runSealedGitHubProcess(request: GitHubHostedChecksProcessRequest): Promise<Buffer> {
  return new Promise((resolveOutput, rejectOutput) => {
    execFile(request.executable, [...request.arguments], {
      cwd: "/",
      encoding: null,
      env: fixedGitHubEnvironment(),
      maxBuffer: request.maximumOutputBytes,
      timeout: request.timeoutMs,
      windowsHide: true,
      shell: false,
    }, (error, stdout) => {
      if (error === null) {
        resolveOutput(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
        return;
      }
      if (error.killed) {
        rejectOutput(new TypeError("GitHub hosted checks request exceeded its deadline"));
        return;
      }
      if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
        rejectOutput(new TypeError("GitHub hosted checks response exceeded its output bound"));
        return;
      }
      rejectOutput(new TypeError("GitHub hosted checks request was unavailable"));
    });
  });
}

function fixedGitHubEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    HOME: process.env.HOME ?? "/",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    GH_HOST: "github.com",
    GH_PROMPT_DISABLED: "1",
    NO_COLOR: "1",
  };
  if (typeof process.env.GH_CONFIG_DIR === "string" && isAbsolute(process.env.GH_CONFIG_DIR)) {
    environment.GH_CONFIG_DIR = process.env.GH_CONFIG_DIR;
  }
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN"] as const) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) environment[name] = value;
  }
  return environment;
}

/** Trusted, opt-in hosted facts with an exact-HEAD cache used only for explicit stale projection. */
type CachedGitHubChecksFact = {
  freshness: "live";
  source: "github";
  revision: number;
  observedAt: Timestamp;
  value: GitHostedChecks;
};

export class GitHubCliHostedChecksAdapter implements GitHostedChecksPort {
  readonly #options: GitHubCliHostedChecksOptions;
  readonly #clock: () => number;
  readonly #cache = new Map<string, CachedGitHubChecksFact>();

  constructor(options: GitHubCliHostedChecksOptions) {
    assertOptions(options);
    this.#options = options;
    this.#clock = options.clock ?? Date.now;
  }

  async read(binding: GitHostedChecksBinding): Promise<ProjectionFact<GitHostedChecks | null, "github">> {
    const observedAt = parseTimestamp(new Date(this.#clock()).toISOString(), "githubHostedChecks.observedAt");
    if (binding.canonicalRepositoryRoot !== this.#options.canonicalRepositoryRoot) {
      return {
        freshness: "unavailable",
        source: "github",
        revision: binding.snapshotRevision,
        observedAt,
        reason: "GitHub hosted checks target binding does not match the trusted repository",
      };
    }
    if (!validBinding(binding)) {
      return {
        freshness: "unavailable",
        source: "github",
        revision: binding.snapshotRevision,
        observedAt,
        reason: "GitHub hosted checks target binding is invalid",
      };
    }
    const cacheKey = `${binding.canonicalRepositoryRoot}\0${this.#options.repository}\0${binding.nativeHeadObjectId}\0${binding.headObjectDigest}`;
    try {
      const bytes = await this.#options.process.run({
        executable: this.#options.executable,
        arguments: [
          "api",
          "--hostname", this.#options.hostname,
          "--method", "GET",
          "-H", "Accept: application/vnd.github+json",
          "-H", "X-GitHub-Api-Version: 2026-03-10",
          `repos/${this.#options.repository}/commits/${binding.nativeHeadObjectId}/check-runs?per_page=100`,
          "--jq", "{total_count: .total_count, check_runs: [.check_runs[] | {id, head_sha, status, conclusion}]}",
        ],
        timeoutMs: 10_000,
        maximumOutputBytes: 262_144,
      });
      const parsed = parseResponse(bytes, binding.nativeHeadObjectId);
      const passing = parsed.checkRuns.filter((run) => passingConclusion(run)).length;
      const pending = parsed.checkRuns.filter((run) => run.status !== "completed").length;
      const failing = parsed.checkRuns.length - passing - pending;
      const state = failing > 0
        ? "failing"
        : pending > 0
          ? "pending"
          : parsed.checkRuns.length === 0
            ? "unknown"
            : "passing";
      const fact: CachedGitHubChecksFact = {
        freshness: "live",
        source: "github",
        revision: parsed.checkRuns.reduce((maximum, run) => Math.max(maximum, run.id), 0),
        observedAt,
        value: {
          repository: this.#options.repository,
          headObjectDigest: binding.headObjectDigest,
          state,
          total: parsed.checkRuns.length,
          passing,
          failing,
          pending,
        },
      };
      this.#remember(cacheKey, fact);
      return fact;
    } catch {
      const cached = this.#cache.get(cacheKey);
      if (cached !== undefined) return { ...cached, freshness: "stale" };
      return {
        freshness: "unavailable",
        source: "github",
        revision: binding.snapshotRevision,
        observedAt,
        reason: "GitHub hosted checks are unavailable",
      };
    }
  }

  #remember(key: string, fact: CachedGitHubChecksFact): void {
    this.#cache.delete(key);
    this.#cache.set(key, fact);
    while (this.#cache.size > 128) {
      const oldest = this.#cache.keys().next();
      if (oldest.done) break;
      this.#cache.delete(oldest.value);
    }
  }
}

type ParsedCheckRun = {
  id: number;
  headSha: string;
  status: "queued" | "in_progress" | "requested" | "waiting" | "pending" | "completed";
  conclusion: "action_required" | "cancelled" | "failure" | "neutral" | "skipped" | "stale" | "startup_failure" | "success" | "timed_out" | null;
};

function assertOptions(options: GitHubCliHostedChecksOptions): void {
  if (!isAbsolute(options.executable) || options.executable.includes("\0")) {
    throw new TypeError("GitHub CLI executable must be an absolute path");
  }
  parseSha256Digest(options.executableDigest, "githubHostedChecks.executableDigest");
  if (options.hostname !== "github.com") throw new TypeError("GitHub hosted checks hostname is not admitted");
  if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u.test(options.repository)) {
    throw new TypeError("GitHub repository must be an exact owner/name binding");
  }
  if (!isAbsolute(options.canonicalRepositoryRoot) || options.canonicalRepositoryRoot.includes("\0")) {
    throw new TypeError("GitHub repository root must be an absolute canonical path");
  }
}

function validBinding(binding: GitHostedChecksBinding): boolean {
  try {
    if (
      !isAbsolute(binding.canonicalWorktreePath) || binding.canonicalWorktreePath.includes("\0") ||
      !/^[0-9a-f]{40,64}$/u.test(binding.nativeHeadObjectId) ||
      !Number.isSafeInteger(binding.snapshotRevision) || binding.snapshotRevision < 0
    ) return false;
    parseSha256Digest(binding.repositoryStateDigest, "githubHostedChecks.repositoryStateDigest");
    parseSha256Digest(binding.headObjectDigest, "githubHostedChecks.headObjectDigest");
    parseTimestamp(binding.observedAt, "githubHostedChecks.bindingObservedAt");
    return true;
  } catch {
    return false;
  }
}

function parseResponse(bytes: Buffer, expectedHeadSha: string): { checkRuns: ParsedCheckRun[] } {
  if (bytes.length > 262_144) throw new TypeError("GitHub hosted checks output exceeds its bound");
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  if (!isRecord(value) || !exactKeys(value, ["check_runs", "total_count"])) {
    throw new TypeError("GitHub hosted checks response is not a closed object");
  }
  if (!Number.isSafeInteger(value.total_count) || Number(value.total_count) < 0 || Number(value.total_count) > 100) {
    throw new TypeError("GitHub hosted checks response exceeds 100 checks");
  }
  if (!Array.isArray(value.check_runs) || value.check_runs.length !== value.total_count) {
    throw new TypeError("GitHub hosted checks response is incomplete");
  }
  const checkRuns = value.check_runs.map((entry, index): ParsedCheckRun => {
    if (!isRecord(entry) || !exactKeys(entry, ["conclusion", "head_sha", "id", "status"])) {
      throw new TypeError(`GitHub check run ${String(index)} is not a closed object`);
    }
    if (!Number.isSafeInteger(entry.id) || Number(entry.id) < 1) throw new TypeError("GitHub check run id is invalid");
    if (entry.head_sha !== expectedHeadSha) throw new TypeError("GitHub check run is bound to another HEAD");
    if (
      entry.status !== "queued" && entry.status !== "in_progress" && entry.status !== "requested" &&
      entry.status !== "waiting" && entry.status !== "pending" && entry.status !== "completed"
    ) {
      throw new TypeError("GitHub check run status is invalid");
    }
    const conclusions = new Set(["action_required", "cancelled", "failure", "neutral", "skipped", "stale", "startup_failure", "success", "timed_out"]);
    if (entry.conclusion !== null && (typeof entry.conclusion !== "string" || !conclusions.has(entry.conclusion))) {
      throw new TypeError("GitHub check run conclusion is invalid");
    }
    if ((entry.status === "completed") === (entry.conclusion === null)) {
      throw new TypeError("GitHub check run completion and conclusion are inconsistent");
    }
    return {
      id: Number(entry.id),
      headSha: entry.head_sha,
      status: entry.status,
      conclusion: entry.conclusion as ParsedCheckRun["conclusion"],
    };
  });
  return { checkRuns };
}

function passingConclusion(run: ParsedCheckRun): boolean {
  return run.status === "completed" && (run.conclusion === "success" || run.conclusion === "neutral" || run.conclusion === "skipped");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}
