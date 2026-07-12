import { describe, expect, it } from "vitest";

import type {
  OperatorViewRow,
  Timestamp,
} from "@local/agent-fabric-protocol";
import {
  FABRIC_VIEWS,
  compareRevision,
  createEmptyViewPages,
  mapProtocolRow,
  rankConsoleRows,
  revisionFromProtocol,
} from "../src/model.js";

const observedAt = "2026-07-11T12:00:00.000Z" as Timestamp;
const nativeNotification = {
  targetIntegration: "native-desktop",
  status: "available",
  journalState: "sent",
  deliveryItemRevision: 1,
  claimGeneration: null,
  integrationState: "available",
  observedAt,
} as const;

function attentionRow(
  overrides: Partial<OperatorViewRow<"attention">> &
    Pick<OperatorViewRow<"attention">, "itemId" | "itemRevision">,
  priority:
    | "safety-integrity"
    | "critical-path"
    | "expiring-authority"
    | "acceptance-ready"
    | "advisory",
): OperatorViewRow<"attention"> {
  return {
    itemId: overrides.itemId,
    itemRevision: overrides.itemRevision,
    fact: {
      freshness: "live",
      source: "fabric",
      revision: overrides.itemRevision,
      observedAt,
      value: {
        summary: {
          kind: "attention",
          label: priority === "critical-path" ? "Blocked" : "FYI",
          priority,
          title: `${priority} item`,
          nativeNotification: {
            ...nativeNotification,
            deliveryItemRevision: overrides.itemRevision,
          },
        },
        detailRef: {
          kind: "system",
          componentId: overrides.itemId,
          expectedRevision: overrides.itemRevision,
        },
        actionAvailability: {
          state: "read-only",
          reason: "state-ineligible",
        },
      },
    },
  };
}

describe("structured Console model", () => {
  it("defines exactly the eight binding views with independent paging state", () => {
    expect(FABRIC_VIEWS).toStrictEqual([
      "attention",
      "project",
      "runs",
      "work",
      "agents",
      "evidence",
      "activity",
      "system",
    ]);

    const pages = createEmptyViewPages();
    expect(Object.keys(pages)).toStrictEqual(FABRIC_VIEWS);
    expect(
      Object.values(pages).every(
        (page) =>
          page.rows.length === 0 &&
          page.nextCursor === 0 &&
          page.hasMore === false,
      ),
    ).toBe(true);
  });

  it("uses canonical decimal revisions at the client boundary", () => {
    const low = revisionFromProtocol(9);
    const high = revisionFromProtocol(Number.MAX_SAFE_INTEGER);

    expect(low).toBe("9");
    expect(high).toBe("9007199254740991");
    expect(compareRevision(low, high)).toBeLessThan(0);
    expect(compareRevision(high, high)).toBe(0);
    expect(() => revisionFromProtocol(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /safe non-negative integer/,
    );
    expect(() => revisionFromProtocol(-1)).toThrow(/safe non-negative integer/);
    expect(() => revisionFromProtocol(1.5)).toThrow(/safe non-negative integer/);
  });

  it("maps a protocol row without collapsing identity, revision, freshness or action state", () => {
    const source = attentionRow(
      { itemId: "attention:gate-7", itemRevision: 42 },
      "safety-integrity",
    );

    const row = mapProtocolRow("attention", source, Date.parse(observedAt) + 2_500, "daemon-journal");

    expect(row).toMatchObject({
      view: "attention",
      stableId: "attention:gate-7",
      revision: "42",
      urgency: "safety-integrity",
      freshness: {
        state: "live",
        source: "fabric",
        revision: "42",
        observedAt,
        ageMs: 2_500,
      },
      summary: {
        kind: "attention",
        priority: "safety-integrity",
      },
      detailRef: {
        kind: "system",
        componentId: "attention:gate-7",
        expectedRevision: 42,
      },
      actionAvailability: {
        state: "read-only",
        reason: "state-ineligible",
      },
    });
    expect(JSON.stringify(row)).not.toMatch(/percent|percentage/i);
  });

  it("creates only the explicit unavailable state when the current optional feature is absent", () => {
    const extended = attentionRow(
      { itemId: "attention:optional", itemRevision: 3 },
      "critical-path",
    );
    if (extended.fact.freshness !== "live") throw new Error("expected a live fixture row");
    const { nativeNotification: _notification, ...unavailableSummary } = extended.fact.value.summary;
    const withoutOptionalFeature: OperatorViewRow<"attention"> = {
      ...extended,
      fact: {
        ...extended.fact,
        value: { ...extended.fact.value, summary: unavailableSummary },
      },
    };

    const row = mapProtocolRow(
      "attention",
      withoutOptionalFeature,
      Date.parse(observedAt),
      "feature-unavailable",
    );
    expect(row.summary?.kind).toBe("attention");
    if (row.summary?.kind !== "attention") throw new Error("expected Attention summary");
    expect(row.summary.nativeNotification).toStrictEqual({
      kind: "feature-unavailable",
      status: "unavailable",
      reason: "feature-not-negotiated",
    });
    expect(Object.keys(row.summary.nativeNotification).sort()).toStrictEqual([
      "kind",
      "reason",
      "status",
    ]);
  });

  it("ranks attention deterministically by binding urgency and stable identity", () => {
    const rows = [
      attentionRow({ itemId: "z-advisory", itemRevision: 1 }, "advisory"),
      attentionRow({ itemId: "z-critical", itemRevision: 1 }, "critical-path"),
      attentionRow({ itemId: "b-safety", itemRevision: 1 }, "safety-integrity"),
      attentionRow({ itemId: "a-safety", itemRevision: 2 }, "safety-integrity"),
      attentionRow(
        { itemId: "z-acceptance", itemRevision: 1 },
        "acceptance-ready",
      ),
      attentionRow(
        { itemId: "z-expiring", itemRevision: 1 },
        "expiring-authority",
      ),
    ].map((row) => mapProtocolRow("attention", row, Date.parse(observedAt), "daemon-journal"));

    expect(rankConsoleRows(rows).map(({ stableId }) => stableId)).toStrictEqual([
      "a-safety",
      "b-safety",
      "z-critical",
      "z-expiring",
      "z-acceptance",
      "z-advisory",
    ]);
  });

  it("retains unavailable and conflict facts as honest non-actionable rows", () => {
    const unavailable: OperatorViewRow<"system"> = {
      itemId: "github",
      itemRevision: 5,
      fact: {
        freshness: "unavailable",
        source: "github",
        revision: 5,
        observedAt,
        reason: "adapter disabled",
      },
    };
    const conflict: OperatorViewRow<"system"> = {
      itemId: "daemon",
      itemRevision: 6,
      fact: {
        freshness: "conflict",
        source: "fabric",
        revision: 6,
        observedAt,
        candidates: [
          {
            summary: {
              kind: "system",
              systemKind: "daemon",
              state: "healthy",
              detail: "generation 3",
            },
            detailRef: {
              kind: "system",
              componentId: "daemon",
              expectedRevision: 6,
            },
            actionAvailability: {
              state: "available",
              actions: ["daemon-drain"],
              requiresPreview: true,
            },
          },
          {
            summary: {
              kind: "system",
              systemKind: "daemon",
              state: "degraded",
              detail: "generation 4",
            },
            detailRef: {
              kind: "system",
              componentId: "daemon",
              expectedRevision: 6,
            },
            actionAvailability: {
              state: "available",
              actions: ["daemon-stop"],
              requiresPreview: true,
            },
          },
        ],
      },
    };

    expect(mapProtocolRow("system", unavailable, Date.parse(observedAt), "daemon-journal")).toMatchObject({
      stableId: "github",
      summary: null,
      detailRef: null,
      actionAvailability: {
        state: "read-only",
        reason: "fact-unavailable",
      },
      freshness: { state: "unavailable", reason: "adapter disabled" },
    });
    expect(mapProtocolRow("system", conflict, Date.parse(observedAt), "daemon-journal")).toMatchObject({
      stableId: "daemon",
      summary: null,
      detailRef: null,
      actionAvailability: {
        state: "read-only",
        reason: "fact-conflict",
      },
      freshness: { state: "conflict", candidateCount: 2 },
    });
  });
});
