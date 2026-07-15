import { existsSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  normalize,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";

import type { AuthorityInput } from "../domain/types.js";
import { FabricError } from "../errors.js";

const FORBIDDEN_PROVIDER_CONTROLS = [
  "allowedTools",
  "disallowedTools",
  "approvalPolicy",
  "permissions",
  "permissionMode",
  "sandbox",
  "sandboxPolicy",
  "dangerouslySkipPermissions",
  "developerInstructions",
  "baseInstructions",
  "modelProvider",
  "serviceTier",
  "readOnlyRoot",
  "executionProfile",
  "writeRoot",
  "networkAccess",
  "runtimeWorkspaceRoots",
  "environments",
  "trustedProjection",
] as const;

type WorkspaceWriteOfflineProjection = Readonly<{
  kind: "workspace-write-offline";
  workspacePath: string;
}>;

function pathContains(parent: string, child: string): boolean {
  const path = posix.relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith("../") && !posix.isAbsolute(path));
}

function scopesOverlap(left: string, right: string): boolean {
  return pathContains(left, right) || pathContains(right, left);
}

function isAbsoluteOnAnyPlatform(path: string): boolean {
  return isAbsolute(path) || /^[A-Za-z]:[\\/]/u.test(path) || /^[\\/]{2}/u.test(path);
}

function canonicalAuthorityPath(workspaceRoot: string, path: string): string {
  if (
    path.length === 0 ||
    path.includes("\0") ||
    isAbsoluteOnAnyPlatform(path) ||
    path.split(/[\\/]/u).includes("..") ||
    /[*?[\]{}]/u.test(path)
  ) {
    throw new FabricError("AUTHORITY_WIDENING", `unsafe workspace-relative path: ${path}`);
  }
  let cursor = resolve(workspaceRoot, path);
  const suffix: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new FabricError("AUTHORITY_WIDENING", `path has no resolvable ancestor: ${path}`);
    }
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  const resolved = resolve(realpathSync(cursor), ...suffix);
  const pathFromRoot = relative(workspaceRoot, resolved);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new FabricError("AUTHORITY_WIDENING", `workspace-relative path escapes configured root: ${path}`);
  }
  return pathFromRoot === "" ? "." : normalize(pathFromRoot).replaceAll(sep, "/");
}

type CompileProviderPayloadInput = Readonly<{
  authority: AuthorityInput;
  workspaceRoot: () => string;
  payload: Readonly<Record<string, unknown>>;
  trustedProjection?: WorkspaceWriteOfflineProjection;
}> & (
  | Readonly<{ now: number; validateCurrent: true }>
  | Readonly<{ now: null; validateCurrent: false }>
);

function validateWorkspaceWriteOfflineProjection(
  authority: AuthorityInput,
  projection: WorkspaceWriteOfflineProjection,
  payload: Readonly<Record<string, unknown>>,
): void {
  if (projection.kind !== "workspace-write-offline") {
    throw new FabricError("CAPABILITY_FORBIDDEN", "write-offline projection is invalid");
  }
  if (
    typeof projection.workspacePath !== "string" ||
    projection.workspacePath.length === 0 ||
    !authority.sourcePaths.some((path) => pathContains(path, projection.workspacePath)) ||
    payload.cwd !== projection.workspacePath
  ) {
    throw new FabricError("CAPABILITY_FORBIDDEN", "write-offline grant does not match the exact provider cwd");
  }
  if (
    authority.network.toolEgress !== "none" || authority.deployment.allowed ||
    authority.irreversibleActions.allowed || authority.secrets.access !== "none"
  ) {
    throw new FabricError("CAPABILITY_FORBIDDEN", "write-offline authority permits a prohibited external effect");
  }
}

export function compileProviderPayload(input: CompileProviderPayloadInput): Record<string, unknown> {
  if (input.validateCurrent && Date.parse(input.authority.expiresAt) <= input.now) {
    throw new FabricError("AUTHENTICATION_FAILED", "provider authority has expired");
  }
  const providerDisclosure = input.authority.disclosure.level === "allowed" ||
    (input.authority.disclosure.level === "scoped" &&
      input.authority.disclosure.scopes.includes("approved-provider"));
  if (input.validateCurrent && !providerDisclosure) {
    throw new FabricError("CAPABILITY_FORBIDDEN", "authority does not permit disclosure to an approved provider");
  }
  if (input.trustedProjection !== undefined) {
    validateWorkspaceWriteOfflineProjection(input.authority, input.trustedProjection, input.payload);
  }
  const forbidden = FORBIDDEN_PROVIDER_CONTROLS.find((field) => Object.hasOwn(input.payload, field));
  if (forbidden !== undefined) {
    throw new FabricError("CAPABILITY_FORBIDDEN", `provider payload cannot override trusted control ${forbidden}`);
  }
  if (input.payload.cwd !== undefined && typeof input.payload.cwd !== "string") {
    throw new FabricError("CAPABILITY_FORBIDDEN", "provider cwd must be a workspace-relative path");
  }
  const workspaceRoot = input.workspaceRoot();
  const relativeCwd = canonicalAuthorityPath(
    workspaceRoot,
    input.payload.cwd ?? input.authority.sourcePaths[0] ?? ".",
  );
  if (
    !input.authority.sourcePaths.some((allowed) => pathContains(allowed, relativeCwd)) ||
    input.authority.deniedPaths.some((denied) => scopesOverlap(denied, relativeCwd))
  ) {
    throw new FabricError("CAPABILITY_FORBIDDEN", "provider cwd is outside delegated authority");
  }
  const absoluteCwd = resolve(workspaceRoot, relativeCwd);
  if (input.trustedProjection?.kind === "workspace-write-offline") {
    return {
      ...input.payload,
      cwd: absoluteCwd,
      executionProfile: "workspace-write-offline",
      writeRoot: absoluteCwd,
      readOnlyRoot: absoluteCwd,
      allowedTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
      approvalPolicy: "never",
      sandbox: "workspace-write",
      networkAccess: "none",
    };
  }
  return {
    ...input.payload,
    cwd: absoluteCwd,
    readOnlyRoot: absoluteCwd,
    allowedTools: ["Read", "Glob", "Grep"],
    approvalPolicy: "never",
    sandbox: "read-only",
  };
}
