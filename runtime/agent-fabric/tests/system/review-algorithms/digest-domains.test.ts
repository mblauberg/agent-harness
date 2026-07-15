import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  digestDeliveryEvidenceClosure,
  digestDeliveryRequirementMap,
  digestMandatoryReadSet,
  digestRepositorySourceState,
  digestReviewBundleCoverage,
  digestReviewSubject,
} from "../../../src/review/canonical/domains.ts";
import { canonicalString, sha256Digest } from "../../../src/review/canonical/index.ts";

const digest = (value: string) => sha256Digest(value);
const expectedDigest = (preimage: string) => `sha256:${createHash("sha256").update(preimage).digest("hex")}`;

describe("review canonical digest domains", () => {
  it("freezes generation-free requirement closure separately from the complete stored map", () => {
    const map = {
      schemaVersion: 1,
      artifactKind: "delivery-requirement-map.v1",
      projectSessionId: "session",
      coordinationRunId: "run",
      deliveryRunId: "delivery",
      mapGeneration: 3,
      closureDigest: digest("placeholder"),
      catalogueDigest: digest("catalogue"),
      acceptedScope: { artifactRef: "scope", artifactRevision: 1, contentDigest: digest("scope") },
      bindingSources: [{ role: "spec", artifactRef: "spec", artifactRevision: 2,
        contentDigest: digest("spec"), requirementIds: ["R-1"] }],
      requirements: [{ requirementId: "R-1", sourceRef: "spec", disposition: "proved",
        evidenceRefs: [{ evidenceRef: "test", evidenceRevision: 4, contentDigest: digest("test") }] }],
    };
    const result = digestDeliveryRequirementMap(map);
    const closure = { ...map };
    delete (closure as Partial<typeof map>).mapGeneration;
    delete (closure as Partial<typeof map>).closureDigest;
    const expectedClosure = canonicalString({
      acceptedScope: map.acceptedScope,
      artifactKind: map.artifactKind,
      bindingSources: map.bindingSources,
      catalogueDigest: map.catalogueDigest,
      coordinationRunId: map.coordinationRunId,
      deliveryRunId: map.deliveryRunId,
      projectSessionId: map.projectSessionId,
      requirements: map.requirements,
      schemaVersion: 1,
    });
    expect(result.closurePreimage).toBe(expectedClosure);
    expect(result.closureDigest).toBe(expectedDigest(expectedClosure));
    expect(result.digest).toBe(expectedDigest(result.preimage));
    expect(() => digestDeliveryRequirementMap({ ...map, extra: true })).toThrow(/field/u);
  });

  it("enforces evidence, coverage and mandatory-entry domain order", () => {
    const closure = {
      schemaVersion: 1,
      projectSessionId: "session",
      coordinationRunId: "run",
      deliveryRunId: "delivery",
      entries: [
        { role: "accepted-scope", evidenceRef: "scope", evidenceRevision: 1, contentDigest: digest("scope"), status: "approved" },
        { role: "test", evidenceRef: "test", evidenceRevision: 2, contentDigest: digest("test"), status: "pass" },
      ],
    };
    expect(digestDeliveryEvidenceClosure(closure).digest).toMatch(/^sha256:/u);
    expect(() => digestDeliveryEvidenceClosure({ ...closure, entries: [...closure.entries].reverse() })).toThrow(/order/u);

    const coverage = {
      schemaVersion: 1,
      repository: { objectFormat: "sha1", baseObjectId: "1".repeat(40), headObjectId: "2".repeat(40),
        reviewDiffCodecDigest: digest("codec"), reviewDiffRulesDigest: digest("rules"), reviewDiffSetDigest: digest("set") },
      changedFiles: [{ ordinal: 0, path: "a.ts" }],
      requiredEvidence: [{ ordinal: 0, evidenceRef: "scope" }],
      carriedFindingSet: { findingSetDigest: digest("findings"), findingCount: 0, pages: [] },
      objects: [{ ordinal: 0, objectDigest: digest("object") }],
      bundleSearchIndexDigest: digest("search"),
      riskReadMapDigest: digest("risk"),
    };
    const coverageDigest = digestReviewBundleCoverage(coverage);
    expect(coverageDigest.preimage).toBe(canonicalString(coverage));
    expect(coverageDigest.digest).toBe(expectedDigest(canonicalString(coverage)));
    expect(coverageDigest.digest).toBe("sha256:226b2b17ce85ee37cf1ed68695b10ce456df9f3c2998ff6f80aca5cf8e18fedb");
    expect(() => digestReviewBundleCoverage({ ...coverage, delivery: { reviewBasisDigest: digest("basis") } })).toThrow(/field/u);
    expect(() => digestReviewBundleCoverage({ ...coverage, repository: { ...coverage.repository,
      sourceStateDigest: digest("source") } })).toThrow(/field/u);
    expect(() => digestReviewBundleCoverage({ ...coverage, changedFiles: [{ ordinal: 1, path: "a.ts" }] })).toThrow(/ordinal/u);

    const mandatory = { schemaVersion: 1, entries: [
      { kind: "manifest-root", ordinal: 0, parentDigest: null, payloadDigest: digest("root") },
      { kind: "manifest-body-page", ordinal: 0, parentDigest: digest("root"), payloadDigest: digest("page") },
      { kind: "delivery-manifest", ordinal: 0, parentDigest: digest("body"), payloadDigest: digest("manifest") },
    ] };
    expect(digestMandatoryReadSet(mandatory).digest).toMatch(/^sha256:/u);
    expect(() => digestMandatoryReadSet({ ...mandatory, entries: [...mandatory.entries].reverse() })).toThrow(/order/u);
  });

  it("keeps repository source and immutable review subject in disjoint closed domains", () => {
    const source = { schemaVersion: 1, objectFormat: "sha1", baseObjectId: "1".repeat(40),
      headObjectId: "2".repeat(40), headTreeId: "3".repeat(40), indexTreeId: "3".repeat(40), worktreeState: "clean" };
    const sourceResult = digestRepositorySourceState(source);
    expect(sourceResult.preimage).toBe(JSON.stringify({ baseObjectId: source.baseObjectId, headObjectId: source.headObjectId,
      headTreeId: source.headTreeId, indexTreeId: source.indexTreeId, objectFormat: "sha1", schemaVersion: 1,
      worktreeState: "clean" }));

    const subject = {
      schemaVersion: 1,
      taskId: "review-task",
      reviewedArtifactRef: "manifest@2",
      publicationLineageDigest: digest("lineage"),
      deliveryReviewBasisRevision: 2,
      deliveryReviewBasisDigest: digest("basis"),
      repositorySourceStateDigest: sourceResult.digest,
      reviewBundleBinding: {
        bundleGeneration: 1,
        bundleDigest: digest("bundle"),
        manifestBodyDigest: digest("body"),
        manifestRootDigest: digest("root"),
        coverageDigest: digest("coverage"),
        bundleSearchIndexDigest: digest("search"),
        riskReadMapDigest: digest("risk"),
        mandatoryReadSetDigest: digest("mandatory"),
        mandatoryReadCount: 4,
        mandatoryReadBytes: 1024,
        objectCount: 3,
        chunkCount: 3,
        totalObjectBytes: 128,
      },
      completionProfile: {
        profileId: "certifying-review-four-slot-v1",
        profileSchemaDigest: digest("profile-schema"),
        resolvedProfileDigest: digest("profile"),
        slots: [{ slot: "native" }, { slot: "other-primary" }, { slot: "cursor-grok" }, { slot: "agy-gemini" }],
      },
    };
    expect(digestReviewSubject(subject).digest).toMatch(/^sha256:/u);
    expect(() => digestReviewSubject(source)).toThrow(/field/u);
  });
});
