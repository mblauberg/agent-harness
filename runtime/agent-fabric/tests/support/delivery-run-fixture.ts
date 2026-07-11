import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { isRecord } from "../../src/daemon/protocol.js";

const execFileAsync = promisify(execFile);
const referenceRunsScript = fileURLToPath(
  new URL("../../../../skills/deliver/scripts/reference_runs.py", import.meta.url),
);
const referenceEvaluationScript = fileURLToPath(
  new URL("../../../../skills/deliver/scripts/reference_evaluation.py", import.meta.url),
);
const materialiseReferenceRun = `
import importlib.util
import json
import sys
from pathlib import Path

module_path = Path(sys.argv[1])
receipt_path = Path(sys.argv[2])
workspace_root = Path(sys.argv[3])
spec = importlib.util.spec_from_file_location("fabric_delivery_reference_evaluation", module_path)
if spec is None or spec.loader is None:
    raise RuntimeError("reference evaluation materialiser is unavailable")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
run = json.loads(receipt_path.read_text())
module.materialise_reference_run(run, workspace_root)
receipt_path.write_text(json.dumps(run, indent=2) + "\\n")
`;

export async function writeDeliveryRunFixture(input: {
  runDirectory: string;
  runId: string;
  artifactPath: string;
  artifactSha256: string;
  profile?: "analysis" | "agent-product";
  accepted?: boolean;
}): Promise<string> {
  const referenceDirectory = join(input.runDirectory, ".delivery-reference");
  try {
    await execFileAsync("python3", [referenceRunsScript, "--output-dir", referenceDirectory]);
    const profile = input.profile ?? "analysis";
    const value: unknown = JSON.parse(await readFile(join(referenceDirectory, `${profile}.json`), "utf8"));
    if (
      !isRecord(value)
      || !Array.isArray(value.artifacts)
      || !Array.isArray(value.state_history)
      || !isRecord(value.human_gates)
      || !isRecord(value.checkpoint)
    ) {
      throw new TypeError("generated delivery-run reference is invalid");
    }
    value.run_id = input.runId;
    if (input.accepted === true) {
      if (profile !== "agent-product" || !isRecord(value.human_gates.acceptance)) {
        throw new TypeError("only an agent-product reference can be accepted by this fixture");
      }
      value.status = "accepted";
      value.state_history.push({
        state: "accepted",
        at: "2026-07-10T00:09:00Z",
        evidence_ids: ["acceptance-approval"],
      });
      value.human_gates.acceptance = {
        status: "approved",
        approver: "human-maintainer",
        evidence: "acceptance-approval",
      };
      value.checkpoint.current_slice = "accepted";
      value.checkpoint.next_action = "prepare release";
      value.checkpoint.in_flight = [];
    }
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
    const workspaceRoot = dirname(dirname(input.runDirectory));
    await execFileAsync("python3", [
      "-c",
      materialiseReferenceRun,
      referenceEvaluationScript,
      runReceiptPath,
      workspaceRoot,
    ]);
    return runReceiptPath;
  } finally {
    await rm(referenceDirectory, { recursive: true, force: true });
  }
}
