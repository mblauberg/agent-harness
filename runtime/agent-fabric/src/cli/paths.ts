import { chmodSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

export type FabricPaths = {
  stateDirectory: string;
  runtimeDirectory: string;
  databasePath: string;
  socketPath: string;
};

function environmentPath(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? undefined : resolve(value);
}

function privateDirectory(path: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
  return path;
}

export function resolveFabricPaths(): FabricPaths {
  const stateDirectory = privateDirectory(
    environmentPath("AGENT_FABRIC_STATE_DIRECTORY") ??
      join(environmentPath("XDG_STATE_HOME") ?? join(environmentPath("HOME") ?? homedir(), ".local", "state"), "agent-harness", "fabric"),
  );
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  const runtimeDirectory = privateDirectory(
    environmentPath("AGENT_FABRIC_RUNTIME_DIRECTORY") ??
      (environmentPath("XDG_RUNTIME_DIR") === undefined
        ? join(environmentPath("TMPDIR") ?? tmpdir(), `agent-harness-${uid}`, "fabric")
        : join(environmentPath("XDG_RUNTIME_DIR") ?? tmpdir(), "agent-harness", "fabric")),
  );
  return {
    stateDirectory,
    runtimeDirectory,
    databasePath: environmentPath("AGENT_FABRIC_DATABASE_PATH") ?? join(stateDirectory, "fabric-v1.sqlite3"),
    socketPath: join(runtimeDirectory, "fabric-v1.sock"),
  };
}
