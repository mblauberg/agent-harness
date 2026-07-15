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
const innerBridgeLossMarkerPath = process.env.SUPERVISOR_INNER_BRIDGE_LOSS_MARKER_PATH;

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", async (line) => {
  const request = JSON.parse(line) as {
    id: string;
    method: string;
    params?: {
      schemaVersion?: unknown;
      actionId?: unknown;
      sourceActionId?: unknown;
      agentId?: unknown;
      projectSessionId?: unknown;
      runId?: unknown;
      principalGeneration?: unknown;
      providerContractDigest?: unknown;
      bridgeContractDigest?: unknown;
      bridgeGeneration?: unknown;
      sourceBridgeGeneration?: unknown;
      chairBridgeGeneration?: unknown;
      providerSessionRef?: unknown;
      providerSessionGeneration?: unknown;
      targetAgentId?: unknown;
      kind?: unknown;
      resumeReference?: unknown;
      nextProviderSessionGeneration?: unknown;
    };
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
  if (request.method === "launch_chair" || request.method === "recover_chair") {
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
  const innerBridgeActivatedAt = Number(process.env.SUPERVISOR_INNER_BRIDGE_ACTIVATED_AT ?? "0");
  if (request.method === "retained_bridge_health") {
    const initialLive = process.env.SUPERVISOR_INNER_BRIDGE_INITIAL_LIVE !== "0";
    const delay = Number(process.env.SUPERVISOR_INNER_BRIDGE_LOSS_DELAY_MS ?? "0");
    const markerRequestsLoss = innerBridgeLossMarkerPath !== undefined && existsSync(innerBridgeLossMarkerPath);
    const live = initialLive && !markerRequestsLoss && (delay <= 0 || Date.now() - innerBridgeActivatedAt < delay);
    process.stdout.write(`${JSON.stringify({
      id: request.id,
      result: { schemaVersion: 1, kind: request.params?.kind, live },
    })}\n`);
    return;
  }
  if (request.method === "promote_retained_bridge") {
    const expectedKeys = [
      "schemaVersion", "actionId", "sourceActionId", "agentId", "projectSessionId", "runId",
      "principalGeneration", "providerSessionRef", "providerSessionGeneration",
      "sourceBridgeGeneration", "chairBridgeGeneration",
    ];
    const params = request.params ?? {};
    if (
      Object.keys(params).length !== expectedKeys.length ||
      expectedKeys.some((key) => !Object.hasOwn(params, key)) ||
      params.schemaVersion !== 1 ||
      typeof params.actionId !== "string" || params.actionId.length === 0 ||
      typeof params.sourceActionId !== "string" || params.sourceActionId.length === 0
    ) {
      process.stdout.write(`${JSON.stringify({
        id: request.id,
        error: { code: "INVALID_PARAMS", message: "retained bridge promotion request is invalid" },
      })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({ id: request.id, result: { schemaVersion: 1, promoted: true } })}\n`);
    return;
  }
  const providerSessionRef = request.method === "recover_chair"
    ? String(request.params?.resumeReference)
    : "fixture-chair-session";
  const providerSessionGeneration = request.method === "recover_chair"
    ? Number(request.params?.nextProviderSessionGeneration)
    : 1;
  const unsigned = {
    schemaVersion: 1 as const,
    kind: "provider-session-fabric-attestation" as const,
    method: "provider-session-random-challenge-v1" as const,
    bridgeContract: "agent-fabric-session-bridge-v1" as const,
    providerAdapterId: "fake",
    providerActionId: String(providerActionId),
    providerContractDigest: String(providerContractDigest),
    providerSessionRef,
    providerSessionGeneration,
    providerTurnRef: "fixture-provider-turn",
    challengeDigest: chairLaunchChallengeDigest(String(attestationChallenge)),
    providerInvocationRef: "fixture-provider-tool-call",
  };
  if (request.method === "launch_chair" || request.method === "recover_chair" || request.method === "provision_agent") {
    process.env.SUPERVISOR_INNER_BRIDGE_ACTIVATED_AT = String(Date.now());
  }
  const result = request.method === "launch_chair" || request.method === "recover_chair"
    ? {
        resumeReference: providerSessionRef,
        providerSessionGeneration,
        fabricContinuity: {
          ...unsigned,
          attestationDigest: chairLaunchAttestationDigest(unsigned),
        },
      }
    : request.method === "provision_agent"
      ? {
          schemaVersion: 1,
          adapterId: "fake",
          actionId: String(providerActionId),
          targetAgentId: String(request.params?.targetAgentId),
          providerSessionRef: "fixture-child-session",
          providerSessionGeneration: 1,
          bridgeGeneration: Number(request.params?.bridgeGeneration),
          bridgeContractDigest: String(request.params?.bridgeContractDigest),
          activationEvidenceDigest: `sha256:${"a".repeat(64)}`,
        }
    : { method: request.method, pid: process.pid };
  process.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`, () => {
    if (request.method !== "launch_chair") return;
    if (process.env.SUPERVISOR_EXIT_AFTER_LAUNCH === "1") process.exit(0);
    const passiveExitDelay = Number(process.env.SUPERVISOR_PASSIVE_EXIT_DELAY_MS ?? "0");
    if (passiveExitDelay > 0) setTimeout(() => process.exit(0), passiveExitDelay);
  });
});
