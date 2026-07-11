import { existsSync, readFileSync } from "node:fs";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaCandidates = [
  new URL("../../schemas/fabric-receipt.schema.json", import.meta.url),
  new URL("../../../schemas/fabric-receipt.schema.json", import.meta.url),
];
const schemaUrl = schemaCandidates.find((candidate) => existsSync(candidate));
if (schemaUrl === undefined) throw new Error("fabric receipt schema is unavailable");
const schema: unknown = JSON.parse(readFileSync(schemaUrl, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
(addFormats as unknown as (instance: Ajv2020) => void)(ajv);
const validate = ajv.compile(schema as AnySchema);

export function assertFabricReceiptSchema(value: unknown): void {
  if (validate(value)) return;
  const details = validate.errors?.map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`).join("; ") ?? "invalid";
  throw new Error(`fabric receipt schema validation failed: ${details}`);
}
