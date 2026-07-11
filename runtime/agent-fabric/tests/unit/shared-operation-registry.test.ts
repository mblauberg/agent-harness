import { describe, expect, it } from "vitest";

import * as protocol from "@local/agent-fabric-protocol";
import {
  AUTHORITY_ACTION_VOCABULARY,
  FABRIC_OPERATIONS,
  OPERATION_REGISTRY,
  expandAuthorityActions,
} from "../../src/domain/operations.ts";

describe("shared fabric operation registry", () => {
  it("uses the standalone protocol constants and registry by identity", () => {
    expect(FABRIC_OPERATIONS).toBe(protocol.FABRIC_OPERATIONS);
    expect(OPERATION_REGISTRY).toBe(protocol.OPERATION_REGISTRY);
  });

  it("recognises but never grants the retired legacy human-gate operation", () => {
    expect(expandAuthorityActions([FABRIC_OPERATIONS.resolveHumanGate])).toStrictEqual({
      ok: false,
      unknownActions: [FABRIC_OPERATIONS.resolveHumanGate],
    });
  });

  it("keeps agent authority vocabulary aligned with daemon-grantable principal operations", () => {
    const agentOperations = [...protocol.operationsForPrincipal("agent")]
      .filter(protocol.isDaemonGrantableOperation)
      .sort();
    const vocabularyOperations = AUTHORITY_ACTION_VOCABULARY.filter(protocol.isActiveFabricOperation).sort();

    expect(vocabularyOperations).toStrictEqual(agentOperations);
    for (const operation of agentOperations) {
      expect(expandAuthorityActions([operation])).toStrictEqual({ ok: true, operations: [operation] });
    }
    expect(expandAuthorityActions([FABRIC_OPERATIONS.launchAttest])).toStrictEqual({
      ok: false,
      unknownActions: [FABRIC_OPERATIONS.launchAttest],
    });
    expect(expandAuthorityActions([FABRIC_OPERATIONS.daemonStop])).toStrictEqual({
      ok: false,
      unknownActions: [FABRIC_OPERATIONS.daemonStop],
    });
  });
});
