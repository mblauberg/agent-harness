import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
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
 * provenance that repository-owned wrappers have in production. If the
 * fixture directory sits inside an enclosing repository (for example a
 * temporary directory under a checked-out tree), a fresh repository is
 * initialised at the fixture root so the fixture never commits into the
 * enclosing repository.
 */
export async function commitFixtureRepository(directory: string, message = "fixture"): Promise<string> {
  const resolvedDirectory = await realpath(directory);
  let isFixtureRoot = false;
  try {
    const toplevel = await git(resolvedDirectory, "rev-parse", "--show-toplevel");
    isFixtureRoot = (await realpath(toplevel)) === resolvedDirectory;
  } catch {
    isFixtureRoot = false;
  }
  if (!isFixtureRoot) {
    await git(resolvedDirectory, "init", "--quiet");
  }
  await git(resolvedDirectory, "add", "--all");
  await git(resolvedDirectory, "commit", "--quiet", "--allow-empty", "-m", message);
  return git(resolvedDirectory, "rev-parse", "HEAD");
}
