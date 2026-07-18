import { verifyProviderExecutableIdentity, type ProviderIdentityObservation } from "./provider-identity.js";
import { probeProviderInterface } from "./provider-interface.js";

export type ProviderConformanceObservation = {
  identity: ProviderIdentityObservation;
  interface: Awaited<ReturnType<typeof probeProviderInterface>>;
};

/** Identity and non-answer interface validation used at admission and point of use. */
export async function verifyProviderConformance(input: {
  adapterId: string;
  executable: string;
  cursorInstallRoot?: string;
}): Promise<ProviderConformanceObservation> {
  const identity = await verifyProviderExecutableIdentity(input);
  const interfaceObservation = await probeProviderInterface(input);
  return { identity, interface: interfaceObservation };
}
