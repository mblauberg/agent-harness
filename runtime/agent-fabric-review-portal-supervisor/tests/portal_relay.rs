#![cfg(unix)]
#![allow(unsafe_code)]

use std::fs;
use std::io::{Read, Write};
use std::os::fd::AsRawFd;
use std::os::unix::net::UnixListener;
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, Output, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use agent_fabric_review_portal_supervisor::{
    PORTAL_MODE, REVIEW_ACTION_ENV, REVIEW_CONTRACT_ENV, REVIEW_SOCKET_ENV,
};

static PORTAL_PROCESS_LOCK: Mutex<()> = Mutex::new(());

fn lock_portal_process() -> std::sync::MutexGuard<'static, ()> {
    PORTAL_PROCESS_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

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
    let _process_lock = lock_portal_process();
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
    let _process_lock = lock_portal_process();
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
fn rejects_any_inherited_non_stdio_fd_before_connecting_to_the_broker() {
    let _process_lock = lock_portal_process();
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
            if libc_test::dup2(control_fd, 127) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            libc_test::lower_descriptor_soft_limit(64)?;
            Ok(())
        });
    }
    let child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("run helper with inherited FD 127 above its soft limit");
    let output = wait_with_output_bounded(child, Duration::from_secs(2));
    let connected = broker.join().expect("broker completion");
    fs::remove_dir_all(&directory).expect("test cleanup");

    assert!(!output.status.success());
    assert!(
        !connected,
        "portal helper connected while non-stdio FD 127 was inherited above RLIMIT_NOFILE"
    );
}

#[test]
fn malformed_request_closes_the_broker_socket_and_fails_closed_without_hanging() {
    let _process_lock = lock_portal_process();
    let directory = socket_directory();
    fs::create_dir(&directory).expect("private test directory");
    let socket = directory.join("portal.sock");
    let listener = UnixListener::bind(&socket).expect("bind broker");
    listener.set_nonblocking(true).expect("nonblocking broker");
    let broker = thread::spawn(move || {
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        let mut stream = loop {
            match listener.accept() {
                Ok((stream, _)) => break Some(stream),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    if std::time::Instant::now() >= deadline {
                        break None;
                    }
                    thread::sleep(Duration::from_millis(5));
                }
                Err(error) => panic!("broker accept failed: {error}"),
            }
        };
        let Some(stream) = stream.as_mut() else {
            return (false, Ok(Vec::new()));
        };
        let mut request = Vec::new();
        let read_deadline = std::time::Instant::now() + Duration::from_secs(1);
        let result = loop {
            let mut buffer = [0_u8; 256];
            match stream.read(&mut buffer) {
                Ok(0) => break Ok(request),
                Ok(length) => request.extend_from_slice(&buffer[..length]),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    if std::time::Instant::now() >= read_deadline {
                        break Err(std::io::ErrorKind::TimedOut);
                    }
                    thread::sleep(Duration::from_millis(5));
                }
                Err(error) => break Err(error.kind()),
            }
        };
        (true, result)
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
    let (connected, broker_request) = broker.join().expect("broker completion");
    fs::remove_dir_all(&directory).expect("test cleanup");

    assert!(!output.status.success());
    assert!(
        connected,
        "malformed helper failed before broker connect: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(broker_request, Ok(Vec::new()));
    assert!(started.elapsed() < Duration::from_millis(500));
}

#[test]
fn malformed_request_failure_propagation_is_deterministic_under_repetition() {
    let _process_lock = lock_portal_process();
    for iteration in 0..64 {
        let directory = socket_directory();
        fs::create_dir(&directory).expect("private test directory");
        let socket = directory.join("portal.sock");
        let listener = UnixListener::bind(&socket).expect("bind broker");
        listener.set_nonblocking(true).expect("nonblocking broker");
        let broker = thread::spawn(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(2);
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break Some(stream),
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        if std::time::Instant::now() >= deadline {
                            break None;
                        }
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("broker accept failed: {error}"),
                }
            };
            let mut request = Vec::new();
            if let Some(stream) = stream.as_mut() {
                stream
                    .set_nonblocking(false)
                    .expect("blocking client stream");
                stream.read_to_end(&mut request).expect("broker EOF");
            }
            (stream.is_some(), request)
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
            .write_all(b"invalid\r\n")
            .expect("write malformed frame");
        let output = wait_with_output_bounded(child, Duration::from_secs(2));
        let (connected, broker_request) = broker.join().expect("broker completion");
        fs::remove_dir_all(&directory).expect("test cleanup");

        assert!(
            !output.status.success(),
            "iteration {iteration} returned success for a malformed request"
        );
        assert!(
            connected,
            "iteration {iteration} failed before broker connect: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(broker_request.is_empty());
    }
}

#[allow(unsafe_code)]
mod libc_test {
    #[repr(C)]
    struct ResourceLimit {
        current: u64,
        maximum: u64,
    }

    unsafe extern "C" {
        pub fn dup2(
            old_fd: std::os::raw::c_int,
            new_fd: std::os::raw::c_int,
        ) -> std::os::raw::c_int;
        fn getrlimit(
            resource: std::os::raw::c_int,
            limit: *mut ResourceLimit,
        ) -> std::os::raw::c_int;
        fn setrlimit(
            resource: std::os::raw::c_int,
            limit: *const ResourceLimit,
        ) -> std::os::raw::c_int;
    }

    pub unsafe fn lower_descriptor_soft_limit(current: u64) -> std::io::Result<()> {
        #[cfg(target_os = "macos")]
        const RLIMIT_NOFILE: std::os::raw::c_int = 8;
        #[cfg(not(target_os = "macos"))]
        const RLIMIT_NOFILE: std::os::raw::c_int = 7;

        let mut limit = ResourceLimit {
            current: 0,
            maximum: 0,
        };
        // SAFETY: the caller runs before exec in a single-threaded child and limit is writable.
        if unsafe { getrlimit(RLIMIT_NOFILE, &raw mut limit) } == -1 {
            return Err(std::io::Error::last_os_error());
        }
        limit.current = current;
        // SAFETY: limit is initialized and the caller intentionally changes only the child.
        if unsafe { setrlimit(RLIMIT_NOFILE, &raw const limit) } == -1 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }
}
