import { execFile } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
/**
 * Gives a fixture wrapper directory the minimal workspace package layout
 * that Git provenance requires: a package manifest plus a src tree. Span
 * discovery fails closed on wrappers with no owning tracked workspace
 * package or no src span, so fixtures must carry both (committed by a
 * following commitFixtureRepository call) exactly as production wrapper
 * packages do.
 */
export async function writeWrapperPackageScaffold(
  directory: string,
  name = "@local/fixture-wrapper",
): Promise<void> {
  await writeFile(join(directory, "package.json"), `${JSON.stringify({ name, type: "module" })}\n`);
  await mkdir(join(directory, "src"), { recursive: true });
  await writeFile(join(directory, "src", "index.js"), "export const fixtureFirstPartySource = true;\n");
}

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
