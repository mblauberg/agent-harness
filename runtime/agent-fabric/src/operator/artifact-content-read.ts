import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";

import type {
  ArtifactContentReadRequest,
  ArtifactContentReadResult,
  ArtifactMediaType,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import {
  captureRunArtifactRoot,
  materializeRunArtifactRoot,
  pathWithin,
  type RunArtifactRootCapture,
} from "../artifacts/run-root.js";
import { ProjectFabricCoreError } from "../project-session/contracts.js";
import {
  artifactLineCount,
  inertArtifactText,
  pageArtifactText,
} from "./artifact-content-safety.js";
import type { AuthenticatedOperatorCredential, OperatorStore } from "./store.js";

const SOURCE_LIMIT = 1_048_576;
const RENDERED_LIMIT = 2_097_152;
const CURSOR_VERSION = 1;

type ArtifactRow = {
  artifact_id: string;
  project_id: string;
  project_session_id: string | null;
  run_id: string | null;
  task_id: string | null;
  publisher_kind: string;
  publisher_ref: string;
  publisher_agent_id: string | null;
  source_kind: "project-file" | "run-file" | "git-private-diff";
  evidence_kind: string;
  relative_path: string;
  sha256: string;
  registry_state: string;
  quarantine_reason: string | null;
  revision: number;
  created_at: number;
};

type PhaseCapture = {
  credential: AuthenticatedOperatorCredential;
  artifact: ArtifactRow;
  sourceBinding: SourceBinding;
};

type RoutedSource = {
  sourceRoot: string;
  sourcePath: string;
  rootFingerprint: string;
};

type SourceBinding =
  | { kind: "git-private-diff"; privateStateRoot: string }
  | { kind: "run"; root: RunArtifactRootCapture }
  | { kind: "project"; projectId: string; canonicalRoot: string };

type CursorPayload = {
  v: 1;
  evidenceId: string;
  evidenceRevision: number;
  path: string;
  sourceDigest: string;
  renderedDigest: string;
  pageIndex: number;
  offset: number;
};

export type ArtifactContentReadServiceOptions = {
  database: Database.Database;
  operatorStore: OperatorStore;
  privateStateRoot: string;
  afterPhaseA?: () => void;
  runtimeKnownSecrets?: () => readonly string[];
};

function unavailable(
  request: ArtifactContentReadRequest,
  reason: Extract<ArtifactContentReadResult, { available: false }>['reason'],
): ArtifactContentReadResult {
  return { available: false, artifactRef: request.artifactRef, reason };
}

function asArtifactRow(value: unknown): ArtifactRow | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (
    typeof row.artifact_id !== "string" || typeof row.project_id !== "string" ||
    (row.project_session_id !== null && typeof row.project_session_id !== "string") ||
    (row.run_id !== null && typeof row.run_id !== "string") ||
    (row.task_id !== null && typeof row.task_id !== "string") ||
    typeof row.publisher_kind !== "string" || typeof row.publisher_ref !== "string" ||
    (row.publisher_agent_id !== null && typeof row.publisher_agent_id !== "string") ||
    !["project-file", "run-file", "git-private-diff"].includes(String(row.source_kind)) ||
    typeof row.evidence_kind !== "string" || typeof row.relative_path !== "string" ||
    typeof row.sha256 !== "string" || typeof row.registry_state !== "string" ||
    (row.quarantine_reason !== null && typeof row.quarantine_reason !== "string") ||
    typeof row.revision !== "number" || typeof row.created_at !== "number"
  ) return undefined;
  return row as ArtifactRow;
}

function sameArtifact(left: ArtifactRow, right: ArtifactRow): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameCredential(left: AuthenticatedOperatorCredential, right: AuthenticatedOperatorCredential): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mediaType(path: string, raw: string): ArtifactMediaType | undefined {
  const extension = extname(path).toLowerCase();
  if (extension === ".md" || extension === ".markdown") return "text/markdown";
  if (extension === ".diff" || extension === ".patch") return "text/x-diff";
  if ([".txt", ".log", ".yaml", ".yml", ".toml", ".ini", ""].includes(extension)) return "text/plain";
  if (extension !== ".json") return undefined;
  let depth = 0;
  let maximumDepth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of raw) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{" || character === "[") {
      depth += 1;
      maximumDepth = Math.max(maximumDepth, depth);
      if (maximumDepth > 128) return undefined;
    } else if (character === "}" || character === "]") depth -= 1;
    if (depth < 0) return undefined;
  }
  if (depth !== 0 || quoted) return undefined;
  try {
    JSON.parse(raw);
  } catch {
    return undefined;
  }
  return "application/json";
}

function sourceDigest(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export class ArtifactContentReadService {
  readonly #database: Database.Database;
  readonly #operatorStore: OperatorStore;
  readonly #privateStateRoot: string;
  readonly #afterPhaseA: (() => void) | undefined;
  readonly #runtimeKnownSecrets: () => readonly string[];
  readonly #cursorKey: Buffer;

  constructor(options: ArtifactContentReadServiceOptions) {
    this.#database = options.database;
    this.#operatorStore = options.operatorStore;
    this.#privateStateRoot = resolve(options.privateStateRoot);
    this.#afterPhaseA = options.afterPhaseA;
    this.#runtimeKnownSecrets = options.runtimeKnownSecrets ?? (() => []);
    const existing = this.#database.prepare(
      "SELECT key_material FROM artifact_content_cursor_keys WHERE singleton=1",
    ).get() as { key_material?: unknown } | undefined;
    const key = typeof existing?.key_material === "string"
      ? existing.key_material
      : randomBytes(32).toString("base64url");
    if (existing === undefined) {
      this.#database.prepare(
        "INSERT INTO artifact_content_cursor_keys(singleton, key_material) VALUES (1, ?)",
      ).run(key);
    }
    this.#cursorKey = Buffer.from(key, "base64url");
  }

  read(request: ArtifactContentReadRequest): ArtifactContentReadResult {
    let cursor: CursorPayload | null;
    try {
      cursor = request.cursor === null ? null : this.#decodeCursor(request.cursor);
    } catch {
      return unavailable(request, "stale");
    }
    let phaseA: PhaseCapture | ArtifactContentReadResult;
    try {
      phaseA = this.#database.transaction(() => this.#phaseA(request, cursor))();
    } catch (error: unknown) {
      if (error instanceof ProjectFabricCoreError) {
        if (error.code === "NOT_FOUND") return unavailable(request, "not-found");
        if (error.code === "RESOURCE_EXHAUSTED") return unavailable(request, "oversized");
        if (error.code === "PROTOCOL_INVALID") return unavailable(request, "unsupported-media");
        return unavailable(request, "forbidden");
      }
      return unavailable(request, "stale");
    }
    if ("available" in phaseA) return phaseA;
    this.#afterPhaseA?.();

    let routed: RoutedSource;
    try {
      routed = this.#route(phaseA.artifact, phaseA.sourceBinding);
    } catch (error: unknown) {
      if (error instanceof ProjectFabricCoreError && error.code === "NOT_FOUND") {
        return unavailable(request, "not-found");
      }
      return unavailable(request, "stale");
    }

    let source: { bytes: Buffer; text: string; mediaType: ArtifactMediaType };
    try {
      source = this.#readSource({ ...phaseA, ...routed });
    } catch (error: unknown) {
      if (error instanceof ProjectFabricCoreError) {
        if (error.code === "NOT_FOUND") return unavailable(request, "not-found");
        if (error.code === "CAPABILITY_FORBIDDEN") return unavailable(request, "forbidden");
        if (error.code === "RESOURCE_EXHAUSTED") return unavailable(request, "oversized");
        if (error.code === "PROTOCOL_INVALID") return unavailable(request, "unsupported-media");
      }
      return unavailable(request, "stale");
    }
    const inert = inertArtifactText(source.text, [request.credential.token, ...this.#runtimeKnownSecrets()]);
    if (!inert.safe) return unavailable(request, "unsafe-content");
    const renderedBytes = Buffer.byteLength(inert.content, "utf8");
    if (renderedBytes > RENDERED_LIMIT) return unavailable(request, "oversized");
    const renderedDigest = sourceDigest(Buffer.from(inert.content, "utf8"));
    if (cursor !== null && cursor.renderedDigest !== renderedDigest) return unavailable(request, "stale");
    const offset = cursor?.offset ?? 0;
    const pageIndex = cursor?.pageIndex ?? 0;
    let page;
    try {
      page = pageArtifactText({
        rendered: inert.content,
        offset,
        pageIndex,
        maximumBytes: request.maximumBytes,
        maximumLines: request.maximumLines,
      });
    } catch {
      return unavailable(request, "stale");
    }
    const nextCursor = page.nextOffset === renderedBytes
      ? null
      : this.#encodeCursor({
          v: CURSOR_VERSION,
          evidenceId: phaseA.artifact.artifact_id,
          evidenceRevision: phaseA.artifact.revision,
          path: phaseA.artifact.relative_path,
          sourceDigest: phaseA.artifact.sha256,
          renderedDigest,
          pageIndex: pageIndex + 1,
          offset: page.nextOffset,
        });

    let finalBinding: SourceBinding | null;
    try {
      finalBinding = this.#database.transaction(() => this.#phaseB(request, phaseA))();
    } catch {
      return unavailable(request, "stale");
    }
    if (finalBinding === null || JSON.stringify(finalBinding) !== JSON.stringify(phaseA.sourceBinding)) {
      return unavailable(request, "stale");
    }
    try {
      if (this.#route(phaseA.artifact, finalBinding).rootFingerprint !== routed.rootFingerprint) {
        return unavailable(request, "stale");
      }
    } catch {
      return unavailable(request, "stale");
    }
    return {
      available: true,
      artifactRef: request.artifactRef,
      mediaType: source.mediaType,
      content: page.content,
      totalBytes: source.bytes.length,
      totalLines: artifactLineCount(source.text),
      renderedTotalBytes: renderedBytes,
      renderedTotalLines: artifactLineCount(inert.content),
      pageIndex,
      lineFragment: page.lineFragment,
      pageContentDigest: page.pageContentDigest as never,
      renderedArtifactDigest: renderedDigest as never,
      nextCursor,
      transformation: inert.transformation,
      terminalNeutralised: true,
      capabilityValuesRedacted: true,
      credentialValuesRedacted: true,
    };
  }

  #authenticate(request: ArtifactContentReadRequest): AuthenticatedOperatorCredential {
    const credential = this.#operatorStore.authenticateCredential(request.credential.token);
    if (credential.capabilityId !== request.credential.capabilityId || !credential.actions.includes("read")) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "artifact read requires the exact read capability");
    }
    if (credential.context.projectId !== request.projectId) {
      throw new ProjectFabricCoreError("WRONG_PROJECT", "artifact read capability belongs to another project");
    }
    if (
      credential.projectSessionId !== undefined &&
      request.projectSessionId !== credential.projectSessionId
    ) throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "artifact read requires the exact capability session");
    if (request.projectSessionId !== undefined) {
      const session = this.#database.prepare(
        "SELECT 1 FROM project_sessions WHERE project_session_id=? AND project_id=?",
      ).get(request.projectSessionId, request.projectId);
      if (session === undefined) throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "artifact read session is unavailable");
    }
    return credential;
  }

  #phaseA(
    request: ArtifactContentReadRequest,
    cursor: CursorPayload | null,
  ): PhaseCapture | ArtifactContentReadResult {
    const credential = this.#authenticate(request);
    const artifact = asArtifactRow(this.#database.prepare("SELECT * FROM artifacts WHERE artifact_id=?").get(request.evidenceId));
    if (artifact === undefined || artifact.registry_state !== "active") return unavailable(request, "not-found");
    if (artifact.project_id !== request.projectId) return unavailable(request, "forbidden");
    if (
      request.projectSessionId !== undefined && artifact.project_session_id !== null &&
      artifact.project_session_id !== request.projectSessionId
    ) return unavailable(request, "forbidden");
    if (
      artifact.revision !== request.expectedEvidenceRevision ||
      artifact.relative_path !== request.artifactRef.path || artifact.sha256 !== request.artifactRef.digest
    ) return unavailable(request, "stale");
    if (cursor !== null && (
      cursor.v !== CURSOR_VERSION || cursor.evidenceId !== artifact.artifact_id ||
      cursor.evidenceRevision !== artifact.revision || cursor.path !== artifact.relative_path ||
      cursor.sourceDigest !== artifact.sha256 || cursor.pageIndex < 1 || cursor.offset < 1
    )) return unavailable(request, "stale");
    return { credential, artifact, sourceBinding: this.#captureSourceBinding(artifact) };
  }

  #captureSourceBinding(artifact: ArtifactRow): SourceBinding {
    if (artifact.source_kind === "git-private-diff") {
      const reserved = `private/git-diffs/${artifact.sha256.slice("sha256:".length)}.patch`;
      if (artifact.relative_path !== reserved || artifact.run_id !== null) {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "private Git artifact registration is invalid");
      }
      return { kind: "git-private-diff", privateStateRoot: this.#privateStateRoot };
    }
    if (artifact.run_id !== null) {
      const root = captureRunArtifactRoot(this.#database, artifact.run_id);
      if (root.projectId !== artifact.project_id || root.projectSessionId !== artifact.project_session_id) {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "artifact run scope changed");
      }
      return { kind: "run", root };
    }
    const project = this.#database.prepare("SELECT canonical_root FROM projects WHERE project_id=?")
      .get(artifact.project_id) as { canonical_root?: unknown } | undefined;
    if (typeof project?.canonical_root !== "string") throw new ProjectFabricCoreError("NOT_FOUND", "artifact project root is unavailable");
    return { kind: "project", projectId: artifact.project_id, canonicalRoot: project.canonical_root };
  }

  #route(artifact: ArtifactRow, binding: SourceBinding): RoutedSource {
    if (binding.kind === "git-private-diff") {
      if (artifact.source_kind !== "git-private-diff") {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "artifact source owner changed");
      }
      const root = realpathSync.native(binding.privateStateRoot);
      if (root !== binding.privateStateRoot) throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "private state root is not canonical");
      const sourceRoot = join(root, "private", "git-diffs");
      return { sourceRoot, sourcePath: join(sourceRoot, `${artifact.sha256.slice(7)}.patch`), rootFingerprint: `git:${root}` };
    }
    if (binding.kind === "run") {
      const root = materializeRunArtifactRoot(binding.root);
      if (artifact.source_kind === "run-file") {
        if (root.artifactRoot === null || root.projectRelativeDirectory === ".") {
          throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "run-file source has no dedicated run root");
        }
        return {
          sourceRoot: root.artifactRoot,
          sourcePath: resolve(root.artifactRoot, artifact.relative_path),
          rootFingerprint: JSON.stringify(root),
        };
      }
      if (artifact.source_kind !== "project-file") {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "artifact source owner changed");
      }
      return {
        sourceRoot: root.projectRoot,
        sourcePath: resolve(root.projectRoot, artifact.relative_path),
        rootFingerprint: JSON.stringify(root),
      };
    }
    if (artifact.source_kind !== "project-file" || binding.projectId !== artifact.project_id) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "artifact project source owner changed");
    }
    const root = realpathSync.native(binding.canonicalRoot);
    if (root !== binding.canonicalRoot) throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "artifact project root is not canonical");
    return { sourceRoot: root, sourcePath: resolve(root, artifact.relative_path), rootFingerprint: `project:${root}` };
  }

  #readSource(capture: PhaseCapture & RoutedSource): { bytes: Buffer; text: string; mediaType: ArtifactMediaType } {
    if (!pathWithin(capture.sourceRoot, capture.sourcePath)) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "artifact path escapes its fixed source root");
    }
    let canonicalRoot: string;
    let canonicalSource: string;
    try {
      canonicalRoot = realpathSync.native(capture.sourceRoot);
      canonicalSource = realpathSync.native(capture.sourcePath);
    } catch {
      throw new ProjectFabricCoreError("NOT_FOUND", "artifact source is absent");
    }
    if (canonicalRoot !== capture.sourceRoot || canonicalSource !== capture.sourcePath || !pathWithin(canonicalRoot, canonicalSource)) {
      throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "artifact source resolves through an untrusted alias");
    }
    let fd: number | undefined;
    try {
      fd = openSync(canonicalSource, constants.O_RDONLY | constants.O_NOFOLLOW);
      const before = fstatSync(fd);
      const pathBefore = statSync(canonicalSource);
      if (!before.isFile() || before.nlink !== 1) {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", "artifact source is not one regular file");
      }
      if (before.dev !== pathBefore.dev || before.ino !== pathBefore.ino) {
        throw new ProjectFabricCoreError("STALE_REVISION", "artifact path changed before reading");
      }
      if (before.size > SOURCE_LIMIT) throw new ProjectFabricCoreError("RESOURCE_EXHAUSTED", "artifact source is oversized");
      const buffer = Buffer.allocUnsafe(SOURCE_LIMIT + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(fd, buffer, length, buffer.length - length, null);
        if (count === 0) break;
        length += count;
      }
      if (length > SOURCE_LIMIT) {
        throw new ProjectFabricCoreError("RESOURCE_EXHAUSTED", "artifact source is oversized");
      }
      const bytes = buffer.subarray(0, length);
      const after = fstatSync(fd);
      const pathAfter = statSync(canonicalSource);
      if (
        before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs || after.dev !== pathAfter.dev || after.ino !== pathAfter.ino ||
        realpathSync.native(capture.sourceRoot) !== canonicalRoot ||
        realpathSync.native(capture.sourcePath) !== canonicalSource
      ) throw new ProjectFabricCoreError("STALE_REVISION", "artifact source changed while reading");
      if (sourceDigest(bytes) !== capture.artifact.sha256) {
        throw new ProjectFabricCoreError("STALE_REVISION", "artifact source digest changed");
      }
      if (bytes.includes(0)) throw new ProjectFabricCoreError("PROTOCOL_INVALID", "artifact source is binary");
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new ProjectFabricCoreError("PROTOCOL_INVALID", "artifact source is not valid UTF-8");
      }
      const classified = mediaType(capture.artifact.relative_path, text);
      if (classified === undefined) throw new ProjectFabricCoreError("PROTOCOL_INVALID", "artifact media type is unsupported");
      return { bytes, text, mediaType: classified };
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  #phaseB(request: ArtifactContentReadRequest, capture: PhaseCapture): SourceBinding | null {
    try {
      const credential = this.#authenticate(request);
      if (!sameCredential(credential, capture.credential)) return null;
      const artifact = asArtifactRow(this.#database.prepare("SELECT * FROM artifacts WHERE artifact_id=?").get(request.evidenceId));
      if (artifact === undefined || !sameArtifact(artifact, capture.artifact)) return null;
      return this.#captureSourceBinding(artifact);
    } catch {
      return null;
    }
  }

  #encodeCursor(payload: CursorPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = createHmac("sha256", this.#cursorKey).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  #decodeCursor(value: string): CursorPayload {
    const parts = value.split(".");
    if (parts.length !== 2 || value.length > 4096) throw new TypeError("artifact cursor is invalid");
    const [encoded, signature] = parts;
    if (encoded === undefined || signature === undefined) throw new TypeError("artifact cursor is invalid");
    const expected = createHmac("sha256", this.#cursorKey).update(encoded).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new TypeError("artifact cursor integrity failed");
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError("artifact cursor is invalid");
    const cursor = parsed as Record<string, unknown>;
    if (
      cursor.v !== CURSOR_VERSION || typeof cursor.evidenceId !== "string" ||
      typeof cursor.evidenceRevision !== "number" || typeof cursor.path !== "string" ||
      typeof cursor.sourceDigest !== "string" || typeof cursor.renderedDigest !== "string" ||
      typeof cursor.pageIndex !== "number" || typeof cursor.offset !== "number" ||
      !Number.isSafeInteger(cursor.evidenceRevision) || !Number.isSafeInteger(cursor.pageIndex) ||
      !Number.isSafeInteger(cursor.offset)
    ) throw new TypeError("artifact cursor is invalid");
    return cursor as CursorPayload;
  }
}
