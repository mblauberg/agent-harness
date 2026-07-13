import {
  lifecycleDigest,
  type LifecycleAbandonAuthority,
  type LifecycleRecoveryAuthorityPort,
  type LifecycleRecoveryIssue,
  type ProviderActionPair,
} from "../../../src/lifecycle/index.ts";

export const trustedRecoveryAuthority: LifecycleRecoveryAuthorityPort = {
  nowMs: () => 1_000,
  verifyIssue: () => true,
  verifyAbandonAuthority: () => true,
};

export function freshRecoveryIssue(input: {
  readonly issueId: string;
  readonly capability: string;
  readonly projectSessionId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly sessionGeneration: number;
  readonly lossId: string;
  readonly pair: ProviderActionPair;
  readonly adapterContractDigest: LifecycleRecoveryIssue["adapterContractDigest"];
  readonly operation: string;
  readonly checkpointDigest: LifecycleRecoveryIssue["checkpointDigest"];
}): LifecycleRecoveryIssue {
  return {
    schemaVersion: 1,
    issueId: input.issueId,
    capabilityHash: lifecycleDigest(input.capability),
    path: "fresh-rotate",
    projectSessionId: input.projectSessionId,
    runId: input.runId,
    agentId: input.agentId,
    sessionGeneration: input.sessionGeneration,
    recoverySourceRef: input.lossId,
    pair: { ...input.pair },
    adapterContractDigest: input.adapterContractDigest,
    operation: input.operation,
    checkpointDigest: input.checkpointDigest,
    consequentialGateId: `gate:${input.issueId}`,
    consequentialGateDigest: lifecycleDigest(`gate:${input.issueId}`),
    directHumanAttestationDigest: null,
    directHumanReasonDigest: null,
    issuedAtMs: 900,
    expiresAtMs: 1_100,
    status: "active",
    issueAttestation: `trusted:${input.issueId}`,
  };
}

export function abandonRecoveryIssue(
  authority: LifecycleAbandonAuthority,
  recoverySourceRef: string,
  pair: ProviderActionPair | null,
): LifecycleRecoveryIssue {
  return {
    schemaVersion: 1,
    issueId: `issue:abandon:${recoverySourceRef}`,
    capabilityHash: authority.authorityDigest,
    path: "abandon",
    projectSessionId: authority.projectSessionId,
    runId: authority.runId,
    agentId: authority.agentId,
    sessionGeneration: authority.sessionGeneration,
    recoverySourceRef,
    pair: pair === null ? null : { ...pair },
    adapterContractDigest: null,
    operation: "session.cancel",
    checkpointDigest: null,
    consequentialGateId: authority.consequentialGateId,
    consequentialGateDigest: authority.consequentialGateDigest,
    directHumanAttestationDigest: authority.directHumanConfirmation.attestationDigest,
    directHumanReasonDigest: lifecycleDigest(authority.directHumanConfirmation.reason),
    issuedAtMs: 900,
    expiresAtMs: 1_100,
    status: "active",
    issueAttestation: `trusted:abandon:${recoverySourceRef}`,
  };
}
