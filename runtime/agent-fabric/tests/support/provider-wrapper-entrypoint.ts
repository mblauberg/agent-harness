import { runAgyAdapter } from "../../src/adapters/providers/optional/agy.js";
import { runCursorAgentAdapter } from "../../src/adapters/providers/optional/cursor-agent.js";
import { runKiroAcpAdapter } from "../../src/adapters/providers/optional/kiro-acp.js";

const verifyProvider = async (): Promise<never> => ({}) as never;
const adapter = process.env.AGENT_FABRIC_TEST_ADAPTER;
const providerTurnTimeoutMs = process.env.AGENT_FABRIC_TEST_PROVIDER_TURN_TIMEOUT_MS === undefined
  ? undefined
  : Number(process.env.AGENT_FABRIC_TEST_PROVIDER_TURN_TIMEOUT_MS);
if (adapter === "agy") {
  await runAgyAdapter(process.argv.slice(2), {
    verifyProvider,
    ...(providerTurnTimeoutMs === undefined ? {} : { providerTurnTimeoutMs }),
  });
}
else if (adapter === "cursor-agent") await runCursorAgentAdapter(process.argv.slice(2), { verifyProvider });
else if (adapter === "kiro-acp") await runKiroAcpAdapter(process.argv.slice(2), { verifyProvider });
else throw new Error("test provider wrapper adapter is invalid");
