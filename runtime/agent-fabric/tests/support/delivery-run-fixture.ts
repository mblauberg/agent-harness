import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { promisify } from "node:util";

import { isRecord } from "../../src/daemon/protocol.js";

const execFileAsync = promisify(execFile);
const referenceRunsScript = fileURLToPath(
  new URL("../../../../skills/deliver/scripts/reference_runs.py", import.meta.url),
);

export async function writeDeliveryRunFixture(input: {
  runDirectory: string;
  runId: string;
  artifactPath: string;
  artifactSha256: string;
}): Promise<string> {
  const referenceDirectory = join(input.runDirectory, ".delivery-reference");
  try {
    await execFileAsync("python3", [referenceRunsScript, "--output-dir", referenceDirectory]);
    const value: unknown = JSON.parse(await readFile(join(referenceDirectory, "analysis.json"), "utf8"));
    if (!isRecord(value) || !Array.isArray(value.artifacts)) {
      throw new TypeError("generated delivery-run reference is invalid");
    }
    value.run_id = input.runId;
    value.artifacts.push({
      id: "fabric-coordination-receipt",
      path: input.artifactPath,
      media_type: "application/json",
      artifact_type: "evidence",
      digest: `sha256:${input.artifactSha256}`,
      class: "evidence",
      owner: "chair",
      retention: "risk-policy",
    });
    const runReceiptPath = join(input.runDirectory, "RUN.json");
    await writeFile(runReceiptPath, `${JSON.stringify(value, null, 2)}\n`);
    return runReceiptPath;
  } finally {
    await rm(referenceDirectory, { recursive: true, force: true });
  }
}
