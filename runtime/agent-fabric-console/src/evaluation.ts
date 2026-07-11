import { performance } from "node:perf_hooks";
import stringWidth from "string-width";

import type {
  AgentId,
  AttentionItem,
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
  type ConsoleRow,
  type FabricView,
} from "./model.js";
import { createFabricUiState, presentFabricConsole } from "./presenter.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";

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
}>;

export type UsabilitySystem = Readonly<{
  id: string;
  state: "healthy" | "degraded" | "stale" | "unavailable" | "conflict";
  freshness: "live" | "snapshot" | "stale" | "unavailable" | "conflict";
  detail: string;
}>;

export type UsabilityFixture = Readonly<{
  id: string;
  description: string;
  project: string;
  session: string;
  runs: readonly UsabilityRun[];
  attention: readonly UsabilityAttention[];
  system: readonly UsabilitySystem[];
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
  exactViewport: boolean;
}>;

export type UsabilityEvaluationReport = Readonly<{
  schemaVersion: 1;
  passed: boolean;
  topItemSuccessRate: number;
  fieldSuccessRate: number;
  observations: readonly UsabilityObservation[];
}>;

export type UsabilityEvaluationDependencies = Readonly<{
  render: (
    dataset: FabricConsoleDataset,
    controller: ConsoleControllerState,
    ui: ReturnType<typeof createFabricUiState>,
    viewport: UsabilityManifest["referenceViewport"],
  ) => FabricConsoleFrame;
}>;

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

function attentionRow(item: UsabilityAttention): ConsoleRow<"attention"> {
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
    runId: run.id as never,
    phase: run.phase,
    chairAgentId: run.owner as AgentId,
    nextMilestone: run.nextMilestone,
    health: run.health,
  }));
  const attentionRows = rankConsoleRows(fixture.attention.map(attentionRow));
  const systemRows = fixture.system.map(systemRow);
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
  }));
  return {
    connection: { state: "live" },
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
    },
    loadedAtMs: performance.now(),
    canMutate: true,
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

function observe(
  fixture: UsabilityFixture,
  manifest: UsabilityManifest,
  repetition: number,
  dependencies: UsabilityEvaluationDependencies,
): UsabilityObservation {
  const started = performance.now();
  const dataset = fixtureDataset(fixture);
  const controller = controllerState(dataset);
  const top = dataset.pages.attention.rows[0];
  const focusId =
    top === undefined ? "view:attention" : `row:attention:${top.stableId}`;
  const ui = createFabricUiState({ focusId });
  const presentation = presentFabricConsole(
    dataset,
    controller,
    ui,
    manifest.referenceViewport,
  );
  const frame: FabricConsoleFrame = dependencies.render(
    dataset,
    controller,
    ui,
    manifest.referenceViewport,
  );
  const durationMs = performance.now() - started;
  const frameText = frame.rows.join("\n");
  const visibleAnswer = (value: string): string =>
    frameText.includes(value) ? value : "not-visible";
  const githubUnavailable = fixture.system.some(
    (item) => item.id === "github" && item.freshness === "unavailable",
  );
  return {
    fixtureId: fixture.id,
    repetition,
    durationMs,
    topAttentionId: presentation.masterRows[0]?.stableId ?? null,
    answers: {
      project: visibleAnswer(presentation.header.project),
      run: visibleAnswer(presentation.header.run),
      phase: visibleAnswer(presentation.header.phase),
      owner: visibleAnswer(presentation.header.owner),
      nextMilestone: visibleAnswer(presentation.header.nextMilestone),
      health: visibleAnswer(presentation.header.health),
    },
    visibleFreshness:
      presentation.masterRows.length === 0 ||
      frameText.includes(presentation.masterRows[0]?.freshness ?? ""),
    allViewsReachable:
      presentation.views.length === FABRIC_VIEWS.length &&
      FABRIC_VIEWS.every((view) =>
        frame.hitRegions.some((region) => region.id === `view:${view}`),
      ),
    focusVisible: frameText.includes(">"),
    containsInferredPercentage: /\b\d+(?:\.\d+)?%/u.test(frameText),
    consequentialReviewRequired:
      top === undefined ||
      !fixture.attention.find((item) => item.id === top.stableId)?.consequential ||
      (top.actionAvailability.state === "available" &&
        top.actionAvailability.requiresPreview),
    optionalIntegrationIndependent:
      !githubUnavailable ||
      (dataset.connection.state === "live" && presentation.connection === "LIVE"),
    exactViewport:
      frame.columns === manifest.referenceViewport.columns &&
      frame.rows.length === manifest.referenceViewport.rows &&
      frame.rows.every(
        (row) => stringWidth(row) === manifest.referenceViewport.columns,
      ),
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

export function evaluateUsabilityManifest(
  manifest: UsabilityManifest,
  dependencies: UsabilityEvaluationDependencies,
): UsabilityEvaluationReport {
  const observations: UsabilityObservation[] = [];
  let correctTop = 0;
  let correctFields = 0;
  let totalFields = 0;
  let requiredChecksPass = true;
  for (const fixture of manifest.fixtures) {
    for (let repetition = 1; repetition <= manifest.repetitions; repetition += 1) {
      const observation = observe(fixture, manifest, repetition, dependencies);
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
      requiredChecksPass &&=
        observation.durationMs <= manifest.maximumIdentificationMs &&
        observation.visibleFreshness &&
        observation.allViewsReachable &&
        observation.focusVisible &&
        !observation.containsInferredPercentage &&
        observation.consequentialReviewRequired &&
        observation.optionalIntegrationIndependent &&
        observation.exactViewport;
    }
  }
  const topItemSuccessRate =
    observations.length === 0 ? 0 : correctTop / observations.length;
  const fieldSuccessRate = totalFields === 0 ? 0 : correctFields / totalFields;
  return {
    schemaVersion: 1,
    passed:
      requiredChecksPass &&
      topItemSuccessRate === 1 &&
      fieldSuccessRate >= manifest.minimumFieldSuccessRate,
    topItemSuccessRate,
    fieldSuccessRate,
    observations,
  };
}
