import { verifyProviderExecutableIdentity, type ProviderIdentityObservation } from "./provider-identity.js";
import { probeProviderInterface } from "./provider-interface.js";

export type ProviderConformanceObservation = {
  identity: ProviderIdentityObservation;
  interface: Awaited<ReturnType<typeof probeProviderInterface>>;
};

export function providerConformanceEvidence(observation: ProviderConformanceObservation): {
  canonicalPath: string;
  assurance: ProviderIdentityObservation["assurance"];
  signingIdentities: ProviderIdentityObservation["signing"];
  observedVersion: string;
  observedDigest: string;
} {
  return {
    canonicalPath: observation.identity.canonicalPath,
    assurance: observation.identity.assurance,
    signingIdentities: observation.identity.signing,
    observedVersion: observation.interface.version,
    observedDigest: observation.identity.sha256,
  };
}

/** Identity and non-answer interface validation used at admission and point of use. */
export async function verifyProviderConformance(input: {
  adapterId: string;
  executable: string;
  cursorInstallRoot?: string;
  providerInstallRoot?: string;
}): Promise<ProviderConformanceObservation> {
  const identity = await verifyProviderExecutableIdentity(input);
  const interfaceObservation = await probeProviderInterface(input);
  return { identity, interface: interfaceObservation };
}
