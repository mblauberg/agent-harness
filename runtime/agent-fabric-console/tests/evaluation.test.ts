import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  evaluateUsabilityManifest,
  parseUsabilityManifest,
  REQUIRED_USABILITY_ACTION_IDS,
} from "../src/evaluation.js";
import { reduceFabricPointer, renderFabricConsoleFrame } from "../src/index.js";

const dependencies = {
  render: renderFabricConsoleFrame,
  reducePointer: reduceFabricPointer,
  identify: async ({ fixture, repetition }: {
    fixture: ReturnType<typeof parseUsabilityManifest>["fixtures"][number];
    repetition: number;
  }) => ({
    observer: "automated-proxy" as const,
    durationMs: 1_500 + repetition * 100,
    topAttentionId: fixture.expectedTopAttentionId,
    answers: fixture.expectedAnswers,
  }),
};

const fixtureUrl = new URL(
  "../evals/usability-fixtures.v1.json",
  import.meta.url,
);

async function manifestValue(): Promise<unknown> {
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
}

describe("versioned Console usability evaluation", () => {
  it("passes interaction checks while withholding the human timing claim from proxy repetitions", async () => {
    const manifest = parseUsabilityManifest(await manifestValue());
    const report = await evaluateUsabilityManifest(manifest, dependencies);

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      referenceViewport: { columns: 80, rows: 24 },
      repetitions: 3,
      minimumFieldSuccessRate: 0.95,
    });
    expect(manifest.fixtures.map(({ id }) => id)).toStrictEqual([
      "empty-healthy-work",
      "concurrent-multi-run",
      "gate-degraded-stale-conflict",
      "optional-notification-unavailable",
    ]);
    expect(report).toMatchObject({
      schemaVersion: 1,
      passed: false,
      interactionPassed: true,
      recordedIdentificationPassed: true,
      humanIdentificationPassed: false,
      topItemSuccessRate: 1,
      fieldSuccessRate: 1,
    });
    expect(report.observations).toHaveLength(12);
    expect(
      report.observations.every(
        (observation) =>
          observation.durationMs <= manifest.maximumIdentificationMs &&
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
          observation.actionMatrixFailures.length === 0 &&
          observation.scrollAndSelectionSafe &&
          observation.exactViewport,
      ),
    ).toBe(true);
    expect(report.observations.every((observation) =>
      observation.identificationObserver === "automated-proxy" &&
      observation.keyboardEventCount >= 8 &&
      observation.mouseEventCount >= 2 &&
      observation.scrollEventCount >= 2 &&
      observation.resizeEventCount >= 3
    )).toBe(true);
    expect([
      ...new Set(report.observations.flatMap(({ actionIdsCovered }) => actionIdsCovered)),
    ].sort()).toStrictEqual([...REQUIRED_USABILITY_ACTION_IDS].sort());
    expect(report.observations.every(({ keyboardActionIds, mouseActionIds }) =>
      keyboardActionIds.every((action) => mouseActionIds.includes(action)) &&
      mouseActionIds.every((action) => keyboardActionIds.includes(action))
    )).toBe(true);
  });

  it("proves ordering, duplicate grouping and optional GitHub degradation", async () => {
    const manifest = parseUsabilityManifest(await manifestValue());
    const report = await evaluateUsabilityManifest(manifest, dependencies);
    const concurrent = report.observations.filter(
      ({ fixtureId }) => fixtureId === "concurrent-multi-run",
    );
    const degraded = report.observations.filter(
      ({ fixtureId }) => fixtureId === "gate-degraded-stale-conflict",
    );

    expect(concurrent.map(({ topAttentionId }) => topAttentionId)).toStrictEqual([
      "attention-critical-path",
      "attention-critical-path",
      "attention-critical-path",
    ]);
    expect(degraded.map(({ topAttentionId }) => topAttentionId)).toStrictEqual([
      "attention-safety-gate",
      "attention-safety-gate",
      "attention-safety-gate",
    ]);
    expect(degraded.every(({ optionalIntegrationIndependent }) => optionalIntegrationIndependent)).toBe(true);
    expect(degraded.every(({ dynamicResizeSafe, artifactReviewSafe }) => (
      dynamicResizeSafe && artifactReviewSafe
    ))).toBe(true);
    expect(manifest.fixtures.find(({ id }) => id === "gate-degraded-stale-conflict"))
      .toMatchObject({
        evidenceReview: {
          transformation: "terminal-neutralised",
          expectedDisposition: "confirm-terminal-neutralised",
        },
      });
    expect(report.observations
      .filter(({ fixtureId }) => fixtureId === "optional-notification-unavailable")
      .every(({ nativeNotificationVisible }) => nativeNotificationVisible)).toBe(true);
    expect(
      manifest.fixtures
        .flatMap(({ attention }) => attention)
        .some(({ duplicateCount }) => duplicateCount > 1),
    ).toBe(true);
  });

  it("rejects vacuous or ambiguous manifests before evaluation", async () => {
    const value = (await manifestValue()) as Record<string, unknown>;
    expect(() =>
      parseUsabilityManifest({ ...value, repetitions: 2 }),
    ).toThrow(/repetitions/);
    expect(() =>
      parseUsabilityManifest({ ...value, minimumFieldSuccessRate: 0.5 }),
    ).toThrow(/minimumFieldSuccessRate/);

    const fixtures = structuredClone(value.fixtures) as Array<Record<string, unknown>>;
    if (fixtures[1] !== undefined) fixtures[1].id = fixtures[0]?.id;
    expect(() => parseUsabilityManifest({ ...value, fixtures })).toThrow(
      /fixture IDs must be unique/,
    );
  });

  it("fails recorded identification attempts that are late or wrong instead of inferring answers from rendered text", async () => {
    const manifest = parseUsabilityManifest(await manifestValue());
    const report = await evaluateUsabilityManifest(manifest, {
      ...dependencies,
      identify: async ({ fixture, repetition }) => ({
        observer: "automated-proxy" as const,
        durationMs: repetition === 1 ? manifest.maximumIdentificationMs + 1 : 500,
        topAttentionId: fixture.expectedTopAttentionId,
        answers: {
          ...fixture.expectedAnswers,
          owner: "wrong-owner",
        },
      }),
    });

    expect(report.passed).toBe(false);
    expect(report.fieldSuccessRate).toBeLessThan(1);
    expect(report.observations.some(
      ({ durationMs }) => durationMs > manifest.maximumIdentificationMs,
    )).toBe(true);
  });
});
