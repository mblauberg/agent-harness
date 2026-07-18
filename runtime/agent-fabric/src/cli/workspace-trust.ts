import { createHash, randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { constants } from "node:fs";
import { chmod, lstat, open, realpath, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";

import type { FabricPaths } from "./paths.js";

const PROFILE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const DEFAULT_PROFILES = ["headless", "observed", "interactive", "paired-visible", "paired-observed"];

export type WorkspaceTrustEntry = {
  canonicalPath: string;
  approvedAt: string;
  approvedBy: "local-operator";
  device: number;
  inode: number;
  expiresAt?: string;
  allowedProfiles: string[];
};

export type TrustedWorkspaceIdentity = {
  canonicalRoot: string;
  trustRecordDigest: `sha256:${string}`;
  entry: WorkspaceTrustEntry;
};

type WorkspaceTrustRegistry = { schemaVersion: 1; entries: WorkspaceTrustEntry[] };
let mutationQueue: Promise<void> = Promise.resolve();

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`${field} must be an ISO timestamp`);
  return parsed;
}

function validateRegistry(value: unknown): WorkspaceTrustRegistry {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("schemaVersion" in value) || value.schemaVersion !== 1 || !("entries" in value) || !Array.isArray(value.entries)) {
    throw new Error("workspace trust registry is invalid");
  }
  const entries: WorkspaceTrustEntry[] = value.entries.map((candidate) => {
    if (
      typeof candidate !== "object" || candidate === null || Array.isArray(candidate) ||
      !("canonicalPath" in candidate) || typeof candidate.canonicalPath !== "string" || !isAbsolute(candidate.canonicalPath) ||
      !("approvedAt" in candidate) || typeof candidate.approvedAt !== "string" ||
      !("approvedBy" in candidate) || candidate.approvedBy !== "local-operator" ||
      !("device" in candidate) || typeof candidate.device !== "number" || !Number.isSafeInteger(candidate.device) || candidate.device < 0 ||
      !("inode" in candidate) || typeof candidate.inode !== "number" || !Number.isSafeInteger(candidate.inode) || candidate.inode < 0 ||
      !("allowedProfiles" in candidate) || !Array.isArray(candidate.allowedProfiles) || candidate.allowedProfiles.length === 0 ||
      candidate.allowedProfiles.some((profile: unknown) => typeof profile !== "string" || !PROFILE_PATTERN.test(profile)) ||
      ("expiresAt" in candidate && candidate.expiresAt !== undefined && typeof candidate.expiresAt !== "string")
    ) throw new Error("workspace trust entry is invalid");
    timestamp(candidate.approvedAt, "workspace approval");
    if (typeof candidate.expiresAt === "string") timestamp(candidate.expiresAt, "workspace expiry");
    return {
      canonicalPath: candidate.canonicalPath,
      approvedAt: candidate.approvedAt,
      approvedBy: "local-operator",
      device: candidate.device,
      inode: candidate.inode,
      ...(typeof candidate.expiresAt === "string" ? { expiresAt: candidate.expiresAt } : {}),
      allowedProfiles: [...new Set(candidate.allowedProfiles as string[])].sort(),
    };
  });
  if (new Set(entries.map((entry) => entry.canonicalPath)).size !== entries.length) throw new Error("workspace trust entries must be unique");
  return { schemaVersion: 1, entries: entries.sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath)) };
}

async function readRegistry(path: string): Promise<WorkspaceTrustRegistry> {
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o077) !== 0) throw new Error("workspace trust registry must be a private regular file");
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || (opened.mode & 0o077) !== 0) throw new Error("workspace trust registry changed while opening");
      return validateRegistry(JSON.parse(await handle.readFile("utf8")));
    } finally {
      await handle.close();
    }
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return { schemaVersion: 1, entries: [] };
    throw error;
  }
}

async function writeRegistry(path: string, registry: WorkspaceTrustRegistry): Promise<void> {
  try {
    const existing = await lstat(path);
    if (!existing.isFile() || existing.isSymbolicLink() || (existing.mode & 0o077) !== 0) {
      throw new Error("workspace trust registry must be a private regular file");
    }
  } catch (error: unknown) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(12).toString("hex")}`;
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(validateRegistry(registry), null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
    await chmod(path, 0o600);
    const directory = await open(dirname(path), constants.O_RDONLY);
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    await rm(temporary, { force: true });
  }
}

async function withRegistryMutationLock<T>(stateDirectory: string, operation: () => Promise<T>): Promise<T> {
  let releaseQueue!: () => void;
  const previous = mutationQueue;
  mutationQueue = new Promise<void>((resolveQueue) => { releaseQueue = resolveQueue; });
  await previous;
  const lockPath = join(stateDirectory, "trusted-workspaces.lock.sqlite3");
  const lock = new Database(lockPath);
  try {
    lock.pragma("busy_timeout = 10000");
    lock.exec("CREATE TABLE IF NOT EXISTS registry_lock(singleton INTEGER PRIMARY KEY CHECK(singleton=1)); BEGIN IMMEDIATE");
    await chmod(lockPath, 0o600);
    try {
      const result = await operation();
      lock.exec("COMMIT");
      return result;
    } catch (error: unknown) {
      if (lock.inTransaction) lock.exec("ROLLBACK");
      throw error;
    }
  } finally {
    lock.close();
    releaseQueue();
  }
}

async function canonicalWorkspace(path: string): Promise<{ canonicalPath: string; device: number; inode: number }> {
  if (path.split(/[\\/]/u).includes("..")) throw new Error("workspace trust refuses lexical ancestor broadening");
  const requested = resolve(path);
  const requestedInfo = await lstat(requested);
  if (requestedInfo.isSymbolicLink()) throw new Error("workspace trust does not accept a symbolic-link root");
  if (!requestedInfo.isDirectory()) throw new Error("trusted workspace must be a directory");
  const canonical = await realpath(requested);
  const canonicalInfo = await lstat(canonical);
  if (!canonicalInfo.isDirectory() || canonicalInfo.isSymbolicLink()) throw new Error("trusted workspace identity is unsafe");
  const home = await realpath(homedir());
  if (canonical === parse(canonical).root || canonical === home) throw new Error("workspace trust refuses filesystem-root or home-wide authority");
  return { canonicalPath: canonical, device: canonicalInfo.dev, inode: canonicalInfo.ino };
}

async function identityMatches(entry: WorkspaceTrustEntry): Promise<boolean> {
  try {
    const info = await lstat(entry.canonicalPath);
    return info.isDirectory() && !info.isSymbolicLink() && info.dev === entry.device && info.ino === entry.inode &&
      await realpath(entry.canonicalPath) === entry.canonicalPath;
  } catch {
    return false;
  }
}

function trustRecordDigest(entry: WorkspaceTrustEntry): `sha256:${string}` {
  const normalized = JSON.stringify({
    allowedProfiles: entry.allowedProfiles,
    approvedAt: entry.approvedAt,
    approvedBy: entry.approvedBy,
    canonicalPath: entry.canonicalPath,
    device: entry.device,
    ...(entry.expiresAt === undefined ? {} : { expiresAt: entry.expiresAt }),
    inode: entry.inode,
  });
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

function option(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  const value = index === -1 ? undefined : arguments_[index + 1];
  if (index !== -1 && (value === undefined || value.startsWith("--"))) throw new Error(`${name} requires a value`);
  return value;
}

export async function trustedWorkspaceRoots(input: {
  stateDirectory: string;
  executionProfile?: string;
  now?: Date;
}): Promise<string[]> {
  const registry = await readRegistry(join(input.stateDirectory, "trusted-workspaces.json"));
  const now = (input.now ?? new Date()).getTime();
  const candidates = registry.entries
    .filter((entry) => input.executionProfile === undefined || entry.allowedProfiles.includes(input.executionProfile))
    .filter((entry) => entry.expiresAt === undefined || timestamp(entry.expiresAt, "workspace expiry") > now);
  const matches = await Promise.all(candidates.map(identityMatches));
  return candidates.filter((_entry, index) => matches[index] === true).map((entry) => entry.canonicalPath);
}

export async function trustedWorkspaceIdentity(input: {
  stateDirectory: string;
  canonicalRoot: string;
  executionProfile?: string;
  now?: Date;
}): Promise<TrustedWorkspaceIdentity> {
  const identity = await canonicalWorkspace(input.canonicalRoot);
  const registry = await readRegistry(join(input.stateDirectory, "trusted-workspaces.json"));
  const entry = registry.entries.find((candidate) => candidate.canonicalPath === identity.canonicalPath);
  if (entry === undefined) throw new Error("workspace root is not trusted");
  if (entry.expiresAt !== undefined && timestamp(entry.expiresAt, "workspace expiry") <= (input.now ?? new Date()).getTime()) {
    throw new Error("workspace trust record is expired");
  }
  if (input.executionProfile !== undefined && !entry.allowedProfiles.includes(input.executionProfile)) {
    throw new Error("workspace trust record does not allow the requested profile");
  }
  if (!await identityMatches(entry)) throw new Error("workspace trust record no longer matches the live root identity");
  return {
    canonicalRoot: entry.canonicalPath,
    trustRecordDigest: trustRecordDigest(entry),
    entry: { ...entry, allowedProfiles: [...entry.allowedProfiles] },
  };
}

export async function runWorkspaceTrust(
  arguments_: string[],
  paths: FabricPaths,
  now = new Date(),
): Promise<Record<string, unknown>> {
  const action = arguments_[0];
  const registryPath = join(paths.stateDirectory, "trusted-workspaces.json");
  const registry = await readRegistry(registryPath);
  if (action === "list") return { schemaVersion: 1, registryPath, entries: registry.entries };
  const requested = arguments_[1];
  if (requested === undefined || requested.startsWith("--")) throw new Error(`workspace ${String(action)} requires a path`);
  const identity = await canonicalWorkspace(requested);
  const { canonicalPath } = identity;
  const existing = registry.entries.find((entry) => entry.canonicalPath === canonicalPath);
  if (action === "inspect") {
    const expired = existing?.expiresAt !== undefined && timestamp(existing.expiresAt, "workspace expiry") <= now.getTime();
    const trusted = existing !== undefined && !expired && await identityMatches(existing);
    return { schemaVersion: 1, canonicalPath, trusted, expired, entry: existing ?? null };
  }
  if (action === "revoke") {
    return await withRegistryMutationLock(paths.stateDirectory, async () => {
      const current = await readRegistry(registryPath);
      const currentEntry = current.entries.find((entry) => entry.canonicalPath === canonicalPath);
      if (currentEntry === undefined) return { schemaVersion: 1, canonicalPath, revoked: false };
      await writeRegistry(registryPath, { schemaVersion: 1, entries: current.entries.filter((entry) => entry.canonicalPath !== canonicalPath) });
      return { schemaVersion: 1, canonicalPath, revoked: true };
    });
  }
  if (action !== "trust") throw new Error("workspace command must be trust, inspect, list or revoke");
  const profileValue = option(arguments_, "--profiles");
  const requestedProfiles = profileValue?.split(",")
    .map((profile) => profile.trim())
    .filter((profile) => profile.length > 0);
  if (requestedProfiles !== undefined &&
    (requestedProfiles.length === 0 || requestedProfiles.some((profile) => !PROFILE_PATTERN.test(profile)))) {
    throw new Error("workspace profiles are invalid");
  }
  const expiresAt = option(arguments_, "--expires-at");
  if (expiresAt !== undefined && timestamp(expiresAt, "workspace expiry") <= now.getTime()) throw new Error("workspace trust expiry must be in the future");
  return await withRegistryMutationLock(paths.stateDirectory, async () => {
    const current = await readRegistry(registryPath);
    const currentEntry = current.entries.find((item) => item.canonicalPath === canonicalPath);
    const currentEntryIsLive = currentEntry !== undefined &&
      (currentEntry.expiresAt === undefined || timestamp(currentEntry.expiresAt, "workspace expiry") > now.getTime()) &&
      await identityMatches(currentEntry);
    if (currentEntryIsLive && profileValue === undefined && expiresAt === undefined) {
      return {
        schemaVersion: 1,
        trusted: true,
        alreadyTrusted: true,
        entry: { ...currentEntry, allowedProfiles: [...currentEntry.allowedProfiles] },
      };
    }
    if (currentEntry === undefined) {
      const broadened = current.entries.find((item) => item.canonicalPath.startsWith(`${canonicalPath}${sep}`));
      if (broadened !== undefined) throw new Error(`workspace trust refuses ancestor broadening over ${broadened.canonicalPath}`);
    }
    const allowedProfiles = requestedProfiles ?? currentEntry?.allowedProfiles ?? DEFAULT_PROFILES;
    const effectiveExpiry = expiresAt ?? currentEntry?.expiresAt;
    if (effectiveExpiry !== undefined && timestamp(effectiveExpiry, "workspace expiry") <= now.getTime()) {
      throw new Error("workspace trust expiry must be in the future");
    }
    const entry: WorkspaceTrustEntry = {
      canonicalPath,
      approvedAt: now.toISOString(),
      approvedBy: "local-operator",
      device: identity.device,
      inode: identity.inode,
      ...(effectiveExpiry === undefined ? {} : { expiresAt: effectiveExpiry }),
      allowedProfiles: [...new Set(allowedProfiles)].sort(),
    };
    await writeRegistry(registryPath, {
      schemaVersion: 1,
      entries: [...current.entries.filter((item) => item.canonicalPath !== canonicalPath), entry],
    });
    return { schemaVersion: 1, trusted: true, entry };
  });
}
