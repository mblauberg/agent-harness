import { existsSync, readFileSync } from "node:fs";

import type { AnySchema, ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { fabricReceiptStateHash, isJsonValue } from "./canonical.js";

const v1SchemaCandidates = [
  new URL("../../schemas/fabric-receipt.schema.json", import.meta.url),
  new URL("../../../schemas/fabric-receipt.schema.json", import.meta.url),
];
const v2SchemaCandidates = [
  new URL("../../schemas/fabric-receipt.v2.schema.json", import.meta.url),
  new URL("../../../schemas/fabric-receipt.v2.schema.json", import.meta.url),
];
const v1SchemaUrl = v1SchemaCandidates.find((candidate) => existsSync(candidate));
const v2SchemaUrl = v2SchemaCandidates.find((candidate) => existsSync(candidate));
if (v1SchemaUrl === undefined || v2SchemaUrl === undefined) throw new Error("fabric receipt schemas are unavailable");
const v1Schema: unknown = JSON.parse(readFileSync(v1SchemaUrl, "utf8"));
const v2Schema: unknown = JSON.parse(readFileSync(v2SchemaUrl, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
(addFormats as unknown as (instance: Ajv2020) => void)(ajv);
ajv.addSchema(v1Schema as AnySchema);
function requiredValidator(value: ValidateFunction | undefined): ValidateFunction {
  if (value === undefined) throw new Error("fabric receipt v1 schema did not compile");
  return value;
}
const validateV1 = requiredValidator(ajv.getSchema("https://agent-harness.local/agent-fabric/v1/fabric-receipt.schema.json"));
const validateV2 = ajv.compile(v2Schema as AnySchema);

export function assertFabricReceiptSchema(value: unknown): void {
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
  const validate = record?.schemaVersion === 1 ? validateV1 : validateV2;
  if (validate(value)) {
    if (record?.schemaVersion === 2 && isJsonValue(record)) {
      const expected = fabricReceiptStateHash(record);
      if (record.stateHash !== expected) throw new Error("fabric receipt state hash mismatch");
    }
    return;
  }
  const details = validate.errors?.map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`).join("; ") ?? "invalid";
  throw new Error(`fabric receipt schema validation failed: ${details}`);
}
