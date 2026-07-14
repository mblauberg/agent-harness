#![cfg(unix)]
#![allow(unsafe_code)]

use std::fs;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, RawFd};
use std::os::unix::net::{UnixListener, UnixStream};
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, mpsc};
use std::thread;
use std::time::{Duration, Instant};

use agent_fabric_review_portal_supervisor::{
    PORTAL_MODE, REVIEW_ACTION_ENV, REVIEW_CONTRACT_ENV, REVIEW_SOCKET_ENV,
};

static PORTAL_PROCESS_LOCK: Mutex<()> = Mutex::new(());
const INJECTED_DESCRIPTOR: RawFd = 127;
const INFRASTRUCTURE_TIMEOUT: Duration = Duration::from_secs(5);
const BROKER_TASK_TIMEOUT: Duration = Duration::from_secs(20);
const POLL_INTERVAL: Duration = Duration::from_millis(5);

#[derive(Clone, Copy)]
enum PortalDescriptorMode {
    Clean,
    Inject127 { source_fd: RawFd },
}

#[derive(Debug)]
struct PhaseError {
    phase: &'static str,
    detail: String,
}

impl PhaseError {
    fn new(phase: &'static str, detail: impl Into<String>) -> Self {
        Self {
            phase,
            detail: detail.into(),
        }
    }
}

impl std::fmt::Display for PhaseError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{} phase: {}", self.phase, self.detail)
    }
}

struct PortalFixture {
    directory: std::path::PathBuf,
    socket: std::path::PathBuf,
    listener: Option<UnixListener>,
}

impl PortalFixture {
    fn new(socket_name: &str) -> Self {
        let directory = socket_directory();
        fs::create_dir(&directory).expect("private test directory");
        let socket = directory.join(socket_name);
        let listener = (socket_name != "missing.sock")
            .then(|| UnixListener::bind(&socket).expect("bind broker"));
        Self {
            directory,
            socket,
            listener,
        }
    }

    fn take_listener(&mut self) -> UnixListener {
        let listener = self.listener.take().expect("fixture listener");
        listener.set_nonblocking(true).expect("nonblocking broker");
        listener
    }

    fn spawn(&self, mode: PortalDescriptorMode, configure: impl FnOnce(&mut Command)) -> Child {
        let mut command = portal_command(&self.socket, mode);
        configure(&mut command);
        command.spawn().expect("spawn portal helper")
    }
}

impl Drop for PortalFixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.directory).expect("test cleanup");
    }
}

struct BrokerTask<T> {
    result: mpsc::Receiver<Result<T, PhaseError>>,
    deadline: Instant,
}

impl<T: Send + 'static> BrokerTask<T> {
    fn spawn(
        deadline: Instant,
        operation: impl FnOnce() -> Result<T, PhaseError> + Send + 'static,
    ) -> Self {
        let (sender, result) = mpsc::channel();
        thread::spawn(move || {
            let _ = sender.send(operation());
        });
        Self { result, deadline }
    }

    fn receive(self) -> Result<T, PhaseError> {
        let remaining = self.deadline.saturating_duration_since(Instant::now());
        match self.result.recv_timeout(remaining) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => Err(PhaseError::new(
                "broker-task",
                "completion deadline exceeded",
            )),
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err(PhaseError::new("broker-task", "worker disconnected"))
            }
        }
    }
}

#[derive(Debug)]
struct ChildOutcome {
    output: Output,
    deadline_phase: Option<&'static str>,
}

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

fn inheritable_non_stdio_descriptors() -> std::io::Result<Vec<RawFd>> {
    let candidates = {
        let entries = fs::read_dir("/dev/fd")?;
        entries
            .map(|entry| {
                entry?
                    .file_name()
                    .into_string()
                    .map_err(|_| std::io::Error::other("descriptor name is not UTF-8"))?
                    .parse::<RawFd>()
                    .map_err(|_| std::io::Error::other("descriptor name is not numeric"))
            })
            .collect::<std::io::Result<Vec<_>>>()?
    };
    candidates
        .into_iter()
        .filter(|descriptor| *descriptor > 2)
        .filter_map(|descriptor| match libc_test::descriptor_flags(descriptor) {
            Ok(flags) if flags & libc_test::FD_CLOEXEC == 0 => Some(Ok(descriptor)),
            Ok(_) => None,
            Err(error) if error.raw_os_error() == Some(libc_test::BAD_DESCRIPTOR) => None,
            Err(error) => Some(Err(error)),
        })
        .collect()
}

fn portal_command(socket: &Path, mode: PortalDescriptorMode) -> Command {
    let baseline = inheritable_non_stdio_descriptors().expect("snapshot inherited descriptors");
    if let PortalDescriptorMode::Inject127 { source_fd } = mode {
        assert_ne!(source_fd, INJECTED_DESCRIPTOR);
    }
    let mut command = Command::new(env!("CARGO_BIN_EXE_agent-fabric-review-portal-supervisor"));
    command
        .arg(PORTAL_MODE)
        .env_clear()
        .env(REVIEW_SOCKET_ENV, socket)
        .env(REVIEW_ACTION_ENV, "cursor/action-01")
        .env(
            REVIEW_CONTRACT_ENV,
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        );
    unsafe {
        command.pre_exec(move || {
            let injected_source = match mode {
                PortalDescriptorMode::Clean => None,
                PortalDescriptorMode::Inject127 { source_fd } => Some(source_fd),
            };
            for descriptor in baseline
                .iter()
                .copied()
                .filter(|descriptor| Some(*descriptor) != injected_source)
            {
                libc_test::close_if_open(descriptor)?;
            }
            if let PortalDescriptorMode::Inject127 { source_fd } = mode {
                if libc_test::dup2(source_fd, INJECTED_DESCRIPTOR) == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                if source_fd > 2 {
                    libc_test::close_if_open(source_fd)?;
                }
                libc_test::lower_descriptor_soft_limit(64)?;
            }
            Ok(())
        });
    }
    command
}

fn infrastructure_deadline() -> Instant {
    Instant::now() + INFRASTRUCTURE_TIMEOUT
}

fn accept_bounded(listener: &UnixListener, deadline: Instant) -> Result<UnixStream, PhaseError> {
    loop {
        if Instant::now() >= deadline {
            return Err(PhaseError::new("broker-accept", "deadline exceeded"));
        }
        match listener.accept() {
            Ok((stream, _)) => {
                stream
                    .set_nonblocking(true)
                    .map_err(|error| PhaseError::new("broker-accept", error.to_string()))?;
                return Ok(stream);
            }
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted
                ) =>
            {
                if Instant::now() >= deadline {
                    return Err(PhaseError::new("broker-accept", "deadline exceeded"));
                }
                thread::sleep(POLL_INTERVAL);
            }
            Err(error) => return Err(PhaseError::new("broker-accept", error.to_string())),
        }
    }
}

fn read_lf_frame_bounded(
    stream: &mut UnixStream,
    deadline: Instant,
) -> Result<Vec<u8>, PhaseError> {
    let mut frame = Vec::new();
    loop {
        if Instant::now() >= deadline {
            return Err(PhaseError::new("broker-read", "deadline exceeded"));
        }
        let mut byte = [0_u8; 1];
        match stream.read(&mut byte) {
            Ok(0) => {
                return Err(PhaseError::new(
                    "broker-read",
                    "peer closed before LF frame",
                ));
            }
            Ok(_) => {
                frame.push(byte[0]);
                if byte[0] == b'\n' {
                    return Ok(frame);
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted
                ) =>
            {
                if Instant::now() >= deadline {
                    return Err(PhaseError::new("broker-read", "deadline exceeded"));
                }
                thread::sleep(POLL_INTERVAL);
            }
            Err(error) => return Err(PhaseError::new("broker-read", error.to_string())),
        }
    }
}

fn read_to_end_bounded(stream: &mut UnixStream, deadline: Instant) -> Result<Vec<u8>, PhaseError> {
    let mut bytes = Vec::new();
    loop {
        if Instant::now() >= deadline {
            return Err(PhaseError::new("broker-read", "deadline exceeded"));
        }
        let mut buffer = [0_u8; 256];
        match stream.read(&mut buffer) {
            Ok(0) => return Ok(bytes),
            Ok(length) => bytes.extend_from_slice(&buffer[..length]),
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted
                ) =>
            {
                if Instant::now() >= deadline {
                    return Err(PhaseError::new("broker-read", "deadline exceeded"));
                }
                thread::sleep(POLL_INTERVAL);
            }
            Err(error) => return Err(PhaseError::new("broker-read", error.to_string())),
        }
    }
}

fn write_all_bounded(
    stream: &mut UnixStream,
    mut bytes: &[u8],
    deadline: Instant,
) -> Result<(), PhaseError> {
    while !bytes.is_empty() {
        if Instant::now() >= deadline {
            return Err(PhaseError::new("broker-write", "deadline exceeded"));
        }
        match stream.write(bytes) {
            Ok(0) => return Err(PhaseError::new("broker-write", "zero-length write")),
            Ok(length) => bytes = &bytes[length..],
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted
                ) =>
            {
                if Instant::now() >= deadline {
                    return Err(PhaseError::new("broker-write", "deadline exceeded"));
                }
                thread::sleep(POLL_INTERVAL);
            }
            Err(error) => return Err(PhaseError::new("broker-write", error.to_string())),
        }
    }
    Ok(())
}

fn drain_available(
    reader: &mut impl Read,
    bytes: &mut Vec<u8>,
    phase: &'static str,
) -> Result<bool, PhaseError> {
    let mut buffer = [0_u8; 8192];
    match reader.read(&mut buffer) {
        Ok(0) => Ok(true),
        Ok(length) => {
            bytes.extend_from_slice(&buffer[..length]);
            Ok(false)
        }
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted
            ) =>
        {
            Ok(false)
        }
        Err(error) => Err(PhaseError::new(phase, error.to_string())),
    }
}

fn poll_child_output(
    child: &mut Child,
    stdout: &mut Option<std::process::ChildStdout>,
    stderr: &mut Option<std::process::ChildStderr>,
    stdout_bytes: &mut Vec<u8>,
    stderr_bytes: &mut Vec<u8>,
) -> Result<(Option<ExitStatus>, bool, bool), PhaseError> {
    let stdout_eof = match stdout {
        Some(reader) => drain_available(reader, stdout_bytes, "child-stdout-drain")?,
        None => true,
    };
    let stderr_eof = match stderr {
        Some(reader) => drain_available(reader, stderr_bytes, "child-stderr-drain")?,
        None => true,
    };
    let status = child
        .try_wait()
        .map_err(|error| PhaseError::new("child-reap", error.to_string()))?;
    Ok((status, stdout_eof, stderr_eof))
}

fn collect_child_output_bounded(
    mut child: Child,
    runtime_deadline: Instant,
) -> Result<ChildOutcome, PhaseError> {
    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();
    if let Some(reader) = &stdout {
        libc_test::mark_nonblocking(reader.as_raw_fd())
            .map_err(|error| PhaseError::new("child-stdout-drain", error.to_string()))?;
    }
    if let Some(reader) = &stderr {
        libc_test::mark_nonblocking(reader.as_raw_fd())
            .map_err(|error| PhaseError::new("child-stderr-drain", error.to_string()))?;
    }
    let mut stdout_bytes = Vec::new();
    let mut stderr_bytes = Vec::new();
    let mut deadline_phase = None;
    let mut status = None;

    loop {
        let (polled_status, stdout_eof, stderr_eof) = poll_child_output(
            &mut child,
            &mut stdout,
            &mut stderr,
            &mut stdout_bytes,
            &mut stderr_bytes,
        )?;
        status = status.or(polled_status);
        if let Some(exit_status) = status
            && stdout_eof
            && stderr_eof
        {
            return Ok(ChildOutcome {
                output: Output {
                    status: exit_status,
                    stdout: stdout_bytes,
                    stderr: stderr_bytes,
                },
                deadline_phase,
            });
        }
        if Instant::now() >= runtime_deadline {
            deadline_phase = Some("child-runtime-deadline");
            if status.is_none() {
                child
                    .kill()
                    .map_err(|error| PhaseError::new("child-terminate", error.to_string()))?;
            }
            break;
        }
        thread::sleep(POLL_INTERVAL);
    }

    let reap_deadline = infrastructure_deadline();
    while status.is_none() {
        let (polled_status, _, _) = poll_child_output(
            &mut child,
            &mut stdout,
            &mut stderr,
            &mut stdout_bytes,
            &mut stderr_bytes,
        )?;
        status = polled_status;
        if status.is_none() && Instant::now() >= reap_deadline {
            return Err(PhaseError::new("child-reap", "deadline exceeded"));
        }
        thread::sleep(POLL_INTERVAL);
    }

    let drain_deadline = infrastructure_deadline();
    loop {
        let (_, stdout_eof, stderr_eof) = poll_child_output(
            &mut child,
            &mut stdout,
            &mut stderr,
            &mut stdout_bytes,
            &mut stderr_bytes,
        )?;
        if stdout_eof && stderr_eof {
            return Ok(ChildOutcome {
                output: Output {
                    status: status.expect("reaped child status"),
                    stdout: stdout_bytes,
                    stderr: stderr_bytes,
                },
                deadline_phase,
            });
        }
        if Instant::now() >= drain_deadline {
            return Err(PhaseError::new(
                "child-output-drain",
                format!(
                    "deadline exceeded; partial stdout={:?}; partial stderr={:?}",
                    String::from_utf8_lossy(&stdout_bytes),
                    String::from_utf8_lossy(&stderr_bytes)
                ),
            ));
        }
        thread::sleep(POLL_INTERVAL);
    }
}

fn finish_with_broker<T: Send + 'static>(
    child: Child,
    broker: BrokerTask<T>,
) -> Result<(ChildOutcome, T), String> {
    let child = collect_child_output_bounded(child, infrastructure_deadline())
        .map_err(|error| error.to_string())?;
    let broker = broker.receive().map_err(|error| {
        format!(
            "{error}; helper stderr: {}",
            String::from_utf8_lossy(&child.output.stderr)
        )
    })?;
    Ok((child, broker))
}

#[test]
fn connects_once_and_relays_byte_exact_lf_frames_between_stdio_and_the_broker() {
    let _process_lock = lock_portal_process();
    let mut fixture = PortalFixture::new("portal.sock");
    let listener = fixture.take_listener();
    let broker = BrokerTask::spawn(Instant::now() + BROKER_TASK_TIMEOUT, move || {
        let mut stream = accept_bounded(&listener, infrastructure_deadline())?;
        let request = read_lf_frame_bounded(&mut stream, infrastructure_deadline())?;
        if request != b"\xffopaque-request\n" {
            return Err(PhaseError::new(
                "broker-read",
                format!("unexpected request {request:?}"),
            ));
        }
        write_all_bounded(
            &mut stream,
            b"\xfeopaque-response\n",
            infrastructure_deadline(),
        )?;
        Ok(())
    });

    let mut child = fixture.spawn(PortalDescriptorMode::Clean, |command| {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
    });
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(b"\xffopaque-request\n")
        .expect("write request");

    let (outcome, ()) = finish_with_broker(child, broker).expect("fixture completion");
    let ChildOutcome {
        output,
        deadline_phase,
    } = outcome;

    assert_eq!(deadline_phase, None);
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
    let fixture = PortalFixture::new("missing.sock");
    let started = Instant::now();
    let child = fixture.spawn(PortalDescriptorMode::Clean, |command| {
        command.stdout(Stdio::piped()).stderr(Stdio::piped());
    });
    let outcome = collect_child_output_bounded(child, infrastructure_deadline())
        .expect("bounded helper output");
    let ChildOutcome {
        output,
        deadline_phase,
    } = outcome;

    assert_eq!(deadline_phase, None);
    assert!(!output.status.success());
    assert!(started.elapsed() < Duration::from_secs(1));
    assert!(
        !String::from_utf8_lossy(&output.stderr)
            .contains(fixture.socket.to_string_lossy().as_ref())
    );
}

#[test]
fn rejects_any_inherited_non_stdio_fd_before_connecting_to_the_broker() {
    let _process_lock = lock_portal_process();
    let mut fixture = PortalFixture::new("portal.sock");
    let listener = fixture.take_listener();
    let broker =
        BrokerTask::spawn(
            Instant::now() + BROKER_TASK_TIMEOUT,
            move || match accept_bounded(&listener, infrastructure_deadline()) {
                Ok(_) => Ok(true),
                Err(error)
                    if error.phase == "broker-accept" && error.detail == "deadline exceeded" =>
                {
                    Ok(false)
                }
                Err(error) => Err(error),
            },
        );
    let (control, _control_peer) = std::os::unix::net::UnixStream::pair().expect("control pair");
    let control_fd = control.as_raw_fd();

    let child = fixture.spawn(
        PortalDescriptorMode::Inject127 {
            source_fd: control_fd,
        },
        |command| {
            command.stdout(Stdio::piped()).stderr(Stdio::piped());
        },
    );
    let (outcome, connected) = finish_with_broker(child, broker).expect("fixture completion");
    let ChildOutcome {
        output,
        deadline_phase,
    } = outcome;

    assert_eq!(deadline_phase, None);
    assert!(!output.status.success());
    assert!(
        !connected,
        "portal helper connected while non-stdio FD 127 was inherited above RLIMIT_NOFILE"
    );
    assert_eq!(
        output.stderr,
        b"review portal helper failed closed: portal mode inherited non-stdio descriptor 127\n"
    );
}

#[test]
fn broker_accept_deadline_reports_helper_stderr() {
    let _process_lock = lock_portal_process();
    let mut fixture = PortalFixture::new("portal.sock");
    let listener = fixture.take_listener();
    let broker = BrokerTask::spawn(Instant::now() + BROKER_TASK_TIMEOUT, move || {
        accept_bounded(&listener, infrastructure_deadline()).map(|_| ())
    });
    let (control, _control_peer) = UnixStream::pair().expect("control pair");
    let child = fixture.spawn(
        PortalDescriptorMode::Inject127 {
            source_fd: control.as_raw_fd(),
        },
        |command| {
            command.stdout(Stdio::piped()).stderr(Stdio::piped());
        },
    );

    let error = finish_with_broker(child, broker).expect_err("accept deadline must fail");

    assert!(error.contains("broker-accept phase: deadline exceeded"));
    assert!(error.contains(
        "review portal helper failed closed: portal mode inherited non-stdio descriptor 127"
    ));
}

#[test]
fn broker_read_deadline_rejects_a_connected_stalled_peer() {
    let _process_lock = lock_portal_process();
    let mut fixture = PortalFixture::new("portal.sock");
    let listener = fixture.take_listener();
    let broker = BrokerTask::spawn(Instant::now() + BROKER_TASK_TIMEOUT, move || {
        let mut stream = accept_bounded(&listener, infrastructure_deadline())?;
        read_lf_frame_bounded(&mut stream, infrastructure_deadline()).map(|_| ())
    });
    let mut stalled_peer = UnixStream::connect(&fixture.socket).expect("connect stalled peer");
    stalled_peer
        .write_all(b"partial-without-lf")
        .expect("write incomplete request");

    let error = broker.receive().expect_err("read deadline must fail");

    assert_eq!(error.phase, "broker-read");
    assert_eq!(error.detail, "deadline exceeded");
}

#[test]
fn child_deadline_kills_reaps_and_preserves_partial_output() {
    let _process_lock = lock_portal_process();
    let mut command = Command::new("/bin/sh");
    command
        .arg("-c")
        .arg("printf partial-stdout; printf partial-stderr >&2; exec sleep 30")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = command.spawn().expect("spawn live test helper");

    let outcome = collect_child_output_bounded(child, infrastructure_deadline())
        .expect("bounded child cleanup");

    assert_eq!(outcome.deadline_phase, Some("child-runtime-deadline"));
    assert!(!outcome.output.status.success());
    assert_eq!(outcome.output.stdout, b"partial-stdout");
    assert_eq!(outcome.output.stderr, b"partial-stderr");
}

#[test]
fn malformed_request_closes_the_broker_socket_and_fails_closed_without_hanging() {
    let _process_lock = lock_portal_process();
    let mut fixture = PortalFixture::new("portal.sock");
    let listener = fixture.take_listener();
    let broker = BrokerTask::spawn(Instant::now() + BROKER_TASK_TIMEOUT, move || {
        let mut stream = accept_bounded(&listener, infrastructure_deadline())?;
        let request = read_to_end_bounded(&mut stream, infrastructure_deadline())?;
        Ok(request)
    });

    let started = Instant::now();
    let mut child = fixture.spawn(PortalDescriptorMode::Clean, |command| {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
    });
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(b"invalid\r\n")
        .expect("write malformed frame");

    let (outcome, broker_request) = finish_with_broker(child, broker).expect("fixture completion");
    let ChildOutcome {
        output,
        deadline_phase,
    } = outcome;

    assert_eq!(deadline_phase, None);
    assert!(!output.status.success());
    assert!(broker_request.is_empty());
    assert!(started.elapsed() < Duration::from_millis(500));
}

#[test]
fn malformed_request_failure_propagation_is_deterministic_under_repetition() {
    let _process_lock = lock_portal_process();
    for iteration in 0..64 {
        let mut fixture = PortalFixture::new("portal.sock");
        let listener = fixture.take_listener();
        let broker = BrokerTask::spawn(Instant::now() + BROKER_TASK_TIMEOUT, move || {
            let mut stream = accept_bounded(&listener, infrastructure_deadline())?;
            read_to_end_bounded(&mut stream, infrastructure_deadline())
        });

        let mut child = fixture.spawn(PortalDescriptorMode::Clean, |command| {
            command
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
        });
        child
            .stdin
            .take()
            .expect("stdin")
            .write_all(b"invalid\r\n")
            .expect("write malformed frame");
        let (outcome, broker_request) = finish_with_broker(child, broker)
            .unwrap_or_else(|error| panic!("iteration {iteration}: {error}"));
        let ChildOutcome {
            output,
            deadline_phase,
        } = outcome;

        assert_eq!(deadline_phase, None);
        assert!(
            !output.status.success(),
            "iteration {iteration} returned success for a malformed request"
        );
        assert!(broker_request.is_empty());
    }
}

#[test]
fn immediate_broker_eof_never_masks_a_malformed_request() {
    let _process_lock = lock_portal_process();
    let mut delivered_inputs = 0;
    for iteration in 0..500 {
        let mut fixture = PortalFixture::new("portal.sock");
        let listener = fixture.take_listener();
        let broker = BrokerTask::spawn(Instant::now() + BROKER_TASK_TIMEOUT, move || {
            let _stream = accept_bounded(&listener, infrastructure_deadline())?;
            Ok(())
        });

        let mut child = fixture.spawn(PortalDescriptorMode::Clean, |command| {
            command
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
        });
        if child
            .stdin
            .take()
            .expect("stdin")
            .write_all(b"invalid\r\n")
            .is_ok()
        {
            delivered_inputs += 1;
        }
        let (outcome, ()) = finish_with_broker(child, broker)
            .unwrap_or_else(|error| panic!("iteration {iteration}: {error}"));
        let ChildOutcome {
            output,
            deadline_phase,
        } = outcome;

        assert_eq!(deadline_phase, None);
        assert!(
            !output.status.success(),
            "iteration {iteration} returned success after immediate broker EOF"
        );
    }
    assert!(
        delivered_inputs >= 450,
        "too few malformed inputs reached stdin"
    );
}

#[allow(unsafe_code)]
mod libc_test {
    pub const BAD_DESCRIPTOR: std::os::raw::c_int = 9;
    pub const FD_CLOEXEC: std::os::raw::c_int = 1;
    const F_GETFD: std::os::raw::c_int = 1;
    const F_GETFL: std::os::raw::c_int = 3;
    const F_SETFL: std::os::raw::c_int = 4;
    #[cfg(target_os = "macos")]
    const O_NONBLOCK: std::os::raw::c_int = 0x0004;
    #[cfg(not(target_os = "macos"))]
    const O_NONBLOCK: std::os::raw::c_int = 0x0800;

    #[repr(C)]
    struct ResourceLimit {
        current: u64,
        maximum: u64,
    }

    unsafe extern "C" {
        fn close(descriptor: std::os::raw::c_int) -> std::os::raw::c_int;
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
        fn fcntl(
            descriptor: std::os::raw::c_int,
            command: std::os::raw::c_int,
            ...
        ) -> std::os::raw::c_int;
    }

    pub fn descriptor_flags(descriptor: std::os::raw::c_int) -> std::io::Result<i32> {
        // SAFETY: F_GETFD consumes no variadic argument and does not dereference memory.
        let flags = unsafe { fcntl(descriptor, F_GETFD) };
        if flags == -1 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(flags)
        }
    }

    pub fn mark_nonblocking(descriptor: std::os::raw::c_int) -> std::io::Result<()> {
        // SAFETY: F_GETFL consumes no variadic argument and does not dereference memory.
        let flags = unsafe { fcntl(descriptor, F_GETFL) };
        if flags == -1 {
            return Err(std::io::Error::last_os_error());
        }
        // SAFETY: F_SETFL consumes one integer variadic argument and does not dereference memory.
        if unsafe { fcntl(descriptor, F_SETFL, flags | O_NONBLOCK) } == -1 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }

    pub fn close_if_open(descriptor: std::os::raw::c_int) -> std::io::Result<()> {
        // SAFETY: close consumes only the integer descriptor.
        if unsafe { close(descriptor) } == -1 {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() != Some(BAD_DESCRIPTOR) {
                return Err(error);
            }
        }
        Ok(())
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
