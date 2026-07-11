import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicaliseSchemaDirectory } from "../../scripts/canonicalise-codex-schemas.mjs";

describe("Codex schema canonicalisation", () => {
  it("produces identical bundles despite upstream definition order", async () => {
    const root = await mkdtemp(join(tmpdir(), "codex-schema-canonical-"));
    const first = join(root, "first");
    const second = join(root, "second");
    const firstOutput = join(root, "first.bundle.json");
    const secondOutput = join(root, "second.bundle.json");
    const { mkdir } = await import("node:fs/promises");
    await Promise.all([mkdir(join(first, "v2"), { recursive: true }), mkdir(join(second, "v2"), { recursive: true })]);
    await Promise.all([
      writeFile(join(first, "protocol.json"), '{"definitions":{"Zulu":{"type":"string"},"Alpha":{"type":"number"}},"title":"x"}\n'),
      writeFile(join(second, "protocol.json"), '{"title":"x","definitions":{"Alpha":{"type":"number"},"Zulu":{"type":"string"}}}\n'),
      writeFile(join(first, "v2", "request.json"), '{"properties":{"z":{"type":"null"},"a":{"type":"boolean"}}}\n'),
      writeFile(join(second, "v2", "request.json"), '{"properties":{"a":{"type":"boolean"},"z":{"type":"null"}}}\n'),
    ]);

    const [firstResult, secondResult] = await Promise.all([
      canonicaliseSchemaDirectory(first, firstOutput),
      canonicaliseSchemaDirectory(second, secondOutput),
    ]);

    expect(firstResult.sha256).toBe(secondResult.sha256);
    expect(firstResult.fileCount).toBe(2);
    expect(await readFile(firstOutput, "utf8")).toBe(await readFile(secondOutput, "utf8"));
  });
});
