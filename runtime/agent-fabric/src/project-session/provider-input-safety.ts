import { ProjectFabricCoreError } from "./contracts.js";
import { inertArtifactText } from "../operator/artifact-content-safety.js";

const FORBIDDEN_PROVIDER_KEYS = /(?:api[_-]?key|authorization|capability|command|credential|environment|env|executable|pass(?:word|phrase)|private[_-]?key|proxy[_-]?authorization|secret|socket|token)/iu;
const REDACTED = "[REDACTED credential]";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertSafeLaunchProviderInput(value: unknown, path = "provider.input"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeLaunchProviderInput(item, `${path}[${String(index)}]`));
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_PROVIDER_KEYS.test(key)) {
        throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", `${path}.${key} is a trusted control field`);
      }
      assertSafeLaunchProviderInput(item, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== "string") return;
  const inert = inertArtifactText(value);
  if (!inert.safe || inert.transformation !== "none") {
    throw new ProjectFabricCoreError("CAPABILITY_FORBIDDEN", `${path} contains credential or unsafe content`);
  }
}

export function redactLaunchProviderInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactLaunchProviderInput(item));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      FORBIDDEN_PROVIDER_KEYS.test(key) ? REDACTED : redactLaunchProviderInput(item),
    ]));
  }
  if (typeof value !== "string") return value;
  const inert = inertArtifactText(value);
  return inert.safe ? inert.content : REDACTED;
}
