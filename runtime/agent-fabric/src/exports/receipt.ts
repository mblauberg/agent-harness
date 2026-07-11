import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { isRecord } from "../daemon/protocol.js";
import { assertFabricReceiptSchema } from "./schema.js";

export class FabricReceiptError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FabricReceiptError";
    this.code = code;
  }
}

const FABRIC_RECEIPT_ARTIFACT_ID = "fabric-coordination-receipt";
const execFileAsync = promisify(execFile);
const deliveryValidatorPath = fileURLToPath(
  new URL("../../../../skills/deliver/scripts/validate_delivery.py", import.meta.url),
);

type ReceiptTarget = {
  relativePath: string;
  expectedHash: string;
  pathBase: string;
  runId: string;
};

type RunLocation = {
  runDirectory: string;
  workspaceRoot: string;
};

async function canonicalRunLocation(runReceiptPath: string): Promise<RunLocation> {
  const runDirectory = await realpath(dirname(runReceiptPath));
  const agentRunDirectory = dirname(runDirectory);
  if (basename(runReceiptPath) !== "RUN.json" || basename(agentRunDirectory) !== ".agent-run") {
    throw new FabricReceiptError("RECEIPT_LINK_INVALID", "delivery run receipt is not at .agent-run/<run-id>/RUN.json");
  }
  return { runDirectory, workspaceRoot: dirname(agentRunDirectory) };
}

function validationFailureDetail(error: unknown): string {
  if (isRecord(error) && typeof error.stderr === "string") {
    const detail = error.stderr.trim();
    if (detail.length > 0) return detail;
  }
  return error instanceof Error ? error.message : String(error);
}

async function assertCanonicalDeliveryRun(runReceiptPath: string, workspaceRoot: string): Promise<void> {
  try {
    await execFileAsync("python3", [deliveryValidatorPath, runReceiptPath, "--workspace-root", workspaceRoot]);
  } catch (error: unknown) {
    throw new FabricReceiptError("RECEIPT_LINK_INVALID", `delivery run receipt is invalid: ${validationFailureDetail(error)}`);
  }
}

function canonicalReceiptTarget(runReceipt: Record<string, unknown>, location: RunLocation): ReceiptTarget {
  if (runReceipt.contract !== "delivery-run" || runReceipt.schema_version !== 1) {
    throw new FabricReceiptError("RECEIPT_LINK_INVALID", "run receipt is not delivery-run schema v1");
  }
  if (typeof runReceipt.run_id !== "string" || !Array.isArray(runReceipt.artifacts)) {
    throw new FabricReceiptError("RECEIPT_LINK_INVALID", "delivery run receipt fields are invalid");
  }
  const matchingArtifacts = runReceipt.artifacts.filter(
    (artifact): artifact is Record<string, unknown> => isRecord(artifact) && artifact.id === FABRIC_RECEIPT_ARTIFACT_ID,
  );
  if (matchingArtifacts.length !== 1) {
    throw new FabricReceiptError("RECEIPT_LINK_INVALID", "delivery run must declare one fabric coordination receipt artifact");
  }
  const artifact = matchingArtifacts[0];
  if (artifact === undefined) throw new Error("fabric coordination receipt artifact disappeared");
  const relativePath = artifact.path;
  const digest = artifact.digest;
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/u).includes("..") ||
    typeof digest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(digest)
  ) {
    throw new FabricReceiptError("RECEIPT_LINK_INVALID", "fabric coordination receipt artifact fields are invalid");
  }
  if (basename(location.runDirectory) !== runReceipt.run_id) {
    throw new FabricReceiptError("RECEIPT_LINK_INVALID", "delivery run directory does not match run_id");
  }
  return {
    relativePath,
    expectedHash: digest.slice("sha256:".length),
    pathBase: location.workspaceRoot,
    runId: runReceipt.run_id,
  };
}

export async function verifyFabricReceiptLink(options: { runReceiptPath: string }): Promise<{
  valid: true;
  relativePath: string;
  schemaVersion: number;
  sha256: string;
}> {
  const location = await canonicalRunLocation(options.runReceiptPath);
  await assertCanonicalDeliveryRun(options.runReceiptPath, location.workspaceRoot);
  const runReceiptBytes = await readFile(options.runReceiptPath);
  const runReceipt: unknown = JSON.parse(runReceiptBytes.toString("utf8"));
  if (!isRecord(runReceipt)) {
    throw new FabricReceiptError("RECEIPT_LINK_INVALID", "run receipt is not delivery-run schema v1");
  }
  const target = canonicalReceiptTarget(runReceipt, location);
  const receiptPath = await realpath(resolve(target.pathBase, target.relativePath));
  const rel = relative(location.runDirectory, receiptPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new FabricReceiptError("RECEIPT_LINK_INVALID", "fabric receipt path escapes the run directory");
  }
  const bytes = await readFile(receiptPath);
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== target.expectedHash) {
    throw new FabricReceiptError("RECEIPT_HASH_MISMATCH", "fabric receipt SHA-256 does not match the run receipt");
  }
  const receipt: unknown = JSON.parse(bytes.toString("utf8"));
  try {
    assertFabricReceiptSchema(receipt);
  } catch (error: unknown) {
    throw new FabricReceiptError("RECEIPT_SCHEMA_MISMATCH", error instanceof Error ? error.message : String(error));
  }
  if (
    !isRecord(receipt) ||
    (receipt.schemaVersion !== 1 && receipt.schemaVersion !== 2) ||
    typeof receipt.runId !== "string"
  ) {
    throw new FabricReceiptError("RECEIPT_SCHEMA_MISMATCH", "fabric receipt schema does not match the link");
  }
  if (receipt.runId !== target.runId) {
    throw new FabricReceiptError("RECEIPT_SCHEMA_MISMATCH", "fabric receipt belongs to a different run");
  }
  return { valid: true, relativePath: target.relativePath, schemaVersion: receipt.schemaVersion, sha256: actualHash };
}
