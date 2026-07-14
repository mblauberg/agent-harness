import { createHash } from "node:crypto";

import type {
  LifecycleAdmittedRunScope,
  LifecycleAuthenticatedNamespaceCheckpoint,
  LifecycleAuthenticatedReceipt,
  LifecycleAuthenticatedScopeCheckpoint,
  LifecycleDigest,
  LifecycleIntegrityReceiptAuthorityPort,
  LifecycleReceiptLookup,
  LifecycleReceiptRecord,
} from "../../src/lifecycle/receipt-authority.ts";

export type LifecycleReceiptAuthorityCorruption = "none" | "gap" | "duplicate" | "wrong-set-digest";

type StoredScope = {
  scope: LifecycleAdmittedRunScope;
  initialCheckpoint?: LifecycleAuthenticatedScopeCheckpoint;
  records: LifecycleReceiptRecord[];
};

type ScopeSnapshot = {
  checkpoint: LifecycleAuthenticatedScopeCheckpoint;
  records: readonly LifecycleReceiptRecord[];
};

type NamespaceSnapshot = {
  checkpoint: LifecycleAuthenticatedNamespaceCheckpoint;
  heads: readonly LifecycleAuthenticatedScopeCheckpoint[];
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number is not canonical JSON");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    return `{${Object.keys(source)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("value is not canonical JSON");
}

function digest(domain: string, value: unknown): LifecycleDigest {
  return `sha256:${createHash("sha256")
    .update(`agent-fabric.lifecycle.v1\0${domain}\0${canonicalJson(value)}`)
    .digest("hex")}`;
}

function receiptAttestation(receiptDigest: LifecycleDigest): string {
  return `test-receipt:${receiptDigest}`;
}

function checkpointAttestation(checkpointDigest: LifecycleDigest): string {
  return `test-checkpoint:${checkpointDigest}`;
}

function namespaceAttestation(checkpointDigest: LifecycleDigest): string {
  return `test-namespace:${checkpointDigest}`;
}

function row(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) throw new TypeError(`${key} must be a string`);
  return field;
}

function positiveInteger(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (!Number.isSafeInteger(field) || (field as number) < 1) throw new TypeError(`${key} must be positive`);
  return field as number;
}

function scopeKey(projectSessionId: string, runId: string): string {
  return `${projectSessionId}\0${runId}`;
}

function receiptOwner(subject: Readonly<Record<string, unknown>>): {
  ownerRefDigest: LifecycleDigest;
  ownerRevision: number;
} {
  const ownerRef = row(subject.ownerRef, "ownerRef");
  if (ownerRef.kind === "custody") {
    const custodyRef = row(ownerRef.custodyRef, "custodyRef");
    return {
      ownerRefDigest: digest("receipt-owner-ref", ownerRef),
      ownerRevision: positiveInteger(custodyRef, "custodyRevision"),
    };
  }
  if (ownerRef.kind === "generation-loss") {
    const lossRef = row(ownerRef.generationLossRef, "generationLossRef");
    return {
      ownerRefDigest: digest("receipt-owner-ref", ownerRef),
      ownerRevision: positiveInteger(lossRef, "generationLossRevision"),
    };
  }
  if (ownerRef.kind === "recovery-retirement") {
    const retirementRef = row(ownerRef.retirementRef, "retirementRef");
    const revision = Number(text(retirementRef, "revisionDec"));
    if (!Number.isSafeInteger(revision) || revision < 1) throw new TypeError("revisionDec must be positive");
    return { ownerRefDigest: digest("receipt-owner-ref", ownerRef), ownerRevision: revision };
  }
  throw new TypeError("unsupported receipt ownerRef");
}

function receiptSetMember(record: LifecycleReceiptRecord): readonly [
  string, LifecycleDigest, LifecycleDigest, string, string, string, string, string,
] {
  const subject = record.subject;
  const ownerRef = row(subject.ownerRef, "ownerRef");
  let ownerKind: string;
  let ownerId: string;
  let ownerRevision: string;
  if (ownerRef.kind === "custody") {
    const custodyRef = row(ownerRef.custodyRef, "custodyRef");
    ownerKind = "custody";
    ownerId = text(custodyRef, "custodyId");
    ownerRevision = String(positiveInteger(custodyRef, "custodyRevision"));
  } else if (ownerRef.kind === "generation-loss") {
    const lossRef = row(ownerRef.generationLossRef, "generationLossRef");
    ownerKind = "generation-loss";
    ownerId = text(lossRef, "generationLossId");
    ownerRevision = String(positiveInteger(lossRef, "generationLossRevision"));
  } else if (ownerRef.kind === "recovery-retirement") {
    const retirementRef = row(ownerRef.retirementRef, "retirementRef");
    ownerKind = "recovery-retirement";
    ownerId = text(retirementRef, "retirementId");
    ownerRevision = text(retirementRef, "revisionDec");
  } else {
    throw new TypeError("unsupported receipt ownerRef");
  }
  return [
    String(record.receipt.authoritySequence),
    record.receipt.receiptDigest,
    record.receipt.intentDigest,
    text(subject as Record<string, unknown>, "kind"),
    text(subject as Record<string, unknown>, "agentId"),
    ownerKind,
    ownerId,
    ownerRevision,
  ];
}

function receiptLookupKey(lookup: LifecycleReceiptLookup): string {
  return canonicalJson(lookup);
}

function lookupForSubject(subject: Readonly<Record<string, unknown>>): LifecycleReceiptLookup {
  const owner = receiptOwner(subject);
  return {
    kind: text(subject as Record<string, unknown>, "kind") as LifecycleReceiptLookup["kind"],
    projectSessionId: text(subject as Record<string, unknown>, "projectSessionId"),
    runId: text(subject as Record<string, unknown>, "runId"),
    agentId: text(subject as Record<string, unknown>, "agentId"),
    ownerRefDigest: owner.ownerRefDigest,
    ownerRevision: owner.ownerRevision,
  };
}

function unrelatedSubject(subject: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const projectSessionId = text(subject as Record<string, unknown>, "projectSessionId");
  const runId = text(subject as Record<string, unknown>, "runId");
  const agentId = `${text(subject as Record<string, unknown>, "agentId")}-unrelated`;
  const custodyId = "test-authority-unrelated-custody";
  const custodyRef = { schemaVersion: 1, runId, agentId, custodyId, custodyRevision: 1 };
  const ownerRef = {
    kind: "custody",
    custodyRef,
    sourceRefDigest: digest("test-unrelated-source", { projectSessionId, runId, agentId, custodyId }),
  };
  return { ...subject, agentId, ownerRef };
}

export class TestLifecycleReceiptAuthority implements LifecycleIntegrityReceiptAuthorityPort {
  readonly authorityId: string;
  corruption: LifecycleReceiptAuthorityCorruption = "none";
  appendSuccessThenThrowOnce = false;
  appendUnrelatedAfterNextReceipt = false;
  readReceiptAlwaysAbsent = false;
  onReadReceiptOnce: (() => void) | undefined;
  admitCalls = 0;
  appendCalls = 0;
  appendThrowCount = 0;

  readonly #scopes = new Map<string, StoredScope>();
  readonly #scopeSnapshots = new Map<LifecycleDigest, ScopeSnapshot>();
  readonly #namespaceSnapshots = new Map<LifecycleDigest, NamespaceSnapshot>();
  readonly #receiptsByLookup = new Map<string, LifecycleReceiptRecord>();

  constructor(authorityId = "test-lifecycle-receipt-authority") {
    this.authorityId = authorityId;
  }

  async admitScope(scope: LifecycleAdmittedRunScope): Promise<LifecycleAuthenticatedScopeCheckpoint> {
    this.admitCalls += 1;
    if (scope.authorityId !== this.authorityId) throw new Error("scope authority crossed");
    const key = scopeKey(scope.projectSessionId, scope.runId);
    const existing = this.#scopes.get(key);
    if (existing !== undefined) {
      if (canonicalJson(existing.scope) !== canonicalJson(scope)) throw new Error("scope admission conflict");
      if (existing.initialCheckpoint === undefined) throw new Error("scope admission is incomplete");
      return existing.initialCheckpoint;
    }
    const stored: StoredScope = { scope, records: [] };
    const initialCheckpoint = this.#scopeCheckpoint(stored);
    stored.initialCheckpoint = initialCheckpoint;
    this.#scopes.set(key, stored);
    this.#storeScopeSnapshot(stored, initialCheckpoint);
    this.#namespaceCheckpoint(scope.projectId);
    return initialCheckpoint;
  }

  async appendReceipt(
    intentDigest: LifecycleDigest,
    subject: Readonly<Record<string, unknown>>,
  ): Promise<LifecycleAuthenticatedReceipt> {
    this.appendCalls += 1;
    const record = this.#appendStored(intentDigest, subject);
    if (this.appendUnrelatedAfterNextReceipt) {
      this.appendUnrelatedAfterNextReceipt = false;
      const extra = unrelatedSubject(subject);
      this.#appendStored(digest("test-unrelated-intent", extra), extra);
    }
    if (this.appendSuccessThenThrowOnce) {
      this.appendSuccessThenThrowOnce = false;
      this.appendThrowCount += 1;
      throw new Error("test authority lost the successful append response");
    }
    return record.receipt;
  }

  async readReceipt(lookup: LifecycleReceiptLookup): Promise<LifecycleReceiptRecord | null> {
    const hook = this.onReadReceiptOnce;
    this.onReadReceiptOnce = undefined;
    hook?.();
    if (this.readReceiptAlwaysAbsent) return null;
    return this.#receiptsByLookup.get(receiptLookupKey(lookup)) ?? null;
  }

  async readScopeCheckpoint(
    projectSessionId: string,
    runId: string,
  ): Promise<LifecycleAuthenticatedScopeCheckpoint> {
    const scope = this.#requiredScope(projectSessionId, runId);
    return this.#scopeCheckpoint(scope);
  }

  async readScopeCheckpointAt(
    checkpointDigest: LifecycleDigest,
  ): Promise<LifecycleAuthenticatedScopeCheckpoint> {
    const snapshot = this.#scopeSnapshots.get(checkpointDigest);
    if (snapshot === undefined) throw new Error("unknown pinned scope checkpoint");
    return snapshot.checkpoint;
  }

  async readScopePageAt(
    checkpointDigest: LifecycleDigest,
    afterAuthoritySequence: number,
    limit = 256,
  ): Promise<Readonly<{ orderedRecords: readonly LifecycleReceiptRecord[]; nextAfter: number | null }>> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) throw new Error("invalid page limit");
    const snapshot = this.#scopeSnapshots.get(checkpointDigest);
    if (snapshot === undefined) throw new Error("unknown pinned scope checkpoint");
    const records = snapshot.records.map((record) => structuredClone(record));
    if (records.length >= 2 && this.corruption === "gap") {
      const second = records[1]!;
      records[1] = {
        ...second,
        receipt: { ...second.receipt, authoritySequence: second.receipt.authoritySequence + 1 },
      };
    } else if (records.length >= 2 && this.corruption === "duplicate") {
      records[1] = structuredClone(records[0]!);
    }
    const start = Math.max(0, afterAuthoritySequence);
    const orderedRecords = records.slice(start, start + limit);
    const end = start + orderedRecords.length;
    return { orderedRecords, nextAfter: end < records.length ? end : null };
  }

  async readNamespaceCheckpoint(projectId: string): Promise<LifecycleAuthenticatedNamespaceCheckpoint> {
    return this.#namespaceCheckpoint(projectId);
  }

  async readNamespacePageAt(
    checkpointDigest: LifecycleDigest,
    afterScopeKey: string | null,
    limit = 256,
  ): Promise<Readonly<{
    orderedScopeHeads: readonly LifecycleAuthenticatedScopeCheckpoint[];
    nextAfter: string | null;
  }>> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) throw new Error("invalid page limit");
    const snapshot = this.#namespaceSnapshots.get(checkpointDigest);
    if (snapshot === undefined) throw new Error("unknown pinned namespace checkpoint");
    const start = afterScopeKey === null
      ? 0
      : snapshot.heads.findIndex((head) => scopeKey(head.projectSessionId, head.runId) > afterScopeKey);
    if (start < 0) return { orderedScopeHeads: [], nextAfter: null };
    const orderedScopeHeads = snapshot.heads.slice(start, start + limit);
    const end = start + orderedScopeHeads.length;
    const nextAfter = end < snapshot.heads.length
      ? scopeKey(orderedScopeHeads.at(-1)!.projectSessionId, orderedScopeHeads.at(-1)!.runId)
      : null;
    return { orderedScopeHeads, nextAfter };
  }

  async verifyReceipt(
    subject: Readonly<Record<string, unknown>>,
    receipt: LifecycleAuthenticatedReceipt,
  ): Promise<boolean> {
    const subjectDigest = digest("receipt-subject", subject);
    const body = {
      schemaVersion: 1 as const,
      kind: receipt.kind,
      authorityId: receipt.authorityId,
      authoritySequence: receipt.authoritySequence,
      previousReceiptDigest: receipt.previousReceiptDigest,
      intentDigest: receipt.intentDigest,
      subjectDigest: receipt.subjectDigest,
    };
    const receiptDigest = digest("authenticated-receipt", body);
    return receipt.authorityId === this.authorityId && receipt.subjectDigest === subjectDigest &&
      receipt.receiptDigest === receiptDigest && receipt.attestation === receiptAttestation(receiptDigest);
  }

  async verifyScopeCheckpoint(checkpoint: LifecycleAuthenticatedScopeCheckpoint): Promise<boolean> {
    const body = {
      schemaVersion: 1,
      authorityId: checkpoint.authorityId,
      projectSessionId: checkpoint.projectSessionId,
      runId: checkpoint.runId,
      receiptCountDec: String(checkpoint.receiptCount),
      headAuthoritySequenceDec: String(checkpoint.headAuthoritySequence),
      headReceiptDigest: checkpoint.headReceiptDigest,
      orderedRecordSetDigest: checkpoint.orderedRecordSetDigest,
    };
    const checkpointDigest = digest("scope-checkpoint", body);
    return checkpoint.authorityId === this.authorityId && checkpoint.checkpointDigest === checkpointDigest &&
      checkpoint.attestation === checkpointAttestation(checkpointDigest);
  }

  async verifyNamespaceCheckpoint(checkpoint: LifecycleAuthenticatedNamespaceCheckpoint): Promise<boolean> {
    const body = {
      schemaVersion: 1,
      authorityId: checkpoint.authorityId,
      projectId: checkpoint.projectId,
      scopeCountDec: String(checkpoint.scopeCount),
      orderedScopeHeadSetDigest: checkpoint.orderedScopeHeadSetDigest,
    };
    const checkpointDigest = digest("namespace-checkpoint", body);
    return checkpoint.authorityId === this.authorityId && checkpoint.checkpointDigest === checkpointDigest &&
      checkpoint.attestation === namespaceAttestation(checkpointDigest);
  }

  latestScopeCheckpoint(projectSessionId: string, runId: string): LifecycleAuthenticatedScopeCheckpoint {
    return this.#scopeCheckpoint(this.#requiredScope(projectSessionId, runId));
  }

  scopeRecords(projectSessionId: string, runId: string): readonly LifecycleReceiptRecord[] {
    return structuredClone(this.#requiredScope(projectSessionId, runId).records);
  }

  #appendStored(
    intentDigest: LifecycleDigest,
    subject: Readonly<Record<string, unknown>>,
  ): LifecycleReceiptRecord {
    const lookup = lookupForSubject(subject);
    const lookupKey = receiptLookupKey(lookup);
    const existing = this.#receiptsByLookup.get(lookupKey);
    if (existing !== undefined) {
      if (existing.receipt.intentDigest !== intentDigest || canonicalJson(existing.subject) !== canonicalJson(subject)) {
        throw new Error("receipt lookup conflict");
      }
      return existing;
    }
    const scope = this.#requiredScope(lookup.projectSessionId, lookup.runId);
    const previous = scope.records.at(-1)?.receipt ?? null;
    const subjectDigest = digest("receipt-subject", subject);
    const body = {
      schemaVersion: 1 as const,
      kind: lookup.kind,
      authorityId: this.authorityId,
      authoritySequence: scope.records.length + 1,
      previousReceiptDigest: previous?.receiptDigest ?? null,
      intentDigest,
      subjectDigest,
    };
    const receiptDigest = digest("authenticated-receipt", body);
    const record: LifecycleReceiptRecord = {
      subject: structuredClone(subject),
      receipt: {
        ...body,
        receiptDigest,
        attestation: receiptAttestation(receiptDigest),
      },
    };
    scope.records.push(record);
    this.#receiptsByLookup.set(lookupKey, record);
    const checkpoint = this.#scopeCheckpoint(scope);
    this.#storeScopeSnapshot(scope, checkpoint);
    this.#namespaceCheckpoint(scope.scope.projectId);
    return record;
  }

  #requiredScope(projectSessionId: string, runId: string): StoredScope {
    const scope = this.#scopes.get(scopeKey(projectSessionId, runId));
    if (scope === undefined) throw new Error("scope is not admitted");
    return scope;
  }

  #scopeCheckpoint(scope: StoredScope): LifecycleAuthenticatedScopeCheckpoint {
    const records = scope.records;
    const actualSetDigest = digest("scope-record-set", records.map((record) => receiptSetMember(record)));
    const orderedRecordSetDigest = this.corruption === "wrong-set-digest" && records.length > 0
      ? digest("test-wrong-scope-record-set", records.length)
      : actualSetDigest;
    const body = {
      schemaVersion: 1,
      authorityId: this.authorityId,
      projectSessionId: scope.scope.projectSessionId,
      runId: scope.scope.runId,
      receiptCountDec: String(records.length),
      headAuthoritySequenceDec: String(records.length),
      headReceiptDigest: records.at(-1)?.receipt.receiptDigest ?? null,
      orderedRecordSetDigest,
    };
    const checkpointDigest = digest("scope-checkpoint", body);
    const checkpoint: LifecycleAuthenticatedScopeCheckpoint = {
      schemaVersion: 1,
      projectSessionId: scope.scope.projectSessionId,
      runId: scope.scope.runId,
      authorityId: this.authorityId,
      receiptCount: records.length,
      headAuthoritySequence: records.length,
      headReceiptDigest: records.at(-1)?.receipt.receiptDigest ?? null,
      orderedRecordSetDigest,
      checkpointDigest,
      attestation: checkpointAttestation(checkpointDigest),
    };
    this.#storeScopeSnapshot(scope, checkpoint);
    return checkpoint;
  }

  #storeScopeSnapshot(scope: StoredScope, checkpoint: LifecycleAuthenticatedScopeCheckpoint): void {
    this.#scopeSnapshots.set(checkpoint.checkpointDigest, {
      checkpoint,
      records: structuredClone(scope.records),
    });
  }

  #namespaceCheckpoint(projectId: string): LifecycleAuthenticatedNamespaceCheckpoint {
    const heads = [...this.#scopes.values()]
      .filter((scope) => scope.scope.projectId === projectId)
      .map((scope) => this.#scopeCheckpoint(scope))
      .sort((left, right) => {
        const leftKey = scopeKey(left.projectSessionId, left.runId);
        const rightKey = scopeKey(right.projectSessionId, right.runId);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
    const members = heads.map((head) => ({
      projectSessionId: head.projectSessionId,
      runId: head.runId,
      authorityId: head.authorityId,
      scopeCheckpointDigest: head.checkpointDigest,
      receiptCountDec: String(head.receiptCount),
      headReceiptDigest: head.headReceiptDigest,
    }));
    const body = {
      schemaVersion: 1,
      authorityId: this.authorityId,
      projectId,
      scopeCountDec: String(heads.length),
      orderedScopeHeadSetDigest: digest("namespace-scope-head-set", members),
    };
    const checkpointDigest = digest("namespace-checkpoint", body);
    const checkpoint: LifecycleAuthenticatedNamespaceCheckpoint = {
      schemaVersion: 1,
      projectId,
      authorityId: this.authorityId,
      scopeCount: heads.length,
      orderedScopeHeadSetDigest: body.orderedScopeHeadSetDigest,
      checkpointDigest,
      attestation: namespaceAttestation(checkpointDigest),
    };
    this.#namespaceSnapshots.set(checkpointDigest, { checkpoint, heads: structuredClone(heads) });
    return checkpoint;
  }
}
