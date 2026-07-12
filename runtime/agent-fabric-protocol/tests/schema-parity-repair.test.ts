import { createRequire } from "node:module";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { describe, expect, it } from "vitest";

import {
  EXTENSION_OPERATIONS,
  BASELINE_OPERATIONS,
  OPERATION_CONTRACT_FIXTURES,
  OPERATION_REGISTRY,
  assertCodecRegistryExhaustive,
  parseOperationInput,
  parseOperationResult,
  protocolRequestSchemaFor,
  protocolResponseSchemasFor,
  type ProtocolOperation,
} from "../src/index.js";

const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

describe("operation-correlated schema and parser parity", () => {
  it("has one keyed input and result codec for every canonical operation", () => {
    expect(() => assertCodecRegistryExhaustive()).not.toThrow();
    expect(Object.keys(OPERATION_CONTRACT_FIXTURES)).toHaveLength(Object.keys(OPERATION_REGISTRY).length);
  });

  it.each(EXTENSION_OPERATIONS)("accepts the positive extension fixture for %s", (operation) => {
    const fixture = OPERATION_CONTRACT_FIXTURES[operation];
    expect(() => parseOperationInput(operation, fixture.input)).not.toThrow();
    expect(() => parseOperationResult(operation, fixture.result)).not.toThrow();

    const requestValidator = ajv.compile(protocolRequestSchemaFor(operation));
    expect(requestValidator({ id: "request_01", operation, input: fixture.input }), ajv.errorsText(requestValidator.errors)).toBe(true);

    const successSchema = protocolResponseSchemasFor(operation)[0];
    if (successSchema === undefined) throw new Error("missing success schema");
    const resultValidator = ajv.compile(successSchema);
    expect(resultValidator({ id: "request_01", operation, ok: true, result: fixture.result }), ajv.errorsText(resultValidator.errors)).toBe(true);
  });

  it.each(BASELINE_OPERATIONS)("preserves the positive baseline fixture for %s", (operation) => {
    const fixture = OPERATION_CONTRACT_FIXTURES[operation];
    expect(() => parseOperationInput(operation, fixture.input)).not.toThrow();
    expect(() => parseOperationResult(operation, fixture.result)).not.toThrow();

    const requestValidator = ajv.compile(protocolRequestSchemaFor(operation));
    expect(
      requestValidator({ id: "request_01", operation, input: fixture.input }),
      ajv.errorsText(requestValidator.errors),
    ).toBe(true);
  });

  it("publishes the same failed project-session terminal path accepted by the runtime parser", () => {
    const operation = "fabric.v1.project-session.close" as const;
    const fixture = OPERATION_CONTRACT_FIXTURES[operation];
    const result = {
      ...(fixture.result as Record<string, unknown>),
      state: "closed",
      terminalPath: {
        kind: "failed",
        reason: "provider terminated",
        failureRef: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    };

    expect(() => parseOperationResult(operation, result)).not.toThrow();
    const successSchema = protocolResponseSchemasFor(operation)[0];
    if (successSchema === undefined) throw new Error("missing success schema");
    const validator = ajv.compile(successSchema);
    expect(
      validator({ id: "request_01", operation, ok: true, result }),
      ajv.errorsText(validator.errors),
    ).toBe(true);
  });

  it("enforces codec bounds before applying a domain parser", () => {
    const operation = "fabric.v1.project-session.close" as const;
    const fixture = OPERATION_CONTRACT_FIXTURES[operation];
    const result = {
      ...(fixture.result as Record<string, unknown>),
      state: "closed",
      terminalPath: { kind: "cancelled", reason: "x".repeat(4097) },
    };

    expect(() => parseOperationResult(operation, result)).toThrowError(/reason.*UTF-8 bytes/iu);
  });

  it("keeps terminal-path state correlation identical in schema and parser", () => {
    const operation = "fabric.v1.project-session.close" as const;
    const fixture = OPERATION_CONTRACT_FIXTURES[operation];
    const result = {
      ...(fixture.result as Record<string, unknown>),
      state: "active",
      terminalPath: { kind: "cancelled", reason: "not terminal" },
    };

    expect(() => parseOperationResult(operation, result)).toThrowError(/terminalPath|state/iu);
    const successSchema = protocolResponseSchemasFor(operation)[0];
    if (successSchema === undefined) throw new Error("missing success schema");
    const validator = ajv.compile(successSchema);
    expect(validator({ id: "request_01", operation, ok: true, result })).toBe(false);
  });

  it("requires the enforcement target selected by a scoped-gate check", () => {
    const operation = "fabric.v1.scoped-gate.check" as const;
    const targetless = {
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      dependencyRevision: 1,
      enforcementPoint: "operation",
      operationId: "fabric.v1.operator-action.preview",
    };
    const validator = ajv.compile(protocolRequestSchemaFor(operation));

    expect(() => parseOperationInput(operation, targetless)).toThrowError(/operationTarget is required/iu);
    expect(validator({ id: "request_01", operation, input: targetless })).toBe(false);

    const targeted = { ...targetless, operationTarget: { kind: "task", taskId: "task_01" } };
    expect(() => parseOperationInput(operation, targeted)).not.toThrow();
    expect(validator({ id: "request_02", operation, input: targeted })).toBe(true);

    const stale = { ...targeted, dependencyRevision: 0 };
    expect(() => parseOperationInput(operation, stale)).toThrowError(/dependencyRevision/iu);
    expect(validator({ id: "request_03", operation, input: stale })).toBe(false);
  });

  it.each(EXTENSION_OPERATIONS)("rejects the %s fixture under its declared wrong operation", (operation) => {
    const fixture = OPERATION_CONTRACT_FIXTURES[operation];
    const wrongOperation = fixture.wrongOperation as ProtocolOperation;
    const wrongValidator = ajv.compile(protocolRequestSchemaFor(wrongOperation));

    expect(wrongValidator({ id: "request_01", operation: wrongOperation, input: fixture.input })).toBe(false);
  });
});
