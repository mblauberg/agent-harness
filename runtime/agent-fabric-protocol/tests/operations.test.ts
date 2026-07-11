import { describe, expect, it } from "vitest";

import * as protocol from "../src/index.js";

describe("public operation vocabulary", () => {
  it("publishes the project-session create operation", () => {
    const operations: unknown = Reflect.get(protocol, "FABRIC_OPERATIONS");

    expect(operations).toMatchObject({
      projectSessionCreate: "fabric.v1.project-session.create",
    });
  });

  it("publishes the complete Spec 05 operation vocabulary without aliases", () => {
    const operations: unknown = Reflect.get(protocol, "FABRIC_OPERATIONS");

    expect(operations).toStrictEqual({
      projectSessionCreate: "fabric.v1.project-session.create",
      projectSessionGet: "fabric.v1.project-session.read",
      projectSessionTransition: "fabric.v1.project-session.transition",
      projectSessionClose: "fabric.v1.project-session.close",
      membershipBind: "fabric.v1.project-session.membership.bind",
      operatorAttach: "fabric.v1.operator.attach",
      operatorDetach: "fabric.v1.operator.detach",
      operatorHeartbeat: "fabric.v1.operator.heartbeat",
      operatorCommand: "fabric.v1.operator.command",
      operatorInputAttest: "fabric.v1.operator.input-attest",
      intakeSubmit: "fabric.v1.intake.submit",
      intakeRevise: "fabric.v1.intake.revise",
      scopedGateCreate: "fabric.v1.scoped-gate.create",
      scopedGateRebind: "fabric.v1.scoped-gate.rebind",
      scopedGateResolve: "fabric.v1.scoped-gate.resolve",
      scopedGateCheck: "fabric.v1.scoped-gate.check",
      resourceReserve: "fabric.v1.resource.reserve",
      resourceRelease: "fabric.v1.resource.release",
      resourceReconcile: "fabric.v1.resource.reconcile",
      taskRequest: "fabric.v1.task.request",
      taskCompleteWithReply: "fabric.v1.task.complete-with-reply",
      resultDeliveryClaim: "fabric.v1.result-delivery.claim",
      resultDeliveryProviderAccept: "fabric.v1.result-delivery.provider-accept",
      resultDeliveryConsume: "fabric.v1.result-delivery.consume",
      resultDeliveryRetry: "fabric.v1.result-delivery.retry",
      resultDeliveryReassign: "fabric.v1.result-delivery.reassign",
      resultDeliveryAbandon: "fabric.v1.result-delivery.abandon",
      chairTakeover: "fabric.v1.chair.takeover",
      projectionSnapshot: "fabric.v1.operator-projection.snapshot",
      projectionEvents: "fabric.v1.operator-projection.events",
      messageBodyRead: "fabric.v1.message-body.read",
      projectSessionDrain: "fabric.v1.project-session.drain",
      projectSessionStop: "fabric.v1.project-session.stop",
      daemonDrain: "fabric.v1.daemon.drain",
      daemonStop: "fabric.v1.daemon.stop",
    });
  });
});

describe("protocol negotiation", () => {
  it("accepts a client when every required feature is available", () => {
    const negotiate: unknown = Reflect.get(protocol, "negotiateProtocol");
    expect(typeof negotiate).toBe("function");
    if (typeof negotiate !== "function") return;

    expect(negotiate({
      protocolVersion: 1,
      requiredFeatures: ["project-sessions.v1"],
      optionalFeatures: [],
    }, {
      protocolVersion: 1,
      features: ["project-sessions.v1"],
    })).toStrictEqual({
      ok: true,
      protocolVersion: 1,
      features: ["project-sessions.v1"],
    });
  });

  it("fails closed when a required feature is unavailable", () => {
    expect(protocol.negotiateProtocol({
      protocolVersion: 1,
      requiredFeatures: ["operator-control.v1"],
      optionalFeatures: [],
    }, {
      protocolVersion: 1,
      features: ["project-sessions.v1"],
    })).toStrictEqual({
      ok: false,
      reason: "required-features-unavailable",
      missingFeatures: ["operator-control.v1"],
    });
  });

  it("fails closed instead of downgrading a protocol version", () => {
    expect(protocol.negotiateProtocol({
      protocolVersion: 2,
      requiredFeatures: [],
      optionalFeatures: [],
    }, {
      protocolVersion: 1,
      features: [],
    })).toStrictEqual({
      ok: false,
      reason: "protocol-version-unsupported",
      requestedVersion: 2,
      offeredVersion: 1,
    });
  });
});
