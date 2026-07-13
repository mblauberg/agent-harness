#![cfg(unix)]
#![allow(unsafe_code)]

use std::os::fd::AsRawFd;
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, ExitStatus};
use std::thread;
use std::time::Duration;

use agent_fabric_review_portal_supervisor::mark_control_fd_cloexec;

fn wait_bounded(mut child: Child, timeout: Duration) -> ExitStatus {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        match child.try_wait().expect("poll child") {
            Some(status) => return status,
            None if std::time::Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(5));
            }
            None => {
                let _ = child.kill();
                let _ = child.wait();
                panic!("FD3 canary child exceeded the bounded test deadline");
            }
        }
    }
}

#[test]
fn supervisor_owner_marks_fd3_cloexec_before_provider_exec() {
    let _occupy_fd3 = std::fs::File::open("/dev/null").expect("occupy low descriptor");
    let (control, _control_peer) = std::os::unix::net::UnixStream::pair().expect("control pair");
    let control_fd = control.as_raw_fd();
    let mut command = Command::new(std::env::current_exe().expect("test executable"));
    command
        .args([
            "--exact",
            "control_fd_probe_child",
            "--nocapture",
            "--test-threads=1",
        ])
        .env("AGENT_FABRIC_FD3_PROBE", "1");
    unsafe {
        command.pre_exec(move || {
            if libc_test::dup2(control_fd, 3) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    assert!(
        wait_bounded(
            command.spawn().expect("FD3 probe child"),
            Duration::from_secs(2),
        )
        .success()
    );
}

#[test]
fn control_fd_probe_child() {
    if std::env::var_os("AGENT_FABRIC_FD3_PROBE").is_none() {
        return;
    }
    mark_control_fd_cloexec().expect("mark FD3 CLOEXEC");
    let mut command = Command::new("/bin/sh");
    command.args(["-c", "test ! -e /dev/fd/3"]);
    let status = wait_bounded(
        command.spawn().expect("exec inheritance probe"),
        Duration::from_secs(2),
    );
    assert!(status.success(), "FD3 survived provider exec");
}

#[allow(unsafe_code)]
mod libc_test {
    unsafe extern "C" {
        pub fn dup2(
            old_fd: std::os::raw::c_int,
            new_fd: std::os::raw::c_int,
        ) -> std::os::raw::c_int;
    }
}
