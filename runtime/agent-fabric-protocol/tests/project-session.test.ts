import { describe, expect, it } from "vitest";

import * as protocol from "../src/index.js";

const closedSession = {
  projectSessionId: "ps_01",
  projectId: "project_01",
  mode: "coordinated",
  state: "closed",
  revision: 8,
  generation: 2,
  authorityRef: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  budgetRef: "budget_root",
  launchPacketRef: {
    path: "docs/launch.json",
    digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
  membershipRevision: 4,
  origin: {
    kind: "operator-launch",
    operatorId: "operator_01",
  },
  terminalPath: {
    kind: "accepted",
    acceptanceRef: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  },
} as const;

describe("project-session schema", () => {
  it("accepts a closed session only with an exact terminal path", () => {
    const parse: unknown = Reflect.get(protocol, "parseProjectSession");
    expect(typeof parse).toBe("function");
    if (typeof parse !== "function") return;

    expect(parse(closedSession)).toStrictEqual(closedSession);
  });

  it("rejects a closed session without terminal evidence", () => {
    const { terminalPath: _terminalPath, ...incomplete } = closedSession;

    expect(() => protocol.parseProjectSession(incomplete)).toThrowError(
      /terminalPath is required when state is closed/,
    );
  });

  it("rejects unknown project-session fields", () => {
    expect(() => protocol.parseProjectSession({ ...closedSession, shadowChairId: "agent_02" })).toThrowError(
      /unknown field: shadowChairId/,
    );
  });
});
