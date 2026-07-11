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

  it.each(EXTENSION_OPERATIONS)("rejects the %s fixture under its declared wrong operation", (operation) => {
    const fixture = OPERATION_CONTRACT_FIXTURES[operation];
    const wrongOperation = fixture.wrongOperation as ProtocolOperation;
    const wrongValidator = ajv.compile(protocolRequestSchemaFor(wrongOperation));

    expect(wrongValidator({ id: "request_01", operation: wrongOperation, input: fixture.input })).toBe(false);
  });
});
