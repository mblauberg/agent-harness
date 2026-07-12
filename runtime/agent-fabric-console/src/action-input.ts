import type { ArtifactRef } from "@local/agent-fabric-protocol";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse the exact artifact-reference syntax accepted by action planning.
 *
 * The compact form is the primary Console input. The object form remains for
 * compatibility with the advanced palette, but both paths share the same
 * traversal, digest, and size checks.
 */
export function parseArtifactReferenceDraft(value: string): ArtifactRef | null {
  let parsed: unknown;
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  } else {
    const separator = trimmed.lastIndexOf("@sha256:");
    if (separator < 1) return null;
    parsed = {
      path: trimmed.slice(0, separator),
      digest: trimmed.slice(separator + 1),
    };
  }
  if (!isRecord(parsed) || Object.keys(parsed).sort().join(",") !== "digest,path") {
    return null;
  }
  const path = parsed.path;
  const digest = parsed.digest;
  if (
    typeof path !== "string" ||
    path.length < 1 ||
    path.length > 4_096 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    typeof digest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/u.test(digest)
  ) {
    return null;
  }
  return {
    path: path as ArtifactRef["path"],
    digest: digest as ArtifactRef["digest"],
  };
}
