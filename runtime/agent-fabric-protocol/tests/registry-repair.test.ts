import { describe, expect, it } from "vitest";

import * as protocol from "../src/index.js";

const baselineOperations = [
  "fabric.v1.authority.delegate",
  "fabric.v1.agent.register",
  "fabric.v1.agent.spawn",
  "fabric.v1.agent.attach",
  "fabric.v1.message.send",
  "fabric.v1.discussion-group.create",
  "fabric.v1.message.receive",
  "fabric.v1.delivery.acknowledge",
  "fabric.v1.delivery.abandon",
  "fabric.v1.mailbox.read",
  "fabric.v1.task.create",
  "fabric.v1.task.claim",
  "fabric.v1.task.readiness.refresh",
  "fabric.v1.task.objective-check.record",
  "fabric.v1.task.human-gate.resolve",
  "fabric.v1.task.handoff.acknowledge",
  "fabric.v1.task.read",
  "fabric.v1.task.update",
  "fabric.v1.task.owner-recovery-proof.record",
  "fabric.v1.task.owner.recover",
  "fabric.v1.lease.revocation-proof.record",
  "fabric.v1.capability.revoke",
  "fabric.v1.capability.rotate",
  "fabric.v1.write-lease.acquire",
  "fabric.v1.write-lease.recover",
  "fabric.v1.write-lease.renew",
  "fabric.v1.write-lease.read",
  "fabric.v1.write-lease.release",
  "fabric.v1.lifecycle.request",
  "fabric.v1.lifecycle.read",
  "fabric.v1.provider-state.report",
  "fabric.v1.provider-action.dispatch",
  "fabric.v1.provider-action.reconcile",
  "fabric.v1.provider-action.read",
  "fabric.v1.operator-intervention.record",
  "fabric.v1.visibility-failure.record",
  "fabric.v1.team.create",
  "fabric.v1.team.read",
  "fabric.v1.subtree.freeze",
  "fabric.v1.subtree.adopt",
  "fabric.v1.subtree-barrier.close",
  "fabric.v1.budget.reserve",
  "fabric.v1.budget.usage.record",
  "fabric.v1.budget.usage.reconcile",
  "fabric.v1.budget.release",
  "fabric.v1.budget.read",
  "fabric.v1.artifact.publish",
  "fabric.v1.barrier.close",
  "fabric.v1.run-status.read",
  "fabric.v1.events.observe",
  "fabric.v1.task.list",
  "fabric.v1.agent.list",
  "fabric.v1.receipt.list",
  "fabric.v1.receipt.export",
] as const;

describe("canonical exhaustive operation registry", () => {
  it("preserves every live baseline v1 wire operation", () => {
    const operations = Object.values(protocol.FABRIC_OPERATIONS);

    expect(baselineOperations.every((operation) => operations.includes(operation as never))).toBe(true);
  });

  it("does not publish caller-controlled gate rebind", () => {
    expect(Object.values(protocol.FABRIC_OPERATIONS)).not.toContain("fabric.v1.scoped-gate.rebind");
  });

  it("routes the legacy human-gate wire operation to the scoped-gate owner", () => {
    const registry: unknown = Reflect.get(protocol, "OPERATION_REGISTRY");

    expect(registry).toMatchObject({
      "fabric.v1.task.human-gate.resolve": {
        gateOwner: "scoped-gate",
        canonicalOperation: "fabric.v1.scoped-gate.resolve",
      },
    });
  });
});
