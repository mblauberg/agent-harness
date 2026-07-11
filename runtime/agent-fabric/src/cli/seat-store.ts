import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, realpath, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

export const MCP_SEATS = ["agy", "claude", "codex", "cursor", "kiro"] as const;
export type McpSeat = (typeof MCP_SEATS)[number];

export type SeatMetadata = {
  schemaVersion: 1;
  projectKey: string;
  projectPath: string;
  runId: string;
  seat: McpSeat;
  agentId: string;
  role: "chair" | "peer";
  credentialPath: string;
  expiresAt: string;
};

export type SeatPaths = {
  projectKey: string;
  projectPath: string;
  directory: string;
  credentialPath: string;
  metadataPath: string;
};

type SeatGenerationPointer = {
  schemaVersion: 1;
  projectKey: string;
  generation: string;
};

const GENERATION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

async function assertPrivateDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error(`private seat directory must not be a symbolic link: ${path}`);
  if (!info.isDirectory()) throw new Error(`private seat path is not a directory: ${path}`);
  await chmod(path, 0o700);
}

async function createPrivateChildDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error: unknown) {
    if (errorCode(error) !== "EEXIST") throw error;
  }
  await assertPrivateDirectory(path);
}

async function rejectUnsafeExistingFile(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`private seat file must not be a symbolic link: ${path}`);
    if (!info.isFile()) throw new Error(`private seat path is not a regular file: ${path}`);
  } catch (error: unknown) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

async function atomicPrivateWrite(path: string, contents: string): Promise<void> {
  await rejectUnsafeExistingFile(path);
  const temporaryPath = `${path}.tmp-${process.pid}-${randomBytes(12).toString("hex")}`;
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, flags, 0o600);
    await handle.writeFile(contents, "utf8");
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rejectUnsafeExistingFile(path);
    await rename(temporaryPath, path);
    const installed = await lstat(path);
    if (!installed.isFile() || installed.isSymbolicLink()) {
      throw new Error(`private seat write did not produce a regular file: ${path}`);
    }
    await chmod(path, 0o600);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function readPrivateFile(path: string): Promise<string> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o077) !== 0) {
    throw new Error(`private seat file must be a private regular file: ${path}`);
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || (opened.mode & 0o077) !== 0) {
      throw new Error(`private seat file changed while opening: ${path}`);
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

async function activeGeneration(directory: string, key: string): Promise<string | undefined> {
  const pointerPath = join(directory, "current.json");
  try {
    const pointer: unknown = JSON.parse(await readPrivateFile(pointerPath));
    if (
      typeof pointer !== "object" || pointer === null || Array.isArray(pointer) ||
      !("schemaVersion" in pointer) || pointer.schemaVersion !== 1 ||
      !("projectKey" in pointer) || pointer.projectKey !== key ||
      !("generation" in pointer) || typeof pointer.generation !== "string" ||
      !GENERATION_PATTERN.test(pointer.generation)
    ) {
      throw new Error(`MCP seat generation pointer is invalid: ${pointerPath}`);
    }
    return pointer.generation;
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

export function parseMcpSeat(value: string): McpSeat {
  if ((MCP_SEATS as readonly string[]).includes(value)) return value as McpSeat;
  throw new Error(`unsupported MCP seat ${JSON.stringify(value)}; expected one of ${MCP_SEATS.join(",")}`);
}

export async function canonicalProjectPath(project: string): Promise<string> {
  const path = await realpath(resolve(project));
  const info = await lstat(path);
  if (!info.isDirectory()) throw new Error(`MCP project is not a directory: ${path}`);
  return path;
}

export function projectKey(projectPath: string): string {
  return createHash("sha256").update(projectPath).digest("hex").slice(0, 24);
}

export async function resolveSeatPaths(input: {
  stateDirectory: string;
  project: string;
  seat: McpSeat;
  createDirectories?: boolean;
}): Promise<SeatPaths> {
  const projectPath = await canonicalProjectPath(input.project);
  const key = projectKey(projectPath);
  const seatsDirectory = join(input.stateDirectory, "seats");
  const directory = join(seatsDirectory, key);
  if (input.createDirectories === true) {
    await assertPrivateDirectory(input.stateDirectory);
    await createPrivateChildDirectory(seatsDirectory);
    await createPrivateChildDirectory(directory);
  }
  const generation = await activeGeneration(directory, key);
  const activeDirectory = generation === undefined ? directory : join(directory, "generations", generation);
  return {
    projectKey: key,
    projectPath,
    directory,
    credentialPath: join(activeDirectory, `${input.seat}.cap`),
    metadataPath: join(activeDirectory, `${input.seat}.json`),
  };
}

export async function installSeatGeneration(input: {
  stateDirectory: string;
  projectPath: string;
  generation: string;
  seats: Array<{ metadata: Omit<SeatMetadata, "credentialPath">; credential: string }>;
  beforeActivate?: () => void | Promise<void>;
}): Promise<Array<{ seat: McpSeat; credentialPath: string; metadataPath: string }>> {
  if (!GENERATION_PATTERN.test(input.generation)) throw new Error("MCP seat generation is invalid");
  if (input.seats.length === 0 || new Set(input.seats.map(({ metadata }) => metadata.seat)).size !== input.seats.length) {
    throw new Error("MCP seat generation must contain a non-empty distinct roster");
  }
  const first = input.seats[0];
  if (first === undefined) throw new Error("MCP seat generation must contain a seat");
  const root = await resolveSeatPaths({
    stateDirectory: input.stateDirectory,
    project: input.projectPath,
    seat: first.metadata.seat,
    createDirectories: true,
  });
  const generationsDirectory = join(root.directory, "generations");
  const generationDirectory = join(generationsDirectory, input.generation);
  await createPrivateChildDirectory(generationsDirectory);
  const stagingDirectory = join(generationsDirectory, `.staging-${input.generation}-${process.pid}-${randomBytes(12).toString("hex")}`);
  await createPrivateChildDirectory(stagingDirectory);
  const written: Array<{ seat: McpSeat; credentialPath: string; metadataPath: string }> = [];
  const expected = new Map<string, string>();
  try {
    for (const { metadata, credential } of input.seats) {
      if (!/^afc_[A-Za-z0-9_-]{43}$/u.test(credential)) throw new Error("daemon returned an invalid seat credential");
      if (metadata.projectKey !== root.projectKey || metadata.projectPath !== root.projectPath) {
        throw new Error(`seat metadata does not match its project-keyed path for ${metadata.seat}`);
      }
      const credentialPath = join(generationDirectory, `${metadata.seat}.cap`);
      const metadataPath = join(generationDirectory, `${metadata.seat}.json`);
      const installedMetadata: SeatMetadata = { ...metadata, credentialPath };
      expected.set(`${metadata.seat}.cap`, credential);
      expected.set(`${metadata.seat}.json`, `${JSON.stringify(installedMetadata, null, 2)}\n`);
      await atomicPrivateWrite(join(stagingDirectory, `${metadata.seat}.cap`), credential);
      await atomicPrivateWrite(join(stagingDirectory, `${metadata.seat}.json`), expected.get(`${metadata.seat}.json`) ?? "");
      written.push({ seat: metadata.seat, credentialPath, metadataPath });
    }
    await input.beforeActivate?.();
    try {
      await rename(stagingDirectory, generationDirectory);
    } catch (error: unknown) {
      if (!(["EEXIST", "ENOTEMPTY"] as Array<string | undefined>).includes(errorCode(error))) throw error;
      const entries = (await readdir(generationDirectory)).sort();
      if (entries.length !== expected.size || entries.some((entry) => !expected.has(entry))) {
        throw new Error(`existing MCP seat generation differs from requested immutable generation: ${input.generation}`);
      }
      for (const [file, contents] of expected) {
        if (await readPrivateFile(join(generationDirectory, file)) !== contents) {
          throw new Error(`existing MCP seat generation differs from requested immutable generation: ${input.generation}`);
        }
      }
    }
    const pointer: SeatGenerationPointer = { schemaVersion: 1, projectKey: root.projectKey, generation: input.generation };
    await atomicPrivateWrite(join(root.directory, "current.json"), `${JSON.stringify(pointer, null, 2)}\n`);
    return written;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
