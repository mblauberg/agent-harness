import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createWrapperManifest } from "../../scripts/generate-wrapper-manifest.mjs";

describe("wrapper closure manifest generation", () => {
  it("records the complete relative-import closure in stable path order", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrapper-manifest-"));
    const entrypoint = join(root, "wrapper.js");
    const dependency = join(root, "dependency.js");
    const outputPath = join(root, "manifest.json");
    await Promise.all([
      writeFile(entrypoint, 'export { execute } from "./dependency.js";\n'),
      writeFile(dependency, "export const execute = () => true;\n"),
    ]);

    const result = await createWrapperManifest({ entrypoint, outputPath, pathBase: root });

    expect(result.fileCount).toBe(2);
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
      schema_version: 1,
      entrypoint: "wrapper.js",
      files: [{ path: "dependency.js" }, { path: "wrapper.js" }],
    });
  });
});
