import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";

import {
  NativeNotificationEffectError,
  type NativeNotification,
  type NativeNotificationAdapter,
  type NativeNotificationDiscovery,
} from "./notification-worker.js";

const OSASCRIPT_PATH = "/usr/bin/osascript";
const NOTIFICATION_SCRIPT = [
  "on run argv",
  "if (count of argv) is not 2 then error \"invalid notification arguments\"",
  "set notificationTitle to item 1 of argv",
  "set notificationBody to item 2 of argv",
  "display notification notificationBody with title notificationTitle",
  "end run",
].join("\n");

type ExecuteOptions = Readonly<{
  timeoutMs: number;
  maximumOutputBytes: number;
}>;

type NativeProcessExecute = (
  file: string,
  argv: readonly string[],
  options: ExecuteOptions,
) => Promise<Readonly<{ stdout: string; stderr: string }>>;

type NativeDesktopOptions = Readonly<{
  platform?: NodeJS.Platform;
  access?: (path: string) => Promise<void>;
  execute?: NativeProcessExecute;
}>;

function execute(file: string, argv: readonly string[], options: ExecuteOptions): Promise<Readonly<{ stdout: string; stderr: string }>> {
  return new Promise((resolve, reject) => {
    execFile(file, [...argv], {
      encoding: "utf8",
      timeout: options.timeoutMs,
      maxBuffer: options.maximumOutputBytes,
      windowsHide: true,
      shell: false,
      env: {
        PATH: "/usr/bin:/bin",
        ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
        ...(process.env.TMPDIR === undefined ? {} : { TMPDIR: process.env.TMPDIR }),
      },
    }, (error, stdout, stderr) => {
      if (error !== null) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

function bounded(value: string, maximumBytes: number, label: string): string {
  if (value.length === 0 || Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw new TypeError(`${label} is empty or exceeds its native-notification limit`);
  }
  if (/[\u0000\r\n]/u.test(value)) throw new TypeError(`${label} contains forbidden control characters`);
  return value;
}

export class MacOsNativeDesktopAdapter implements NativeNotificationAdapter {
  readonly #platform: NodeJS.Platform;
  readonly #access: (path: string) => Promise<void>;
  readonly #execute: NativeProcessExecute;

  constructor(options: NativeDesktopOptions = {}) {
    this.#platform = options.platform ?? process.platform;
    this.#access = options.access ?? (async (path) => await access(path, constants.X_OK));
    this.#execute = options.execute ?? execute;
  }

  async discover(): Promise<NativeNotificationDiscovery> {
    const contract = this.#platform === "darwin"
      ? {
          schemaVersion: 1,
          adapter: "macos-osascript-notification-v1",
          exactAttentionFocus: { supported: false, contractTested: false },
        }
      : { schemaVersion: 1, reason: "unsupported-platform" };
    if (this.#platform !== "darwin") return { state: "unavailable", contract };
    try {
      await this.#access(OSASCRIPT_PATH);
      return { state: "available", contract };
    } catch {
      return { state: "unavailable", contract: { ...contract, reason: "osascript-unavailable" } };
    }
  }

  async send(notification: NativeNotification): Promise<unknown> {
    const title = bounded(notification.title, 128, "notification title");
    const body = bounded(notification.body, 512, "notification body");
    try {
      await this.#execute(
        OSASCRIPT_PATH,
        ["-e", NOTIFICATION_SCRIPT, "--", title, body],
        { timeoutMs: 5_000, maximumOutputBytes: 8_192 },
      );
      return { adapter: "macos-osascript-notification-v1", exit: "success" };
    } catch (cause: unknown) {
      const code = typeof cause === "object" && cause !== null && "code" in cause
        ? String(cause.code)
        : "";
      const outcome = code === "ENOENT" || code === "EACCES" ? "failed" : "ambiguous";
      throw new NativeNotificationEffectError(outcome, "native desktop notification did not prove success", { cause });
    }
  }
}
