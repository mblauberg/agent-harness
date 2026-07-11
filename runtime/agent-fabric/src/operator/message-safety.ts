const FABRIC_BEARER = /af[bc]_[A-Za-z0-9_-]{43}/gu;

/** Full local operator text with terminal controls and Fabric bearer values removed. */
export function renderSafeMessageBody(raw: string): string {
  return raw
    .replace(/\r\n?/gu, "\n")
    .replace(/\t/gu, " ")
    .replace(/[\u2028\u2029]/gu, "\n")
    .replace(/[\u200b-\u200d\u2060\ufeff]/gu, "")
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/gu, " ")
    .replace(FABRIC_BEARER, (value) => `${value.slice(0, 4)}<redacted>`);
}
