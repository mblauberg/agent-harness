import { inertArtifactText } from "../operator/artifact-content-safety.js";

/** Local human projection only. Coordination payloads remain byte-exact. */
export function renderSafePreview(raw: string, maximumCharacters: number): string {
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters < 1) throw new TypeError("preview maximum must be a positive safe integer");
  const inert = inertArtifactText(raw);
  const safe = (inert.safe ? inert.content : "[unsafe preview withheld]")
    .replace(/\n/gu, " ⏎ ")
    .replace(/\s+/gu, " ")
    .trim();
  const characters = [...safe];
  return characters.length <= maximumCharacters
    ? safe
    : `${characters.slice(0, Math.max(1, maximumCharacters - 1)).join("")}…`;
}
