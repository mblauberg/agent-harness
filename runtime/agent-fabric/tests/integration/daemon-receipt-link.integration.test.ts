import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openFabric, verifyFabricReceiptLink } from "../../src/index.ts";
import { describe, expect, it } from "vitest";
import { writeDeliveryRunFixture } from "../support/delivery-run-fixture.ts";

describe("Stage 1 chair receipt link", () => {
  it("verifies the fabric receipt declared by the canonical delivery-run artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-receipt-link-"));
    const runDirectory = join(root, ".agent-run", "run-link");
    await mkdir(runDirectory, { recursive: true });
    const fabric = await openFabric({ databasePath: join(root, "fabric.sqlite3"), workspaceRoots: [root] });
    try {
      const run = await fabric.createRun({
        runId: "run-link",
        projectRunDirectory: runDirectory,
        chair: {
          agentId: "chair",
          authority: {
            workspaceRoots: ["."],
            sourcePaths: ["."],
            artifactPaths: [".agent-run/run-link"],
            actions: ["read", "write", "message"],
            disclosure: ["local"],
            expiresAt: "2099-01-01T00:00:00.000Z",
            budget: { turns: 4, "cost:USD": 4 },
          },
        },
      });
      const chair = fabric.connect(run.chairCapability);
      const exported = await chair.exportReceipt({ commandId: "receipt-link:export" });
      const artifactPath = `.agent-run/run-link/${exported.relativePath}`;
      const runReceiptPath = await writeDeliveryRunFixture({
        runDirectory,
        runId: "run-link",
        artifactPath,
        artifactSha256: exported.sha256,
      });

      await expect(verifyFabricReceiptLink({ runReceiptPath })).resolves.toMatchObject({
        valid: true,
        relativePath: artifactPath,
        schemaVersion: 1,
        sha256: exported.sha256,
      });

      const fabricReceiptPath = join(runDirectory, exported.relativePath);
      const bytes = await readFile(fabricReceiptPath);
      const invalid = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
      delete invalid.stageOwners;
      const invalidBytes = Buffer.from(`${JSON.stringify(invalid)}\n`);
      await writeFile(fabricReceiptPath, invalidBytes);
      const invalidHash = createHash("sha256").update(invalidBytes).digest("hex");
      const linked = JSON.parse(await readFile(runReceiptPath, "utf8")) as { artifacts: Array<{ id: string; digest: string }> };
      const declaredArtifact = linked.artifacts.find((artifact) => artifact.id === "fabric-coordination-receipt");
      if (declaredArtifact === undefined) throw new TypeError("delivery run is missing its fabric receipt artifact");
      declaredArtifact.digest = `sha256:${invalidHash}`;
      await writeFile(runReceiptPath, `${JSON.stringify(linked, null, 2)}\n`);
      await expect(verifyFabricReceiptLink({ runReceiptPath })).rejects.toMatchObject({ code: "RECEIPT_SCHEMA_MISMATCH" });

      declaredArtifact.digest = `sha256:${exported.sha256}`;
      await writeFile(runReceiptPath, `${JSON.stringify(linked, null, 2)}\n`);
      await writeFile(fabricReceiptPath, bytes);
      await writeFile(fabricReceiptPath, Buffer.concat([bytes, Buffer.from("tampered\n")]));
      await expect(verifyFabricReceiptLink({ runReceiptPath })).rejects.toMatchObject({
        code: "RECEIPT_HASH_MISMATCH",
      });
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(exported.sha256);
    } finally {
      await fabric.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects the removed RUN_RECEIPT fabric_receipt link", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-legacy-receipt-link-"));
    const runDirectory = join(root, ".agent-run", "run-legacy-link");
    await mkdir(runDirectory, { recursive: true });
    const fabric = await openFabric({ databasePath: join(root, "fabric.sqlite3"), workspaceRoots: [root] });
    try {
      const run = await fabric.createRun({
        runId: "run-legacy-link",
        projectRunDirectory: runDirectory,
        chair: {
          agentId: "chair",
          authority: {
            workspaceRoots: ["."],
            sourcePaths: ["."],
            artifactPaths: [".agent-run/run-legacy-link"],
            actions: ["read", "write"],
            disclosure: ["local"],
            expiresAt: "2099-01-01T00:00:00.000Z",
            budget: { turns: 1 },
          },
        },
      });
      const exported = await fabric.connect(run.chairCapability).exportReceipt({ commandId: "receipt-link:legacy-export" });
      const legacyReceiptPath = join(runDirectory, "RUN_RECEIPT.json");
      await writeFile(legacyReceiptPath, `${JSON.stringify({
        schema_version: 1,
        run_id: "run-legacy-link",
        fabric_receipt: {
          relative_path: exported.relativePath,
          schema_version: exported.schemaVersion,
          sha256: exported.sha256,
        },
      }, null, 2)}\n`);

      await expect(verifyFabricReceiptLink({ runReceiptPath: legacyReceiptPath })).rejects.toMatchObject({
        code: "RECEIPT_LINK_INVALID",
      });
    } finally {
      await fabric.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a partial RUN.json that is not a valid delivery-run receipt", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-partial-delivery-run-"));
    const runDirectory = join(root, ".agent-run", "run-partial");
    await mkdir(runDirectory, { recursive: true });
    const fabric = await openFabric({ databasePath: join(root, "fabric.sqlite3"), workspaceRoots: [root] });
    try {
      const run = await fabric.createRun({
        runId: "run-partial",
        projectRunDirectory: runDirectory,
        chair: {
          agentId: "chair",
          authority: {
            workspaceRoots: ["."],
            sourcePaths: ["."],
            artifactPaths: [".agent-run/run-partial"],
            actions: ["read", "write"],
            disclosure: ["local"],
            expiresAt: "2099-01-01T00:00:00.000Z",
            budget: { turns: 1 },
          },
        },
      });
      const exported = await fabric.connect(run.chairCapability).exportReceipt({ commandId: "receipt-link:partial-export" });
      const runReceiptPath = join(runDirectory, "RUN.json");
      await writeFile(runReceiptPath, `${JSON.stringify({
        schema_version: 1,
        contract: "delivery-run",
        run_id: "run-partial",
        artifacts: [{
          id: "fabric-coordination-receipt",
          path: `.agent-run/run-partial/${exported.relativePath}`,
          digest: `sha256:${exported.sha256}`,
        }],
      }, null, 2)}\n`);

      await expect(verifyFabricReceiptLink({ runReceiptPath })).rejects.toMatchObject({ code: "RECEIPT_LINK_INVALID" });
    } finally {
      await fabric.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a delivery run whose directory name differs from run_id", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-run-directory-mismatch-"));
    const runDirectory = join(root, ".agent-run", "run-directory");
    await mkdir(runDirectory, { recursive: true });
    const fabric = await openFabric({ databasePath: join(root, "fabric.sqlite3"), workspaceRoots: [root] });
    try {
      const run = await fabric.createRun({
        runId: "run-declared",
        projectRunDirectory: runDirectory,
        chair: {
          agentId: "chair",
          authority: {
            workspaceRoots: ["."],
            sourcePaths: ["."],
            artifactPaths: [".agent-run/run-directory"],
            actions: ["read", "write"],
            disclosure: ["local"],
            expiresAt: "2099-01-01T00:00:00.000Z",
            budget: { turns: 1 },
          },
        },
      });
      const exported = await fabric.connect(run.chairCapability).exportReceipt({ commandId: "receipt-link:mismatch-export" });
      const runReceiptPath = await writeDeliveryRunFixture({
        runDirectory,
        runId: "run-declared",
        artifactPath: `.agent-run/run-directory/${exported.relativePath}`,
        artifactSha256: exported.sha256,
      });

      await expect(verifyFabricReceiptLink({ runReceiptPath })).rejects.toMatchObject({ code: "RECEIPT_LINK_INVALID" });
    } finally {
      await fabric.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
