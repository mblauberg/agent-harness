import * as publicApi from "../../src/index.ts";

export type OptionalLegHandle = {
  blocking: boolean;
  completion: Promise<unknown>;
};

export function startOptionalAdapterLeg(options: Record<string, unknown>): OptionalLegHandle {
  const start: unknown = Reflect.get(publicApi, "startOptionalAdapterLeg");
  if (typeof start !== "function") {
    throw new Error("public agent-fabric API startOptionalAdapterLeg is not implemented");
  }
  const value: unknown = Reflect.apply(start, undefined, [options]);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("startOptionalAdapterLeg must return a handle");
  }
  const blocking = Reflect.get(value, "blocking");
  const completion = Reflect.get(value, "completion");
  if (typeof blocking !== "boolean" || !(completion instanceof Promise)) {
    throw new TypeError("optional leg handle requires blocking and completion");
  }
  return { blocking, completion };
}

export function expectRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError("optional leg result must be an object");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
