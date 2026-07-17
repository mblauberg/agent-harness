import { randomUUID } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";

type AtomicJsonDependencies = Readonly<{
  publish(temporaryPath: string, targetPath: string): void;
}>;

const defaultDependencies: AtomicJsonDependencies = { publish: renameSync };

export function writeJsonFileAtomic(
  targetPath: string,
  contents: string,
  dependencies: AtomicJsonDependencies = defaultDependencies,
): void {
  const temporaryPath = `${targetPath}.${String(process.pid)}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    dependencies.publish(temporaryPath, targetPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}
