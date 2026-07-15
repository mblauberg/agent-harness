import { describe, expect, it } from "vitest";

import { buildReviewBundle, chunkBundleObject, REVIEW_BUNDLE_LIMITS,
  REVIEW_RISK_RULES_DIGEST } from "../../../src/review/bundle/index.ts";
import { canonicalBytes, digestCanonical, sha256Digest } from "../../../src/review/canonical/index.ts";
import { buildReviewDiffSet } from "../../../src/review/diff/index.ts";

const digest = (value: string) => sha256Digest(value);
const emptyReviewDiff = buildReviewDiffSet({ objectFormat: "sha1", baseObjectId: "1".repeat(40), headObjectId: "2".repeat(40),
  codecDigest: digest("codec"), rulesDigest: digest("rules"), before: [], after: [] });
const riskGroupIds = ["security-auth", "protocol-schema", "persistence-migration", "provider-adapter",
  "console-ui", "tests-evaluations", "documentation", "generated-other"] as const;
const riskMap = (overrides: any[] = []) => canonicalBytes({ schemaVersion: 1, rulesDigest: REVIEW_RISK_RULES_DIGEST,
  groups: riskGroupIds.map((groupId) => {
  const override = overrides.find((value) => value.groupId === groupId);
  return { groupId, totalCount: override?.totalCount ?? 0, samples: override?.samples ?? [] };
}) });

function body(objectDigest: string, objectBytes: number, chunkDigests: readonly string[],
  riskDigest = sha256Digest(riskMap()), searchDigest = sha256Digest(new Uint8Array())): any {
  return {
    schemaVersion: 1,
    bundleGeneration: 1,
    delivery: {
      deliveryRunId: "delivery",
      reviewBasisRevision: 1,
      reviewBasisDigest: digest("basis"),
      deliveryManifestRef: "manifest@1",
      deliveryManifestObjectDigest: objectDigest,
      deliveryRequirementMapObjectDigest: objectDigest,
    },
    repository: {
      objectFormat: "sha1",
      baseObjectId: "1".repeat(40),
      headObjectId: "2".repeat(40),
      headTreeId: "3".repeat(40),
      indexTreeId: "3".repeat(40),
      worktreeState: "clean",
      sourceStateDigest: digest("source"),
      reviewDiffCodecDigest: digest("codec"),
      reviewDiffRulesDigest: digest("rules"),
      reviewDiffSetDigest: emptyReviewDiff.reviewDiffSetDigest,
    },
    changedFiles: [],
    requiredEvidence: [{
      ordinal: 0,
      role: "delivery-manifest",
      evidenceRef: "manifest@1",
      evidenceRevision: 1,
      registeredContentDigest: objectDigest,
      objectDigest,
    }],
    carriedFindingSet: { findingSetDigest: objectDigest, findingCount: 0, pages: [] },
    objects: [{
      ordinal: 0,
      objectDigest,
      mediaType: "application/octet-stream",
      byteLength: objectBytes,
      chunkDigests,
    }],
    bundleSearchIndexDigest: searchDigest,
    riskReadMapDigest: riskDigest,
  };
}

const build = (input: any): Readonly<Record<string, unknown>> => buildReviewBundle({
  sealedBasis: { reviewBasisDigest: input.body.delivery.reviewBasisDigest,
    requiredEvidence: input.body.requiredEvidence },
  exactReviewDiff: emptyReviewDiff,
  ...input,
});

describe("review bundle algorithms", () => {
  it("owns the combined portal and search ledger ceilings", () => {
    expect(REVIEW_BUNDLE_LIMITS.maximumCombinedPortalBytes).toBe(10 * 1_024 * 1_024);
    expect(REVIEW_BUNDLE_LIMITS.maximumSearchCalls).toBe(16);
    expect(REVIEW_BUNDLE_LIMITS.maximumSearchBytes).toBe(1 * 1_024 * 1_024);
  });
  it("chunks exact raw bytes at 65,536 bytes and gives empty objects no chunks", () => {
    expect(chunkBundleObject(new Uint8Array()).chunks).toEqual([]);
    const bytes = new Uint8Array(REVIEW_BUNDLE_LIMITS.chunkBytes + 1).fill(7);
    const result = chunkBundleObject(bytes);
    expect(result.chunks.map((chunk) => chunk.byteLength)).toEqual([65_536, 1]);
    expect(result.chunkDigests).toEqual(result.chunks.map((chunk) => sha256Digest(chunk)));
    expect(result.objectDigest).toBe(sha256Digest(bytes));
  });

  it("seals the acyclic coverage/body/page/root/ref domains and verifies unique object bytes", () => {
    const payload = canonicalBytes({ safe: "evidence" });
    const chunked = chunkBundleObject(payload);
    const sealed = build({
      body: body(chunked.objectDigest, payload.byteLength, chunked.chunkDigests),
      objectPayloads: [{ objectDigest: chunked.objectDigest, bytes: payload }],
      searchIndexBytes: new Uint8Array(),
      riskReadMapBytes: riskMap(),
      expectedSearchIndexDigest: sha256Digest(new Uint8Array()),
      expectedRiskReadMapDigest: sha256Digest(riskMap()),
    }) as any;
    expect(sealed.body.coverageDigest).toBe(sealed.coverage.digest);
    expect(sealed.root.manifestBodyDigest).toBe(sealed.manifestBodyDigest);
    expect(sealed.reference.manifestRootDigest).toBe(sealed.manifestRootDigest);
    expect(sealed.bundleDigest).toBe(sha256Digest(sealed.referenceBytes));
    expect(sealed.pages.reduce((sum: number, page: Uint8Array) => sum + page.byteLength, 0)).toBe(sealed.bodyBytes.byteLength);
    expect(sealed.reference).not.toHaveProperty("bundleDigest");
    expect(sealed.mandatoryReadSet.entries.map((entry: any) => entry.kind)).toEqual([
      "manifest-root", "manifest-body-page", "delivery-manifest", "delivery-requirement-map", "required-evidence", "finding-set",
    ]);
    expect(sealed.reference.mandatoryReadBytes).toBe(
      sealed.mandatoryResponses.reduce((sum: number, response: Uint8Array) => sum + response.byteLength, 0),
    );
    for (const responseBytes of sealed.mandatoryResponses as Uint8Array[]) {
      const envelope = JSON.parse(new TextDecoder().decode(responseBytes));
      expect(envelope.id).toBe("Z".repeat(64));
      const result = JSON.parse(envelope.result.content[0].text);
      expect(result.bundleDigest).toBe(sealed.bundleDigest);
      const { resultDigest, ...digestInput } = result;
      expect(resultDigest).toBe(digestCanonical(digestInput));
    }
  });

  it("rejects copied-digest mismatches, duplicate payloads, and physical limit overflow", () => {
    const payload = new Uint8Array([1]);
    const chunked = chunkBundleObject(payload);
    const input = {
      body: body(chunked.objectDigest, 2, chunked.chunkDigests),
      objectPayloads: [{ objectDigest: chunked.objectDigest, bytes: payload }],
      searchIndexBytes: new Uint8Array(), riskReadMapBytes: riskMap(),
      expectedSearchIndexDigest: sha256Digest(new Uint8Array()), expectedRiskReadMapDigest: sha256Digest(riskMap()),
    };
    expect(() => build(input)).toThrow(/byteLength/u);
    expect(() => build({ ...input, body: body(chunked.objectDigest, 1, chunked.chunkDigests),
      objectPayloads: [...input.objectPayloads, ...input.objectPayloads] })).toThrow(/duplicate/u);
    expect(() => chunkBundleObject(new Uint8Array(REVIEW_BUNDLE_LIMITS.maximumObjectBytes + 1))).toThrow(/object byte/u);
  });

  it("rejects caller-omitted evidence against the sealed delivery basis", () => {
    const payload = canonicalBytes({ safe: "evidence" });
    const chunked = chunkBundleObject(payload);
    const completeBody = body(chunked.objectDigest, payload.byteLength, chunked.chunkDigests);
    const omittedBody = { ...completeBody, requiredEvidence: [] };
    expect(() => build({
      body: omittedBody,
      sealedBasis: { reviewBasisDigest: completeBody.delivery.reviewBasisDigest,
        requiredEvidence: completeBody.requiredEvidence },
      objectPayloads: [{ objectDigest: chunked.objectDigest, bytes: payload }],
      searchIndexBytes: new Uint8Array(), riskReadMapBytes: riskMap(),
      expectedSearchIndexDigest: sha256Digest(new Uint8Array()), expectedRiskReadMapDigest: sha256Digest(riskMap()),
    } as any)).toThrow(/required evidence differs from sealed basis/u);
  });

  it("rejects caller-omitted changed files against the exact review diff", () => {
    const payload = canonicalBytes({ safe: "evidence" });
    const chunked = chunkBundleObject(payload);
    const exactReviewDiff = buildReviewDiffSet({ objectFormat: "sha1", baseObjectId: "1".repeat(40),
      headObjectId: "2".repeat(40), codecDigest: digest("codec"), rulesDigest: digest("rules"), before: [],
      after: [{ path: "omitted.ts", mode: "100644", bytes: new TextEncoder().encode("omitted\n") }] });
    expect(() => build({
      body: body(chunked.objectDigest, payload.byteLength, chunked.chunkDigests),
      exactReviewDiff,
      objectPayloads: [{ objectDigest: chunked.objectDigest, bytes: payload }],
      searchIndexBytes: new Uint8Array(), riskReadMapBytes: riskMap(),
      expectedSearchIndexDigest: sha256Digest(new Uint8Array()), expectedRiskReadMapDigest: sha256Digest(riskMap()),
    })).toThrow(/changed files differ from exact review diff/u);
  });

  it("expands a large mandatory object into complete bounded chunk reads", () => {
    const payload = new Uint8Array(REVIEW_BUNDLE_LIMITS.chunkBytes + 1).fill(1);
    const chunked = chunkBundleObject(payload);
    const sealed = build({
      body: body(chunked.objectDigest, payload.byteLength, chunked.chunkDigests),
      objectPayloads: [{ objectDigest: chunked.objectDigest, bytes: payload }],
      searchIndexBytes: new Uint8Array(), riskReadMapBytes: riskMap(),
      expectedSearchIndexDigest: sha256Digest(new Uint8Array()), expectedRiskReadMapDigest: sha256Digest(riskMap()),
    }) as any;
    expect(sealed.mandatoryReadSet.entries.filter((entry: any) => entry.kind === "delivery-manifest"))
      .toEqual(chunked.chunkDigests.map((payloadDigest, ordinal) => ({ kind: "delivery-manifest", ordinal,
        parentDigest: chunked.objectDigest, payloadDigest })));
    for (const responseBytes of sealed.mandatoryResponses as Uint8Array[]) {
      const envelope = JSON.parse(new TextDecoder().decode(responseBytes));
      const result = JSON.parse(envelope.result.content[0].text);
      expect(result.rawByteLength).toBeLessThanOrEqual(REVIEW_BUNDLE_LIMITS.chunkBytes);
    }
  });

  it("derives bounded risk-sample chunk reads from the digest-bound risk map", () => {
    const exactReviewDiff = buildReviewDiffSet({ objectFormat: "sha1", baseObjectId: "1".repeat(40),
      headObjectId: "2".repeat(40), codecDigest: digest("codec"), rulesDigest: digest("rules"), before: [],
      after: [{ path: "src/auth/risk.ts", mode: "100644", bytes: new TextEncoder().encode("risk\n") }] });
    const evidenceBytes = canonicalBytes({ safe: "evidence" });
    const evidenceObject = chunkBundleObject(evidenceBytes);
    const diffEntry = exactReviewDiff.entries[0]!;
    const diffBytes = canonicalBytes(diffEntry.diffObject);
    const diffObject = chunkBundleObject(diffBytes);
    const sourceBytes = new TextEncoder().encode("risk\n");
    const sourceObject = chunkBundleObject(sourceBytes);
    const map = riskMap([{ groupId: "security-auth", totalCount: 1,
      samples: [{ objectDigest: diffEntry.diffObjectDigest, chunkOrdinal: 0 }] }]);
    const riskBody = body(evidenceObject.objectDigest, evidenceBytes.byteLength, evidenceObject.chunkDigests, sha256Digest(map));
    riskBody.repository.reviewDiffSetDigest = exactReviewDiff.reviewDiffSetDigest;
    riskBody.changedFiles = exactReviewDiff.entries.map(({ diffObject: _diffObject, ...entry }) => entry);
    riskBody.objects = [
      { objectDigest: evidenceObject.objectDigest, mediaType: "application/octet-stream", byteLength: evidenceBytes.byteLength,
        chunkDigests: evidenceObject.chunkDigests },
      { objectDigest: diffObject.objectDigest, mediaType: "application/vnd.agent-fabric.review-diff.v1+json", byteLength: diffBytes.byteLength,
        chunkDigests: diffObject.chunkDigests },
      { objectDigest: sourceObject.objectDigest, mediaType: "application/octet-stream", byteLength: sourceBytes.byteLength,
        chunkDigests: sourceObject.chunkDigests },
    ].sort((left, right) => left.objectDigest.localeCompare(right.objectDigest)).map((record, ordinal) => ({ ordinal, ...record }));
    const incompleteObjectPayloads = [{ objectDigest: evidenceObject.objectDigest, bytes: evidenceBytes },
      { objectDigest: diffObject.objectDigest, bytes: diffBytes }];
    expect(() => build({ body: { ...riskBody, objects: riskBody.objects
      .filter((record: any) => record.objectDigest !== sourceObject.objectDigest)
      .map((record: any, ordinal: number) => ({ ...record, ordinal })) },
      exactReviewDiff, objectPayloads: incompleteObjectPayloads,
      searchIndexBytes: new Uint8Array(), riskReadMapBytes: map,
      expectedSearchIndexDigest: sha256Digest(new Uint8Array()), expectedRiskReadMapDigest: sha256Digest(map) }))
      .toThrow(/afterObjectDigest must name a complete bundle object/u);
    const objectPayloads = [...incompleteObjectPayloads, { objectDigest: sourceObject.objectDigest, bytes: sourceBytes }];
    const sealed = build({ body: riskBody, exactReviewDiff, objectPayloads,
      searchIndexBytes: new Uint8Array(), riskReadMapBytes: map,
      expectedSearchIndexDigest: sha256Digest(new Uint8Array()), expectedRiskReadMapDigest: sha256Digest(map) }) as any;
    expect(sealed.mandatoryReadSet.entries.at(-1)).toMatchObject({
      kind: "risk-sample-chunk", parentDigest: diffObject.objectDigest, payloadDigest: diffObject.chunkDigests[0],
    });
    const emptySampleMap = riskMap([{ groupId: "security-auth", totalCount: 1, samples: [] }]);
    const emptyRiskBody = { ...riskBody, riskReadMapDigest: sha256Digest(emptySampleMap) };
    expect(() => build({ body: emptyRiskBody, exactReviewDiff, objectPayloads, searchIndexBytes: new Uint8Array(),
      riskReadMapBytes: emptySampleMap, expectedSearchIndexDigest: sha256Digest(new Uint8Array()),
      expectedRiskReadMapDigest: sha256Digest(emptySampleMap) })).toThrow(/risk read map differs from checked-in rules/u);
  });

  it("rejects risk membership and sample selection that differ from checked-in rules", () => {
    const after = [
      { path: "docs/readme.md", mode: "100644" as const, bytes: new TextEncoder().encode("docs\n") },
      { path: "src/auth/index.ts", mode: "100644" as const, bytes: new TextEncoder().encode("auth\n") },
      { path: "src/auth/token-secret.ts", mode: "100644" as const, bytes: new TextEncoder().encode("secret\n") },
    ];
    const exactReviewDiff = buildReviewDiffSet({ objectFormat: "sha1", baseObjectId: "1".repeat(40),
      headObjectId: "2".repeat(40), codecDigest: digest("codec"), rulesDigest: digest("rules"), before: [], after });
    const evidenceBytes = canonicalBytes({ safe: "evidence" });
    const evidenceObject = chunkBundleObject(evidenceBytes);
    const diffPayloads = exactReviewDiff.entries.map((entry) => ({ objectDigest: entry.diffObjectDigest,
      bytes: canonicalBytes(entry.diffObject) }));
    const sourcePayloads = after.map((entry) => ({ objectDigest: sha256Digest(entry.bytes), bytes: entry.bytes }));
    const objectPayloads = [{ objectDigest: evidenceObject.objectDigest, bytes: evidenceBytes }, ...diffPayloads, ...sourcePayloads];
    const diffDigests = new Set(diffPayloads.map((payload) => payload.objectDigest));
    const records = objectPayloads.map((payload) => {
      const chunked = chunkBundleObject(payload.bytes);
      return { objectDigest: payload.objectDigest, mediaType: diffDigests.has(payload.objectDigest)
        ? "application/vnd.agent-fabric.review-diff.v1+json" : "application/octet-stream",
      byteLength: payload.bytes.byteLength, chunkDigests: chunked.chunkDigests };
    }).sort((left, right) => left.objectDigest.localeCompare(right.objectDigest))
      .map((record, ordinal) => ({ ordinal, ...record }));
    const documentation = exactReviewDiff.entries.find((entry) => entry.path === "docs/readme.md")!;
    const wrongMap = riskMap([{ groupId: "generated-other", totalCount: 3,
      samples: [{ objectDigest: documentation.diffObjectDigest, chunkOrdinal: 0 }] }]);
    const changedBody = body(evidenceObject.objectDigest, evidenceBytes.byteLength, evidenceObject.chunkDigests,
      sha256Digest(wrongMap));
    changedBody.repository.reviewDiffSetDigest = exactReviewDiff.reviewDiffSetDigest;
    changedBody.changedFiles = exactReviewDiff.entries.map(({ diffObject: _diffObject, ...entry }) => entry);
    changedBody.objects = records;
    expect(() => build({ body: changedBody, exactReviewDiff, objectPayloads,
      searchIndexBytes: new Uint8Array(), riskReadMapBytes: wrongMap,
      expectedSearchIndexDigest: sha256Digest(new Uint8Array()), expectedRiskReadMapDigest: sha256Digest(wrongMap) }))
      .toThrow(/risk read map differs from checked-in rules/u);
    const highRiskSecurity = exactReviewDiff.entries.find((entry) => entry.path === "src/auth/token-secret.ts")!;
    const correctMap = riskMap([
      { groupId: "security-auth", totalCount: 2,
        samples: [{ objectDigest: highRiskSecurity.diffObjectDigest, chunkOrdinal: 0 }] },
      { groupId: "documentation", totalCount: 1,
        samples: [{ objectDigest: documentation.diffObjectDigest, chunkOrdinal: 0 }] },
    ]);
    const sealed = build({ body: { ...changedBody, riskReadMapDigest: sha256Digest(correctMap) }, exactReviewDiff, objectPayloads,
      searchIndexBytes: new Uint8Array(), riskReadMapBytes: correctMap,
      expectedSearchIndexDigest: sha256Digest(new Uint8Array()), expectedRiskReadMapDigest: sha256Digest(correctMap) }) as any;
    expect(sealed.mandatoryReadSet.entries.filter((entry: any) => entry.kind === "risk-sample-chunk")
      .map((entry: any) => entry.parentDigest).sort())
      .toEqual([documentation.diffObjectDigest, highRiskSecurity.diffObjectDigest].sort());
  });
});
