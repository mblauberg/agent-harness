import type {
  FabricOperation,
  ProtocolFeature,
  ProtocolPrincipal,
} from "@local/agent-fabric-protocol";

export type PublicProtocolContext = {
  principal: ProtocolPrincipal;
  allowedOperations: ReadonlySet<FabricOperation>;
  features: readonly ProtocolFeature[];
  connectionNonce: string;
  credentialHash: string;
  daemonInstanceGeneration: number;
};
