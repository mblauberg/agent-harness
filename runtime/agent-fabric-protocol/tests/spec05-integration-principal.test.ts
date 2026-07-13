import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  operationsForPrincipal,
  parseProtocolPrincipal,
} from "../src/index.js";

describe("Spec 05 integration principal closure", () => {
  it("requires the full provider-native binding", () => {
    const principal = {
      kind: "integration",
      integrationId: "integration_01",
      projectId: "project_01",
      projectSessionId: "ps_01",
      runId: "run_01",
      principalGeneration: 1,
      providerId: "anthropic",
      providerSessionRef: "provider_session_01",
    } as const;
    expect(parseProtocolPrincipal(principal)).toStrictEqual(principal);
    const { providerSessionRef: _missing, ...incomplete } = principal;
    expect(() => parseProtocolPrincipal(incomplete)).toThrow(/providerSessionRef/);
  });

  it("admits exactly the eleven closed integration operations", () => {
    const operations = operationsForPrincipal("integration");
    expect(operations.size).toBe(11);
    expect(operations.has(FABRIC_OPERATIONS.dispatchProviderAction as never)).toBe(false);
    expect(operations.has(FABRIC_OPERATIONS.integrationInputAttest)).toBe(true);
  });
});
