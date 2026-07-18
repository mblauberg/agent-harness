export const DEFAULT_PROVIDER_TURN_TIMEOUT_MS = 30 * 60_000;
const PROVIDER_TURN_RESPONSE_GRACE_MS = 5_000;

export function providerTurnResponseTimeoutMs(providerTurnTimeoutMs: number): number {
  return providerTurnTimeoutMs + PROVIDER_TURN_RESPONSE_GRACE_MS;
}
