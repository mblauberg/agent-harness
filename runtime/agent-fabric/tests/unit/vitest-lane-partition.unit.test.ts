import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

async function listTestFilesOnDisk(): Promise<string[]> {
  const entries = await readdir(path.join(packageRoot, "tests"), {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => path.relative(packageRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort();
}

function resolveVitestBin(): string {
  const require_ = createRequire(path.join(packageRoot, "package.json"));
  const packageJsonPath = require_.resolve("vitest/package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { bin?: Record<string, string> };
  const relativeBin = packageJson.bin?.vitest;
  if (!relativeBin) {
    throw new Error("vitest package.json does not declare a `vitest` bin entry");
  }
  return path.join(path.dirname(packageJsonPath), relativeBin);
}

/**
 * Ask the real Vitest CLI what it would run, rather than reimplementing its
 * file-selection semantics. This matters because Vitest resolves a config's
 * `include`/`exclude` globs (proper glob matching) to produce a candidate
 * file list, then applies any CLI positional path arguments as a
 * case-insensitive *substring* filter over that list (see
 * `filterFiles` in vitest's cli-api chunk) -- not an anchored directory
 * glob. A hand-rolled reimplementation of that filter would either miss
 * this substring behaviour (understating what a dedicated lane actually
 * runs) or have to track Vitest's exact, undocumented algorithm forever.
 * Shelling out to `vitest list --json` sidesteps both problems: it is
 * always exactly what CI's `npm run test*` scripts would execute.
 */
function listVitestFiles(args: string[]): Set<string> {
  const vitestBin = resolveVitestBin();
  const stdout = execFileSync(process.execPath, [vitestBin, "list", ...args, "--json"], {
    cwd: packageRoot,
    encoding: "utf8",
    timeout: 180_000,
  });
  const rows = JSON.parse(stdout) as Array<{ file: string }>;
  return new Set(
    rows.map((row) => path.relative(packageRoot, row.file).split(path.sep).join("/")),
  );
}

/**
 * Replay the complete argument list of a `vitest run ...` npm script, not a
 * hand-picked subset of it, so any argument later added to the script (a
 * positional filter, an unquoted --exclude, a new flag) is either faithfully
 * replayed against `vitest list` or rejected loudly here -- never silently
 * ignored while the completeness assertions keep passing.
 *
 * The tokenizer supports exactly the grammar these scripts use: whitespace-
 * separated words, optionally single- or double-quoted as whole tokens. Any
 * shell construct it cannot faithfully replay (pipes, chaining, redirection,
 * substitution, env-var assignments before the command) fails the test.
 */
function replayableVitestArgs(scriptCommand: string): string[] {
  if (/[|&;<>()`$\\\r\n\0]/u.test(scriptCommand)) {
    throw new Error(`unsupported shell construct in vitest script: ${scriptCommand}`);
  }
  const token = /(?:'[^']*'|"[^"]*"|[^\s'"]+)/u;
  const wholeScript = new RegExp(`^${token.source}(?:[ \\t]+${token.source})*$`, "u");
  const trimmed = scriptCommand.replace(/^[ \t]+|[ \t]+$/gu, "");
  if (!wholeScript.test(trimmed)) {
    throw new Error(`unsupported token grammar in vitest script: ${scriptCommand}`);
  }
  const tokens = [...trimmed.matchAll(new RegExp(token.source, "gu"))].map((match) => {
    const raw = match[0];
    if (raw.startsWith("'") || raw.startsWith('"')) {
      return raw.slice(1, -1);
    }
    // An unquoted token containing comment or expansion syntax would be
    // rewritten by the shell before vitest sees it (comment stripping, glob
    // or tilde/brace expansion), so a literal replay would be unfaithful.
    // Require such tokens to be quoted in the npm script instead.
    if (/[#*?[\]~{}]/u.test(raw)) {
      throw new Error(`unquoted shell-expandable token in vitest script (quote it): ${raw}`);
    }
    return raw;
  });
  if (tokens[0] !== "vitest" || tokens[1] !== "run") {
    throw new Error(`expected the script to start with "vitest run": ${scriptCommand}`);
  }
  return tokens.slice(2);
}

describe("fabric vitest lane partition", () => {
  it(
    "runs every ordinary suite file exactly once, disjoint from evaluation/load",
    async () => {
      const packageJson = JSON.parse(
        await readFile(path.join(packageRoot, "package.json"), "utf8"),
      ) as { scripts: Record<string, string | undefined> };

      function requireScript(name: string): string {
        const script = packageJson.scripts[name];
        if (script === undefined) {
          throw new Error(`package.json is missing an npm script named ${name}`);
        }
        return script;
      }

      const allTestFiles = await listTestFilesOnDisk();
      expect(allTestFiles.length).toBeGreaterThan(0);

      // Ground truth for what the ordinary `test` script runs: replay its
      // complete real argument list (currently the --exclude flags) against
      // `vitest list`, so Vitest's own config include and the script's real
      // arguments are exercised directly.
      const ordinaryFiles = listVitestFiles(replayableVitestArgs(requireScript("test")));

      // Ground truth for what each dedicated lane script actually selects,
      // including Vitest's substring-based positional filtering.
      const dedicatedFiles = new Set([
        ...listVitestFiles(replayableVitestArgs(requireScript("test:evaluation"))),
        ...listVitestFiles(replayableVitestArgs(requireScript("test:load"))),
      ]);

      // Sanity: neither side is vacuous. A glob or script typo that matches
      // nothing would otherwise let the disjointness and coverage checks
      // pass emptily.
      expect(ordinaryFiles.size).toBeGreaterThan(0);
      expect(dedicatedFiles.size).toBeGreaterThan(0);

      // Disjoint: nothing the evaluation/load lanes run is also swept into
      // the ordinary `npm run test` invocation.
      const overlap = [...ordinaryFiles].filter((file) => dedicatedFiles.has(file));
      expect(overlap).toEqual([]);

      // Complete: every test file that exists on disk lands in exactly one
      // of the two buckets. If a future test file is added under an
      // evaluation/load-shaped path but the excludes aren't updated to
      // match (or vice versa), this fails loudly instead of silently
      // double-running or dropping it.
      const partitioned = new Set([...ordinaryFiles, ...dedicatedFiles]);
      expect(partitioned.size).toBe(ordinaryFiles.size + dedicatedFiles.size);
      expect([...partitioned].sort()).toEqual(allTestFiles);
    },
    180_000,
  );
});
