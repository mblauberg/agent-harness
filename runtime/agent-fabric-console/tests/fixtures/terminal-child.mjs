import { withTerminalSession } from "../../src/terminal.ts";

const scenario = process.argv[2] ?? "normal";

try {
  await withTerminalSession(
    {
      input: process.stdin,
      output: process.stdout,
      mouseCapture: scenario !== "mouse-off",
      signalTarget: process,
      onSignal: (signal) => {
        const code = signal === "SIGTERM" ? 143 : 1;
        setImmediate(() => process.exit(code));
      },
    },
    async () => {
      process.stdout.write("READY");
      if (scenario === "error") {
        throw new Error("forced terminal failure");
      }
      if (scenario === "sigterm") {
        await new Promise(() => {});
      }
    },
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ERROR:${message}`);
  process.exitCode = 1;
}
