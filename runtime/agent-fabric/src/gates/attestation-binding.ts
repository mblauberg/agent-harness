import {
  parseArtifactRef,
  parseReleaseBinding,
  parseSha256Digest,
  type ArtifactRef,
  type ReleaseBinding,
  type Sha256Digest,
} from "@local/agent-fabric-protocol";

import { ProjectFabricCoreError } from "../project-session/contracts.js";

type GateDigestBinding = Readonly<{
  evidenceRefs: readonly ArtifactRef[];
  releaseBinding?: ReleaseBinding;
}>;

export function canonicalGateAttestationDigests(binding: GateDigestBinding): Sha256Digest[] {
  const ordered = binding.evidenceRefs.map((reference) => reference.digest);
  if (binding.releaseBinding !== undefined) {
    ordered.push(binding.releaseBinding.acceptedDeliveryReceiptRef.digest);
    ordered.push(binding.releaseBinding.artifactDigest);
  }
  const unique = [...new Set(ordered)];
  if (unique.length === 0) {
    throw new ProjectFabricCoreError(
      "CONFLICT",
      "conversational gate resolution requires at least one gate-bound artifact digest",
    );
  }
  return unique;
}

export function canonicalStoredGateAttestationDigests(
  evidenceRefsJson: string,
  releaseBindingJson: string | null,
): Sha256Digest[] {
  const storedEvidence: unknown = JSON.parse(evidenceRefsJson);
  if (!Array.isArray(storedEvidence)) {
    throw new ProjectFabricCoreError("CONFLICT", "stored gate evidence binding is invalid");
  }
  const evidenceRefs = storedEvidence.map((reference, index) => parseArtifactRef(
    reference,
    `scopedGate.evidenceRefs[${String(index)}]`,
  ));
  const releaseBinding = releaseBindingJson === null
    ? undefined
    : parseReleaseBinding(JSON.parse(releaseBindingJson));
  return canonicalGateAttestationDigests({
    evidenceRefs,
    ...(releaseBinding === undefined ? {} : { releaseBinding }),
  });
}

export function parseStoredAttestationDigests(value: string): Sha256Digest[] {
  const stored: unknown = JSON.parse(value);
  if (!Array.isArray(stored) || stored.length === 0) {
    throw new ProjectFabricCoreError("STALE_REVISION", "stored input attestation digest binding is invalid");
  }
  return stored.map((digest, index) => parseSha256Digest(
    digest,
    `operatorInputAttestation.artifactDigests[${String(index)}]`,
  ));
}

export function assertExactGateAttestationDigests(
  expected: readonly Sha256Digest[],
  actual: readonly Sha256Digest[],
  errorCode: "CONFLICT" | "STALE_REVISION" = "CONFLICT",
): void {
  if (
    expected.length === actual.length &&
    expected.every((digest, index) => digest === actual[index])
  ) return;
  throw new ProjectFabricCoreError(
    errorCode,
    "input attestation does not match the gate's canonical artifact digest binding",
  );
}
