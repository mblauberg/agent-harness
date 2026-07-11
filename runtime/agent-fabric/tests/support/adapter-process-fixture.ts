import { createInterface } from "node:readline";

const mode = process.argv[2] ?? "echo";
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

input.on("line", (line) => {
  const request: unknown = JSON.parse(line);
  if (typeof request !== "object" || request === null || Array.isArray(request)) {
    return;
  }
  const id = Reflect.get(request, "id");
  if (typeof id !== "string") {
    return;
  }
  if (mode === "malformed-json") {
    process.stdout.write("{not-json\n");
    return;
  }
  if (mode === "malformed-envelope") {
    process.stdout.write(`${JSON.stringify({ id })}\n`);
    return;
  }
  if (mode === "exit") {
    process.stderr.write("fixture exited intentionally");
    process.exit(7);
  }
  if (mode === "never-reply") {
    return;
  }
  process.stdout.write(`${JSON.stringify({ id, result: { echoed: true } })}\n`);
});

if (mode === "never-reply" || mode === "stubborn") {
  setInterval(() => undefined, 1_000);
}
