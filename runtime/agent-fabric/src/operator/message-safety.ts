import { inertArtifactText } from "./artifact-content-safety.js";

/** Full local operator text through the shared terminal and credential classifier. */
export function renderSafeMessageBody(raw: string): string {
  const inert = inertArtifactText(raw);
  return inert.safe ? inert.content : "[unsafe message content withheld]";
}
