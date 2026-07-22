import { describe, expect, it } from "vitest";

import {
  composeOperationCodecFragments,
  composeOperationShapeFragments,
  assertComposedRegistryExhaustive,
} from "../src/operation-codecs/registry.js";
import type { OperationCodecFragment, OperationCodecPair, OperationShapeFragment, WireShape } from "../src/operation-codecs/common.js";
import { assertCodecRegistryExhaustive, OPERATION_CODECS } from "../src/operation-codecs.js";
import { OPERATION_REGISTRY } from "../src/operations.js";
import type { ProtocolOperation } from "../src/rpc-contract.js";

const fixturePair: OperationCodecPair = {
  input: { schema: { type: "object" }, example: {}, parse: (value) => value },
  result: { schema: { type: "object" }, example: {}, parse: (value) => value },
};

// Two real canonical operations, used only as fixture keys; the fixture codec bodies are inert.
const [operationA, operationB] = Object.keys(OPERATION_REGISTRY) as [ProtocolOperation, ProtocolOperation];

describe("operation codec registry composer", () => {
  it("composes disjoint fragments into one record", () => {
    const fragmentA: OperationCodecFragment = { [operationA]: fixturePair };
    const fragmentB: OperationCodecFragment = { [operationB]: fixturePair };

    const composed = composeOperationCodecFragments([fragmentA, fragmentB]);

    expect(composed[operationA]).toBe(fixturePair);
    expect(composed[operationB]).toBe(fixturePair);
  });

  it("throws on the first duplicate key contributed by more than one fragment", () => {
    const fragmentA: OperationCodecFragment = { [operationA]: fixturePair };
    const fragmentB: OperationCodecFragment = { [operationA]: fixturePair };

    expect(() => composeOperationCodecFragments([fragmentA, fragmentB])).toThrow(
      /duplicate fragment entry/,
    );
  });

  it("rejects unexpected and undefined codec fragment entries before canonical ordering", () => {
    const unexpected = { "fabric.v1.not-a-real-operation": fixturePair } as unknown as OperationCodecFragment;
    expect(() => composeOperationCodecFragments([unexpected])).toThrow(/unexpected fragment entry/);

    const undefinedEntry = { [operationA]: undefined } as unknown as OperationCodecFragment;
    expect(() => composeOperationCodecFragments([undefinedEntry])).toThrow(/undefined fragment entry/);
  });

  it("rejects duplicate shape ownership instead of allowing a spread overwrite", () => {
    const shape: WireShape = { kind: "object", required: [], optional: [] };
    const fragmentA: OperationShapeFragment = { [operationA]: shape };
    const fragmentB: OperationShapeFragment = { [operationA]: shape };

    expect(() => composeOperationShapeFragments([fragmentA, fragmentB])).toThrow(
      /duplicate fragment entry/,
    );
  });

  it("passes for a registry whose key set exactly matches the canonical operation set", () => {
    expect(() => assertComposedRegistryExhaustive(OPERATION_CODECS)).not.toThrow();
  });

  it("reports both a missing and an unexpected key, not just a count mismatch", () => {
    const registryEntries = Object.entries(OPERATION_CODECS).filter(([key]) => key !== operationA);
    // Same cardinality as the canonical set (one dropped, one bogus added) so a count-only check
    // would wrongly pass; the hardened check must still fail on both directions.
    const brokenRegistry: Readonly<Record<string, OperationCodecPair>> = Object.freeze({
      ...Object.fromEntries(registryEntries),
      "fabric.v1.not-a-real-operation": fixturePair,
    });

    expect(() => assertComposedRegistryExhaustive(brokenRegistry)).toThrow(
      new RegExp(`missing=\\[${operationA.replace(/[.]/g, "\\.")}\\].*unexpected=\\[fabric\\.v1\\.not-a-real-operation\\]`),
    );
  });

  it("keeps the public assertCodecRegistryExhaustive barrel export green", () => {
    expect(() => assertCodecRegistryExhaustive()).not.toThrow();
  });
});
