#![cfg(unix)]
#![allow(unsafe_code)]

use std::fs;
use std::io::{Read, Write};
use std::os::fd::AsRawFd;
use std::os::unix::net::UnixListener;
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use agent_fabric_review_portal_supervisor::{
    PORTAL_MODE, REVIEW_ACTION_ENV, REVIEW_CONTRACT_ENV, REVIEW_SOCKET_ENV,
};

fn socket_directory() -> std::path::PathBuf {
    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(0);
    let nonce = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
    std::path::PathBuf::from("/tmp").join(format!("afp-{}-{nonce:x}", std::process::id()))
}

fn wait_with_output_bounded(mut child: Child, timeout: Duration) -> Output {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        match child.try_wait().expect("poll helper") {
            Some(_) => return child.wait_with_output().expect("collect helper output"),
            None if std::time::Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(5));
            }
            None => {
                let _ = child.kill();
                let _ = child.wait();
                panic!("portal helper exceeded the bounded test deadline");
            }
        }
    }
}

#[test]
fn connects_once_and_relays_byte_exact_lf_frames_between_stdio_and_the_broker() {
    let directory = socket_directory();
    fs::create_dir(&directory).expect("private test directory");
    let socket = directory.join("portal.sock");
    let listener = UnixListener::bind(&socket).expect("bind broker");
    listener.set_nonblocking(true).expect("nonblocking broker");
    let broker = thread::spawn(move || {
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        let mut stream = loop {
            match listener.accept() {
                Ok((stream, _)) => break stream,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    assert!(
                        std::time::Instant::now() < deadline,
                        "helper never connected"
                    );
                    thread::sleep(Duration::from_millis(5));
                }
                Err(error) => panic!("broker accept failed: {error}"),
            }
        };
        let mut request = Vec::new();
        loop {
            let mut byte = [0_u8; 1];
            stream.read_exact(&mut byte).expect("request byte");
            request.push(byte[0]);
            if byte[0] == b'\n' {
                break;
            }
        }
        assert_eq!(request, b"\xffopaque-request\n");
        stream
            .write_all(b"\xfeopaque-response\n")
            .expect("response");
    });

    let mut child = Command::new(env!("CARGO_BIN_EXE_agent-fabric-review-portal-supervisor"))
        .arg(PORTAL_MODE)
        .env_clear()
        .env(REVIEW_SOCKET_ENV, &socket)
        .env(REVIEW_ACTION_ENV, "cursor/action-01")
        .env(
            REVIEW_CONTRACT_ENV,
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn helper");
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(b"\xffopaque-request\n")
        .expect("write request");

    let output = wait_with_output_bounded(child, Duration::from_secs(2));
    broker.join().expect("broker completion");
    fs::remove_dir_all(&directory).expect("test cleanup");

    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(output.stdout, b"\xfeopaque-response\n");
}

#[test]
fn fails_without_retry_when_the_action_socket_is_unavailable() {
    let directory = socket_directory();
    fs::create_dir(&directory).expect("private test directory");
    let socket = directory.join("missing.sock");
    let started = std::time::Instant::now();
    let mut command = Command::new(env!("CARGO_BIN_EXE_agent-fabric-review-portal-supervisor"));
    command
        .arg(PORTAL_MODE)
        .env_clear()
        .env(REVIEW_SOCKET_ENV, &socket)
        .env(REVIEW_ACTION_ENV, "cursor/action-01")
        .env(
            REVIEW_CONTRACT_ENV,
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        )
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let output =
        wait_with_output_bounded(command.spawn().expect("run helper"), Duration::from_secs(2));
    fs::remove_dir_all(&directory).expect("test cleanup");

    assert!(!output.status.success());
    assert!(started.elapsed() < Duration::from_secs(1));
    assert!(!String::from_utf8_lossy(&output.stderr).contains(socket.to_string_lossy().as_ref()));
}

#[test]
fn rejects_an_inherited_control_fd_before_connecting_to_the_broker() {
    let directory = socket_directory();
    fs::create_dir(&directory).expect("private test directory");
    let socket = directory.join("portal.sock");
    let listener = UnixListener::bind(&socket).expect("bind broker");
    listener.set_nonblocking(true).expect("nonblocking broker");
    let broker = thread::spawn(move || {
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        loop {
            match listener.accept() {
                Ok((_stream, _)) => return true,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    if std::time::Instant::now() >= deadline {
                        return false;
                    }
                    thread::sleep(Duration::from_millis(5));
                }
                Err(error) => panic!("broker accept failed: {error}"),
            }
        }
    });
    let (control, _control_peer) = std::os::unix::net::UnixStream::pair().expect("control pair");
    let control_fd = control.as_raw_fd();

    let mut command = Command::new(env!("CARGO_BIN_EXE_agent-fabric-review-portal-supervisor"));
    command
        .arg(PORTAL_MODE)
        .env_clear()
        .env(REVIEW_SOCKET_ENV, &socket)
        .env(REVIEW_ACTION_ENV, "cursor/action-01")
        .env(
            REVIEW_CONTRACT_ENV,
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        );
    unsafe {
        command.pre_exec(move || {
            if libc_test::dup2(control_fd, 3) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("run helper with inherited FD 3");
    let output = wait_with_output_bounded(child, Duration::from_secs(2));
    let connected = broker.join().expect("broker completion");
    fs::remove_dir_all(&directory).expect("test cleanup");

    assert!(!output.status.success());
    assert!(
        !connected,
        "portal helper connected while control FD 3 was inherited"
    );
}

#[test]
fn malformed_request_closes_the_broker_socket_and_fails_closed_without_hanging() {
    let directory = socket_directory();
    fs::create_dir(&directory).expect("private test directory");
    let socket = directory.join("portal.sock");
    let listener = UnixListener::bind(&socket).expect("bind broker");
    let broker = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept helper");
        stream
            .set_read_timeout(Some(Duration::from_secs(1)))
            .expect("read timeout");
        let mut request = Vec::new();
        stream
            .read_to_end(&mut request)
            .map(|_| request)
            .map_err(|error| error.kind())
    });

    let started = std::time::Instant::now();
    let mut child = Command::new(env!("CARGO_BIN_EXE_agent-fabric-review-portal-supervisor"))
        .arg(PORTAL_MODE)
        .env_clear()
        .env(REVIEW_SOCKET_ENV, &socket)
        .env(REVIEW_ACTION_ENV, "cursor/action-01")
        .env(
            REVIEW_CONTRACT_ENV,
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn helper");
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(b"invalid\r\n")
        .expect("write malformed frame");

    let output = wait_with_output_bounded(child, Duration::from_secs(2));
    let broker_request = broker.join().expect("broker completion");
    fs::remove_dir_all(&directory).expect("test cleanup");

    assert!(!output.status.success());
    assert_eq!(broker_request, Ok(Vec::new()));
    assert!(started.elapsed() < Duration::from_millis(500));
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
