import {
  LifecycleRotationDomain,
  lifecycleDigest,
  type LifecycleAgentSeed,
  type LifecycleAuthenticatedReceipt,
  type LifecycleAbandonAuthority,
  type LifecycleIntegrityReceiptAuthorityPort,
  type LifecycleIntegrityReceiptLedger,
  type LifecycleIntegrityReceiptLookup,
  type LifecycleIntegrityReceiptRecord,
  type LifecycleIntegrityReceiptScopeHead,
  type LifecycleIntegrityReceiptSubject,
  type LifecycleDomainPorts,
  type LifecycleDomainSnapshotV1,
  type LifecycleRecoveryAuthorityPort,
  type LifecycleRecoveryIssue,
  type ProviderActionPair,
} from "../../../src/lifecycle/index.ts";

export const trustedRecoveryAuthority: LifecycleRecoveryAuthorityPort = {
  nowMs: () => 1_000,
  verifyIssue: () => true,
  verifyAbandonAuthority: () => true,
};

const RECEIPT_AUTHORITY_ID = "test:lifecycle-integrity-ledger";
const RECEIPT_NAMESPACE_ID = "test:lifecycle-domain";
const RECEIPT_AUTHORITY_SECRET = "test-only-receipt-authority-secret";
const receiptLedger = new Map<string, LifecycleIntegrityReceiptRecord>();
let receiptHead: LifecycleAuthenticatedReceipt | null = null;

export function resetTrustedLifecycleIntegrityReceipts(): void {
  receiptLedger.clear();
  receiptHead = null;
}

function receiptLookupKey(lookup: LifecycleIntegrityReceiptLookup): string {
  return [lookup.kind, lookup.projectSessionId, lookup.runId, lookup.agentId, lookup.custodyRef].join("\u0000");
}

function receiptSubjectLookup(subject: LifecycleIntegrityReceiptSubject): LifecycleIntegrityReceiptLookup {
  return {
    kind: subject.kind,
    projectSessionId: subject.projectSessionId,
    runId: subject.runId,
    agentId: subject.agentId,
    custodyRef: subject.kind === "custody-terminal"
      ? subject.custodyRef
      : subject.lifecycleCustodyRef.custodyId,
  };
}

function ledgerSnapshot(): LifecycleIntegrityReceiptLedger {
  const records = [...receiptLedger.values()]
    .sort((left, right) => left.receipt.authoritySequence - right.receipt.authoritySequence)
    .map((record) => structuredClone(record));
  const scopes = new Map<string, LifecycleIntegrityReceiptRecord[]>();
  for (const record of records) {
    const key = `${record.subject.projectSessionId}\u0000${record.subject.runId}`;
    const existing = scopes.get(key) ?? [];
    existing.push(record);
    scopes.set(key, existing);
  }
  const scopeHeads: LifecycleIntegrityReceiptScopeHead[] = [...scopes]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, scopeRecords]) => {
      const first = scopeRecords[0] as LifecycleIntegrityReceiptRecord;
      const last = scopeRecords.at(-1) as LifecycleIntegrityReceiptRecord;
      const preimage = {
        schemaVersion: 1 as const,
        projectSessionId: first.subject.projectSessionId,
        runId: first.subject.runId,
        recordCount: scopeRecords.length,
        firstAuthoritySequence: first.receipt.authoritySequence,
        lastAuthoritySequence: last.receipt.authoritySequence,
        receiptDigests: scopeRecords.map((record) => record.receipt.receiptDigest),
      };
      const { receiptDigests: _receiptDigests, ...head } = preimage;
      return { ...head, headDigest: lifecycleDigest(preimage) };
    });
  const preimage = {
    schemaVersion: 1 as const,
    namespaceId: RECEIPT_NAMESPACE_ID,
    authorityId: RECEIPT_AUTHORITY_ID,
    sequenceHighWater: receiptHead?.authoritySequence ?? 0,
    recordCount: records.length,
    scopeHeads,
    recordBindings: records.map((record) => ({
      authoritySequence: record.receipt.authoritySequence,
      subjectDigest: lifecycleDigest(record.subject),
      receiptDigest: record.receipt.receiptDigest,
    })),
  };
  const ledgerDigest = lifecycleDigest(preimage);
  return {
    schemaVersion: 1,
    namespaceId: RECEIPT_NAMESPACE_ID,
    authorityId: RECEIPT_AUTHORITY_ID,
    sequenceHighWater: preimage.sequenceHighWater,
    recordCount: records.length,
    scopeHeads,
    records,
    ledgerDigest,
    attestation: lifecycleDigest({ secret: RECEIPT_AUTHORITY_SECRET, ledgerDigest }),
  };
}

export const trustedLifecycleIntegrityReceipts: LifecycleIntegrityReceiptAuthorityPort = {
  appendReceipt(subject: LifecycleIntegrityReceiptSubject): LifecycleAuthenticatedReceipt {
    const subjectDigest = lifecycleDigest(subject);
    const key = receiptLookupKey(receiptSubjectLookup(subject));
    const existing = receiptLedger.get(key);
    if (existing !== undefined) {
      if (lifecycleDigest(existing.subject) !== subjectDigest) {
        throw new Error("append-only lifecycle receipt key reused with a changed subject");
      }
      return existing.receipt;
    }
    const receiptPreimage = {
      schemaVersion: 1 as const,
      kind: subject.kind,
      authorityId: RECEIPT_AUTHORITY_ID,
      authoritySequence: receiptLedger.size + 1,
      previousReceiptDigest: receiptHead?.receiptDigest ?? null,
      subjectDigest,
    };
    const receiptDigest = lifecycleDigest(receiptPreimage);
    const receipt: LifecycleAuthenticatedReceipt = Object.freeze({
      ...receiptPreimage,
      receiptDigest,
      attestation: lifecycleDigest({ secret: RECEIPT_AUTHORITY_SECRET, receiptDigest }),
    });
    receiptLedger.set(key, Object.freeze({ subject: structuredClone(subject), receipt }));
    receiptHead = receipt;
    return receipt;
  },
  readReceipt(lookup: LifecycleIntegrityReceiptLookup): LifecycleIntegrityReceiptRecord | null {
    const record = receiptLedger.get(receiptLookupKey(lookup));
    return record === undefined ? null : structuredClone(record);
  },
  verifyReceipt(subject: LifecycleIntegrityReceiptSubject, receipt: LifecycleAuthenticatedReceipt): boolean {
    const stored = receiptLedger.get(receiptLookupKey(receiptSubjectLookup(subject)));
    return stored !== undefined && lifecycleDigest(stored.subject) === lifecycleDigest(subject) &&
      lifecycleDigest(stored.receipt) === lifecycleDigest(receipt) &&
      receipt.attestation === lifecycleDigest({
        secret: RECEIPT_AUTHORITY_SECRET,
        receiptDigest: receipt.receiptDigest,
      });
  },
  readLedger(): LifecycleIntegrityReceiptLedger {
    return ledgerSnapshot();
  },
  verifyLedger(ledger: LifecycleIntegrityReceiptLedger): boolean {
    const expected = ledgerSnapshot();
    return lifecycleDigest(ledger) === lifecycleDigest(expected) &&
      ledger.attestation === lifecycleDigest({
        secret: RECEIPT_AUTHORITY_SECRET,
        ledgerDigest: ledger.ledgerDigest,
      });
  },
};

export class ReceiptBackedLifecycleRotationDomain extends LifecycleRotationDomain {
  constructor(
    ports: LifecycleDomainPorts,
    agents: readonly LifecycleAgentSeed[],
    recoveryIssues: readonly LifecycleRecoveryIssue[] = [],
  ) {
    resetTrustedLifecycleIntegrityReceipts();
    super({ ...ports, integrityReceipts: trustedLifecycleIntegrityReceipts }, agents, recoveryIssues);
  }

  static override hydrate(
    ports: LifecycleDomainPorts,
    snapshot: LifecycleDomainSnapshotV1,
  ): ReceiptBackedLifecycleRotationDomain {
    return LifecycleRotationDomain.hydrate(
      { ...ports, integrityReceipts: trustedLifecycleIntegrityReceipts },
      snapshot,
    ) as ReceiptBackedLifecycleRotationDomain;
  }
}

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
