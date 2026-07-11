export const FABRIC_OPERATIONS = Object.freeze({
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
} as const satisfies Record<string, `fabric.v1.${string}`>);

export type FabricOperation = (typeof FABRIC_OPERATIONS)[keyof typeof FABRIC_OPERATIONS];

const operationSet: ReadonlySet<string> = new Set(Object.values(FABRIC_OPERATIONS));

export function isFabricOperation(value: string): value is FabricOperation {
  return operationSet.has(value);
}
