// Frozen vintage daemon fixture built from commit af548f8.

// ../../../../../private/tmp/spec05-vintage-af548f8/vintage-daemon-entry.ts
import { createServer } from "node:net";
import { rmSync } from "node:fs";

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/operations.ts
function defineOperations(registry) {
  return registry;
}
var DEFINITIONS = defineOperations({
  delegateAuthority: { operation: "fabric.v1.authority.delegate", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  registerAgent: { operation: "fabric.v1.agent.register", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  spawnAgent: { operation: "fabric.v1.agent.spawn", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  attachAgent: { operation: "fabric.v1.agent.attach", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  sendMessage: { operation: "fabric.v1.message.send", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  createDiscussionGroup: { operation: "fabric.v1.discussion-group.create", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  receiveMessages: { operation: "fabric.v1.message.receive", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  acknowledgeDelivery: { operation: "fabric.v1.delivery.acknowledge", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  abandonDelivery: { operation: "fabric.v1.delivery.abandon", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  getMailboxState: { operation: "fabric.v1.mailbox.read", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  createTask: { operation: "fabric.v1.task.create", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  claimTask: { operation: "fabric.v1.task.claim", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  refreshTaskReadiness: { operation: "fabric.v1.task.readiness.refresh", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  recordObjectiveCheck: { operation: "fabric.v1.task.objective-check.record", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  resolveHumanGate: {
    operation: "fabric.v1.task.human-gate.resolve",
    feature: "fabric-core.v1",
    principals: [],
    kind: "retired",
    gateOwner: "scoped-gate",
    replacementOperation: "fabric.v1.scoped-gate.resolve",
    retirementReason: "identifier-only task gates migrated to daemon-owned scoped gates"
  },
  acknowledgeTaskHandoff: { operation: "fabric.v1.task.handoff.acknowledge", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  getTask: { operation: "fabric.v1.task.read", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  updateTask: { operation: "fabric.v1.task.update", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  recordTaskOwnerRecoveryProof: { operation: "fabric.v1.task.owner-recovery-proof.record", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  recoverTaskOwner: { operation: "fabric.v1.task.owner.recover", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  recordRevocationProof: { operation: "fabric.v1.lease.revocation-proof.record", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  revokeCapability: { operation: "fabric.v1.capability.revoke", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  rotateCapability: { operation: "fabric.v1.capability.rotate", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  acquireWriteLease: { operation: "fabric.v1.write-lease.acquire", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  recoverWriteLease: { operation: "fabric.v1.write-lease.recover", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  renewWriteLease: { operation: "fabric.v1.write-lease.renew", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  getWriteLease: { operation: "fabric.v1.write-lease.read", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  releaseWriteLease: { operation: "fabric.v1.write-lease.release", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  requestLifecycle: { operation: "fabric.v1.lifecycle.request", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  getAgentLifecycle: { operation: "fabric.v1.lifecycle.read", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  reportProviderState: { operation: "fabric.v1.provider-state.report", feature: "fabric-core.v1", principals: ["agent", "integration"], kind: "baseline" },
  dispatchProviderAction: { operation: "fabric.v1.provider-action.dispatch", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  reconcileProviderAction: { operation: "fabric.v1.provider-action.reconcile", feature: "fabric-core.v1", principals: ["agent", "integration"], kind: "baseline" },
  getProviderAction: { operation: "fabric.v1.provider-action.read", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  recordOperatorIntervention: { operation: "fabric.v1.operator-intervention.record", feature: "fabric-core.v1", principals: ["agent", "integration"], kind: "baseline" },
  recordVisibilityFailure: { operation: "fabric.v1.visibility-failure.record", feature: "fabric-core.v1", principals: ["agent", "integration"], kind: "baseline" },
  createTeam: { operation: "fabric.v1.team.create", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  getTeam: { operation: "fabric.v1.team.read", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  freezeSubtree: { operation: "fabric.v1.subtree.freeze", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  adoptSubtree: { operation: "fabric.v1.subtree.adopt", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  closeSubtreeBarrier: { operation: "fabric.v1.subtree-barrier.close", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  reserveBudget: { operation: "fabric.v1.budget.reserve", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  recordBudgetUsage: { operation: "fabric.v1.budget.usage.record", feature: "fabric-core.v1", principals: ["agent", "integration"], kind: "baseline" },
  reconcileBudgetUsage: { operation: "fabric.v1.budget.usage.reconcile", feature: "fabric-core.v1", principals: ["agent", "integration"], kind: "baseline" },
  releaseBudget: { operation: "fabric.v1.budget.release", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  getBudget: { operation: "fabric.v1.budget.read", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  publishArtifact: { operation: "fabric.v1.artifact.publish", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  closeBarrier: { operation: "fabric.v1.barrier.close", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  getRunStatus: { operation: "fabric.v1.run-status.read", feature: "fabric-core.v1", principals: ["agent", "operator"], kind: "baseline" },
  observeEvents: { operation: "fabric.v1.events.observe", feature: "fabric-core.v1", principals: ["agent", "operator"], kind: "baseline" },
  listTasks: { operation: "fabric.v1.task.list", feature: "fabric-core.v1", principals: ["agent", "operator"], kind: "baseline" },
  listAgents: { operation: "fabric.v1.agent.list", feature: "fabric-core.v1", principals: ["agent", "operator"], kind: "baseline" },
  listReceipts: { operation: "fabric.v1.receipt.list", feature: "fabric-core.v1", principals: ["agent", "operator"], kind: "baseline" },
  exportReceipt: { operation: "fabric.v1.receipt.export", feature: "fabric-core.v1", principals: ["agent"], kind: "baseline" },
  launchAttest: {
    operation: "fabric.v1.launch.attest",
    feature: "launch-attestation.v1",
    principals: ["agent"],
    kind: "extension",
    grantScope: "provider-launch"
  },
  projectSessionCreate: { operation: "fabric.v1.project-session.create", feature: "project-sessions.v1", principals: ["operator"], kind: "extension" },
  projectSessionGet: { operation: "fabric.v1.project-session.read", feature: "project-sessions.v1", principals: ["operator"], kind: "extension" },
  projectSessionTransition: { operation: "fabric.v1.project-session.transition", feature: "project-sessions.v1", principals: ["operator"], kind: "extension" },
  projectSessionClose: { operation: "fabric.v1.project-session.close", feature: "project-sessions.v1", principals: ["operator"], kind: "extension" },
  membershipBind: { operation: "fabric.v1.project-session.membership.bind", feature: "project-sessions.v1", principals: ["operator", "agent"], kind: "extension" },
  operatorAttach: { operation: "fabric.v1.operator.attach", feature: "operator-control.v1", principals: ["operator"], kind: "extension" },
  operatorDetach: { operation: "fabric.v1.operator.detach", feature: "operator-control.v1", principals: ["operator"], kind: "extension" },
  operatorHeartbeat: { operation: "fabric.v1.operator.heartbeat", feature: "operator-control.v1", principals: ["operator"], kind: "extension" },
  operatorCommand: { operation: "fabric.v1.operator.command", feature: "operator-control.v1", principals: ["operator"], kind: "extension" },
  integrationInputAttest: { operation: "fabric.v1.integration.input-attest", feature: "input-attestation.v1", principals: ["integration"], kind: "extension" },
  intakeDraftCreate: { operation: "fabric.v1.intake.draft.create", feature: "intakes.v1", principals: ["operator"], kind: "extension" },
  intakeRead: { operation: "fabric.v1.intake.read", feature: "intakes.v1", principals: ["operator"], kind: "extension" },
  intakeSubmit: { operation: "fabric.v1.intake.submit", feature: "intakes.v1", principals: ["operator"], kind: "extension" },
  intakeRevise: { operation: "fabric.v1.intake.revise", feature: "intakes.v1", principals: ["operator", "agent"], kind: "extension" },
  scopedGateCreate: { operation: "fabric.v1.scoped-gate.create", feature: "scoped-gates.v1", principals: ["operator", "agent"], kind: "extension", gateOwner: "scoped-gate" },
  scopedGateResolve: { operation: "fabric.v1.scoped-gate.resolve", feature: "scoped-gates.v1", principals: ["operator"], kind: "extension", gateOwner: "scoped-gate" },
  scopedGateCheck: { operation: "fabric.v1.scoped-gate.check", feature: "scoped-gates.v1", principals: ["agent"], kind: "extension", gateOwner: "scoped-gate" },
  scopedGateRead: { operation: "fabric.v1.scoped-gate.read", feature: "scoped-gate-read.v1", principals: ["operator"], kind: "extension", gateOwner: "scoped-gate" },
  resourceReserve: { operation: "fabric.v1.resource.reserve", feature: "resource-reservations.v1", principals: ["agent"], kind: "extension" },
  resourceRelease: { operation: "fabric.v1.resource.release", feature: "resource-reservations.v1", principals: ["agent"], kind: "extension" },
  resourceReconcile: { operation: "fabric.v1.resource.reconcile", feature: "resource-reservations.v1", principals: ["agent", "integration"], kind: "extension" },
  taskRequest: { operation: "fabric.v1.task.request", feature: "request-results.v1", principals: ["agent"], kind: "extension" },
  taskCompleteWithReply: { operation: "fabric.v1.task.complete-with-reply", feature: "request-results.v1", principals: ["agent"], kind: "extension" },
  resultDeliveryClaim: { operation: "fabric.v1.result-delivery.claim", feature: "request-results.v1", principals: ["agent", "integration"], kind: "extension" },
  resultDeliveryProviderAccept: { operation: "fabric.v1.result-delivery.provider-accept", feature: "request-results.v1", principals: ["integration"], kind: "extension" },
  resultDeliveryConsume: { operation: "fabric.v1.result-delivery.consume", feature: "request-results.v1", principals: ["agent", "integration"], kind: "extension" },
  resultDeliveryRetry: { operation: "fabric.v1.result-delivery.retry", feature: "request-results.v1", principals: ["agent"], kind: "extension" },
  resultDeliveryReassign: { operation: "fabric.v1.result-delivery.reassign", feature: "request-results.v1", principals: ["agent"], kind: "extension" },
  resultDeliveryAbandon: { operation: "fabric.v1.result-delivery.abandon", feature: "request-results.v1", principals: ["agent"], kind: "extension" },
  chairTakeover: { operation: "fabric.v1.chair.takeover", feature: "chair-takeover.v1", principals: ["operator"], kind: "extension" },
  projectDiscover: { operation: "fabric.v1.project.discover", feature: "operator-projection.v1", principals: ["operator"], kind: "extension" },
  projectionSnapshot: { operation: "fabric.v1.operator-projection.snapshot", feature: "operator-projection.v1", principals: ["operator"], kind: "extension" },
  projectionPage: { operation: "fabric.v1.operator-projection.page", feature: "operator-projection.v1", principals: ["operator"], kind: "extension" },
  projectionEvents: { operation: "fabric.v1.operator-projection.events", feature: "operator-projection.v1", principals: ["operator"], kind: "extension" },
  projectionViewPage: { operation: "fabric.v1.operator-projection.view-page", feature: "operator-projection.v2", principals: ["operator"], kind: "extension" },
  projectionDetailRead: { operation: "fabric.v1.operator-projection.detail.read", feature: "operator-projection.v2", principals: ["operator"], kind: "extension" },
  operatorActionPreview: { operation: "fabric.v1.operator-action.preview", feature: "operator-actions.v1", principals: ["operator"], kind: "extension" },
  operatorActionCommit: { operation: "fabric.v1.operator-action.commit", feature: "operator-actions.v1", principals: ["operator"], kind: "extension" },
  operatorActionStatus: { operation: "fabric.v1.operator-action.status", feature: "operator-actions.v1", principals: ["operator"], kind: "extension" },
  operatorActionReconcile: { operation: "fabric.v1.operator-action.reconcile", feature: "operator-actions.v1", principals: ["operator"], kind: "extension" },
  messageBodyRead: { operation: "fabric.v1.message-body.read", feature: "message-body-read.v1", principals: ["operator"], kind: "extension" },
  operatorRepositoryRead: { operation: "fabric.v1.operator-repository.read", feature: "operator-repository-read.v1", principals: ["operator"], kind: "extension" },
  projectSessionDrain: {
    operation: "fabric.v1.project-session.drain",
    feature: "lifecycle-control.v1",
    principals: [],
    kind: "retired",
    replacementOperation: "fabric.v1.operator-action.preview",
    retirementReason: "typed operator actions own lifecycle preview, revision and consequence fencing"
  },
  projectSessionStop: {
    operation: "fabric.v1.project-session.stop",
    feature: "lifecycle-control.v1",
    principals: [],
    kind: "retired",
    replacementOperation: "fabric.v1.operator-action.preview",
    retirementReason: "typed operator actions own lifecycle preview, revision and consequence fencing"
  },
  daemonDrain: {
    operation: "fabric.v1.daemon.drain",
    feature: "lifecycle-control.v1",
    principals: [],
    kind: "retired",
    replacementOperation: "fabric.v1.operator-action.preview",
    retirementReason: "typed operator actions own lifecycle preview, global revision and consequence fencing"
  },
  daemonStop: {
    operation: "fabric.v1.daemon.stop",
    feature: "lifecycle-control.v1",
    principals: [],
    kind: "retired",
    replacementOperation: "fabric.v1.operator-action.preview",
    retirementReason: "typed operator actions own lifecycle preview, global revision and consequence fencing"
  }
});
function buildOperationConstants() {
  const constants = {};
  for (const [key, definition] of Object.entries(DEFINITIONS)) constants[key] = definition.operation;
  return Object.freeze(constants);
}
var FABRIC_OPERATIONS = buildOperationConstants();
function buildWireRegistry() {
  const registry = {};
  for (const [key, definition] of Object.entries(DEFINITIONS)) {
    const typedKey = key;
    registry[definition.operation] = { ...definition, key: typedKey };
  }
  return Object.freeze(registry);
}
var OPERATION_REGISTRY = buildWireRegistry();
var BASELINE_OPERATIONS = Object.freeze(
  Object.entries(OPERATION_REGISTRY).filter(([, definition]) => definition.kind === "baseline").map(([operation]) => operation)
);
var RETIRED_OPERATIONS = Object.freeze(
  Object.entries(OPERATION_REGISTRY).filter(([, definition]) => definition.kind === "retired").map(([operation]) => operation)
);
var operationSet = new Set(Object.keys(OPERATION_REGISTRY));
function isFabricOperation(value) {
  return operationSet.has(value);
}
function isActiveFabricOperation(value) {
  return isFabricOperation(value) && OPERATION_REGISTRY[value].kind !== "retired";
}
function isRetiredOperation(operation) {
  return OPERATION_REGISTRY[operation].kind === "retired";
}
function isDaemonGrantableOperation(operation) {
  return OPERATION_REGISTRY[operation].kind !== "retired" && OPERATION_REGISTRY[operation].grantScope !== "provider-launch";
}
function operationsForPrincipal(principal) {
  const operations2 = Object.entries(OPERATION_REGISTRY).filter(([, definition]) => definition.kind !== "retired" && definition.principals.includes(principal)).map(([operation]) => operation);
  return new Set(operations2);
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/primitives.ts
var ProtocolValidationError = class extends TypeError {
  path;
  constructor(path, message, options) {
    super(`${path} ${message}`, options);
    this.name = "ProtocolValidationError";
    this.path = path;
  }
};
var identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
var digestPattern = /^sha256:[a-f0-9]{64}$/u;
var rfc3339Pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;
function parseIdentifier(value, path) {
  if (typeof value !== "string" || !identifierPattern.test(value)) {
    throw new ProtocolValidationError(path, "must be a bounded stable identifier");
  }
  return value;
}
function parseSha256Digest(value, path) {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    throw new ProtocolValidationError(path, "must be a lowercase sha256 digest");
  }
  return value;
}
function parseTimestamp(value, path) {
  if (typeof value !== "string") throw new ProtocolValidationError(path, "must be a strict RFC3339 timestamp");
  const match = rfc3339Pattern.exec(value);
  if (match === null || !Number.isFinite(Date.parse(value))) {
    throw new ProtocolValidationError(path, "must be a strict RFC3339 timestamp");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
    throw new ProtocolValidationError(path, "must be a strict RFC3339 timestamp");
  }
  return value;
}
function parseCanonicalRelativePath(value, path) {
  const candidate = parseBoundedUtf8String(value, path, 4096);
  const segments = candidate.split("/");
  if (candidate.startsWith("/") || /^[A-Za-z]:/u.test(candidate) || candidate.includes("\\") || segments.some((segment) => segment === "" || segment === "." || segment === "..") || /[*?\[\]{}]/u.test(candidate) || candidate.includes("\0")) {
    throw new ProtocolValidationError(path, "must be a canonical workspace-relative path");
  }
  return candidate;
}
function parseBoundedUtf8String(value, path, maximumBytes) {
  const candidate = requiredString(value, path);
  if (Buffer.byteLength(candidate, "utf8") > maximumBytes) {
    throw new ProtocolValidationError(path, `must be at most ${String(maximumBytes)} UTF-8 bytes`);
  }
  return candidate;
}
function parseArtifactRef(value, path) {
  const record = strictRecord(value, path, ["path", "digest"]);
  const artifactPath = parseCanonicalRelativePath(record.path, `${path}.path`);
  return { path: artifactPath, digest: parseSha256Digest(record.digest, `${path}.digest`) };
}
function strictRecord(value, path, allowedFields) {
  if (!isUnknownRecord(value)) {
    throw new ProtocolValidationError(path, "must be an object");
  }
  const record = value;
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(record).filter((field) => !allowed.has(field)).sort();
  if (unknown.length > 0) {
    throw new ProtocolValidationError(path, `has unknown field: ${unknown.join(", ")}`);
  }
  return record;
}
function isUnknownRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requiredString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProtocolValidationError(path, "must be a non-empty string");
  }
  return value;
}
function safeInteger(value, path, minimum = 0) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new ProtocolValidationError(path, `must be a safe integer greater than or equal to ${String(minimum)}`);
  }
  return value;
}
function oneOf(value, allowed, path) {
  if (typeof value !== "string") {
    throw new ProtocolValidationError(path, `must be one of ${allowed.join(", ")}`);
  }
  const match = allowed.find((candidate) => candidate === value);
  if (match === void 0) {
    throw new ProtocolValidationError(path, `must be one of ${allowed.join(", ")}`);
  }
  return match;
}
function stringArray(value, path, minimumLength = 0) {
  if (!Array.isArray(value) || value.length < minimumLength) {
    throw new ProtocolValidationError(path, `must be an array with at least ${String(minimumLength)} item(s)`);
  }
  return value.map((entry, index) => requiredString(entry, `${path}[${String(index)}]`));
}
var JSON_VALUE_LIMITS = Object.freeze({
  maximumDepth: 64,
  maximumNodes: 4096,
  maximumArrayItems: 256,
  maximumObjectProperties: 256,
  maximumPropertyNameBytes: 256,
  maximumStringBytes: 1048576
});
function parseJsonValue(value, path) {
  let result;
  let assigned = false;
  let nodes = 0;
  const work = [{
    value,
    path,
    depth: 0,
    assign: (parsed) => {
      result = parsed;
      assigned = true;
    }
  }];
  while (work.length > 0) {
    const current = work.pop();
    if (current === void 0) break;
    nodes += 1;
    if (nodes > JSON_VALUE_LIMITS.maximumNodes) {
      throw new ProtocolValidationError(path, `must contain at most ${String(JSON_VALUE_LIMITS.maximumNodes)} JSON nodes`);
    }
    if (current.value === null || typeof current.value === "boolean") {
      current.assign(current.value);
      continue;
    }
    if (typeof current.value === "string") {
      if (Buffer.byteLength(current.value, "utf8") > JSON_VALUE_LIMITS.maximumStringBytes) {
        throw new ProtocolValidationError(
          current.path,
          `must be at most ${String(JSON_VALUE_LIMITS.maximumStringBytes)} UTF-8 bytes`
        );
      }
      current.assign(current.value);
      continue;
    }
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) {
        throw new ProtocolValidationError(current.path, "must contain only finite JSON numbers");
      }
      current.assign(current.value);
      continue;
    }
    if (current.depth >= JSON_VALUE_LIMITS.maximumDepth) {
      throw new ProtocolValidationError(
        current.path,
        `exceeds maximum JSON depth ${String(JSON_VALUE_LIMITS.maximumDepth)}`
      );
    }
    if (Array.isArray(current.value)) {
      if (current.value.length > JSON_VALUE_LIMITS.maximumArrayItems) {
        throw new ProtocolValidationError(
          current.path,
          `must be an array with at most ${String(JSON_VALUE_LIMITS.maximumArrayItems)} items`
        );
      }
      const parsed = new Array(current.value.length);
      current.assign(parsed);
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        work.push({
          value: current.value[index],
          path: `${current.path}[${String(index)}]`,
          depth: current.depth + 1,
          assign: (entry) => {
            parsed[index] = entry;
          }
        });
      }
      continue;
    }
    if (typeof current.value === "object") {
      const entries = Object.entries(current.value);
      if (entries.length > JSON_VALUE_LIMITS.maximumObjectProperties) {
        throw new ProtocolValidationError(
          current.path,
          `must be an object with at most ${String(JSON_VALUE_LIMITS.maximumObjectProperties)} properties`
        );
      }
      const parsed = {};
      current.assign(parsed);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry === void 0) continue;
        const [key, child] = entry;
        if (Buffer.byteLength(key, "utf8") > JSON_VALUE_LIMITS.maximumPropertyNameBytes) {
          throw new ProtocolValidationError(
            `${current.path}.${key}`,
            `property name must be at most ${String(JSON_VALUE_LIMITS.maximumPropertyNameBytes)} UTF-8 bytes`
          );
        }
        work.push({
          value: child,
          path: `${current.path}.${key}`,
          depth: current.depth + 1,
          assign: (entryValue) => {
            Object.defineProperty(parsed, key, {
              value: entryValue,
              enumerable: true,
              configurable: true,
              writable: true
            });
          }
        });
      }
      continue;
    }
    throw new ProtocolValidationError(current.path, "must be a JSON value");
  }
  if (!assigned || result === void 0) throw new ProtocolValidationError(path, "must be a JSON value");
  return result;
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/codec.ts
function defineCodec(schema2, example, parse) {
  return Object.freeze({ schema: Object.freeze(schema2), example, parse });
}
function parserBacked(base, parse, example) {
  return defineCodec(base.schema, example, (value, path) => parse(base.parse(value, path), path));
}
function boundedString(options = {}) {
  const minBytes = options.minBytes ?? 1;
  const maxBytes = options.maxBytes ?? 4096;
  const pattern = options.pattern === void 0 ? void 0 : new RegExp(options.pattern, "u");
  return defineCodec({
    type: "string",
    minLength: minBytes === 0 ? 0 : 1,
    maxLength: maxBytes,
    "x-minUtf8Bytes": minBytes,
    "x-maxUtf8Bytes": maxBytes,
    ...options.pattern === void 0 ? {} : { pattern: options.pattern }
  }, options.example ?? "value_01", (value, path) => {
    if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes < minBytes || bytes > maxBytes) {
      throw new TypeError(`${path} must contain ${String(minBytes)}-${String(maxBytes)} UTF-8 bytes`);
    }
    if (pattern !== void 0 && !pattern.test(value)) throw new TypeError(`${path} has invalid format`);
    return value;
  });
}
var identifier = boundedString({
  maxBytes: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
  example: "id_01"
});
var secretString = boundedString({ minBytes: 16, maxBytes: 4096, example: "secret-token-0001" });
var secret = defineCodec(
  { ...secretString.schema, "x-agent-fabric-sensitive": true },
  secretString.example,
  (value, path) => secretString.parse(value, path)
);
var protocolClientField = boundedString({ maxBytes: 128, example: "client-v1" });
var protocolFailureMessage = boundedString({ maxBytes: 4096, example: "protocol failure" });
var timestamp = defineCodec(
  { type: "string", format: "date-time" },
  "2026-07-11T10:00:00Z",
  parseTimestamp
);
var sha256 = defineCodec(
  { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  parseSha256Digest
);
var sha256Hex = boundedString({
  minBytes: 64,
  maxBytes: 64,
  pattern: "^[a-f0-9]{64}$",
  example: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
});
var relativePath = defineCodec(
  {
    type: "string",
    minLength: 1,
    maxLength: 4096,
    pattern: "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*[\\\\*?\\[\\]{}]).+$"
  },
  "artifacts/item.json",
  parseCanonicalRelativePath
);
function integer(options = {}) {
  const minimum = options.minimum ?? 0;
  return defineCodec({
    type: "integer",
    minimum,
    ...options.maximum === void 0 ? {} : { maximum: options.maximum }
  }, options.example ?? Math.max(minimum, 1), (value, path) => {
    const parsed = safeInteger(value, path, minimum);
    if (options.maximum !== void 0 && parsed > options.maximum) {
      throw new TypeError(`${path} must be at most ${String(options.maximum)}`);
    }
    return parsed;
  });
}
var boolean = defineCodec({ type: "boolean" }, true, (value, path) => {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
});
function literal(value) {
  return defineCodec({ const: value }, value, (candidate, path) => {
    if (candidate !== value) throw new TypeError(`${path} must equal ${String(value)}`);
    return value;
  });
}
function enumeration(values) {
  return defineCodec({ type: "string", enum: [...values] }, values[0], (value, path) => {
    const match = values.find((candidate) => candidate === value);
    if (match === void 0) throw new TypeError(`${path} must be one of ${values.join(", ")}`);
    return match;
  });
}
function nullable(codec) {
  return defineCodec({ oneOf: [codec.schema, { type: "null" }] }, null, (value, path) => value === null ? null : codec.parse(value, path));
}
function arrayOf(item, options = {}) {
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? 256;
  const example = options.example ?? (minimum > 0 ? [item.example] : []);
  return defineCodec({
    type: "array",
    items: item.schema,
    minItems: minimum,
    maxItems: maximum,
    ...options.unique === true ? { uniqueItems: true } : {}
  }, example, (value, path) => {
    if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
      throw new TypeError(`${path} must be an array with ${String(minimum)}-${String(maximum)} items`);
    }
    const parsed = value.map((entry, index) => item.parse(entry, `${path}[${String(index)}]`));
    if (options.unique === true && new Set(parsed.map((entry) => JSON.stringify(entry))).size !== parsed.length) {
      throw new TypeError(`${path} must contain unique items`);
    }
    return parsed;
  });
}
function objectCodec(required, optional = {}, options = {}) {
  const requiredNames = Object.keys(required);
  const propertyEntries = [...Object.entries(required), ...Object.entries(optional)];
  const properties = Object.fromEntries(propertyEntries.map(([name, codec]) => [name, codec.schema]));
  const generatedExample = Object.fromEntries(Object.entries(required).map(([name, codec]) => [name, codec.example]));
  return defineCodec({
    type: "object",
    additionalProperties: false,
    required: requiredNames,
    properties
  }, options.example ?? parseJsonValue(generatedExample, "codec.example"), (value, path) => {
    const record = strictRecord(value, path, propertyEntries.map(([name]) => name));
    const result = {};
    for (const [name, codec] of Object.entries(required)) {
      if (record[name] === void 0) throw new TypeError(`${path}.${name} is required`);
      result[name] = parseJsonValue(codec.parse(record[name], `${path}.${name}`), `${path}.${name}`);
    }
    for (const [name, codec] of Object.entries(optional)) {
      if (record[name] !== void 0) {
        result[name] = parseJsonValue(codec.parse(record[name], `${path}.${name}`), `${path}.${name}`);
      }
    }
    return result;
  });
}
function unionOf(codecs) {
  return defineCodec({ oneOf: codecs.map((codec) => codec.schema) }, codecs[0].example, (value, path) => {
    const errors = [];
    for (const codec of codecs) {
      try {
        return codec.parse(value, path);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new TypeError(`${path} does not match any allowed variant: ${errors.join("; ")}`);
  });
}
function recordOf(valueCodec, options = {}) {
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? 256;
  const pattern = options.keyPattern === void 0 ? void 0 : new RegExp(options.keyPattern, "u");
  if (pattern !== void 0 && options.keyCodec !== void 0) {
    throw new TypeError("record codec cannot combine keyPattern and keyCodec");
  }
  const exampleKey = options.exampleKey ?? "key_01";
  if (minimum > 0 && pattern !== void 0 && !pattern.test(exampleKey)) {
    throw new TypeError("record codec exampleKey must satisfy keyPattern");
  }
  if (minimum > 0 && options.keyCodec !== void 0) {
    options.keyCodec.parse(exampleKey, "record codec exampleKey");
  }
  return defineCodec({
    type: "object",
    minProperties: minimum,
    maxProperties: maximum,
    ...options.keyPattern === void 0 ? {} : { propertyNames: { pattern: options.keyPattern } },
    ...options.keyCodec === void 0 ? {} : { propertyNames: options.keyCodec.schema },
    additionalProperties: valueCodec.schema
  }, minimum > 0 ? { [exampleKey]: valueCodec.example } : {}, (value, path) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
    const entries = Object.entries(value);
    if (entries.length < minimum || entries.length > maximum) {
      throw new TypeError(`${path} must contain ${String(minimum)}-${String(maximum)} properties`);
    }
    const result = {};
    for (const [key, entry] of entries) {
      if (pattern !== void 0 && !pattern.test(key)) throw new TypeError(`${path}.${key} has an invalid key`);
      options.keyCodec?.parse(key, `${path}.${key}`);
      result[key] = valueCodec.parse(entry, `${path}.${key}`);
    }
    return result;
  });
}
var JSON_VALUE_NODE_SCHEMA = Object.freeze({
  oneOf: [
    { type: "null" },
    { type: "boolean" },
    { type: "number" },
    {
      type: "string",
      maxLength: JSON_VALUE_LIMITS.maximumStringBytes,
      "x-maxUtf8Bytes": JSON_VALUE_LIMITS.maximumStringBytes
    },
    {
      type: "array",
      maxItems: JSON_VALUE_LIMITS.maximumArrayItems,
      items: { "$ref": "#/$defs/jsonValueNode" }
    },
    {
      type: "object",
      maxProperties: JSON_VALUE_LIMITS.maximumObjectProperties,
      propertyNames: {
        maxLength: JSON_VALUE_LIMITS.maximumPropertyNameBytes,
        "x-maxUtf8Bytes": JSON_VALUE_LIMITS.maximumPropertyNameBytes
      },
      additionalProperties: { "$ref": "#/$defs/jsonValueNode" }
    }
  ]
});
var BOUNDED_JSON_VALUE_SCHEMA = Object.freeze({
  "x-boundedJson": true,
  "$ref": "#/$defs/jsonValueNode"
});
var jsonValue = defineCodec(
  { "$ref": "#/$defs/boundedJsonValue" },
  {},
  parseJsonValue
);

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/features.ts
var FABRIC_PROTOCOL_VERSION = 1;
var PROTOCOL_FEATURES = [
  "fabric-core.v1",
  "project-sessions.v1",
  "operator-control.v1",
  "input-attestation.v1",
  "intakes.v1",
  "scoped-gates.v1",
  "scoped-gate-read.v1",
  "resource-reservations.v1",
  "request-results.v1",
  "chair-takeover.v1",
  "operator-projection.v1",
  "operator-projection.v2",
  "operator-actions.v1",
  "launch-custody.v1",
  "launch-attestation.v1",
  "message-body-read.v1",
  "operator-repository-read.v1",
  "lifecycle-control.v1"
];
function buildFeatureOperations() {
  const grouped = Object.fromEntries(PROTOCOL_FEATURES.map((feature) => [feature, []]));
  for (const [operation, definition] of Object.entries(OPERATION_REGISTRY)) {
    if (definition.kind === "retired") continue;
    grouped[definition.feature].push(operation);
  }
  for (const operations2 of Object.values(grouped)) Object.freeze(operations2);
  return Object.freeze(grouped);
}
var FEATURE_OPERATIONS = buildFeatureOperations();
function operationsForFeatures(features) {
  return new Set(features.flatMap((feature) => FEATURE_OPERATIONS[feature]));
}
function negotiateProtocol(request, offer) {
  if (request.protocolVersion !== FABRIC_PROTOCOL_VERSION || offer.protocolVersion !== FABRIC_PROTOCOL_VERSION) {
    return {
      ok: false,
      reason: "protocol-version-unsupported",
      requestedVersion: request.protocolVersion,
      offeredVersion: offer.protocolVersion
    };
  }
  const available = new Set(offer.features);
  const missingFeatures = request.requiredFeatures.filter((feature) => !available.has(feature));
  if (missingFeatures.length > 0) {
    return { ok: false, reason: "required-features-unavailable", missingFeatures };
  }
  const requested = /* @__PURE__ */ new Set([...request.requiredFeatures, ...request.optionalFeatures]);
  return {
    ok: true,
    protocolVersion: FABRIC_PROTOCOL_VERSION,
    features: offer.features.filter((feature) => requested.has(feature))
  };
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/rpc-contract.ts
var PROTOCOL_LIMITS = Object.freeze({
  maximumFrameBytes: 1048576,
  maximumPendingCalls: 32,
  maximumInFlightPerConnection: 16,
  idleTimeoutMs: 3e5,
  requestTimeoutMs: 3e4
});
var PROTOCOL_ERROR_CODES = [
  "PROTOCOL_INVALID",
  "PROTOCOL_UNSUPPORTED",
  "FEATURE_UNAVAILABLE",
  "AUTHENTICATION_FAILED",
  "AUTHORITY_WIDENING",
  "ARTIFACT_DIGEST_INVALID",
  "ARTIFACT_PATH_FORBIDDEN",
  "ADAPTER_ARTIFACT_MISSING",
  "ADAPTER_COMPATIBILITY_INVALID",
  "ADAPTER_DISABLED",
  "ADAPTER_HASH_MISMATCH",
  "ADAPTER_PIN_UNRESOLVED",
  "ADAPTER_MODEL_REQUIRED",
  "ADAPTER_FAMILY_FORBIDDEN",
  "BARRIER_PRECONDITION_FAILED",
  "BUDGET_EXCEEDED",
  "CAPABILITY_FORBIDDEN",
  "CAPABILITY_UNAVAILABLE",
  "CAPABILITY_EXPIRED",
  "CAPABILITY_REVOKED",
  "CONFIG_UNTRUSTED_FIELD",
  "CONFIG_WIDENING_FORBIDDEN",
  "DEDUPE_CONFLICT",
  "DELIVERY_ALREADY_RESOLVED",
  "DELIVERY_REASON_REQUIRED",
  "LEASE_NOT_EXPIRED",
  "LEASE_EXPIRED",
  "LEASE_QUARANTINED",
  "CHECKPOINT_INCOMPLETE",
  "CONTEXT_UNRECONCILED",
  "LIFECYCLE_PRECONDITION_FAILED",
  "MODEL_REQUIRED",
  "MODEL_NOT_ALLOWED",
  "MODEL_FAMILY_NOT_ALLOWED",
  "MESSAGE_RELATIONSHIP_FORBIDDEN",
  "MESSAGE_HOP_LIMIT_EXCEEDED",
  "MESSAGE_QUOTA_EXCEEDED",
  "NOT_FOUND",
  "PROVIDER_TURN_ACTIVE",
  "STALE_LEASE_GENERATION",
  "STALE_PRINCIPAL_GENERATION",
  "TASK_NOT_OWNER",
  "TASK_DEPENDENCY_BLOCKED",
  "TASK_SUBTREE_CONFLICT",
  "TASK_REVISION_CONFLICT",
  "TEAM_DEPTH_EXCEEDED",
  "STALE_TEAM_GENERATION",
  "BUDGET_USAGE_UNKNOWN",
  "WRITE_SCOPE_CONFLICT",
  "WRITE_SCOPE_RECOVERY_REQUIRED",
  "WRITE_SCOPE_QUARANTINED",
  "WRONG_PROJECT",
  "STALE_GENERATION",
  "STALE_REVISION",
  "GATE_BLOCKED",
  "RESOURCE_EXHAUSTED",
  "RESOURCE_USAGE_UNKNOWN",
  "OVERLOADED",
  "DEADLINE_EXCEEDED",
  "CONFLICT",
  "RECOVERY_REQUIRED",
  "PROJECTION_RESNAPSHOT_REQUIRED"
];

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/authentication.ts
var ProtocolAuthenticationError = class extends Error {
  code = "AUTHENTICATION_FAILED";
  constructor(message) {
    super(message);
    this.name = "ProtocolAuthenticationError";
  }
};
function parseFeatureArray(value, path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  const features = value.map((feature, index) => {
    const matched = PROTOCOL_FEATURES.find((candidate) => candidate === feature);
    if (matched === void 0) throw new TypeError(`${path}[${String(index)}] is not a protocol feature`);
    return matched;
  });
  if (new Set(features).size !== features.length) throw new TypeError(`${path} must not contain duplicates`);
  return features;
}
function parseProtocolInitializeRequest(value) {
  const record = strictRecord(value, "initialize.input", [
    "protocolVersion",
    "client",
    "authentication",
    "expectedPrincipalKind",
    "requiredFeatures",
    "optionalFeatures"
  ]);
  if (record.protocolVersion !== 1) throw new TypeError("initialize.input.protocolVersion must be 1");
  const client = strictRecord(record.client, "initialize.input.client", ["name", "version"]);
  const authentication = strictRecord(record.authentication, "initialize.input.authentication", [
    "scheme",
    "credential",
    "clientNonce"
  ]);
  if (authentication.scheme !== "capability") throw new TypeError("initialize authentication scheme must be capability");
  const expectedPrincipalKind = record.expectedPrincipalKind;
  if (expectedPrincipalKind !== "operator" && expectedPrincipalKind !== "agent" && expectedPrincipalKind !== "integration") {
    throw new TypeError("initialize expectedPrincipalKind is invalid");
  }
  return {
    protocolVersion: 1,
    client: {
      name: protocolClientField.parse(client.name, "initialize.input.client.name"),
      version: protocolClientField.parse(client.version, "initialize.input.client.version")
    },
    authentication: {
      scheme: "capability",
      credential: secret.parse(authentication.credential, "initialize.input.authentication.credential"),
      clientNonce: parseIdentifier(
        authentication.clientNonce,
        "initialize.input.authentication.clientNonce"
      )
    },
    expectedPrincipalKind,
    requiredFeatures: parseFeatureArray(record.requiredFeatures, "initialize.input.requiredFeatures"),
    optionalFeatures: parseFeatureArray(record.optionalFeatures, "initialize.input.optionalFeatures")
  };
}
function authorizeProtocolInitialize(request, verifiedCredential, negotiatedFeatures = [...request.requiredFeatures, ...request.optionalFeatures]) {
  const verifiedPrincipal = verifiedCredential.principal;
  if (verifiedPrincipal.kind !== request.expectedPrincipalKind) {
    throw new ProtocolAuthenticationError(
      `credential resolved to ${verifiedPrincipal.kind}, expected ${request.expectedPrincipalKind}`
    );
  }
  const featureOperations = operationsForFeatures(negotiatedFeatures);
  const principalOperations = operationsForPrincipal(verifiedPrincipal.kind);
  const allowedOperations = [...new Set(verifiedCredential.grantedOperations)].filter((operation) => isActiveFabricOperation(operation) && isDaemonGrantableOperation(operation) && featureOperations.has(operation) && principalOperations.has(operation)).sort();
  return {
    principal: verifiedPrincipal,
    allowedOperations
  };
}
function createProtocolInitializeResult(options) {
  const negotiation = negotiateProtocol(options.request, {
    protocolVersion: 1,
    features: options.offeredFeatures
  });
  if (!negotiation.ok) throw new TypeError(`protocol negotiation failed: ${negotiation.reason}`);
  const authorization = authorizeProtocolInitialize(
    options.request,
    options.verifiedCredential,
    negotiation.features
  );
  return {
    protocolVersion: 1,
    daemonVersion: protocolClientField.parse(options.daemonVersion, "daemonVersion"),
    daemonInstanceGeneration: safeInteger(options.daemonInstanceGeneration, "daemonInstanceGeneration", 1),
    principal: authorization.principal,
    clientNonce: options.request.authentication.clientNonce,
    connectionNonce: parseIdentifier(options.connectionNonce, "connectionNonce"),
    features: negotiation.features,
    allowedOperations: authorization.allowedOperations,
    limits: options.limits
  };
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/operator.ts
function parseChairMutationContext(value, path = "chairCommand") {
  const record = strictRecord(value, path, [
    "commandId",
    "agentId",
    "projectSessionId",
    "coordinationRunId",
    "principalGeneration",
    "chairLeaseId",
    "chairLeaseGeneration",
    "expectedRunRevision",
    "expectedRevision"
  ]);
  return {
    commandId: parseIdentifier(record.commandId, `${path}.commandId`),
    agentId: parseIdentifier(record.agentId, `${path}.agentId`),
    projectSessionId: parseIdentifier(record.projectSessionId, `${path}.projectSessionId`),
    coordinationRunId: parseIdentifier(
      record.coordinationRunId,
      `${path}.coordinationRunId`
    ),
    principalGeneration: safeInteger(record.principalGeneration, `${path}.principalGeneration`, 1),
    chairLeaseId: parseIdentifier(record.chairLeaseId, `${path}.chairLeaseId`),
    chairLeaseGeneration: safeInteger(record.chairLeaseGeneration, `${path}.chairLeaseGeneration`, 1),
    expectedRunRevision: safeInteger(record.expectedRunRevision, `${path}.expectedRunRevision`),
    expectedRevision: safeInteger(record.expectedRevision, `${path}.expectedRevision`, 1)
  };
}
function parseProvenance(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const kind = Reflect.get(value, "kind");
  if (kind === "console-direct-input") {
    const record = strictRecord(value, path, ["kind", "clientId", "inputEventId"]);
    return {
      kind,
      clientId: parseIdentifier(record.clientId, `${path}.clientId`),
      inputEventId: requiredString(record.inputEventId, `${path}.inputEventId`)
    };
  }
  if (kind === "attested-provider-input") {
    const record = strictRecord(value, path, ["kind", "attestationId", "integrationId", "integrationGeneration"]);
    return {
      kind,
      attestationId: parseIdentifier(record.attestationId, `${path}.attestationId`),
      integrationId: parseIdentifier(record.integrationId, `${path}.integrationId`),
      integrationGeneration: safeInteger(record.integrationGeneration, `${path}.integrationGeneration`, 1)
    };
  }
  throw new TypeError(`${path}.kind must be one of console-direct-input, attested-provider-input`);
}
function parseOperatorMutationContext(value, path = "operatorMutation") {
  const record = strictRecord(value, path, [
    "credential",
    "commandId",
    "expectedRevision",
    "actor",
    "provenance",
    "evidenceRefs"
  ]);
  const credential = strictRecord(record.credential, `${path}.credential`, ["capabilityId", "token"]);
  if (!Array.isArray(record.evidenceRefs)) throw new TypeError(`${path}.evidenceRefs must be an array`);
  return {
    credential: {
      capabilityId: parseIdentifier(credential.capabilityId, `${path}.credential.capabilityId`),
      token: requiredString(credential.token, `${path}.credential.token`)
    },
    commandId: parseIdentifier(record.commandId, `${path}.commandId`),
    expectedRevision: safeInteger(record.expectedRevision, `${path}.expectedRevision`),
    actor: parseIdentifier(record.actor, `${path}.actor`),
    provenance: parseProvenance(record.provenance, `${path}.provenance`),
    evidenceRefs: record.evidenceRefs.map((evidence, index) => parseArtifactRef(
      evidence,
      `${path}.evidenceRefs[${String(index)}]`
    ))
  };
}
function parseOperatorInputAttestation(value) {
  const record = strictRecord(value, "operatorInputAttestation", [
    "attestationId",
    "integrationId",
    "integrationGeneration",
    "operatorId",
    "projectId",
    "projectSessionId",
    "providerEvent",
    "humanUtterance",
    "gateBinding",
    "recordedAt"
  ]);
  const providerEvent = strictRecord(record.providerEvent, "operatorInputAttestation.providerEvent", [
    "providerId",
    "providerSessionRef",
    "providerMessageId",
    "inputEventId",
    "eventDigest",
    "classification"
  ]);
  if (providerEvent.classification !== "direct-human") {
    throw new TypeError("operatorInputAttestation.providerEvent.classification must be direct-human");
  }
  const binding = strictRecord(record.gateBinding, "operatorInputAttestation.gateBinding", [
    "gateId",
    "expectedGateRevision",
    "artifactDigests",
    "interpretedDecision"
  ]);
  if (!Array.isArray(binding.artifactDigests) || binding.artifactDigests.length === 0) {
    throw new TypeError("operatorInputAttestation.gateBinding.artifactDigests must not be empty");
  }
  const digests = binding.artifactDigests.map((digest, index) => parseSha256Digest(
    digest,
    `operatorInputAttestation.gateBinding.artifactDigests[${String(index)}]`
  ));
  const firstDigest = digests[0];
  if (firstDigest === void 0) throw new TypeError("operatorInputAttestation.gateBinding.artifactDigests must not be empty");
  return {
    attestationId: parseIdentifier(
      record.attestationId,
      "operatorInputAttestation.attestationId"
    ),
    integrationId: parseIdentifier(record.integrationId, "operatorInputAttestation.integrationId"),
    integrationGeneration: safeInteger(
      record.integrationGeneration,
      "operatorInputAttestation.integrationGeneration",
      1
    ),
    operatorId: parseIdentifier(record.operatorId, "operatorInputAttestation.operatorId"),
    projectId: parseIdentifier(record.projectId, "operatorInputAttestation.projectId"),
    projectSessionId: parseIdentifier(
      record.projectSessionId,
      "operatorInputAttestation.projectSessionId"
    ),
    providerEvent: {
      providerId: requiredString(providerEvent.providerId, "operatorInputAttestation.providerEvent.providerId"),
      providerSessionRef: parseIdentifier(
        providerEvent.providerSessionRef,
        "operatorInputAttestation.providerEvent.providerSessionRef"
      ),
      providerMessageId: requiredString(
        providerEvent.providerMessageId,
        "operatorInputAttestation.providerEvent.providerMessageId"
      ),
      inputEventId: requiredString(providerEvent.inputEventId, "operatorInputAttestation.providerEvent.inputEventId"),
      eventDigest: parseSha256Digest(providerEvent.eventDigest, "operatorInputAttestation.providerEvent.eventDigest"),
      classification: "direct-human"
    },
    humanUtterance: requiredString(record.humanUtterance, "operatorInputAttestation.humanUtterance"),
    gateBinding: {
      gateId: parseIdentifier(binding.gateId, "operatorInputAttestation.gateBinding.gateId"),
      expectedGateRevision: safeInteger(
        binding.expectedGateRevision,
        "operatorInputAttestation.gateBinding.expectedGateRevision"
      ),
      artifactDigests: [firstDigest, ...digests.slice(1)],
      interpretedDecision: oneOf(
        binding.interpretedDecision,
        ["approve", "reject", "defer", "request-changes"],
        "operatorInputAttestation.gateBinding.interpretedDecision"
      )
    },
    recordedAt: parseTimestamp(record.recordedAt, "operatorInputAttestation.recordedAt")
  };
}
function parseIntegrationInputAttestationRequest(value) {
  const record = strictRecord(value, "integrationInputAttestation", ["context", "attestation"]);
  const contextRecord = strictRecord(record.context, "integrationInputAttestation.context", [
    "commandId",
    "integrationId",
    "expectedIntegrationGeneration",
    "eventId",
    "eventDigest"
  ]);
  const context = {
    commandId: parseIdentifier(contextRecord.commandId, "integrationInputAttestation.context.commandId"),
    integrationId: parseIdentifier(
      contextRecord.integrationId,
      "integrationInputAttestation.context.integrationId"
    ),
    expectedIntegrationGeneration: safeInteger(
      contextRecord.expectedIntegrationGeneration,
      "integrationInputAttestation.context.expectedIntegrationGeneration",
      1
    ),
    eventId: requiredString(contextRecord.eventId, "integrationInputAttestation.context.eventId"),
    eventDigest: parseSha256Digest(contextRecord.eventDigest, "integrationInputAttestation.context.eventDigest")
  };
  const attestation2 = parseOperatorInputAttestation(record.attestation);
  if (attestation2.integrationId !== context.integrationId || attestation2.integrationGeneration !== context.expectedIntegrationGeneration) {
    throw new TypeError("integrationInputAttestation integration generation does not match authenticated context");
  }
  if (attestation2.providerEvent.inputEventId !== context.eventId || attestation2.providerEvent.eventDigest !== context.eventDigest) {
    throw new TypeError("integrationInputAttestation immutable provider event does not match authenticated context");
  }
  return { context, attestation: attestation2 };
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/request-result.ts
function parseIdentifierArray(value, path) {
  return stringArray(value, path).map((entry, index) => parseIdentifier(entry, `${path}[${String(index)}]`));
}
function parseIntakeBinding(value) {
  const record = strictRecord(value, "taskRequest.request.intakeBinding", [
    "intakeId",
    "intakeRevision",
    "gateIds",
    "artifactDigests"
  ]);
  const gateIds = parseIdentifierArray(record.gateIds, "taskRequest.request.intakeBinding.gateIds");
  if (!Array.isArray(record.artifactDigests)) {
    throw new TypeError("taskRequest.request.intakeBinding.artifactDigests must be an array");
  }
  return {
    intakeId: parseIdentifier(record.intakeId, "taskRequest.request.intakeBinding.intakeId"),
    intakeRevision: safeInteger(record.intakeRevision, "taskRequest.request.intakeBinding.intakeRevision", 1),
    gateIds,
    artifactDigests: record.artifactDigests.map((digest, index) => parseSha256Digest(
      digest,
      `taskRequest.request.intakeBinding.artifactDigests[${String(index)}]`
    ))
  };
}
function parseTaskRequest(value) {
  const record = strictRecord(value, "taskRequest", ["commandId", "projectSessionId", "coordinationRunId", "task", "request"]);
  const task = strictRecord(record.task, "taskRequest.task", [
    "taskId",
    "taskRevision",
    "objective",
    "baseRevision",
    "expectedArtifactPaths"
  ]);
  const request = strictRecord(record.request, "taskRequest.request", [
    "requestRevision",
    "messageId",
    "conversationId",
    "targetAgentId",
    "targetProviderSessionRef",
    "requiresAck",
    "dedupeKey",
    "responseDeadline",
    "callbackId",
    "callbackGeneration",
    "dependentBarrierId",
    "intakeBinding"
  ]);
  if (request.requiresAck !== true) throw new TypeError("taskRequest.request.requiresAck must be true");
  return {
    commandId: parseIdentifier(record.commandId, "taskRequest.commandId"),
    projectSessionId: parseIdentifier(record.projectSessionId, "taskRequest.projectSessionId"),
    coordinationRunId: parseIdentifier(
      record.coordinationRunId,
      "taskRequest.coordinationRunId"
    ),
    task: {
      taskId: parseIdentifier(task.taskId, "taskRequest.task.taskId"),
      taskRevision: safeInteger(task.taskRevision, "taskRequest.task.taskRevision", 1),
      objective: requiredString(task.objective, "taskRequest.task.objective"),
      baseRevision: requiredString(task.baseRevision, "taskRequest.task.baseRevision"),
      expectedArtifactPaths: stringArray(task.expectedArtifactPaths, "taskRequest.task.expectedArtifactPaths").map(
        (artifactPath, index) => parseCanonicalRelativePath(
          artifactPath,
          `taskRequest.task.expectedArtifactPaths[${String(index)}]`
        )
      )
    },
    request: {
      requestRevision: safeInteger(request.requestRevision, "taskRequest.request.requestRevision", 1),
      messageId: parseIdentifier(request.messageId, "taskRequest.request.messageId"),
      conversationId: parseIdentifier(request.conversationId, "taskRequest.request.conversationId"),
      targetAgentId: parseIdentifier(request.targetAgentId, "taskRequest.request.targetAgentId"),
      targetProviderSessionRef: parseIdentifier(
        request.targetProviderSessionRef,
        "taskRequest.request.targetProviderSessionRef"
      ),
      requiresAck: true,
      dedupeKey: requiredString(request.dedupeKey, "taskRequest.request.dedupeKey"),
      responseDeadline: parseTimestamp(request.responseDeadline, "taskRequest.request.responseDeadline"),
      callbackId: parseIdentifier(request.callbackId, "taskRequest.request.callbackId"),
      callbackGeneration: safeInteger(request.callbackGeneration, "taskRequest.request.callbackGeneration", 1),
      dependentBarrierId: parseIdentifier(
        request.dependentBarrierId,
        "taskRequest.request.dependentBarrierId"
      ),
      ...request.intakeBinding === void 0 ? {} : { intakeBinding: parseIntakeBinding(request.intakeBinding) }
    }
  };
}
function parseArtifactRefs(value, path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value.map((artifact2, index) => parseArtifactRef(artifact2, `${path}[${String(index)}]`));
}
function parseTaskCompleteWithReply(value) {
  const record = strictRecord(value, "taskCompleteWithReply", [
    "commandId",
    "taskId",
    "expectedTaskRevision",
    "ownerLeaseId",
    "ownerLeaseGeneration",
    "requestMessageId",
    "expectedRequestRevision",
    "callbackId",
    "callbackGeneration",
    "reply",
    "terminalResult"
  ]);
  const reply = strictRecord(record.reply, "taskCompleteWithReply.reply", [
    "messageId",
    "conversationId",
    "replyToMessageId",
    "body",
    "artifactRefs"
  ]);
  const terminalResult = strictRecord(record.terminalResult, "taskCompleteWithReply.terminalResult", [
    "status",
    "summary",
    "completedAt"
  ]);
  const requestMessageId = parseIdentifier(
    record.requestMessageId,
    "taskCompleteWithReply.requestMessageId"
  );
  const replyToMessageId = parseIdentifier(
    reply.replyToMessageId,
    "taskCompleteWithReply.reply.replyToMessageId"
  );
  if (replyToMessageId !== requestMessageId) {
    throw new TypeError("taskCompleteWithReply.reply.replyToMessageId must equal requestMessageId");
  }
  if (terminalResult.status !== "complete") {
    throw new TypeError("taskCompleteWithReply.terminalResult.status must be complete");
  }
  return {
    commandId: parseIdentifier(record.commandId, "taskCompleteWithReply.commandId"),
    taskId: parseIdentifier(record.taskId, "taskCompleteWithReply.taskId"),
    expectedTaskRevision: safeInteger(record.expectedTaskRevision, "taskCompleteWithReply.expectedTaskRevision", 1),
    ownerLeaseId: parseIdentifier(record.ownerLeaseId, "taskCompleteWithReply.ownerLeaseId"),
    ownerLeaseGeneration: safeInteger(
      record.ownerLeaseGeneration,
      "taskCompleteWithReply.ownerLeaseGeneration",
      1
    ),
    requestMessageId,
    expectedRequestRevision: safeInteger(
      record.expectedRequestRevision,
      "taskCompleteWithReply.expectedRequestRevision",
      1
    ),
    callbackId: parseIdentifier(record.callbackId, "taskCompleteWithReply.callbackId"),
    callbackGeneration: safeInteger(record.callbackGeneration, "taskCompleteWithReply.callbackGeneration", 1),
    reply: {
      messageId: parseIdentifier(reply.messageId, "taskCompleteWithReply.reply.messageId"),
      conversationId: parseIdentifier(
        reply.conversationId,
        "taskCompleteWithReply.reply.conversationId"
      ),
      replyToMessageId,
      body: parseBoundedUtf8String(reply.body, "taskCompleteWithReply.reply.body", 4096),
      artifactRefs: parseArtifactRefs(reply.artifactRefs, "taskCompleteWithReply.reply.artifactRefs")
    },
    terminalResult: {
      status: "complete",
      summary: requiredString(terminalResult.summary, "taskCompleteWithReply.terminalResult.summary"),
      completedAt: parseTimestamp(terminalResult.completedAt, "taskCompleteWithReply.terminalResult.completedAt")
    }
  };
}
var resultBaseFields = [
  "resultDeliveryId",
  "revision",
  "projectSessionId",
  "taskId",
  "requestMessageId",
  "requestRevision",
  "replyMessageId",
  "replyRevision",
  "taskRevision",
  "callbackId",
  "callbackGeneration",
  "assignmentGeneration",
  "targetAgentId",
  "targetProviderSessionRef",
  "payloadDigest",
  "responseDeadline",
  "dependentBarrierId",
  "required",
  "state",
  "claimGeneration"
];
function parseResultBase(record) {
  if (typeof record.required !== "boolean") throw new TypeError("resultDelivery.required must be a boolean");
  return {
    resultDeliveryId: parseIdentifier(record.resultDeliveryId, "resultDelivery.resultDeliveryId"),
    revision: safeInteger(record.revision, "resultDelivery.revision", 1),
    projectSessionId: parseIdentifier(
      record.projectSessionId,
      "resultDelivery.projectSessionId"
    ),
    taskId: parseIdentifier(record.taskId, "resultDelivery.taskId"),
    requestMessageId: parseIdentifier(record.requestMessageId, "resultDelivery.requestMessageId"),
    requestRevision: safeInteger(record.requestRevision, "resultDelivery.requestRevision", 1),
    replyMessageId: parseIdentifier(record.replyMessageId, "resultDelivery.replyMessageId"),
    replyRevision: safeInteger(record.replyRevision, "resultDelivery.replyRevision", 1),
    taskRevision: safeInteger(record.taskRevision, "resultDelivery.taskRevision", 1),
    callbackId: parseIdentifier(record.callbackId, "resultDelivery.callbackId"),
    callbackGeneration: safeInteger(record.callbackGeneration, "resultDelivery.callbackGeneration", 1),
    assignmentGeneration: safeInteger(record.assignmentGeneration, "resultDelivery.assignmentGeneration", 1),
    targetAgentId: parseIdentifier(record.targetAgentId, "resultDelivery.targetAgentId"),
    targetProviderSessionRef: parseIdentifier(
      record.targetProviderSessionRef,
      "resultDelivery.targetProviderSessionRef"
    ),
    payloadDigest: parseSha256Digest(record.payloadDigest, "resultDelivery.payloadDigest"),
    responseDeadline: parseTimestamp(record.responseDeadline, "resultDelivery.responseDeadline"),
    dependentBarrierId: parseIdentifier(record.dependentBarrierId, "resultDelivery.dependentBarrierId"),
    required: record.required,
    claimGeneration: safeInteger(record.claimGeneration, "resultDelivery.claimGeneration")
  };
}
function parseResultDelivery(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("resultDelivery must be an object");
  }
  const state = Reflect.get(value, "state");
  const stateFields = state === "claimed" ? ["claimedByAgentId", "claimDeadline"] : state === "provider-accepted" ? ["claimedByAgentId", "claimDeadline", "providerAcceptedAt"] : state === "consumed" ? ["consumedAt"] : state === "overdue" ? ["overdueAt"] : state === "abandoned" ? ["abandonedAt", "reason"] : [];
  const record = strictRecord(value, "resultDelivery", [...resultBaseFields, ...stateFields]);
  const base = parseResultBase(record);
  if (state === "pending") return { ...base, state };
  if (state === "claimed") {
    return {
      ...base,
      state,
      claimedByAgentId: parseIdentifier(record.claimedByAgentId, "resultDelivery.claimedByAgentId"),
      claimDeadline: parseTimestamp(record.claimDeadline, "resultDelivery.claimDeadline")
    };
  }
  if (state === "provider-accepted") {
    return {
      ...base,
      state,
      claimedByAgentId: parseIdentifier(record.claimedByAgentId, "resultDelivery.claimedByAgentId"),
      claimDeadline: parseTimestamp(record.claimDeadline, "resultDelivery.claimDeadline"),
      providerAcceptedAt: parseTimestamp(record.providerAcceptedAt, "resultDelivery.providerAcceptedAt")
    };
  }
  if (state === "consumed") {
    return { ...base, state, consumedAt: parseTimestamp(record.consumedAt, "resultDelivery.consumedAt") };
  }
  if (state === "overdue") {
    return { ...base, state, overdueAt: parseTimestamp(record.overdueAt, "resultDelivery.overdueAt") };
  }
  if (state === "abandoned") {
    return {
      ...base,
      state,
      abandonedAt: parseTimestamp(record.abandonedAt, "resultDelivery.abandonedAt"),
      reason: requiredString(record.reason, "resultDelivery.reason")
    };
  }
  throw new TypeError("resultDelivery.state is invalid");
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/intake.ts
var INTAKE_STATES = [
  "draft",
  "awaiting-chair",
  "discussing",
  "awaiting-human",
  "accepted",
  "deferred",
  "cancelled"
];
function parseArtifactRefs2(value, path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value.map((artifact2, index) => parseArtifactRef(artifact2, `${path}[${String(index)}]`));
}
function parseGateIds(value, path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value.map((gateId, index) => parseIdentifier(gateId, `${path}[${String(index)}]`));
}
function parseIntake(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("intake must be an object");
  }
  const state = Reflect.get(value, "state");
  const fields = state === "draft" ? ["intakeId", "projectId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"] : [
    "intakeId",
    "projectId",
    "projectSessionId",
    "coordinationRunId",
    "revision",
    "state",
    "dedupeKey",
    "summary",
    "artifactRefs",
    "gateIds"
  ];
  const record = strictRecord(value, "intake", fields);
  const common = {
    intakeId: parseIdentifier(record.intakeId, "intake.intakeId"),
    projectId: parseIdentifier(record.projectId, "intake.projectId"),
    revision: safeInteger(record.revision, "intake.revision", 1),
    dedupeKey: requiredString(record.dedupeKey, "intake.dedupeKey"),
    summary: requiredString(record.summary, "intake.summary"),
    artifactRefs: parseArtifactRefs2(record.artifactRefs, "intake.artifactRefs"),
    gateIds: parseGateIds(record.gateIds, "intake.gateIds")
  };
  if (state === "draft") return { ...common, state };
  const boundState = INTAKE_STATES.find(
    (candidate) => candidate !== "draft" && candidate === state
  );
  if (boundState === void 0) throw new TypeError("intake.state is invalid");
  return {
    ...common,
    projectSessionId: parseIdentifier(record.projectSessionId, "intake.projectSessionId"),
    coordinationRunId: parseIdentifier(
      record.coordinationRunId,
      "intake.coordinationRunId"
    ),
    state: boundState
  };
}
function parseIntakeDraftCreateRequest(value) {
  const record = strictRecord(value, "intakeDraftCreate", [
    "command",
    "intakeId",
    "dedupeKey",
    "summary",
    "artifactRefs",
    "gateIds"
  ]);
  const command = parseOperatorMutationContext(record.command, "intakeDraftCreate.command");
  if (command.expectedRevision !== 0) {
    throw new TypeError("intakeDraftCreate command must expect revision 0");
  }
  return {
    command,
    intakeId: parseIdentifier(record.intakeId, "intakeDraftCreate.intakeId"),
    dedupeKey: requiredString(record.dedupeKey, "intakeDraftCreate.dedupeKey"),
    summary: requiredString(record.summary, "intakeDraftCreate.summary"),
    artifactRefs: parseArtifactRefs2(record.artifactRefs, "intakeDraftCreate.artifactRefs"),
    gateIds: parseGateIds(record.gateIds, "intakeDraftCreate.gateIds")
  };
}
function parseIntakeReadRequest(value) {
  const record = strictRecord(value, "intakeRead", ["credential", "intakeId"]);
  const credential = strictRecord(record.credential, "intakeRead.credential", ["capabilityId", "token"]);
  return {
    credential: {
      capabilityId: parseIdentifier(credential.capabilityId, "intakeRead.credential.capabilityId"),
      token: requiredString(credential.token, "intakeRead.credential.token")
    },
    intakeId: parseIdentifier(record.intakeId, "intakeRead.intakeId")
  };
}
function sameOrderedStrings(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}
function assertChairRequestBinding(options) {
  const binding = options.chairRequest.request.intakeBinding;
  if (binding === void 0) throw new TypeError(`${options.path} intake binding is required`);
  if (binding.intakeId !== options.intakeId || binding.intakeRevision !== options.intakeRevision) {
    throw new TypeError(`${options.path} intake revision does not match`);
  }
  if (!sameOrderedStrings(binding.gateIds, options.gateIds)) {
    throw new TypeError(`${options.path} gate IDs do not match`);
  }
  if (!sameOrderedStrings(binding.artifactDigests, options.artifactRefs.map((artifact2) => artifact2.digest))) {
    throw new TypeError(`${options.path} artifact digests do not match`);
  }
  if (options.chairRequest.projectSessionId !== options.projectSessionId) {
    throw new TypeError(`${options.path} project session does not match`);
  }
  if (options.chairRequest.coordinationRunId !== options.coordinationRunId) {
    throw new TypeError(`${options.path} coordination run does not match`);
  }
  return binding;
}
function parseIntakeSubmission(value) {
  const record = strictRecord(value, "intakeSubmission", [
    "command",
    "intakeId",
    "expectedRevision",
    "projectSessionId",
    "coordinationRunId",
    "summary",
    "artifactRefs",
    "gateIds",
    "chairRequest"
  ]);
  const command = parseOperatorMutationContext(record.command, "intakeSubmission.command");
  const expectedRevision = safeInteger(record.expectedRevision, "intakeSubmission.expectedRevision", 1);
  if (command.expectedRevision !== expectedRevision) {
    throw new TypeError("intakeSubmission operator command revision does not match");
  }
  const intakeId = parseIdentifier(record.intakeId, "intakeSubmission.intakeId");
  const projectSessionId = parseIdentifier(
    record.projectSessionId,
    "intakeSubmission.projectSessionId"
  );
  const coordinationRunId = parseIdentifier(
    record.coordinationRunId,
    "intakeSubmission.coordinationRunId"
  );
  const artifactRefs = parseArtifactRefs2(record.artifactRefs, "intakeSubmission.artifactRefs");
  const gateIds = parseGateIds(record.gateIds, "intakeSubmission.gateIds");
  const chairRequest = parseTaskRequest(record.chairRequest);
  const binding = assertChairRequestBinding({
    path: "intakeSubmission.chairRequest",
    chairRequest,
    intakeId,
    intakeRevision: expectedRevision + 1,
    projectSessionId,
    coordinationRunId,
    artifactRefs,
    gateIds
  });
  return {
    command,
    intakeId,
    expectedRevision,
    projectSessionId,
    coordinationRunId,
    summary: requiredString(record.summary, "intakeSubmission.summary"),
    artifactRefs,
    gateIds,
    chairRequest: { ...chairRequest, request: { ...chairRequest.request, intakeBinding: binding } }
  };
}
function parseIntakeRevisionRequest(value) {
  const record = strictRecord(value, "intakeRevision", [
    "origin",
    "command",
    "intakeId",
    "projectSessionId",
    "coordinationRunId",
    "expectedRevision",
    "state",
    "summary",
    "artifactRefs",
    "gateIds",
    "chairRequest"
  ]);
  const state = INTAKE_STATES.find(
    (candidate) => candidate !== "draft" && candidate === record.state
  );
  if (state === void 0) throw new TypeError("intakeRevision.state must be a session-bound state");
  const revision = {
    intakeId: parseIdentifier(record.intakeId, "intakeRevision.intakeId"),
    projectSessionId: parseIdentifier(
      record.projectSessionId,
      "intakeRevision.projectSessionId"
    ),
    coordinationRunId: parseIdentifier(
      record.coordinationRunId,
      "intakeRevision.coordinationRunId"
    ),
    expectedRevision: safeInteger(record.expectedRevision, "intakeRevision.expectedRevision", 1),
    state,
    summary: requiredString(record.summary, "intakeRevision.summary"),
    artifactRefs: parseArtifactRefs2(record.artifactRefs, "intakeRevision.artifactRefs"),
    gateIds: parseGateIds(record.gateIds, "intakeRevision.gateIds"),
    ...record.chairRequest === void 0 ? {} : { chairRequest: parseTaskRequest(record.chairRequest) }
  };
  if (revision.chairRequest !== void 0) {
    assertChairRequestBinding({
      path: "intakeRevision.chairRequest",
      chairRequest: revision.chairRequest,
      intakeId: revision.intakeId,
      intakeRevision: revision.expectedRevision + 1,
      projectSessionId: revision.projectSessionId,
      coordinationRunId: revision.coordinationRunId,
      artifactRefs: revision.artifactRefs,
      gateIds: revision.gateIds
    });
  }
  if (record.origin === "operator") {
    const command = parseOperatorMutationContext(record.command, "intakeRevision.command");
    if (command.expectedRevision !== revision.expectedRevision) {
      throw new TypeError("intakeRevision operator command revision does not match");
    }
    return { ...revision, origin: "operator", command };
  }
  if (record.origin === "chair") {
    const command = parseChairMutationContext(record.command, "intakeRevision.command");
    if (command.expectedRevision !== revision.expectedRevision) {
      throw new TypeError("intakeRevision chair command revision does not match");
    }
    if (command.projectSessionId !== revision.projectSessionId || command.coordinationRunId !== revision.coordinationRunId) {
      throw new TypeError("intakeRevision chair command session or run does not match intake");
    }
    return { ...revision, origin: "chair", command };
  }
  throw new TypeError("intakeRevision.origin must be operator or chair");
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/membership.ts
var memberIdentityFields = {
  "coordination-run": "runId",
  workstream: "workstreamId",
  task: "taskId",
  lease: "leaseId",
  "provider-action": "providerActionId",
  "required-message": "messageId",
  "artifact-obligation": "artifactObligationId",
  gate: "gateId",
  "scoped-barrier": "barrierId"
};
function parseProjectSessionMember(value, index) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`membershipBind.members[${String(index)}] must be an object`);
  }
  const kind = Reflect.get(value, "kind");
  if (typeof kind !== "string" || !Object.hasOwn(memberIdentityFields, kind)) {
    throw new TypeError(`membershipBind.members[${String(index)}].kind is invalid`);
  }
  const memberKind = kind;
  const identityField = memberIdentityFields[memberKind];
  const state = Reflect.get(value, "state");
  const fields = [
    "kind",
    "membershipId",
    "coordinationRunId",
    identityField,
    "state",
    ...state === "abandoned" ? ["reason"] : []
  ];
  const record = strictRecord(value, `membershipBind.members[${String(index)}]`, fields);
  const identity = parseIdentifier(record[identityField], `membershipBind.members[${String(index)}].${identityField}`);
  const common = {
    kind: memberKind,
    membershipId: parseIdentifier(
      record.membershipId,
      `membershipBind.members[${String(index)}].membershipId`
    ),
    coordinationRunId: parseIdentifier(
      record.coordinationRunId,
      `membershipBind.members[${String(index)}].coordinationRunId`
    ),
    [identityField]: identity
  };
  if (state === "active" || state === "terminal") {
    return { ...common, state };
  }
  if (state === "abandoned") {
    return {
      ...common,
      state,
      reason: requiredString(record.reason, `membershipBind.members[${String(index)}].reason`)
    };
  }
  throw new TypeError(`membershipBind.members[${String(index)}].state is invalid`);
}
function assertMemberRunBinding(coordinationRunId, members) {
  for (const [index, member] of members.entries()) {
    if (member.coordinationRunId !== coordinationRunId) {
      throw new TypeError(`membershipBind.members[${String(index)}] coordination run does not match batch`);
    }
    if (member.kind === "coordination-run" && member.runId !== coordinationRunId) {
      throw new TypeError(`membershipBind.members[${String(index)}] run ID does not match batch`);
    }
  }
}
function parseMembershipBindRequest(value) {
  const record = strictRecord(value, "membershipBind", [
    "origin",
    "command",
    "projectSessionId",
    "coordinationRunId",
    "expectedMembershipRevision",
    "members"
  ]);
  if (!Array.isArray(record.members)) throw new TypeError("membershipBind.members must be an array");
  const projectSessionId = parseIdentifier(
    record.projectSessionId,
    "membershipBind.projectSessionId"
  );
  const coordinationRunId = parseIdentifier(
    record.coordinationRunId,
    "membershipBind.coordinationRunId"
  );
  const members = record.members.map(parseProjectSessionMember);
  assertMemberRunBinding(coordinationRunId, members);
  const base = {
    projectSessionId,
    coordinationRunId,
    expectedMembershipRevision: safeInteger(
      record.expectedMembershipRevision,
      "membershipBind.expectedMembershipRevision"
    ),
    members
  };
  if (record.origin === "operator") {
    const command = parseOperatorMutationContext(record.command, "membershipBind.command");
    if (command.expectedRevision !== base.expectedMembershipRevision) {
      throw new TypeError("membershipBind command revision does not match membership revision");
    }
    return { ...base, origin: "operator", command };
  }
  if (record.origin === "chair") {
    const command = parseChairMutationContext(record.command, "membershipBind.command");
    if (command.expectedRevision !== base.expectedMembershipRevision) {
      throw new TypeError("membershipBind command revision does not match membership revision");
    }
    if (command.projectSessionId !== projectSessionId || command.coordinationRunId !== coordinationRunId) {
      throw new TypeError("membershipBind chair command session or run does not match batch");
    }
    return { ...base, origin: "chair", command };
  }
  throw new TypeError("membershipBind.origin must be operator or chair");
}
function parseMembershipBindResult(value) {
  const record = strictRecord(value, "membershipBindResult", [
    "projectSessionId",
    "coordinationRunId",
    "membershipRevision",
    "members"
  ]);
  if (!Array.isArray(record.members)) throw new TypeError("membershipBindResult.members must be an array");
  const coordinationRunId = parseIdentifier(
    record.coordinationRunId,
    "membershipBindResult.coordinationRunId"
  );
  const members = record.members.map(parseProjectSessionMember);
  assertMemberRunBinding(coordinationRunId, members);
  return {
    projectSessionId: parseIdentifier(
      record.projectSessionId,
      "membershipBindResult.projectSessionId"
    ),
    coordinationRunId,
    membershipRevision: safeInteger(record.membershipRevision, "membershipBindResult.membershipRevision", 1),
    members
  };
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/gates.ts
var GATE_ENFORCEMENT_POINTS = ["task-readiness", "operation", "scoped-barrier"];
function parseScopedGateCreateRequest(value) {
  const record = strictRecord(value, "scopedGateCreate", ["origin", "command", "intent"]);
  const intentRecord = strictRecord(record.intent, "scopedGateCreate.intent", [
    "projectSessionId",
    "coordinationRunId",
    "dedupeKey",
    "scope",
    "blockedOperationIds",
    "enforcementPoints",
    "question",
    "reason",
    "options",
    "recommendation",
    "consequences",
    "evidenceRefs",
    "deadline",
    "default",
    "releaseBinding"
  ]);
  const scope = parseScope(intentRecord.scope);
  const { blockedOperationIds, enforcementPoints } = parseEnforcementTargets(
    intentRecord.blockedOperationIds,
    intentRecord.enforcementPoints,
    "scopedGateCreate.intent"
  );
  if (!Array.isArray(intentRecord.evidenceRefs)) {
    throw new TypeError("scopedGateCreate.intent.evidenceRefs must be an array");
  }
  const releaseBinding = scope.kind === "release" ? parseReleaseBinding(intentRecord.releaseBinding) : intentRecord.releaseBinding === void 0 ? void 0 : (() => {
    throw new TypeError("scopedGateCreate.intent.releaseBinding is forbidden outside release scope");
  })();
  const parsedIntent = {
    projectSessionId: parseIdentifier(
      intentRecord.projectSessionId,
      "scopedGateCreate.intent.projectSessionId"
    ),
    coordinationRunId: parseIdentifier(
      intentRecord.coordinationRunId,
      "scopedGateCreate.intent.coordinationRunId"
    ),
    dedupeKey: requiredString(intentRecord.dedupeKey, "scopedGateCreate.intent.dedupeKey"),
    scope,
    blockedOperationIds,
    enforcementPoints,
    question: requiredString(intentRecord.question, "scopedGateCreate.intent.question"),
    reason: requiredString(intentRecord.reason, "scopedGateCreate.intent.reason"),
    options: stringArray(intentRecord.options, "scopedGateCreate.intent.options", 1),
    recommendation: typeof intentRecord.recommendation === "string" ? intentRecord.recommendation : "",
    consequences: stringArray(intentRecord.consequences, "scopedGateCreate.intent.consequences"),
    evidenceRefs: intentRecord.evidenceRefs.map((entry, index) => parseArtifactRef(
      entry,
      `scopedGateCreate.intent.evidenceRefs[${String(index)}]`
    )),
    ...intentRecord.deadline === void 0 ? {} : { deadline: parseTimestamp(intentRecord.deadline, "scopedGateCreate.intent.deadline") },
    ...intentRecord.default === void 0 ? {} : { default: requiredString(intentRecord.default, "scopedGateCreate.intent.default") },
    ...releaseBinding === void 0 ? {} : { releaseBinding }
  };
  if (record.origin === "operator") {
    return {
      origin: "operator",
      command: parseOperatorMutationContext(record.command, "scopedGateCreate.command"),
      intent: parsedIntent
    };
  }
  if (record.origin === "chair") {
    return {
      origin: "chair",
      command: parseChairMutationContext(record.command, "scopedGateCreate.command"),
      intent: parsedIntent
    };
  }
  throw new TypeError("scopedGateCreate.origin must be operator or chair");
}
function parseScopedGateResolveRequest(value) {
  const record = strictRecord(value, "scopedGateResolve", ["command", "gateId", "status", "decisionEvidence"]);
  const status = oneOf(record.status, ["approved", "rejected", "deferred", "cancelled"], "scopedGateResolve.status");
  if (typeof record.decisionEvidence !== "object" || record.decisionEvidence === null || Array.isArray(record.decisionEvidence)) {
    throw new TypeError("scopedGateResolve.decisionEvidence must be an object");
  }
  const kind = Reflect.get(record.decisionEvidence, "kind");
  if (kind === "typed-console") {
    const evidence = strictRecord(record.decisionEvidence, "scopedGateResolve.decisionEvidence", [
      "kind",
      "confirmationCommandId"
    ]);
    if (evidence.confirmationCommandId === void 0) {
      throw new TypeError("scopedGateResolve.decisionEvidence.confirmationCommandId is required");
    }
    return {
      command: parseOperatorMutationContext(record.command, "scopedGateResolve.command"),
      gateId: parseIdentifier(record.gateId, "scopedGateResolve.gateId"),
      status,
      decisionEvidence: {
        kind,
        confirmationCommandId: parseIdentifier(
          evidence.confirmationCommandId,
          "scopedGateResolve.decisionEvidence.confirmationCommandId"
        )
      }
    };
  }
  if (kind === "attested-input") {
    const evidence = strictRecord(record.decisionEvidence, "scopedGateResolve.decisionEvidence", [
      "kind",
      "attestationId",
      "expectedIntegrationGeneration"
    ]);
    return {
      command: parseOperatorMutationContext(record.command, "scopedGateResolve.command"),
      gateId: parseIdentifier(record.gateId, "scopedGateResolve.gateId"),
      status,
      decisionEvidence: {
        kind,
        attestationId: parseIdentifier(
          evidence.attestationId,
          "scopedGateResolve.decisionEvidence.attestationId"
        ),
        expectedIntegrationGeneration: safeInteger(
          evidence.expectedIntegrationGeneration,
          "scopedGateResolve.decisionEvidence.expectedIntegrationGeneration",
          1
        )
      }
    };
  }
  throw new TypeError("scopedGateResolve.decisionEvidence.kind is invalid");
}
function parseScopedGateCheckRequest(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("scopedGateCheck must be an object");
  }
  const enforcementPoint = Reflect.get(value, "enforcementPoint");
  const targetField = enforcementPoint === "task-readiness" ? "taskId" : enforcementPoint === "operation" ? "operationId" : enforcementPoint === "scoped-barrier" ? "barrierId" : void 0;
  const record = strictRecord(value, "scopedGateCheck", [
    "projectSessionId",
    "coordinationRunId",
    "dependencyRevision",
    "enforcementPoint",
    ...targetField === void 0 ? [] : [targetField]
  ]);
  const base = {
    projectSessionId: parseIdentifier(record.projectSessionId, "scopedGateCheck.projectSessionId"),
    coordinationRunId: parseIdentifier(
      record.coordinationRunId,
      "scopedGateCheck.coordinationRunId"
    ),
    dependencyRevision: safeInteger(record.dependencyRevision, "scopedGateCheck.dependencyRevision")
  };
  if (enforcementPoint === "task-readiness") {
    if (record.taskId === void 0) throw new TypeError("scopedGateCheck.taskId is required");
    return {
      ...base,
      enforcementPoint,
      taskId: parseIdentifier(record.taskId, "scopedGateCheck.taskId")
    };
  }
  if (enforcementPoint === "operation") {
    if (record.operationId === void 0) throw new TypeError("scopedGateCheck.operationId is required");
    if (typeof record.operationId !== "string" || !isActiveFabricOperation(record.operationId)) {
      throw new TypeError("scopedGateCheck.operationId is not a protocol operation");
    }
    return { ...base, enforcementPoint, operationId: record.operationId };
  }
  if (enforcementPoint === "scoped-barrier") {
    if (record.barrierId === void 0) throw new TypeError("scopedGateCheck.barrierId is required");
    return {
      ...base,
      enforcementPoint,
      barrierId: parseIdentifier(record.barrierId, "scopedGateCheck.barrierId")
    };
  }
  throw new TypeError("scopedGateCheck.enforcementPoint is invalid");
}
function parseScope(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("scopedGate.scope must be an object");
  const kind = Reflect.get(value, "kind");
  if (kind === "task") {
    const record = strictRecord(value, "scopedGate.scope", ["kind", "taskId"]);
    return { kind, taskId: parseIdentifier(record.taskId, "scopedGate.scope.taskId") };
  }
  if (kind === "subtree") {
    const record = strictRecord(value, "scopedGate.scope", ["kind", "rootTaskId"]);
    return { kind, rootTaskId: parseIdentifier(record.rootTaskId, "scopedGate.scope.rootTaskId") };
  }
  if (kind === "run" || kind === "release") {
    strictRecord(value, "scopedGate.scope", ["kind"]);
    return { kind };
  }
  throw new TypeError("scopedGate.scope.kind is invalid");
}
function parseReleaseBinding(value) {
  if (value === void 0) throw new TypeError("scopedGate.releaseBinding is required for release scope");
  const record = strictRecord(value, "scopedGate.releaseBinding", [
    "acceptedDeliveryReceiptRef",
    "artifactDigest",
    "promotionAction",
    "target"
  ]);
  return {
    acceptedDeliveryReceiptRef: parseArtifactRef(
      record.acceptedDeliveryReceiptRef,
      "scopedGate.releaseBinding.acceptedDeliveryReceiptRef"
    ),
    artifactDigest: parseSha256Digest(record.artifactDigest, "scopedGate.releaseBinding.artifactDigest"),
    promotionAction: requiredString(record.promotionAction, "scopedGate.releaseBinding.promotionAction"),
    target: requiredString(record.target, "scopedGate.releaseBinding.target")
  };
}
function parseEnforcementTargets(blockedValue, enforcementValue, path) {
  if (!Array.isArray(blockedValue)) throw new TypeError(`${path}.blockedOperationIds must be an array`);
  const blockedOperationIds = blockedValue.map((operation, index) => {
    if (typeof operation !== "string" || !isActiveFabricOperation(operation)) {
      throw new TypeError(`${path}.blockedOperationIds[${String(index)}] is not an active protocol operation`);
    }
    return operation;
  });
  if (new Set(blockedOperationIds).size !== blockedOperationIds.length) {
    throw new TypeError(`${path}.blockedOperationIds must not contain duplicates`);
  }
  if (!Array.isArray(enforcementValue) || enforcementValue.length === 0) {
    throw new TypeError(`${path}.enforcementPoints must be non-empty`);
  }
  const enforcementPoints = enforcementValue.map((point, index) => {
    const match = GATE_ENFORCEMENT_POINTS.find((candidate) => candidate === point);
    if (match === void 0) throw new TypeError(`${path}.enforcementPoints[${String(index)}] is invalid`);
    return match;
  });
  if (new Set(enforcementPoints).size !== enforcementPoints.length) {
    throw new TypeError(`${path}.enforcementPoints must not contain duplicates`);
  }
  if (enforcementPoints.includes("operation") && blockedOperationIds.length === 0) {
    throw new TypeError(`${path}.blockedOperationIds must be non-empty for operation enforcement`);
  }
  if (!enforcementPoints.includes("operation") && blockedOperationIds.length > 0) {
    throw new TypeError(`${path}.blockedOperationIds require the operation enforcement point`);
  }
  return { blockedOperationIds, enforcementPoints };
}
function parseResolution(value) {
  if (value === void 0) throw new TypeError("scopedGate.resolution is required for resolved status");
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("scopedGate.resolution must be an object");
  }
  const kind = Reflect.get(value, "kind");
  const fields = kind === "typed-console" ? ["kind", "operatorId", "confirmationCommandId", "decidedAt", "evidenceRefs"] : kind === "attested-input" ? ["kind", "operatorId", "attestationId", "integrationId", "integrationGeneration", "decidedAt", "evidenceRefs"] : ["kind"];
  const record = strictRecord(value, "scopedGate.resolution", fields);
  if (!Array.isArray(record.evidenceRefs)) throw new TypeError("scopedGate.resolution.evidenceRefs must be an array");
  const base = {
    operatorId: parseIdentifier(record.operatorId, "scopedGate.resolution.operatorId"),
    decidedAt: parseTimestamp(record.decidedAt, "scopedGate.resolution.decidedAt"),
    evidenceRefs: record.evidenceRefs.map((entry, index) => parseArtifactRef(
      entry,
      `scopedGate.resolution.evidenceRefs[${String(index)}]`
    ))
  };
  if (kind === "typed-console") {
    return {
      ...base,
      kind,
      confirmationCommandId: parseIdentifier(
        record.confirmationCommandId,
        "scopedGate.resolution.confirmationCommandId"
      )
    };
  }
  if (kind === "attested-input") {
    return {
      ...base,
      kind,
      attestationId: parseIdentifier(
        record.attestationId,
        "scopedGate.resolution.attestationId"
      ),
      integrationId: requiredString(record.integrationId, "scopedGate.resolution.integrationId"),
      integrationGeneration: safeInteger(
        record.integrationGeneration,
        "scopedGate.resolution.integrationGeneration",
        1
      )
    };
  }
  throw new TypeError("scopedGate.resolution.kind is invalid");
}
function parseScopedGate(value) {
  const record = strictRecord(value, "scopedGate", [
    "gateId",
    "projectSessionId",
    "coordinationRunId",
    "scope",
    "affectedTaskIds",
    "dependencyRevision",
    "blockedOperationIds",
    "enforcementPoints",
    "question",
    "reason",
    "options",
    "recommendation",
    "consequences",
    "evidenceRefs",
    "revision",
    "createdByRef",
    "expectedApproverRef",
    "deadline",
    "default",
    "status",
    "resolution",
    "releaseBinding"
  ]);
  const scope = parseScope(record.scope);
  if (!Array.isArray(record.affectedTaskIds)) throw new TypeError("scopedGate.affectedTaskIds must be an array");
  const { blockedOperationIds, enforcementPoints } = parseEnforcementTargets(
    record.blockedOperationIds,
    record.enforcementPoints,
    "scopedGate"
  );
  if (!Array.isArray(record.evidenceRefs)) throw new TypeError("scopedGate.evidenceRefs must be an array");
  const base = {
    gateId: parseIdentifier(record.gateId, "scopedGate.gateId"),
    projectSessionId: parseIdentifier(record.projectSessionId, "scopedGate.projectSessionId"),
    coordinationRunId: parseIdentifier(
      record.coordinationRunId,
      "scopedGate.coordinationRunId"
    ),
    scope,
    affectedTaskIds: record.affectedTaskIds.map((taskId, index) => parseIdentifier(
      taskId,
      `scopedGate.affectedTaskIds[${String(index)}]`
    )),
    dependencyRevision: safeInteger(record.dependencyRevision, "scopedGate.dependencyRevision"),
    blockedOperationIds,
    enforcementPoints,
    question: requiredString(record.question, "scopedGate.question"),
    reason: requiredString(record.reason, "scopedGate.reason"),
    options: stringArray(record.options, "scopedGate.options", 1),
    recommendation: typeof record.recommendation === "string" ? record.recommendation : "",
    consequences: stringArray(record.consequences, "scopedGate.consequences"),
    evidenceRefs: record.evidenceRefs.map((entry, index) => parseArtifactRef(entry, `scopedGate.evidenceRefs[${String(index)}]`)),
    revision: safeInteger(record.revision, "scopedGate.revision", 1),
    createdByRef: requiredString(record.createdByRef, "scopedGate.createdByRef"),
    expectedApproverRef: requiredString(record.expectedApproverRef, "scopedGate.expectedApproverRef"),
    ...record.deadline === void 0 ? {} : { deadline: parseTimestamp(record.deadline, "scopedGate.deadline") },
    ...record.default === void 0 ? {} : { default: requiredString(record.default, "scopedGate.default") }
  };
  const releaseBinding = scope.kind === "release" ? parseReleaseBinding(record.releaseBinding) : record.releaseBinding === void 0 ? void 0 : (() => {
    throw new TypeError("scopedGate.releaseBinding is forbidden outside release scope");
  })();
  const status = record.status;
  if (status === "pending" || status === "deferred") {
    if (record.resolution !== void 0) throw new TypeError("scopedGate.resolution is forbidden for unresolved status");
    return { ...base, status, ...releaseBinding === void 0 ? {} : { releaseBinding } };
  }
  if (status === "approved" || status === "rejected" || status === "cancelled" || status === "superseded") {
    return { ...base, status, resolution: parseResolution(record.resolution), ...releaseBinding === void 0 ? {} : { releaseBinding } };
  }
  throw new TypeError("scopedGate.status is invalid");
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/project-session.ts
var PROJECT_SESSION_STATES = [
  "draft",
  "awaiting_launch",
  "launching",
  "active",
  "quiescing",
  "awaiting_acceptance",
  "closed",
  "launch_failed",
  "launch_ambiguous",
  "reconciling",
  "visibility_degraded",
  "recovery_required",
  "quarantined",
  "cancelled"
];
var sessionFields = [
  "projectSessionId",
  "projectId",
  "mode",
  "state",
  "revision",
  "generation",
  "authorityRef",
  "budgetRef",
  "launchPacketRef",
  "membershipRevision",
  "origin",
  "terminalPath"
];
function parseOrigin(value) {
  const kindRecord = strictRecordWithKnownKind(value, "projectSession.origin");
  if (kindRecord.kind === "operator-launch") {
    const record = strictRecord(value, "projectSession.origin", ["kind", "operatorId"]);
    return {
      kind: "operator-launch",
      operatorId: parseIdentifier(record.operatorId, "projectSession.origin.operatorId")
    };
  }
  if (kindRecord.kind === "legacy-migration") {
    const record = strictRecord(value, "projectSession.origin", ["kind", "migrationManifestRef"]);
    return {
      kind: "legacy-migration",
      migrationManifestRef: parseArtifactRef(record.migrationManifestRef, "projectSession.origin.migrationManifestRef")
    };
  }
  throw new TypeError("projectSession.origin.kind must be operator-launch or legacy-migration");
}
function strictRecordWithKnownKind(value, path) {
  const record = strictRecord(value, path, Object.keys(typeof value === "object" && value !== null ? value : {}));
  if (!("kind" in record)) throw new TypeError(`${path}.kind is required`);
  return Object.assign(record, { kind: record.kind });
}
function parseTerminalPath(value, state) {
  if (value === void 0) throw new TypeError(`projectSession.terminalPath is required when state is ${state}`);
  const discriminant = strictRecordWithKnownKind(value, "projectSession.terminalPath");
  if (discriminant.kind === "accepted") {
    const record = strictRecord(value, "projectSession.terminalPath", ["kind", "acceptanceRef"]);
    return {
      kind: "accepted",
      acceptanceRef: parseSha256Digest(record.acceptanceRef, "projectSession.terminalPath.acceptanceRef")
    };
  }
  if (discriminant.kind === "cancelled") {
    const record = strictRecord(value, "projectSession.terminalPath", ["kind", "reason"]);
    if (typeof record.reason !== "string" || record.reason.length === 0) {
      throw new TypeError("projectSession.terminalPath.reason must be a non-empty string");
    }
    return { kind: "cancelled", reason: record.reason };
  }
  if (discriminant.kind === "failed") {
    const record = strictRecord(value, "projectSession.terminalPath", ["kind", "reason", "failureRef"]);
    if (typeof record.reason !== "string" || record.reason.length === 0) {
      throw new TypeError("projectSession.terminalPath.reason must be a non-empty string");
    }
    return {
      kind: "failed",
      reason: record.reason,
      failureRef: parseSha256Digest(record.failureRef, "projectSession.terminalPath.failureRef")
    };
  }
  throw new TypeError("projectSession.terminalPath.kind is invalid");
}
function parseSessionState(value) {
  if (typeof value !== "string") throw new TypeError("projectSession.state is invalid");
  const state = PROJECT_SESSION_STATES.find((candidate) => candidate === value);
  if (state === void 0) throw new TypeError("projectSession.state is invalid");
  return state;
}
function parseProjectSession(value) {
  const record = strictRecord(value, "projectSession", sessionFields);
  const state = parseSessionState(record.state);
  const base = {
    projectSessionId: parseIdentifier(record.projectSessionId, "projectSession.projectSessionId"),
    projectId: parseIdentifier(record.projectId, "projectSession.projectId"),
    mode: record.mode === "coordinated" || record.mode === "independent" ? record.mode : (() => {
      throw new TypeError("projectSession.mode is invalid");
    })(),
    revision: safeInteger(record.revision, "projectSession.revision"),
    generation: safeInteger(record.generation, "projectSession.generation", 1),
    authorityRef: parseSha256Digest(record.authorityRef, "projectSession.authorityRef"),
    budgetRef: typeof record.budgetRef === "string" && record.budgetRef.length > 0 ? record.budgetRef : (() => {
      throw new TypeError("projectSession.budgetRef must be a non-empty string");
    })(),
    launchPacketRef: parseArtifactRef(record.launchPacketRef, "projectSession.launchPacketRef"),
    membershipRevision: safeInteger(record.membershipRevision, "projectSession.membershipRevision"),
    origin: parseOrigin(record.origin)
  };
  if (state === "closed") return { ...base, state, terminalPath: parseTerminalPath(record.terminalPath, state) };
  if (state === "cancelled") {
    const terminalPath = parseTerminalPath(record.terminalPath, state);
    if (terminalPath.kind !== "cancelled") {
      throw new TypeError("projectSession.terminalPath must be cancelled when state is cancelled");
    }
    return { ...base, state, terminalPath };
  }
  if (record.terminalPath !== void 0) {
    throw new TypeError(`projectSession.terminalPath is forbidden when state is ${state}`);
  }
  return { ...base, state };
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/resources.ts
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
var baseUnitKeys = /* @__PURE__ */ new Set([
  "provider_calls",
  "concurrent_turns",
  "descendants",
  "message_bytes",
  "artifact_bytes",
  "wall_clock_milliseconds"
]);
function isResourceUnitKey(value) {
  return baseUnitKeys.has(value) || /^cost:[A-Z]{3}$/u.test(value) || /^(?:input_tokens|output_tokens):[a-z0-9][a-z0-9._-]{0,63}$/u.test(value);
}
function parseAmounts(value, path) {
  const record = strictRecord(value, path, typeof value === "object" && value !== null ? Object.keys(value) : []);
  if (Object.keys(record).length === 0) throw new TypeError(`${path} must not be empty`);
  const parsed = {};
  for (const [unit, amount] of Object.entries(record)) {
    if (!isResourceUnitKey(unit)) throw new TypeError(`${path}.${unit} is not a qualified resource unit`);
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
      throw new TypeError(`${path}.${unit} must be a non-negative safe integer`);
    }
    parsed[unit] = amount;
  }
  return parsed;
}
function parseScope2(value, index) {
  const path = `resourceReservation.path[${String(index)}]`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  const kind = Reflect.get(value, "kind");
  const commonScopeId = () => parseIdentifier(Reflect.get(value, "scopeId"), `${path}.scopeId`);
  if (kind === "project") {
    const record = strictRecord(value, path, ["kind", "scopeId", "projectId"]);
    return { kind, scopeId: commonScopeId(), projectId: parseIdentifier(record.projectId, `${path}.projectId`) };
  }
  if (kind === "project-session") {
    const record = strictRecord(value, path, ["kind", "scopeId", "projectId", "projectSessionId"]);
    return {
      kind,
      scopeId: commonScopeId(),
      projectId: parseIdentifier(record.projectId, `${path}.projectId`),
      projectSessionId: parseIdentifier(record.projectSessionId, `${path}.projectSessionId`)
    };
  }
  if (kind === "coordination-run") {
    const record = strictRecord(value, path, ["kind", "scopeId", "projectSessionId", "coordinationRunId"]);
    return {
      kind,
      scopeId: commonScopeId(),
      projectSessionId: parseIdentifier(record.projectSessionId, `${path}.projectSessionId`),
      coordinationRunId: parseIdentifier(record.coordinationRunId, `${path}.coordinationRunId`)
    };
  }
  if (kind === "team") {
    const record = strictRecord(value, path, ["kind", "scopeId", "coordinationRunId", "teamId"]);
    return {
      kind,
      scopeId: commonScopeId(),
      coordinationRunId: parseIdentifier(record.coordinationRunId, `${path}.coordinationRunId`),
      teamId: parseIdentifier(record.teamId, `${path}.teamId`)
    };
  }
  if (kind === "agent") {
    const record = strictRecord(value, path, ["kind", "scopeId", "teamId", "agentId"]);
    return {
      kind,
      scopeId: commonScopeId(),
      teamId: parseIdentifier(record.teamId, `${path}.teamId`),
      agentId: parseIdentifier(record.agentId, `${path}.agentId`)
    };
  }
  throw new TypeError(`${path}.kind is invalid`);
}
var scopeRank = {
  project: 0,
  "project-session": 1,
  "coordination-run": 2,
  team: 3,
  agent: 4
};
function isWithin(root, candidate) {
  const child = relative(root, candidate);
  return child === "" || child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}
function nearestExistingAncestor(path) {
  let candidate = path;
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) throw new TypeError("writer admission path has no existing ancestor");
    candidate = parent;
  }
  return candidate;
}
function assertSourcePrefixesContained(admission, requireExistingWorktree) {
  if (requireExistingWorktree && !existsSync(admission.worktreePath)) {
    throw new TypeError("resourceReservation.writerAdmission.worktreePath must exist at admission time");
  }
  const confinementRoot = existsSync(admission.worktreePath) ? realpathSync(admission.worktreePath) : admission.repositoryRoot;
  for (const [index, prefix] of admission.sourcePrefixes.entries()) {
    const target = resolve(admission.worktreePath, prefix);
    if (!isWithin(admission.worktreePath, target)) {
      throw new TypeError(
        `resourceReservation.writerAdmission.sourcePrefixes[${String(index)}] escapes the worktree`
      );
    }
    const resolvedAncestor = realpathSync(nearestExistingAncestor(target));
    if (!isWithin(admission.repositoryRoot, resolvedAncestor) || !isWithin(confinementRoot, resolvedAncestor)) {
      throw new TypeError(
        `resourceReservation.writerAdmission.sourcePrefixes[${String(index)}] is a symlink escape`
      );
    }
  }
}
function parseWriterAdmission(value) {
  const record = strictRecord(value, "resourceReservation.writerAdmission", [
    "repositoryRoot",
    "worktreePath",
    "sourcePrefixes",
    "writerGeneration"
  ]);
  const repositoryInput = requiredString(
    record.repositoryRoot,
    "resourceReservation.writerAdmission.repositoryRoot"
  );
  if (!isAbsolute(repositoryInput)) {
    throw new TypeError("resourceReservation.writerAdmission.repositoryRoot must be absolute");
  }
  const repositoryRoot = resolve(repositoryInput);
  const repositoryStat = lstatSync(repositoryRoot);
  if (!repositoryStat.isDirectory() || repositoryStat.isSymbolicLink() || realpathSync(repositoryRoot) !== repositoryRoot) {
    throw new TypeError("resourceReservation.writerAdmission.repositoryRoot must be a canonical non-symlink directory");
  }
  const worktreeInput = requiredString(record.worktreePath, "resourceReservation.writerAdmission.worktreePath");
  if (!isAbsolute(worktreeInput)) {
    throw new TypeError("resourceReservation.writerAdmission.worktreePath must be absolute");
  }
  const worktreePath = resolve(worktreeInput);
  const worktreesRoot = resolve(repositoryRoot, ".worktrees");
  const worktreeRelative = relative(worktreesRoot, worktreePath);
  if (worktreeRelative === "" || worktreeRelative === ".." || worktreeRelative.startsWith(`..${sep}`) || isAbsolute(worktreeRelative) || worktreeRelative.includes(sep)) {
    throw new TypeError("resourceReservation.writerAdmission.worktreePath must be one direct child under repositoryRoot/.worktrees");
  }
  if (existsSync(worktreesRoot)) {
    const worktreesStat = lstatSync(worktreesRoot);
    if (!worktreesStat.isDirectory() || worktreesStat.isSymbolicLink() || realpathSync(worktreesRoot) !== worktreesRoot) {
      throw new TypeError("resourceReservation.writerAdmission .worktrees root must not be a symlink escape");
    }
  }
  if (existsSync(worktreePath)) {
    const worktreeStat = lstatSync(worktreePath);
    if (!worktreeStat.isDirectory() || worktreeStat.isSymbolicLink()) {
      throw new TypeError("resourceReservation.writerAdmission.worktreePath must not be a symlink escape");
    }
    if (dirname(realpathSync(worktreePath)) !== realpathSync(worktreesRoot)) {
      throw new TypeError("resourceReservation.writerAdmission.worktreePath escapes repositoryRoot/.worktrees");
    }
  }
  if (!Array.isArray(record.sourcePrefixes) || record.sourcePrefixes.length === 0) {
    throw new TypeError("resourceReservation.writerAdmission.sourcePrefixes must not be empty");
  }
  const sourcePrefixes = record.sourcePrefixes.map((prefix, index) => {
    return parseCanonicalRelativePath(
      prefix,
      `resourceReservation.writerAdmission.sourcePrefixes[${String(index)}]`
    );
  });
  const admission = {
    repositoryRoot,
    worktreePath,
    sourcePrefixes,
    writerGeneration: safeInteger(record.writerGeneration, "resourceReservation.writerAdmission.writerGeneration", 1)
  };
  assertSourcePrefixesContained(admission, false);
  return admission;
}
function parseResourceReservationRequest(value) {
  const record = strictRecord(value, "resourceReservation", [
    "commandId",
    "reservationId",
    "projectSessionId",
    "path",
    "amounts",
    "taskId",
    "writerAdmission"
  ]);
  if (!Array.isArray(record.path) || record.path.length < 2) {
    throw new TypeError("resourceReservation.path must include project and project-session ancestors");
  }
  const path = record.path.map((scope, index) => parseScope2(scope, index));
  if (path[0]?.kind !== "project" || path[1]?.kind !== "project-session") {
    throw new TypeError("resourceReservation.path must begin with project then project-session");
  }
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (previous === void 0 || current === void 0 || scopeRank[current.kind] !== scopeRank[previous.kind] + 1) {
      throw new TypeError("resourceReservation.path must be a contiguous ancestor chain");
    }
  }
  if (path[0].projectId !== path[1].projectId) {
    throw new TypeError("resourceReservation ancestor identity mismatch: project -> project-session");
  }
  const runScope = path[2];
  if (runScope !== void 0 && runScope.kind === "coordination-run" && runScope.projectSessionId !== path[1].projectSessionId) {
    throw new TypeError("resourceReservation ancestor identity mismatch: project-session -> coordination-run");
  }
  const teamScope = path[3];
  if (runScope !== void 0 && runScope.kind === "coordination-run" && teamScope !== void 0 && teamScope.kind === "team" && teamScope.coordinationRunId !== runScope.coordinationRunId) {
    throw new TypeError("resourceReservation ancestor identity mismatch: coordination-run -> team");
  }
  const agentScope = path[4];
  if (teamScope !== void 0 && teamScope.kind === "team" && agentScope !== void 0 && agentScope.kind === "agent" && agentScope.teamId !== teamScope.teamId) {
    throw new TypeError("resourceReservation ancestor identity mismatch: team -> agent");
  }
  const projectSessionId = parseIdentifier(
    record.projectSessionId,
    "resourceReservation.projectSessionId"
  );
  if (path[1].projectSessionId !== projectSessionId) {
    throw new TypeError("resourceReservation.path project session does not match request");
  }
  return {
    commandId: parseIdentifier(record.commandId, "resourceReservation.commandId"),
    reservationId: parseIdentifier(record.reservationId, "resourceReservation.reservationId"),
    projectSessionId,
    path,
    amounts: parseAmounts(record.amounts, "resourceReservation.amounts"),
    ...record.taskId === void 0 ? {} : { taskId: parseIdentifier(record.taskId, "resourceReservation.taskId") },
    ...record.writerAdmission === void 0 ? {} : { writerAdmission: parseWriterAdmission(record.writerAdmission) }
  };
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/launch.ts
var RESOURCE_UNIT_PATTERN = "^(?:provider_calls|concurrent_turns|descendants|message_bytes|artifact_bytes|wall_clock_milliseconds|cost:[A-Z]{3}|(?:input_tokens|output_tokens):[a-z0-9][a-z0-9._-]{0,63})$";
var activeAgentOperations = Object.values(OPERATION_REGISTRY).filter((entry) => entry.kind !== "retired" && entry.principals.includes("agent")).map((entry) => entry.operation);
var firstAgentOperation = activeAgentOperations[0];
if (firstAgentOperation === void 0) throw new Error("launch authority requires at least one active agent operation");
var agentAuthorityOperationCodec = defineCodec({
  type: "string",
  enum: activeAgentOperations
}, firstAgentOperation, (value, path) => parseAgentOperation(value, path));
var chairAuthorityPathCodec = defineCodec({
  oneOf: [{ const: "." }, relativePath.schema]
}, ".", parseChairAuthorityPath);
var disclosureCodec = objectCodec({ level: literal("allowed") });
var scopedDisclosureCodec = objectCodec({
  level: literal("scoped"),
  scopes: arrayOf(defineCodec({
    type: "string",
    enum: ["local", "approved-provider", "external"]
  }, "local", parseDisclosureTarget), { minimum: 1, maximum: 3, unique: true })
});
var forbiddenDisclosureCodec = objectCodec({ level: literal("forbidden") });
var disclosureTargetsCodec = arrayOf(defineCodec({
  type: "string",
  enum: ["local", "approved-provider", "external"]
}, "local", parseDisclosureTarget), { maximum: 3, unique: true });
var resourceAmountsCodec = recordOf(integer(), {
  maximum: 128,
  keyPattern: RESOURCE_UNIT_PATTERN,
  exampleKey: "concurrent_turns"
});
var nonEmptyResourceAmountsCodec = recordOf(integer(), {
  minimum: 1,
  maximum: 128,
  keyPattern: RESOURCE_UNIT_PATTERN,
  exampleKey: "concurrent_turns"
});
var chairAuthorityCodec = objectCodec({
  workspaceRoots: arrayOf(chairAuthorityPathCodec, { minimum: 1, maximum: 64, unique: true }),
  sourcePaths: arrayOf(chairAuthorityPathCodec, { maximum: 256, unique: true }),
  artifactPaths: arrayOf(chairAuthorityPathCodec, { maximum: 256, unique: true }),
  actions: arrayOf(agentAuthorityOperationCodec, { maximum: 256, unique: true }),
  disclosure: defineCodec({
    oneOf: [
      disclosureCodec.schema,
      scopedDisclosureCodec.schema,
      forbiddenDisclosureCodec.schema,
      disclosureTargetsCodec.schema
    ]
  }, { level: "forbidden" }, parseDisclosure),
  expiresAt: timestamp,
  budget: resourceAmountsCodec
}, {
  deniedPaths: arrayOf(chairAuthorityPathCodec, { maximum: 256, unique: true }),
  deniedActions: arrayOf(agentAuthorityOperationCodec, { maximum: 256, unique: true })
});
var artifactRefCodec = objectCodec({ path: relativePath, digest: sha256 });
var launchPacketBaseCodec = objectCodec({
  schemaVersion: literal(1),
  projectId: defineIdentifierCodec("project_01"),
  projectSessionId: defineIdentifierCodec("ps_01"),
  runId: defineIdentifierCodec("run_01"),
  chairAgentId: defineIdentifierCodec("agent_chair_01"),
  projectRunDirectory: relativePath,
  topologyMode: defineCodec({ type: "string", enum: ["coordinated", "independent"] }, "coordinated", parseTopologyMode),
  budgetRef: defineIdentifierCodec("budget_01"),
  resourcePlanRef: artifactRefCodec,
  chairAuthority: chairAuthorityCodec,
  provider: objectCodec({
    adapterId: defineIdentifierCodec("claude-agent-sdk"),
    actionId: defineIdentifierCodec("provider_action_01"),
    contractDigest: sha256,
    inputSchemaId: defineIdentifierCodec("provider-launch.v1"),
    input: recordOf(jsonValue, { maximum: 256 })
  })
});
var launchResourceScopePlanCodec = objectCodec({
  scopeId: defineIdentifierCodec("scope_01"),
  limits: nonEmptyResourceAmountsCodec
});
var launchResourcePlanBaseCodec = objectCodec({
  schemaVersion: literal(1),
  projectId: defineIdentifierCodec("project_01"),
  projectSessionId: defineIdentifierCodec("ps_01"),
  runId: defineIdentifierCodec("run_01"),
  budgetRef: defineIdentifierCodec("budget_01"),
  scopes: objectCodec({
    project: launchResourceScopePlanCodec,
    projectSession: launchResourceScopePlanCodec,
    coordinationRun: launchResourceScopePlanCodec
  }),
  launchReservation: objectCodec({ amounts: nonEmptyResourceAmountsCodec })
});
var launchProviderActionIdentityCodec = objectCodec({
  providerAdapterId: defineIdentifierCodec("claude-agent-sdk"),
  providerActionId: defineIdentifierCodec("provider_action_01")
});
var projectSessionLaunchIntentBaseCodec = objectCodec({
  kind: literal("project-session-launch"),
  projectId: defineIdentifierCodec("project_01"),
  projectSessionId: defineIdentifierCodec("ps_01"),
  expectedProjectRevision: integer({ minimum: 1 }),
  expectedSessionRevision: integer({ minimum: 1 }),
  expectedSessionGeneration: integer({ minimum: 1 }),
  trustRecordDigest: sha256,
  launchPacketRef: artifactRefCodec,
  authorityRef: sha256,
  budgetRef: defineIdentifierCodec("budget_01"),
  resourcePlanRef: artifactRefCodec,
  providerAdapterId: defineIdentifierCodec("claude-agent-sdk"),
  providerActionId: defineIdentifierCodec("provider_action_01"),
  providerContractDigest: sha256,
  resourceStateDigest: sha256
}, { retryOf: launchProviderActionIdentityCodec });
var launchCurrentStateCommonCodecs = {
  schemaVersion: literal(1),
  projectId: defineIdentifierCodec("project_01"),
  projectRevision: integer({ minimum: 1 }),
  projectSessionId: defineIdentifierCodec("ps_01"),
  sessionRevision: integer({ minimum: 1 }),
  sessionGeneration: integer({ minimum: 1 }),
  currentLaunchPacketRef: artifactRefCodec,
  trustRecordDigest: sha256,
  providerAdapterId: defineIdentifierCodec("claude-agent-sdk"),
  providerContractDigest: sha256,
  resourceStateDigest: sha256
};
var projectSessionLaunchCurrentStateExample = parseProjectSessionLaunchCurrentState({
  schemaVersion: 1,
  projectId: "project_01",
  projectRevision: 1,
  projectSessionId: "ps_01",
  sessionRevision: 1,
  sessionGeneration: 1,
  sessionState: "awaiting_launch",
  currentLaunchPacketRef: { path: "launch/packet.json", digest: sha256.example },
  trustRecordDigest: sha256.example,
  providerAdapterId: "claude-agent-sdk",
  providerContractDigest: sha256.example,
  resourceStateDigest: sha256.example,
  provedFailedAttempt: null
});
var projectSessionLaunchCurrentStateBaseCodec = defineCodec({
  oneOf: [
    objectCodec({
      ...launchCurrentStateCommonCodecs,
      sessionState: literal("awaiting_launch"),
      provedFailedAttempt: literal(null)
    }).schema,
    objectCodec({
      ...launchCurrentStateCommonCodecs,
      sessionState: literal("launch_failed"),
      provedFailedAttempt: launchProviderActionIdentityCodec
    }).schema
  ]
}, projectSessionLaunchCurrentStateExample, (value, path) => parseProjectSessionLaunchCurrentState(value, path));
var resourceUsageCodec = recordOf(unionOf([integer(), literal("unknown")]), {
  minimum: 1,
  maximum: 128,
  keyPattern: RESOURCE_UNIT_PATTERN,
  exampleKey: "concurrent_turns"
});
var launchOutcomeCommonCodecs = {
  schemaVersion: literal(1),
  providerAdapterId: defineIdentifierCodec("claude-agent-sdk"),
  providerActionId: defineIdentifierCodec("provider_action_01"),
  providerContractDigest: sha256,
  observationKind: enumeration(["dispatch-return", "lookup"]),
  observedAt: timestamp
};
var terminalSuccessCodec = objectCodec({
  kind: literal("terminal-success"),
  providerSessionRef: defineIdentifierCodec("provider_session_01"),
  providerSessionGeneration: integer({ minimum: 1 }),
  effectDigest: sha256,
  resourceUsage: resourceUsageCodec
});
var terminalNoEffectCodec = objectCodec({
  kind: literal("terminal-no-effect"),
  failureCode: defineIdentifierCodec("provider-rejected"),
  noEffectProof: objectCodec({
    schemaId: defineIdentifierCodec("provider-no-effect.v1"),
    proof: jsonValue,
    digest: sha256
  })
});
var ambiguousOutcomeCodec = objectCodec({
  kind: literal("ambiguous"),
  reasonCode: enumeration([
    "absent",
    "transport-error",
    "adapter-error",
    "malformed",
    "incomplete",
    "conflict",
    "missing-resume-reference"
  ]),
  evidenceDigest: nullable(sha256)
});
var launchAdapterOutcomeBaseCodec = objectCodec({
  ...launchOutcomeCommonCodecs,
  outcome: unionOf([terminalSuccessCodec, terminalNoEffectCodec, ambiguousOutcomeCodec])
});
var providerActionRefCommonCodecs = {
  schemaVersion: literal(1),
  projectSessionId: defineIdentifierCodec("ps_01"),
  coordinationRunId: defineIdentifierCodec("run_01"),
  providerAdapterId: defineIdentifierCodec("claude-agent-sdk"),
  providerActionId: defineIdentifierCodec("provider_action_01"),
  providerContractDigest: sha256,
  custodyAttemptGeneration: integer({ minimum: 1 }),
  journalRevision: integer({ minimum: 1 })
};
var providerActionRefBaseCodec = unionOf([
  objectCodec({
    ...providerActionRefCommonCodecs,
    journalState: enumeration(["prepared", "dispatched", "accepted"]),
    outcomeKind: literal(null),
    outcomeDigest: literal(null)
  }),
  objectCodec({
    ...providerActionRefCommonCodecs,
    journalState: literal("terminal"),
    outcomeKind: enumeration(["terminal-success", "terminal-no-effect"]),
    outcomeDigest: sha256
  }),
  objectCodec({
    ...providerActionRefCommonCodecs,
    journalState: literal("ambiguous"),
    outcomeKind: literal("ambiguous"),
    outcomeDigest: sha256
  })
]);
var LAUNCH_PACKET_V1_CODEC = parserBacked(
  launchPacketBaseCodec,
  (value, path) => parseLaunchPacketV1(value, path),
  parseLaunchPacketV1(launchPacketBaseCodec.example)
);
var LAUNCH_RESOURCE_PLAN_V1_CODEC = parserBacked(
  launchResourcePlanBaseCodec,
  (value, path) => parseLaunchResourcePlanV1(value, path),
  parseLaunchResourcePlanV1(launchResourcePlanBaseCodec.example)
);
var PROJECT_SESSION_LAUNCH_CURRENT_STATE_CODEC = parserBacked(
  projectSessionLaunchCurrentStateBaseCodec,
  (value, path) => parseProjectSessionLaunchCurrentState(value, path),
  parseProjectSessionLaunchCurrentState(projectSessionLaunchCurrentStateBaseCodec.example)
);
var PROJECT_SESSION_LAUNCH_INTENT_CODEC = parserBacked(
  projectSessionLaunchIntentBaseCodec,
  (value, path) => parseProjectSessionLaunchIntent(value, path),
  parseProjectSessionLaunchIntent(projectSessionLaunchIntentBaseCodec.example)
);
var LAUNCH_ADAPTER_OUTCOME_V1_CODEC = parserBacked(
  launchAdapterOutcomeBaseCodec,
  (value, path) => parseLaunchAdapterOutcomeV1(value, path),
  parseLaunchAdapterOutcomeV1(launchAdapterOutcomeBaseCodec.example)
);
var PROVIDER_ACTION_REF_V1_CODEC = parserBacked(
  providerActionRefBaseCodec,
  (value, path) => parseProviderActionRefV1(value, path),
  parseProviderActionRefV1(providerActionRefBaseCodec.example)
);
function parseLaunchPacketV1(value, path = "launchPacketV1") {
  const record = strictRecord(value, path, [
    "schemaVersion",
    "projectId",
    "projectSessionId",
    "runId",
    "chairAgentId",
    "projectRunDirectory",
    "topologyMode",
    "budgetRef",
    "resourcePlanRef",
    "chairAuthority",
    "provider"
  ]);
  if (safeInteger(record.schemaVersion, `${path}.schemaVersion`, 1) !== 1) {
    throw new TypeError(`${path}.schemaVersion must equal 1`);
  }
  const provider = strictRecord(record.provider, `${path}.provider`, [
    "adapterId",
    "actionId",
    "contractDigest",
    "inputSchemaId",
    "input"
  ]);
  return {
    schemaVersion: 1,
    projectId: parseIdentifier(record.projectId, `${path}.projectId`),
    projectSessionId: parseIdentifier(record.projectSessionId, `${path}.projectSessionId`),
    runId: parseIdentifier(record.runId, `${path}.runId`),
    chairAgentId: parseIdentifier(record.chairAgentId, `${path}.chairAgentId`),
    projectRunDirectory: parseCanonicalRelativePath(record.projectRunDirectory, `${path}.projectRunDirectory`),
    topologyMode: parseTopologyMode(record.topologyMode, `${path}.topologyMode`),
    budgetRef: parseIdentifier(record.budgetRef, `${path}.budgetRef`),
    resourcePlanRef: parseArtifactRef(record.resourcePlanRef, `${path}.resourcePlanRef`),
    chairAuthority: parseChairAuthority(record.chairAuthority, `${path}.chairAuthority`),
    provider: {
      adapterId: parseIdentifier(provider.adapterId, `${path}.provider.adapterId`),
      actionId: parseIdentifier(provider.actionId, `${path}.provider.actionId`),
      contractDigest: parseSha256Digest(provider.contractDigest, `${path}.provider.contractDigest`),
      inputSchemaId: parseIdentifier(provider.inputSchemaId, `${path}.provider.inputSchemaId`),
      input: parseJsonObject(provider.input, `${path}.provider.input`)
    }
  };
}
function parseLaunchResourcePlanV1(value, path = "launchResourcePlanV1") {
  const record = strictRecord(value, path, [
    "schemaVersion",
    "projectId",
    "projectSessionId",
    "runId",
    "budgetRef",
    "scopes",
    "launchReservation"
  ]);
  if (safeInteger(record.schemaVersion, `${path}.schemaVersion`, 1) !== 1) {
    throw new TypeError(`${path}.schemaVersion must equal 1`);
  }
  const scopes = strictRecord(record.scopes, `${path}.scopes`, ["project", "projectSession", "coordinationRun"]);
  const launchReservation = strictRecord(record.launchReservation, `${path}.launchReservation`, ["amounts"]);
  return {
    schemaVersion: 1,
    projectId: parseIdentifier(record.projectId, `${path}.projectId`),
    projectSessionId: parseIdentifier(record.projectSessionId, `${path}.projectSessionId`),
    runId: parseIdentifier(record.runId, `${path}.runId`),
    budgetRef: parseIdentifier(record.budgetRef, `${path}.budgetRef`),
    scopes: {
      project: parseLaunchResourceScopePlan(scopes.project, `${path}.scopes.project`),
      projectSession: parseLaunchResourceScopePlan(scopes.projectSession, `${path}.scopes.projectSession`),
      coordinationRun: parseLaunchResourceScopePlan(scopes.coordinationRun, `${path}.scopes.coordinationRun`)
    },
    launchReservation: {
      amounts: parseLaunchResourceAmounts(launchReservation.amounts, `${path}.launchReservation.amounts`)
    }
  };
}
function parseLaunchResourceScopePlan(value, path) {
  const record = strictRecord(value, path, ["scopeId", "limits"]);
  return {
    scopeId: parseIdentifier(record.scopeId, `${path}.scopeId`),
    limits: parseLaunchResourceAmounts(record.limits, `${path}.limits`)
  };
}
function parseLaunchResourceAmounts(value, path) {
  const fields = typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
  const record = strictRecord(value, path, fields);
  if (fields.length === 0 || fields.length > 128) throw new TypeError(`${path} must contain 1-128 dimensions`);
  const amounts = {};
  for (const [unit, amount] of Object.entries(record)) {
    if (!isResourceUnitKey(unit)) throw new TypeError(`${path}.${unit} is not a qualified resource unit`);
    amounts[unit] = safeInteger(amount, `${path}.${unit}`);
  }
  return amounts;
}
function parseProjectSessionLaunchCurrentState(value, path = "projectSessionLaunchCurrentState") {
  const record = strictRecord(value, path, [
    "schemaVersion",
    "projectId",
    "projectRevision",
    "projectSessionId",
    "sessionRevision",
    "sessionGeneration",
    "sessionState",
    "currentLaunchPacketRef",
    "trustRecordDigest",
    "providerAdapterId",
    "providerContractDigest",
    "resourceStateDigest",
    "provedFailedAttempt"
  ]);
  if (safeInteger(record.schemaVersion, `${path}.schemaVersion`, 1) !== 1) {
    throw new TypeError(`${path}.schemaVersion must equal 1`);
  }
  const common = {
    schemaVersion: 1,
    projectId: parseIdentifier(record.projectId, `${path}.projectId`),
    projectRevision: safeInteger(record.projectRevision, `${path}.projectRevision`, 1),
    projectSessionId: parseIdentifier(record.projectSessionId, `${path}.projectSessionId`),
    sessionRevision: safeInteger(record.sessionRevision, `${path}.sessionRevision`, 1),
    sessionGeneration: safeInteger(record.sessionGeneration, `${path}.sessionGeneration`, 1),
    currentLaunchPacketRef: parseArtifactRef(record.currentLaunchPacketRef, `${path}.currentLaunchPacketRef`),
    trustRecordDigest: parseSha256Digest(record.trustRecordDigest, `${path}.trustRecordDigest`),
    providerAdapterId: parseIdentifier(record.providerAdapterId, `${path}.providerAdapterId`),
    providerContractDigest: parseSha256Digest(record.providerContractDigest, `${path}.providerContractDigest`),
    resourceStateDigest: parseSha256Digest(record.resourceStateDigest, `${path}.resourceStateDigest`)
  };
  if (record.sessionState === "awaiting_launch") {
    if (record.provedFailedAttempt !== null) {
      throw new TypeError(`${path}.provedFailedAttempt must be null when sessionState is awaiting_launch`);
    }
    return { ...common, sessionState: "awaiting_launch", provedFailedAttempt: null };
  }
  if (record.sessionState === "launch_failed") {
    return {
      ...common,
      sessionState: "launch_failed",
      provedFailedAttempt: parseLaunchProviderActionIdentity(record.provedFailedAttempt, `${path}.provedFailedAttempt`)
    };
  }
  throw new TypeError(`${path}.sessionState must be awaiting_launch or launch_failed`);
}
function parseProjectSessionLaunchIntent(value, path = "projectSessionLaunchIntent") {
  const record = strictRecord(value, path, [
    "kind",
    "projectId",
    "projectSessionId",
    "expectedProjectRevision",
    "expectedSessionRevision",
    "expectedSessionGeneration",
    "trustRecordDigest",
    "launchPacketRef",
    "authorityRef",
    "budgetRef",
    "resourcePlanRef",
    "providerAdapterId",
    "providerActionId",
    "providerContractDigest",
    "resourceStateDigest",
    "retryOf"
  ]);
  if (record.kind !== "project-session-launch") throw new TypeError(`${path}.kind must be project-session-launch`);
  return {
    kind: "project-session-launch",
    projectId: parseIdentifier(record.projectId, `${path}.projectId`),
    projectSessionId: parseIdentifier(record.projectSessionId, `${path}.projectSessionId`),
    expectedProjectRevision: safeInteger(record.expectedProjectRevision, `${path}.expectedProjectRevision`, 1),
    expectedSessionRevision: safeInteger(record.expectedSessionRevision, `${path}.expectedSessionRevision`, 1),
    expectedSessionGeneration: safeInteger(record.expectedSessionGeneration, `${path}.expectedSessionGeneration`, 1),
    trustRecordDigest: parseSha256Digest(record.trustRecordDigest, `${path}.trustRecordDigest`),
    launchPacketRef: parseArtifactRef(record.launchPacketRef, `${path}.launchPacketRef`),
    authorityRef: parseSha256Digest(record.authorityRef, `${path}.authorityRef`),
    budgetRef: parseIdentifier(record.budgetRef, `${path}.budgetRef`),
    resourcePlanRef: parseArtifactRef(record.resourcePlanRef, `${path}.resourcePlanRef`),
    providerAdapterId: parseIdentifier(record.providerAdapterId, `${path}.providerAdapterId`),
    providerActionId: parseIdentifier(record.providerActionId, `${path}.providerActionId`),
    providerContractDigest: parseSha256Digest(record.providerContractDigest, `${path}.providerContractDigest`),
    resourceStateDigest: parseSha256Digest(record.resourceStateDigest, `${path}.resourceStateDigest`),
    ...record.retryOf === void 0 ? {} : { retryOf: parseLaunchProviderActionIdentity(record.retryOf, `${path}.retryOf`) }
  };
}
function parseLaunchProviderActionIdentity(value, path) {
  const record = strictRecord(value, path, ["providerAdapterId", "providerActionId"]);
  return {
    providerAdapterId: parseIdentifier(record.providerAdapterId, `${path}.providerAdapterId`),
    providerActionId: parseIdentifier(record.providerActionId, `${path}.providerActionId`)
  };
}
function parseLaunchAdapterOutcomeV1(value, path = "launchAdapterOutcomeV1") {
  const record = strictRecord(value, path, [
    "schemaVersion",
    "providerAdapterId",
    "providerActionId",
    "providerContractDigest",
    "observationKind",
    "observedAt",
    "outcome"
  ]);
  if (safeInteger(record.schemaVersion, `${path}.schemaVersion`, 1) !== 1) {
    throw new TypeError(`${path}.schemaVersion must equal 1`);
  }
  const common = {
    schemaVersion: 1,
    providerAdapterId: parseIdentifier(record.providerAdapterId, `${path}.providerAdapterId`),
    providerActionId: parseIdentifier(record.providerActionId, `${path}.providerActionId`),
    providerContractDigest: parseSha256Digest(record.providerContractDigest, `${path}.providerContractDigest`),
    observationKind: parseObservationKind(record.observationKind, `${path}.observationKind`),
    observedAt: parseTimestamp(record.observedAt, `${path}.observedAt`)
  };
  const discriminant = strictRecord(
    record.outcome,
    `${path}.outcome`,
    typeof record.outcome === "object" && record.outcome !== null && !Array.isArray(record.outcome) ? Object.keys(record.outcome) : []
  );
  if (discriminant.kind === "terminal-success") {
    const outcome = strictRecord(record.outcome, `${path}.outcome`, [
      "kind",
      "providerSessionRef",
      "providerSessionGeneration",
      "effectDigest",
      "resourceUsage"
    ]);
    return {
      ...common,
      outcome: {
        kind: "terminal-success",
        providerSessionRef: parseIdentifier(outcome.providerSessionRef, `${path}.outcome.providerSessionRef`),
        providerSessionGeneration: safeInteger(outcome.providerSessionGeneration, `${path}.outcome.providerSessionGeneration`, 1),
        effectDigest: parseSha256Digest(outcome.effectDigest, `${path}.outcome.effectDigest`),
        resourceUsage: parseLaunchResourceUsage(outcome.resourceUsage, `${path}.outcome.resourceUsage`)
      }
    };
  }
  if (discriminant.kind === "terminal-no-effect") {
    const outcome = strictRecord(record.outcome, `${path}.outcome`, ["kind", "failureCode", "noEffectProof"]);
    const proof = strictRecord(outcome.noEffectProof, `${path}.outcome.noEffectProof`, ["schemaId", "proof", "digest"]);
    return {
      ...common,
      outcome: {
        kind: "terminal-no-effect",
        failureCode: parseIdentifier(outcome.failureCode, `${path}.outcome.failureCode`),
        noEffectProof: {
          schemaId: parseIdentifier(proof.schemaId, `${path}.outcome.noEffectProof.schemaId`),
          proof: parseJsonValue(proof.proof, `${path}.outcome.noEffectProof.proof`),
          digest: parseSha256Digest(proof.digest, `${path}.outcome.noEffectProof.digest`)
        }
      }
    };
  }
  if (discriminant.kind === "ambiguous") {
    const outcome = strictRecord(record.outcome, `${path}.outcome`, ["kind", "reasonCode", "evidenceDigest"]);
    return {
      ...common,
      outcome: {
        kind: "ambiguous",
        reasonCode: parseAmbiguousReasonCode(outcome.reasonCode, `${path}.outcome.reasonCode`),
        evidenceDigest: outcome.evidenceDigest === null ? null : parseSha256Digest(outcome.evidenceDigest, `${path}.outcome.evidenceDigest`)
      }
    };
  }
  throw new TypeError(`${path}.outcome.kind is not an allowed launch outcome`);
}
function parseProviderActionRefV1(value, path = "providerActionRefV1") {
  const record = strictRecord(value, path, [
    "schemaVersion",
    "projectSessionId",
    "coordinationRunId",
    "providerAdapterId",
    "providerActionId",
    "providerContractDigest",
    "custodyAttemptGeneration",
    "journalRevision",
    "journalState",
    "outcomeKind",
    "outcomeDigest"
  ]);
  if (safeInteger(record.schemaVersion, `${path}.schemaVersion`, 1) !== 1) {
    throw new TypeError(`${path}.schemaVersion must equal 1`);
  }
  const common = {
    schemaVersion: 1,
    projectSessionId: parseIdentifier(record.projectSessionId, `${path}.projectSessionId`),
    coordinationRunId: parseIdentifier(record.coordinationRunId, `${path}.coordinationRunId`),
    providerAdapterId: parseIdentifier(record.providerAdapterId, `${path}.providerAdapterId`),
    providerActionId: parseIdentifier(record.providerActionId, `${path}.providerActionId`),
    providerContractDigest: parseSha256Digest(record.providerContractDigest, `${path}.providerContractDigest`),
    custodyAttemptGeneration: safeInteger(record.custodyAttemptGeneration, `${path}.custodyAttemptGeneration`, 1),
    journalRevision: safeInteger(record.journalRevision, `${path}.journalRevision`, 1)
  };
  if (record.journalState === "prepared" || record.journalState === "dispatched" || record.journalState === "accepted") {
    if (record.outcomeKind !== null || record.outcomeDigest !== null) {
      throw new TypeError(`${path}.outcomeKind and outcomeDigest must be null for journalState ${record.journalState}`);
    }
    return { ...common, journalState: record.journalState, outcomeKind: null, outcomeDigest: null };
  }
  if (record.journalState === "terminal") {
    if (record.outcomeKind !== "terminal-success" && record.outcomeKind !== "terminal-no-effect") {
      throw new TypeError(`${path}.outcomeKind is invalid for journalState terminal`);
    }
    return {
      ...common,
      journalState: "terminal",
      outcomeKind: record.outcomeKind,
      outcomeDigest: parseSha256Digest(record.outcomeDigest, `${path}.outcomeDigest`)
    };
  }
  if (record.journalState === "ambiguous") {
    if (record.outcomeKind !== "ambiguous") {
      throw new TypeError(`${path}.outcomeKind must be ambiguous for journalState ambiguous`);
    }
    return {
      ...common,
      journalState: "ambiguous",
      outcomeKind: "ambiguous",
      outcomeDigest: parseSha256Digest(record.outcomeDigest, `${path}.outcomeDigest`)
    };
  }
  throw new TypeError(`${path}.journalState is invalid`);
}
function parseLaunchResourceUsage(value, path) {
  const fields = typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
  const record = strictRecord(value, path, fields);
  if (fields.length === 0 || fields.length > 128) throw new TypeError(`${path} must contain 1-128 dimensions`);
  const usage = {};
  for (const [unit, amount] of Object.entries(record)) {
    if (!isResourceUnitKey(unit)) throw new TypeError(`${path}.${unit} is not a qualified resource unit`);
    usage[unit] = amount === "unknown" ? "unknown" : safeInteger(amount, `${path}.${unit}`);
  }
  return usage;
}
function parseObservationKind(value, path) {
  if (value === "dispatch-return" || value === "lookup") return value;
  throw new TypeError(`${path} must be dispatch-return or lookup`);
}
function parseAmbiguousReasonCode(value, path) {
  const reasons = [
    "absent",
    "transport-error",
    "adapter-error",
    "malformed",
    "incomplete",
    "conflict",
    "missing-resume-reference"
  ];
  const match = reasons.find((reason) => reason === value);
  if (match === void 0) throw new TypeError(`${path} is not an allowed ambiguity reason`);
  return match;
}
function defineIdentifierCodec(example) {
  return defineCodec({
    type: "string",
    pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"
  }, example, (value, path) => parseIdentifier(value, path));
}
function parseTopologyMode(value, path) {
  if (value === "coordinated" || value === "independent") return value;
  throw new TypeError(`${path} must be coordinated or independent`);
}
function parseAgentOperation(value, path) {
  if (typeof value !== "string" || !isActiveFabricOperation(value) || !OPERATION_REGISTRY[value].principals.includes("agent")) {
    throw new TypeError(`${path} must be an active agent protocol operation`);
  }
  return value;
}
function parseDisclosureTarget(value, path) {
  if (value === "local" || value === "approved-provider" || value === "external") return value;
  throw new TypeError(`${path} must be local, approved-provider or external`);
}
function parseDisclosure(value, path) {
  if (Array.isArray(value)) return parseUniqueArray(value, path, 0, 3, parseDisclosureTarget);
  const record = strictRecord(value, path, ["level", "scopes"]);
  if (record.level === "allowed" || record.level === "forbidden") {
    if (record.scopes !== void 0) throw new TypeError(`${path}.scopes is forbidden for ${record.level}`);
    return { level: record.level };
  }
  if (record.level === "scoped") {
    return { level: "scoped", scopes: parseUniqueArray(record.scopes, `${path}.scopes`, 1, 3, parseDisclosureTarget) };
  }
  throw new TypeError(`${path}.level is invalid`);
}
function parseChairAuthority(value, path) {
  const record = strictRecord(value, path, [
    "workspaceRoots",
    "sourcePaths",
    "artifactPaths",
    "actions",
    "deniedPaths",
    "deniedActions",
    "disclosure",
    "expiresAt",
    "budget"
  ]);
  const authority = {
    workspaceRoots: parseUniqueArray(record.workspaceRoots, `${path}.workspaceRoots`, 1, 64, parseChairAuthorityPath),
    sourcePaths: parseUniqueArray(record.sourcePaths, `${path}.sourcePaths`, 0, 256, parseChairAuthorityPath),
    artifactPaths: parseUniqueArray(record.artifactPaths, `${path}.artifactPaths`, 0, 256, parseChairAuthorityPath),
    actions: parseUniqueArray(record.actions, `${path}.actions`, 0, 256, parseAgentOperation),
    disclosure: parseDisclosure(record.disclosure, `${path}.disclosure`),
    expiresAt: parseTimestamp(record.expiresAt, `${path}.expiresAt`),
    budget: parseAuthorityBudget(record.budget, `${path}.budget`)
  };
  return {
    ...authority,
    ...record.deniedPaths === void 0 ? {} : { deniedPaths: parseUniqueArray(record.deniedPaths, `${path}.deniedPaths`, 0, 256, parseChairAuthorityPath) },
    ...record.deniedActions === void 0 ? {} : { deniedActions: parseUniqueArray(record.deniedActions, `${path}.deniedActions`, 0, 256, parseAgentOperation) }
  };
}
function parseChairAuthorityPath(value, path) {
  return value === "." ? "." : parseCanonicalRelativePath(value, path);
}
function parseAuthorityBudget(value, path) {
  const fields = typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
  const record = strictRecord(value, path, fields);
  if (fields.length > 128) throw new TypeError(`${path} must contain at most 128 dimensions`);
  const amounts = {};
  for (const [unit, amount] of Object.entries(record)) {
    if (!isResourceUnitKey(unit)) throw new TypeError(`${path}.${unit} is not a qualified resource unit`);
    amounts[unit] = safeInteger(amount, `${path}.${unit}`);
  }
  return amounts;
}
function parseUniqueArray(value, path, minimum, maximum, parse) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new TypeError(`${path} must contain ${String(minimum)}-${String(maximum)} items`);
  }
  const parsed = value.map((entry, index) => parse(entry, `${path}[${String(index)}]`));
  if (new Set(parsed.map((entry) => JSON.stringify(entry))).size !== parsed.length) {
    throw new TypeError(`${path} must contain unique items`);
  }
  return parsed;
}
function parseJsonObject(value, path) {
  const parsed = parseJsonValue(value, path);
  if (!isJsonRecord(parsed)) throw new TypeError(`${path} must be an object`);
  return parsed;
}
function isJsonRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/resource-unit-keys.ts
var GENERIC_BUDGET_UNIT_KEYS = Object.freeze([
  "turns",
  "provider_calls",
  "concurrent_turns",
  "descendants",
  "message_bytes",
  "artifact_bytes",
  "wall_clock_milliseconds"
]);
var ISO_4217_CURRENCY_CODES = Object.freeze(
  [...Intl.supportedValuesOf("currency")].sort()
);
var COST_BUDGET_UNIT_KEYS = Object.freeze(
  ISO_4217_CURRENCY_CODES.map((currency) => `cost:${currency}`)
);
var genericUnitKeys = new Set(GENERIC_BUDGET_UNIT_KEYS);
var costUnitKeys = new Set(COST_BUDGET_UNIT_KEYS);
var providerTokenUnit = /^(?:input_tokens|output_tokens):[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
var costUnitPattern = `^cost:(?:${ISO_4217_CURRENCY_CODES.join("|")})$`;
function isBudgetUnitKey(value) {
  return genericUnitKeys.has(value) || costUnitKeys.has(value) || providerTokenUnit.test(value);
}
var schema = Object.freeze({
  oneOf: [
    { type: "string", enum: [...GENERIC_BUDGET_UNIT_KEYS] },
    // Keep the generated schema exact without copying the full prefixed
    // catalogue into every resource-map key schema.
    { type: "string", pattern: costUnitPattern },
    { type: "string", pattern: "^(?:input_tokens|output_tokens):[a-z0-9]+(?:[.-][a-z0-9]+)*$" }
  ]
});
var budgetUnitKey = defineCodec(
  schema,
  "concurrent_turns",
  (value, path) => {
    if (typeof value !== "string" || !isBudgetUnitKey(value)) {
      throw new TypeError(`${path} must be a recognised qualified budget unit`);
    }
    return value;
  }
);

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/operation-codecs.ts
var object = (required, optional = []) => ({
  kind: "object",
  required,
  optional
});
var nil = { kind: "null" };
var OPERATION_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.delegateAuthority]: object(["parentAuthorityId", "authority"], ["commandId"]),
  [FABRIC_OPERATIONS.registerAgent]: object(["agentId", "authorityId"], ["providerSessionRef", "adapterId"]),
  [FABRIC_OPERATIONS.spawnAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "payload"]),
  [FABRIC_OPERATIONS.attachAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "providerSessionRef"]),
  [FABRIC_OPERATIONS.sendMessage]: object(["audience", "kind", "body", "requiresAck", "dedupeKey"], ["conversationId", "replyToMessageId", "taskRevision", "hopCount", "expiresAt", "context"]),
  [FABRIC_OPERATIONS.createDiscussionGroup]: object(["groupId", "memberAgentIds", "commandId"], ["teamId"]),
  [FABRIC_OPERATIONS.receiveMessages]: object(["limit", "visibilityTimeoutMs"]),
  [FABRIC_OPERATIONS.acknowledgeDelivery]: object(["deliveryId"]),
  [FABRIC_OPERATIONS.abandonDelivery]: object(["deliveryId", "reason", "commandId"]),
  [FABRIC_OPERATIONS.getMailboxState]: object([]),
  [FABRIC_OPERATIONS.createTask]: object(["taskId", "authorityId", "eligibleAgentIds", "objective", "baseRevision", "commandId"], ["proposedOwnerAgentId", "participantAgentIds", "dependencies", "expectedArtifacts", "objectiveChecks", "humanGates"]),
  [FABRIC_OPERATIONS.claimTask]: object(["taskId", "expectedRevision", "commandId"]),
  [FABRIC_OPERATIONS.refreshTaskReadiness]: object(["taskId", "expectedRevision", "commandId"]),
  [FABRIC_OPERATIONS.recordObjectiveCheck]: object(["taskId", "checkId", "status", "evidence", "commandId"]),
  [FABRIC_OPERATIONS.resolveHumanGate]: object(["taskId", "gateId", "status", "evidence", "commandId"]),
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: object(["taskId", "taskRevision", "ownerLeaseGeneration", "commandId"]),
  [FABRIC_OPERATIONS.getTask]: object(["taskId"]),
  [FABRIC_OPERATIONS.updateTask]: object(["taskId", "expectedRevision", "state", "commandId"]),
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: object(["taskId", "ownerLeaseGeneration", "kind", "detail", "commandId"]),
  [FABRIC_OPERATIONS.recoverTaskOwner]: object(["taskId", "expectedRevision", "expectedOwnerLeaseGeneration", "successorAgentId", "proofId", "commandId"]),
  [FABRIC_OPERATIONS.recordRevocationProof]: object(["leaseId", "generation", "kind", "detail", "commandId"]),
  [FABRIC_OPERATIONS.revokeCapability]: object(["agentId", "commandId"]),
  [FABRIC_OPERATIONS.rotateCapability]: object(["agentId", "expectedPrincipalGeneration", "commandId"]),
  [FABRIC_OPERATIONS.acquireWriteLease]: object(["scope", "ttlMs", "commandId"], ["taskId"]),
  [FABRIC_OPERATIONS.recoverWriteLease]: object(["leaseId", "expectedGeneration", "commandId", "evidence"]),
  [FABRIC_OPERATIONS.renewWriteLease]: object(["leaseId", "expectedGeneration", "ttlMs", "commandId"]),
  [FABRIC_OPERATIONS.getWriteLease]: object(["leaseId"]),
  [FABRIC_OPERATIONS.releaseWriteLease]: object(["leaseId", "expectedGeneration", "commandId"]),
  [FABRIC_OPERATIONS.requestLifecycle]: object(["action", "agentId", "taskId", "taskRevision", "checkpoint", "commandId"]),
  [FABRIC_OPERATIONS.getAgentLifecycle]: object(["agentId"]),
  [FABRIC_OPERATIONS.reportProviderState]: object(["agentId", "providerSessionGeneration", "contextRevision", "commandId"], ["checkpointSha256"]),
  [FABRIC_OPERATIONS.dispatchProviderAction]: object(["adapterId", "actionId", "operation", "payload", "commandId"]),
  [FABRIC_OPERATIONS.reconcileProviderAction]: object(["actionId", "commandId"]),
  [FABRIC_OPERATIONS.getProviderAction]: object(["actionId"]),
  [FABRIC_OPERATIONS.recordOperatorIntervention]: object(["source", "directInputProvenance", "taskRevision", "summary", "commandId"]),
  [FABRIC_OPERATIONS.recordVisibilityFailure]: object(["kind", "agentId", "commandId"]),
  [FABRIC_OPERATIONS.createTeam]: object(["teamId", "commandId"], ["parentTeamId", "leader", "rootTask", "initialMembers", "discussionGroups", "reservedBudget", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "initialMemberAgentIds", "authorityId", "budget"]),
  [FABRIC_OPERATIONS.getTeam]: object(["teamId"]),
  [FABRIC_OPERATIONS.freezeSubtree]: object(["teamId", "expectedGeneration", "reason", "commandId"]),
  [FABRIC_OPERATIONS.adoptSubtree]: object(["teamId", "successorAgentId", "expectedGeneration", "handoffEvidence", "commandId"]),
  [FABRIC_OPERATIONS.closeSubtreeBarrier]: object(["teamId", "expectedGeneration", "commandId"]),
  [FABRIC_OPERATIONS.reserveBudget]: object(["teamId", "expectedTeamGeneration", "parentBudgetId", "budgetId", "dimensions", "commandId"]),
  [FABRIC_OPERATIONS.recordBudgetUsage]: object(["budgetId", "usage", "commandId"]),
  [FABRIC_OPERATIONS.reconcileBudgetUsage]: object(["budgetId", "consumed", "commandId"]),
  [FABRIC_OPERATIONS.releaseBudget]: object(["budgetId", "commandId"]),
  [FABRIC_OPERATIONS.getBudget]: object(["budgetId"]),
  [FABRIC_OPERATIONS.publishArtifact]: object(["relativePath", "sha256", "commandId"], ["taskId"]),
  [FABRIC_OPERATIONS.closeBarrier]: object(["scope", "commandId"], ["stageId"]),
  [FABRIC_OPERATIONS.getRunStatus]: object(["runId"]),
  [FABRIC_OPERATIONS.observeEvents]: object(["cursor", "limit"]),
  [FABRIC_OPERATIONS.listTasks]: object(["runId"]),
  [FABRIC_OPERATIONS.listAgents]: object(["runId"]),
  [FABRIC_OPERATIONS.listReceipts]: object(["runId"]),
  [FABRIC_OPERATIONS.exportReceipt]: object(["commandId"]),
  [FABRIC_OPERATIONS.launchAttest]: object(["challengeResponse"]),
  [FABRIC_OPERATIONS.projectSessionCreate]: object(["command", "projectSessionId", "projectId", "mode", "generation", "authorityRef", "budgetRef", "launchPacketRef"]),
  [FABRIC_OPERATIONS.projectSessionGet]: object(["projectId", "projectSessionId", "expectedGeneration"]),
  [FABRIC_OPERATIONS.projectSessionTransition]: object(["command", "projectSessionId", "expectedGeneration", "transition"]),
  [FABRIC_OPERATIONS.projectSessionClose]: object(["command", "projectSessionId", "expectedGeneration", "terminalPath"]),
  [FABRIC_OPERATIONS.membershipBind]: object(["origin", "command", "projectSessionId", "coordinationRunId", "expectedMembershipRevision", "members"]),
  [FABRIC_OPERATIONS.operatorAttach]: object(["command", "projectId", "requestedExpiresAt"], ["projectSessionId", "expectedAttachmentGeneration"]),
  [FABRIC_OPERATIONS.operatorDetach]: object(["command", "attachmentGeneration"]),
  [FABRIC_OPERATIONS.operatorHeartbeat]: object(["command", "attachmentGeneration", "extendUntil"]),
  [FABRIC_OPERATIONS.operatorCommand]: object(["command", "action", "payload"], ["targetTaskId"]),
  [FABRIC_OPERATIONS.integrationInputAttest]: object(["context", "attestation"]),
  [FABRIC_OPERATIONS.intakeDraftCreate]: object(["command", "intakeId", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.intakeRead]: object(["credential", "intakeId"]),
  [FABRIC_OPERATIONS.intakeSubmit]: object(["command", "intakeId", "expectedRevision", "projectSessionId", "coordinationRunId", "summary", "artifactRefs", "gateIds", "chairRequest"]),
  [FABRIC_OPERATIONS.intakeRevise]: object(["origin", "command", "intakeId", "projectSessionId", "coordinationRunId", "expectedRevision", "state", "summary", "artifactRefs", "gateIds"], ["chairRequest"]),
  [FABRIC_OPERATIONS.scopedGateCreate]: object(["origin", "command", "intent"]),
  [FABRIC_OPERATIONS.scopedGateResolve]: object(["command", "gateId", "status", "decisionEvidence"]),
  [FABRIC_OPERATIONS.scopedGateCheck]: object(["projectSessionId", "coordinationRunId", "dependencyRevision", "enforcementPoint"], ["taskId", "operationId", "barrierId"]),
  [FABRIC_OPERATIONS.scopedGateRead]: object(["credential", "projectId", "projectSessionId", "gateId"], ["expectedRevision"]),
  [FABRIC_OPERATIONS.resourceReserve]: object(["commandId", "reservationId", "projectSessionId", "path", "amounts"], ["writerAdmission", "taskId"]),
  [FABRIC_OPERATIONS.resourceRelease]: object(["commandId", "reservationId", "expectedRevision", "consumed"]),
  [FABRIC_OPERATIONS.resourceReconcile]: object(["commandId", "reservationId", "expectedRevision", "observedUsage", "evidence"]),
  [FABRIC_OPERATIONS.taskRequest]: object(["commandId", "projectSessionId", "coordinationRunId", "task", "request"]),
  [FABRIC_OPERATIONS.taskCompleteWithReply]: object(["commandId", "taskId", "expectedTaskRevision", "ownerLeaseId", "ownerLeaseGeneration", "requestMessageId", "expectedRequestRevision", "callbackId", "callbackGeneration", "reply", "terminalResult"]),
  [FABRIC_OPERATIONS.resultDeliveryClaim]: object(["commandId", "resultDeliveryId", "expectedRevision", "expectedClaimGeneration", "claimantAgentId", "claimDeadline"]),
  [FABRIC_OPERATIONS.resultDeliveryProviderAccept]: object(["commandId", "resultDeliveryId", "expectedRevision", "claimGeneration", "providerActionId"]),
  [FABRIC_OPERATIONS.resultDeliveryConsume]: object(["commandId", "resultDeliveryId", "expectedRevision", "claimGeneration", "callbackId", "payloadDigest"]),
  [FABRIC_OPERATIONS.resultDeliveryRetry]: object(["commandId", "resultDeliveryId", "expectedRevision", "sameCallbackId", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryReassign]: object(["commandId", "resultDeliveryId", "expectedRevision", "targetAgentId", "targetProviderSessionRef", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryAbandon]: object(["commandId", "resultDeliveryId", "expectedRevision", "reason"]),
  [FABRIC_OPERATIONS.chairTakeover]: object(["command", "projectSessionId", "runId", "expectedChairAgentId", "successorChairAgentId", "expectedChairGeneration", "expectedSessionGeneration", "handoffRef", "targetRevision"]),
  [FABRIC_OPERATIONS.projectDiscover]: object(["credential", "projectId", "after", "limit"]),
  [FABRIC_OPERATIONS.projectionSnapshot]: object(["credential", "projectId"], ["projectSessionId"]),
  [FABRIC_OPERATIONS.projectionPage]: object(["credential", "projectId", "view", "after", "limit"], ["projectSessionId"]),
  [FABRIC_OPERATIONS.projectionEvents]: object(["credential", "projectId", "after", "limit"], ["projectSessionId"]),
  [FABRIC_OPERATIONS.projectionViewPage]: object(["credential", "projectId", "view", "snapshotRevision", "cursor", "limit"], ["projectSessionId"]),
  [FABRIC_OPERATIONS.projectionDetailRead]: object(["credential", "projectId", "snapshotRevision", "detailRef"], ["projectSessionId"]),
  [FABRIC_OPERATIONS.operatorActionPreview]: object(["command", "projectId", "intent"]),
  [FABRIC_OPERATIONS.operatorActionCommit]: object(["command", "projectId", "previewId", "expectedPreviewRevision", "previewDigest", "expectedIntentDigest", "confirmation"]),
  [FABRIC_OPERATIONS.operatorActionStatus]: object(["credential", "projectId", "commandId"]),
  [FABRIC_OPERATIONS.operatorActionReconcile]: object(["command", "projectId", "targetCommandId", "expectedStatus", "expectedAttemptGeneration", "mode"]),
  [FABRIC_OPERATIONS.messageBodyRead]: object(["credential", "projectSessionId", "messageId", "expectedRevision"]),
  [FABRIC_OPERATIONS.operatorRepositoryRead]: object(
    ["credential", "projectId", "snapshotRevision", "target", "diff", "log"],
    ["projectSessionId"]
  ),
  [FABRIC_OPERATIONS.projectSessionDrain]: object(["command", "projectSessionId", "expectedGeneration", "consequencePreviewRef", "confirmedPreviewRevision"]),
  [FABRIC_OPERATIONS.projectSessionStop]: object(["command", "projectSessionId", "expectedGeneration", "consequencePreviewRef", "confirmedPreviewRevision", "drainReceiptRef"]),
  [FABRIC_OPERATIONS.daemonDrain]: object(["command", "expectedDaemonGeneration", "expectedGlobalStateRevision"]),
  [FABRIC_OPERATIONS.daemonStop]: object(["command", "expectedDaemonGeneration", "expectedGlobalStateRevision", "drainReceiptRef"])
};
var OPERATION_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.delegateAuthority]: object(["authorityId"]),
  [FABRIC_OPERATIONS.registerAgent]: object(["capability"]),
  [FABRIC_OPERATIONS.spawnAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "providerSessionRef", "providerSessionGeneration", "bridgeState", "bridgeGeneration", "evidenceDigest"]),
  [FABRIC_OPERATIONS.attachAgent]: object(["agentId", "authorityId", "adapterId", "actionId", "providerSessionRef", "providerSessionGeneration", "bridgeState", "bridgeGeneration", "evidenceDigest"]),
  [FABRIC_OPERATIONS.sendMessage]: object(["messageId"]),
  [FABRIC_OPERATIONS.createDiscussionGroup]: object(["groupId", "memberAgentIds"]),
  [FABRIC_OPERATIONS.receiveMessages]: object(["deliveries"]),
  [FABRIC_OPERATIONS.acknowledgeDelivery]: object(["acknowledged"]),
  [FABRIC_OPERATIONS.abandonDelivery]: object(["deliveryId", "status", "reason"]),
  [FABRIC_OPERATIONS.getMailboxState]: object(["contiguousWatermark", "acknowledgedAboveWatermark"]),
  [FABRIC_OPERATIONS.createTask]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.claimTask]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.refreshTaskReadiness]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.recordObjectiveCheck]: object(["taskId", "checkId", "status"]),
  [FABRIC_OPERATIONS.resolveHumanGate]: object(["taskId", "gateId", "status"]),
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: object(["acknowledged"]),
  [FABRIC_OPERATIONS.getTask]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.updateTask]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: object(["proofId"]),
  [FABRIC_OPERATIONS.recoverTaskOwner]: object(["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration", "proposedOwnerAgentId", "dependencies"]),
  [FABRIC_OPERATIONS.recordRevocationProof]: object(["proofId"]),
  [FABRIC_OPERATIONS.revokeCapability]: nil,
  [FABRIC_OPERATIONS.rotateCapability]: object(["agentId", "principalGeneration", "capability"]),
  [FABRIC_OPERATIONS.acquireWriteLease]: object(["leaseId", "holderAgentId", "generation", "status", "scope"]),
  [FABRIC_OPERATIONS.recoverWriteLease]: object(["leaseId", "holderAgentId", "generation", "status", "scope"]),
  [FABRIC_OPERATIONS.renewWriteLease]: object(["leaseId", "holderAgentId", "generation", "status", "scope"]),
  [FABRIC_OPERATIONS.getWriteLease]: object(["leaseId", "holderAgentId", "generation", "status", "scope"]),
  [FABRIC_OPERATIONS.releaseWriteLease]: object(["leaseId", "status", "generation"]),
  [FABRIC_OPERATIONS.requestLifecycle]: object(["agentId", "lifecycle", "providerSessionGeneration"], ["rotation"]),
  [FABRIC_OPERATIONS.getAgentLifecycle]: object(["agentId", "lifecycle", "providerSessionGeneration"], ["rotation"]),
  [FABRIC_OPERATIONS.reportProviderState]: object(["agentId", "lifecycle", "providerSessionGeneration"], ["rotation"]),
  [FABRIC_OPERATIONS.dispatchProviderAction]: object(["actionId", "status", "history", "executionCount", "effectCount"], ["result"]),
  [FABRIC_OPERATIONS.reconcileProviderAction]: object(["actionId", "status", "history", "executionCount", "effectCount"], ["result"]),
  [FABRIC_OPERATIONS.getProviderAction]: object(["actionId", "status", "history", "executionCount", "effectCount"], ["result"]),
  [FABRIC_OPERATIONS.recordOperatorIntervention]: object(["interventionId"]),
  [FABRIC_OPERATIONS.recordVisibilityFailure]: object(["visibility", "providerSession", "delivery"], ["recovery"]),
  [FABRIC_OPERATIONS.createTeam]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMemberAgentIds"]),
  [FABRIC_OPERATIONS.getTeam]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMemberAgentIds"]),
  [FABRIC_OPERATIONS.freezeSubtree]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMemberAgentIds"]),
  [FABRIC_OPERATIONS.adoptSubtree]: object(["teamId", "parentTeamId", "depth", "leaderAgentId", "rootTaskId", "ownedTaskIds", "memberAgentIds", "budgetId", "state", "generation", "successorAgentId", "discussionGroups", "reservedBudget"], ["leader", "rootTask", "initialMemberAgentIds"]),
  [FABRIC_OPERATIONS.closeSubtreeBarrier]: object(["teamId", "generation", "closed"]),
  [FABRIC_OPERATIONS.reserveBudget]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.recordBudgetUsage]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.reconcileBudgetUsage]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.releaseBudget]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.getBudget]: object(["budgetId", "parentBudgetId", "state", "dimensions", "returned"]),
  [FABRIC_OPERATIONS.publishArtifact]: object(["artifactId", "relativePath", "sha256"]),
  [FABRIC_OPERATIONS.closeBarrier]: object(["scope", "closed", "receipt"]),
  [FABRIC_OPERATIONS.getRunStatus]: object(["runId", "chairAgentId", "barrier", "counts"]),
  [FABRIC_OPERATIONS.observeEvents]: object(["events", "nextCursor"]),
  [FABRIC_OPERATIONS.listTasks]: object(["tasks"]),
  [FABRIC_OPERATIONS.listAgents]: object(["agents"]),
  [FABRIC_OPERATIONS.listReceipts]: object(["receipts"]),
  [FABRIC_OPERATIONS.exportReceipt]: object(["relativePath", "schemaVersion", "sha256"]),
  [FABRIC_OPERATIONS.launchAttest]: object(["attested", "challengeDigest"]),
  [FABRIC_OPERATIONS.projectSessionCreate]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionGet]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionTransition]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionClose]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin", "terminalPath"]),
  [FABRIC_OPERATIONS.membershipBind]: object(["projectSessionId", "coordinationRunId", "membershipRevision", "members"]),
  [FABRIC_OPERATIONS.operatorAttach]: object(["clientId", "projectId", "projectAuthorityGeneration", "projectSessionId", "generation", "expiresAt"]),
  [FABRIC_OPERATIONS.operatorDetach]: object(["detached", "revision"]),
  [FABRIC_OPERATIONS.operatorHeartbeat]: object(["clientId", "projectId", "projectAuthorityGeneration", "projectSessionId", "generation", "expiresAt"]),
  [FABRIC_OPERATIONS.operatorCommand]: object(["commandId", "actor", "provenance", "operation", "expectedRevision", "committedRevision", "before", "after", "evidenceRefs", "committedAt"]),
  [FABRIC_OPERATIONS.integrationInputAttest]: object(["attestationId", "integrationId", "integrationGeneration", "operatorId", "projectId", "projectSessionId", "providerEvent", "humanUtterance", "gateBinding", "recordedAt"]),
  [FABRIC_OPERATIONS.intakeDraftCreate]: object(["intakeId", "projectId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.intakeRead]: object(["intakeId", "projectId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"], ["projectSessionId", "coordinationRunId"]),
  [FABRIC_OPERATIONS.intakeSubmit]: object(["intakeId", "projectId", "projectSessionId", "coordinationRunId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.intakeRevise]: object(["intakeId", "projectId", "projectSessionId", "coordinationRunId", "revision", "state", "dedupeKey", "summary", "artifactRefs", "gateIds"]),
  [FABRIC_OPERATIONS.scopedGateCreate]: object(["gateId", "projectSessionId", "coordinationRunId", "scope", "affectedTaskIds", "dependencyRevision", "blockedOperationIds", "enforcementPoints", "question", "reason", "options", "recommendation", "consequences", "evidenceRefs", "revision", "createdByRef", "expectedApproverRef", "status"], ["deadline", "default", "resolution", "releaseBinding"]),
  [FABRIC_OPERATIONS.scopedGateResolve]: object(["gateId", "projectSessionId", "coordinationRunId", "scope", "affectedTaskIds", "dependencyRevision", "blockedOperationIds", "enforcementPoints", "question", "reason", "options", "recommendation", "consequences", "evidenceRefs", "revision", "createdByRef", "expectedApproverRef", "status"], ["deadline", "default", "resolution", "releaseBinding"]),
  [FABRIC_OPERATIONS.scopedGateCheck]: object(["allowed", "checkedGateRevisions"], ["blockingGateIds"]),
  [FABRIC_OPERATIONS.scopedGateRead]: object(["status", "gate", "readTransactionId", "stateDigest"], ["expectedRevision"]),
  [FABRIC_OPERATIONS.resourceReserve]: object(["reservationId", "revision", "state", "path", "amounts", "capacity"]),
  [FABRIC_OPERATIONS.resourceRelease]: object(["reservationId", "revision", "state", "path", "amounts", "capacity"]),
  [FABRIC_OPERATIONS.resourceReconcile]: object(["reservationId", "revision", "state", "path", "amounts", "capacity"]),
  [FABRIC_OPERATIONS.taskRequest]: object(["taskRevision", "requestRevision", "callbackId", "callbackGeneration"]),
  [FABRIC_OPERATIONS.taskCompleteWithReply]: object(["taskRevision", "replyRevision", "resultDelivery"]),
  [FABRIC_OPERATIONS.resultDeliveryClaim]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryProviderAccept]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryConsume]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryRetry]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryReassign]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.resultDeliveryAbandon]: object(["resultDeliveryId", "revision", "projectSessionId", "taskId", "requestMessageId", "requestRevision", "replyMessageId", "replyRevision", "taskRevision", "callbackId", "callbackGeneration", "assignmentGeneration", "targetAgentId", "targetProviderSessionRef", "payloadDigest", "responseDeadline", "dependentBarrierId", "required", "state", "claimGeneration"], ["claimedByAgentId", "claimDeadline", "providerAcceptedAt", "consumedAt", "overdueAt", "abandonedAt", "reason"]),
  [FABRIC_OPERATIONS.chairTakeover]: object(["projectSessionId", "sessionRevision", "runRevision", "chairAgentId", "chairGeneration"]),
  [FABRIC_OPERATIONS.projectDiscover]: object(["project", "sessions"]),
  [FABRIC_OPERATIONS.projectionSnapshot]: object(["schemaVersion", "snapshotRevision", "readTransactionId", "project", "session", "runs", "attention", "capacity", "cursor", "stateDigest"]),
  [FABRIC_OPERATIONS.projectionPage]: object(["view", "page"]),
  [FABRIC_OPERATIONS.projectionEvents]: object(["status"], ["events", "nextCursor", "hasMore", "snapshotRevision", "readTransactionId", "reason", "currentSnapshotRevision", "snapshotCursor"]),
  [FABRIC_OPERATIONS.projectionViewPage]: object(["status", "view"], ["rows", "nextCursor", "hasMore", "snapshotRevision", "readTransactionId", "reason", "currentSnapshotRevision", "snapshotCursor"]),
  [FABRIC_OPERATIONS.projectionDetailRead]: object(["status"], ["detailRef", "detail", "snapshotRevision", "readTransactionId", "reason", "currentSnapshotRevision"]),
  [FABRIC_OPERATIONS.operatorActionPreview]: object(["previewId", "previewRevision", "previewDigest", "intent", "intentDigest", "beforeStateDigest", "consequenceClass", "evidenceRefs", "gateIds", "confirmationMode", "expiresAt"]),
  [FABRIC_OPERATIONS.operatorActionCommit]: object(["commandId", "previewId", "previewRevision", "intentDigest", "beforeStateDigest", "afterStateDigest", "evidenceRefs", "committedAt"], ["effectRef", "providerActionRef"]),
  [FABRIC_OPERATIONS.operatorActionStatus]: object(["status", "commandId"], ["intentDigest", "phase", "attemptGeneration", "effectRef", "providerActionRef", "receipt", "code", "evidenceRefs"]),
  [FABRIC_OPERATIONS.operatorActionReconcile]: object(["status", "commandId"], ["intentDigest", "phase", "attemptGeneration", "effectRef", "providerActionRef", "receipt", "code", "evidenceRefs"]),
  [FABRIC_OPERATIONS.messageBodyRead]: object(["available", "messageId", "revision"], ["body", "terminalNeutralised", "capabilityValuesRedacted", "artifactRefs", "reason"]),
  [FABRIC_OPERATIONS.operatorRepositoryRead]: object(
    ["status"],
    ["projectId", "projectSessionId", "snapshotRevision", "readTransactionId", "repository", "reason", "currentSnapshotRevision"]
  ),
  [FABRIC_OPERATIONS.projectSessionDrain]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.projectSessionStop]: object(["projectSessionId", "projectId", "mode", "state", "revision", "generation", "authorityRef", "budgetRef", "launchPacketRef", "membershipRevision", "origin"], ["terminalPath"]),
  [FABRIC_OPERATIONS.daemonDrain]: object(["daemonInstanceGeneration", "globalStateRevision", "state", "receiptDigest"]),
  [FABRIC_OPERATIONS.daemonStop]: object(["daemonInstanceGeneration", "globalStateRevision", "state", "receiptDigest"])
};
var text = boundedString();
var optionalText = boundedString({ minBytes: 0 });
var positiveInteger = integer({ minimum: 1 });
var stringList = arrayOf(identifier, { maximum: 256, unique: true });
var textList = arrayOf(text, { maximum: 256 });
var integerList = arrayOf(integer(), { maximum: 256, unique: true });
var numberRecord = recordOf(integer(), { maximum: 128, keyCodec: budgetUnitKey });
var nonEmptyNumberRecord = recordOf(integer(), {
  minimum: 1,
  maximum: 128,
  keyCodec: budgetUnitKey,
  exampleKey: "concurrent_turns"
});
var nullableNumberRecord = recordOf(nullable(integer()), {
  minimum: 1,
  maximum: 128,
  keyCodec: budgetUnitKey,
  exampleKey: "concurrent_turns"
});
var stringRecord = recordOf(text, { maximum: 128 });
var jsonRecord = recordOf(jsonValue, { maximum: 128 });
var activeOperationValues = Object.keys(OPERATION_REGISTRY).filter(isActiveFabricOperation);
var activeOperationCodec = defineCodec({
  type: "string",
  enum: activeOperationValues
}, FABRIC_OPERATIONS.acknowledgeDelivery, (value, path) => {
  if (typeof value !== "string" || !isActiveFabricOperation(value)) {
    throw new TypeError(`${path} must be an active protocol operation`);
  }
  return value;
});
var agentAuthorityOperationValues = [...operationsForPrincipal("agent")].sort();
var agentAuthorityOperationSet = new Set(agentAuthorityOperationValues);
var agentAuthorityOperationCodec2 = defineCodec({
  type: "string",
  enum: agentAuthorityOperationValues
}, FABRIC_OPERATIONS.acknowledgeDelivery, (value, path) => {
  if (typeof value !== "string" || !agentAuthorityOperationSet.has(value)) {
    throw new TypeError(`${path} must be an active agent protocol operation`);
  }
  return value;
});
var artifactRefCodec2 = objectCodec({ path: relativePath, digest: sha256 });
var artifactRefsCodec = arrayOf(artifactRefCodec2, { maximum: 128 });
var credentialCodec = objectCodec({ capabilityId: identifier, token: secret });
var consoleProvenanceCodec = objectCodec({
  kind: literal("console-direct-input"),
  clientId: identifier,
  inputEventId: identifier
});
var attestedProvenanceCodec = objectCodec({
  kind: literal("attested-provider-input"),
  attestationId: identifier,
  integrationId: identifier,
  integrationGeneration: positiveInteger
});
var provenanceCodec = unionOf([consoleProvenanceCodec, attestedProvenanceCodec]);
var operatorMutationBaseCodec = objectCodec({
  credential: credentialCodec,
  commandId: identifier,
  expectedRevision: integer(),
  actor: identifier,
  provenance: provenanceCodec,
  evidenceRefs: artifactRefsCodec
});
var operatorMutationCodec = parserBacked(
  operatorMutationBaseCodec,
  parseOperatorMutationContext,
  parseOperatorMutationContext(operatorMutationBaseCodec.example)
);
var chairMutationBaseCodec = objectCodec({
  commandId: identifier,
  agentId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  principalGeneration: positiveInteger,
  chairLeaseId: identifier,
  chairLeaseGeneration: positiveInteger,
  expectedRunRevision: integer(),
  expectedRevision: positiveInteger
});
var chairMutationCodec = parserBacked(
  chairMutationBaseCodec,
  parseChairMutationContext,
  parseChairMutationContext(chairMutationBaseCodec.example)
);
var disclosureCodec2 = unionOf([
  objectCodec({ level: literal("allowed") }),
  objectCodec({ level: literal("forbidden") }),
  objectCodec({
    level: literal("scoped"),
    scopes: arrayOf(enumeration(["local", "approved-provider", "external"]), {
      minimum: 1,
      maximum: 3,
      unique: true
    })
  }),
  arrayOf(enumeration(["local", "approved-provider", "external"]), { maximum: 3, unique: true })
]);
var authorityPathCodec = unionOf([literal("."), relativePath]);
var authorityCodec = objectCodec({
  workspaceRoots: arrayOf(authorityPathCodec, { minimum: 1, maximum: 64, unique: true }),
  sourcePaths: arrayOf(authorityPathCodec, { maximum: 256, unique: true }),
  artifactPaths: arrayOf(authorityPathCodec, { maximum: 256, unique: true }),
  actions: arrayOf(agentAuthorityOperationCodec2, { maximum: 256, unique: true }),
  disclosure: disclosureCodec2,
  expiresAt: timestamp,
  budget: numberRecord
}, {
  deniedPaths: arrayOf(authorityPathCodec, { maximum: 256, unique: true }),
  deniedActions: arrayOf(agentAuthorityOperationCodec2, { maximum: 256, unique: true })
});
var messageAudienceCodec = unionOf([
  objectCodec({ kind: literal("agents"), agentIds: arrayOf(identifier, { minimum: 1, maximum: 64, unique: true }) }),
  objectCodec({ kind: literal("team"), teamId: identifier }),
  objectCodec({ kind: literal("task"), taskId: identifier })
]);
var messageContextCodec = unionOf([
  objectCodec({ kind: literal("direct") }),
  objectCodec({ kind: literal("task"), taskId: identifier }),
  objectCodec({ kind: literal("task-dependency"), fromTaskId: identifier, toTaskId: identifier }),
  objectCodec({ kind: literal("discussion-group"), groupId: identifier })
]);
var recoveryEvidenceCodec = unionOf([
  objectCodec({ kind: literal("unproven") }),
  objectCodec({ kind: literal("predecessor-terminal"), agentId: identifier, providerSessionRef: identifier }),
  objectCodec({ kind: literal("os-isolated"), proofRef: identifier }),
  objectCodec({ kind: literal("patch-only"), serialApplierRef: identifier })
]);
var lifecycleCheckpointCodec = objectCodec({
  relativePath,
  sha256: sha256Hex,
  mailboxWatermark: integer(),
  acknowledgedAboveWatermark: integerList,
  inFlightChildren: stringList,
  openWork: textList,
  nextAction: text,
  providerResumeReference: identifier
});
var teamMemberCodec = objectCodec({ agentId: identifier, authority: authorityCodec });
var discussionGroupCodec = objectCodec({
  groupId: identifier,
  memberAgentIds: arrayOf(identifier, { minimum: 2, maximum: 64, unique: true })
});
var teamLeaderCodec = objectCodec({ agentId: identifier, authority: authorityCodec });
var rootTaskInputCodec = objectCodec({ taskId: identifier, objective: text, baseRevision: text });
var projectSessionOriginCodec = unionOf([
  objectCodec({ kind: literal("operator-launch"), operatorId: identifier }),
  objectCodec({ kind: literal("legacy-migration"), migrationManifestRef: artifactRefCodec2 })
]);
var cancelledTerminalPathCodec = objectCodec({ kind: literal("cancelled"), reason: text });
var terminalPathCodec = unionOf([
  objectCodec({ kind: literal("accepted"), acceptanceRef: sha256 }),
  cancelledTerminalPathCodec,
  objectCodec({ kind: literal("failed"), reason: text, failureRef: sha256 })
]);
var projectSessionCommonFields = {
  projectSessionId: identifier,
  projectId: identifier,
  mode: enumeration(["coordinated", "independent"]),
  revision: positiveInteger,
  generation: positiveInteger,
  authorityRef: sha256,
  budgetRef: identifier,
  launchPacketRef: artifactRefCodec2,
  membershipRevision: integer(),
  origin: projectSessionOriginCodec
};
var projectSessionWireCodec = unionOf([
  objectCodec({
    ...projectSessionCommonFields,
    state: enumeration([
      "draft",
      "awaiting_launch",
      "launching",
      "active",
      "quiescing",
      "awaiting_acceptance",
      "launch_failed",
      "launch_ambiguous",
      "reconciling",
      "visibility_degraded",
      "recovery_required",
      "quarantined"
    ])
  }),
  objectCodec({ ...projectSessionCommonFields, state: literal("closed"), terminalPath: terminalPathCodec }),
  objectCodec({ ...projectSessionCommonFields, state: literal("cancelled"), terminalPath: cancelledTerminalPathCodec })
]);
var projectSessionCodec = parserBacked(
  projectSessionWireCodec,
  parseProjectSession,
  parseProjectSession(projectSessionWireCodec.example)
);
var projectSessionTransitionInputCodec = objectCodec({
  command: operatorMutationCodec,
  projectSessionId: identifier,
  expectedGeneration: positiveInteger,
  transition: unionOf([
    objectCodec({
      to: literal("awaiting_launch"),
      reason: text,
      launchPacketRef: artifactRefCodec2
    }),
    objectCodec({
      to: enumeration([
        "draft",
        "active",
        "quiescing",
        "reconciling",
        "visibility_degraded",
        "recovery_required",
        "quarantined"
      ]),
      reason: text
    }),
    objectCodec({ to: literal("awaiting_acceptance"), closureEvidence: artifactRefCodec2 })
  ])
});
var runProjectionCodec = objectCodec({
  runId: identifier,
  phase: text,
  chairAgentId: identifier,
  nextMilestone: text,
  health: enumeration(["healthy", "degraded", "blocked", "quarantined", "unknown"])
});
var attentionItemCodec = objectCodec({
  itemId: identifier,
  revision: positiveInteger,
  label: enumeration(["Decision", "Approval", "Blocked", "FYI"]),
  priority: enumeration(["safety-integrity", "critical-path", "expiring-authority", "acceptance-ready", "advisory"]),
  title: text,
  sourceFreshness: enumeration(["live", "snapshot", "stale", "unavailable", "conflict"]),
  lastEventAt: timestamp,
  duplicateCount: integer()
});
var projectionSourceCodec = enumeration(["fabric", "delivery-run", "git", "github", "herdr", "provider"]);
function projectionFact(valueCodec, sourceCodec = projectionSourceCodec) {
  return unionOf([
    objectCodec({
      freshness: enumeration(["live", "snapshot", "stale"]),
      source: sourceCodec,
      revision: integer(),
      observedAt: timestamp,
      value: valueCodec
    }),
    objectCodec({
      freshness: literal("unavailable"),
      source: sourceCodec,
      revision: integer(),
      observedAt: timestamp,
      reason: text
    }),
    objectCodec({
      freshness: literal("conflict"),
      source: sourceCodec,
      revision: integer(),
      observedAt: timestamp,
      candidates: arrayOf(valueCodec, { minimum: 2, maximum: 16 })
    })
  ]);
}
var resourceScopeCodec = unionOf([
  objectCodec({ kind: literal("project"), scopeId: identifier, projectId: identifier }),
  objectCodec({ kind: literal("project-session"), scopeId: identifier, projectId: identifier, projectSessionId: identifier }),
  objectCodec({ kind: literal("coordination-run"), scopeId: identifier, projectSessionId: identifier, coordinationRunId: identifier }),
  objectCodec({ kind: literal("team"), scopeId: identifier, coordinationRunId: identifier, teamId: identifier }),
  objectCodec({ kind: literal("agent"), scopeId: identifier, teamId: identifier, agentId: identifier })
]);
var absoluteFilesystemPathCodec = boundedString({ maxBytes: 4096, pattern: "^/", example: "/workspace/project" });
var canonicalAbsoluteFilesystemPathCodec = boundedString({
  maxBytes: 4096,
  pattern: "^/(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//).+$",
  example: "/workspace/project"
});
var gitRefNameCodec = boundedString({ maxBytes: 1024, example: "refs/heads/main" });
var gitDiffSelectorCodec = unionOf([
  objectCodec({ kind: literal("working-tree") }),
  objectCodec({ kind: literal("staged") }),
  objectCodec({ kind: literal("objects"), baseObjectDigest: sha256, targetObjectDigest: sha256 })
]);
var gitLogCursorCodec = objectCodec({ repositoryStateDigest: sha256, afterObjectDigest: sha256 });
var gitLogRequestCodec = objectCodec({ limit: integer({ minimum: 1, maximum: 128 }) }, { cursor: gitLogCursorCodec });
var repositoryReadCommonFields = {
  credential: credentialCodec,
  projectId: identifier,
  snapshotRevision: positiveInteger,
  diff: gitDiffSelectorCodec,
  log: gitLogRequestCodec
};
var gitRepositoryReadInputCodec = unionOf([
  objectCodec({
    ...repositoryReadCommonFields,
    target: objectCodec({ kind: literal("project-root") })
  }, { projectSessionId: identifier }),
  objectCodec({
    ...repositoryReadCommonFields,
    projectSessionId: identifier,
    target: objectCodec({
      kind: literal("session-worktree"),
      canonicalWorktreePath: canonicalAbsoluteFilesystemPathCodec
    })
  })
]);
var gitHeadCodec = unionOf([
  objectCodec({ detached: literal(false), refName: gitRefNameCodec, objectDigest: sha256 }),
  objectCodec({ detached: literal(true), objectDigest: sha256 })
]);
var gitPathPageCodec = objectCodec({
  paths: arrayOf(relativePath, { maximum: 256, unique: true }),
  truncated: boolean
});
var gitOperationStateCodec = unionOf([
  objectCodec({ kind: literal("clean") }),
  objectCodec({ kind: literal("merge") }),
  objectCodec({ kind: literal("rebase") }),
  objectCodec({ kind: literal("cherry-pick") }),
  objectCodec({ kind: literal("bisect") })
]);
var gitUpstreamIdentityCodec = objectCodec({ remoteName: identifier, branchName: gitRefNameCodec });
var gitUpstreamCodec = objectCodec({
  remoteName: identifier,
  branchName: gitRefNameCodec,
  ahead: integer(),
  behind: integer()
});
var gitHostedChecksCodec = objectCodec({
  repository: boundedString({ maxBytes: 1024 }),
  headObjectDigest: sha256,
  state: enumeration(["passing", "failing", "pending", "unknown"]),
  total: integer(),
  passing: integer(),
  failing: integer(),
  pending: integer()
});
var gitDiffProjectionCodec = objectCodec({
  selector: gitDiffSelectorCodec,
  artifactRef: artifactRefCodec2,
  baseDigest: sha256,
  targetDigest: sha256
});
var gitLogEntryCodec = objectCodec({
  objectDigest: sha256,
  parentObjectDigests: arrayOf(sha256, { maximum: 64, unique: true }),
  subject: boundedString({ maxBytes: 1024 }),
  authorTimestamp: timestamp
});
var gitLogPageCodec = unionOf([
  objectCodec({
    items: arrayOf(gitLogEntryCodec, { maximum: 128 }),
    hasMore: literal(false),
    nextCursor: literal(null)
  }),
  objectCodec({
    items: arrayOf(gitLogEntryCodec, { maximum: 128 }),
    hasMore: literal(true),
    nextCursor: gitLogCursorCodec
  })
]);
var gitBranchRecordCodec = objectCodec({
  refName: gitRefNameCodec,
  objectDigest: sha256,
  checkedOut: boolean,
  upstream: nullable(gitUpstreamIdentityCodec)
});
var gitWorktreeRecordCodec = objectCodec({
  canonicalPath: canonicalAbsoluteFilesystemPathCodec,
  head: gitHeadCodec,
  current: boolean,
  locked: boolean
});
var gitRepositoryProjectionCodec = objectCodec({
  freshness: enumeration(["live", "snapshot", "stale"]),
  source: literal("git"),
  revision: positiveInteger,
  observedAt: timestamp,
  canonicalRepositoryRoot: canonicalAbsoluteFilesystemPathCodec,
  canonicalWorktreePath: canonicalAbsoluteFilesystemPathCodec,
  repositoryStateDigest: sha256,
  head: gitHeadCodec,
  headDigest: sha256,
  indexDigest: sha256,
  worktreeDigest: sha256,
  remoteDigest: sha256,
  changes: objectCodec({
    staged: gitPathPageCodec,
    unstaged: gitPathPageCodec,
    untracked: gitPathPageCodec,
    conflicted: gitPathPageCodec
  }),
  operationState: gitOperationStateCodec,
  upstream: nullable(gitUpstreamCodec),
  diff: gitDiffProjectionCodec,
  log: gitLogPageCodec,
  branches: objectCodec({ items: arrayOf(gitBranchRecordCodec, { maximum: 128 }), truncated: boolean }),
  worktrees: objectCodec({ items: arrayOf(gitWorktreeRecordCodec, { maximum: 64 }), truncated: boolean }),
  hostedChecks: projectionFact(nullable(gitHostedChecksCodec), literal("github"))
});
var gitRepositorySummaryCodec = objectCodec({
  freshness: enumeration(["live", "snapshot", "stale"]),
  source: literal("git"),
  revision: positiveInteger,
  observedAt: timestamp,
  repositoryStateDigest: sha256,
  head: gitHeadCodec,
  operationState: enumeration(["clean", "merge", "rebase", "cherry-pick", "bisect"]),
  counts: objectCodec({ staged: integer(), unstaged: integer(), untracked: integer(), conflicted: integer() }),
  pathsTruncated: boolean,
  upstream: nullable(gitUpstreamCodec),
  hostedChecks: projectionFact(nullable(gitHostedChecksCodec), literal("github"))
});
var gitRepositoryReadResultCodec = unionOf([
  objectCodec({
    status: literal("current"),
    projectId: identifier,
    projectSessionId: nullable(identifier),
    snapshotRevision: positiveInteger,
    readTransactionId: identifier,
    repository: gitRepositoryProjectionCodec
  }),
  objectCodec({
    status: literal("resnapshot-required"),
    reason: literal("snapshot-mismatch"),
    currentSnapshotRevision: positiveInteger
  })
]);
var writerAdmissionCodec = objectCodec({
  repositoryRoot: absoluteFilesystemPathCodec,
  worktreePath: absoluteFilesystemPathCodec,
  sourcePrefixes: arrayOf(relativePath, { minimum: 1, maximum: 128, unique: true }),
  writerGeneration: positiveInteger
});
var taskResultCodec = objectCodec({
  taskId: identifier,
  ownerAgentId: nullable(identifier),
  state: enumeration(["blocked", "ready", "active", "complete", "cancelled", "degraded"]),
  revision: positiveInteger,
  ownerLeaseGeneration: integer(),
  proposedOwnerAgentId: nullable(identifier),
  dependencies: stringList
});
var leaseResultCodec = objectCodec({
  leaseId: identifier,
  holderAgentId: identifier,
  generation: positiveInteger,
  status: enumeration(["active", "quarantined"]),
  scope: stringList
});
var lifecycleResultCodec = objectCodec({
  agentId: identifier,
  lifecycle: text,
  providerSessionGeneration: positiveInteger
}, {
  rotation: objectCodec({
    kind: enumeration(["in-place", "replacement-session"]),
    priorResumeReference: identifier
  })
});
var providerActionResultCodec = objectCodec({
  actionId: identifier,
  status: enumeration(["prepared", "dispatched", "accepted", "terminal", "ambiguous", "quarantined"]),
  history: textList,
  executionCount: integer(),
  effectCount: integer()
}, { resultDigest: sha256 });
var agentCustodyResultCodec = objectCodec({
  agentId: identifier,
  authorityId: identifier,
  adapterId: identifier,
  actionId: identifier,
  providerSessionRef: identifier,
  providerSessionGeneration: positiveInteger,
  bridgeState: enumeration(["active", "none"]),
  bridgeGeneration: positiveInteger,
  evidenceDigest: sha256
});
var budgetDimensionCodec = objectCodec({
  granted: integer(),
  reserved: integer(),
  consumed: integer(),
  available: integer(),
  usageUnknown: boolean
});
var budgetResultCodec = objectCodec({
  budgetId: identifier,
  parentBudgetId: nullable(identifier),
  state: enumeration(["active", "usage-unknown", "released"]),
  dimensions: recordOf(budgetDimensionCodec, { maximum: 128, keyCodec: budgetUnitKey }),
  returned: numberRecord
});
var teamResultCodec = objectCodec({
  teamId: identifier,
  parentTeamId: nullable(identifier),
  depth: integer(),
  leaderAgentId: identifier,
  rootTaskId: identifier,
  ownedTaskIds: stringList,
  memberAgentIds: stringList,
  budgetId: identifier,
  state: enumeration(["active", "frozen", "barrier-closed"]),
  generation: positiveInteger,
  successorAgentId: nullable(identifier),
  discussionGroups: arrayOf(discussionGroupCodec, { maximum: 64 }),
  reservedBudget: numberRecord
}, {
  leader: objectCodec({ agentId: identifier, authorityId: identifier }),
  rootTask: taskResultCodec,
  initialMemberAgentIds: stringList
});
var visibleTeamResultCodec = objectCodec({
  teamId: identifier,
  parentTeamId: nullable(identifier),
  depth: integer(),
  leaderAgentId: identifier,
  rootTaskId: identifier,
  ownedTaskIds: stringList,
  memberAgentIds: stringList,
  budgetId: identifier,
  state: enumeration(["active", "frozen", "barrier-closed"]),
  generation: positiveInteger,
  successorAgentId: nullable(identifier),
  discussionGroups: arrayOf(discussionGroupCodec, { maximum: 64 }),
  reservedBudget: numberRecord
}, {
  rootTask: taskResultCodec,
  initialMemberAgentIds: stringList
});
var intakeBindingCodec = objectCodec({
  intakeId: identifier,
  intakeRevision: positiveInteger,
  gateIds: stringList,
  artifactDigests: arrayOf(sha256, { maximum: 128, unique: true })
});
var taskRequestTaskCodec = objectCodec({
  taskId: identifier,
  taskRevision: positiveInteger,
  objective: text,
  baseRevision: text,
  expectedArtifactPaths: arrayOf(relativePath, { maximum: 128, unique: true })
});
var taskRequestMessageCodec = objectCodec({
  requestRevision: positiveInteger,
  messageId: identifier,
  conversationId: identifier,
  targetAgentId: identifier,
  targetProviderSessionRef: identifier,
  requiresAck: literal(true),
  dedupeKey: text,
  responseDeadline: timestamp,
  callbackId: identifier,
  callbackGeneration: positiveInteger,
  dependentBarrierId: identifier
}, { intakeBinding: intakeBindingCodec });
var taskRequestCodec = objectCodec({
  commandId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  task: taskRequestTaskCodec,
  request: taskRequestMessageCodec
});
var replyCodec = objectCodec({
  messageId: identifier,
  conversationId: identifier,
  replyToMessageId: identifier,
  body: boundedString({ maxBytes: 4096 }),
  artifactRefs: artifactRefsCodec
});
var terminalResultCodec = objectCodec({
  status: literal("complete"),
  summary: text,
  completedAt: timestamp
});
var taskCompletionCodec = objectCodec({
  commandId: identifier,
  taskId: identifier,
  expectedTaskRevision: positiveInteger,
  ownerLeaseId: identifier,
  ownerLeaseGeneration: positiveInteger,
  requestMessageId: identifier,
  expectedRequestRevision: positiveInteger,
  callbackId: identifier,
  callbackGeneration: positiveInteger,
  reply: replyCodec,
  terminalResult: terminalResultCodec
});
var resultDeliveryBase = {
  resultDeliveryId: identifier,
  revision: positiveInteger,
  projectSessionId: identifier,
  taskId: identifier,
  requestMessageId: identifier,
  requestRevision: positiveInteger,
  replyMessageId: identifier,
  replyRevision: positiveInteger,
  taskRevision: positiveInteger,
  callbackId: identifier,
  callbackGeneration: positiveInteger,
  assignmentGeneration: positiveInteger,
  targetAgentId: identifier,
  targetProviderSessionRef: identifier,
  payloadDigest: sha256,
  responseDeadline: timestamp,
  dependentBarrierId: identifier,
  required: boolean,
  claimGeneration: integer()
};
var resultDeliveryCodec = unionOf([
  objectCodec({ ...resultDeliveryBase, state: literal("pending") }),
  objectCodec({
    ...resultDeliveryBase,
    state: literal("claimed"),
    claimedByAgentId: identifier,
    claimDeadline: timestamp
  }),
  objectCodec({
    ...resultDeliveryBase,
    state: literal("provider-accepted"),
    claimedByAgentId: identifier,
    claimDeadline: timestamp,
    providerAcceptedAt: timestamp
  }),
  objectCodec({ ...resultDeliveryBase, state: literal("consumed"), consumedAt: timestamp }),
  objectCodec({ ...resultDeliveryBase, state: literal("overdue"), overdueAt: timestamp }),
  objectCodec({ ...resultDeliveryBase, state: literal("abandoned"), abandonedAt: timestamp, reason: text })
]);
var integrationContextCodec = objectCodec({
  commandId: identifier,
  integrationId: identifier,
  expectedIntegrationGeneration: positiveInteger,
  eventId: identifier,
  eventDigest: sha256
});
var providerEventCodec = objectCodec({
  providerId: identifier,
  providerSessionRef: identifier,
  providerMessageId: identifier,
  inputEventId: identifier,
  eventDigest: sha256,
  classification: literal("direct-human")
});
var gateBindingCodec = objectCodec({
  gateId: identifier,
  expectedGateRevision: positiveInteger,
  artifactDigests: arrayOf(sha256, { minimum: 1, maximum: 128, unique: true }),
  interpretedDecision: enumeration(["approve", "reject", "defer", "request-changes"])
});
var attestationCodec = objectCodec({
  attestationId: identifier,
  integrationId: identifier,
  integrationGeneration: positiveInteger,
  operatorId: identifier,
  projectId: identifier,
  projectSessionId: identifier,
  providerEvent: providerEventCodec,
  humanUtterance: text,
  gateBinding: gateBindingCodec,
  recordedAt: timestamp
});
var intakeDraftCodec = objectCodec({
  intakeId: identifier,
  projectId: identifier,
  revision: positiveInteger,
  state: literal("draft"),
  dedupeKey: text,
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList
});
var boundIntakeCodec = objectCodec({
  intakeId: identifier,
  projectId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  revision: positiveInteger,
  state: enumeration(["awaiting-chair", "discussing", "awaiting-human", "accepted", "deferred", "cancelled"]),
  dedupeKey: text,
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList
});
var intakeCodec = unionOf([intakeDraftCodec, boundIntakeCodec]);
var intakeDraftCreateBaseCodec = objectCodec({
  command: operatorMutationCodec,
  intakeId: identifier,
  dedupeKey: text,
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList
});
var intakeDraftCreateCodec = parserBacked(
  intakeDraftCreateBaseCodec,
  parseIntakeDraftCreateRequest,
  parseIntakeDraftCreateRequest({
    ...intakeDraftCreateBaseCodec.example,
    command: { ...operatorMutationCodec.example, expectedRevision: 0 }
  })
);
var gateScopeCodec = unionOf([
  objectCodec({ kind: literal("task"), taskId: identifier }),
  objectCodec({ kind: literal("subtree"), rootTaskId: identifier }),
  objectCodec({ kind: literal("run") }),
  objectCodec({ kind: literal("release") })
]);
var releaseBindingCodec = objectCodec({
  acceptedDeliveryReceiptRef: artifactRefCodec2,
  artifactDigest: sha256,
  promotionAction: text,
  target: text
});
var operatorRevisionTargetCodec = unionOf([
  objectCodec({
    kind: literal("task"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    taskId: identifier,
    expectedRevision: positiveInteger
  }),
  objectCodec({
    kind: literal("subtree"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    rootTaskId: identifier,
    expectedRevision: positiveInteger
  }),
  objectCodec({
    kind: literal("run"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    expectedRevision: positiveInteger
  }),
  objectCodec({
    kind: literal("session"),
    projectSessionId: identifier,
    expectedRevision: positiveInteger,
    expectedGeneration: positiveInteger
  })
]);
var gitRepositoryBindingCodec = objectCodec({
  repositoryRoot: absoluteFilesystemPathCodec,
  worktreePath: absoluteFilesystemPathCodec,
  remoteName: identifier,
  expectedHeadDigest: sha256,
  expectedIndexDigest: sha256,
  expectedWorktreeDigest: sha256,
  expectedRemoteDigest: sha256
});
var gitCommitObjectCodec = objectCodec({ kind: literal("commit"), objectName: identifier, objectDigest: sha256 });
var gitTagObjectCodec = objectCodec({ kind: literal("tag"), objectName: identifier, objectDigest: sha256 });
var gitLocalBranchObjectCodec = objectCodec({
  kind: literal("local-branch"),
  objectName: identifier,
  objectDigest: sha256
});
var gitRemoteRefObjectCodec = objectCodec({
  kind: literal("remote-ref"),
  remoteName: identifier,
  objectName: identifier,
  objectDigest: sha256
});
var gitTrackingRefObjectCodec = objectCodec({
  kind: literal("tracking-ref"),
  remoteName: identifier,
  objectName: identifier,
  objectDigest: sha256
});
var gitObjectIntentCodec = unionOf([
  gitCommitObjectCodec,
  gitTagObjectCodec,
  gitLocalBranchObjectCodec,
  gitRemoteRefObjectCodec,
  gitTrackingRefObjectCodec
]);
var gitPushPolicyCodec = unionOf([
  objectCodec({ kind: literal("fast-forward-only") }),
  objectCodec({ kind: literal("force-with-lease"), expectedRemoteObjectDigest: sha256 })
]);
var gitEffectCodec = unionOf([
  objectCodec({ effect: literal("fetch"), source: gitRemoteRefObjectCodec, destination: gitTrackingRefObjectCodec }),
  objectCodec({
    effect: literal("pull"),
    source: gitRemoteRefObjectCodec,
    destination: gitLocalBranchObjectCodec,
    strategy: enumeration(["fast-forward-only", "merge", "rebase"])
  }),
  objectCodec({ effect: literal("stage"), paths: arrayOf(relativePath, { minimum: 1, maximum: 256, unique: true }) }),
  objectCodec({ effect: literal("unstage"), paths: arrayOf(relativePath, { minimum: 1, maximum: 256, unique: true }) }),
  objectCodec({
    effect: literal("commit"),
    sourceIndexDigest: sha256,
    destination: gitCommitObjectCodec,
    message: text
  }),
  objectCodec({ effect: literal("merge"), source: gitObjectIntentCodec, destination: gitLocalBranchObjectCodec }),
  objectCodec({ effect: literal("rebase"), source: gitLocalBranchObjectCodec, destination: gitObjectIntentCodec }),
  objectCodec({
    effect: literal("push"),
    source: gitLocalBranchObjectCodec,
    destination: gitRemoteRefObjectCodec,
    policy: gitPushPolicyCodec
  }),
  objectCodec({
    effect: literal("branch"),
    action: literal("create"),
    source: gitObjectIntentCodec,
    destination: gitLocalBranchObjectCodec
  }),
  objectCodec({ effect: literal("branch"), action: literal("delete"), source: gitLocalBranchObjectCodec }),
  objectCodec({
    effect: literal("branch"),
    action: literal("rename"),
    source: gitLocalBranchObjectCodec,
    destination: gitLocalBranchObjectCodec
  }),
  objectCodec({
    effect: literal("worktree"),
    action: literal("create"),
    destinationWorktreePath: absoluteFilesystemPathCodec,
    source: gitObjectIntentCodec
  }),
  objectCodec({
    effect: literal("worktree"),
    action: literal("remove"),
    sourceWorktreePath: absoluteFilesystemPathCodec,
    expectedWorktreeDigest: sha256
  }),
  objectCodec({
    effect: literal("worktree"),
    action: literal("move"),
    sourceWorktreePath: absoluteFilesystemPathCodec,
    destinationWorktreePath: absoluteFilesystemPathCodec,
    expectedWorktreeDigest: sha256
  })
]);
var operatorActionIntentCodec = unionOf([
  objectCodec({ kind: literal("control"), action: literal("pause"), target: operatorRevisionTargetCodec }),
  objectCodec({ kind: literal("control"), action: literal("resume"), target: operatorRevisionTargetCodec }),
  objectCodec({ kind: literal("control"), action: literal("cancel"), target: operatorRevisionTargetCodec, reason: text }),
  objectCodec({
    kind: literal("control"),
    action: literal("steer"),
    target: operatorRevisionTargetCodec,
    instruction: text,
    evidenceRefs: artifactRefsCodec
  }),
  PROJECT_SESSION_LAUNCH_INTENT_CODEC,
  objectCodec({
    kind: literal("project-session-drain"),
    projectSessionId: identifier,
    expectedSessionRevision: positiveInteger,
    expectedSessionGeneration: positiveInteger,
    expectedGlobalStateRevision: positiveInteger
  }),
  objectCodec({
    kind: literal("project-session-stop"),
    projectSessionId: identifier,
    expectedSessionRevision: positiveInteger,
    expectedSessionGeneration: positiveInteger,
    expectedGlobalStateRevision: positiveInteger,
    drainReceiptRef: artifactRefCodec2
  }),
  objectCodec({
    kind: literal("daemon-drain"),
    expectedDaemonGeneration: positiveInteger,
    expectedGlobalStateRevision: positiveInteger
  }),
  objectCodec({
    kind: literal("daemon-stop"),
    expectedDaemonGeneration: positiveInteger,
    expectedGlobalStateRevision: positiveInteger,
    drainReceiptRef: artifactRefCodec2
  }),
  objectCodec({ kind: literal("git"), repository: gitRepositoryBindingCodec, operation: gitEffectCodec }),
  objectCodec({
    kind: literal("registered-external-effect"),
    integrationId: identifier,
    expectedIntegrationGeneration: positiveInteger,
    operationId: identifier,
    contractDigest: sha256,
    requestArtifactRef: artifactRefCodec2,
    targetId: identifier,
    expectedTargetRevision: positiveInteger,
    idempotencyKey: text
  }),
  objectCodec({
    kind: literal("promotion"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    gateId: identifier,
    expectedGateRevision: positiveInteger,
    expectedGateStatus: literal("approved"),
    releaseBinding: releaseBindingCodec
  })
]);
var operatorActionPreviewInputCodec = objectCodec({
  command: operatorMutationCodec,
  projectId: identifier,
  intent: operatorActionIntentCodec
});
var operatorActionPreviewCodec = objectCodec({
  previewId: identifier,
  previewRevision: positiveInteger,
  previewDigest: sha256,
  intent: operatorActionIntentCodec,
  intentDigest: sha256,
  beforeStateDigest: sha256,
  consequenceClass: enumeration(["routine", "consequential", "destructive", "external", "promotion"]),
  evidenceRefs: artifactRefsCodec,
  gateIds: stringList,
  confirmationMode: enumeration(["explicit", "echo"]),
  expiresAt: timestamp
});
var operatorActionConfirmationCodec = unionOf([
  objectCodec({ kind: literal("explicit"), confirmationId: identifier }),
  objectCodec({ kind: literal("echo"), echoedPreviewDigest: sha256 })
]);
var operatorActionCommitBaseCodec = objectCodec({
  command: operatorMutationCodec,
  projectId: identifier,
  previewId: identifier,
  expectedPreviewRevision: positiveInteger,
  previewDigest: sha256,
  expectedIntentDigest: sha256,
  confirmation: operatorActionConfirmationCodec
});
var operatorActionCommitCodec = parserBacked(
  operatorActionCommitBaseCodec,
  (value) => {
    const confirmation = Reflect.get(value, "confirmation");
    if (confirmation.kind === "echo" && confirmation.echoedPreviewDigest !== Reflect.get(value, "previewDigest")) {
      throw new TypeError("operatorActionCommit echoed preview digest does not match");
    }
    return value;
  },
  operatorActionCommitBaseCodec.example
);
var operatorActionReceiptFields = {
  commandId: identifier,
  previewId: identifier,
  previewRevision: positiveInteger,
  intentDigest: sha256,
  beforeStateDigest: sha256,
  afterStateDigest: sha256,
  evidenceRefs: artifactRefsCodec,
  committedAt: timestamp
};
var operatorActionReceiptCodec = unionOf([
  objectCodec(operatorActionReceiptFields, { effectRef: artifactRefCodec2 }),
  objectCodec({ ...operatorActionReceiptFields, providerActionRef: PROVIDER_ACTION_REF_V1_CODEC }, {
    effectRef: artifactRefCodec2
  })
]);
var operatorActionStatusInputCodec = objectCodec({
  credential: credentialCodec,
  projectId: identifier,
  commandId: identifier
});
var operatorActionReconcileBaseCodec = objectCodec({
  command: operatorMutationCodec,
  projectId: identifier,
  targetCommandId: identifier,
  expectedStatus: enumeration(["pending", "ambiguous"]),
  expectedAttemptGeneration: positiveInteger,
  mode: literal("observe-only")
});
var operatorActionReconcileCodec = parserBacked(
  operatorActionReconcileBaseCodec,
  (value) => {
    const command = Reflect.get(value, "command");
    if (command.commandId === Reflect.get(value, "targetCommandId")) {
      throw new TypeError("operatorActionReconcile requires a new command ID");
    }
    return value;
  },
  {
    ...operatorActionReconcileBaseCodec.example,
    targetCommandId: "target_command_01"
  }
);
var operatorActionStatusCodec = unionOf([
  objectCodec({ status: literal("not-found"), commandId: identifier }),
  objectCodec({
    status: literal("pending"),
    commandId: identifier,
    intentDigest: sha256,
    phase: enumeration(["prepared", "dispatched", "accepted", "observing"]),
    attemptGeneration: positiveInteger
  }),
  objectCodec({
    status: literal("pending"),
    commandId: identifier,
    intentDigest: sha256,
    phase: enumeration(["prepared", "dispatched", "accepted", "observing"]),
    attemptGeneration: positiveInteger,
    providerActionRef: PROVIDER_ACTION_REF_V1_CODEC
  }),
  objectCodec({
    status: literal("ambiguous"),
    commandId: identifier,
    intentDigest: sha256,
    attemptGeneration: positiveInteger,
    effectRef: artifactRefCodec2
  }),
  objectCodec({
    status: literal("ambiguous"),
    commandId: identifier,
    intentDigest: sha256,
    attemptGeneration: positiveInteger,
    providerActionRef: PROVIDER_ACTION_REF_V1_CODEC
  }, { effectRef: artifactRefCodec2 }),
  objectCodec({ status: literal("committed"), commandId: identifier, receipt: operatorActionReceiptCodec }),
  objectCodec({
    status: literal("rejected"),
    commandId: identifier,
    intentDigest: sha256,
    code: enumeration([
      "authority-insufficient",
      "preview-expired",
      "preview-stale",
      "state-changed",
      "generation-stale",
      "git-state-changed",
      "external-contract-unknown",
      "external-contract-stale",
      "release-binding-mismatch",
      "dedupe-conflict"
    ]),
    evidenceRefs: artifactRefsCodec
  })
]);
var operatorActionAvailabilityCodec = unionOf([
  objectCodec({
    state: literal("read-only"),
    reason: enumeration(["feature-unavailable", "authority-insufficient", "state-ineligible"])
  }),
  objectCodec({
    state: literal("available"),
    actions: arrayOf(enumeration([
      "pause",
      "resume",
      "cancel",
      "steer",
      "project-session-launch",
      "project-session-drain",
      "project-session-stop",
      "daemon-drain",
      "daemon-stop",
      "git",
      "registered-external-effect",
      "promotion"
    ]), { minimum: 1, maximum: 12, unique: true }),
    requiresPreview: literal(true)
  })
]);
var operatorDetailRefCodec = unionOf([
  objectCodec({ kind: literal("project"), projectId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("session"), projectSessionId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("run"), coordinationRunId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("task"), taskId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("agent"), agentId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("evidence"), evidenceId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("activity"), eventId: identifier, expectedRevision: positiveInteger }),
  objectCodec({ kind: literal("system"), componentId: identifier, expectedRevision: positiveInteger })
]);
var projectDetailRefCodec = objectCodec({
  kind: literal("project"),
  projectId: identifier,
  expectedRevision: positiveInteger
});
var runDetailRefCodec = objectCodec({
  kind: literal("run"),
  coordinationRunId: identifier,
  expectedRevision: positiveInteger
});
var taskDetailRefCodec = objectCodec({ kind: literal("task"), taskId: identifier, expectedRevision: positiveInteger });
var agentDetailRefCodec = objectCodec({ kind: literal("agent"), agentId: identifier, expectedRevision: positiveInteger });
var evidenceDetailRefCodec = objectCodec({
  kind: literal("evidence"),
  evidenceId: identifier,
  expectedRevision: positiveInteger
});
var activityDetailRefCodec = objectCodec({
  kind: literal("activity"),
  eventId: identifier,
  expectedRevision: positiveInteger
});
var systemDetailRefCodec = objectCodec({
  kind: literal("system"),
  componentId: identifier,
  expectedRevision: positiveInteger
});
var messageBodyRefCodec = objectCodec({
  projectSessionId: identifier,
  messageId: identifier,
  expectedRevision: positiveInteger
});
var attentionSummaryCodec = objectCodec({
  kind: literal("attention"),
  label: enumeration(["Decision", "Approval", "Blocked", "FYI"]),
  priority: enumeration(["safety-integrity", "critical-path", "expiring-authority", "acceptance-ready", "advisory"]),
  title: text
});
var projectSummaryCodec = objectCodec(
  { kind: literal("project"), goal: text, repositoryRevision: text },
  { repository: gitRepositorySummaryCodec }
);
var runSummaryCodec = objectCodec({
  kind: literal("run"),
  phase: text,
  health: enumeration(["healthy", "degraded", "blocked", "quarantined", "unknown"]),
  nextMilestone: text
});
var workSummaryCodec = objectCodec({
  kind: literal("work"),
  state: text,
  checkState: enumeration(["pending", "passing", "failing", "unknown"])
});
var agentSummaryCodec = objectCodec({
  kind: literal("agent"),
  role: enumeration(["chair", "lead", "worker", "reviewer"]),
  lifecycle: text,
  contextPressure: enumeration(["low", "medium", "high", "unknown"])
});
var evidenceSummaryCodec = objectCodec({
  kind: literal("evidence"),
  evidenceKind: enumeration(["artifact", "diff", "test", "review", "receipt"]),
  status: enumeration(["pass", "fail", "pending", "informational"]),
  provenance: text
});
var activitySummaryFields = {
  kind: literal("activity"),
  summary: text,
  occurredAt: timestamp
};
var activitySummaryCodec = unionOf([
  objectCodec({
    ...activitySummaryFields,
    activityKind: literal("message"),
    messageBodyRef: messageBodyRefCodec
  }),
  objectCodec({
    ...activitySummaryFields,
    activityKind: enumeration(["decision", "lifecycle", "operation"])
  })
]);
var systemSummaryCodec = objectCodec({
  kind: literal("system"),
  systemKind: enumeration(["daemon", "adapter", "trust", "seat", "integration"]),
  state: enumeration(["healthy", "degraded", "stale", "unavailable", "conflict"]),
  detail: text
});
function operatorViewRowCodec(summary, detailRef) {
  return objectCodec({
    itemId: identifier,
    itemRevision: positiveInteger,
    fact: projectionFact(objectCodec({ summary, detailRef, actionAvailability: operatorActionAvailabilityCodec }))
  });
}
var attentionRowCodec = operatorViewRowCodec(attentionSummaryCodec, operatorDetailRefCodec);
var projectRowCodec = operatorViewRowCodec(projectSummaryCodec, projectDetailRefCodec);
var runRowCodec = operatorViewRowCodec(runSummaryCodec, runDetailRefCodec);
var workRowCodec = operatorViewRowCodec(workSummaryCodec, taskDetailRefCodec);
var agentRowCodecV2 = operatorViewRowCodec(agentSummaryCodec, agentDetailRefCodec);
var evidenceRowCodec = operatorViewRowCodec(evidenceSummaryCodec, evidenceDetailRefCodec);
var activityRowCodec = operatorViewRowCodec(activitySummaryCodec, activityDetailRefCodec);
var systemRowCodec = operatorViewRowCodec(systemSummaryCodec, systemDetailRefCodec);
function operatorViewPageVariant(view, row) {
  return objectCodec({
    status: literal("page"),
    view: literal(view),
    rows: arrayOf(row, { maximum: 256 }),
    nextCursor: integer(),
    hasMore: boolean,
    snapshotRevision: positiveInteger,
    readTransactionId: identifier
  });
}
var operatorViewPageInputCodec = objectCodec({
  credential: credentialCodec,
  projectId: identifier,
  view: enumeration(["attention", "project", "runs", "work", "agents", "evidence", "activity", "system"]),
  snapshotRevision: positiveInteger,
  cursor: integer(),
  limit: integer({ minimum: 1, maximum: 256 })
}, { projectSessionId: identifier });
var operatorViewPageBaseCodec = unionOf([
  operatorViewPageVariant("attention", attentionRowCodec),
  operatorViewPageVariant("project", projectRowCodec),
  operatorViewPageVariant("runs", runRowCodec),
  operatorViewPageVariant("work", workRowCodec),
  operatorViewPageVariant("agents", agentRowCodecV2),
  operatorViewPageVariant("evidence", evidenceRowCodec),
  operatorViewPageVariant("activity", activityRowCodec),
  operatorViewPageVariant("system", systemRowCodec),
  objectCodec({
    status: literal("resnapshot-required"),
    view: enumeration(["attention", "project", "runs", "work", "agents", "evidence", "activity", "system"]),
    reason: enumeration(["snapshot-mismatch", "retention-gap", "project-cursor-mismatch", "cursor-overflow"]),
    currentSnapshotRevision: positiveInteger,
    snapshotCursor: integer()
  })
]);
var operatorViewPageResultCodec = parserBacked(
  operatorViewPageBaseCodec,
  (value) => {
    if (Reflect.get(value, "status") !== "page") return value;
    const rows = Reflect.get(value, "rows");
    for (const [index, row] of rows.entries()) {
      const fact2 = row.fact;
      if (row.itemRevision !== fact2.revision) {
        throw new TypeError(`operatorViewPage.rows[${String(index)}] item revision does not match fact revision`);
      }
    }
    return value;
  },
  operatorViewPageBaseCodec.example
);
var operatorDetailCodec = unionOf([
  objectCodec(
    { kind: literal("project"), projectId: identifier, canonicalRoot: absoluteFilesystemPathCodec, goal: text, repositoryRevision: text },
    { repository: gitRepositoryProjectionCodec }
  ),
  objectCodec({
    kind: literal("session"),
    projectSessionId: identifier,
    mode: enumeration(["coordinated", "independent"]),
    state: enumeration([
      "draft",
      "awaiting_launch",
      "launching",
      "active",
      "quiescing",
      "awaiting_acceptance",
      "closed",
      "launch_failed",
      "launch_ambiguous",
      "reconciling",
      "visibility_degraded",
      "recovery_required",
      "quarantined",
      "cancelled"
    ]),
    generation: positiveInteger,
    membershipRevision: integer()
  }),
  objectCodec({
    kind: literal("run"),
    coordinationRunId: identifier,
    phase: text,
    chairAgentId: identifier,
    chairGeneration: positiveInteger,
    health: enumeration(["healthy", "degraded", "blocked", "quarantined", "unknown"])
  }),
  objectCodec({ kind: literal("task"), taskId: identifier, objective: text, state: text, ownerAgentId: nullable(identifier) }),
  objectCodec({
    kind: literal("agent"),
    agentId: identifier,
    role: enumeration(["chair", "lead", "worker", "reviewer"]),
    lifecycle: text,
    provider: text,
    providerSessionGeneration: positiveInteger
  }),
  objectCodec({
    kind: literal("evidence"),
    evidenceId: identifier,
    evidenceKind: enumeration(["artifact", "diff", "test", "review", "receipt"]),
    artifactRef: artifactRefCodec2,
    status: enumeration(["pass", "fail", "pending", "informational"])
  }),
  objectCodec({
    kind: literal("activity"),
    eventId: identifier,
    activityKind: literal("message"),
    summary: text,
    occurredAt: timestamp,
    messageBodyRef: messageBodyRefCodec
  }),
  objectCodec({
    kind: literal("activity"),
    eventId: identifier,
    activityKind: enumeration(["decision", "lifecycle", "operation"]),
    summary: text,
    occurredAt: timestamp
  }),
  objectCodec({
    kind: literal("system"),
    componentId: identifier,
    systemKind: enumeration(["daemon", "adapter", "trust", "seat", "integration"]),
    state: enumeration(["healthy", "degraded", "stale", "unavailable", "conflict"]),
    generation: positiveInteger,
    detail: text
  })
]);
var operatorDetailReadInputCodec = objectCodec({
  credential: credentialCodec,
  projectId: identifier,
  snapshotRevision: positiveInteger,
  detailRef: operatorDetailRefCodec
}, { projectSessionId: identifier });
var operatorDetailReadBaseCodec = unionOf([
  objectCodec({
    status: literal("current"),
    detailRef: operatorDetailRefCodec,
    detail: projectionFact(operatorDetailCodec),
    snapshotRevision: positiveInteger,
    readTransactionId: identifier
  }),
  objectCodec({
    status: literal("resnapshot-required"),
    reason: enumeration(["snapshot-mismatch", "detail-revision-changed"]),
    currentSnapshotRevision: positiveInteger
  })
]);
var operatorDetailReadResultCodec = parserBacked(
  operatorDetailReadBaseCodec,
  (value) => {
    if (Reflect.get(value, "status") !== "current") return value;
    const detailRef = Reflect.get(value, "detailRef");
    const fact2 = Reflect.get(value, "detail");
    if (detailRef.expectedRevision !== fact2.revision) {
      throw new TypeError("operatorDetailRead detail revision does not match reference");
    }
    const values = fact2.freshness === "conflict" ? fact2.candidates : fact2.freshness === "unavailable" ? [] : [fact2.value];
    if (values.some((detail) => detail.kind !== detailRef.kind)) {
      throw new TypeError("operatorDetailRead detail kind does not match reference");
    }
    return value;
  },
  operatorDetailReadBaseCodec.example
);
var gateIntentCodec = objectCodec({
  projectSessionId: identifier,
  coordinationRunId: identifier,
  dedupeKey: text,
  scope: gateScopeCodec,
  blockedOperationIds: arrayOf(activeOperationCodec, { maximum: 128, unique: true }),
  enforcementPoints: arrayOf(enumeration(["task-readiness", "operation", "scoped-barrier"]), {
    minimum: 1,
    maximum: 3,
    unique: true
  }),
  question: text,
  reason: text,
  options: arrayOf(text, { minimum: 1, maximum: 64 }),
  recommendation: optionalText,
  consequences: textList,
  evidenceRefs: artifactRefsCodec
}, { deadline: timestamp, default: text, releaseBinding: releaseBindingCodec });
var intakeRevisionCommonFields = {
  intakeId: identifier,
  projectSessionId: identifier,
  coordinationRunId: identifier,
  expectedRevision: positiveInteger,
  state: enumeration(["awaiting-chair", "discussing", "awaiting-human", "accepted", "deferred", "cancelled"]),
  summary: text,
  artifactRefs: artifactRefsCodec,
  gateIds: stringList
};
var intakeRevisionCodec = unionOf([
  objectCodec({
    origin: literal("operator"),
    command: operatorMutationCodec,
    ...intakeRevisionCommonFields
  }, { chairRequest: taskRequestCodec }),
  objectCodec({
    origin: literal("chair"),
    command: chairMutationCodec,
    ...intakeRevisionCommonFields
  }, { chairRequest: taskRequestCodec })
]);
var gateCreateCodec = unionOf([
  objectCodec({ origin: literal("operator"), command: operatorMutationCodec, intent: gateIntentCodec }),
  objectCodec({ origin: literal("chair"), command: chairMutationCodec, intent: gateIntentCodec })
]);
var typedDecisionEvidenceCodec = objectCodec({
  kind: literal("typed-console"),
  confirmationCommandId: identifier
});
var attestedDecisionEvidenceCodec = objectCodec({
  kind: literal("attested-input"),
  attestationId: identifier,
  expectedIntegrationGeneration: positiveInteger
});
var decisionEvidenceCodec = unionOf([typedDecisionEvidenceCodec, attestedDecisionEvidenceCodec]);
var scopedGateCheckCodec = unionOf([
  objectCodec({
    projectSessionId: identifier,
    coordinationRunId: identifier,
    dependencyRevision: integer(),
    enforcementPoint: literal("task-readiness"),
    taskId: identifier
  }),
  objectCodec({
    projectSessionId: identifier,
    coordinationRunId: identifier,
    dependencyRevision: integer(),
    enforcementPoint: literal("operation"),
    operationId: activeOperationCodec
  }),
  objectCodec({
    projectSessionId: identifier,
    coordinationRunId: identifier,
    dependencyRevision: integer(),
    enforcementPoint: literal("scoped-barrier"),
    barrierId: identifier
  })
]);
var scopedGateReadInputCodec = objectCodec({
  credential: credentialCodec,
  projectId: identifier,
  projectSessionId: identifier,
  gateId: identifier
}, { expectedRevision: positiveInteger });
function memberVariants(kind, identityField) {
  const identity = {
    kind: literal(kind),
    membershipId: identifier,
    coordinationRunId: identifier,
    [identityField]: identifier
  };
  return [
    objectCodec({ ...identity, state: literal("active") }),
    objectCodec({ ...identity, state: literal("terminal") }),
    objectCodec({ ...identity, state: literal("abandoned"), reason: text })
  ];
}
var projectSessionMemberCodec = unionOf([
  ...memberVariants("coordination-run", "runId"),
  ...memberVariants("workstream", "workstreamId"),
  ...memberVariants("task", "taskId"),
  ...memberVariants("lease", "leaseId"),
  ...memberVariants("provider-action", "providerActionId"),
  ...memberVariants("required-message", "messageId"),
  ...memberVariants("artifact-obligation", "artifactObligationId"),
  ...memberVariants("gate", "gateId"),
  ...memberVariants("scoped-barrier", "barrierId")
]);
var membershipBindCodec = unionOf([
  objectCodec({
    origin: literal("operator"),
    command: operatorMutationCodec,
    projectSessionId: identifier,
    coordinationRunId: identifier,
    expectedMembershipRevision: integer(),
    members: arrayOf(projectSessionMemberCodec, { maximum: 256 })
  }),
  objectCodec({
    origin: literal("chair"),
    command: chairMutationCodec,
    projectSessionId: identifier,
    coordinationRunId: identifier,
    expectedMembershipRevision: positiveInteger,
    members: arrayOf(projectSessionMemberCodec, { maximum: 256 })
  })
]);
var resourceDimensionCodec = unionOf([
  objectCodec({ unknown: literal(false), used: integer(), reserved: integer(), remaining: integer() }),
  objectCodec({ unknown: literal(true), used: nullable(integer()), reserved: integer(), remaining: literal(null) })
]);
var typedGateResolutionCodec = objectCodec({
  kind: literal("typed-console"),
  operatorId: identifier,
  confirmationCommandId: identifier,
  decidedAt: timestamp,
  evidenceRefs: artifactRefsCodec
});
var attestedGateResolutionCodec = objectCodec({
  kind: literal("attested-input"),
  operatorId: identifier,
  attestationId: identifier,
  integrationId: identifier,
  integrationGeneration: positiveInteger,
  decidedAt: timestamp,
  evidenceRefs: artifactRefsCodec
});
var gateResolutionCodec = unionOf([typedGateResolutionCodec, attestedGateResolutionCodec]);
var projectIdentityCodec = objectCodec({ projectId: identifier, canonicalRoot: text });
var projectViewItemCodec = objectCodec({
  projectId: identifier,
  goal: text,
  acceptedScopeRef: nullable(artifactRefCodec2),
  repositoryRevision: text,
  github: projectionFact(objectCodec({ repository: text, openPullRequests: integer() }))
});
var workViewItemCodec = objectCodec({
  taskId: identifier,
  workstreamId: nullable(identifier),
  parentTaskId: nullable(identifier),
  state: text,
  ownerAgentId: nullable(identifier),
  sourcePrefixes: arrayOf(relativePath, { maximum: 128, unique: true }),
  worktreePath: nullable(text),
  barrierIds: stringList,
  checkState: enumeration(["pending", "passing", "failing", "unknown"])
});
var agentViewItemCodec = objectCodec({
  agentId: identifier,
  stableTaskId: nullable(identifier),
  stableWorkstreamId: nullable(identifier),
  role: enumeration(["chair", "lead", "worker", "reviewer"]),
  provider: text,
  modelFamily: text,
  providerSessionRef: nullable(identifier),
  providerSessionGeneration: integer(),
  lifecycle: text,
  contextPressure: enumeration(["low", "medium", "high", "unknown"]),
  visibility: projectionFact(objectCodec({ paneRef: nullable(identifier) }))
});
var evidenceViewItemCodec = objectCodec({
  evidenceId: identifier,
  kind: enumeration(["artifact", "diff", "test", "review", "receipt"]),
  artifactRef: artifactRefCodec2,
  taskId: nullable(identifier),
  provenance: text,
  status: enumeration(["pass", "fail", "pending", "informational"])
});
var activityViewItemFields = {
  eventId: identifier,
  actorId: nullable(identifier),
  taskId: nullable(identifier),
  summary: text,
  occurredAt: timestamp,
  sourceRevision: integer()
};
var activityViewItemCodec = unionOf([
  objectCodec({ ...activityViewItemFields, kind: literal("message"), messageBodyRef: messageBodyRefCodec }),
  objectCodec({ ...activityViewItemFields, kind: enumeration(["decision", "lifecycle", "operation"]) })
]);
var systemViewItemCodec = objectCodec({
  componentId: identifier,
  kind: enumeration(["daemon", "adapter", "trust", "seat", "integration"]),
  state: enumeration(["healthy", "degraded", "stale", "unavailable", "conflict"]),
  generation: integer(),
  expiresAt: nullable(timestamp),
  detail: text
});
function projectionPageDataCodec(itemCodec) {
  return projectionFact(objectCodec({
    items: arrayOf(itemCodec, { maximum: 256 }),
    nextCursor: integer(),
    hasMore: boolean
  }));
}
var projectionPageResultCodec = unionOf([
  objectCodec({ view: literal("attention"), page: projectionPageDataCodec(attentionItemCodec) }),
  objectCodec({ view: literal("project"), page: projectionPageDataCodec(projectViewItemCodec) }),
  objectCodec({ view: literal("runs"), page: projectionPageDataCodec(runProjectionCodec) }),
  objectCodec({ view: literal("work"), page: projectionPageDataCodec(workViewItemCodec) }),
  objectCodec({ view: literal("agents"), page: projectionPageDataCodec(agentViewItemCodec) }),
  objectCodec({ view: literal("evidence"), page: projectionPageDataCodec(evidenceViewItemCodec) }),
  objectCodec({ view: literal("activity"), page: projectionPageDataCodec(activityViewItemCodec) }),
  objectCodec({ view: literal("system"), page: projectionPageDataCodec(systemViewItemCodec) })
]);
var projectionEventCodec = objectCodec({
  cursor: positiveInteger,
  projectSessionId: identifier,
  kind: text,
  revision: positiveInteger,
  occurredAt: timestamp,
  payload: jsonValue
});
var projectSessionDiscoveryCodec = objectCodec({
  projectSessionId: identifier,
  mode: enumeration(["coordinated", "independent"]),
  state: enumeration([
    "draft",
    "awaiting_launch",
    "launching",
    "active",
    "quiescing",
    "awaiting_acceptance",
    "closed",
    "launch_failed",
    "launch_ambiguous",
    "reconciling",
    "visibility_degraded",
    "recovery_required",
    "quarantined",
    "cancelled"
  ]),
  revision: positiveInteger,
  generation: positiveInteger,
  lastEventAt: timestamp
});
var discoveredSessionsCodec = projectionFact(objectCodec({
  items: arrayOf(projectSessionDiscoveryCodec, { maximum: 256 }),
  nextCursor: integer(),
  hasMore: boolean
}));
var legacyMessageCodec = objectCodec({
  audience: messageAudienceCodec,
  kind: enumeration(["request", "response", "event", "steer", "cancel", "escalate", "ack"]),
  body: boundedString({ maxBytes: 4096 }),
  requiresAck: boolean,
  dedupeKey: text
}, {
  conversationId: identifier,
  replyToMessageId: identifier,
  taskRevision: positiveInteger,
  hopCount: integer({ maximum: 16 }),
  expiresAt: timestamp,
  context: messageContextCodec
});
var teamCreateStructuredCodec = objectCodec({
  teamId: identifier,
  leader: teamLeaderCodec,
  rootTask: rootTaskInputCodec,
  initialMembers: arrayOf(teamMemberCodec, { maximum: 5 }),
  discussionGroups: arrayOf(discussionGroupCodec, { maximum: 64 }),
  reservedBudget: nonEmptyNumberRecord,
  commandId: identifier
}, { parentTeamId: identifier });
var teamCreateLegacyCodec = objectCodec({
  teamId: identifier,
  leaderAgentId: identifier,
  rootTaskId: identifier,
  commandId: identifier
}, {
  parentTeamId: identifier,
  ownedTaskIds: stringList,
  memberAgentIds: stringList,
  initialMemberAgentIds: stringList,
  authorityId: identifier,
  budget: numberRecord,
  reservedBudget: numberRecord,
  discussionGroups: arrayOf(discussionGroupCodec, { maximum: 64 })
});
var teamCreateCodec = unionOf([teamCreateStructuredCodec, teamCreateLegacyCodec]);
var agentListResultCodec = objectCodec({
  agents: arrayOf(objectCodec({
    agentId: identifier,
    parentAgentId: nullable(identifier),
    lifecycle: text,
    bridgeState: enumeration(["active", "none", "lost"]),
    bridgeGeneration: positiveInteger
  }), { maximum: 256 })
});
var deliveryItemCodec = objectCodec({
  deliveryId: identifier,
  messageId: identifier,
  sequence: positiveInteger,
  body: boundedString({ maxBytes: 4096 }),
  attempt: positiveInteger,
  senderId: identifier,
  kind: enumeration(["request", "response", "event", "steer", "cancel", "escalate", "ack"]),
  requiresAck: boolean
});
var observerEventCodec = objectCodec({
  cursor: positiveInteger,
  eventId: identifier,
  type: text,
  actorAgentId: nullable(identifier),
  createdAt: integer(),
  summary: text
});
var receiptCodec = objectCodec({ relativePath, schemaVersion: unionOf([literal(1), literal(2)]), sha256: sha256Hex });
var launchAttestationInputCodec = objectCodec({
  challengeResponse: boundedString({
    minBytes: 64,
    maxBytes: 64,
    pattern: "^[a-f0-9]{64}$",
    example: "ab".repeat(32)
  })
});
var launchAttestationResultCodec = objectCodec({
  attested: literal(true),
  challengeDigest: sha256
});
var timestampFields = /* @__PURE__ */ new Set([
  "abandonedAt",
  "claimDeadline",
  "committedAt",
  "consumedAt",
  "deadline",
  "expiresAt",
  "extendUntil",
  "lastEventAt",
  "occurredAt",
  "overdueAt",
  "providerAcceptedAt",
  "recordedAt",
  "requestedExpiresAt",
  "responseDeadline"
]);
var booleanFields = /* @__PURE__ */ new Set([
  "allowed",
  "available",
  "closed",
  "detached",
  "hasMore",
  "required",
  "requiresAck",
  "terminalNeutralised",
  "capabilityValuesRedacted",
  "acknowledged"
]);
var integerFields = /* @__PURE__ */ new Set([
  "after",
  "assignmentGeneration",
  "attachmentGeneration",
  "callbackGeneration",
  "chairGeneration",
  "claimGeneration",
  "committedRevision",
  "confirmedPreviewRevision",
  "contiguousWatermark",
  "cursor",
  "currentSnapshotRevision",
  "daemonInstanceGeneration",
  "dependencyRevision",
  "depth",
  "effectCount",
  "executionCount",
  "expectedAttachmentGeneration",
  "expectedChairGeneration",
  "expectedClaimGeneration",
  "expectedDaemonGeneration",
  "expectedGeneration",
  "expectedGlobalStateRevision",
  "expectedMembershipRevision",
  "expectedOwnerLeaseGeneration",
  "expectedPrincipalGeneration",
  "expectedRequestRevision",
  "expectedRevision",
  "expectedSessionGeneration",
  "expectedTaskRevision",
  "expectedTeamGeneration",
  "generation",
  "globalStateRevision",
  "hopCount",
  "integrationGeneration",
  "limit",
  "membershipRevision",
  "nextCursor",
  "ownerLeaseGeneration",
  "principalGeneration",
  "providerSessionGeneration",
  "replyRevision",
  "requestRevision",
  "revision",
  "runRevision",
  "schemaVersion",
  "sessionRevision",
  "snapshotCursor",
  "snapshotRevision",
  "sourceRevision",
  "targetRevision",
  "taskRevision",
  "ttlMs",
  "visibilityTimeoutMs"
]);
function enumField(operation, field, direction) {
  if (field === "schemaVersion" && operation === FABRIC_OPERATIONS.projectionSnapshot && direction === "result") {
    return literal(1);
  }
  if (field === "mode") return enumeration(["coordinated", "independent"]);
  if (field === "view") return enumeration(["attention", "project", "runs", "work", "agents", "evidence", "activity", "system"]);
  if (field === "enforcementPoint") return enumeration(["task-readiness", "operation", "scoped-barrier"]);
  if (field === "source" && operation === FABRIC_OPERATIONS.recordOperatorIntervention) return enumeration(["fabric", "integration"]);
  if (field === "directInputProvenance") return enumeration(["complete", "partial", "unavailable"]);
  if (field === "operation" && operation === FABRIC_OPERATIONS.dispatchProviderAction) {
    return enumeration(["send_turn", "wakeup", "release", "steer"]);
  }
  if (field === "operation" && operation === FABRIC_OPERATIONS.operatorCommand) {
    return enumeration(["read", "decide", "steer", "pause", "resume", "cancel", "drain", "stop", "launch", "takeover", "git", "external-effect"]);
  }
  if (field === "action" && operation === FABRIC_OPERATIONS.requestLifecycle) {
    return enumeration(["compact", "rotate", "completion-ready", "release"]);
  }
  if (field === "action" && operation === FABRIC_OPERATIONS.operatorCommand) {
    return enumeration(["decide", "steer", "pause", "resume", "cancel", "launch", "git", "external-effect"]);
  }
  if (field === "origin" && operation === FABRIC_OPERATIONS.intakeRevise && direction === "input") {
    return enumeration(["operator", "chair"]);
  }
  if (field === "status" && operation === FABRIC_OPERATIONS.recordObjectiveCheck) return enumeration(["pass", "fail"]);
  if (field === "status" && operation === FABRIC_OPERATIONS.abandonDelivery && direction === "result") return literal("abandoned");
  if (field === "status" && operation === FABRIC_OPERATIONS.releaseWriteLease && direction === "result") return literal("released");
  if (field === "status" && operation === FABRIC_OPERATIONS.scopedGateResolve && direction === "input") {
    return enumeration(["approved", "rejected", "deferred", "cancelled"]);
  }
  if (field === "status" && (operation === FABRIC_OPERATIONS.scopedGateCreate || operation === FABRIC_OPERATIONS.scopedGateResolve) && direction === "result") {
    return enumeration(["pending", "deferred", "approved", "rejected", "cancelled", "superseded"]);
  }
  if (field === "kind" && (operation === FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof || operation === FABRIC_OPERATIONS.recordRevocationProof)) {
    return enumeration(["predecessor-terminal", "os-isolated", "patch-only"]);
  }
  if (field === "kind" && operation === FABRIC_OPERATIONS.recordVisibilityFailure) {
    return enumeration(["herdr-telemetry", "observer-pane", "interactive-tui"]);
  }
  if (field === "state" && (operation === FABRIC_OPERATIONS.daemonDrain || operation === FABRIC_OPERATIONS.daemonStop) && direction === "result") {
    return enumeration(["running", "quiescing", "stopped", "busy"]);
  }
  if (field === "state" && operation === FABRIC_OPERATIONS.updateTask && direction === "input") {
    return enumeration(["complete", "cancelled", "degraded"]);
  }
  if (field === "state" && [
    FABRIC_OPERATIONS.resourceReserve,
    FABRIC_OPERATIONS.resourceRelease,
    FABRIC_OPERATIONS.resourceReconcile
  ].includes(operation)) return enumeration(["active", "released", "ambiguous", "reconciled"]);
  if (field === "scope" && operation === FABRIC_OPERATIONS.closeBarrier) return enumeration(["run", "stage"]);
  if (field === "visibility") return enumeration(["degraded", "lost"]);
  if (field === "providerSession") return enumeration(["healthy", "lost"]);
  if (field === "delivery") return enumeration(["active", "frozen"]);
  if (field === "recovery") return literal("reattach-or-rotate");
  return void 0;
}
function semanticFieldCodec(operation, field, direction) {
  const enumerated = enumField(operation, field, direction);
  if (enumerated !== void 0) return enumerated;
  if (field === "command") return operatorMutationCodec;
  if (field === "credential") return credentialCodec;
  if (field === "provenance") return provenanceCodec;
  if (field === "authority") return authorityCodec;
  if (field === "audience") return messageAudienceCodec;
  if (field === "context") return operation === FABRIC_OPERATIONS.integrationInputAttest ? integrationContextCodec : messageContextCodec;
  if (field === "checkpoint") return lifecycleCheckpointCodec;
  if (field === "evidence" && operation === FABRIC_OPERATIONS.recoverWriteLease) return recoveryEvidenceCodec;
  if (field === "payload" || field === "result") return jsonValue;
  if (field === "detail") return stringRecord;
  if (field === "leader") return direction === "input" ? teamLeaderCodec : objectCodec({ agentId: identifier, authorityId: identifier });
  if (field === "rootTask") return direction === "input" ? rootTaskInputCodec : taskResultCodec;
  if (field === "initialMembers") return arrayOf(teamMemberCodec, { maximum: 5 });
  if (field === "discussionGroups") return arrayOf(discussionGroupCodec, { maximum: 64 });
  if (field === "transition") return unionOf([
    objectCodec({ to: enumeration([
      "draft",
      "awaiting_launch",
      "launching",
      "active",
      "quiescing",
      "launch_failed",
      "launch_ambiguous",
      "reconciling",
      "visibility_degraded",
      "recovery_required",
      "quarantined"
    ]), reason: text }),
    objectCodec({ to: literal("awaiting_acceptance"), closureEvidence: artifactRefCodec2 })
  ]);
  if (field === "terminalPath") return terminalPathCodec;
  if (field === "members") return arrayOf(projectSessionMemberCodec, { maximum: 256 });
  if (field === "attestation") return attestationCodec;
  if (field === "providerEvent") return providerEventCodec;
  if (field === "gateBinding") return gateBindingCodec;
  if (field === "intake") return intakeCodec;
  if (field === "chairRequest" || field === "request") return taskRequestCodec;
  if (field === "intent") return gateIntentCodec;
  if (field === "decisionEvidence") return decisionEvidenceCodec;
  if (field === "scope") {
    if ([FABRIC_OPERATIONS.acquireWriteLease, FABRIC_OPERATIONS.getWriteLease].includes(operation) || direction === "result" && [
      FABRIC_OPERATIONS.acquireWriteLease,
      FABRIC_OPERATIONS.recoverWriteLease,
      FABRIC_OPERATIONS.renewWriteLease,
      FABRIC_OPERATIONS.getWriteLease
    ].includes(operation)) return arrayOf(relativePath, { minimum: 1, maximum: 128, unique: true });
    return gateScopeCodec;
  }
  if (field === "path") return arrayOf(resourceScopeCodec, { minimum: 2, maximum: 5 });
  if (field === "writerAdmission") return writerAdmissionCodec;
  if (field === "amounts" || field === "consumed" || field === "reservedBudget" || field === "budget") {
    return field === "amounts" || field === "consumed" ? nonEmptyNumberRecord : numberRecord;
  }
  if (field === "usage") return nullableNumberRecord;
  if (field === "observedUsage") return recordOf(unionOf([integer(), literal("unknown")]), {
    minimum: 1,
    maximum: 128,
    keyCodec: budgetUnitKey,
    exampleKey: "concurrent_turns"
  });
  if (field === "dimensions") return direction === "input" ? nonEmptyNumberRecord : recordOf(budgetDimensionCodec, { maximum: 128, keyCodec: budgetUnitKey });
  if (field === "returned") return numberRecord;
  if (field === "capacity") return operation === FABRIC_OPERATIONS.projectionSnapshot ? projectionFact(jsonRecord) : recordOf(resourceDimensionCodec, { maximum: 128, keyCodec: budgetUnitKey });
  if (field === "checkedGateRevisions") return recordOf(positiveInteger, { maximum: 128 });
  if (field === "task") return taskRequestTaskCodec;
  if (field === "reply") return replyCodec;
  if (field === "terminalResult") return terminalResultCodec;
  if (field === "resultDelivery") return resultDeliveryCodec;
  if (field === "project") return projectionFact(projectIdentityCodec);
  if (field === "session") return projectionFact(nullable(projectSessionCodec));
  if (field === "runs") return projectionFact(arrayOf(runProjectionCodec, { maximum: 256 }));
  if (field === "attention") return projectionFact(arrayOf(attentionItemCodec, { maximum: 256 }));
  if (field === "sessions") return discoveredSessionsCodec;
  if (field === "events") return operation === FABRIC_OPERATIONS.projectionEvents ? arrayOf(projectionEventCodec, { maximum: 256 }) : arrayOf(observerEventCodec, { maximum: 256 });
  if (field === "tasks") return arrayOf(taskResultCodec, { maximum: 256 });
  if (field === "agents") return arrayOf(objectCodec({
    agentId: identifier,
    parentAgentId: nullable(identifier),
    lifecycle: text
  }), { maximum: 256 });
  if (field === "receipts") return arrayOf(objectCodec({ relativePath, sha256: sha256Hex, exportedAt: integer() }), { maximum: 256 });
  if (field === "barrier") return objectCodec({ state: enumeration(["open", "closed"]) });
  if (field === "counts") return objectCodec({
    agents: integer(),
    tasks: integer(),
    tasksTerminal: integer(),
    messages: integer(),
    deliveriesUnacknowledged: integer(),
    leasesActive: integer()
  });
  if (field === "receipt") return receiptCodec;
  if (field === "deliveries" && operation === FABRIC_OPERATIONS.receiveMessages && direction === "result") {
    return arrayOf(deliveryItemCodec, { maximum: 256 });
  }
  if (field === "rotation") return objectCodec({
    kind: enumeration(["in-place", "replacement-session"]),
    priorResumeReference: identifier
  });
  if (field === "releaseBinding") return releaseBindingCodec;
  if (field === "resolution") return gateResolutionCodec;
  if (field === "artifactRefs" || field === "evidenceRefs") return artifactRefsCodec;
  if (["launchPacketRef", "handoffRef", "consequencePreviewRef", "drainReceiptRef"].includes(field)) return artifactRefCodec2;
  if (field === "relativePath") return relativePath;
  if (field === "sha256" && (operation === FABRIC_OPERATIONS.publishArtifact || operation === FABRIC_OPERATIONS.exportReceipt)) return sha256Hex;
  if (field === "checkpointSha256" && operation === FABRIC_OPERATIONS.reportProviderState) return sha256Hex;
  if (["sha256", "authorityRef", "before", "after", "checkpointSha256", "payloadDigest", "receiptDigest", "stateDigest"].includes(field)) {
    if (field === "after" && direction === "input") return integer();
    return sha256;
  }
  if (timestampFields.has(field)) return timestamp;
  if (booleanFields.has(field)) {
    if (["closed", "detached", "acknowledged", "terminalNeutralised", "capabilityValuesRedacted"].includes(field)) return literal(true);
    return boolean;
  }
  if (integerFields.has(field)) return field.toLowerCase().includes("generation") ? positiveInteger : integer();
  if (field.endsWith("Ids")) return stringList;
  if ([
    "dependencies",
    "eligibleAgentIds",
    "participantAgentIds",
    "ownedTaskIds",
    "memberAgentIds",
    "initialMemberAgentIds",
    "objectiveChecks",
    "humanGates",
    "blockingGateIds",
    "affectedTaskIds"
  ].includes(field)) return stringList;
  if (field === "expectedArtifacts") return arrayOf(relativePath, { maximum: 128, unique: true });
  if (field === "enforcementPoints") return arrayOf(enumeration(["task-readiness", "operation", "scoped-barrier"]), { minimum: 1, maximum: 3, unique: true });
  if (field === "blockedOperationIds") return arrayOf(identifier, { maximum: 128, unique: true });
  if (field === "options" || field === "consequences" || field === "history") return textList;
  if (field === "acknowledgedAboveWatermark") return integerList;
  if (field === "sourcePrefixes") return arrayOf(relativePath, { minimum: 1, maximum: 128, unique: true });
  if (field === "projectSessionId" && direction === "result" && operation === FABRIC_OPERATIONS.operatorAttach) {
    return nullable(identifier);
  }
  if (field.endsWith("Id") || field.endsWith("Ref") || field === "capability" || field === "actor") {
    return field === "capability" ? secret : identifier;
  }
  if ([
    "baseRevision",
    "body",
    "contextRevision",
    "default",
    "evidence",
    "handoffEvidence",
    "humanUtterance",
    "lifecycle",
    "objective",
    "question",
    "reason",
    "recommendation",
    "summary",
    "target",
    "title",
    "type"
  ].includes(field)) return field === "recommendation" ? optionalText : text;
  if (["status", "state", "kind", "origin", "action", "source", "directInputProvenance", "visibility", "providerSession", "delivery", "recovery"].includes(field)) {
    return text;
  }
  throw new Error(`semantic codec missing for ${direction} ${operation}.${field}`);
}
function semanticShapeCodec(operation, direction, shape) {
  if (shape.kind === "null") return literal(null);
  if (shape.kind === "array") return operation === FABRIC_OPERATIONS.receiveMessages ? arrayOf(deliveryItemCodec, { maximum: 256 }) : arrayOf(jsonValue, { maximum: 256 });
  const required = Object.fromEntries(shape.required.map((field) => [field, semanticFieldCodec(operation, field, direction)]));
  const optional = Object.fromEntries(shape.optional.map((field) => [field, semanticFieldCodec(operation, field, direction)]));
  return objectCodec(required, optional);
}
var messageBodyResultCodec = unionOf([
  objectCodec({
    available: literal(true),
    messageId: identifier,
    revision: positiveInteger,
    body: boundedString({ maxBytes: 4096 }),
    terminalNeutralised: literal(true),
    capabilityValuesRedacted: literal(true),
    artifactRefs: artifactRefsCodec
  }),
  objectCodec({
    available: literal(false),
    messageId: identifier,
    revision: positiveInteger,
    reason: enumeration(["not-found", "forbidden", "expired"])
  })
]);
var projectionEventsResultCodec = unionOf([
  objectCodec({
    status: literal("continuation"),
    events: arrayOf(projectionEventCodec, { maximum: 256 }),
    nextCursor: positiveInteger,
    hasMore: boolean,
    snapshotRevision: positiveInteger,
    readTransactionId: identifier
  }),
  objectCodec({
    status: literal("resnapshot-required"),
    reason: enumeration(["retention-gap", "project-cursor-mismatch", "cursor-overflow"]),
    currentSnapshotRevision: positiveInteger,
    snapshotCursor: positiveInteger
  })
]);
var operatorAttachmentCodec = objectCodec({
  clientId: identifier,
  projectId: identifier,
  projectAuthorityGeneration: positiveInteger,
  projectSessionId: nullable(identifier),
  generation: positiveInteger,
  expiresAt: timestamp
});
var resourceReservationResultCodec = objectCodec({
  reservationId: identifier,
  revision: positiveInteger,
  state: enumeration(["active", "released", "ambiguous", "reconciled"]),
  path: arrayOf(resourceScopeCodec, { minimum: 2, maximum: 5 }),
  amounts: nonEmptyNumberRecord,
  capacity: recordOf(resourceDimensionCodec, { maximum: 128, keyCodec: budgetUnitKey })
});
function parsedBy(codec, parser) {
  return parserBacked(codec, (value) => parser(value), codec.example);
}
var taskResultOperations = /* @__PURE__ */ new Set([
  FABRIC_OPERATIONS.createTask,
  FABRIC_OPERATIONS.claimTask,
  FABRIC_OPERATIONS.refreshTaskReadiness,
  FABRIC_OPERATIONS.getTask,
  FABRIC_OPERATIONS.updateTask,
  FABRIC_OPERATIONS.recoverTaskOwner
]);
var leaseResultOperations = /* @__PURE__ */ new Set([
  FABRIC_OPERATIONS.acquireWriteLease,
  FABRIC_OPERATIONS.recoverWriteLease,
  FABRIC_OPERATIONS.renewWriteLease,
  FABRIC_OPERATIONS.getWriteLease
]);
var lifecycleResultOperations = /* @__PURE__ */ new Set([
  FABRIC_OPERATIONS.requestLifecycle,
  FABRIC_OPERATIONS.getAgentLifecycle,
  FABRIC_OPERATIONS.reportProviderState
]);
var providerActionResultOperations = /* @__PURE__ */ new Set([
  FABRIC_OPERATIONS.dispatchProviderAction,
  FABRIC_OPERATIONS.reconcileProviderAction,
  FABRIC_OPERATIONS.getProviderAction
]);
var teamResultOperations = /* @__PURE__ */ new Set([
  FABRIC_OPERATIONS.getTeam,
  FABRIC_OPERATIONS.freezeSubtree,
  FABRIC_OPERATIONS.adoptSubtree
]);
var budgetResultOperations = /* @__PURE__ */ new Set([
  FABRIC_OPERATIONS.reserveBudget,
  FABRIC_OPERATIONS.recordBudgetUsage,
  FABRIC_OPERATIONS.reconcileBudgetUsage,
  FABRIC_OPERATIONS.releaseBudget,
  FABRIC_OPERATIONS.getBudget
]);
function inputCodecFor(operation) {
  if (operation === FABRIC_OPERATIONS.launchAttest) return launchAttestationInputCodec;
  if (operation === FABRIC_OPERATIONS.sendMessage) return legacyMessageCodec;
  if (operation === FABRIC_OPERATIONS.createTeam) return teamCreateCodec;
  if (operation === FABRIC_OPERATIONS.intakeDraftCreate) return intakeDraftCreateCodec;
  if (operation === FABRIC_OPERATIONS.scopedGateRead) return scopedGateReadInputCodec;
  if (operation === FABRIC_OPERATIONS.projectionViewPage) return operatorViewPageInputCodec;
  if (operation === FABRIC_OPERATIONS.projectionDetailRead) return operatorDetailReadInputCodec;
  if (operation === FABRIC_OPERATIONS.operatorRepositoryRead) return gitRepositoryReadInputCodec;
  if (operation === FABRIC_OPERATIONS.projectSessionTransition) return projectSessionTransitionInputCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionPreview) return operatorActionPreviewInputCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionCommit) return operatorActionCommitCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionStatus) return operatorActionStatusInputCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionReconcile) return operatorActionReconcileCodec;
  if (operation === FABRIC_OPERATIONS.scopedGateCheck) return parsedBy(scopedGateCheckCodec, parseScopedGateCheckRequest);
  if (operation === FABRIC_OPERATIONS.membershipBind) return parsedBy(membershipBindCodec, parseMembershipBindRequest);
  if (operation === FABRIC_OPERATIONS.intakeRevise) return parsedBy(intakeRevisionCodec, parseIntakeRevisionRequest);
  if (operation === FABRIC_OPERATIONS.scopedGateCreate) return parsedBy(gateCreateCodec, parseScopedGateCreateRequest);
  if (operation === FABRIC_OPERATIONS.taskRequest) return parsedBy(taskRequestCodec, parseTaskRequest);
  if (operation === FABRIC_OPERATIONS.taskCompleteWithReply) return parsedBy(taskCompletionCodec, parseTaskCompleteWithReply);
  const base = semanticShapeCodec(operation, "input", OPERATION_INPUT_SHAPES[operation]);
  if (operation === FABRIC_OPERATIONS.intakeRead) return parsedBy(base, parseIntakeReadRequest);
  if (operation === FABRIC_OPERATIONS.integrationInputAttest) return parsedBy(base, parseIntegrationInputAttestationRequest);
  if (operation === FABRIC_OPERATIONS.intakeSubmit) return parsedBy(base, parseIntakeSubmission);
  if (operation === FABRIC_OPERATIONS.scopedGateResolve) return parsedBy(base, parseScopedGateResolveRequest);
  if (operation === FABRIC_OPERATIONS.resourceReserve) return parsedBy(base, parseResourceReservationRequest);
  return base;
}
function resultCodecFor(operation) {
  if (operation === FABRIC_OPERATIONS.launchAttest) return launchAttestationResultCodec;
  if (operation === FABRIC_OPERATIONS.spawnAgent || operation === FABRIC_OPERATIONS.attachAgent) {
    return agentCustodyResultCodec;
  }
  if (taskResultOperations.has(operation)) return taskResultCodec;
  if (leaseResultOperations.has(operation)) return leaseResultCodec;
  if (lifecycleResultOperations.has(operation)) return lifecycleResultCodec;
  if (providerActionResultOperations.has(operation)) return providerActionResultCodec;
  if (operation === FABRIC_OPERATIONS.createTeam) return teamResultCodec;
  if (operation === FABRIC_OPERATIONS.listAgents) return agentListResultCodec;
  if (teamResultOperations.has(operation)) return visibleTeamResultCodec;
  if (budgetResultOperations.has(operation)) return budgetResultCodec;
  if ([
    FABRIC_OPERATIONS.projectSessionCreate,
    FABRIC_OPERATIONS.projectSessionGet,
    FABRIC_OPERATIONS.projectSessionTransition,
    FABRIC_OPERATIONS.projectSessionClose,
    FABRIC_OPERATIONS.projectSessionDrain,
    FABRIC_OPERATIONS.projectSessionStop
  ].includes(operation)) return projectSessionCodec;
  if (operation === FABRIC_OPERATIONS.operatorAttach || operation === FABRIC_OPERATIONS.operatorHeartbeat) {
    return operatorAttachmentCodec;
  }
  if (operation === FABRIC_OPERATIONS.integrationInputAttest) return parsedBy(attestationCodec, parseOperatorInputAttestation);
  if (operation === FABRIC_OPERATIONS.scopedGateRead) {
    const gateBase = semanticShapeCodec(
      FABRIC_OPERATIONS.scopedGateCreate,
      "result",
      OPERATION_RESULT_SHAPES[FABRIC_OPERATIONS.scopedGateCreate]
    );
    const gateExample = parseScopedGate({ ...gateBase.example, options: ["Approve"] });
    const gate2 = parserBacked(gateBase, parseScopedGate, gateExample);
    const result = unionOf([
      objectCodec({
        status: literal("current"),
        gate: gate2,
        readTransactionId: identifier,
        stateDigest: sha256
      }),
      objectCodec({
        status: literal("changed"),
        expectedRevision: positiveInteger,
        gate: gate2,
        readTransactionId: identifier,
        stateDigest: sha256
      })
    ]);
    return parserBacked(result, (value) => {
      if (Reflect.get(value, "status") !== "changed") return value;
      const gateValue = Reflect.get(value, "gate");
      if (Reflect.get(value, "expectedRevision") === gateValue.revision) {
        throw new TypeError("scopedGateRead changed revision must differ from the current gate revision");
      }
      return value;
    }, result.example);
  }
  if (operation === FABRIC_OPERATIONS.projectionViewPage) return operatorViewPageResultCodec;
  if (operation === FABRIC_OPERATIONS.projectionDetailRead) return operatorDetailReadResultCodec;
  if (operation === FABRIC_OPERATIONS.operatorRepositoryRead) return gitRepositoryReadResultCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionPreview) return operatorActionPreviewCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionCommit) return operatorActionReceiptCodec;
  if (operation === FABRIC_OPERATIONS.operatorActionStatus || operation === FABRIC_OPERATIONS.operatorActionReconcile) {
    return operatorActionStatusCodec;
  }
  if (operation === FABRIC_OPERATIONS.membershipBind) {
    const base = semanticShapeCodec(operation, "result", OPERATION_RESULT_SHAPES[operation]);
    return parsedBy(base, parseMembershipBindResult);
  }
  if (operation === FABRIC_OPERATIONS.intakeDraftCreate) {
    return parsedBy(intakeDraftCodec, parseIntake);
  }
  if (operation === FABRIC_OPERATIONS.intakeRead) return parsedBy(intakeCodec, parseIntake);
  if (operation === FABRIC_OPERATIONS.intakeSubmit || operation === FABRIC_OPERATIONS.intakeRevise) {
    return parsedBy(boundIntakeCodec, parseIntake);
  }
  if (operation === FABRIC_OPERATIONS.scopedGateCreate || operation === FABRIC_OPERATIONS.scopedGateResolve) {
    const base = semanticShapeCodec(operation, "result", OPERATION_RESULT_SHAPES[operation]);
    return parsedBy(base, parseScopedGate);
  }
  if ([
    FABRIC_OPERATIONS.resourceReserve,
    FABRIC_OPERATIONS.resourceRelease,
    FABRIC_OPERATIONS.resourceReconcile
  ].includes(operation)) return resourceReservationResultCodec;
  if ([
    FABRIC_OPERATIONS.resultDeliveryClaim,
    FABRIC_OPERATIONS.resultDeliveryProviderAccept,
    FABRIC_OPERATIONS.resultDeliveryConsume,
    FABRIC_OPERATIONS.resultDeliveryRetry,
    FABRIC_OPERATIONS.resultDeliveryReassign,
    FABRIC_OPERATIONS.resultDeliveryAbandon
  ].includes(operation)) return parsedBy(resultDeliveryCodec, parseResultDelivery);
  if (operation === FABRIC_OPERATIONS.taskCompleteWithReply) {
    return objectCodec({ taskRevision: positiveInteger, replyRevision: positiveInteger, resultDelivery: resultDeliveryCodec });
  }
  if (operation === FABRIC_OPERATIONS.projectionEvents) return projectionEventsResultCodec;
  if (operation === FABRIC_OPERATIONS.projectionPage) return projectionPageResultCodec;
  if (operation === FABRIC_OPERATIONS.messageBodyRead) return messageBodyResultCodec;
  return semanticShapeCodec(operation, "result", OPERATION_RESULT_SHAPES[operation]);
}
function buildOperationCodecs() {
  const codecs = {};
  for (const operation of Object.keys(OPERATION_REGISTRY)) {
    codecs[operation] = Object.freeze({ input: inputCodecFor(operation), result: resultCodecFor(operation) });
  }
  return Object.freeze(codecs);
}
var OPERATION_CODECS = buildOperationCodecs();
function parseOperationInput(operation, value) {
  if (isRetiredOperation(operation)) {
    const definition = OPERATION_REGISTRY[operation];
    throw new TypeError(
      `${operation} is retired${definition.retirementReason === void 0 ? "" : `: ${definition.retirementReason}`}${definition.replacementOperation === void 0 ? "" : `; use ${definition.replacementOperation}`}`
    );
  }
  return OPERATION_CODECS[operation].input.parse(value, `${operation}.input`);
}
function parseOperationInputForPrincipal(operation, principal, value) {
  if (!OPERATION_REGISTRY[operation].principals.includes(principal)) {
    throw new TypeError(`${principal} principal cannot invoke ${operation}`);
  }
  const parsed = parseOperationInput(operation, value);
  if ([
    FABRIC_OPERATIONS.membershipBind,
    FABRIC_OPERATIONS.intakeRevise,
    FABRIC_OPERATIONS.scopedGateCreate
  ].includes(operation)) {
    const expectedOrigin = principal === "agent" ? "chair" : "operator";
    if (typeof parsed !== "object" || parsed === null || Reflect.get(parsed, "origin") !== expectedOrigin) {
      throw new TypeError(`${principal} principal cannot submit an ${expectedOrigin === "chair" ? "operator" : "chair"} command`);
    }
  }
  return parsed;
}
function parseOperationResult(operation, value) {
  if (isRetiredOperation(operation)) {
    const definition = OPERATION_REGISTRY[operation];
    throw new TypeError(
      `${operation} is retired${definition.retirementReason === void 0 ? "" : `: ${definition.retirementReason}`}${definition.replacementOperation === void 0 ? "" : `; use ${definition.replacementOperation}`}`
    );
  }
  return OPERATION_CODECS[operation].result.parse(value, `${operation}.result`);
}

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/contract-fixtures.ts
var digestA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
var digestB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
var artifact = { path: "docs/spec.md", digest: digestA };
var timestamp2 = "2026-07-11T10:00:00Z";
var operatorCommand = {
  credential: { capabilityId: "capability_01", token: "test-capability-token" },
  commandId: "command_01",
  expectedRevision: 1,
  actor: "operator_01",
  provenance: { kind: "console-direct-input", clientId: "client_01", inputEventId: "input_01" },
  evidenceRefs: [artifact]
};
var launchPacketRef = { path: "launch/packet.json", digest: digestA };
var launchResourcePlanRef = { path: "launch/resources.json", digest: digestB };
var projectSessionLaunchIntent = parseProjectSessionLaunchIntent({
  kind: "project-session-launch",
  projectId: "project_01",
  projectSessionId: "ps_01",
  expectedProjectRevision: 3,
  expectedSessionRevision: 4,
  expectedSessionGeneration: 2,
  trustRecordDigest: digestA,
  launchPacketRef,
  authorityRef: digestA,
  budgetRef: "budget_01",
  resourcePlanRef: launchResourcePlanRef,
  providerAdapterId: "claude-agent-sdk",
  providerActionId: "provider_action_launch_01",
  providerContractDigest: digestB,
  resourceStateDigest: digestA
});
var launchPacketV1 = parseLaunchPacketV1({
  schemaVersion: 1,
  projectId: "project_01",
  projectSessionId: "ps_01",
  runId: "run_launch_01",
  chairAgentId: "agent_chair_01",
  projectRunDirectory: ".agent-run/AFAB-005",
  topologyMode: "coordinated",
  budgetRef: "budget_01",
  resourcePlanRef: launchResourcePlanRef,
  chairAuthority: {
    workspaceRoots: ["project"],
    sourcePaths: ["runtime/agent-fabric"],
    artifactPaths: [".agent-run/AFAB-005"],
    actions: [FABRIC_OPERATIONS.createTask],
    disclosure: { level: "forbidden" },
    expiresAt: "2026-07-12T12:00:00Z",
    budget: { concurrent_turns: 2 }
  },
  provider: {
    adapterId: "claude-agent-sdk",
    actionId: "provider_action_launch_01",
    contractDigest: digestB,
    inputSchemaId: "claude-launch-input.v1",
    input: { model: "claude-opus-4-1", promptRef: "launch/prompt.txt" }
  }
});
var launchResourcePlanV1 = parseLaunchResourcePlanV1({
  schemaVersion: 1,
  projectId: "project_01",
  projectSessionId: "ps_01",
  runId: "run_launch_01",
  budgetRef: "budget_01",
  scopes: {
    project: { scopeId: "scope_project_01", limits: { concurrent_turns: 4 } },
    projectSession: { scopeId: "scope_session_01", limits: { concurrent_turns: 3 } },
    coordinationRun: { scopeId: "scope_run_01", limits: { concurrent_turns: 2 } }
  },
  launchReservation: { amounts: { concurrent_turns: 1 } }
});
var projectSessionLaunchCurrentState = parseProjectSessionLaunchCurrentState({
  schemaVersion: 1,
  projectId: "project_01",
  projectRevision: 3,
  projectSessionId: "ps_01",
  sessionRevision: 4,
  sessionGeneration: 2,
  sessionState: "awaiting_launch",
  currentLaunchPacketRef: launchPacketRef,
  trustRecordDigest: digestA,
  providerAdapterId: "claude-agent-sdk",
  providerContractDigest: digestB,
  resourceStateDigest: digestA,
  provedFailedAttempt: null
});
var terminalSuccessOutcome = parseLaunchAdapterOutcomeV1({
  schemaVersion: 1,
  providerAdapterId: "claude-agent-sdk",
  providerActionId: "provider_action_launch_01",
  providerContractDigest: digestB,
  observationKind: "lookup",
  observedAt: timestamp2,
  outcome: {
    kind: "terminal-success",
    providerSessionRef: "provider_session_01",
    providerSessionGeneration: 1,
    effectDigest: digestA,
    resourceUsage: { concurrent_turns: 1 }
  }
});
var terminalNoEffectOutcome = parseLaunchAdapterOutcomeV1({
  ...terminalSuccessOutcome,
  observationKind: "dispatch-return",
  outcome: {
    kind: "terminal-no-effect",
    failureCode: "provider-rejected",
    noEffectProof: {
      schemaId: "provider-no-effect.v1",
      proof: { providerActionId: "provider_action_launch_01", effectCount: 0 },
      digest: digestA
    }
  }
});
var ambiguousOutcome = parseLaunchAdapterOutcomeV1({
  ...terminalSuccessOutcome,
  outcome: { kind: "ambiguous", reasonCode: "missing-resume-reference", evidenceDigest: null }
});
var providerActionRefV1 = parseProviderActionRefV1({
  schemaVersion: 1,
  projectSessionId: "ps_01",
  coordinationRunId: "run_launch_01",
  providerAdapterId: "claude-agent-sdk",
  providerActionId: "provider_action_launch_01",
  providerContractDigest: digestB,
  custodyAttemptGeneration: 1,
  journalRevision: 3,
  journalState: "terminal",
  outcomeKind: "terminal-success",
  outcomeDigest: digestA
});
var LAUNCH_CONTRACT_FIXTURES = Object.freeze({
  projectSessionLaunchIntent,
  launchPacketV1,
  launchResourcePlanV1,
  projectSessionLaunchCurrentState,
  terminalSuccessOutcome,
  terminalNoEffectOutcome,
  ambiguousOutcome,
  providerActionRefV1
});
var session = {
  projectSessionId: "ps_01",
  projectId: "project_01",
  mode: "coordinated",
  state: "active",
  revision: 2,
  generation: 1,
  authorityRef: digestA,
  budgetRef: "budget_01",
  launchPacketRef: artifact,
  membershipRevision: 1,
  origin: { kind: "operator-launch", operatorId: "operator_01" }
};
var resultDelivery = {
  resultDeliveryId: "delivery_01",
  revision: 1,
  projectSessionId: "ps_01",
  taskId: "task_01",
  requestMessageId: "request_01",
  requestRevision: 1,
  replyMessageId: "reply_01",
  replyRevision: 1,
  taskRevision: 2,
  callbackId: "callback_01",
  callbackGeneration: 1,
  assignmentGeneration: 1,
  targetAgentId: "agent_01",
  targetProviderSessionRef: "provider_session_01",
  payloadDigest: digestA,
  responseDeadline: timestamp2,
  dependentBarrierId: "barrier_01",
  required: true,
  state: "pending",
  claimGeneration: 0
};
var taskRequest = {
  commandId: "command_task_01",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  task: {
    taskId: "task_01",
    taskRevision: 1,
    objective: "Review protocol.",
    baseRevision: "revision_01",
    expectedArtifactPaths: ["reviews/protocol.md"]
  },
  request: {
    requestRevision: 1,
    messageId: "request_01",
    conversationId: "conversation_01",
    targetAgentId: "agent_01",
    targetProviderSessionRef: "provider_session_01",
    requiresAck: true,
    dedupeKey: "dedupe_01",
    responseDeadline: timestamp2,
    callbackId: "callback_01",
    callbackGeneration: 1,
    dependentBarrierId: "barrier_01"
  }
};
var taskCompletion = {
  commandId: "command_complete_01",
  taskId: "task_01",
  expectedTaskRevision: 1,
  ownerLeaseId: "lease_01",
  ownerLeaseGeneration: 1,
  requestMessageId: "request_01",
  expectedRequestRevision: 1,
  callbackId: "callback_01",
  callbackGeneration: 1,
  reply: {
    messageId: "reply_01",
    conversationId: "conversation_01",
    replyToMessageId: "request_01",
    body: "Complete.",
    artifactRefs: [artifact]
  },
  terminalResult: { status: "complete", summary: "Complete.", completedAt: timestamp2 }
};
var gate = {
  gateId: "gate_01",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  scope: { kind: "task", taskId: "task_01" },
  affectedTaskIds: ["task_01"],
  dependencyRevision: 1,
  blockedOperationIds: [FABRIC_OPERATIONS.taskCompleteWithReply],
  enforcementPoints: ["task-readiness", "operation"],
  question: "Proceed?",
  reason: "Decision required.",
  options: ["Approve", "Reject"],
  recommendation: "Approve",
  consequences: ["Implementation continues."],
  evidenceRefs: [artifact],
  revision: 1,
  createdByRef: "operator_01",
  expectedApproverRef: "operator_01",
  status: "pending"
};
var attestation = {
  attestationId: "attestation_01",
  integrationId: "integration_01",
  integrationGeneration: 1,
  operatorId: "operator_01",
  projectId: "project_01",
  projectSessionId: "ps_01",
  providerEvent: {
    providerId: "codex",
    providerSessionRef: "provider_session_01",
    providerMessageId: "provider_message_01",
    inputEventId: "provider_event_01",
    eventDigest: digestA,
    classification: "direct-human"
  },
  humanUtterance: "Approve.",
  gateBinding: {
    gateId: "gate_01",
    expectedGateRevision: 1,
    artifactDigests: [digestB],
    interpretedDecision: "approve"
  },
  recordedAt: timestamp2
};
function buildFixtures() {
  const fixtures = {};
  for (const operation of Object.keys(OPERATION_REGISTRY)) {
    fixtures[operation] = {
      input: parseJsonValue(OPERATION_CODECS[operation].input.example, `${operation}.input.fixture`),
      result: parseJsonValue(OPERATION_CODECS[operation].result.example, `${operation}.result.fixture`),
      wrongOperation: FABRIC_OPERATIONS.acknowledgeDelivery
    };
  }
  const set = (operation, input, result) => {
    fixtures[operation] = { input, result, wrongOperation: FABRIC_OPERATIONS.acknowledgeDelivery };
  };
  set(FABRIC_OPERATIONS.projectSessionCreate, {
    command: operatorCommand,
    projectSessionId: "ps_01",
    projectId: "project_01",
    mode: "coordinated",
    generation: 1,
    authorityRef: digestA,
    budgetRef: "budget_01",
    launchPacketRef: artifact
  }, session);
  set(FABRIC_OPERATIONS.projectSessionTransition, {
    command: operatorCommand,
    projectSessionId: "ps_01",
    expectedGeneration: 1,
    transition: { to: "active", reason: "launch complete" }
  }, session);
  set(FABRIC_OPERATIONS.projectSessionClose, {
    command: operatorCommand,
    projectSessionId: "ps_01",
    expectedGeneration: 1,
    terminalPath: { kind: "cancelled", reason: "fixture" }
  }, { ...session, state: "closed", terminalPath: { kind: "cancelled", reason: "fixture" } });
  set(FABRIC_OPERATIONS.intakeSubmit, {
    command: operatorCommand,
    intakeId: "intake_01",
    expectedRevision: 1,
    projectSessionId: "ps_01",
    coordinationRunId: "run_01",
    summary: "Discuss protocol.",
    artifactRefs: [artifact],
    gateIds: ["gate_01"],
    chairRequest: {
      ...taskRequest,
      request: {
        ...taskRequest.request,
        intakeBinding: {
          intakeId: "intake_01",
          intakeRevision: 2,
          gateIds: ["gate_01"],
          artifactDigests: [digestA]
        }
      }
    }
  }, {
    intakeId: "intake_01",
    projectId: "project_01",
    projectSessionId: "ps_01",
    coordinationRunId: "run_01",
    revision: 2,
    state: "awaiting-chair",
    dedupeKey: "intake_dedupe_01",
    summary: "Discuss protocol.",
    artifactRefs: [artifact],
    gateIds: ["gate_01"]
  });
  set(FABRIC_OPERATIONS.intakeRevise, {
    origin: "operator",
    command: operatorCommand,
    intakeId: "intake_01",
    projectSessionId: "ps_01",
    coordinationRunId: "run_01",
    expectedRevision: 1,
    state: "discussing",
    summary: "Discuss protocol.",
    artifactRefs: [artifact],
    gateIds: ["gate_01"]
  }, {
    intakeId: "intake_01",
    projectId: "project_01",
    projectSessionId: "ps_01",
    coordinationRunId: "run_01",
    revision: 2,
    state: "discussing",
    dedupeKey: "intake_dedupe_01",
    summary: "Discuss protocol.",
    artifactRefs: [artifact],
    gateIds: ["gate_01"]
  });
  set(FABRIC_OPERATIONS.scopedGateCreate, {
    origin: "operator",
    command: operatorCommand,
    intent: {
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      dedupeKey: "gate_intent_01",
      scope: { kind: "task", taskId: "task_01" },
      blockedOperationIds: [FABRIC_OPERATIONS.taskCompleteWithReply],
      enforcementPoints: ["task-readiness", "operation"],
      question: "Proceed?",
      reason: "Decision required.",
      options: ["Approve", "Reject"],
      recommendation: "Approve",
      consequences: ["Implementation continues."],
      evidenceRefs: [artifact]
    }
  }, gate);
  set(FABRIC_OPERATIONS.scopedGateResolve, {
    command: operatorCommand,
    gateId: "gate_01",
    status: "approved",
    decisionEvidence: { kind: "typed-console", confirmationCommandId: "command_confirm_01" }
  }, gate);
  for (const operation of [
    FABRIC_OPERATIONS.projectSessionCreate,
    FABRIC_OPERATIONS.projectSessionGet,
    FABRIC_OPERATIONS.projectSessionTransition,
    FABRIC_OPERATIONS.projectSessionClose,
    FABRIC_OPERATIONS.projectSessionDrain,
    FABRIC_OPERATIONS.projectSessionStop
  ]) {
    const existing = fixtures[operation];
    if (existing !== void 0) fixtures[operation] = { ...existing, result: session };
  }
  const closeFixture = fixtures[FABRIC_OPERATIONS.projectSessionClose];
  if (closeFixture !== void 0) {
    fixtures[FABRIC_OPERATIONS.projectSessionClose] = {
      ...closeFixture,
      result: { ...session, state: "closed", terminalPath: { kind: "cancelled", reason: "fixture" } }
    };
  }
  set(FABRIC_OPERATIONS.integrationInputAttest, {
    context: {
      commandId: "command_attest_01",
      integrationId: "integration_01",
      expectedIntegrationGeneration: 1,
      eventId: "provider_event_01",
      eventDigest: digestA
    },
    attestation
  }, attestation);
  set(FABRIC_OPERATIONS.taskRequest, taskRequest, {
    taskRevision: 1,
    requestRevision: 1,
    callbackId: "callback_01",
    callbackGeneration: 1
  });
  set(FABRIC_OPERATIONS.taskCompleteWithReply, taskCompletion, {
    taskRevision: 2,
    replyRevision: 1,
    resultDelivery
  });
  set(FABRIC_OPERATIONS.resourceReserve, {
    commandId: "command_reserve_01",
    reservationId: "reservation_01",
    projectSessionId: "ps_01",
    path: [
      { kind: "project", scopeId: "scope_project", projectId: "project_01" },
      { kind: "project-session", scopeId: "scope_session", projectId: "project_01", projectSessionId: "ps_01" }
    ],
    amounts: { concurrent_turns: 1 }
  }, {
    reservationId: "reservation_01",
    revision: 1,
    state: "active",
    path: [
      { kind: "project", scopeId: "scope_project", projectId: "project_01" },
      { kind: "project-session", scopeId: "scope_session", projectId: "project_01", projectSessionId: "ps_01" }
    ],
    amounts: { concurrent_turns: 1 },
    capacity: {
      concurrent_turns: { unknown: false, used: 0, reserved: 1, remaining: 1 }
    }
  });
  const resourceFixture = fixtures[FABRIC_OPERATIONS.resourceReserve];
  if (resourceFixture !== void 0) {
    for (const operation of [FABRIC_OPERATIONS.resourceRelease, FABRIC_OPERATIONS.resourceReconcile]) {
      const existing = fixtures[operation];
      if (existing !== void 0) fixtures[operation] = { ...existing, result: resourceFixture.result };
    }
  }
  set(FABRIC_OPERATIONS.scopedGateCheck, {
    projectSessionId: "ps_01",
    coordinationRunId: "run_01",
    dependencyRevision: 1,
    enforcementPoint: "task-readiness",
    taskId: "task_01"
  }, { allowed: true, checkedGateRevisions: {} });
  for (const operation of [FABRIC_OPERATIONS.scopedGateCreate, FABRIC_OPERATIONS.scopedGateResolve]) {
    const existing = fixtures[operation];
    if (existing !== void 0) fixtures[operation] = { ...existing, result: gate };
  }
  for (const operation of [
    FABRIC_OPERATIONS.resultDeliveryClaim,
    FABRIC_OPERATIONS.resultDeliveryProviderAccept,
    FABRIC_OPERATIONS.resultDeliveryConsume,
    FABRIC_OPERATIONS.resultDeliveryRetry,
    FABRIC_OPERATIONS.resultDeliveryReassign,
    FABRIC_OPERATIONS.resultDeliveryAbandon
  ]) {
    const existing = fixtures[operation];
    if (existing !== void 0) fixtures[operation] = { ...existing, result: resultDelivery };
  }
  return Object.freeze(fixtures);
}
var OPERATION_CONTRACT_FIXTURES = buildFixtures();
var EXTENSION_OPERATIONS = Object.freeze(
  Object.entries(OPERATION_REGISTRY).filter(([, definition]) => definition.kind === "extension").map(([operation]) => operation)
);

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/mcp-projection.ts
var MCP_PROJECTION_LIMITS = Object.freeze({
  maximumTools: 96,
  maximumDescriptorBytes: 32 * 1024,
  maximumDescriptorSetBytes: 512 * 1024
});
function stableToolName(operation) {
  return `fabric_${operation.slice("fabric.v1.".length).replace(/[.-]/gu, "_")}`;
}
function tool(operation, resource2) {
  const receiptRenderer = operation === FABRIC_OPERATIONS.launchAttest ? "launch-attestation-v1" : operation === FABRIC_OPERATIONS.sendMessage ? "message-send-v1" : operation === FABRIC_OPERATIONS.receiveMessages ? "message-receive-v1" : operation === FABRIC_OPERATIONS.acknowledgeDelivery ? "delivery-ack-v1" : operation === FABRIC_OPERATIONS.abandonDelivery ? "delivery-abandon-v1" : operation === FABRIC_OPERATIONS.spawnAgent || operation === FABRIC_OPERATIONS.attachAgent ? "agent-custody-v1" : operation === FABRIC_OPERATIONS.createTask || operation === FABRIC_OPERATIONS.updateTask ? "task-v1" : "generic-v1";
  return Object.freeze({
    projection: "tool",
    name: stableToolName(operation),
    description: `Invoke the closed ${operation} operation as the authenticated Agent Fabric principal.`,
    receiptRenderer,
    ...resource2 === void 0 ? {} : { resource: resource2 }
  });
}
function none(reason) {
  return Object.freeze({ projection: "none", reason });
}
var resource = (suffix, name, description) => Object.freeze({
  uriTemplate: `fabric://runs/{run_id}/${suffix}`,
  name,
  description,
  mimeType: "application/json"
});
var MCP_PROJECTION_REGISTRY = Object.freeze({
  [FABRIC_OPERATIONS.delegateAuthority]: tool(FABRIC_OPERATIONS.delegateAuthority),
  [FABRIC_OPERATIONS.registerAgent]: none("result contains a bearer capability"),
  [FABRIC_OPERATIONS.spawnAgent]: tool(FABRIC_OPERATIONS.spawnAgent),
  [FABRIC_OPERATIONS.attachAgent]: tool(FABRIC_OPERATIONS.attachAgent),
  [FABRIC_OPERATIONS.sendMessage]: tool(FABRIC_OPERATIONS.sendMessage),
  [FABRIC_OPERATIONS.createDiscussionGroup]: tool(FABRIC_OPERATIONS.createDiscussionGroup),
  [FABRIC_OPERATIONS.receiveMessages]: tool(FABRIC_OPERATIONS.receiveMessages),
  [FABRIC_OPERATIONS.acknowledgeDelivery]: tool(FABRIC_OPERATIONS.acknowledgeDelivery),
  [FABRIC_OPERATIONS.abandonDelivery]: tool(FABRIC_OPERATIONS.abandonDelivery),
  [FABRIC_OPERATIONS.getMailboxState]: tool(FABRIC_OPERATIONS.getMailboxState),
  [FABRIC_OPERATIONS.createTask]: tool(FABRIC_OPERATIONS.createTask),
  [FABRIC_OPERATIONS.claimTask]: tool(FABRIC_OPERATIONS.claimTask),
  [FABRIC_OPERATIONS.refreshTaskReadiness]: tool(FABRIC_OPERATIONS.refreshTaskReadiness),
  [FABRIC_OPERATIONS.recordObjectiveCheck]: tool(FABRIC_OPERATIONS.recordObjectiveCheck),
  [FABRIC_OPERATIONS.acknowledgeTaskHandoff]: tool(FABRIC_OPERATIONS.acknowledgeTaskHandoff),
  [FABRIC_OPERATIONS.getTask]: tool(FABRIC_OPERATIONS.getTask),
  [FABRIC_OPERATIONS.updateTask]: tool(FABRIC_OPERATIONS.updateTask),
  [FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof]: tool(FABRIC_OPERATIONS.recordTaskOwnerRecoveryProof),
  [FABRIC_OPERATIONS.recoverTaskOwner]: tool(FABRIC_OPERATIONS.recoverTaskOwner),
  [FABRIC_OPERATIONS.recordRevocationProof]: tool(FABRIC_OPERATIONS.recordRevocationProof),
  [FABRIC_OPERATIONS.revokeCapability]: none("result is not a structured MCP object"),
  [FABRIC_OPERATIONS.rotateCapability]: none("result contains a bearer capability"),
  [FABRIC_OPERATIONS.acquireWriteLease]: tool(FABRIC_OPERATIONS.acquireWriteLease),
  [FABRIC_OPERATIONS.recoverWriteLease]: tool(FABRIC_OPERATIONS.recoverWriteLease),
  [FABRIC_OPERATIONS.renewWriteLease]: tool(FABRIC_OPERATIONS.renewWriteLease),
  [FABRIC_OPERATIONS.getWriteLease]: tool(FABRIC_OPERATIONS.getWriteLease),
  [FABRIC_OPERATIONS.releaseWriteLease]: tool(FABRIC_OPERATIONS.releaseWriteLease),
  [FABRIC_OPERATIONS.requestLifecycle]: tool(FABRIC_OPERATIONS.requestLifecycle),
  [FABRIC_OPERATIONS.getAgentLifecycle]: tool(FABRIC_OPERATIONS.getAgentLifecycle),
  [FABRIC_OPERATIONS.reportProviderState]: tool(FABRIC_OPERATIONS.reportProviderState),
  [FABRIC_OPERATIONS.dispatchProviderAction]: tool(FABRIC_OPERATIONS.dispatchProviderAction),
  [FABRIC_OPERATIONS.reconcileProviderAction]: tool(FABRIC_OPERATIONS.reconcileProviderAction),
  [FABRIC_OPERATIONS.getProviderAction]: tool(FABRIC_OPERATIONS.getProviderAction),
  [FABRIC_OPERATIONS.recordOperatorIntervention]: tool(FABRIC_OPERATIONS.recordOperatorIntervention),
  [FABRIC_OPERATIONS.recordVisibilityFailure]: tool(FABRIC_OPERATIONS.recordVisibilityFailure),
  [FABRIC_OPERATIONS.createTeam]: tool(FABRIC_OPERATIONS.createTeam),
  [FABRIC_OPERATIONS.getTeam]: tool(FABRIC_OPERATIONS.getTeam),
  [FABRIC_OPERATIONS.freezeSubtree]: tool(FABRIC_OPERATIONS.freezeSubtree),
  [FABRIC_OPERATIONS.adoptSubtree]: tool(FABRIC_OPERATIONS.adoptSubtree),
  [FABRIC_OPERATIONS.closeSubtreeBarrier]: tool(FABRIC_OPERATIONS.closeSubtreeBarrier),
  [FABRIC_OPERATIONS.reserveBudget]: tool(FABRIC_OPERATIONS.reserveBudget),
  [FABRIC_OPERATIONS.recordBudgetUsage]: tool(FABRIC_OPERATIONS.recordBudgetUsage),
  [FABRIC_OPERATIONS.reconcileBudgetUsage]: tool(FABRIC_OPERATIONS.reconcileBudgetUsage),
  [FABRIC_OPERATIONS.releaseBudget]: tool(FABRIC_OPERATIONS.releaseBudget),
  [FABRIC_OPERATIONS.getBudget]: tool(FABRIC_OPERATIONS.getBudget),
  [FABRIC_OPERATIONS.publishArtifact]: tool(FABRIC_OPERATIONS.publishArtifact),
  [FABRIC_OPERATIONS.closeBarrier]: tool(FABRIC_OPERATIONS.closeBarrier),
  [FABRIC_OPERATIONS.getRunStatus]: tool(
    FABRIC_OPERATIONS.getRunStatus,
    resource("status", "Run status", "Chair, lifecycle counts and barrier state for one run.")
  ),
  [FABRIC_OPERATIONS.observeEvents]: tool(FABRIC_OPERATIONS.observeEvents),
  [FABRIC_OPERATIONS.listTasks]: tool(
    FABRIC_OPERATIONS.listTasks,
    resource("tasks", "Run tasks", "Task graph records for one run.")
  ),
  [FABRIC_OPERATIONS.listAgents]: tool(
    FABRIC_OPERATIONS.listAgents,
    resource("agents", "Run agents", "Registered agents and lifecycle states for one run.")
  ),
  [FABRIC_OPERATIONS.listReceipts]: tool(
    FABRIC_OPERATIONS.listReceipts,
    resource("receipts", "Run receipts", "Exported coordination receipts for one run.")
  ),
  [FABRIC_OPERATIONS.exportReceipt]: tool(FABRIC_OPERATIONS.exportReceipt),
  [FABRIC_OPERATIONS.membershipBind]: tool(FABRIC_OPERATIONS.membershipBind),
  [FABRIC_OPERATIONS.intakeRevise]: tool(FABRIC_OPERATIONS.intakeRevise),
  [FABRIC_OPERATIONS.scopedGateCreate]: tool(FABRIC_OPERATIONS.scopedGateCreate),
  [FABRIC_OPERATIONS.scopedGateCheck]: tool(FABRIC_OPERATIONS.scopedGateCheck),
  [FABRIC_OPERATIONS.resourceReserve]: tool(FABRIC_OPERATIONS.resourceReserve),
  [FABRIC_OPERATIONS.resourceRelease]: tool(FABRIC_OPERATIONS.resourceRelease),
  [FABRIC_OPERATIONS.resourceReconcile]: tool(FABRIC_OPERATIONS.resourceReconcile),
  [FABRIC_OPERATIONS.taskRequest]: tool(FABRIC_OPERATIONS.taskRequest),
  [FABRIC_OPERATIONS.taskCompleteWithReply]: tool(FABRIC_OPERATIONS.taskCompleteWithReply),
  [FABRIC_OPERATIONS.resultDeliveryClaim]: tool(FABRIC_OPERATIONS.resultDeliveryClaim),
  [FABRIC_OPERATIONS.resultDeliveryConsume]: tool(FABRIC_OPERATIONS.resultDeliveryConsume),
  [FABRIC_OPERATIONS.resultDeliveryRetry]: tool(FABRIC_OPERATIONS.resultDeliveryRetry),
  [FABRIC_OPERATIONS.resultDeliveryReassign]: tool(FABRIC_OPERATIONS.resultDeliveryReassign),
  [FABRIC_OPERATIONS.resultDeliveryAbandon]: tool(FABRIC_OPERATIONS.resultDeliveryAbandon),
  [FABRIC_OPERATIONS.launchAttest]: tool(FABRIC_OPERATIONS.launchAttest)
});

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/ndjson.ts
var NdjsonProtocolError = class extends Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "NdjsonProtocolError";
    this.code = code;
  }
};
function positiveInteger2(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
  return value;
}
var BoundedNdjsonReader = class {
  #input;
  #maximumFrameBytes;
  #idleTimeoutMs;
  #onFrame;
  #onError;
  #onIdle;
  #parts = [];
  closed;
  #resolveClosed = () => void 0;
  #frameBytes = 0;
  #timer;
  #finished = false;
  constructor(input, options) {
    this.#input = input;
    this.#maximumFrameBytes = positiveInteger2(options.maximumFrameBytes, "maximumFrameBytes");
    this.#idleTimeoutMs = options.idleTimeoutMs === void 0 ? void 0 : positiveInteger2(options.idleTimeoutMs, "idleTimeoutMs");
    this.#onFrame = options.onFrame;
    this.#onError = options.onError ?? (() => void 0);
    this.#onIdle = options.onIdle ?? (() => void 0);
    this.closed = new Promise((resolve2) => {
      this.#resolveClosed = resolve2;
    });
    input.on("data", this.#data);
    input.once("end", this.#end);
    input.once("close", this.#close);
    input.once("error", this.#streamError);
    this.#resetIdleTimer();
  }
  close() {
    this.#finish();
  }
  tightenLimits(options) {
    const maximumFrameBytes = positiveInteger2(options.maximumFrameBytes, "maximumFrameBytes");
    const idleTimeoutMs = positiveInteger2(options.idleTimeoutMs, "idleTimeoutMs");
    if (maximumFrameBytes > this.#maximumFrameBytes || this.#idleTimeoutMs !== void 0 && idleTimeoutMs > this.#idleTimeoutMs) {
      throw new TypeError("negotiated reader limits may only narrow bootstrap limits");
    }
    this.#maximumFrameBytes = maximumFrameBytes;
    this.#idleTimeoutMs = idleTimeoutMs;
    if (this.#frameBytes > maximumFrameBytes) {
      this.#fail(new NdjsonProtocolError(
        "NDJSON_FRAME_TOO_LARGE",
        `buffered NDJSON frame exceeds negotiated ${String(maximumFrameBytes)} bytes`
      ));
      return;
    }
    this.#resetIdleTimer();
  }
  #data = (chunk) => {
    if (this.#finished) return;
    this.#resetIdleTimer();
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    let start = 0;
    while (start < bytes.length && !this.#finished) {
      const newline = bytes.indexOf(10, start);
      const end = newline === -1 ? bytes.length : newline;
      const segment = bytes.subarray(start, end);
      if (this.#frameBytes + segment.length > this.#maximumFrameBytes) {
        this.#fail(new NdjsonProtocolError(
          "NDJSON_FRAME_TOO_LARGE",
          `NDJSON frame exceeds ${String(this.#maximumFrameBytes)} bytes`
        ));
        return;
      }
      if (segment.length > 0) {
        this.#parts.push(segment);
        this.#frameBytes += segment.length;
      }
      if (newline === -1) return;
      this.#emitFrame();
      start = newline + 1;
    }
  };
  #end = () => {
    if (this.#frameBytes > 0) {
      this.#fail(new NdjsonProtocolError("NDJSON_INCOMPLETE_FRAME", "NDJSON stream ended mid-frame"));
      return;
    }
    this.#finish();
  };
  #close = () => {
    if (this.#frameBytes > 0) {
      this.#fail(new NdjsonProtocolError("NDJSON_INCOMPLETE_FRAME", "NDJSON stream closed mid-frame"));
      return;
    }
    this.#finish();
  };
  #streamError = (cause) => {
    this.#fail(new NdjsonProtocolError("NDJSON_STREAM_ERROR", `NDJSON stream failed: ${cause.message}`, { cause }));
  };
  #emitFrame() {
    let bytes = this.#parts.length === 0 ? Buffer.alloc(0) : Buffer.concat(this.#parts, this.#frameBytes);
    this.#parts.length = 0;
    this.#frameBytes = 0;
    if (bytes.at(-1) === 13) bytes = bytes.subarray(0, -1);
    try {
      this.#onFrame(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (cause) {
      this.#fail(new NdjsonProtocolError("NDJSON_INVALID_UTF8", "NDJSON frame is not valid UTF-8", { cause }));
    }
  }
  #resetIdleTimer() {
    if (this.#idleTimeoutMs === void 0) return;
    if (this.#timer !== void 0) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#onIdle();
      this.#finish();
    }, this.#idleTimeoutMs);
    this.#timer.unref();
  }
  #fail(error) {
    if (this.#finished) return;
    this.#onError(error);
    this.#finish();
  }
  #finish() {
    if (this.#finished) return;
    this.#finished = true;
    if (this.#timer !== void 0) clearTimeout(this.#timer);
    this.#input.off("data", this.#data);
    this.#input.off("end", this.#end);
    this.#input.off("close", this.#close);
    this.#input.off("error", this.#streamError);
    this.#resolveClosed();
  }
};
var BoundedNdjsonWriter = class {
  #output;
  #maximumFrameBytes;
  #maximumPendingWrites;
  #tail = Promise.resolve();
  #pendingWrites = 0;
  constructor(output, options) {
    this.#output = output;
    this.#maximumFrameBytes = positiveInteger2(options.maximumFrameBytes, "maximumFrameBytes");
    this.#maximumPendingWrites = positiveInteger2(options.maximumPendingWrites, "maximumPendingWrites");
  }
  write(value) {
    if (this.#pendingWrites >= this.#maximumPendingWrites) {
      return Promise.reject(new NdjsonProtocolError("NDJSON_WRITE_OVERLOADED", "NDJSON writer pending limit reached"));
    }
    this.#pendingWrites += 1;
    const operation = this.#tail.then(() => this.#writeNow(value), () => this.#writeNow(value)).finally(() => {
      this.#pendingWrites -= 1;
    });
    this.#tail = operation.catch(() => void 0);
    return operation;
  }
  async #writeNow(value) {
    let frame;
    try {
      const encoded = JSON.stringify(value);
      if (encoded === void 0) throw new TypeError("value has no JSON representation");
      frame = Buffer.from(`${encoded}
`);
    } catch (cause) {
      throw new NdjsonProtocolError("NDJSON_WRITE_FAILED", "NDJSON value is not serializable", { cause });
    }
    if (frame.length - 1 > this.#maximumFrameBytes) {
      throw new NdjsonProtocolError("NDJSON_FRAME_TOO_LARGE", `NDJSON frame exceeds ${String(this.#maximumFrameBytes)} bytes`);
    }
    await new Promise((resolveWrite, rejectWrite) => {
      this.#output.write(frame, (cause) => {
        if (cause === null || cause === void 0) resolveWrite();
        else rejectWrite(new NdjsonProtocolError("NDJSON_WRITE_FAILED", `NDJSON write failed: ${cause.message}`, { cause }));
      });
    });
  }
};
var protocolErrorCodes = new Set(PROTOCOL_ERROR_CODES);

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric-protocol/src/schema.ts
var idSchema = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$" };
var timestampSchema = { type: "string", format: "date-time" };
var digestSchema = { type: "string", pattern: "^sha256:[a-f0-9]{64}$" };
var operations = Object.keys(OPERATION_REGISTRY);
var activeOperations = operations.filter((operation) => OPERATION_REGISTRY[operation].kind !== "retired");
var boundedJsonDefinitions = {
  boundedJsonValue: BOUNDED_JSON_VALUE_SCHEMA,
  jsonValueNode: JSON_VALUE_NODE_SCHEMA
};
function standaloneLaunchSchema(schema2) {
  return { ...schema2, "$defs": boundedJsonDefinitions };
}
var LAUNCH_CONTRACT_SCHEMAS = Object.freeze({
  projectSessionLaunchIntent: standaloneLaunchSchema(PROJECT_SESSION_LAUNCH_INTENT_CODEC.schema),
  launchPacketV1: standaloneLaunchSchema(LAUNCH_PACKET_V1_CODEC.schema),
  launchResourcePlanV1: standaloneLaunchSchema(LAUNCH_RESOURCE_PLAN_V1_CODEC.schema),
  projectSessionLaunchCurrentState: standaloneLaunchSchema(PROJECT_SESSION_LAUNCH_CURRENT_STATE_CODEC.schema),
  launchAdapterOutcomeV1: standaloneLaunchSchema(LAUNCH_ADAPTER_OUTCOME_V1_CODEC.schema),
  providerActionRefV1: standaloneLaunchSchema(PROVIDER_ACTION_REF_V1_CODEC.schema)
});
var principalSchemas = {
  operator: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "operatorId", "projectId", "projectAuthorityGeneration", "principalGeneration"],
    properties: {
      kind: { const: "operator" },
      operatorId: idSchema,
      projectId: idSchema,
      projectAuthorityGeneration: { type: "integer", minimum: 1 },
      principalGeneration: { type: "integer", minimum: 1 }
    }
  },
  agent: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "agentId", "projectSessionId", "runId", "principalGeneration"],
    properties: {
      kind: { const: "agent" },
      agentId: idSchema,
      projectSessionId: idSchema,
      runId: idSchema,
      principalGeneration: { type: "integer", minimum: 1 }
    }
  },
  integration: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "integrationId", "projectId", "principalGeneration"],
    properties: {
      kind: { const: "integration" },
      integrationId: idSchema,
      projectId: idSchema,
      principalGeneration: { type: "integer", minimum: 1 }
    }
  }
};
var protocolFailureSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "message", "retryable"],
  properties: {
    code: { type: "string", enum: PROTOCOL_ERROR_CODES },
    message: protocolFailureMessage.schema,
    retryable: { type: "boolean" },
    details: { "$ref": "#/$defs/boundedJsonValue" }
  }
};
var limitsSchema = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(PROTOCOL_LIMITS),
  properties: {
    maximumFrameBytes: { type: "integer", minimum: 1, maximum: PROTOCOL_LIMITS.maximumFrameBytes },
    maximumPendingCalls: { type: "integer", minimum: 1, maximum: PROTOCOL_LIMITS.maximumPendingCalls },
    maximumInFlightPerConnection: { type: "integer", minimum: 1, maximum: PROTOCOL_LIMITS.maximumInFlightPerConnection },
    idleTimeoutMs: { type: "integer", minimum: 1, maximum: PROTOCOL_LIMITS.idleTimeoutMs },
    requestTimeoutMs: { type: "integer", minimum: 1, maximum: PROTOCOL_LIMITS.requestTimeoutMs }
  }
};
var initializeInputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "protocolVersion",
    "client",
    "authentication",
    "expectedPrincipalKind",
    "requiredFeatures",
    "optionalFeatures"
  ],
  properties: {
    protocolVersion: { const: 1 },
    client: {
      type: "object",
      additionalProperties: false,
      required: ["name", "version"],
      properties: {
        name: protocolClientField.schema,
        version: protocolClientField.schema
      }
    },
    authentication: {
      type: "object",
      additionalProperties: false,
      required: ["scheme", "credential", "clientNonce"],
      properties: {
        scheme: { const: "capability" },
        credential: secret.schema,
        clientNonce: idSchema
      }
    },
    expectedPrincipalKind: { enum: ["operator", "agent", "integration"] },
    requiredFeatures: { type: "array", maxItems: PROTOCOL_FEATURES.length, uniqueItems: true, items: { enum: PROTOCOL_FEATURES } },
    optionalFeatures: { type: "array", maxItems: PROTOCOL_FEATURES.length, uniqueItems: true, items: { enum: PROTOCOL_FEATURES } }
  }
};
var initializeResultSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "protocolVersion",
    "daemonVersion",
    "daemonInstanceGeneration",
    "principal",
    "clientNonce",
    "connectionNonce",
    "features",
    "allowedOperations",
    "limits"
  ],
  properties: {
    protocolVersion: { const: 1 },
    daemonVersion: protocolClientField.schema,
    daemonInstanceGeneration: { type: "integer", minimum: 1 },
    principal: { oneOf: Object.values(principalSchemas) },
    clientNonce: idSchema,
    connectionNonce: idSchema,
    features: { type: "array", maxItems: PROTOCOL_FEATURES.length, uniqueItems: true, items: { enum: PROTOCOL_FEATURES } },
    allowedOperations: { type: "array", maxItems: activeOperations.length, uniqueItems: true, items: { enum: activeOperations } },
    limits: limitsSchema
  }
};
function requestVariant(operation) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "operation", "input"],
    properties: {
      id: idSchema,
      operation: { const: operation },
      input: OPERATION_CODECS[operation].input.schema
    }
  };
}
function successVariant(operation) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "operation", "ok", "result"],
    properties: {
      id: idSchema,
      operation: { const: operation },
      ok: { const: true },
      result: OPERATION_CODECS[operation].result.schema
    }
  };
}
function failureVariant(operation) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "operation", "ok", "error"],
    properties: {
      id: idSchema,
      operation: { const: operation },
      ok: { const: false },
      error: protocolFailureSchema
    }
  };
}
var initializeRequestEnvelope = {
  type: "object",
  additionalProperties: false,
  required: ["id", "operation", "input"],
  properties: { id: idSchema, operation: { const: "initialize" }, input: initializeInputSchema }
};
var initializeSuccessEnvelope = {
  type: "object",
  additionalProperties: false,
  required: ["id", "operation", "ok", "result"],
  properties: { id: idSchema, operation: { const: "initialize" }, ok: { const: true }, result: initializeResultSchema }
};
var capabilityBaseProperties = {
  capabilityId: idSchema,
  operatorId: idSchema,
  projectId: idSchema,
  projectAuthorityGeneration: { type: "integer", minimum: 1 },
  principalGeneration: { type: "integer", minimum: 1 },
  issuedAt: timestampSchema,
  expiresAt: timestampSchema,
  status: { const: "active" }
};
function capabilityVariant(kind, actions) {
  const sessionFields2 = kind === "project-launch" ? {} : {
    projectSessionId: idSchema,
    sessionGeneration: { type: "integer", minimum: 1 }
  };
  const takeoverFields = kind === "takeover" ? {
    takeoverBinding: {
      type: "object",
      additionalProperties: false,
      required: ["handoffDigest", "oldChairGeneration", "expectedRunId", "expectedRunRevision", "expectedSessionRevision", "targetRevision"],
      properties: {
        handoffDigest: digestSchema,
        oldChairGeneration: { type: "integer", minimum: 1 },
        expectedRunId: idSchema,
        expectedRunRevision: { type: "integer", minimum: 0 },
        expectedSessionRevision: { type: "integer", minimum: 0 },
        targetRevision: { type: "integer", minimum: 1 }
      }
    }
  } : {};
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "capabilityId",
      "operatorId",
      "projectId",
      "projectAuthorityGeneration",
      "principalGeneration",
      "issuedAt",
      "expiresAt",
      "status",
      "kind",
      "actions",
      ...kind === "project-launch" ? [] : ["projectSessionId", "sessionGeneration"],
      ...kind === "takeover" ? ["takeoverBinding"] : []
    ],
    properties: {
      ...capabilityBaseProperties,
      kind: { const: kind },
      actions: {
        type: "array",
        minItems: 1,
        maxItems: actions.length,
        uniqueItems: true,
        items: { enum: actions },
        ...kind === "takeover" ? { contains: { const: "takeover" } } : {}
      },
      ...sessionFields2,
      ...takeoverFields
    }
  };
}
var PROTOCOL_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://local.invalid/agent-fabric-protocol/v1/protocol.schema.json",
  title: "Agent Fabric public protocol v1",
  oneOf: [
    { "$ref": "#/$defs/initializeRequest" },
    { "$ref": "#/$defs/initializeSuccess" },
    { "$ref": "#/$defs/initializeFailure" },
    { "$ref": "#/$defs/rpcRequest" },
    { "$ref": "#/$defs/rpcResponse" }
  ],
  "$defs": {
    ...boundedJsonDefinitions,
    projectSessionLaunchIntent: PROJECT_SESSION_LAUNCH_INTENT_CODEC.schema,
    launchPacketV1: LAUNCH_PACKET_V1_CODEC.schema,
    launchResourcePlanV1: LAUNCH_RESOURCE_PLAN_V1_CODEC.schema,
    projectSessionLaunchCurrentState: PROJECT_SESSION_LAUNCH_CURRENT_STATE_CODEC.schema,
    launchAdapterOutcomeV1: LAUNCH_ADAPTER_OUTCOME_V1_CODEC.schema,
    providerActionRefV1: PROVIDER_ACTION_REF_V1_CODEC.schema,
    fabricOperation: { type: "string", enum: operations },
    activeFabricOperation: { type: "string", enum: activeOperations },
    operatorPrincipal: principalSchemas.operator,
    agentPrincipal: principalSchemas.agent,
    integrationPrincipal: principalSchemas.integration,
    principal: { oneOf: Object.values(principalSchemas) },
    operatorCapability: {
      oneOf: [
        capabilityVariant("project-launch", ["read", "launch"]),
        capabilityVariant("session", ["read", "decide", "steer", "pause", "resume", "cancel", "drain", "stop", "launch", "git", "external-effect"]),
        capabilityVariant("takeover", ["read", "decide", "steer", "pause", "resume", "cancel", "drain", "stop", "launch", "takeover", "git", "external-effect"])
      ]
    },
    protocolFailure: protocolFailureSchema,
    protocolLimits: limitsSchema,
    initializeInput: initializeInputSchema,
    initializeResult: initializeResultSchema,
    initializeRequest: initializeRequestEnvelope,
    initializeSuccess: initializeSuccessEnvelope,
    initializeFailure: failureVariant("initialize"),
    rpcRequest: { oneOf: operations.map(requestVariant), "$defs": boundedJsonDefinitions },
    rpcResponse: { oneOf: operations.flatMap((operation) => OPERATION_REGISTRY[operation].kind === "retired" ? [failureVariant(operation)] : [successVariant(operation), failureVariant(operation)]), "$defs": boundedJsonDefinitions }
  }
};

// ../../../../../private/tmp/spec05-vintage-af548f8/runtime/agent-fabric/src/daemon/public-protocol.ts
import { createHash, randomUUID } from "node:crypto";
var knownErrorCodes = new Set(PROTOCOL_ERROR_CODES);
var retryableErrorCodes = /* @__PURE__ */ new Set(["OVERLOADED", "DEADLINE_EXCEEDED"]);
function boundedMessage(error) {
  const source = error instanceof Error ? error.message : String(error);
  const bytes = Buffer.from(source.length === 0 ? "protocol request failed" : source, "utf8");
  if (bytes.length <= 4096) return bytes.toString("utf8");
  return `${new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4080))}\u2026`;
}
function failure(error) {
  const reportedCode = typeof error === "object" && error !== null && "code" in error ? Reflect.get(error, "code") : void 0;
  const code = typeof reportedCode === "string" && knownErrorCodes.has(reportedCode) ? reportedCode : error instanceof TypeError ? "PROTOCOL_INVALID" : "RECOVERY_REQUIRED";
  const reportedDetails = typeof error === "object" && error !== null && "details" in error ? Reflect.get(error, "details") : void 0;
  let details;
  if (reportedDetails !== void 0) {
    try {
      details = parseJsonValue(reportedDetails, "failure.details");
    } catch {
      details = void 0;
    }
  }
  return {
    code,
    message: boundedMessage(error),
    retryable: retryableErrorCodes.has(code),
    ...details === void 0 ? {} : { details }
  };
}
function parseWireRequest(value) {
  const record = strictRecord(value, "request", ["id", "operation", "input"]);
  return {
    id: parseIdentifier(record.id, "request.id"),
    operation: typeof record.operation === "string" ? record.operation : (() => {
      throw new TypeError("request.operation must be a string");
    })(),
    input: record.input
  };
}
function servePublicProtocolConnection(stream, options) {
  const limits = options.limits ?? PROTOCOL_LIMITS;
  const writer = new BoundedNdjsonWriter(stream, {
    maximumFrameBytes: PROTOCOL_LIMITS.maximumFrameBytes,
    maximumPendingWrites: PROTOCOL_LIMITS.maximumPendingCalls
  });
  let initialized;
  let context;
  let inFlight = 0;
  let closed = false;
  const write = async (value) => {
    const encoded = JSON.stringify(value);
    if (encoded === void 0 || Buffer.byteLength(encoded, "utf8") > limits.maximumFrameBytes) {
      throw new TypeError("protocol response exceeds the negotiated frame limit");
    }
    await writer.write(value);
  };
  const respondFailure = async (id, operation, error) => {
    await write({ id, operation, ok: false, error: failure(error) });
  };
  const handle = async (line) => {
    let request;
    try {
      request = parseWireRequest(JSON.parse(line));
    } catch (error) {
      await respondFailure("unknown", "initialize", error);
      return;
    }
    if (inFlight >= limits.maximumInFlightPerConnection) {
      await respondFailure(request.id, request.operation, Object.assign(
        new Error("protocol connection is overloaded"),
        { code: "OVERLOADED" }
      ));
      return;
    }
    inFlight += 1;
    try {
      if (request.operation === "initialize") {
        if (initialized !== void 0) throw new TypeError("protocol connection is already initialized");
        const input2 = parseProtocolInitializeRequest(request.input);
        const verifiedCredential = await options.verifyCredential(input2.authentication.credential);
        initialized = createProtocolInitializeResult({
          request: input2,
          verifiedCredential,
          daemonVersion: options.daemonVersion,
          daemonInstanceGeneration: options.daemonInstanceGeneration,
          offeredFeatures: options.offeredFeatures,
          limits,
          connectionNonce: `connection:${randomUUID()}`
        });
        context = {
          principal: initialized.principal,
          allowedOperations: new Set(initialized.allowedOperations),
          features: initialized.features,
          connectionNonce: initialized.connectionNonce,
          credentialHash: createHash("sha256").update(input2.authentication.credential).digest("hex"),
          daemonInstanceGeneration: initialized.daemonInstanceGeneration
        };
        reader.tightenLimits({
          maximumFrameBytes: limits.maximumFrameBytes,
          idleTimeoutMs: limits.idleTimeoutMs
        });
        await write({ id: request.id, operation: request.operation, ok: true, result: initialized });
        return;
      }
      if (initialized === void 0 || context === void 0) {
        throw Object.assign(new Error("protocol initialize must succeed before operations"), {
          code: "AUTHENTICATION_FAILED"
        });
      }
      if (!isActiveFabricOperation(request.operation)) {
        throw Object.assign(new Error("protocol operation is unsupported or retired"), {
          code: "PROTOCOL_UNSUPPORTED"
        });
      }
      if (!context.allowedOperations.has(request.operation)) {
        throw Object.assign(new Error("protocol operation was not granted to this connection"), {
          code: "FEATURE_UNAVAILABLE"
        });
      }
      const operation = request.operation;
      const input = parseOperationInputForPrincipal(operation, context.principal.kind, request.input);
      const dispatched = await options.dispatch(context, operation, input);
      const result = parseOperationResult(operation, dispatched);
      await write({ id: request.id, operation, ok: true, result });
      try {
        options.afterResponse?.({ context, operation, input, result });
      } catch {
        stream.destroy();
      }
    } catch (error) {
      await respondFailure(request.id, request.operation, error);
    } finally {
      inFlight -= 1;
    }
  };
  const reader = new BoundedNdjsonReader(stream, {
    maximumFrameBytes: PROTOCOL_LIMITS.maximumFrameBytes,
    idleTimeoutMs: PROTOCOL_LIMITS.idleTimeoutMs,
    onFrame: (line) => {
      void handle(line).catch(() => stream.destroy());
    },
    onError: () => stream.destroy(),
    onIdle: () => stream.destroy()
  });
  stream.once("error", () => reader.close());
  stream.once("close", () => {
    closed = true;
    reader.close();
  });
  return {
    closed: reader.closed,
    close() {
      if (closed) return;
      closed = true;
      reader.close();
      stream.destroy();
    }
  };
}

// ../../../../../private/tmp/spec05-vintage-af548f8/vintage-daemon-entry.ts
var FIXTURE_COMMIT = "af548f8";
var EXTENDED_NOTIFICATION = false;
var socketPath = process.argv[2];
if (socketPath === void 0) throw new Error("socket path required");
try {
  rmSync(socketPath, { force: true });
} catch {
}
var observedAt = "2027-01-01T00:00:00.000Z";
var notification = {
  targetIntegration: "native-desktop",
  status: "available",
  journalState: "sent",
  deliveryItemRevision: 1,
  claimGeneration: 1,
  integrationState: "available",
  observedAt
};
var attention = {
  itemId: "attention_fixture_01",
  revision: 1,
  label: "Approval",
  priority: "critical-path",
  title: "Vintage compatibility",
  sourceFreshness: "live",
  lastEventAt: observedAt,
  duplicateCount: 1,
  ...EXTENDED_NOTIFICATION ? { nativeNotification: notification } : {}
};
var fact = (value) => ({ freshness: "live", source: "fabric", revision: 1, observedAt, value });
function dispatch(operation) {
  process.stdout.write(`${JSON.stringify({ type: "dispatch", commit: FIXTURE_COMMIT, operation })}
`);
  if (operation === FABRIC_OPERATIONS.projectionSnapshot) {
    return {
      schemaVersion: 1,
      snapshotRevision: 1,
      readTransactionId: "projection:fixture:1",
      project: fact({ projectId: "project_fixture_01", canonicalRoot: "/fixture" }),
      session: fact(null),
      runs: fact([]),
      attention: fact([attention]),
      capacity: fact({}),
      cursor: 0,
      stateDigest: `sha256:${"a".repeat(64)}`
    };
  }
  if (operation === FABRIC_OPERATIONS.projectionPage) {
    return { view: "attention", page: fact({ items: [attention], nextCursor: 1, hasMore: false }) };
  }
  if (operation === FABRIC_OPERATIONS.projectionViewPage) {
    return {
      status: "page",
      view: "attention",
      rows: [{
        itemId: attention.itemId,
        itemRevision: 1,
        fact: fact({
          summary: {
            kind: "attention",
            label: attention.label,
            priority: attention.priority,
            title: attention.title,
            ...EXTENDED_NOTIFICATION ? { nativeNotification: notification } : {}
          },
          detailRef: { kind: "project", projectId: "project_fixture_01", expectedRevision: 1 },
          actionAvailability: { state: "read-only", reason: "authority-insufficient" }
        })
      }],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: 1,
      readTransactionId: "projection:fixture:1"
    };
  }
  throw Object.assign(new Error(`unsupported fixture operation ${operation}`), { code: "PROTOCOL_UNSUPPORTED" });
}
var server = createServer((socket) => {
  let buffered = "";
  socket.on("data", (chunk) => {
    buffered += chunk.toString("utf8");
    for (; ; ) {
      const newline = buffered.indexOf("\n");
      if (newline < 0) break;
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      try {
        const request = JSON.parse(line);
        if (request.operation === "initialize") {
          process.stdout.write(`${JSON.stringify({
            type: "initialize",
            commit: FIXTURE_COMMIT,
            requiredFeatures: request.input.requiredFeatures,
            optionalFeatures: request.input.optionalFeatures,
            clientNonce: request.input.authentication.clientNonce
          })}
`);
        }
      } catch {
      }
    }
  });
  servePublicProtocolConnection(socket, {
    daemonVersion: `fixture-${FIXTURE_COMMIT}`,
    daemonInstanceGeneration: 1,
    offeredFeatures: PROTOCOL_FEATURES,
    verifyCredential: (credential) => {
      if (credential !== "fixture-secret-01") throw Object.assign(new Error("bad credential"), { code: "AUTHENTICATION_FAILED" });
      return {
        principal: {
          kind: "operator",
          operatorId: "operator_fixture_01",
          projectId: "project_fixture_01",
          projectAuthorityGeneration: 1,
          principalGeneration: 1
        },
        grantedOperations: [
          FABRIC_OPERATIONS.projectionSnapshot,
          FABRIC_OPERATIONS.projectionPage,
          FABRIC_OPERATIONS.projectionViewPage
        ]
      };
    },
    dispatch: (_context, operation) => dispatch(operation)
  });
});
server.listen(socketPath, () => {
  process.stdout.write(`${JSON.stringify({ type: "ready", commit: FIXTURE_COMMIT, socketPath })}
`);
});
var close = () => server.close(() => process.exit(0));
process.once("SIGTERM", close);
process.once("SIGINT", close);
