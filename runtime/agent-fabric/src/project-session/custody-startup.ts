import type { LaunchRecoveryResult } from "./launch-contracts.js";

/**
 * Startup coordinator for `LaunchCustodyService#recover` (issue #354, S4e2). Byte-moved from
 * `LaunchCustodyService#recover`'s body: this is the single ordering/aggregation point across
 * the four project-session custody families (provider-agent, chair live handoff, chair recovery,
 * launch). It owns none of the family recovery logic itself — only the exact original order
 * (live handoff, chair recovery, provider-agent, launch, then retained-chair audit), the
 * continue-after-error semantics (every family's recovery is attempted even if an earlier family
 * throws), the aggregate counters, and the single final `AggregateError`.
 */
export type CustodyStartupFamilies = Readonly<{
  chairLiveHandoffCustodyRecovery: Readonly<{
    recoverChairLiveHandoffCustody(result: LaunchRecoveryResult, errors: unknown[]): Promise<void>;
  }>;
  chairRecoveryCustody: Readonly<{
    recoverChairRecoveryCustody(result: LaunchRecoveryResult): Promise<void>;
    auditRetainedChairBridges(result: LaunchRecoveryResult, errors: unknown[]): void;
  }>;
  providerAgentCustodyRecovery: Readonly<{
    recoverAgentCustody(result: LaunchRecoveryResult, errors: unknown[]): Promise<void>;
  }>;
  launchSettlement: Readonly<{
    recoverLaunchCustody(result: LaunchRecoveryResult, errors: unknown[]): Promise<void>;
  }>;
}>;

export async function recoverLaunchCustodyFamilies(
  families: CustodyStartupFamilies,
): Promise<LaunchRecoveryResult> {
  const result: {
    preparedFailed: number;
    lookedUp: number;
    activated: number;
    failed: number;
    ambiguous: number;
    recoveryRequired: number;
  } = {
    preparedFailed: 0,
    lookedUp: 0,
    activated: 0,
    failed: 0,
    ambiguous: 0,
    recoveryRequired: 0,
  };
  const errors: unknown[] = [];
  try {
    await families.chairLiveHandoffCustodyRecovery.recoverChairLiveHandoffCustody(result, errors);
  } catch (error: unknown) {
    errors.push(error);
    result.ambiguous += 1;
  }
  try {
    await families.chairRecoveryCustody.recoverChairRecoveryCustody(result);
  } catch (error: unknown) {
    errors.push(error);
    result.ambiguous += 1;
  }
  try {
    await families.providerAgentCustodyRecovery.recoverAgentCustody(result, errors);
  } catch (error: unknown) {
    errors.push(error);
    result.ambiguous += 1;
  }
  try {
    await families.launchSettlement.recoverLaunchCustody(result, errors);
  } catch (error: unknown) {
    errors.push(error);
    result.ambiguous += 1;
  }
  families.chairRecoveryCustody.auditRetainedChairBridges(result, errors);
  if (errors.length > 0) {
    throw new AggregateError(errors, "launch custody recovery left one or more sessions unfenced");
  }
  return result;
}
