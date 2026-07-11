import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  evaluateUsabilityManifest,
  parseUsabilityManifest,
} from "../src/evaluation.js";
import { renderFabricConsoleFrame } from "../src/index.js";

const dependencies = { render: renderFabricConsoleFrame };

const fixtureUrl = new URL(
  "../evals/usability-fixtures.v1.json",
  import.meta.url,
);

async function manifestValue(): Promise<unknown> {
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
}

describe("versioned Console usability evaluation", () => {
  it("passes all required scenarios across three timed 80x24 repetitions", async () => {
    const manifest = parseUsabilityManifest(await manifestValue());
    const report = evaluateUsabilityManifest(manifest, dependencies);

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
    ]);
    expect(report).toMatchObject({
      schemaVersion: 1,
      passed: true,
      topItemSuccessRate: 1,
      fieldSuccessRate: 1,
    });
    expect(report.observations).toHaveLength(9);
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
          observation.exactViewport,
      ),
    ).toBe(true);
  });

  it("proves ordering, duplicate grouping and optional GitHub degradation", async () => {
    const manifest = parseUsabilityManifest(await manifestValue());
    const report = evaluateUsabilityManifest(manifest, dependencies);
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
});
