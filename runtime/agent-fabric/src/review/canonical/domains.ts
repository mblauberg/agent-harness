import {
  canonicalString,
  canonicalWithout,
  sha256Digest,
  type Sha256Digest,
} from "./index.js";

export interface CanonicalDomainDigest {
  preimage: string;
  digest: Sha256Digest;
}

type JsonObject = Record<string, unknown>;

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const ROLE_RANK = [
  "accepted-scope", "binding-source", "requirement-map", "test", "evaluation", "load",
  "migration", "generated-contract", "gate-decision", "coordination-gate-snapshot",
] as const;
const SOURCE_ROLE_RANK = ["spec", "adr", "decision"] as const;
const MANDATORY_KIND_RANK = [
  "manifest-root", "manifest-body-page", "delivery-manifest", "delivery-requirement-map",
  "required-evidence", "finding-set", "finding-page", "risk-sample-chunk",
] as const;

function object(value: unknown, name: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as JsonObject;
}

function exact(value: JsonObject, fields: readonly string[], name: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...fields].sort();
  if (actual.length !== wanted.length || actual.some((field, index) => field !== wanted[index])) {
    throw new TypeError(`${name} has an invalid field set`);
  }
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value;
}

function positive(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError(`${name} must be positive`);
}

function string(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${name} must be nonempty`);
}

function digest(value: unknown, name: string): asserts value is Sha256Digest {
  if (typeof value !== "string" || !DIGEST.test(value)) throw new TypeError(`${name} must be a SHA-256 digest`);
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function domain(value: unknown): CanonicalDomainDigest {
  const preimage = canonicalString(value);
  return { preimage, digest: sha256Digest(preimage) };
}

function assertEvidenceRef(value: unknown, name: string): JsonObject {
  const row = object(value, name);
  exact(row, ["evidenceRef", "evidenceRevision", "contentDigest"], name);
  string(row.evidenceRef, `${name}.evidenceRef`);
  positive(row.evidenceRevision, `${name}.evidenceRevision`);
  digest(row.contentDigest, `${name}.contentDigest`);
  return row;
}

function compareEvidenceRefs(left: JsonObject, right: JsonObject): number {
  return compareUtf8(left.evidenceRef as string, right.evidenceRef as string)
    || (left.evidenceRevision as number) - (right.evidenceRevision as number)
    || compareUtf8(left.contentDigest as string, right.contentDigest as string);
}

function assertSortedUnique(rows: readonly JsonObject[], compare: (left: JsonObject, right: JsonObject) => number, name: string): void {
  for (let index = 1; index < rows.length; index += 1) {
    if (compare(rows[index - 1]!, rows[index]!) >= 0) throw new TypeError(`${name} order must be strict and unique`);
  }
}

export function digestDeliveryRequirementMap(value: unknown): Readonly<CanonicalDomainDigest & {
  closurePreimage: string;
  closureDigest: Sha256Digest;
}> {
  const map = object(value, "deliveryRequirementMapV1");
  exact(map, ["schemaVersion", "artifactKind", "projectSessionId", "coordinationRunId", "deliveryRunId",
    "mapGeneration", "closureDigest", "catalogueDigest", "acceptedScope", "bindingSources", "requirements"],
  "deliveryRequirementMapV1");
  if (map.schemaVersion !== 1 || map.artifactKind !== "delivery-requirement-map.v1") throw new TypeError("requirement-map identity is invalid");
  for (const key of ["projectSessionId", "coordinationRunId", "deliveryRunId"] as const) string(map[key], key);
  positive(map.mapGeneration, "mapGeneration");
  digest(map.closureDigest, "closureDigest");
  digest(map.catalogueDigest, "catalogueDigest");
  const scope = object(map.acceptedScope, "acceptedScope");
  exact(scope, ["artifactRef", "artifactRevision", "contentDigest"], "acceptedScope");
  string(scope.artifactRef, "acceptedScope.artifactRef");
  positive(scope.artifactRevision, "acceptedScope.artifactRevision");
  digest(scope.contentDigest, "acceptedScope.contentDigest");

  const sources = array(map.bindingSources, "bindingSources").map((entry, index) => {
    const row = object(entry, `bindingSources[${index}]`);
    exact(row, ["role", "artifactRef", "artifactRevision", "contentDigest", "requirementIds"], `bindingSources[${index}]`);
    if (!SOURCE_ROLE_RANK.includes(row.role as typeof SOURCE_ROLE_RANK[number])) throw new TypeError("binding-source role is invalid");
    string(row.artifactRef, "binding-source artifactRef");
    positive(row.artifactRevision, "binding-source artifactRevision");
    digest(row.contentDigest, "binding-source contentDigest");
    const ids = array(row.requirementIds, "binding-source requirementIds");
    if (ids.length === 0 || ids.some((id) => typeof id !== "string" || id.length === 0)) throw new TypeError("binding-source requirementIds are invalid");
    if (ids.some((id, i) => i > 0 && compareUtf8(ids[i - 1] as string, id as string) >= 0)) throw new TypeError("binding-source requirementIds order must be strict and unique");
    return row;
  });
  assertSortedUnique(sources, (left, right) => SOURCE_ROLE_RANK.indexOf(left.role as typeof SOURCE_ROLE_RANK[number])
    - SOURCE_ROLE_RANK.indexOf(right.role as typeof SOURCE_ROLE_RANK[number])
    || compareUtf8(left.artifactRef as string, right.artifactRef as string)
    || (left.artifactRevision as number) - (right.artifactRevision as number), "bindingSources");

  const requirements = array(map.requirements, "requirements").map((entry, index) => {
    const row = object(entry, `requirements[${index}]`);
    exact(row, ["requirementId", "sourceRef", "disposition", "evidenceRefs"], `requirements[${index}]`);
    string(row.requirementId, "requirementId");
    string(row.sourceRef, "sourceRef");
    if (row.disposition !== "proved") throw new TypeError("requirement disposition must be proved");
    const refs = array(row.evidenceRefs, "evidenceRefs").map((ref, refIndex) => assertEvidenceRef(ref, `evidenceRefs[${refIndex}]`));
    if (refs.length === 0) throw new TypeError("requirement evidenceRefs must be nonempty");
    assertSortedUnique(refs, compareEvidenceRefs, "evidenceRefs");
    return row;
  });
  assertSortedUnique(requirements, (left, right) => compareUtf8(left.requirementId as string, right.requirementId as string), "requirements");

  const closurePreimage = canonicalWithout(map, ["mapGeneration", "closureDigest"]);
  const closureDigest = sha256Digest(closurePreimage);
  const complete = { ...map, closureDigest };
  const result = domain(complete);
  return { ...result, closurePreimage, closureDigest };
}

export function digestDeliveryEvidenceClosure(value: unknown): CanonicalDomainDigest {
  const closure = object(value, "deliveryEvidenceClosureV1");
  exact(closure, ["schemaVersion", "projectSessionId", "coordinationRunId", "deliveryRunId", "entries"], "deliveryEvidenceClosureV1");
  if (closure.schemaVersion !== 1) throw new TypeError("evidence-closure schemaVersion is invalid");
  for (const key of ["projectSessionId", "coordinationRunId", "deliveryRunId"] as const) string(closure[key], key);
  const rows = array(closure.entries, "entries").map((entry, index) => {
    const row = object(entry, `entries[${index}]`);
    exact(row, ["role", "evidenceRef", "evidenceRevision", "contentDigest", "status"], `entries[${index}]`);
    if (!ROLE_RANK.includes(row.role as typeof ROLE_RANK[number])) throw new TypeError("evidence role is invalid");
    string(row.evidenceRef, "evidenceRef");
    positive(row.evidenceRevision, "evidenceRevision");
    digest(row.contentDigest, "contentDigest");
    if (!["pass", "approved", "current"].includes(row.status as string)) throw new TypeError("evidence status is invalid");
    return row;
  });
  assertSortedUnique(rows, (left, right) => ROLE_RANK.indexOf(left.role as typeof ROLE_RANK[number])
    - ROLE_RANK.indexOf(right.role as typeof ROLE_RANK[number])
    || compareUtf8(left.evidenceRef as string, right.evidenceRef as string)
    || (left.evidenceRevision as number) - (right.evidenceRevision as number)
    || compareUtf8(left.contentDigest as string, right.contentDigest as string), "evidence entries");
  return domain(closure);
}

export function digestRepositorySourceState(value: unknown): CanonicalDomainDigest {
  const source = object(value, "repositorySourceStateV1");
  exact(source, ["schemaVersion", "objectFormat", "baseObjectId", "headObjectId", "headTreeId", "indexTreeId", "worktreeState"], "repositorySourceStateV1");
  if (source.schemaVersion !== 1 || !["sha1", "sha256"].includes(source.objectFormat as string) || source.worktreeState !== "clean") {
    throw new TypeError("repository source-state identity is invalid");
  }
  const length = source.objectFormat === "sha1" ? 40 : 64;
  const objectId = new RegExp(`^[0-9a-f]{${length}}$`, "u");
  for (const key of ["baseObjectId", "headObjectId", "headTreeId", "indexTreeId"] as const) {
    if (typeof source[key] !== "string" || !objectId.test(source[key] as string)) throw new TypeError(`${key} is not a full object ID`);
  }
  if (source.headTreeId !== source.indexTreeId) throw new TypeError("clean source state requires equal HEAD and index trees");
  return domain(source);
}

export function digestReviewBundleCoverage(value: unknown): CanonicalDomainDigest {
  const coverage = object(value, "reviewBundleCoverageV1");
  exact(coverage, ["schemaVersion", "repository", "changedFiles", "requiredEvidence", "carriedFindingSet", "objects", "bundleSearchIndexDigest", "riskReadMapDigest"], "reviewBundleCoverageV1");
  if (coverage.schemaVersion !== 1) throw new TypeError("coverage schemaVersion is invalid");
  digest(coverage.bundleSearchIndexDigest, "bundleSearchIndexDigest");
  digest(coverage.riskReadMapDigest, "riskReadMapDigest");
  const repository = object(coverage.repository, "repository");
  exact(repository, ["objectFormat", "baseObjectId", "headObjectId", "reviewDiffCodecDigest",
    "reviewDiffRulesDigest", "reviewDiffSetDigest"], "coverage.repository");
  for (const key of ["reviewDiffCodecDigest", "reviewDiffRulesDigest", "reviewDiffSetDigest"] as const) digest(repository[key], key);
  for (const name of ["changedFiles", "requiredEvidence", "objects"] as const) {
    const rows = array(coverage[name], name).map((row, index) => object(row, `${name}[${index}]`));
    rows.forEach((row, index) => {
      if (row.ordinal !== index) throw new TypeError(`${name} ordinal must be contiguous`);
    });
  }
  object(coverage.carriedFindingSet, "carriedFindingSet");
  return domain(coverage);
}

export function digestMandatoryReadSet(value: unknown): CanonicalDomainDigest {
  const set = object(value, "mandatoryReadSetV1");
  exact(set, ["schemaVersion", "entries"], "mandatoryReadSetV1");
  if (set.schemaVersion !== 1) throw new TypeError("mandatory-read schemaVersion is invalid");
  const rows = array(set.entries, "entries").map((entry, index) => {
    const row = object(entry, `entries[${index}]`);
    exact(row, ["kind", "ordinal", "parentDigest", "payloadDigest"], `entries[${index}]`);
    if (!MANDATORY_KIND_RANK.includes(row.kind as typeof MANDATORY_KIND_RANK[number])) throw new TypeError("mandatory-read kind is invalid");
    if (!Number.isSafeInteger(row.ordinal) || (row.ordinal as number) < 0) throw new TypeError("mandatory-read ordinal is invalid");
    if ((row.kind === "manifest-root") !== (row.parentDigest === null)) throw new TypeError("parentDigest is null only for manifest-root");
    if (row.parentDigest !== null) digest(row.parentDigest, "parentDigest");
    digest(row.payloadDigest, "payloadDigest");
    return row;
  });
  assertSortedUnique(rows, (left, right) => MANDATORY_KIND_RANK.indexOf(left.kind as typeof MANDATORY_KIND_RANK[number])
    - MANDATORY_KIND_RANK.indexOf(right.kind as typeof MANDATORY_KIND_RANK[number])
    || compareUtf8((left.parentDigest as string | null) ?? "", (right.parentDigest as string | null) ?? "")
    || (left.ordinal as number) - (right.ordinal as number)
    || compareUtf8(left.payloadDigest as string, right.payloadDigest as string), "mandatory entries");
  return domain(set);
}

export function digestReviewSubject(value: unknown): CanonicalDomainDigest {
  const subject = object(value, "reviewSubjectV1");
  exact(subject, ["schemaVersion", "taskId", "reviewedArtifactRef", "publicationLineageDigest",
    "deliveryReviewBasisRevision", "deliveryReviewBasisDigest", "repositorySourceStateDigest",
    "reviewBundleBinding", "completionProfile"], "reviewSubjectV1");
  if (subject.schemaVersion !== 1) throw new TypeError("review-subject schemaVersion is invalid");
  string(subject.taskId, "taskId");
  string(subject.reviewedArtifactRef, "reviewedArtifactRef");
  digest(subject.publicationLineageDigest, "publicationLineageDigest");
  positive(subject.deliveryReviewBasisRevision, "deliveryReviewBasisRevision");
  digest(subject.deliveryReviewBasisDigest, "deliveryReviewBasisDigest");
  digest(subject.repositorySourceStateDigest, "repositorySourceStateDigest");
  const binding = object(subject.reviewBundleBinding, "reviewBundleBinding");
  exact(binding, ["bundleGeneration", "bundleDigest", "manifestBodyDigest", "manifestRootDigest", "coverageDigest",
    "bundleSearchIndexDigest", "riskReadMapDigest", "mandatoryReadSetDigest", "mandatoryReadCount",
    "mandatoryReadBytes", "objectCount", "chunkCount", "totalObjectBytes"], "reviewBundleBinding");
  positive(binding.bundleGeneration, "bundleGeneration");
  for (const key of ["bundleDigest", "manifestBodyDigest", "manifestRootDigest", "coverageDigest", "bundleSearchIndexDigest", "riskReadMapDigest", "mandatoryReadSetDigest"] as const) digest(binding[key], key);
  for (const key of ["mandatoryReadCount", "mandatoryReadBytes", "objectCount", "chunkCount", "totalObjectBytes"] as const) {
    if (!Number.isSafeInteger(binding[key]) || (binding[key] as number) < 0) throw new TypeError(`${key} is invalid`);
  }
  if ((binding.mandatoryReadCount as number) < 1 || (binding.mandatoryReadCount as number) > 80
    || (binding.mandatoryReadBytes as number) < 1 || (binding.mandatoryReadBytes as number) > 6_291_456) {
    throw new TypeError("mandatory read budget is invalid");
  }
  const profile = object(subject.completionProfile, "completionProfile");
  exact(profile, ["profileId", "profileSchemaDigest", "resolvedProfileDigest", "slots"], "completionProfile");
  string(profile.profileId, "profileId");
  digest(profile.profileSchemaDigest, "profileSchemaDigest");
  digest(profile.resolvedProfileDigest, "resolvedProfileDigest");
  if (array(profile.slots, "completionProfile.slots").length !== 4) throw new TypeError("completion profile must contain four slots");
  return domain(subject);
}
