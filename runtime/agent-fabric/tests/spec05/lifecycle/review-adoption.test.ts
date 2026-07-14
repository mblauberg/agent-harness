import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { LifecycleReviewAdoptionStore } from "../../../src/lifecycle/review-adoption.ts";

describe("lifecycle review adoption store", () => {
  it("rejects every transactional write entry point before reading or writing the database", () => {
    const database = new Database(":memory:");
    try {
      const store = new LifecycleReviewAdoptionStore(database);
      const context = {
        projectSessionId: "project-session-01",
        runId: "run-01",
        agentId: "agent-01",
        custodyId: "custody-01",
        finalRevision: 2,
        applyId: "apply-01",
        batchId: "batch-01",
        review: null,
      } as const;
      const calls = [
        () => store.persistPreparedIntentInCurrentTransaction({
          preparation: {
            prepared: null,
            intentCount: 1,
            intentCountDec: "1",
            secondaryKind: "none",
            reservationId: null,
            reservationDigest: null,
            reservationRef: null,
            orderedSubjectMembers: [],
          },
          ...context,
          custodyEffectDigest: "sha256:effect",
          recordedAt: 1,
        }),
        () => store.persistAuthorityReceiptInCurrentTransaction(context, null),
        () => store.prepareReservationInCurrentTransaction({
          runId: context.runId,
          agentId: context.agentId,
          custodyId: context.custodyId,
          applyId: context.applyId,
          commandId: "command-01",
          head: {
            ...context,
            revision: 1,
            state: "committing",
            disposition: "none",
            semanticDigest: "sha256:semantic",
            sourceRefDigest: "sha256:source",
            journalDigest: "sha256:journal",
            terminal: false,
          },
          finalRevision: context.finalRevision,
          finalSourceRefDigest: "sha256:final-source",
          lifecycleAdoptionEvidenceDigest: "sha256:adoption",
          recordedAt: 1,
          source: {},
          mutationPlan: { schemaVersion: 1, writes: [], writeSetDigest: "sha256:writes" },
        }),
        () => store.writePostStateInCurrentTransaction(
          context,
          { receiptDigest: "sha256:receipt" },
          1,
        ),
      ];

      const errors = calls.map((call) => {
        try {
          call();
          return null;
        } catch (error: unknown) {
          return error instanceof Error ? error.message : String(error);
        }
      });

      expect(errors).toEqual(Array(4).fill("lifecycle review adoption requires a transaction"));
      expect(database.prepare("SELECT total_changes() AS count").get()).toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });
});
