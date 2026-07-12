import { withTerminalSession } from "../../src/terminal.ts";

const scenario = process.argv[2] ?? "normal";
let resizeCount = 0;
let finishResize;
const resizeFinished = new Promise((resolve) => {
  finishResize = resolve;
});

try {
  await withTerminalSession(
    {
      input: process.stdin,
      output: process.stdout,
      mouseCapture: scenario !== "mouse-off" && scenario !== "mouse-toggle",
      signalTarget: process,
      onResize: ({ columns, rows }) => {
        resizeCount += 1;
        process.stdout.write(`RESIZE:${columns}x${rows}\n`);
        if (resizeCount === 9) {
          finishResize();
        }
      },
      onSignal: (signal) => {
        const code = signal === "SIGTERM" ? 143 : 1;
        setImmediate(() => process.exit(code));
      },
    },
    async (session) => {
      process.stdout.write("READY");
      if (scenario === "error") {
        throw new Error("forced terminal failure");
      }
      if (scenario === "sigterm") {
        await new Promise(() => {});
      }
      if (scenario === "explicit-exit") {
        process.exit(23);
      }
      if (scenario === "mouse-toggle") {
        session.setMouseCapture(true);
        session.setMouseCapture(true);
        session.setMouseCapture(false);
        session.setMouseCapture(false);
      }
      if (scenario === "resize") {
        await resizeFinished;
      }
    },
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ERROR:${message}`);
  process.exitCode = 1;
}
