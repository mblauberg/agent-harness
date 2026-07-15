import { isAbsolute, resolve } from "node:path";

import { ProviderAdapterError } from "./types.js";

export const WORKSPACE_WRITE_OFFLINE_PROFILE = "workspace-write-offline" as const;
export const WORKSPACE_WRITE_OFFLINE_TOOLS = ["Read", "Glob", "Grep", "Write", "Edit", "Bash"] as const;

export type WorkspaceWriteOfflineProjection = Readonly<{
  writeRoot: string;
}>;

export function parseWorkspaceWriteOfflineProjection(
  payload: Record<string, unknown>,
): WorkspaceWriteOfflineProjection | undefined {
  if (payload.executionProfile === undefined) return undefined;
  if (payload.executionProfile !== WORKSPACE_WRITE_OFFLINE_PROFILE) {
    throw new ProviderAdapterError("INVALID_PARAMS", "provider execution profile is not trusted");
  }
  const cwd = payload.cwd;
  const writeRoot = payload.writeRoot;
  const readOnlyRoot = payload.readOnlyRoot;
  if (
    typeof cwd !== "string" || !isAbsolute(cwd) || typeof writeRoot !== "string" ||
    resolve(writeRoot) !== resolve(cwd) || typeof readOnlyRoot !== "string" ||
    resolve(readOnlyRoot) !== resolve(cwd) || payload.sandbox !== "workspace-write" ||
    payload.approvalPolicy !== "never" || payload.networkAccess !== "none" ||
    !Array.isArray(payload.allowedTools) ||
    JSON.stringify(payload.allowedTools) !== JSON.stringify(WORKSPACE_WRITE_OFFLINE_TOOLS)
  ) {
    throw new ProviderAdapterError("INVALID_PARAMS", "write-offline projection is incomplete");
  }
  return { writeRoot: resolve(writeRoot) };
}
