import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(directory: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [
    "-C",
    directory,
    "-c",
    "user.name=fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    ...args,
  ]);
  return stdout.trim();
}

/**
 * Turns a fixture directory into a Git repository and commits its current
 * contents, so fixture wrapper code carries the same commit-plus-path
 * provenance that repository-owned wrappers have in production.
 */
export async function commitFixtureRepository(directory: string, message = "fixture"): Promise<string> {
  try {
    await git(directory, "rev-parse", "--git-dir");
  } catch {
    await git(directory, "init", "--quiet");
  }
  await git(directory, "add", "--all");
  await git(directory, "commit", "--quiet", "--allow-empty", "-m", message);
  return git(directory, "rev-parse", "HEAD");
}
