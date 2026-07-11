const FABRIC_BEARER = /af[bc]_[A-Za-z0-9_-]{43}/gu;

/** Local human projection only. Coordination payloads remain byte-exact. */
export function renderSafePreview(raw: string, maximumCharacters: number): string {
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters < 1) throw new TypeError("preview maximum must be a positive safe integer");
  const safe = raw
    .replace(/\r\n?|\n/gu, " ⏎ ")
    .replace(/\t/gu, " ")
    .replace(/[\u2028\u2029]/gu, " ")
    .replace(/[\u200b-\u200d\u2060\ufeff]/gu, "")
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(FABRIC_BEARER, (value) => `${value.slice(0, 4)}<redacted>`)
    .replace(/\s+/gu, " ")
    .trim();
  const characters = [...safe];
  return characters.length <= maximumCharacters
    ? safe
    : `${characters.slice(0, Math.max(1, maximumCharacters - 1)).join("")}…`;
}
