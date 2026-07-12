import stringWidth from "string-width";

import type {
  AgentId,
  AttentionItem,
  NativeNotificationDeliverySummary,
  ProjectId,
  ProjectSession,
  ProjectSessionId,
  RunProjection,
  Sha256Digest,
  Timestamp,
} from "@local/agent-fabric-protocol";

import type { ConsoleControllerState } from "./controller.js";
import type { FabricConsoleFrame } from "./index.js";
import {
  FABRIC_VIEWS,
  createEmptyViewPages,
  rankConsoleRows,
  revisionFromProtocol,
  type ConsoleFreshness,
  type ConsoleNativeNotification,
  type ConsoleRow,
  type FabricView,
} from "./model.js";
import { createFabricUiState } from "./presenter.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";
import {
  FabricConsoleRuntime,
  type FabricConsoleRuntimeOptions,
  type FabricRuntimeController,
} from "./runtime.js";

const timestamp = "2026-07-11T12:00:00.000Z" as Timestamp;
const digest = (`sha256:${"d".repeat(64)}`) as Sha256Digest;

export type UsabilityExpectedAnswers = Readonly<{
  project: string;
  run: string;
  phase: string;
  owner: string;
  nextMilestone: string;
  health: string;
}>;

export type UsabilityRun = Readonly<{
  id: string;
  session: string;
  phase: string;
  owner: string;
  nextMilestone: string;
  health: "healthy" | "degraded" | "blocked" | "quarantined" | "unknown";
}>;

export type UsabilityAttention = Readonly<{
  id: string;
  label: "Decision" | "Approval" | "Blocked" | "FYI";
  priority:
    | "safety-integrity"
    | "critical-path"
    | "expiring-authority"
    | "acceptance-ready"
    | "advisory";
  title: string;
  freshness: "live" | "snapshot" | "stale" | "unavailable" | "conflict";
  ageMs: number;
  duplicateCount: number;
  consequential: boolean;
  nativeNotification: Readonly<{
    status: "available" | "unavailable" | "stale";
    journalState:
      | "missing"
      | "pending"
      | "claimed"
      | "sent"
      | "failed"
      | "deduplicated"
      | "ambiguous";
    integrationState: "absent" | "available" | "unavailable" | "stale";
  }>;
}>;

export type UsabilitySystem = Readonly<{
  id: string;
  state: "healthy" | "degraded" | "stale" | "unavailable" | "conflict";
  freshness: "live" | "snapshot" | "stale" | "unavailable" | "conflict";
  detail: string;
}>;

export type UsabilityEvidenceReview = Readonly<{
  evidenceId: string;
  path: string;
  sourceDigest: Sha256Digest;
  renderedDigest: Sha256Digest;
  transformation: "terminal-neutralised" | "capability-redacted" | "credential-redacted" | "combined";
  expectedDisposition: "confirm-terminal-neutralised" | "blocked-redacted";
}>;

export type UsabilityFixture = Readonly<{
  id: string;
  description: string;
  project: string;
  session: string;
  runs: readonly UsabilityRun[];
  attention: readonly UsabilityAttention[];
  system: readonly UsabilitySystem[];
  evidenceReview: UsabilityEvidenceReview | null;
  notificationProjection: "daemon-journal" | "legacy-fallback";
  expectedTopAttentionId: string | null;
  expectedAnswers: UsabilityExpectedAnswers;
}>;

export type UsabilityManifest = Readonly<{
  schemaVersion: 1;
  referenceViewport: Readonly<{ columns: number; rows: number }>;
  repetitions: number;
  maximumIdentificationMs: number;
  minimumFieldSuccessRate: number;
  fixtures: readonly UsabilityFixture[];
}>;

export type UsabilityObservation = Readonly<{
  fixtureId: string;
  repetition: number;
  durationMs: number;
  topAttentionId: string | null;
  answers: UsabilityExpectedAnswers;
  visibleFreshness: boolean;
  allViewsReachable: boolean;
  focusVisible: boolean;
  containsInferredPercentage: boolean;
  consequentialReviewRequired: boolean;
  optionalIntegrationIndependent: boolean;
  nativeNotificationVisible: boolean;
  dynamicResizeSafe: boolean;
  artifactReviewSafe: boolean;
  actionMatrixSafe: boolean;
  scrollAndSelectionSafe: boolean;
  exactViewport: boolean;
  identificationObserver: "human-recorded" | "automated-proxy";
  keyboardEventCount: number;
  mouseEventCount: number;
  scrollEventCount: number;
  resizeEventCount: number;
  actionIdsCovered: readonly string[];
  actionMatrixFailures: readonly string[];
  keyboardActionIds: readonly string[];
  mouseActionIds: readonly string[];
}>;

export type UsabilityEvaluationReport = Readonly<{
  schemaVersion: 1;
  passed: boolean;
  interactionPassed: boolean;
  recordedIdentificationPassed: boolean;
  humanIdentificationPassed: boolean;
  topItemSuccessRate: number;
  fieldSuccessRate: number;
  observations: readonly UsabilityObservation[];
}>;

export type UsabilityEvaluationDependencies = Readonly<{
  render: FabricConsoleRuntimeOptions["render"];
  reducePointer: FabricConsoleRuntimeOptions["reducePointer"];
  identify(input: Readonly<{
    fixture: UsabilityFixture;
    repetition: number;
    frame: FabricConsoleFrame;
  }>): Promise<Readonly<{
    observer: "human-recorded" | "automated-proxy";
    durationMs: number;
    topAttentionId: string | null;
    answers: UsabilityExpectedAnswers;
  }>>;
}>;

const VIEW_KEYS = [
  "alt-1",
  "alt-2",
  "alt-3",
  "alt-4",
  "alt-5",
  "alt-6",
  "alt-7",
  "alt-8",
] as const;

export const REQUIRED_USABILITY_ACTION_IDS = Object.freeze([
  "action:pause",
  "action:resume",
  "action:cancel",
  "action:steer",
  "action:project-session-drain",
  "action:project-session-stop",
  "workflow:launch",
  "workflow:git",
  "workflow:promotion",
  "workflow:discuss",
  "workflow:accept",
  "workflow:request-changes",
  "workflow:defer",
  "workflow:implement",
  "artifact:confirm-terminal-neutralised",
] as const);

const REQUIRED_USABILITY_ACTION_SET = new Set<string>(
  REQUIRED_USABILITY_ACTION_IDS,
);

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function integer(value: unknown, path: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new TypeError(`${path} must be an integer >= ${String(minimum)}`);
  }
  return value as number;
}

function choice<Value extends string>(
  value: unknown,
  choices: readonly Value[],
  path: string,
): Value {
  if (typeof value !== "string" || !choices.includes(value as Value)) {
    throw new TypeError(`${path} is invalid`);
  }
  return value as Value;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value;
}

function parseRun(value: unknown, path: string): UsabilityRun {
  const item = record(value, path);
  return {
    id: string(item.id, `${path}.id`),
    session: string(item.session, `${path}.session`),
    phase: string(item.phase, `${path}.phase`),
    owner: string(item.owner, `${path}.owner`),
    nextMilestone: string(item.nextMilestone, `${path}.nextMilestone`),
    health: choice(
      item.health,
      ["healthy", "degraded", "blocked", "quarantined", "unknown"],
      `${path}.health`,
    ),
  };
}

function parseAttention(value: unknown, path: string): UsabilityAttention {
  const item = record(value, path);
  const notification = record(
    item.nativeNotification,
    `${path}.nativeNotification`,
  );
  return {
    id: string(item.id, `${path}.id`),
    label: choice(
      item.label,
      ["Decision", "Approval", "Blocked", "FYI"],
      `${path}.label`,
    ),
    priority: choice(
      item.priority,
      [
        "safety-integrity",
        "critical-path",
        "expiring-authority",
        "acceptance-ready",
        "advisory",
      ],
      `${path}.priority`,
    ),
    title: string(item.title, `${path}.title`),
    freshness: choice(
      item.freshness,
      ["live", "snapshot", "stale", "unavailable", "conflict"],
      `${path}.freshness`,
    ),
    ageMs: integer(item.ageMs, `${path}.ageMs`, 0),
    duplicateCount: integer(
      item.duplicateCount,
      `${path}.duplicateCount`,
      1,
    ),
    consequential: item.consequential === true,
    nativeNotification: {
      status: choice(
        notification.status,
        ["available", "unavailable", "stale"],
        `${path}.nativeNotification.status`,
      ),
      journalState: choice(
        notification.journalState,
        [
          "missing",
          "pending",
          "claimed",
          "sent",
          "failed",
          "deduplicated",
          "ambiguous",
        ],
        `${path}.nativeNotification.journalState`,
      ),
      integrationState: choice(
        notification.integrationState,
        ["absent", "available", "unavailable", "stale"],
        `${path}.nativeNotification.integrationState`,
      ),
    },
  };
}

function parseSystem(value: unknown, path: string): UsabilitySystem {
  const item = record(value, path);
  return {
    id: string(item.id, `${path}.id`),
    state: choice(
      item.state,
      ["healthy", "degraded", "stale", "unavailable", "conflict"],
      `${path}.state`,
    ),
    freshness: choice(
      item.freshness,
      ["live", "snapshot", "stale", "unavailable", "conflict"],
      `${path}.freshness`,
    ),
    detail: string(item.detail, `${path}.detail`),
  };
}

function parseAnswers(value: unknown, path: string): UsabilityExpectedAnswers {
  const answers = record(value, path);
  return {
    project: string(answers.project, `${path}.project`),
    run: string(answers.run, `${path}.run`),
    phase: string(answers.phase, `${path}.phase`),
    owner: string(answers.owner, `${path}.owner`),
    nextMilestone: string(answers.nextMilestone, `${path}.nextMilestone`),
    health: string(answers.health, `${path}.health`),
  };
}

function shaDigest(value: unknown, path: string): Sha256Digest {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError(`${path} must be a canonical SHA-256 digest`);
  }
  return value as Sha256Digest;
}

function parseEvidenceReview(value: unknown, path: string): UsabilityEvidenceReview {
  const item = record(value, path);
  return {
    evidenceId: string(item.evidenceId, `${path}.evidenceId`),
    path: string(item.path, `${path}.path`),
    sourceDigest: shaDigest(item.sourceDigest, `${path}.sourceDigest`),
    renderedDigest: shaDigest(item.renderedDigest, `${path}.renderedDigest`),
    transformation: choice(
      item.transformation,
      ["terminal-neutralised", "capability-redacted", "credential-redacted", "combined"],
      `${path}.transformation`,
    ),
    expectedDisposition: choice(
      item.expectedDisposition,
      ["confirm-terminal-neutralised", "blocked-redacted"],
      `${path}.expectedDisposition`,
    ),
  };
}

function parseFixture(value: unknown, path: string): UsabilityFixture {
  const fixture = record(value, path);
  const expectedTop = fixture.expectedTopAttentionId;
  if (expectedTop !== null && typeof expectedTop !== "string") {
    throw new TypeError(`${path}.expectedTopAttentionId must be a string or null`);
  }
  return {
    id: string(fixture.id, `${path}.id`),
    description: string(fixture.description, `${path}.description`),
    project: string(fixture.project, `${path}.project`),
    session: string(fixture.session, `${path}.session`),
    runs: array(fixture.runs, `${path}.runs`).map((item, index) =>
      parseRun(item, `${path}.runs[${String(index)}]`),
    ),
    attention: array(fixture.attention, `${path}.attention`).map(
      (item, index) =>
        parseAttention(item, `${path}.attention[${String(index)}]`),
    ),
    system: array(fixture.system, `${path}.system`).map((item, index) =>
      parseSystem(item, `${path}.system[${String(index)}]`),
    ),
    evidenceReview: fixture.evidenceReview === undefined
      ? null
      : parseEvidenceReview(fixture.evidenceReview, `${path}.evidenceReview`),
    notificationProjection: choice(
      fixture.notificationProjection ?? "daemon-journal",
      ["daemon-journal", "legacy-fallback"],
      `${path}.notificationProjection`,
    ),
    expectedTopAttentionId: expectedTop,
    expectedAnswers: parseAnswers(
      fixture.expectedAnswers,
      `${path}.expectedAnswers`,
    ),
  };
}

export function parseUsabilityManifest(value: unknown): UsabilityManifest {
  const manifest = record(value, "manifest");
  if (manifest.schemaVersion !== 1) {
    throw new TypeError("manifest.schemaVersion must be 1");
  }
  const viewport = record(manifest.referenceViewport, "manifest.referenceViewport");
  const repetitions = integer(manifest.repetitions, "manifest.repetitions", 3);
  const maximumIdentificationMs = integer(
    manifest.maximumIdentificationMs,
    "manifest.maximumIdentificationMs",
    1,
  );
  const minimumFieldSuccessRate = manifest.minimumFieldSuccessRate;
  if (
    typeof minimumFieldSuccessRate !== "number" ||
    minimumFieldSuccessRate < 0.95 ||
    minimumFieldSuccessRate > 1
  ) {
    throw new TypeError(
      "manifest.minimumFieldSuccessRate must be from 0.95 to 1",
    );
  }
  const fixtures = array(manifest.fixtures, "manifest.fixtures").map(
    (fixture, index) => parseFixture(fixture, `manifest.fixtures[${String(index)}]`),
  );
  if (fixtures.length < 3) {
    throw new TypeError("manifest.fixtures must cover at least three scenarios");
  }
  const ids = fixtures.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("manifest fixture IDs must be unique");
  }
  for (const fixture of fixtures) {
    const attentionIds = fixture.attention.map(({ id }) => id);
    if (new Set(attentionIds).size !== attentionIds.length) {
      throw new TypeError(`fixture ${fixture.id} must group duplicate attention IDs`);
    }
  }
  return {
    schemaVersion: 1,
    referenceViewport: {
      columns: integer(viewport.columns, "manifest.referenceViewport.columns", 1),
      rows: integer(viewport.rows, "manifest.referenceViewport.rows", 1),
    },
    repetitions,
    maximumIdentificationMs,
    minimumFieldSuccessRate,
    fixtures,
  };
}

function freshness(
  state: UsabilityAttention["freshness"],
  ageMs: number,
  source: "fabric" | "github" = "fabric",
): ConsoleFreshness {
  const common = {
    source,
    revision: revisionFromProtocol(7),
    observedAt: timestamp,
    ageMs,
  } as const;
  if (state === "unavailable") {
    return { state, ...common, reason: "fixture source unavailable" };
  }
  if (state === "conflict") {
    return { state, ...common, candidateCount: 2 };
  }
  return { state, ...common };
}

function attentionRow(
  item: UsabilityAttention,
  notificationProjection: UsabilityFixture["notificationProjection"],
): ConsoleRow<"attention"> {
  const factFreshness = freshness(item.freshness, item.ageMs);
  return {
    view: "attention",
    stableId: item.id,
    revision: revisionFromProtocol(7),
    urgency: item.priority,
    freshness: factFreshness,
    summary:
      item.freshness === "unavailable" || item.freshness === "conflict"
        ? null
        : {
            kind: "attention",
            label: item.label,
            priority: item.priority,
            title:
              item.duplicateCount > 1
                ? `${item.title} (${String(item.duplicateCount)} grouped)`
                : item.title,
            nativeNotification: notificationProjection === "daemon-journal"
              ? notificationSummary(item)
              : {
                  kind: "legacy-fallback",
                  status: "unavailable",
                  reason: "feature-not-negotiated",
                },
          },
    detailRef:
      item.freshness === "unavailable" || item.freshness === "conflict"
        ? null
        : { kind: "system", componentId: item.id, expectedRevision: 7 },
    actionAvailability:
      item.freshness === "live" && item.consequential
        ? { state: "available", actions: ["resume"], requiresPreview: true }
        : { state: "read-only", reason: "state-ineligible" },
  };
}

function notificationSummary(
  item: UsabilityAttention,
): ConsoleNativeNotification {
  return { kind: "daemon-journal", ...daemonNotification(item) };
}

function daemonNotification(
  item: UsabilityAttention,
): NativeNotificationDeliverySummary {
  const journalState = item.nativeNotification.journalState;
  return {
    targetIntegration: "native-desktop",
    status: item.nativeNotification.status,
    journalState,
    deliveryItemRevision: journalState === "missing" ? null : 7,
    claimGeneration:
      journalState === "claimed" || journalState === "ambiguous" ? 3 : null,
    integrationState: item.nativeNotification.integrationState,
    observedAt: timestamp,
  };
}

function systemRow(item: UsabilitySystem): ConsoleRow<"system"> {
  return {
    view: "system",
    stableId: item.id,
    revision: revisionFromProtocol(7),
    urgency: "normal",
    freshness: freshness(item.freshness, 1_000, "github"),
    summary:
      item.freshness === "unavailable" || item.freshness === "conflict"
        ? null
        : {
            kind: "system",
            systemKind: "integration",
            state: item.state,
            detail: item.detail,
          },
    detailRef: null,
    actionAvailability: { state: "read-only", reason: "state-ineligible" },
  };
}

function fixtureDataset(fixture: UsabilityFixture): FabricConsoleDataset {
  const revision = 11;
  const projectId = fixture.project as ProjectId;
  const projectSessionId = fixture.session as ProjectSessionId;
  const session: ProjectSession = {
    projectSessionId,
    projectId,
    mode: "coordinated",
    state: "active",
    revision,
    generation: 1,
    authorityRef: digest,
    budgetRef: "fixture-budget",
    launchPacketRef: { path: "fixture/launch.json" as never, digest },
    membershipRevision: 1,
    origin: { kind: "operator-launch", operatorId: "fixture-operator" as never },
  };
  const runs: RunProjection[] = fixture.runs.map((run) => ({
    projectSessionId: run.session as ProjectSessionId,
    runId: run.id as never,
    phase: run.phase,
    chairAgentId: run.owner as AgentId,
    nextMilestone: run.nextMilestone,
    health: run.health,
  }));
  const attentionRows = rankConsoleRows(fixture.attention.map((item) =>
    attentionRow(item, fixture.notificationProjection)
  ));
  const systemRows = fixture.system.map(systemRow);
  const evidenceReview = fixture.evidenceReview;
  const evidenceRows: readonly ConsoleRow<"evidence">[] = evidenceReview === null
    ? []
    : [{
        view: "evidence",
        stableId: evidenceReview.evidenceId,
        revision: revisionFromProtocol(7),
        urgency: "acceptance-ready",
        freshness: freshness("live", 500),
        summary: {
          kind: "evidence",
          evidenceKind: "artifact",
          status: "informational",
          provenance: "agent:chair-evaluation",
        },
        detailRef: {
          kind: "evidence",
          evidenceId: evidenceReview.evidenceId,
          expectedRevision: 7,
        },
        actionAvailability: {
          state: "available",
          actions: ["promotion"],
          requiresPreview: true,
        },
      }];
  const projectRows: readonly ConsoleRow<"project">[] = [{
    view: "project",
    stableId: fixture.project,
    revision: revisionFromProtocol(revision),
    urgency: "normal",
    freshness: freshness("live", 100),
    summary: {
      kind: "project",
      goal: fixture.description,
      acceptedScopeRef: evidenceReview === null
        ? null
        : { path: evidenceReview.path as never, digest: evidenceReview.sourceDigest },
      repositoryRevision: "fixture-revision",
    },
    detailRef: { kind: "project", projectId, expectedRevision: revision },
    actionAvailability: {
      state: "available",
      actions: [
        "project-session-drain",
        "project-session-stop",
        "project-session-launch",
        "git",
        "promotion",
      ],
      requiresPreview: true,
    },
  }];
  const runRows: readonly ConsoleRow<"runs">[] = runs.map((run) => ({
    view: "runs",
    stableId: run.runId,
    revision: revisionFromProtocol(revision),
    urgency: run.health === "blocked" || run.health === "quarantined"
      ? "critical-path"
      : "normal",
    freshness: freshness("live", 100),
    summary: {
      kind: "run",
      projectSessionId: run.projectSessionId,
      phase: run.phase,
      health: run.health,
      nextMilestone: run.nextMilestone,
    },
    detailRef: {
      kind: "run",
      projectSessionId: run.projectSessionId,
      coordinationRunId: run.runId,
      expectedRevision: revision,
    },
    actionAvailability: {
      state: "available",
      actions: ["pause", "resume", "cancel", "steer"],
      requiresPreview: true,
    },
  }));
  const workRows: readonly ConsoleRow<"work">[] = runs.map((run, index) => ({
    view: "work",
    stableId: `task-evaluation-${String(index + 1)}-${run.runId}`,
    revision: revisionFromProtocol(revision),
    urgency: "normal",
    freshness: freshness("live", 100),
    summary: { kind: "work", state: "active", checkState: "passing" },
    detailRef: {
      kind: "task",
      taskId: `task-evaluation-${String(index + 1)}-${run.runId}` as never,
      expectedRevision: revision,
    },
    actionAvailability: { state: "read-only", reason: "state-ineligible" },
  }));
  const agentRows: readonly ConsoleRow<"agents">[] = runs.map((run) => ({
    view: "agents",
    stableId: run.chairAgentId,
    revision: revisionFromProtocol(revision),
    urgency: "normal",
    freshness: freshness("live", 100),
    summary: {
      kind: "agent",
      role: "chair",
      lifecycle: "working",
      contextPressure: "unknown",
    },
    detailRef: {
      kind: "agent",
      agentId: run.chairAgentId,
      expectedRevision: revision,
    },
    actionAvailability: { state: "read-only", reason: "state-ineligible" },
  }));
  const activityRows: readonly ConsoleRow<"activity">[] = Array.from(
    { length: 12 },
    (_, index) => ({
      view: "activity" as const,
      stableId: `activity-evaluation-${String(index + 1)}`,
      revision: revisionFromProtocol(revision + index),
      urgency: "normal" as const,
      freshness: freshness("live", index * 10),
      summary: {
        kind: "activity" as const,
        activityKind: "lifecycle" as const,
        summary: `Evaluation activity ${String(index + 1)}`,
        occurredAt: timestamp,
      },
      detailRef: {
        kind: "activity" as const,
        eventId: `activity-evaluation-${String(index + 1)}`,
        expectedRevision: revision + index,
      },
      actionAvailability: {
        state: "read-only" as const,
        reason: "state-ineligible" as const,
      },
    }),
  );
  const pages = createEmptyViewPages();
  const attentionFacts: AttentionItem[] = fixture.attention.map((item) => ({
    itemId: item.id,
    revision: 7,
    label: item.label,
    priority: item.priority,
    title: item.title,
    sourceFreshness: item.freshness,
    lastEventAt: timestamp,
    duplicateCount: item.duplicateCount,
    ...(fixture.notificationProjection === "daemon-journal"
      ? { nativeNotification: daemonNotification(item) }
      : {}),
  }));
  return {
    connection: fixture.notificationProjection === "daemon-journal"
      ? { state: "live", compatibility: { mode: "current" } }
      : {
          state: "live",
          compatibility: { mode: "legacy-compatibility", profile: "strict-v1" },
        },
    snapshot: {
      schemaVersion: 1,
      snapshotRevision: revision,
      readTransactionId: `fixture:${fixture.id}`,
      project: {
        freshness: "live",
        source: "fabric",
        revision,
        observedAt: timestamp,
        value: { projectId, canonicalRoot: `/fixture/${fixture.project}` },
      },
      session: {
        freshness: "live",
        source: "fabric",
        revision,
        observedAt: timestamp,
        value: session,
      },
      runs: {
        freshness: "live",
        source: "fabric",
        revision,
        observedAt: timestamp,
        value: runs,
      },
      attention: {
        freshness: "live",
        source: "fabric",
        revision,
        observedAt: timestamp,
        value: attentionFacts,
      },
      capacity: {
        freshness: "live",
        source: "fabric",
        revision,
        observedAt: timestamp,
        value: { tasks: { used: 0, reserved: 0, limit: 8 } },
      },
      cursor: revision,
      stateDigest: digest,
    },
    snapshotRevision: revisionFromProtocol(revision),
    cursor: revision,
    pages: {
      ...pages,
      project: {
        view: "project",
        rows: projectRows,
        nextCursor: projectRows.length,
        hasMore: false,
        snapshotRevision: revisionFromProtocol(revision),
        readTransactionId: `fixture:${fixture.id}:project`,
      },
      runs: {
        view: "runs",
        rows: runRows,
        nextCursor: runRows.length,
        hasMore: false,
        snapshotRevision: revisionFromProtocol(revision),
        readTransactionId: `fixture:${fixture.id}:runs`,
      },
      work: {
        view: "work",
        rows: workRows,
        nextCursor: workRows.length,
        hasMore: false,
        snapshotRevision: revisionFromProtocol(revision),
        readTransactionId: `fixture:${fixture.id}:work`,
      },
      agents: {
        view: "agents",
        rows: agentRows,
        nextCursor: agentRows.length,
        hasMore: false,
        snapshotRevision: revisionFromProtocol(revision),
        readTransactionId: `fixture:${fixture.id}:agents`,
      },
      attention: {
        view: "attention",
        rows: attentionRows,
        nextCursor: attentionRows.length,
        hasMore: false,
        snapshotRevision: revisionFromProtocol(revision),
        readTransactionId: `fixture:${fixture.id}:attention`,
      },
      system: {
        view: "system",
        rows: systemRows,
        nextCursor: systemRows.length,
        hasMore: false,
        snapshotRevision: revisionFromProtocol(revision),
        readTransactionId: `fixture:${fixture.id}:system`,
      },
      evidence: {
        view: "evidence",
        rows: evidenceRows,
        nextCursor: evidenceRows.length,
        hasMore: false,
        snapshotRevision: revisionFromProtocol(revision),
        readTransactionId: `fixture:${fixture.id}:evidence`,
      },
      activity: {
        view: "activity",
        rows: activityRows,
        nextCursor: activityRows.length,
        hasMore: false,
        snapshotRevision: revisionFromProtocol(revision),
        readTransactionId: `fixture:${fixture.id}:activity`,
      },
    },
    loadedAtMs: performance.now(),
    canMutate: true,
    productionActionPlanning: true,
    workflowCapabilities: {
      intake: { state: "available" },
      gate: { state: "available" },
      launch: {
        state: "unavailable",
        reason: "daemon-launch-intent-preparation-unavailable",
      },
      git: {
        state: "unavailable",
        reason: "daemon-git-intent-preparation-unavailable",
      },
      promotion: { state: "available" },
    },
    ...(evidenceReview === null ? {} : {
      inspection: {
        kind: "artifact" as const,
        state: "current" as const,
        binding: {
          view: "evidence" as const,
          itemId: evidenceReview.evidenceId,
          itemRevision: revisionFromProtocol(7),
          projectionRevision: revisionFromProtocol(revision),
        },
        readTransactionId: `fixture:${fixture.id}:artifact`,
        result: {
          artifactRef: {
            path: evidenceReview.path as never,
            digest: evidenceReview.sourceDigest,
          },
          evidenceRevision: 7,
          evidenceKind: "artifact" as const,
          sourceKind: "project-file" as const,
          publisherKind: "agent" as const,
          publisherRef: "chair-evaluation",
          projectSessionId,
          coordinationRunId: runs[0]?.runId ?? null,
          taskId: null,
          createdAt: timestamp,
          mediaType: "text/markdown" as const,
          content: "reviewed inert artifact",
          totalBytes: 30,
          totalLines: 1,
          renderedTotalBytes: 23,
          renderedTotalLines: 1,
          renderedArtifactDigest: evidenceReview.renderedDigest,
          transformation: evidenceReview.transformation,
          terminalNeutralised: true as const,
          capabilityValuesRedacted: true as const,
          credentialValuesRedacted: true as const,
          pages: [{
            pageIndex: 0,
            lineFragment: "whole" as const,
            pageContentDigest: evidenceReview.renderedDigest,
            bytes: 23,
          }],
          coverage: { complete: true as const, verified: true as const, pageCount: 1 },
          reviewDisposition: evidenceReview.expectedDisposition,
        },
      },
    }),
  };
}

function controllerState(dataset: FabricConsoleDataset): ConsoleControllerState {
  const top = dataset.pages.attention.rows[0];
  const selectionByView = Object.fromEntries(
    FABRIC_VIEWS.map((view) => [view, null]),
  ) as Record<FabricView, null | { stableId: string; revision: ReturnType<typeof revisionFromProtocol> }>;
  if (top !== undefined) {
    selectionByView.attention = {
      stableId: top.stableId,
      revision: top.revision,
    };
  }
  return {
    activeView: "attention",
    selectionByView,
    scrollAnchorByView: Object.fromEntries(
      FABRIC_VIEWS.map((view) => [view, null]),
    ) as never,
    review: null,
    pendingCommandIds: [],
    lastActionStatus: null,
    lastReceipt: null,
  };
}

class EvaluationRuntimeController implements FabricRuntimeController {
  #dataset: FabricConsoleDataset;
  #state: ConsoleControllerState;

  constructor(dataset: FabricConsoleDataset) {
    this.#dataset = dataset;
    this.#state = controllerState(dataset);
  }

  get dataset(): FabricConsoleDataset {
    return this.#dataset;
  }

  get state(): ConsoleControllerState {
    return this.#state;
  }

  activateView(view: FabricView): void {
    this.#state = { ...this.#state, activeView: view };
  }

  select(view: FabricView, stableId: string): void {
    const row = this.#dataset.pages[view].rows.find(
      (candidate) => candidate.stableId === stableId,
    );
    if (row === undefined) return;
    this.#state = {
      ...this.#state,
      activeView: view,
      selectionByView: {
        ...this.#state.selectionByView,
        [view]: { stableId, revision: row.revision },
      },
    };
  }

  setScrollAnchor(view: FabricView, stableId: string | null): void {
    this.#state = {
      ...this.#state,
      scrollAnchorByView: {
        ...this.#state.scrollAnchorByView,
        [view]: stableId,
      },
    };
  }

  updateDataset(dataset: FabricConsoleDataset): void {
    this.#dataset = dataset;
  }
}

type InteractionCoverage = Readonly<{
  actionMatrixSafe: boolean;
  scrollAndSelectionSafe: boolean;
  keyboardEventCount: number;
  mouseEventCount: number;
  scrollEventCount: number;
  actionIdsCovered: readonly string[];
  actionMatrixFailures: readonly string[];
  keyboardActionIds: readonly string[];
  mouseActionIds: readonly string[];
}>;

async function exerciseInteractionCoverage(
  dataset: FabricConsoleDataset,
  viewport: UsabilityManifest["referenceViewport"],
  dependencies: UsabilityEvaluationDependencies,
  eventPrefix: string,
): Promise<InteractionCoverage> {
  const controller = new EvaluationRuntimeController(dataset);
  const activations: Array<Readonly<{
    regionId: string;
    provenance: "keyboard" | "mouse";
  }>> = [];
  let sequence = 0;
  let keyboardEventCount = 0;
  let mouseEventCount = 0;
  let scrollEventCount = 0;
  let actionMatrixSafe = true;
  const actionMatrixFailures: string[] = [];
  const covered = new Set<string>();
  const keyboardActions = new Set<string>();
  const mouseActions = new Set<string>();
  const runtime = new FabricConsoleRuntime({
    controller,
    viewport,
    ui: createFabricUiState({
      draft: "reason=scripted-usability-check",
      mouseCapture: true,
    }),
    draw: () => {},
    detach: async () => {},
    activate: async ({ regionId, provenance }) => {
      activations.push({ regionId, provenance });
    },
    eventId: () => `${eventPrefix}-${String(++sequence)}`,
    render: dependencies.render,
    reducePointer: dependencies.reducePointer,
  });

  const exerciseCurrentActions = async (): Promise<void> => {
    const actions = runtime.frame.presentation.actions.filter(
      ({ id }) => REQUIRED_USABILITY_ACTION_SET.has(id),
    );
    for (const action of actions) {
      covered.add(action.id);
      runtime.setFocus(action.id);
      const keyboardStart = activations.length;
      await runtime.handleInput({ kind: "key", key: "enter" });
      keyboardEventCount += 1;
      const keyboardActivations = activations.slice(keyboardStart);
      const keyboardMatched = keyboardActivations.filter(
        (activation) =>
          activation.regionId === action.id && activation.provenance === "keyboard",
      ).length;
      if (keyboardMatched > 0) keyboardActions.add(action.id);

      const region = runtime.frame.hitRegions.find(
        (candidate) => candidate.kind === "action" && candidate.id === action.id,
      );
      if (region === undefined) {
        actionMatrixSafe = false;
        actionMatrixFailures.push(`${controller.state.activeView}:${action.id}:not-rendered`);
        continue;
      }
      const mouseStart = activations.length;
      for (const phase of ["press", "release"] as const) {
        await runtime.handleInput({
          kind: "mouse",
          phase,
          button: "left",
          x: region.rect.x1,
          y: region.rect.y1,
          modifiers: { shift: false, alt: false, ctrl: false },
        });
        mouseEventCount += 1;
      }
      const mouseActivations = activations.slice(mouseStart);
      const mouseMatched = mouseActivations.filter(
        (activation) =>
          activation.regionId === action.id && activation.provenance === "mouse",
      ).length;
      if (mouseMatched > 0) mouseActions.add(action.id);
      const actionSafe = action.enabled
        ? keyboardMatched === 1 && mouseMatched === 1
        : keyboardMatched === 0 && mouseMatched === 0 &&
          action.reason !== undefined;
      actionMatrixSafe &&= actionSafe;
      if (!actionSafe) {
        actionMatrixFailures.push(
          `${controller.state.activeView}:${action.id}:enabled=${String(action.enabled)}:keyboard=${String(keyboardMatched)}:mouse=${String(mouseMatched)}:reason=${action.reason ?? "missing"}`,
        );
      }
    }
  };

  for (const view of FABRIC_VIEWS) {
    const row = dataset.pages[view].rows[0];
    if (row === undefined) continue;
    controller.select(view, row.stableId);
    runtime.repaint();
    await exerciseCurrentActions();
    const inspection = dataset.inspection;
    if (
      view === "evidence" &&
      inspection?.kind === "artifact" &&
      inspection.state === "current" &&
      inspection.result.reviewDisposition === "confirm-terminal-neutralised"
    ) {
      runtime.setArtifactConfirmation({
        evidenceId: inspection.binding.itemId,
        evidenceRevision: inspection.result.evidenceRevision,
        sourceDigest: inspection.result.artifactRef.digest,
        renderedDigest: inspection.result.renderedArtifactDigest,
        transformation: "terminal-neutralised",
        pageCount: inspection.result.coverage.pageCount,
      });
      await exerciseCurrentActions();
    }
  }

  const activity = dataset.pages.activity.rows[0];
  let scrollAndSelectionSafe = false;
  if (activity !== undefined) {
    controller.select("activity", activity.stableId);
    runtime.repaint();
    const selectedBefore = controller.state.selectionByView.activity?.stableId ?? null;
    const activationCountBeforeSelectionGesture = activations.length;
    await runtime.handleInput({ kind: "key", key: "page-down" });
    keyboardEventCount += 1;
    scrollEventCount += 1;
    const keyboardOffset = runtime.ui.scrollOffsetByView.activity ?? 0;
    const rowRegion = runtime.frame.hitRegions.find(
      (region) => region.kind === "row" && region.binding?.view === "activity",
    );
    if (rowRegion !== undefined) {
      await runtime.handleInput({
        kind: "mouse",
        phase: "wheel",
        button: "wheel-down",
        x: rowRegion.rect.x1,
        y: rowRegion.rect.y1,
        modifiers: { shift: false, alt: false, ctrl: false },
      });
      mouseEventCount += 1;
      scrollEventCount += 1;
      const mouseOffset = runtime.ui.scrollOffsetByView.activity ?? 0;
      for (const phase of ["press", "release"] as const) {
        await runtime.handleInput({
          kind: "mouse",
          phase,
          button: "left",
          x: rowRegion.rect.x1,
          y: rowRegion.rect.y1,
          modifiers: { shift: true, alt: false, ctrl: false },
        });
        mouseEventCount += 1;
      }
      scrollAndSelectionSafe =
        keyboardOffset > 0 &&
        mouseOffset > keyboardOffset &&
        (controller.state.selectionByView.activity?.stableId ?? null) ===
          selectedBefore &&
        activations.length === activationCountBeforeSelectionGesture;
    }
  }

  return {
    actionMatrixSafe,
    scrollAndSelectionSafe,
    keyboardEventCount,
    mouseEventCount,
    scrollEventCount,
    actionIdsCovered: [...covered].sort(),
    actionMatrixFailures,
    keyboardActionIds: [...keyboardActions].sort(),
    mouseActionIds: [...mouseActions].sort(),
  };
}

async function observe(
  fixture: UsabilityFixture,
  manifest: UsabilityManifest,
  repetition: number,
  dependencies: UsabilityEvaluationDependencies,
): Promise<UsabilityObservation> {
  const dataset = fixtureDataset(fixture);
  const controller = new EvaluationRuntimeController(dataset);
  const top = dataset.pages.attention.rows[0];
  const focusId =
    top === undefined ? "view:attention" : `row:attention:${top.stableId}`;
  const ui = createFabricUiState({ focusId });
  let eventSequence = 0;
  let keyboardEventCount = 0;
  let mouseEventCount = 0;
  let resizeEventCount = 0;
  const activations: string[] = [];
  const runtime = new FabricConsoleRuntime({
    controller,
    viewport: manifest.referenceViewport,
    ui,
    draw: () => {},
    detach: async () => {},
    activate: async ({ regionId }) => {
      activations.push(regionId);
    },
    eventId: () => `evaluation-${fixture.id}-${String(repetition)}-${String(++eventSequence)}`,
    render: dependencies.render,
    reducePointer: dependencies.reducePointer,
  });
  runtime.repaint();

  const reachedViews = new Set<FabricView>();
  for (const [index, view] of FABRIC_VIEWS.entries()) {
    const key = VIEW_KEYS[index];
    if (key === undefined) throw new Error("usability view key fixture is incomplete");
    await runtime.handleInput({ kind: "key", key });
    keyboardEventCount += 1;
    if (controller.state.activeView === view) reachedViews.add(view);
  }
  await runtime.handleInput({ kind: "key", key: "alt-1" });
  keyboardEventCount += 1;
  await runtime.handleInput({ kind: "key", key: "tab" });
  keyboardEventCount += 1;
  const focusedId = runtime.ui.focusId;
  const focusVisible = focusedId !== null &&
    runtime.frame.presentation.focusId === focusedId &&
    runtime.frame.hitRegions.some(
      (region) => region.id === focusedId && region.enabled,
    );

  await runtime.handleInput({ kind: "key", key: "text", text: "e" });
  keyboardEventCount += 1;
  const preservedDraft = `fixture=${fixture.id};repetition=${String(repetition)}`;
  await runtime.handleInput({ kind: "paste", text: preservedDraft });
  const selectionBeforeResize = controller.state.selectionByView.attention?.stableId ?? null;
  const resizeFrames = [
    runtime.resize({ columns: 44, rows: 15 }),
    runtime.resize(manifest.referenceViewport),
    runtime.resize({ columns: 120, rows: 32 }),
  ];
  resizeEventCount += resizeFrames.length;
  const dynamicResizeSafe =
    resizeFrames[0]?.columns === 44 && resizeFrames[0].rows.length === 15 &&
    resizeFrames[1]?.columns === manifest.referenceViewport.columns &&
    resizeFrames[1].rows.length === manifest.referenceViewport.rows &&
    resizeFrames[2]?.columns === 120 && resizeFrames[2].rows.length === 32 &&
    resizeFrames.every((candidate) => candidate.mode !== "inert") &&
    new Set(resizeFrames.map(({ geometryKey }) => geometryKey)).size ===
      resizeFrames.length &&
    controller.state.activeView === "attention" &&
    (controller.state.selectionByView.attention?.stableId ?? null) === selectionBeforeResize &&
    runtime.ui.draft === preservedDraft &&
    runtime.ui.focusId === focusedId;
  await runtime.handleInput({ kind: "key", key: "escape" });
  keyboardEventCount += 1;

  await runtime.handleInput({ kind: "key", key: "alt-m" });
  keyboardEventCount += 1;
  const projectTab = runtime.frame.hitRegions.find(
    (region) => region.id === "view:project" && region.enabled,
  );
  let mousePathWorked = false;
  if (projectTab !== undefined) {
    for (const phase of ["press", "release"] as const) {
      await runtime.handleInput({
        kind: "mouse",
        phase,
        button: "left",
        x: projectTab.rect.x1,
        y: projectTab.rect.y1,
        modifiers: { shift: false, alt: false, ctrl: false },
      });
      mouseEventCount += 1;
    }
    mousePathWorked = controller.state.activeView === "project";
  }
  await runtime.handleInput({ kind: "key", key: "alt-1" });
  keyboardEventCount += 1;
  const frame = runtime.resize(manifest.referenceViewport);
  resizeEventCount += 1;
  const presentation = frame.presentation;
  const frameText = frame.rows.join("\n");
  let artifactReviewSafe = true;
  const evidenceReview = fixture.evidenceReview;
  if (evidenceReview !== null) {
    const evidenceRow = dataset.pages.evidence.rows[0];
    if (evidenceRow === undefined) {
      artifactReviewSafe = false;
    } else {
      const evidenceController = new EvaluationRuntimeController(dataset);
      const evidenceUi = createFabricUiState({
        compactPane: "detail",
      });
      const evidenceActivations: string[] = [];
      const evidenceRuntime = new FabricConsoleRuntime({
        controller: evidenceController,
        viewport: manifest.referenceViewport,
        ui: evidenceUi,
        draw: () => {},
        detach: async () => {},
        activate: async ({ regionId }) => {
          evidenceActivations.push(regionId);
        },
        eventId: () => `evaluation-evidence-${String(++eventSequence)}`,
        render: dependencies.render,
        reducePointer: dependencies.reducePointer,
      });
      evidenceRuntime.repaint();
      await evidenceRuntime.handleInput({ kind: "key", key: "alt-6" });
      await evidenceRuntime.handleInput({ kind: "key", key: "home" });
      keyboardEventCount += 2;
      const evidenceFrames = [
        evidenceRuntime.resize({ columns: 60, rows: 18 }),
        evidenceRuntime.resize(manifest.referenceViewport),
        evidenceRuntime.resize({ columns: 120, rows: 32 }),
      ];
      resizeEventCount += evidenceFrames.length;
      const evidencePresentation = evidenceRuntime.frame.presentation;
      const evidenceText = evidenceFrames.map(({ rows }) => rows.join("\n")).join("\n");
      const acceptance = evidencePresentation.actions.find(
        ({ id }) => id === "workflow:accept",
      );
      const implementation = evidencePresentation.actions.find(
        ({ id }) => id === "workflow:implement",
      );
      const confirmation = evidencePresentation.actions.find(
        ({ id }) => id === "artifact:confirm-terminal-neutralised",
      );
      let confirmationReached = confirmation === undefined;
      const confirmationRegion = evidenceRuntime.frame.hitRegions.find(
        (region) => region.id === "artifact:confirm-terminal-neutralised" && region.enabled,
      );
      if (confirmationRegion !== undefined) {
        await evidenceRuntime.handleInput({ kind: "key", key: "alt-m" });
        keyboardEventCount += 1;
        await evidenceRuntime.handleInput({
          kind: "mouse",
          phase: "press",
          button: "left",
          x: confirmationRegion.rect.x1,
          y: confirmationRegion.rect.y1,
          modifiers: { shift: false, alt: false, ctrl: false },
        });
        mouseEventCount += 1;
        evidenceRuntime.resize(manifest.referenceViewport);
        resizeEventCount += 1;
        await evidenceRuntime.handleInput({
          kind: "mouse",
          phase: "release",
          button: "left",
          x: confirmationRegion.rect.x1,
          y: confirmationRegion.rect.y1,
          modifiers: { shift: false, alt: false, ctrl: false },
        });
        mouseEventCount += 1;
        const recomputedConfirmation = evidenceRuntime.frame.hitRegions.find(
          (region) => region.id === "artifact:confirm-terminal-neutralised" && region.enabled,
        );
        if (
          evidenceActivations.length === 0 &&
          recomputedConfirmation !== undefined
        ) {
          for (const phase of ["press", "release"] as const) {
            await evidenceRuntime.handleInput({
              kind: "mouse",
              phase,
              button: "left",
              x: recomputedConfirmation.rect.x1,
              y: recomputedConfirmation.rect.y1,
              modifiers: { shift: false, alt: false, ctrl: false },
            });
            mouseEventCount += 1;
          }
        }
        confirmationReached = evidenceActivations.filter(
          (regionId) => regionId === "artifact:confirm-terminal-neutralised",
        ).length === 1;
      }
      artifactReviewSafe =
        acceptance?.enabled === false &&
        implementation?.enabled === false &&
        (evidenceReview.expectedDisposition === "confirm-terminal-neutralised"
          ? confirmation?.enabled === true && confirmationReached
          : confirmation === undefined) &&
        evidenceText.includes(evidenceReview.path) &&
        evidenceText.includes("Coverage: 1/1 VERIFIED") &&
        !/[\u001b\u009b\u202e]/u.test(evidenceText) &&
        !/\b(?:afb_|afc_|afop_)/u.test(evidenceText);
    }
  }
  const interactionCoverage = await exerciseInteractionCoverage(
    dataset,
    manifest.referenceViewport,
    dependencies,
    `evaluation-matrix-${fixture.id}-${String(repetition)}`,
  );
  keyboardEventCount += interactionCoverage.keyboardEventCount;
  mouseEventCount += interactionCoverage.mouseEventCount;
  const identification = await dependencies.identify({ fixture, repetition, frame });
  if (
    (identification.observer !== "human-recorded" &&
      identification.observer !== "automated-proxy") ||
    !Number.isFinite(identification.durationMs) ||
    identification.durationMs < 0
  ) {
    throw new TypeError("usability identification observation is invalid");
  }
  const githubUnavailable = fixture.system.some(
    (item) => item.id === "github" && item.freshness === "unavailable",
  );
  const topNotification =
    top?.summary?.kind === "attention" ? top.summary.nativeNotification : null;
  return {
    fixtureId: fixture.id,
    repetition,
    durationMs: identification.durationMs,
    topAttentionId: identification.topAttentionId,
    answers: identification.answers,
    visibleFreshness:
      presentation.masterRows.length === 0 ||
      frameText.includes(presentation.masterRows[0]?.freshness ?? ""),
    allViewsReachable: reachedViews.size === FABRIC_VIEWS.length && mousePathWorked,
    focusVisible,
    containsInferredPercentage: /\b\d+(?:\.\d+)?%/u.test(frameText),
    consequentialReviewRequired:
      top === undefined ||
      !fixture.attention.find((item) => item.id === top.stableId)?.consequential ||
      presentation.actions.every(
        (action) => !action.enabled && action.reason !== undefined,
      ),
    optionalIntegrationIndependent:
      !githubUnavailable ||
      (dataset.connection.state === "live" && presentation.connection === "LIVE"),
    nativeNotificationVisible:
      topNotification === null ||
      (topNotification.kind === "legacy-fallback"
        ? frameText.includes("unavailable | feature-not-negotiated")
        : frameText.includes(
            `${topNotification.status} | journal ${topNotification.journalState}`,
          )),
    dynamicResizeSafe,
    artifactReviewSafe,
    actionMatrixSafe: interactionCoverage.actionMatrixSafe,
    scrollAndSelectionSafe: interactionCoverage.scrollAndSelectionSafe,
    exactViewport:
      frame.columns === manifest.referenceViewport.columns &&
      frame.rows.length === manifest.referenceViewport.rows &&
      frame.rows.every(
        (row) => stringWidth(row) === manifest.referenceViewport.columns,
      ),
    identificationObserver: identification.observer,
    keyboardEventCount,
    mouseEventCount,
    scrollEventCount: interactionCoverage.scrollEventCount,
    resizeEventCount,
    actionIdsCovered: interactionCoverage.actionIdsCovered,
    actionMatrixFailures: interactionCoverage.actionMatrixFailures,
    keyboardActionIds: interactionCoverage.keyboardActionIds,
    mouseActionIds: interactionCoverage.mouseActionIds,
  };
}

const ANSWER_FIELDS = [
  "project",
  "run",
  "phase",
  "owner",
  "nextMilestone",
  "health",
] as const satisfies readonly (keyof UsabilityExpectedAnswers)[];

export async function evaluateUsabilityManifest(
  manifest: UsabilityManifest,
  dependencies: UsabilityEvaluationDependencies,
): Promise<UsabilityEvaluationReport> {
  const observations: UsabilityObservation[] = [];
  let correctTop = 0;
  let correctFields = 0;
  let totalFields = 0;
  let interactionChecksPass = true;
  let recordedDurationsPass = true;
  for (const fixture of manifest.fixtures) {
    for (let repetition = 1; repetition <= manifest.repetitions; repetition += 1) {
      const observation = await observe(
        fixture,
        manifest,
        repetition,
        dependencies,
      );
      observations.push(observation);
      if (observation.topAttentionId === fixture.expectedTopAttentionId) {
        correctTop += 1;
      }
      for (const field of ANSWER_FIELDS) {
        totalFields += 1;
        if (observation.answers[field] === fixture.expectedAnswers[field]) {
          correctFields += 1;
        }
      }
      recordedDurationsPass &&=
        observation.durationMs <= manifest.maximumIdentificationMs;
      interactionChecksPass &&=
        observation.visibleFreshness &&
        observation.allViewsReachable &&
        observation.focusVisible &&
        !observation.containsInferredPercentage &&
        observation.consequentialReviewRequired &&
        observation.optionalIntegrationIndependent &&
        observation.nativeNotificationVisible &&
        observation.dynamicResizeSafe &&
        observation.artifactReviewSafe &&
        observation.actionMatrixSafe &&
        observation.scrollAndSelectionSafe &&
        observation.exactViewport;
    }
  }
  const topItemSuccessRate =
    observations.length === 0 ? 0 : correctTop / observations.length;
  const fieldSuccessRate = totalFields === 0 ? 0 : correctFields / totalFields;
  const interactionPassed = interactionChecksPass;
  const recordedIdentificationPassed =
    recordedDurationsPass &&
    topItemSuccessRate === 1 &&
    fieldSuccessRate >= manifest.minimumFieldSuccessRate;
  const humanIdentificationPassed =
    recordedIdentificationPassed &&
    observations.every(
      ({ identificationObserver }) => identificationObserver === "human-recorded",
    );
  return {
    schemaVersion: 1,
    passed: interactionPassed && humanIdentificationPassed,
    interactionPassed,
    recordedIdentificationPassed,
    humanIdentificationPassed,
    topItemSuccessRate,
    fieldSuccessRate,
    observations,
  };
}
