import { chmodSync } from "node:fs";
import type { Server, Socket } from "node:net";

export async function openRecoverableUnixListener(
  server: Server,
  socketPath: string,
  options: { setMode?(path: string, mode: number): void } = {},
): Promise<void> {
  if (server.listening) return;
  const setMode = options.setMode ?? chmodSync;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      try {
        setMode(socketPath, 0o600);
        resolve();
      } catch (error: unknown) {
        server.close((closeError) => {
          reject(closeError === undefined
            ? error
            : new AggregateError([error, closeError], "socket mode hardening and listener close both failed"));
        });
      }
    });
  });
}

export async function closeRecoverableUnixListener(options: {
  server: Server;
  sockets: Iterable<Socket>;
  waitForInFlight(): Promise<void>;
}): Promise<void> {
  const closed = options.server.listening
    ? new Promise<void>((resolve, reject) => options.server.close((error) => {
        if (error === undefined) resolve();
        else reject(error);
      }))
    : Promise.resolve();
  for (const socket of options.sockets) socket.end();
  await Promise.all([closed, options.waitForInFlight()]);
}
