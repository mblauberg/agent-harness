import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  OPERATION_REGISTRY,
  createOperatorClient,
  operationsForFeatures,
  parseOperationInput,
  parseOperationResult,
  type FabricOperation,
  type OperationInputMap,
  type OperationResultMap,
  type ProtocolFeature,
  type ProtocolPrincipal,
  type ProtocolOperation,
  type ProtocolRpcTransport,
} from "../src/index.js";

const observedAt = "2026-07-11T10:00:00.000Z";
const messageBodyRef = {
  projectSessionId: "ps_01",
  messageId: "message_01",
  expectedRevision: 3,
} as const;
const credential = { capabilityId: "capability_01", token: "test-capability-token" } as const;
const digestA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const digestB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const digestC = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const digestD = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const diffArtifact = { path: "artifacts/git/working-tree.diff", digest: digestD } as const;

function currentRepositoryProjection() {
  const head = {
    detached: false,
    refName: "refs/heads/main",
    objectDigest: digestA,
  } as const;
  return {
    freshness: "live",
    source: "git",
    revision: 9,
    observedAt,
    canonicalRepositoryRoot: "/workspace/project",
    canonicalWorktreePath: "/workspace/project/.worktrees/writer",
    repositoryStateDigest: digestA,
    head,
    headDigest: digestA,
    indexDigest: digestB,
    worktreeDigest: digestC,
    remoteDigest: digestD,
    changes: {
      staged: { paths: ["src/staged.ts"], truncated: false },
      unstaged: { paths: ["src/unstaged.ts"], truncated: false },
      untracked: { paths: ["src/untracked.ts"], truncated: false },
      conflicted: { paths: [], truncated: false },
    },
    operationState: { kind: "clean" },
    upstream: { remoteName: "origin", branchName: "main", ahead: 1, behind: 0 },
    diff: {
      selector: { kind: "working-tree" },
      artifactRef: diffArtifact,
      baseDigest: digestA,
      targetDigest: digestC,
    },
    log: {
      items: [{
        objectDigest: digestA,
        parentObjectDigests: [digestB],
        subject: "Bind repository projection",
        authorTimestamp: observedAt,
      }],
      nextCursor: null,
      hasMore: false,
    },
    branches: {
      items: [{
        refName: "refs/heads/main",
        objectDigest: digestA,
        checkedOut: true,
        upstream: { remoteName: "origin", branchName: "main" },
      }],
      truncated: false,
    },
    worktrees: {
      items: [{ canonicalPath: "/workspace/project/.worktrees/writer", head, current: true, locked: false }],
      truncated: false,
    },
    hostedChecks: {
      freshness: "unavailable",
      source: "github",
      revision: 4,
      observedAt,
      reason: "not configured",
    },
  } as const;
}

function activityPage(item: Record<string, unknown>): unknown {
  return {
    view: "activity",
    page: {
      freshness: "live",
      source: "fabric",
      revision: 7,
      observedAt,
      value: { items: [item], nextCursor: 1, hasMore: false },
    },
  };
}

describe("Activity message-body binding", () => {
  it("requires and preserves the exact body reference on a v1 message item", () => {
    const item = {
      eventId: "event_01",
      kind: "message",
      actorId: "agent_01",
      taskId: null,
      summary: "Message received",
      occurredAt: observedAt,
      sourceRevision: 3,
      messageBodyRef,
    };

    expect(parseOperationResult(FABRIC_OPERATIONS.projectionPage, activityPage(item))).toStrictEqual(
      activityPage(item),
    );
    const { messageBodyRef: _missing, ...withoutReference } = item;
    expect(() => parseOperationResult(
      FABRIC_OPERATIONS.projectionPage,
      activityPage(withoutReference),
    )).toThrowError(/messageBodyRef/iu);
  });

  it("forbids a body reference on a non-message v1 item", () => {
    expect(() => parseOperationResult(FABRIC_OPERATIONS.projectionPage, activityPage({
      eventId: "event_02",
      kind: "decision",
      actorId: "operator_01",
      taskId: null,
      summary: "Decision recorded",
      occurredAt: observedAt,
      sourceRevision: 4,
      messageBodyRef,
    }))).toThrowError(/messageBodyRef|allowed variant/iu);
  });

  it("requires and preserves the same exact body reference in v2 summary and detail", () => {
    const summary = {
      kind: "activity",
      activityKind: "message",
      summary: "Message received",
      occurredAt: observedAt,
      messageBodyRef,
    } as const;
    const detailRef = { kind: "activity", eventId: "event_01", expectedRevision: 3 } as const;
    const row = {
      itemId: "event_01",
      itemRevision: 3,
      fact: {
        freshness: "live",
        source: "fabric",
        revision: 3,
        observedAt,
        value: {
          summary,
          detailRef,
          actionAvailability: { state: "read-only", reason: "feature-unavailable" },
        },
      },
    } as const;
    const detail = {
      kind: "activity",
      eventId: "event_01",
      activityKind: "message",
      summary: "Message received",
      occurredAt: observedAt,
      messageBodyRef,
    } as const;

    expect(parseOperationResult(FABRIC_OPERATIONS.projectionViewPage, {
      status: "page",
      view: "activity",
      rows: [row],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: 7,
      readTransactionId: "read_tx_01",
    })).toMatchObject({ rows: [{ fact: { value: { summary } } }] });
    expect(parseOperationResult(FABRIC_OPERATIONS.projectionDetailRead, {
      status: "current",
      detailRef,
      detail: { freshness: "live", source: "fabric", revision: 3, observedAt, value: detail },
      snapshotRevision: 7,
      readTransactionId: "read_tx_01",
    })).toMatchObject({ detail: { value: detail } });
    const bodyRead = { credential, ...messageBodyRef } as const;
    expect(parseOperationInput(FABRIC_OPERATIONS.messageBodyRead, bodyRead)).toStrictEqual(bodyRead);

    const { messageBodyRef: _missing, ...unboundSummary } = summary;
    expect(() => parseOperationResult(FABRIC_OPERATIONS.projectionViewPage, {
      status: "page",
      view: "activity",
      rows: [{ ...row, fact: { ...row.fact, value: { ...row.fact.value, summary: unboundSummary } } }],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: 7,
      readTransactionId: "read_tx_01",
    })).toThrowError(/messageBodyRef/iu);
  });

  it("forbids a body reference on a non-message v2 summary", () => {
    const summary = {
      kind: "activity",
      activityKind: "operation",
      summary: "Checked repository",
      occurredAt: observedAt,
      messageBodyRef,
    } as const;
    expect(() => parseOperationResult(FABRIC_OPERATIONS.projectionViewPage, {
      status: "page",
      view: "activity",
      rows: [{
        itemId: "event_02",
        itemRevision: 4,
        fact: {
          freshness: "live",
          source: "fabric",
          revision: 4,
          observedAt,
          value: {
            summary,
            detailRef: { kind: "activity", eventId: "event_02", expectedRevision: 4 },
            actionAvailability: { state: "read-only", reason: "feature-unavailable" },
          },
        },
      }],
      nextCursor: 2,
      hasMore: false,
      snapshotRevision: 7,
      readTransactionId: "read_tx_01",
    })).toThrowError(/messageBodyRef|allowed variant/iu);
  });
});

describe("typed operator repository read", () => {
  it("round-trips one exact operator-only repository projection without coupling hosted checks", () => {
    const operation = "fabric.v1.operator-repository.read" as ProtocolOperation;
    const input = {
      credential: credential as never,
      projectId: "project_01",
      projectSessionId: "ps_01",
      snapshotRevision: 12,
      target: {
        kind: "session-worktree",
        canonicalWorktreePath: "/workspace/project/.worktrees/writer",
      },
      diff: { kind: "working-tree" },
      log: { limit: 50 },
    } as const;
    const repository = currentRepositoryProjection();
    const result = {
      status: "current",
      projectId: "project_01",
      projectSessionId: "ps_01",
      snapshotRevision: 12,
      readTransactionId: "read_tx_01",
      repository,
    } as const;

    expect(Reflect.get(FABRIC_OPERATIONS, "operatorRepositoryRead")).toBe(operation);
    expect(Reflect.get(OPERATION_REGISTRY, operation)).toMatchObject({
      feature: "operator-repository-read.v1",
      principals: ["operator"],
    });
    expect(parseOperationInput(operation, input)).toStrictEqual(input);
    expect(parseOperationResult(operation, result)).toStrictEqual(result);
  });

  it("rejects execution escape hatches, unbound worktrees and unbounded log requests", () => {
    const operation = FABRIC_OPERATIONS.operatorRepositoryRead;
    const input = {
      credential,
      projectId: "project_01",
      projectSessionId: "ps_01",
      snapshotRevision: 12,
      target: {
        kind: "session-worktree",
        canonicalWorktreePath: "/workspace/project/.worktrees/writer",
      },
      diff: { kind: "staged" },
      log: { limit: 50 },
    } as const;

    for (const escapeHatch of [
      { shell: "git status" },
      { argv: ["git", "status"] },
      { command: "git status" },
      { gitSubcommand: "status" },
      { environment: { GIT_DIR: "/tmp/other" } },
      { repositoryRoot: "/tmp/other" },
    ]) {
      expect(() => parseOperationInput(operation, { ...input, ...escapeHatch })).toThrowError(
        /unknown field|allowed variant/iu,
      );
    }
    const { projectSessionId: _session, ...unbound } = input;
    expect(() => parseOperationInput(operation, unbound)).toThrowError(/projectSessionId|allowed variant/iu);
    expect(() => parseOperationInput(operation, {
      ...input,
      target: { ...input.target, canonicalWorktreePath: "/workspace/project/../other" },
    })).toThrowError(/canonicalWorktreePath|format|allowed variant/iu);
    expect(() => parseOperationInput(operation, { ...input, log: { limit: 129 } })).toThrowError(/limit/iu);
  });

  it("requires both exact object digests for an object diff and every repository state digest", () => {
    const operation = FABRIC_OPERATIONS.operatorRepositoryRead;
    const input = {
      credential,
      projectId: "project_01",
      snapshotRevision: 12,
      target: { kind: "project-root" },
      diff: { kind: "objects", baseObjectDigest: digestA },
      log: { limit: 50 },
    } as const;
    expect(() => parseOperationInput(operation, input)).toThrowError(/targetObjectDigest|allowed variant/iu);

    const repository = currentRepositoryProjection();
    for (const field of [
      "repositoryStateDigest",
      "headDigest",
      "indexDigest",
      "worktreeDigest",
      "remoteDigest",
    ] as const) {
      const incomplete = { ...repository } as Record<string, unknown>;
      delete incomplete[field];
      expect(() => parseOperationResult(operation, {
        status: "current",
        projectId: "project_01",
        projectSessionId: null,
        snapshotRevision: 12,
        readTransactionId: "read_tx_01",
        repository: incomplete,
      })).toThrowError(new RegExp(field, "iu"));
    }
  });

  it("requires explicit truncation and keeps GitHub freshness independent from local Git", () => {
    const operation = FABRIC_OPERATIONS.operatorRepositoryRead;
    const repository = currentRepositoryProjection();
    const result = {
      status: "current",
      projectId: "project_01",
      projectSessionId: null,
      snapshotRevision: 12,
      readTransactionId: "read_tx_01",
      repository,
    } as const;
    expect(parseOperationResult(operation, result)).toStrictEqual(result);

    const branches = { items: repository.branches.items };
    expect(() => parseOperationResult(operation, {
      ...result,
      repository: { ...repository, branches },
    })).toThrowError(/truncated/iu);
    expect(() => parseOperationResult(operation, {
      ...result,
      repository: {
        ...repository,
        hostedChecks: { ...repository.hostedChecks, source: "git" },
      },
    })).toThrowError(/source|github/iu);
  });
});

class RepositoryRecordingTransport implements ProtocolRpcTransport {
  readonly features: readonly ProtocolFeature[];
  readonly calls: Array<{ operation: FabricOperation; input: unknown }> = [];
  readonly principal: ProtocolPrincipal = {
    kind: "operator",
    operatorId: "operator_01" as never,
    projectId: "project_01" as never,
    projectAuthorityGeneration: 1,
    principalGeneration: 1,
  };
  readonly allowedOperations: ReadonlySet<FabricOperation>;

  constructor(features: readonly ProtocolFeature[]) {
    this.features = features;
    this.allowedOperations = operationsForFeatures(features);
  }

  call<Operation extends FabricOperation>(
    operation: Operation,
    input: OperationInputMap[Operation],
  ): Promise<OperationResultMap[Operation]> {
    this.calls.push({ operation, input });
    return Promise.resolve({ status: "resnapshot-required", reason: "snapshot-mismatch", currentSnapshotRevision: 2 } as OperationResultMap[Operation]);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

describe("repository-read feature negotiation", () => {
  it("exposes the typed read only when the additive feature and operation are negotiated", async () => {
    const legacy = createOperatorClient(new RepositoryRecordingTransport(["operator-projection.v2"]));
    expect(legacy.repository).toBeUndefined();

    const transport = new RepositoryRecordingTransport(["operator-repository-read.v1"]);
    const client = createOperatorClient(transport);
    if (client.repository === undefined) throw new Error("expected repository-read feature");
    const input = {
      credential: credential as never,
      projectId: "project_01" as never,
      snapshotRevision: 1,
      target: { kind: "project-root" },
      diff: { kind: "working-tree" },
      log: { limit: 25 },
    } as const;
    await client.repository.read(input);
    expect(transport.calls).toStrictEqual([{ operation: FABRIC_OPERATIONS.operatorRepositoryRead, input }]);
  });
});

describe("Project v2 Git projection", () => {
  it("carries a bounded Git summary in the row and the full typed projection in detail", () => {
    const repository = currentRepositoryProjection();
    const summary = {
      kind: "project",
      goal: "Ship Agent Fabric",
      repositoryRevision: "revision_09",
      repository: {
        freshness: repository.freshness,
        source: repository.source,
        revision: repository.revision,
        observedAt: repository.observedAt,
        repositoryStateDigest: repository.repositoryStateDigest,
        head: repository.head,
        operationState: repository.operationState.kind,
        counts: { staged: 1, unstaged: 1, untracked: 1, conflicted: 0 },
        pathsTruncated: false,
        upstream: repository.upstream,
        hostedChecks: repository.hostedChecks,
      },
    } as const;
    const detailRef = { kind: "project", projectId: "project_01", expectedRevision: 9 } as const;
    const row = {
      itemId: "project_01",
      itemRevision: 9,
      fact: {
        freshness: "live",
        source: "fabric",
        revision: 9,
        observedAt,
        value: {
          summary,
          detailRef,
          actionAvailability: { state: "read-only", reason: "feature-unavailable" },
        },
      },
    } as const;
    const detail = {
      kind: "project",
      projectId: "project_01",
      canonicalRoot: "/workspace/project",
      goal: "Ship Agent Fabric",
      repositoryRevision: "revision_09",
      repository,
    } as const;

    expect(parseOperationResult(FABRIC_OPERATIONS.projectionViewPage, {
      status: "page",
      view: "project",
      rows: [row],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: 12,
      readTransactionId: "read_tx_01",
    })).toMatchObject({ rows: [{ fact: { value: { summary } } }] });
    expect(parseOperationResult(FABRIC_OPERATIONS.projectionDetailRead, {
      status: "current",
      detailRef,
      detail: { freshness: "live", source: "fabric", revision: 9, observedAt, value: detail },
      snapshotRevision: 12,
      readTransactionId: "read_tx_01",
    })).toMatchObject({ detail: { value: detail } });
  });
});
