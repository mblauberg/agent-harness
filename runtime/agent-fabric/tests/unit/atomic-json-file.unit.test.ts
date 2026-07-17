import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeJsonFileAtomic } from "../support/atomic-json-file.ts";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(async (directory) =>
    await rm(directory, { recursive: true, force: true })));
});

describe("atomic JSON test journals", () => {
  it("keeps the prior document readable until the complete replacement is published", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-atomic-json-"));
    cleanup.push(directory);
    const target = join(directory, "journal.json");
    writeFileSync(target, '{"revision":1}\n', { mode: 0o600 });

    let observedDuringPublish: unknown;
    writeJsonFileAtomic(target, '{"revision":2}\n', {
      publish: (temporaryPath, targetPath) => {
        observedDuringPublish = JSON.parse(readFileSync(targetPath, "utf8"));
        renameSync(temporaryPath, targetPath);
      },
    });

    expect(observedDuringPublish).toEqual({ revision: 1 });
    await expect(readFile(target, "utf8")).resolves.toBe('{"revision":2}\n');
  });
});
