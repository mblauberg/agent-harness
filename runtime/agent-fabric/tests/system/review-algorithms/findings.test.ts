import { describe, expect, it } from "vitest";

import { sha256Digest } from "../../../src/review/canonical/index.ts";
import {
  buildFindingSet,
  createSafeFinding,
  isFindingRepairEligible,
  planFindingWindow,
  verifyFindingSet,
  type SafeFindingInput,
} from "../../../src/review/findings/index.ts";

const digest = (value: string) => sha256Digest(value);

function finding(index: number, kind: SafeFindingInput["repairCurrency"]["kind"] = "repository-source") {
  return createSafeFinding({
    findingId: `F-${String(index).padStart(4, "0")}`,
    severity: index % 3 === 0 ? "P0" : index % 3 === 1 ? "P1" : "P2",
    summary: `summary ${index}`,
    evidence: `evidence ${index} ${"x".repeat(180)}`,
    originTargetGeneration: 1,
    originActionRef: { adapterId: "codex-app-server", actionId: `action-${index}` },
    originResultDigest: digest(`result-${index}`),
    originDeliveryManifest: { artifactRef: "manifest", artifactRevision: 1 },
    originDeliveryReviewBasisDigest: digest("basis-1"),
    originBundleDigest: digest("bundle-1"),
    repairCurrency: {
      kind,
      originRepositorySourceStateDigest: kind === "registered-evidence" ? null : digest("source-1"),
      evidenceRefs: kind === "repository-source" ? [] : [{
        evidenceRef: "test-evidence",
        evidenceRevision: 2,
        contentDigest: digest("evidence-2"),
      }],
    },
  });
}

describe("paged review finding sets", () => {
  it("preserves more than 256 whole ordered findings without truncation", () => {
    const members = Array.from({ length: 300 }, (_, index) => finding(index));
    const result = buildFindingSet([...members].reverse());

    expect(result.findingSet.findingCount).toBe(300);
    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.pages.flatMap(({ page }) => page.members)).toHaveLength(300);
    expect(result.pages.every(({ canonicalBytes }) => canonicalBytes.byteLength <= 65_536)).toBe(true);
    expect(() => verifyFindingSet(result)).not.toThrow();
    expect(() => verifyFindingSet({
      ...result,
      findingSet: { ...result.findingSet, findingCount: 299 },
    })).toThrow(/count/u);
  });

  it("uses distinct normal and bounded resolution-only capacity plans", () => {
    const prior = [digest("one"), digest("two")].sort();
    const normal = planFindingWindow({ mode: "normal", priorOpenFindingDigests: prior, availableBytes: 10_000_000 });
    expect(normal).toMatchObject({ status: "admitted", maximumNewFindings: 32, resolutionWindowDigests: [] });
    expect(planFindingWindow({
      mode: "normal",
      priorOpenFindingDigests: prior,
      availableBytes: normal.requiredBytes - 1,
    }).status).toBe("finding-capacity-exhausted");

    expect(planFindingWindow({
      mode: "resolution-only",
      priorOpenFindingDigests: prior,
      resolutionWindowDigests: [prior[1]!],
      availableBytes: 1_000_000,
    })).toMatchObject({ status: "admitted", maximumNewFindings: 0, resolutionWindowDigests: [prior[1]] });
    expect(() => planFindingWindow({
      mode: "resolution-only",
      priorOpenFindingDigests: prior,
      resolutionWindowDigests: [digest("not-open")],
      availableBytes: 1_000_000,
    })).toThrow(/prior open/u);
  });

  it("requires exact source, evidence or mixed repair currency", () => {
    const source = finding(1, "repository-source");
    const evidence = finding(2, "registered-evidence");
    const mixed = finding(3, "mixed");
    const current = {
      deliveryManifest: { artifactRef: "manifest", artifactRevision: 2 },
      deliveryReviewBasisDigest: digest("basis-2"),
      bundleDigest: digest("bundle-2"),
      repositorySourceStateDigest: digest("source-2"),
      evidenceRefs: [{ evidenceRef: "test-evidence", evidenceRevision: 3, contentDigest: digest("evidence-3") }],
    };
    expect(isFindingRepairEligible(source, current)).toBe(true);
    expect(isFindingRepairEligible(evidence, { ...current, repositorySourceStateDigest: digest("source-1") })).toBe(true);
    expect(isFindingRepairEligible(mixed, current)).toBe(true);
    expect(isFindingRepairEligible(source, { ...current, repositorySourceStateDigest: digest("source-1") })).toBe(false);
    expect(isFindingRepairEligible(evidence, { ...current, evidenceRefs: [{
      evidenceRef: "test-evidence",
      evidenceRevision: 3,
      contentDigest: digest("evidence-2"),
    }] })).toBe(false);
  });
});
