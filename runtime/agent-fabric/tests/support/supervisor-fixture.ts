import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

import {
  chairLaunchAttestationDigest,
  chairLaunchChallengeDigest,
} from "../../src/adapters/providers/types.js";

const countPath = process.env.SUPERVISOR_COUNT_PATH;
if (countPath === undefined) throw new Error("SUPERVISOR_COUNT_PATH is required");
const count = existsSync(countPath) ? Number(readFileSync(countPath, "utf8")) : 0;
writeFileSync(countPath, String(count + 1), { mode: 0o600 });
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", async (line) => {
  const request = JSON.parse(line) as {
    id: string;
    method: string;
    params?: { actionId?: unknown; providerContractDigest?: unknown };
  };
  const delay = Number(process.env.SUPERVISOR_DELAY_MS ?? "0");
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  if (request.params?.actionId === "recoverable-provider-error") {
    process.stdout.write(`${JSON.stringify({
      id: request.id,
      error: { code: "PROVIDER_TURN_FAILED", message: "recoverable provider turn failure" },
    })}\n`);
    return;
  }
  const capability = process.env.AGENT_FABRIC_CAPABILITY;
  const socketPath = process.env.AGENT_FABRIC_SOCKET_PATH;
  const attestationChallenge = process.env.AGENT_FABRIC_ATTESTATION_CHALLENGE;
  if (request.method === "launch_chair") {
    const observation = {
        privateCapabilityPresent: typeof capability === "string" && capability.length > 0,
        privateSocketPresent: typeof socketPath === "string" && socketPath.length > 0,
        privateChallengePresent: typeof attestationChallenge === "string" && attestationChallenge.length > 0,
        requestContainsPrivate:
          (capability !== undefined && line.includes(capability)) ||
          (socketPath !== undefined && line.includes(socketPath)) ||
          (attestationChallenge !== undefined && line.includes(attestationChallenge)),
    };
    const observationPath = process.env.SUPERVISOR_OBSERVATION_PATH;
    if (observationPath !== undefined) {
      writeFileSync(observationPath, JSON.stringify(observation), { mode: 0o600 });
    }
  }
  const providerContractDigest = request.params?.providerContractDigest;
  const providerActionId = request.params?.actionId;
  const unsigned = {
    schemaVersion: 1 as const,
    kind: "provider-session-fabric-attestation" as const,
    method: "provider-session-random-challenge-v1" as const,
    bridgeContract: "agent-fabric-session-bridge-v1" as const,
    providerAdapterId: "fake",
    providerActionId: String(providerActionId),
    providerContractDigest: String(providerContractDigest),
    providerSessionRef: "fixture-chair-session",
    providerSessionGeneration: 1,
    providerTurnRef: "fixture-provider-turn",
    challengeDigest: chairLaunchChallengeDigest(String(attestationChallenge)),
    providerInvocationRef: "fixture-provider-tool-call",
  };
  const result = request.method === "launch_chair"
    ? {
        resumeReference: "fixture-chair-session",
        providerSessionGeneration: 1,
        fabricContinuity: {
          ...unsigned,
          attestationDigest: chairLaunchAttestationDigest(unsigned),
        },
      }
    : { method: request.method, pid: process.pid };
  process.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`, () => {
    if (request.method !== "launch_chair") return;
    if (process.env.SUPERVISOR_EXIT_AFTER_LAUNCH === "1") process.exit(0);
    const passiveExitDelay = Number(process.env.SUPERVISOR_PASSIVE_EXIT_DELAY_MS ?? "0");
    if (passiveExitDelay > 0) setTimeout(() => process.exit(0), passiveExitDelay);
  });
});
