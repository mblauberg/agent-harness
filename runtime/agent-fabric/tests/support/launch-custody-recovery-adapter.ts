import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const callsPath = process.env.LAUNCH_RECOVERY_CALLS_PATH;
const contractJson = process.env.LAUNCH_RECOVERY_CONTRACT_JSON;
if (callsPath === undefined || contractJson === undefined) {
  throw new Error("launch recovery adapter requires calls path and contract");
}
const chairLaunch: unknown = JSON.parse(contractJson);
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

lines.on("line", (line) => {
  const request = JSON.parse(line) as {
    id: string;
    method: string;
    params?: { actionId?: string };
  };
  appendFileSync(callsPath, `${JSON.stringify({ method: request.method })}\n`, { mode: 0o600 });
  let result: unknown;
  if (request.method === "capabilities") {
    result = {
      protocolVersion: 1,
      adapterId: "claude-agent-sdk",
      operations: ["capabilities", "launch_chair", "lookup_action"],
      actionJournal: true,
      persistentSession: true,
      ephemeralWorker: true,
      controlModes: ["managed"],
      inboxDeliveryModes: ["structured-push"],
      recoveryOperations: ["lookup_action"],
      compactInPlace: false,
      idempotencyEvidence: "per-action-fail-closed",
      chairLaunch,
    };
  } else if (request.method === "lookup_action") {
    result = {
      actionId: request.params?.actionId ?? "provider_launch_01",
      operation: "launch_chair",
      payloadHash: "fixture-payload-hash",
      status: "ambiguous",
      history: ["prepared", "dispatched", "ambiguous"],
      executionCount: 1,
      effectCount: 0,
      idempotencyProven: false,
    };
  } else {
    process.stdout.write(`${JSON.stringify({
      id: request.id,
      error: { code: "UNEXPECTED_CALL", message: `unexpected ${request.method}` },
    })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
});
