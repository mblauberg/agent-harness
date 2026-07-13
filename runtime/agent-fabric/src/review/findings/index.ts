import {
  canonicalBytes,
  digestCanonical,
  type Sha256Digest,
} from "../canonical/index.js";

export type FindingSeverity = "P0" | "P1" | "P2";
export type RepairKind = "repository-source" | "registered-evidence" | "mixed";

export interface FindingEvidenceCurrency {
  evidenceRef: string;
  evidenceRevision: number;
  contentDigest: Sha256Digest;
}

export interface SafeFindingInput {
  findingId: string;
  severity: FindingSeverity;
  summary: string;
  evidence: string;
  originTargetGeneration: number;
  originActionRef: { adapterId: string; actionId: string };
  originResultDigest: Sha256Digest;
  originDeliveryManifest: { artifactRef: string; artifactRevision: number };
  originDeliveryReviewBasisDigest: Sha256Digest;
  originBundleDigest: Sha256Digest;
  repairCurrency: {
    kind: RepairKind;
    originRepositorySourceStateDigest: Sha256Digest | null;
    evidenceRefs: readonly FindingEvidenceCurrency[];
  };
}

export interface SafeFinding extends SafeFindingInput {
  findingDigest: Sha256Digest;
}

export interface FindingPage {
  schemaVersion: 1;
  members: readonly SafeFinding[];
}

export interface FindingSet {
  schemaVersion: 1;
  findingCount: number;
  pages: readonly {
    ordinal: number;
    pageDigest: Sha256Digest;
    memberCount: number;
    firstFindingDigest: Sha256Digest;
    lastFindingDigest: Sha256Digest;
  }[];
}

export interface BuiltFindingSet {
  findingSet: FindingSet;
  findingSetDigest: Sha256Digest;
  pages: readonly { page: FindingPage; pageDigest: Sha256Digest; canonicalBytes: Uint8Array }[];
}

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PAGE_LIMIT = 65_536;
const ROOT_RESERVATION_BYTES = 49_152;

function utf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function assertSafeText(value: string, maximumBytes: number, label: string): void {
  const length = utf8Length(value);
  if (length === 0 || length > maximumBytes) throw new TypeError(`${label} exceeds its byte bound`);
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)
      || (codePoint >= 0x202a && codePoint <= 0x202e)
      || (codePoint >= 0x2066 && codePoint <= 0x2069)) {
      throw new TypeError(`${label} contains unsafe control text`);
    }
  }
}

function assertDigest(value: string, label: string): asserts value is Sha256Digest {
  if (!DIGEST_PATTERN.test(value)) throw new TypeError(`${label} is not a SHA-256 digest`);
}

function normaliseEvidenceRefs(values: readonly FindingEvidenceCurrency[]): FindingEvidenceCurrency[] {
  const result = values.map((value) => {
    if (value.evidenceRef.length === 0 || !Number.isSafeInteger(value.evidenceRevision) || value.evidenceRevision < 1) {
      throw new TypeError("finding evidence currency is invalid");
    }
    assertDigest(value.contentDigest, "finding evidence content digest");
    return { ...value };
  }).sort((left, right) => compareUtf8(left.evidenceRef, right.evidenceRef)
    || left.evidenceRevision - right.evidenceRevision
    || compareUtf8(left.contentDigest, right.contentDigest));
  if (result.some((value, index) => index > 0 && value.evidenceRef === result[index - 1]!.evidenceRef)) {
    throw new TypeError("finding evidence refs must be unique");
  }
  return result;
}

export function createSafeFinding(input: SafeFindingInput): SafeFinding {
  if (!/^[A-Za-z0-9._:-]+$/u.test(input.findingId) || utf8Length(input.findingId) > 64) {
    throw new TypeError("finding ID is invalid");
  }
  assertSafeText(input.summary, 256, "finding summary");
  assertSafeText(input.evidence, 768, "finding evidence");
  if (!Number.isSafeInteger(input.originTargetGeneration) || input.originTargetGeneration < 1) {
    throw new TypeError("finding origin target generation is invalid");
  }
  if (!Number.isSafeInteger(input.originDeliveryManifest.artifactRevision)
    || input.originDeliveryManifest.artifactRevision < 1) {
    throw new TypeError("finding origin manifest revision is invalid");
  }
  assertDigest(input.originResultDigest, "origin result digest");
  assertDigest(input.originDeliveryReviewBasisDigest, "origin review basis digest");
  assertDigest(input.originBundleDigest, "origin bundle digest");
  const evidenceRefs = normaliseEvidenceRefs(input.repairCurrency.evidenceRefs);
  if (input.repairCurrency.kind === "repository-source") {
    if (evidenceRefs.length !== 0 || input.repairCurrency.originRepositorySourceStateDigest === null) {
      throw new TypeError("repository-source repair currency must contain source only");
    }
  } else if (evidenceRefs.length === 0) {
    throw new TypeError("evidence repair currency must contain evidence refs");
  }
  if (input.repairCurrency.kind === "registered-evidence"
    && input.repairCurrency.originRepositorySourceStateDigest !== null) {
    throw new TypeError("registered-evidence repair currency cannot contain source");
  }
  if (input.repairCurrency.kind === "mixed"
    && input.repairCurrency.originRepositorySourceStateDigest === null) {
    throw new TypeError("mixed repair currency requires repository source");
  }
  if (input.repairCurrency.originRepositorySourceStateDigest !== null) {
    assertDigest(input.repairCurrency.originRepositorySourceStateDigest, "origin repository source digest");
  }
  const identity: SafeFindingInput = {
    ...input,
    originActionRef: { ...input.originActionRef },
    originDeliveryManifest: { ...input.originDeliveryManifest },
    repairCurrency: { ...input.repairCurrency, evidenceRefs },
  };
  return { ...identity, findingDigest: digestCanonical(identity) };
}

export function buildFindingSet(members: readonly SafeFinding[]): BuiltFindingSet {
  const ordered = [...members].sort((left, right) => compareUtf8(left.findingDigest, right.findingDigest));
  const findingIds = new Set<string>();
  for (let index = 0; index < ordered.length; index += 1) {
    const value = ordered[index]!;
    const { findingDigest, ...identity } = value;
    if (digestCanonical(identity) !== findingDigest) throw new TypeError("finding digest mismatch");
    if (findingIds.has(value.findingId) || (index > 0 && findingDigest === ordered[index - 1]!.findingDigest)) {
      throw new TypeError("finding set members must be unique");
    }
    findingIds.add(value.findingId);
  }

  const pages: Array<{ page: FindingPage; pageDigest: Sha256Digest; canonicalBytes: Uint8Array }> = [];
  let current: SafeFinding[] = [];
  const commit = (): void => {
    if (current.length === 0) return;
    const page: FindingPage = { schemaVersion: 1, members: current };
    const encoded = canonicalBytes(page);
    if (encoded.byteLength > PAGE_LIMIT) throw new TypeError("finding page exceeds 65,536 bytes");
    pages.push({ page, pageDigest: digestCanonical(page), canonicalBytes: encoded });
    current = [];
  };
  for (const value of ordered) {
    const candidate: FindingPage = { schemaVersion: 1, members: [...current, value] };
    if (canonicalBytes(candidate).byteLength > PAGE_LIMIT) {
      commit();
      const single: FindingPage = { schemaVersion: 1, members: [value] };
      if (canonicalBytes(single).byteLength > PAGE_LIMIT) throw new TypeError("finding record cannot fit a whole page");
    }
    current.push(value);
  }
  commit();
  const findingSet: FindingSet = {
    schemaVersion: 1,
    findingCount: ordered.length,
    pages: pages.map(({ page, pageDigest }, ordinal) => ({
      ordinal,
      pageDigest,
      memberCount: page.members.length,
      firstFindingDigest: page.members[0]!.findingDigest,
      lastFindingDigest: page.members.at(-1)!.findingDigest,
    })),
  };
  const result = { findingSet, findingSetDigest: digestCanonical(findingSet), pages };
  verifyFindingSet(result);
  return result;
}

export function verifyFindingSet(value: BuiltFindingSet): void {
  if (value.findingSet.pages.length !== value.pages.length) throw new TypeError("finding page count mismatch");
  let total = 0;
  let priorDigest: Sha256Digest | null = null;
  for (let ordinal = 0; ordinal < value.pages.length; ordinal += 1) {
    const stored = value.pages[ordinal]!;
    const reference = value.findingSet.pages[ordinal]!;
    const encoded = canonicalBytes(stored.page);
    if (encoded.byteLength > PAGE_LIMIT || !Buffer.from(encoded).equals(Buffer.from(stored.canonicalBytes))) {
      throw new TypeError("finding page canonical bytes mismatch");
    }
    if (digestCanonical(stored.page) !== stored.pageDigest || reference.pageDigest !== stored.pageDigest) {
      throw new TypeError("finding page digest mismatch");
    }
    if (reference.ordinal !== ordinal || reference.memberCount !== stored.page.members.length) {
      throw new TypeError("finding page ordinal/member count mismatch");
    }
    if (stored.page.members.length === 0) throw new TypeError("finding pages must be nonempty");
    for (const member of stored.page.members) {
      if (priorDigest !== null && member.findingDigest <= priorDigest) {
        throw new TypeError("finding page member order is not strict");
      }
      priorDigest = member.findingDigest;
      total += 1;
    }
    if (reference.firstFindingDigest !== stored.page.members[0]!.findingDigest
      || reference.lastFindingDigest !== stored.page.members.at(-1)!.findingDigest) {
      throw new TypeError("finding page range mismatch");
    }
  }
  if (total !== value.findingSet.findingCount) throw new TypeError("finding set count mismatch");
  if (digestCanonical(value.findingSet) !== value.findingSetDigest) throw new TypeError("finding set digest mismatch");
}

export function planFindingWindow(input: Readonly<{
  mode: "normal" | "resolution-only";
  priorOpenFindingDigests: readonly Sha256Digest[];
  resolutionWindowDigests?: readonly Sha256Digest[];
  availableBytes: number;
}>): Readonly<{
  status: "admitted" | "finding-capacity-exhausted";
  maximumNewFindings: 0 | 32;
  requiredBytes: number;
  resolutionWindowDigests: readonly Sha256Digest[];
}> {
  if (!Number.isSafeInteger(input.availableBytes) || input.availableBytes < 0) {
    throw new TypeError("available finding capacity must be nonnegative");
  }
  const prior = [...input.priorOpenFindingDigests].sort();
  if (new Set(prior).size !== prior.length) throw new TypeError("prior open finding digests must be unique");
  prior.forEach((value) => assertDigest(value, "prior open finding digest"));
  const maximumNewFindings = input.mode === "normal" ? 32 : 0;
  const requiredBytes = input.mode === "normal"
    ? (32 * PAGE_LIMIT) + (2 * ROOT_RESERVATION_BYTES)
    : 2 * ROOT_RESERVATION_BYTES;
  let resolutionWindowDigests: Sha256Digest[] = [];
  if (input.mode === "resolution-only") {
    resolutionWindowDigests = [...(input.resolutionWindowDigests ?? [])].sort();
    if (resolutionWindowDigests.length === 0 || resolutionWindowDigests.length > 32
      || new Set(resolutionWindowDigests).size !== resolutionWindowDigests.length
      || resolutionWindowDigests.some((value) => !prior.includes(value))) {
      throw new TypeError("resolution-only window must name 1..32 unique prior open findings");
    }
  } else if ((input.resolutionWindowDigests?.length ?? 0) !== 0) {
    throw new TypeError("normal finding window cannot name resolution-only digests");
  }
  return {
    status: input.availableBytes >= requiredBytes ? "admitted" : "finding-capacity-exhausted",
    maximumNewFindings,
    requiredBytes,
    resolutionWindowDigests,
  };
}

export function isFindingRepairEligible(
  finding: SafeFinding,
  current: Readonly<{
    deliveryManifest: { artifactRef: string; artifactRevision: number };
    deliveryReviewBasisDigest: Sha256Digest;
    bundleDigest: Sha256Digest;
    repositorySourceStateDigest: Sha256Digest;
    evidenceRefs: readonly FindingEvidenceCurrency[];
  }>,
): boolean {
  if (current.deliveryManifest.artifactRef !== finding.originDeliveryManifest.artifactRef
    || current.deliveryManifest.artifactRevision <= finding.originDeliveryManifest.artifactRevision
    || current.deliveryReviewBasisDigest === finding.originDeliveryReviewBasisDigest
    || current.bundleDigest === finding.originBundleDigest) return false;

  const kind = finding.repairCurrency.kind;
  if ((kind === "repository-source" || kind === "mixed")
    && current.repositorySourceStateDigest === finding.repairCurrency.originRepositorySourceStateDigest) return false;
  if (kind === "registered-evidence" || kind === "mixed") {
    const currentByRef = new Map(current.evidenceRefs.map((value) => [value.evidenceRef, value]));
    for (const origin of finding.repairCurrency.evidenceRefs) {
      const next = currentByRef.get(origin.evidenceRef);
      if (next === undefined || next.evidenceRevision <= origin.evidenceRevision
        || next.contentDigest === origin.contentDigest) return false;
    }
  }
  return true;
}
