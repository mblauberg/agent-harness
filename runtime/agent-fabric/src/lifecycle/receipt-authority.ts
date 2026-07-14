export type LifecycleDigest = `sha256:${string}`;

export type LifecycleReceiptLookup = Readonly<{
  kind: "custody-terminal" | "generation-loss-terminal" | "custody-recovery-retirement" | "review-adoption-decision" | "fresh-origin";
  projectSessionId: string;
  runId: string;
  agentId: string;
  ownerRefDigest: LifecycleDigest;
  ownerRevision: number;
}>;

export type LifecycleAuthenticatedReceipt = Readonly<{
  schemaVersion: 1;
  kind: LifecycleReceiptLookup["kind"];
  authorityId: string;
  authoritySequence: number;
  previousReceiptDigest: LifecycleDigest | null;
  subjectDigest: LifecycleDigest;
  intentDigest: LifecycleDigest;
  receiptDigest: LifecycleDigest;
  attestation: string;
}>;

export type LifecycleReceiptRecord = Readonly<{
  subject: Readonly<Record<string, unknown>>;
  receipt: LifecycleAuthenticatedReceipt;
}>;

export type LifecycleAuthenticatedScopeCheckpoint = Readonly<{
  schemaVersion: 1;
  projectSessionId: string;
  runId: string;
  authorityId: string;
  receiptCount: number;
  headAuthoritySequence: number;
  headReceiptDigest: LifecycleDigest | null;
  orderedRecordSetDigest: LifecycleDigest;
  checkpointDigest: LifecycleDigest;
  attestation: string;
}>;

export type LifecycleAuthenticatedNamespaceCheckpoint = Readonly<{
  schemaVersion: 1;
  projectId: string;
  authorityId: string;
  scopeCount: number;
  orderedScopeHeadSetDigest: LifecycleDigest;
  checkpointDigest: LifecycleDigest;
  attestation: string;
}>;

export type LifecycleAdmittedRunScope = Readonly<{
  schemaVersion: 1;
  projectId: string;
  projectSessionId: string;
  runId: string;
  authorityId: string;
  admissionDigest: LifecycleDigest;
  admittedAt: number;
}>;

/**
 * External append-only trust boundary for lifecycle receipts.
 *
 * Implementations own their storage and authentication material outside the
 * Fabric database. Every returned object is still revalidated by the local
 * receipt repository before it can authorize a transition apply.
 */
export interface LifecycleIntegrityReceiptAuthorityPort {
  readonly authorityId: string;
  admitScope(scope: LifecycleAdmittedRunScope): Promise<LifecycleAuthenticatedScopeCheckpoint>;
  appendReceipt(
    intentDigest: LifecycleDigest,
    subject: Readonly<Record<string, unknown>>,
  ): Promise<LifecycleAuthenticatedReceipt>;
  readReceipt(lookup: LifecycleReceiptLookup): Promise<LifecycleReceiptRecord | null>;
  readScopeCheckpoint(
    projectSessionId: string,
    runId: string,
  ): Promise<LifecycleAuthenticatedScopeCheckpoint>;
  readScopeCheckpointAt(checkpointDigest: LifecycleDigest): Promise<LifecycleAuthenticatedScopeCheckpoint>;
  readScopePageAt(
    checkpointDigest: LifecycleDigest,
    afterAuthoritySequence: number,
    limit?: number,
  ): Promise<Readonly<{
    orderedRecords: readonly LifecycleReceiptRecord[];
    nextAfter: number | null;
  }>>;
  readNamespaceCheckpoint(projectId: string): Promise<LifecycleAuthenticatedNamespaceCheckpoint>;
  readNamespacePageAt(
    checkpointDigest: LifecycleDigest,
    afterScopeKey: string | null,
    limit?: number,
  ): Promise<Readonly<{
    orderedScopeHeads: readonly LifecycleAuthenticatedScopeCheckpoint[];
    nextAfter: string | null;
  }>>;
  verifyReceipt(
    subject: Readonly<Record<string, unknown>>,
    receipt: LifecycleAuthenticatedReceipt,
  ): Promise<boolean>;
  verifyScopeCheckpoint(checkpoint: LifecycleAuthenticatedScopeCheckpoint): Promise<boolean>;
  verifyNamespaceCheckpoint(checkpoint: LifecycleAuthenticatedNamespaceCheckpoint): Promise<boolean>;
}
