#!/usr/bin/env python3
import base64
import array
import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import termios
import time


def same_except_darwin_pendin(before: list, after: list) -> bool:
    if sys.platform != "darwin" or before == after:
        return False
    pendin = getattr(termios, "PENDIN", 0x20000000)
    return (
        before[:3] == after[:3]
        and before[4:] == after[4:]
        and before[3] & pendin == 0
        and after[3] == before[3] | pendin
    )


def queued_input_bytes(slave: int) -> int:
    queued = array.array("i", [0])
    fcntl.ioctl(slave, termios.FIONREAD, queued, True)
    return queued[0]


def read_available(master: int, output: bytearray, timeout: float) -> None:
    ready, _, _ = select.select([master], [], [], timeout)
    if not ready:
        return
    try:
        output.extend(os.read(master, 65536))
    except OSError as error:
        if error.errno != errno.EIO:
            raise


def main() -> int:
    child_path, scenario = sys.argv[1], sys.argv[2]
    master, slave = pty.openpty()
    if scenario == "resize":
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
    before = termios.tcgetattr(slave)
    process = subprocess.Popen(
        ["node", child_path, scenario],
        stdin=slave,
        stdout=slave,
        stderr=slave,
        close_fds=True,
    )
    output = bytearray()
    deadline = time.monotonic() + 5
    signalled = False
    resize_targets = [
        (100, 30),
        (40, 8),
        (1, 1),
        (120, 40),
        (1, 1),
        (40, 8),
        (100, 30),
        (80, 24),
    ]
    resize_index = 0
    resize_sent = False
    while process.poll() is None and time.monotonic() < deadline:
        read_available(master, output, 0.05)
        if scenario == "sigterm" and not signalled and b"READY" in output:
            os.kill(process.pid, signal.SIGTERM)
            signalled = True
        if scenario == "resize" and b"READY" in output and resize_index < len(resize_targets):
            resize_event_count = output.count(b"RESIZE:")
            if not resize_sent and resize_event_count >= resize_index + 1:
                columns, rows = resize_targets[resize_index]
                fcntl.ioctl(
                    slave,
                    termios.TIOCSWINSZ,
                    struct.pack("HHHH", rows, columns, 0, 0),
                )
                os.kill(process.pid, signal.SIGWINCH)
                resize_sent = True
            elif resize_sent and resize_event_count >= resize_index + 2:
                resize_index += 1
                resize_sent = False
    if process.poll() is None:
        process.kill()
    returncode = process.wait(timeout=2)
    for _ in range(5):
        read_available(master, output, 0.02)
    immediate = termios.tcgetattr(slave)
    immediate_exact = before == immediate
    darwin_pendin_only = same_except_darwin_pendin(before, immediate)
    queued = queued_input_bytes(slave)
    # FIONREAD is non-consuming. On Darwin it also lets the line discipline
    # settle the transient PENDIN raised by raw-to-canonical restoration.
    settled = termios.tcgetattr(slave)
    restored = (
        (immediate_exact or darwin_pendin_only)
        and queued == 0
        and settled == before
    )
    os.close(master)
    os.close(slave)
    print(
        json.dumps(
            {
                "returncode": returncode,
                "restored": restored,
                "platform": sys.platform,
                "immediate_mode": (
                    "exact"
                    if immediate_exact
                    else "darwin-pendin-only"
                    if darwin_pendin_only
                    else "invalid"
                ),
                "queued_input_bytes": queued,
                "post_settlement_exact": settled == before,
                "transcript": base64.b64encode(output).decode("ascii"),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
