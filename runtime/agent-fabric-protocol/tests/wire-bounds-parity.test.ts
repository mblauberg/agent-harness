import { createRequire } from "node:module";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { describe, expect, it } from "vitest";

import {
  PROTOCOL_SCHEMA,
  addProtocolSchemaKeywords,
  parseProtocolFailure,
  parseProtocolInitializeRequest,
} from "../src/index.js";

const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
addProtocolSchemaKeywords(ajv);

describe("manual wire-schema UTF-8 parity", () => {
  it("applies the shared 128-byte client field bound in runtime and schema", () => {
    const input = {
      protocolVersion: 1,
      client: { name: "😀".repeat(64), version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: "test-capability-token",
        clientNonce: "client_nonce_01",
      },
      expectedPrincipalKind: "operator",
      requiredFeatures: [],
      optionalFeatures: [],
    } as const;
    const validate = ajv.compile({
      $schema: PROTOCOL_SCHEMA.$schema,
      $ref: "#/$defs/initializeInput",
      $defs: PROTOCOL_SCHEMA.$defs,
    });

    expect(() => parseProtocolInitializeRequest(input)).toThrowError(/128 UTF-8 bytes/iu);
    expect(validate(input), ajv.errorsText(validate.errors)).toBe(false);
  });

  it("enforces combined feature capacity and cross-list uniqueness in standalone AJV", () => {
    const base = {
      protocolVersion: 1,
      client: { name: "console", version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: "test-capability-token",
        clientNonce: "client_nonce_01",
      },
      expectedPrincipalKind: "operator",
      requiredFeatures: ["fabric-core.v1"],
      optionalFeatures: [],
    } as const;
    const validate = ajv.compile({
      $schema: PROTOCOL_SCHEMA.$schema,
      $ref: "#/$defs/initializeInput",
      $defs: PROTOCOL_SCHEMA.$defs,
    });
    const crossed = { ...base, optionalFeatures: ["fabric-core.v1"] };
    const overCombined = {
      ...base,
      requiredFeatures: Array.from({ length: 33 }, (_, index) => `required-${String(index)}.v1`),
      optionalFeatures: Array.from({ length: 32 }, (_, index) => `optional-${String(index)}.v1`),
    };

    for (const input of [crossed, overCombined]) {
      expect(() => parseProtocolInitializeRequest(input)).toThrow(/duplicate|64|combined/iu);
      expect(validate(input), ajv.errorsText(validate.errors)).toBe(false);
    }
  });

  it("applies the shared 4096-byte failure-message bound in runtime and schema", () => {
    const failure = {
      code: "PROTOCOL_INVALID",
      message: "x".repeat(4097),
      retryable: false,
    } as const;
    const validate = ajv.compile({
      $schema: PROTOCOL_SCHEMA.$schema,
      $ref: "#/$defs/protocolFailure",
      $defs: PROTOCOL_SCHEMA.$defs,
    });

    expect(() => parseProtocolFailure(failure)).toThrowError(/4096 UTF-8 bytes/iu);
    expect(validate(failure), ajv.errorsText(validate.errors)).toBe(false);
  });
});
