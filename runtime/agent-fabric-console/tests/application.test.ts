import { describe, expect, it, vi } from "vitest";

import type {
  CanonicalRelativePath,
  OperatorCapabilityCredential,
  OperatorDetailReadRequest,
  OperatorDetailReadResult,
  OperatorProjectionSnapshot,
  OperatorViewPageRequest,
  OperatorViewPageResult,
  GitRepositoryReadRequest,
  GitRepositoryProjection,
  GitRepositoryReadResult,
  MessageBodyReadResult,
  MessageId,
  ProjectId,
  ProjectSessionId,
  Sha256Digest,
  Timestamp,
  ProjectionEventsResult,
} from "@local/agent-fabric-protocol";
import {
  startFabricConsoleApplication,
  type ConsoleBootstrapResult,
  type ConsoleBootstrapPort,
} from "../src/application.js";
import {
  reduceFabricPointer,
  renderFabricConsoleFrame,
} from "../src/index.js";
import type { ConsoleProtocolPort } from "../src/protocol-adapter.js";
import { FABRIC_VIEWS } from "../src/model.js";

const timestamp = "2026-07-11T12:00:00.000Z" as Timestamp;
const digest = (`sha256:${"f".repeat(64)}`) as Sha256Digest;
const projectId = "project-application" as ProjectId;
const credential = {
  capabilityId: "capability-application",
  token: "token-never-render",
} as OperatorCapabilityCredential;

function snapshot(): OperatorProjectionSnapshot {
  return {
    schemaVersion: 1,
    snapshotRevision: 1,
    readTransactionId: "application-snapshot",
    project: {
      freshness: "live",
      source: "fabric",
      revision: 1,
      observedAt: timestamp,
      value: { projectId, canonicalRoot: "/repo" },
    },
    session: {
      freshness: "unavailable",
      source: "fabric",
      revision: 1,
      observedAt: timestamp,
      reason: "no session selected",
    },
    runs: {
      freshness: "live",
      source: "fabric",
      revision: 1,
      observedAt: timestamp,
      value: [],
    },
    attention: {
      freshness: "live",
      source: "fabric",
      revision: 1,
      observedAt: timestamp,
      value: [],
    },
    capacity: {
      freshness: "unavailable",
      source: "fabric",
      revision: 1,
      observedAt: timestamp,
      reason: "unknown",
    },
    cursor: 1,
    stateDigest: digest,
  };
}

function repositoryProjection(): GitRepositoryProjection {
  return {
    freshness: "live",
    source: "git",
    revision: 1,
    observedAt: timestamp,
    canonicalRepositoryRoot: "/repo",
    canonicalWorktreePath: "/repo",
    repositoryStateDigest: digest,
    head: { detached: false, refName: "refs/heads/main", objectDigest: digest },
    headDigest: digest,
    indexDigest: digest,
    worktreeDigest: digest,
    remoteDigest: digest,
    changes: {
      staged: { paths: ["src/staged.ts"], truncated: false },
      unstaged: { paths: ["src/changed.ts"], truncated: false },
      untracked: { paths: [], truncated: false },
      conflicted: { paths: [], truncated: false },
    },
    operationState: { kind: "clean" },
    upstream: {
      remoteName: "origin",
      branchName: "refs/remotes/origin/main",
      ahead: 1,
      behind: 0,
    },
    diff: {
      selector: { kind: "working-tree" },
      artifactRef: {
        path: "private/git-diffs/current.patch" as CanonicalRelativePath,
        digest,
      },
      baseDigest: digest,
      targetDigest: digest,
    },
    log: {
      items: [{
        objectDigest: digest,
        parentObjectDigests: [],
        subject: "Bind typed reads",
        authorTimestamp: timestamp,
      }],
      hasMore: false,
      nextCursor: null,
    },
    branches: {
      items: [{ refName: "refs/heads/main", objectDigest: digest, checkedOut: true, upstream: null }],
      truncated: false,
    },
    worktrees: {
      items: [{
        canonicalPath: "/repo",
        head: { detached: false, refName: "refs/heads/main", objectDigest: digest },
        current: true,
        locked: false,
      }],
      truncated: false,
    },
    hostedChecks: {
      freshness: "unavailable",
      source: "github",
      revision: 1,
      observedAt: timestamp,
      reason: "GitHub not configured",
    },
  };
}

function protocolPort(): ConsoleProtocolPort {
  return {
    snapshot: vi.fn(async () => snapshot()),
    events: vi.fn(async (): Promise<ProjectionEventsResult> => ({
      status: "continuation",
      events: [],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: 1,
      readTransactionId: "events",
    })),
    viewPage: vi.fn(async (request) => ({
      status: "page",
      view: request.view,
      rows: [],
      nextCursor: 0,
      hasMore: false,
      snapshotRevision: request.snapshotRevision,
      readTransactionId: `page-${request.view}`,
    }) as never),
    readDetail: vi.fn(async (): Promise<OperatorDetailReadResult> => ({
      status: "resnapshot-required",
      reason: "snapshot-mismatch",
      currentSnapshotRevision: 1,
    })),
    readGate: vi.fn(async () => {
      throw new Error("unused");
    }),
    readMessageBody: null,
    readRepository: null,
  };
}

function activityMessagePage(
  request: OperatorViewPageRequest,
  input: Readonly<{
    projectSessionId: ProjectSessionId;
    messageId: MessageId;
  }>,
): OperatorViewPageResult {
  if (request.view !== "activity") {
    return {
      status: "page",
      view: request.view,
      rows: [],
      nextCursor: 0,
      hasMore: false,
      snapshotRevision: request.snapshotRevision,
      readTransactionId: `page-${request.view}`,
    } as OperatorViewPageResult;
  }
  return {
    status: "page",
    view: "activity",
    rows: [{
      itemId: "event-must-not-be-derived",
      itemRevision: 9,
      fact: {
        freshness: "live",
        source: "fabric",
        revision: 9,
        observedAt: timestamp,
        value: {
          summary: {
            kind: "activity",
            activityKind: "message",
            summary: "Message preview",
            occurredAt: timestamp,
            messageBodyRef: {
              projectSessionId: input.projectSessionId,
              messageId: input.messageId,
              expectedRevision: 4,
            },
          },
          detailRef: {
            kind: "activity",
            eventId: "event-must-not-be-derived",
            expectedRevision: 9,
          },
          actionAvailability: { state: "read-only", reason: "state-ineligible" },
        },
      },
    }],
    nextCursor: 1,
    hasMore: false,
    snapshotRevision: request.snapshotRevision,
    readTransactionId: "page-activity",
  } as OperatorViewPageResult;
}

const runtimeDependencies = {
  render: renderFabricConsoleFrame,
  reducePointer: reduceFabricPointer,
};

describe("typed Console application bootstrap boundary", () => {
  it("renders an honest non-mutating System state when bootstrap is unavailable", async () => {
    const bootstrap: ConsoleBootstrapPort = {
      startOrAttach: vi.fn(async (): Promise<ConsoleBootstrapResult> => ({
        status: "unavailable",
        reason: "feature-unavailable",
      })),
    };
    const draw = vi.fn();

    const application = await startFabricConsoleApplication({
      bootstrap,
      projectRoot: "/repo",
      surface: "standalone",
      viewport: { columns: 80, rows: 24 },
      draw,
      eventId: () => "event-1",
      confirmationId: () => "confirmation-1",
      ...runtimeDependencies,
    });

    expect(application.dataset).toMatchObject({
      connection: { state: "unavailable", reason: "bootstrap-unavailable" },
      canMutate: false,
    });
    expect(application.controller.state.activeView).toBe("system");
    expect(application.dataset.pages.system.rows[0]).toMatchObject({
      stableId: "bootstrap",
      freshness: {
        state: "unavailable",
        reason: "feature-unavailable",
      },
    });
    expect(application.frame.rows.join("\n")).toContain("feature-unavailable");
    expect(JSON.stringify(application.dataset)).not.toContain("token-never-render");
    await application.close("operator");
  });

  it.each(["standalone", "herdr"] as const)(
    "uses the same public projection protocol on the %s surface and never replays commands",
    async (surface) => {
      const port = protocolPort();
      const detach = vi.fn(async () => {});
      const close = vi.fn(async () => {});
      const bootstrap: ConsoleBootstrapPort = {
        startOrAttach: vi.fn(async (): Promise<ConsoleBootstrapResult> => ({
          status: "connected",
          binding: { ok: true, port, readOnly: true, actions: null },
          credential,
          projectId,
          detach,
          close,
        })),
      };
      const application = await startFabricConsoleApplication({
        bootstrap,
        projectRoot: "/repo",
        surface,
        viewport: { columns: 80, rows: 24 },
        draw: () => {},
        eventId: () => "event-1",
        confirmationId: () => "confirmation-1",
        ...runtimeDependencies,
      });

      expect(application.dataset.connection).toStrictEqual({ state: "live" });
      expect(application.dataset.canMutate).toBe(false);
      expect(Object.keys(application.dataset.pages)).toStrictEqual(FABRIC_VIEWS);
      await application.refresh();
      await Promise.all([
        application.close("operator"),
        application.close("operator"),
      ]);

      expect(bootstrap.startOrAttach).toHaveBeenCalledWith({
        projectRoot: "/repo",
        surface,
      });
      expect(port.snapshot).toHaveBeenCalledTimes(1);
      expect(port.events).toHaveBeenCalledTimes(1);
      expect(detach).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
    },
  );

  it("enables mutations from the production planner returned by bootstrap", async () => {
    const port = protocolPort();
    const actions = {
      preview: vi.fn(async () => { throw new Error("unused"); }),
      commit: vi.fn(async () => { throw new Error("unused"); }),
      status: vi.fn(async () => { throw new Error("unused"); }),
      reconcile: vi.fn(async () => { throw new Error("unused"); }),
    };
    const actionPlanner = {
      plan: vi.fn(async () => null),
      confirmation: vi.fn(async () => { throw new Error("unused"); }),
    };
    const application = await startFabricConsoleApplication({
      bootstrap: {
        startOrAttach: async () => ({
          status: "connected",
          binding: { ok: true, port, readOnly: false, actions },
          credential,
          projectId,
          actionPlanner,
          detach: async () => {},
          close: async () => {},
        }),
      },
      projectRoot: "/repo",
      surface: "standalone",
      viewport: { columns: 80, rows: 24 },
      draw: () => {},
      eventId: () => "event-production-planner",
      confirmationId: () => "confirmation-production-planner",
      ...runtimeDependencies,
    });

    expect(application.dataset.canMutate).toBe(true);
    await application.close("operator");
  });

  it("reads an Activity message only from its exact revision-bound messageBodyRef on activation", async () => {
    const projectSessionId = "session-application" as ProjectSessionId;
    const messageId = "message-exact" as MessageId;
    let staleMessage = false;
    const readMessageBody = vi.fn(async (): Promise<MessageBodyReadResult> => {
      if (staleMessage) {
        throw Object.assign(new Error("message revision changed"), {
          code: "STALE_REVISION",
        });
      }
      return {
        available: true,
        messageId,
        revision: 4,
        body: "Full ordinary body line one.\nSecond line remains readable.",
        terminalNeutralised: true,
        capabilityValuesRedacted: true,
        artifactRefs: [],
      };
    });
    const port: ConsoleProtocolPort = {
      ...protocolPort(),
      readMessageBody,
      viewPage: vi.fn(async (request) =>
        activityMessagePage(request, { projectSessionId, messageId }),
      ),
    };
    const bootstrap: ConsoleBootstrapPort = {
      startOrAttach: async () => ({
        status: "connected",
        binding: { ok: true, port, readOnly: true, actions: null },
        credential,
        projectId,
        projectSessionId,
        detach: async () => {},
        close: async () => {},
      }),
    };
    const application = await startFabricConsoleApplication({
      bootstrap,
      projectRoot: "/repo",
      surface: "standalone",
      viewport: { columns: 80, rows: 24 },
      draw: () => {},
      eventId: () => "event-read-message",
      confirmationId: () => "confirmation-unused",
      ...runtimeDependencies,
    });

    await application.handleInput({ kind: "key", key: "text", text: "7" });
    await application.handleInput({ kind: "key", key: "down" });
    await application.handleInput({ kind: "key", key: "enter" });

    expect(readMessageBody).toHaveBeenCalledWith({
      credential,
      projectSessionId,
      messageId,
      expectedRevision: 4,
    });
    expect(application.frame.rows.join("\n")).toContain("Full ordinary body line one.");
    expect(application.frame.presentation.focusId).toBe(
      "detail:activity:event-must-not-be-derived",
    );
    expect(application.frame.rows.join("\n")).toContain(
      ">Message: message-exact r4",
    );
    expect(JSON.stringify(readMessageBody.mock.calls)).not.toContain("event-must-not-be-derived");

    staleMessage = true;
    await application.handleInput({ kind: "key", key: "shift-tab" });
    await application.handleInput({ kind: "key", key: "enter" });
    expect(application.dataset.inspection).toMatchObject({
      kind: "message",
      state: "unavailable",
      reason: "projection-changed",
    });
    await application.close("operator");
  });

  it("keeps the projection live and renders Activity reads honestly when message bodies are unavailable", async () => {
    const projectSessionId = "session-application" as ProjectSessionId;
    const messageId = "message-exact" as MessageId;
    const port: ConsoleProtocolPort = {
      ...protocolPort(),
      readMessageBody: null,
      viewPage: vi.fn(async (request) =>
        activityMessagePage(request, { projectSessionId, messageId }),
      ),
    };
    const application = await startFabricConsoleApplication({
      bootstrap: {
        startOrAttach: async () => ({
          status: "connected",
          binding: { ok: true, port, readOnly: true, actions: null },
          credential,
          projectId,
          projectSessionId,
          detach: async () => {},
          close: async () => {},
        }),
      },
      projectRoot: "/repo",
      surface: "standalone",
      viewport: { columns: 80, rows: 24 },
      draw: () => {},
      eventId: () => "event-read-unavailable",
      confirmationId: () => "confirmation-unused",
      ...runtimeDependencies,
    });

    await application.handleInput({ kind: "key", key: "text", text: "7" });
    await application.handleInput({ kind: "key", key: "down" });
    await application.handleInput({ kind: "key", key: "enter" });

    expect(application.dataset.inspection).toMatchObject({
      kind: "message",
      state: "unavailable",
      reason: "feature-unavailable",
    });
    expect(application.dataset.connection).toStrictEqual({ state: "live" });
    expect(application.dataset.canMutate).toBe(false);
    expect(application.frame.rows.join("\n")).toContain("feature-unavailable");
    await application.close("operator");
  });

  it("reads Project detail then requests and renders the fixed typed repository projection", async () => {
    const projectSessionId = "session-application" as ProjectSessionId;
    let selectedWorktree: string | null = null;
    let corruptDetailIdentity = false;
    let repositoryResnapshotRequired = false;
    const readDetail = vi.fn(async (
      request: OperatorDetailReadRequest,
    ): Promise<OperatorDetailReadResult> => ({
      status: "current",
      detailRef: corruptDetailIdentity
        ? { kind: "project", projectId, expectedRevision: 99 }
        : request.detailRef,
      detail: {
        freshness: "live",
        source: "fabric",
        revision: 3,
        observedAt: timestamp,
        value: {
          kind: "project",
          projectId,
          canonicalRoot: "/repo",
          goal: "Ship typed reads",
          repositoryRevision: "repo-r3",
          ...(selectedWorktree === null
            ? {}
            : {
                repository: {
                  ...repositoryProjection(),
                  canonicalWorktreePath: selectedWorktree,
                },
              }),
        },
      },
      snapshotRevision: corruptDetailIdentity
        ? request.snapshotRevision + 1
        : request.snapshotRevision,
      readTransactionId: "project-detail-read",
    }));
    const readRepository = vi.fn(async (
      request: GitRepositoryReadRequest,
    ): Promise<GitRepositoryReadResult> => {
      if (repositoryResnapshotRequired) {
        throw Object.assign(new Error("repository changed during observation"), {
          code: "PROJECTION_RESNAPSHOT_REQUIRED",
        });
      }
      const canonicalWorktreePath = request.target.kind === "project-root"
        ? "/repo"
        : request.target.canonicalWorktreePath;
      const repository = repositoryProjection();
      const currentWorktree = repository.worktrees.items[0];
      if (currentWorktree === undefined) {
        throw new Error("repository fixture requires a current worktree");
      }
      return {
        status: "current",
        projectId,
        projectSessionId,
        snapshotRevision: request.snapshotRevision,
        readTransactionId: "repository-read",
        repository: {
          ...repository,
          canonicalWorktreePath,
          worktrees: {
            items: [{
              ...currentWorktree,
              canonicalPath: canonicalWorktreePath,
            }],
            truncated: false,
          },
        },
      };
    });
    const port: ConsoleProtocolPort = {
      ...protocolPort(),
      readDetail,
      readRepository,
      viewPage: vi.fn(async (request) => {
        if (request.view !== "project") {
          return {
            status: "page",
            view: request.view,
            rows: [],
            nextCursor: 0,
            hasMore: false,
            snapshotRevision: request.snapshotRevision,
            readTransactionId: `page-${request.view}`,
          } as OperatorViewPageResult;
        }
        return {
          status: "page",
          view: "project",
          rows: [{
            itemId: "project-row",
            itemRevision: 3,
            fact: {
              freshness: "live",
              source: "fabric",
              revision: 3,
              observedAt: timestamp,
              value: {
                summary: { kind: "project", goal: "Ship typed reads", repositoryRevision: "repo-r3" },
                detailRef: { kind: "project", projectId, expectedRevision: 3 },
                actionAvailability: { state: "read-only", reason: "state-ineligible" },
              },
            },
          }],
          nextCursor: 1,
          hasMore: false,
          snapshotRevision: request.snapshotRevision,
          readTransactionId: "page-project",
        } as OperatorViewPageResult;
      }),
    };
    const application = await startFabricConsoleApplication({
      bootstrap: {
        startOrAttach: async () => ({
          status: "connected",
          binding: { ok: true, port, readOnly: true, actions: null },
          credential,
          projectId,
          projectSessionId,
          detach: async () => {},
          close: async () => {},
        }),
      },
      projectRoot: "/repo",
      surface: "standalone",
      viewport: { columns: 80, rows: 24 },
      draw: () => {},
      eventId: () => "event-read-repository",
      confirmationId: () => "confirmation-unused",
      ...runtimeDependencies,
    });

    await application.handleInput({ kind: "key", key: "text", text: "2" });
    await application.handleInput({ kind: "key", key: "down" });
    await application.handleInput({ kind: "key", key: "enter" });

    expect(readDetail).toHaveBeenCalledWith({
      credential,
      projectId,
      projectSessionId,
      snapshotRevision: 1,
      detailRef: { kind: "project", projectId, expectedRevision: 3 },
    });
    expect(readRepository).toHaveBeenCalledWith({
      credential,
      projectId,
      projectSessionId,
      snapshotRevision: 1,
      target: { kind: "project-root" },
      diff: { kind: "working-tree" },
      log: { limit: 32 },
    });
    const rendered = application.frame.rows.join("\n");
    expect(rendered).toContain("Git: LIVE");
    expect(rendered).toContain("GitHub checks: UNAVAILABLE r1");
    expect(application.dataset.connection).toStrictEqual({ state: "live" });

    selectedWorktree = "/repo/.worktrees/selected";
    await application.handleInput({ kind: "key", key: "shift-tab" });
    await application.handleInput({ kind: "key", key: "enter" });
    expect(readRepository).toHaveBeenLastCalledWith({
      credential,
      projectId,
      projectSessionId,
      snapshotRevision: 1,
      target: {
        kind: "session-worktree",
        canonicalWorktreePath: "/repo/.worktrees/selected",
      },
      diff: { kind: "working-tree" },
      log: { limit: 32 },
    });

    const repositoryReadCount = readRepository.mock.calls.length;
    corruptDetailIdentity = true;
    await application.handleInput({ kind: "key", key: "shift-tab" });
    await application.handleInput({ kind: "key", key: "enter" });
    expect(readRepository).toHaveBeenCalledTimes(repositoryReadCount);
    expect(application.dataset.inspection).toMatchObject({
      kind: "repository",
      state: "unavailable",
      reason: "contract-invalid",
    });

    corruptDetailIdentity = false;
    repositoryResnapshotRequired = true;
    await application.handleInput({ kind: "key", key: "shift-tab" });
    await application.handleInput({ kind: "key", key: "enter" });
    expect(application.dataset.inspection).toMatchObject({
      kind: "repository",
      state: "unavailable",
      reason: "repository-resnapshot-required",
    });
    await application.close("operator");
  });
});
