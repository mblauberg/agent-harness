import {
  canonicalBytes,
  canonicalString,
  digestCanonical,
  sha256Digest,
  type Sha256Digest,
} from "../canonical/index.js";
import {
  digestMandatoryReadSet,
  digestReviewBundleCoverage,
} from "../canonical/domains.js";
import { verifyReviewDiffSet, type ReviewDiffSet } from "../diff/index.js";

export const REVIEW_BUNDLE_LIMITS = {
  chunkBytes: 65_536,
  maximumChangedPaths: 4_096,
  maximumRequiredEvidence: 1_024,
  maximumObjects: 16_384,
  maximumChunks: 32_768,
  maximumObjectBytes: 16 * 1_024 * 1_024,
  maximumUniqueObjectBytes: 64 * 1_024 * 1_024,
  maximumBodyPages: 16,
  maximumBodyBytes: 1_024 * 1_024,
  maximumRootBytes: 49_152,
  maximumSearchIndexBytes: 4 * 1_024 * 1_024,
  maximumRiskMapBytes: 256 * 1_024,
  maximumMandatoryReads: 80,
  maximumMandatoryWireBytes: 6 * 1_024 * 1_024,
  maximumCombinedPortalCallsDirect: 112,
  maximumCombinedPortalCallsHelper: 128,
  maximumCombinedPortalBytes: 10 * 1_024 * 1_024,
  maximumSearchCalls: 16,
  maximumSearchBytes: 1 * 1_024 * 1_024,
  maximumRiskSampleChunks: 32,
  maximumRiskSampleBytes: 2 * 1_024 * 1_024,
  maximumPortalReadResponseBytes: 98_304,
} as const;

export interface ChunkedPayload {
  objectDigest: Sha256Digest;
  byteLength: number;
  chunkDigests: readonly Sha256Digest[];
  chunks: readonly Uint8Array[];
}

export type ReviewBundleMediaType =
  | "application/octet-stream"
  | "application/vnd.agent-fabric.review-bundle-root.v1+json"
  | "application/vnd.agent-fabric.review-bundle-body.v1+json"
  | "application/vnd.agent-fabric.review-diff.v1+json"
  | "application/vnd.agent-fabric.review-finding-page.v1+json"
  | "application/vnd.agent-fabric.review-finding-set.v1+json";

interface BundleObjectPayload {
  objectDigest: Sha256Digest;
  bytes: Uint8Array;
}

interface MandatoryRead {
  kind: "manifest-root" | "manifest-body-page" | "delivery-manifest" | "delivery-requirement-map" | "required-evidence" | "finding-set" | "finding-page" | "risk-sample-chunk";
  ordinal: number;
  parentDigest: Sha256Digest | null;
  payloadDigest: Sha256Digest;
}

export interface BuildReviewBundleInput {
  body: Readonly<Record<string, unknown>>;
  sealedBasis: Readonly<{
    reviewBasisDigest: Sha256Digest;
    requiredEvidence: readonly Readonly<Record<string, unknown>>[];
  }>;
  exactReviewDiff: ReviewDiffSet;
  objectPayloads: readonly BundleObjectPayload[];
  searchIndexBytes: Uint8Array;
  riskReadMapBytes: Uint8Array;
  expectedSearchIndexDigest: Sha256Digest;
  expectedRiskReadMapDigest: Sha256Digest;
}

const RISK_GROUPS = ["security-auth", "protocol-schema", "persistence-migration", "provider-adapter",
  "console-ui", "tests-evaluations", "documentation", "generated-other"] as const;
export const REVIEW_RISK_RULES_V1 = {
  schemaVersion: 1,
  groups: [
    { groupId: "security-auth", pathTerms: ["auth", "capability", "credential", "permission", "sandbox", "secret", "security", "trust"] },
    { groupId: "protocol-schema", pathTerms: ["mcp", "protocol", "schema", "wire"] },
    { groupId: "persistence-migration", pathTerms: ["database", "migration", "persistence", "sqlite", "storage", "store"] },
    { groupId: "provider-adapter", pathTerms: ["adapter", "agy", "claude", "codex", "cursor", "gemini", "provider"] },
    { groupId: "console-ui", pathTerms: ["agent-fabric-console", "console", "frontend", "terminal", "tui", "ui"] },
    { groupId: "tests-evaluations", pathTerms: ["eval", "evaluation", "fixture", "load", "performance", "test"] },
    { groupId: "documentation", pathTerms: ["docs/", "readme", ".md"] },
    { groupId: "generated-other", pathTerms: [] },
  ],
  operationScores: { deleted: 50, "mode-changed": 40, modified: 30, renamed: 20, added: 10 },
  sensitivityTerms: ["capability", "credential", "gate", "permission", "secret", "token"],
  samplesPerNonemptyGroup: 1,
  chunksPerSampledObject: 1,
} as const;
export const REVIEW_RISK_RULES_DIGEST = digestCanonical(REVIEW_RISK_RULES_V1);
const MANDATORY_KIND_ORDER: readonly MandatoryRead["kind"][] = ["manifest-root", "manifest-body-page", "delivery-manifest",
  "delivery-requirement-map", "required-evidence", "finding-set", "finding-page", "risk-sample-chunk"];
const PLACEHOLDER_BUNDLE_DIGEST = `sha256:${"0".repeat(64)}` as Sha256Digest;
const MAXIMUM_ID_SENTINEL = "Z".repeat(64);

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function rows(value: unknown, name: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value.map((entry, index) => object(entry, `${name}[${index}]`));
}

function split(bytes: Uint8Array): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += REVIEW_BUNDLE_LIMITS.chunkBytes) {
    chunks.push(bytes.slice(offset, Math.min(offset + REVIEW_BUNDLE_LIMITS.chunkBytes, bytes.byteLength)));
  }
  return chunks;
}

export function chunkBundleObject(bytes: Uint8Array): ChunkedPayload {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("bundle object bytes must be Uint8Array");
  if (bytes.byteLength > REVIEW_BUNDLE_LIMITS.maximumObjectBytes) throw new RangeError("bundle object byte limit exceeded");
  const chunks = split(bytes);
  return {
    objectDigest: sha256Digest(bytes),
    byteLength: bytes.byteLength,
    chunkDigests: chunks.map((chunk) => sha256Digest(chunk)),
    chunks,
  };
}

function equalStrings(actual: unknown, expected: readonly string[], name: string): void {
  if (!Array.isArray(actual) || actual.length !== expected.length
    || actual.some((entry, index) => entry !== expected[index])) throw new TypeError(`${name} mismatch`);
}

function assertOrdinalRows(entries: readonly Record<string, unknown>[], maximum: number, name: string): void {
  if (entries.length > maximum) throw new RangeError(`${name} count limit exceeded`);
  entries.forEach((entry, index) => {
    if (entry.ordinal !== index) throw new TypeError(`${name} ordinal must be contiguous`);
  });
}

function exactFields(value: Record<string, unknown>, fields: readonly string[], name: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new TypeError(`${name} has an invalid field set`);
  }
}

function riskPathMatches(path: string, term: string): boolean {
  if (term.includes("/") || term.includes(".")) return path.includes(term);
  return path.split(/[^a-z0-9]+/u).includes(term);
}

function parseRiskSamples(bytes: Uint8Array, payloadByDigest: ReadonlyMap<Sha256Digest, Uint8Array>,
  changedFiles: readonly Record<string, unknown>[]): MandatoryRead[] {
  const grouped = new Map<typeof RISK_GROUPS[number], Array<{ path: string; status: string; objectDigest: Sha256Digest; score: number }>>(
    RISK_GROUPS.map((groupId) => [groupId, []]),
  );
  for (const [index, file] of changedFiles.entries()) {
    if (typeof file.path !== "string" || typeof file.status !== "string" || typeof file.diffObjectDigest !== "string") {
      throw new TypeError(`changedFiles[${index}] risk identity is invalid`);
    }
    const path = file.path.toLowerCase();
    const rule = REVIEW_RISK_RULES_V1.groups.find((candidate) => candidate.pathTerms.length === 0
      || candidate.pathTerms.some((term) => riskPathMatches(path, term)))!;
    const sensitivity = REVIEW_RISK_RULES_V1.sensitivityTerms.filter((term) => riskPathMatches(path, term)).length * 100;
    const operation = REVIEW_RISK_RULES_V1.operationScores[file.status as keyof typeof REVIEW_RISK_RULES_V1.operationScores];
    if (operation === undefined) throw new TypeError(`changedFiles[${index}] risk operation is invalid`);
    grouped.get(rule.groupId)!.push({ path: file.path, status: file.status,
      objectDigest: file.diffObjectDigest as Sha256Digest, score: sensitivity + operation });
  }
  const derivedMap = { schemaVersion: 1, rulesDigest: REVIEW_RISK_RULES_DIGEST, groups: RISK_GROUPS.map((groupId) => {
    const candidates = grouped.get(groupId)!.sort((left, right) => right.score - left.score
      || Buffer.compare(Buffer.from(left.path), Buffer.from(right.path))
      || Buffer.compare(Buffer.from(left.objectDigest), Buffer.from(right.objectDigest)));
    return { groupId, totalCount: candidates.length, samples: candidates.length === 0 ? []
      : [{ objectDigest: candidates[0]!.objectDigest, chunkOrdinal: 0 }] };
  }) };
  if (!Buffer.from(canonicalBytes(derivedMap)).equals(Buffer.from(bytes))) {
    throw new TypeError("risk read map differs from checked-in rules");
  }
  const result: MandatoryRead[] = [];
  let sampledBytes = 0;
  derivedMap.groups.forEach((group) => {
    group.samples.forEach((sample) => {
      const payload = payloadByDigest.get(sample.objectDigest);
      if (payload === undefined) throw new TypeError("risk sample object is not in the bundle");
      const chunked = chunkBundleObject(payload);
      const chunk = chunked.chunks[sample.chunkOrdinal];
      const chunkDigest = chunked.chunkDigests[sample.chunkOrdinal];
      if (chunk === undefined || chunkDigest === undefined) throw new TypeError("risk sample chunk is not in the bundle");
      sampledBytes += chunk.byteLength;
      result.push({ kind: "risk-sample-chunk", ordinal: sample.chunkOrdinal,
        parentDigest: sample.objectDigest, payloadDigest: chunkDigest });
    });
  });
  if (result.length > REVIEW_BUNDLE_LIMITS.maximumRiskSampleChunks
    || sampledBytes > REVIEW_BUNDLE_LIMITS.maximumRiskSampleBytes) throw new RangeError("risk sample bound exceeded");
  return result.sort((left, right) => Buffer.compare(Buffer.from(left.parentDigest!), Buffer.from(right.parentDigest!))
    || left.ordinal - right.ordinal || Buffer.compare(Buffer.from(left.payloadDigest), Buffer.from(right.payloadDigest)));
}

function wireResponse(result: Readonly<Record<string, unknown>>): Uint8Array {
  const withDigest = { ...result, resultDigest: digestCanonical(result) };
  const response = new TextEncoder().encode(`${canonicalString({ jsonrpc: "2.0", id: MAXIMUM_ID_SENTINEL,
    result: { content: [{ type: "text", text: canonicalString(withDigest) }], isError: false } })}\n`);
  if (response.byteLength > REVIEW_BUNDLE_LIMITS.maximumPortalReadResponseBytes) {
    throw new RangeError("mandatory response wire byte limit exceeded");
  }
  return response;
}

export function buildReviewBundle(input: BuildReviewBundleInput): Readonly<Record<string, unknown>> {
  if (!(input.searchIndexBytes instanceof Uint8Array) || !(input.riskReadMapBytes instanceof Uint8Array)) {
    throw new TypeError("search and risk-map bytes must be Uint8Array");
  }
  if (input.searchIndexBytes.byteLength > REVIEW_BUNDLE_LIMITS.maximumSearchIndexBytes) throw new RangeError("search index byte limit exceeded");
  if (input.riskReadMapBytes.byteLength > REVIEW_BUNDLE_LIMITS.maximumRiskMapBytes) throw new RangeError("risk read-map byte limit exceeded");
  if (sha256Digest(input.searchIndexBytes) !== input.expectedSearchIndexDigest
    || sha256Digest(input.riskReadMapBytes) !== input.expectedRiskReadMapDigest) {
    throw new TypeError("search/risk copied digest mismatch");
  }
  const body = object(input.body, "reviewBundleBodyV1");
  if (Object.hasOwn(body, "coverageDigest")) throw new TypeError("unsealed body must omit coverageDigest");
  if (body.schemaVersion !== 1 || !Number.isSafeInteger(body.bundleGeneration) || (body.bundleGeneration as number) < 1) {
    throw new TypeError("bundle body identity is invalid");
  }
  if (body.bundleSearchIndexDigest !== input.expectedSearchIndexDigest || body.riskReadMapDigest !== input.expectedRiskReadMapDigest) {
    throw new TypeError("body search/risk copied digest mismatch");
  }

  const changedFiles = rows(body.changedFiles, "changedFiles");
  const requiredEvidence = rows(body.requiredEvidence, "requiredEvidence");
  const sealedBasis = object(input.sealedBasis, "sealedBasis");
  exactFields(sealedBasis, ["reviewBasisDigest", "requiredEvidence"], "sealedBasis");
  const delivery = object(body.delivery, "delivery");
  if (sealedBasis.reviewBasisDigest !== delivery.reviewBasisDigest) throw new TypeError("sealed basis digest mismatch");
  const sealedRequiredEvidence = rows(sealedBasis.requiredEvidence, "sealedBasis.requiredEvidence");
  assertOrdinalRows(sealedRequiredEvidence, REVIEW_BUNDLE_LIMITS.maximumRequiredEvidence, "sealed required evidence");
  if (canonicalString(requiredEvidence) !== canonicalString(sealedRequiredEvidence)) {
    throw new TypeError("required evidence differs from sealed basis");
  }
  verifyReviewDiffSet(input.exactReviewDiff);
  const exactChangedFiles = input.exactReviewDiff.entries.map(({ diffObject: _diffObject, ...entry }) => entry);
  if (canonicalString(changedFiles) !== canonicalString(exactChangedFiles)) {
    throw new TypeError("changed files differ from exact review diff");
  }
  const repository = object(body.repository, "repository");
  const diffBindings: ReadonlyArray<readonly [unknown, unknown]> = [
    [repository.objectFormat, input.exactReviewDiff.objectFormat],
    [repository.baseObjectId, input.exactReviewDiff.baseObjectId],
    [repository.headObjectId, input.exactReviewDiff.headObjectId],
    [repository.reviewDiffCodecDigest, input.exactReviewDiff.codecDigest],
    [repository.reviewDiffRulesDigest, input.exactReviewDiff.rulesDigest],
    [repository.reviewDiffSetDigest, input.exactReviewDiff.reviewDiffSetDigest],
  ];
  if (diffBindings.some(([actual, expected]) => actual !== expected)) throw new TypeError("repository differs from exact review diff");
  const objectRecords = rows(body.objects, "objects");
  assertOrdinalRows(changedFiles, REVIEW_BUNDLE_LIMITS.maximumChangedPaths, "changedFiles");
  assertOrdinalRows(requiredEvidence, REVIEW_BUNDLE_LIMITS.maximumRequiredEvidence, "requiredEvidence");
  assertOrdinalRows(objectRecords, REVIEW_BUNDLE_LIMITS.maximumObjects, "objects");
  if (objectRecords.some((record, index) => index > 0
    && Buffer.compare(Buffer.from(objectRecords[index - 1]!.objectDigest as string), Buffer.from(record.objectDigest as string)) >= 0)) {
    throw new TypeError("object records must be digest-ordered and unique");
  }

  const payloadByDigest = new Map<Sha256Digest, Uint8Array>();
  let totalObjectBytes = 0;
  let chunkCount = 0;
  for (const payload of input.objectPayloads) {
    if (payloadByDigest.has(payload.objectDigest)) throw new TypeError("duplicate object payload");
    const chunked = chunkBundleObject(payload.bytes);
    if (chunked.objectDigest !== payload.objectDigest) throw new TypeError("object payload digest mismatch");
    payloadByDigest.set(payload.objectDigest, payload.bytes);
    totalObjectBytes += payload.bytes.byteLength;
    chunkCount += chunked.chunks.length;
  }
  if (payloadByDigest.size !== objectRecords.length) throw new TypeError("object payload set is incomplete or extra");
  if (totalObjectBytes > REVIEW_BUNDLE_LIMITS.maximumUniqueObjectBytes) throw new RangeError("unique object byte limit exceeded");
  if (chunkCount > REVIEW_BUNDLE_LIMITS.maximumChunks) throw new RangeError("chunk count limit exceeded");
  objectRecords.forEach((record) => {
    if (typeof record.objectDigest !== "string" || !record.objectDigest.startsWith("sha256:")) throw new TypeError("objectDigest is invalid");
    const payload = payloadByDigest.get(record.objectDigest as Sha256Digest);
    if (payload === undefined) throw new TypeError("object payload is missing");
    const chunked = chunkBundleObject(payload);
    if (record.byteLength !== chunked.byteLength) throw new TypeError("object byteLength mismatch");
    equalStrings(record.chunkDigests, chunked.chunkDigests, "object chunkDigests");
  });

  const coverageValue = {
    schemaVersion: 1,
    repository: {
      objectFormat: repository.objectFormat,
      baseObjectId: repository.baseObjectId,
      headObjectId: repository.headObjectId,
      reviewDiffCodecDigest: repository.reviewDiffCodecDigest,
      reviewDiffRulesDigest: repository.reviewDiffRulesDigest,
      reviewDiffSetDigest: repository.reviewDiffSetDigest,
    },
    changedFiles,
    requiredEvidence,
    carriedFindingSet: body.carriedFindingSet,
    objects: objectRecords,
    bundleSearchIndexDigest: body.bundleSearchIndexDigest,
    riskReadMapDigest: body.riskReadMapDigest,
  };
  const coverage = digestReviewBundleCoverage(coverageValue);
  const sealedBody = { ...body, coverageDigest: coverage.digest };
  const bodyBytes = canonicalBytes(sealedBody);
  if (bodyBytes.byteLength > REVIEW_BUNDLE_LIMITS.maximumBodyBytes) throw new RangeError("manifest body byte limit exceeded");
  const pages = split(bodyBytes);
  if (pages.length === 0 || pages.length > REVIEW_BUNDLE_LIMITS.maximumBodyPages) throw new RangeError("manifest page count limit exceeded");
  const manifestBodyDigest = sha256Digest(bodyBytes);
  const root = {
    schemaVersion: 1,
    bodyMediaType: "application/vnd.agent-fabric.review-bundle-body.v1+json",
    bodyByteLength: bodyBytes.byteLength,
    manifestBodyDigest,
    coverageDigest: coverage.digest,
    pages: pages.map((page, ordinal) => ({ ordinal, pageDigest: sha256Digest(page), byteLength: page.byteLength })),
  };
  const rootBytes = canonicalBytes(root);
  if (rootBytes.byteLength > REVIEW_BUNDLE_LIMITS.maximumRootBytes) throw new RangeError("manifest root byte limit exceeded");
  const manifestRootDigest = sha256Digest(rootBytes);

  const carriedFindingSet = object(body.carriedFindingSet, "carriedFindingSet");
  const findingPages = rows(carriedFindingSet.pages, "carriedFindingSet.pages");
  const requireObject = (value: unknown, name: string): Sha256Digest => {
    if (typeof value !== "string" || !value.startsWith("sha256:") || !payloadByDigest.has(value as Sha256Digest)) {
      throw new TypeError(`${name} must name a complete bundle object`);
    }
    return value as Sha256Digest;
  };
  const chunkEntryIdentities = new Set<string>();
  const mandatoryObjectReads = (kind: MandatoryRead["kind"], objectDigest: Sha256Digest,
    parentDigest: Sha256Digest, ordinal: number): MandatoryRead[] => {
    const payload = payloadByDigest.get(objectDigest)!;
    if (payload.byteLength <= REVIEW_BUNDLE_LIMITS.chunkBytes) {
      return [{ kind, ordinal, parentDigest, payloadDigest: objectDigest }];
    }
    return chunkBundleObject(payload).chunkDigests.map((payloadDigest, chunkOrdinal) => {
      const entry = { kind, ordinal: chunkOrdinal, parentDigest: objectDigest, payloadDigest };
      chunkEntryIdentities.add(canonicalString(entry));
      return entry;
    });
  };
  changedFiles.forEach((file, index) => {
    requireObject(file.diffObjectDigest, `changedFiles[${index}].diffObjectDigest`);
    for (const field of ["beforeObjectDigest", "afterObjectDigest"] as const) {
      if (file[field] !== null) requireObject(file[field], `changedFiles[${index}].${field}`);
    }
  });
  const riskEntries = parseRiskSamples(input.riskReadMapBytes, payloadByDigest, changedFiles);
  riskEntries.forEach((entry) => chunkEntryIdentities.add(canonicalString(entry)));
  const mandatoryEntries: MandatoryRead[] = [
    { kind: "manifest-root" as const, ordinal: 0, parentDigest: null, payloadDigest: manifestRootDigest },
    ...pages.map((page, ordinal) => ({ kind: "manifest-body-page" as const, ordinal, parentDigest: manifestRootDigest, payloadDigest: sha256Digest(page) })),
    ...mandatoryObjectReads("delivery-manifest", requireObject(delivery.deliveryManifestObjectDigest, "delivery manifest"), manifestBodyDigest, 0),
    ...mandatoryObjectReads("delivery-requirement-map", requireObject(delivery.deliveryRequirementMapObjectDigest,
      "delivery requirement map"), manifestBodyDigest, 0),
    ...requiredEvidence.flatMap((evidence, ordinal) => mandatoryObjectReads("required-evidence",
      requireObject(evidence.objectDigest, `requiredEvidence[${ordinal}]`), manifestBodyDigest, ordinal)),
    ...mandatoryObjectReads("finding-set", requireObject(carriedFindingSet.findingSetDigest,
      "carried finding set"), manifestBodyDigest, 0),
    ...findingPages.flatMap((page, ordinal) => mandatoryObjectReads("finding-page",
      requireObject(page.pageDigest, `carried finding page[${ordinal}]`), carriedFindingSet.findingSetDigest as Sha256Digest, ordinal)),
    ...riskEntries,
  ].sort((left, right) => MANDATORY_KIND_ORDER.indexOf(left.kind) - MANDATORY_KIND_ORDER.indexOf(right.kind)
    || Buffer.compare(Buffer.from(left.parentDigest ?? ""), Buffer.from(right.parentDigest ?? ""))
    || left.ordinal - right.ordinal || Buffer.compare(Buffer.from(left.payloadDigest), Buffer.from(right.payloadDigest)));
  const mandatory = digestMandatoryReadSet({ schemaVersion: 1, entries: mandatoryEntries });
  if (mandatoryEntries.length > REVIEW_BUNDLE_LIMITS.maximumMandatoryReads) throw new RangeError("mandatory read count limit exceeded");
  const objectRecordByDigest = new Map(objectRecords.map((record) => [record.objectDigest as Sha256Digest, record]));
  const materializeMandatoryResponses = (bundleDigest: Sha256Digest): Uint8Array[] => mandatoryEntries.map((entry) => {
    let payload: Uint8Array;
    let kind: "manifest-root" | "manifest-body-page" | "object" | "chunk";
    let offset = 0;
    let mediaType: ReviewBundleMediaType;
    if (entry.kind === "manifest-root") {
      payload = rootBytes; kind = "manifest-root"; mediaType = "application/vnd.agent-fabric.review-bundle-root.v1+json";
    } else if (entry.kind === "manifest-body-page") {
      payload = pages[entry.ordinal]!; kind = "manifest-body-page"; mediaType = "application/vnd.agent-fabric.review-bundle-body.v1+json";
    } else if (chunkEntryIdentities.has(canonicalString(entry))) {
      const parentPayload = payloadByDigest.get(entry.parentDigest!);
      if (parentPayload === undefined) throw new TypeError("risk sample parent object is unavailable");
      payload = chunkBundleObject(parentPayload).chunks[entry.ordinal]!;
      if (payload === undefined) throw new TypeError("risk sample chunk is unavailable");
      kind = "chunk"; offset = entry.ordinal * REVIEW_BUNDLE_LIMITS.chunkBytes;
      mediaType = objectRecordByDigest.get(entry.parentDigest!)!.mediaType as ReviewBundleMediaType;
    } else {
      payload = payloadByDigest.get(entry.payloadDigest)!;
      if (payload === undefined) throw new TypeError("mandatory object payload is unavailable");
      kind = "object";
      mediaType = objectRecordByDigest.get(entry.payloadDigest)!.mediaType as ReviewBundleMediaType;
    }
    if (payload.byteLength > REVIEW_BUNDLE_LIMITS.chunkBytes) throw new RangeError("mandatory response payload byte limit exceeded");
    return wireResponse({ schemaVersion: 1, bundleDigest, kind,
      parentDigest: entry.parentDigest, payloadDigest: entry.payloadDigest, ordinal: entry.ordinal, offset,
      rawByteLength: payload.byteLength, mediaType, encoding: "base64", payload: Buffer.from(payload).toString("base64") });
  });
  const reservedResponses = materializeMandatoryResponses(PLACEHOLDER_BUNDLE_DIGEST);
  const mandatoryWireBytes = reservedResponses.reduce((sum, response) => sum + response.byteLength, 0);
  if (mandatoryWireBytes > REVIEW_BUNDLE_LIMITS.maximumMandatoryWireBytes) throw new RangeError("mandatory wire byte limit exceeded");
  const reference = {
    schemaVersion: 1,
    bundleGeneration: body.bundleGeneration,
    manifestBodyDigest,
    manifestRootDigest,
    coverageDigest: coverage.digest,
    bundleSearchIndexDigest: body.bundleSearchIndexDigest,
    riskReadMapDigest: body.riskReadMapDigest,
    mandatoryReadSetDigest: mandatory.digest,
    mandatoryReadCount: mandatoryEntries.length,
    mandatoryReadBytes: mandatoryWireBytes,
  };
  const referenceBytes = canonicalBytes(reference);
  const bundleDigest = sha256Digest(referenceBytes);
  const mandatoryResponses = materializeMandatoryResponses(bundleDigest);
  const materializedWireBytes = mandatoryResponses.reduce((sum, response) => sum + response.byteLength, 0);
  if (materializedWireBytes !== mandatoryWireBytes) throw new Error("materialized mandatory wire bytes differ from reservation");
  return {
    coverage,
    body: sealedBody,
    bodyBytes,
    pages,
    manifestBodyDigest,
    root,
    rootBytes,
    manifestRootDigest,
    mandatoryReadSet: { schemaVersion: 1, entries: mandatoryEntries },
    mandatoryReadSetDigest: mandatory.digest,
    mandatoryResponses,
    reference,
    referenceBytes,
    bundleDigest,
    objectCount: objectRecords.length,
    chunkCount,
    totalObjectBytes,
  };
}
