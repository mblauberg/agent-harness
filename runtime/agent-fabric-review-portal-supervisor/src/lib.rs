use std::ffi::OsString;
use std::fmt;
use std::io::{self, BufRead, BufReader, BufWriter, Read, Write};
#[cfg(unix)]
use std::os::unix::net::UnixStream;
use std::path::{Component, Path, PathBuf};
#[cfg(unix)]
use std::sync::mpsc;
#[cfg(unix)]
use std::thread;
use std::time::Duration;

pub const PORTAL_MODE: &str = "portal-stdio-v1";
pub const REVIEW_SOCKET_ENV: &str = "AGENT_FABRIC_REVIEW_SOCKET";
pub const REVIEW_ACTION_ENV: &str = "AGENT_FABRIC_REVIEW_ACTION";
pub const REVIEW_CONTRACT_ENV: &str = "AGENT_FABRIC_REVIEW_CONTRACT";
pub const MAX_LF_FRAME_BYTES: usize = 98_304;
pub const CONTROL_FD: std::os::raw::c_int = 3;
pub const TERMINATION_GRACE: Duration = Duration::from_millis(250);

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct PortalConfig {
    pub socket_path: PathBuf,
    pub action_locator: String,
    pub contract_locator: String,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum SupervisorError {
    InvalidInvocation(String),
}

impl fmt::Display for SupervisorError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInvocation(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for SupervisorError {}

#[derive(Debug)]
pub enum FrameError {
    Io(io::Error),
    FrameTooLarge,
    UnterminatedFrame,
    CarriageReturn,
}

impl fmt::Display for FrameError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "frame I/O failed: {error}"),
            Self::FrameTooLarge => formatter.write_str("LF frame exceeds the fixed byte ceiling"),
            Self::UnterminatedFrame => formatter.write_str("stream ended before the frame LF"),
            Self::CarriageReturn => formatter.write_str("LF frame contains a carriage return"),
        }
    }
}

impl std::error::Error for FrameError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<io::Error> for FrameError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

#[derive(Debug)]
pub enum PortalRunError {
    Io(io::Error),
    Frame(FrameError),
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct FileIdentity {
    pub device: u64,
    pub inode: u64,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum CustodyEntryKind {
    Socket,
    RegularFile,
}

#[derive(Debug)]
pub enum CustodyError {
    InvalidBasename,
    DirectoryIdentityMismatch,
    DirectoryNotPrivate,
    EntryIdentityMismatch,
    EntryTypeForbidden,
    Io(io::Error),
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct ProcessIdentity {
    pub process_id: i32,
    pub parent_process_id: i32,
    pub start_token: u64,
    pub process_group_id: i32,
    pub session_id: i32,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct PeerIdentity {
    pub effective_user_id: u32,
    pub effective_group_id: u32,
    pub process: ProcessIdentity,
    pub audit_token: Option<[u32; 8]>,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum CleanupTrigger {
    ControlEof,
    Deadline,
    Cancellation,
    ProviderExit,
    SupervisorExit,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum TerminationOutcome {
    Terminated,
    Killed,
}

#[derive(Debug)]
pub enum ProcessError {
    IdentityMismatch,
    AncestryMismatch,
    ProcessGroupNotIsolated,
    Io(io::Error),
}

impl fmt::Display for ProcessError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::IdentityMismatch => formatter.write_str("process identity changed"),
            Self::AncestryMismatch => formatter.write_str("process escaped the custody ancestry"),
            Self::ProcessGroupNotIsolated => {
                formatter.write_str("process group/session is not isolated")
            }
            Self::Io(error) => write!(formatter, "process custody failed: {error}"),
        }
    }
}

impl std::error::Error for ProcessError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<io::Error> for ProcessError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl fmt::Display for CustodyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidBasename => {
                formatter.write_str("custody entry name is not a relative basename")
            }
            Self::DirectoryIdentityMismatch => {
                formatter.write_str("custody directory identity changed")
            }
            Self::DirectoryNotPrivate => formatter.write_str("custody directory is not private"),
            Self::EntryIdentityMismatch => formatter.write_str("custody entry identity changed"),
            Self::EntryTypeForbidden => formatter.write_str("custody entry type is not removable"),
            Self::Io(error) => write!(formatter, "custody path inspection failed: {error}"),
        }
    }
}

impl std::error::Error for CustodyError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<io::Error> for CustodyError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl fmt::Display for PortalRunError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "portal transport failed: {error}"),
            Self::Frame(error) => write!(formatter, "portal framing failed: {error}"),
        }
    }
}

impl std::error::Error for PortalRunError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Frame(error) => Some(error),
        }
    }
}

impl From<io::Error> for PortalRunError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<FrameError> for PortalRunError {
    fn from(error: FrameError) -> Self {
        Self::Frame(error)
    }
}

/// Validates the fixed portal mode and its three locator environment values.
///
/// # Errors
///
/// Returns [`SupervisorError`] when argv or any locator violates the closed contract.
pub fn parse_portal_invocation(
    arguments: &[OsString],
    environment: &[(OsString, OsString)],
) -> Result<PortalConfig, SupervisorError> {
    if arguments != [OsString::from(PORTAL_MODE)] {
        return invalid("argv must be exactly portal-stdio-v1");
    }
    if environment.len() != 3 {
        return invalid("environment must contain exactly three locator values");
    }

    let socket = exact_environment_value(environment, REVIEW_SOCKET_ENV)?;
    let action = exact_environment_value(environment, REVIEW_ACTION_ENV)?;
    let contract = exact_environment_value(environment, REVIEW_CONTRACT_ENV)?;
    let socket_path = PathBuf::from(&socket);
    validate_socket_path(&socket_path)?;
    validate_action_locator(&action)?;
    validate_contract_locator(&contract)?;

    Ok(PortalConfig {
        socket_path,
        action_locator: action,
        contract_locator: contract,
    })
}

/// Verifies that portal mode cannot inherit the supervisor's private control descriptor.
///
/// # Errors
///
/// Returns [`SupervisorError`] when descriptor 3 is open or cannot be inspected.
pub fn require_portal_control_fd_closed() -> Result<(), SupervisorError> {
    match descriptor_flags(CONTROL_FD) {
        Ok(None) => Ok(()),
        Ok(Some(_)) => invalid("portal mode inherited the private supervisor control FD"),
        Err(error) => invalid(format!("cannot verify private control FD closure: {error}")),
    }
}

/// Marks the supervisor's private control descriptor close-on-exec and verifies the flag.
///
/// # Errors
///
/// Returns an I/O error when descriptor 3 is absent or the flag cannot be set and verified.
pub fn mark_control_fd_cloexec() -> io::Result<()> {
    let flags = descriptor_flags(CONTROL_FD)?.ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "private supervisor control FD 3 is absent",
        )
    })?;
    let result = unsafe_sys::set_descriptor_flags(CONTROL_FD, flags | unsafe_sys::FD_CLOEXEC);
    if result == -1 {
        return Err(io::Error::last_os_error());
    }
    let verified = descriptor_flags(CONTROL_FD)?.ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "private supervisor control FD 3 closed unexpectedly",
        )
    })?;
    if verified & unsafe_sys::FD_CLOEXEC == 0 {
        return Err(io::Error::other(
            "private supervisor control FD 3 is not CLOEXEC",
        ));
    }
    Ok(())
}

/// Validates an untrusted cleanup name as one bounded relative basename.
///
/// # Errors
///
/// Returns [`CustodyError::InvalidBasename`] for traversal or non-basename input.
pub fn validate_cleanup_basename(name: &str) -> Result<(), CustodyError> {
    let mut components = Path::new(name).components();
    let exactly_one_normal_component =
        matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
    if name.is_empty()
        || name.len() > 255
        || name.contains(['\0', '/', '\\'])
        || !exactly_one_normal_component
    {
        return Err(CustodyError::InvalidBasename);
    }
    Ok(())
}

#[cfg(unix)]
/// Inspects one custody entry after verifying its private parent directory identity.
///
/// # Errors
///
/// Returns [`CustodyError`] when the directory or entry identity, mode, owner, or type is unsafe.
pub fn inspect_custody_entry(
    directory: &Path,
    expected_directory: FileIdentity,
    basename: &str,
) -> Result<(FileIdentity, CustodyEntryKind), CustodyError> {
    use std::os::unix::fs::{FileTypeExt, MetadataExt};

    validate_cleanup_basename(basename)?;
    if !directory.is_absolute() || std::fs::canonicalize(directory)? != directory {
        return Err(CustodyError::DirectoryIdentityMismatch);
    }
    let directory_metadata = std::fs::symlink_metadata(directory)?;
    if !directory_metadata.file_type().is_dir() || directory_metadata.file_type().is_symlink() {
        return Err(CustodyError::DirectoryIdentityMismatch);
    }
    let actual_directory = FileIdentity {
        device: directory_metadata.dev(),
        inode: directory_metadata.ino(),
    };
    if actual_directory != expected_directory {
        return Err(CustodyError::DirectoryIdentityMismatch);
    }
    if directory_metadata.mode() & 0o077 != 0
        || directory_metadata.uid() != unsafe_sys::effective_user_id()
    {
        return Err(CustodyError::DirectoryNotPrivate);
    }

    let entry_metadata = std::fs::symlink_metadata(directory.join(basename))?;
    let file_type = entry_metadata.file_type();
    let kind = if file_type.is_socket() {
        CustodyEntryKind::Socket
    } else if file_type.is_file() && !file_type.is_symlink() {
        CustodyEntryKind::RegularFile
    } else {
        return Err(CustodyError::EntryTypeForbidden);
    };
    Ok((
        FileIdentity {
            device: entry_metadata.dev(),
            inode: entry_metadata.ino(),
        },
        kind,
    ))
}

#[cfg(unix)]
/// Removes one custody entry only when its recorded identity and kind still match.
///
/// # Errors
///
/// Returns [`CustodyError`] when any custody check fails or removal cannot complete.
pub fn remove_custody_entry(
    directory: &Path,
    expected_directory: FileIdentity,
    basename: &str,
    expected_entry: FileIdentity,
    expected_kind: CustodyEntryKind,
) -> Result<(), CustodyError> {
    let (actual_entry, actual_kind) =
        inspect_custody_entry(directory, expected_directory, basename)?;
    if actual_entry != expected_entry || actual_kind != expected_kind {
        return Err(CustodyError::EntryIdentityMismatch);
    }
    std::fs::remove_file(directory.join(basename))?;
    Ok(())
}

#[cfg(unix)]
/// Captures the stable process identity fields used by custody checks.
///
/// # Errors
///
/// Returns [`ProcessError`] when the process does not exist or its identity cannot be read.
pub fn observe_process(process_id: i32) -> Result<ProcessIdentity, ProcessError> {
    if process_id <= 0 {
        return Err(
            io::Error::new(io::ErrorKind::InvalidInput, "process ID is not positive").into(),
        );
    }
    let (start_token, parent_process_id, process_group_id, session_id) =
        process_identity_parts(process_id)?;
    Ok(ProcessIdentity {
        process_id,
        parent_process_id,
        start_token,
        process_group_id,
        session_id,
    })
}

#[cfg(unix)]
/// Re-reads a process and requires every recorded identity field to remain equal.
///
/// # Errors
///
/// Returns [`ProcessError::IdentityMismatch`] for drift or another [`ProcessError`] on inspection.
pub fn verify_process_identity(expected: ProcessIdentity) -> Result<(), ProcessError> {
    if observe_process(expected.process_id)? != expected {
        return Err(ProcessError::IdentityMismatch);
    }
    Ok(())
}

#[cfg(unix)]
/// Terminates an isolated process group, waits 250 ms, escalates if needed, and reaps its leader.
///
/// # Errors
///
/// Returns [`ProcessError`] if isolation or identity checks fail, signalling fails, or the group
/// remains alive after cleanup.
pub fn terminate_process_group_and_reap(
    expected: ProcessIdentity,
    _trigger: CleanupTrigger,
) -> Result<TerminationOutcome, ProcessError> {
    verify_process_identity(expected)?;
    if expected.process_id == unsafe_sys::current_process_id()
        || expected.parent_process_id != unsafe_sys::current_process_id()
        || expected.process_group_id != expected.process_id
        || expected.session_id != expected.process_id
    {
        return Err(ProcessError::ProcessGroupNotIsolated);
    }
    signal_group(expected.process_group_id, unsafe_sys::SIGTERM)?;
    let deadline = std::time::Instant::now() + TERMINATION_GRACE;
    while std::time::Instant::now() < deadline {
        thread::sleep(Duration::from_millis(5));
    }

    // This function is the verified child's sole reaper. Keeping its direct-child leader
    // unreaped during the grace period anchors both PID and process-group number, so escalation
    // cannot target a reused group if the leader exits before one of its descendants.
    signal_group_if_present(expected.process_group_id, unsafe_sys::SIGKILL)?;
    loop {
        match wait_for_child(expected.process_id, false)? {
            ChildWait::Reaped => break,
            ChildWait::Running => thread::yield_now(),
        }
    }
    let absence_deadline = std::time::Instant::now() + TERMINATION_GRACE;
    while unsafe_sys::process_group_exists(expected.process_group_id)? {
        if std::time::Instant::now() >= absence_deadline {
            return Err(io::Error::other("isolated process group survived SIGKILL").into());
        }
        thread::sleep(Duration::from_millis(5));
    }
    Ok(TerminationOutcome::Killed)
}

#[cfg(unix)]
/// Waits for control EOF, then performs bounded cleanup of the recorded process group.
///
/// # Errors
///
/// Returns [`ProcessError`] when the control stream or process cleanup fails.
pub fn cleanup_on_control_eof<R: Read>(
    mut control: R,
    expected: ProcessIdentity,
) -> Result<TerminationOutcome, ProcessError> {
    let mut buffer = [0_u8; 256];
    loop {
        match control.read(&mut buffer) {
            Ok(0) => {
                return terminate_process_group_and_reap(expected, CleanupTrigger::ControlEof);
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) => return Err(error.into()),
        }
    }
}

#[cfg(unix)]
/// Reads kernel-authenticated peer credentials and binds them to a process identity.
///
/// # Errors
///
/// Returns [`ProcessError`] when credentials or the peer process identity cannot be read.
pub fn observe_peer(stream: &UnixStream) -> Result<PeerIdentity, ProcessError> {
    use std::os::fd::AsRawFd;

    let (effective_user_id, effective_group_id, process_id, audit_token) =
        unsafe_sys::peer_credentials(stream.as_raw_fd())?;
    Ok(PeerIdentity {
        effective_user_id,
        effective_group_id,
        process: observe_process(process_id)?,
        audit_token,
    })
}

#[cfg(unix)]
/// Requires a process to remain a same-group, same-session descendant of its custody root.
///
/// # Errors
///
/// Returns [`ProcessError`] for identity drift, an ancestry escape, or inspection failure.
pub fn verify_process_within_custody(
    process: ProcessIdentity,
    custody_root: ProcessIdentity,
) -> Result<(), ProcessError> {
    verify_process_identity(process)?;
    verify_process_identity(custody_root)?;
    if process.process_group_id != custody_root.process_group_id
        || process.session_id != custody_root.session_id
    {
        return Err(ProcessError::AncestryMismatch);
    }
    let mut cursor = process;
    for _ in 0..64 {
        if cursor.parent_process_id == custody_root.process_id {
            return Ok(());
        }
        if cursor.parent_process_id <= 1 || cursor.parent_process_id == cursor.process_id {
            return Err(ProcessError::AncestryMismatch);
        }
        cursor = observe_process(cursor.parent_process_id)?;
    }
    Err(ProcessError::AncestryMismatch)
}

#[cfg(unix)]
#[derive(Debug, Clone, Copy, Eq, PartialEq)]
enum ChildWait {
    Running,
    Reaped,
}

#[cfg(unix)]
fn signal_group(process_group_id: i32, signal: i32) -> Result<(), ProcessError> {
    if unsafe_sys::signal_process_group(process_group_id, signal) == -1 {
        return Err(io::Error::last_os_error().into());
    }
    Ok(())
}

#[cfg(unix)]
fn signal_group_if_present(process_group_id: i32, signal: i32) -> Result<(), ProcessError> {
    if unsafe_sys::signal_process_group(process_group_id, signal) != -1 {
        return Ok(());
    }
    let error = io::Error::last_os_error();
    // Darwin reports EPERM for a process group whose only remaining member is the unreaped
    // zombie leader. The caller immediately reaps that exact child and still requires group
    // absence; a live inaccessible member therefore remains a hard failure.
    if matches!(
        error.raw_os_error(),
        Some(unsafe_sys::NO_SUCH_PROCESS | unsafe_sys::OPERATION_NOT_PERMITTED)
    ) {
        Ok(())
    } else {
        Err(error.into())
    }
}

#[cfg(unix)]
fn wait_for_child(process_id: i32, nonblocking: bool) -> Result<ChildWait, ProcessError> {
    loop {
        let result = unsafe_sys::wait_for_process(process_id, nonblocking);
        if result == process_id {
            return Ok(ChildWait::Reaped);
        }
        if result == 0 {
            return Ok(ChildWait::Running);
        }
        let error = io::Error::last_os_error();
        if error.raw_os_error() == Some(unsafe_sys::INTERRUPTED) {
            continue;
        }
        return Err(error.into());
    }
}

#[cfg(target_os = "macos")]
fn process_identity_parts(process_id: i32) -> Result<(u64, i32, i32, i32), ProcessError> {
    let info = unsafe_sys::darwin_process_info(process_id)?;
    let session_id = unsafe_sys::process_session_id(process_id)?;
    if info.process_id != u32::try_from(process_id).map_err(|_| ProcessError::IdentityMismatch)? {
        return Err(ProcessError::IdentityMismatch);
    }
    let start_token = info
        .start_seconds
        .checked_mul(1_000_000)
        .and_then(|seconds| seconds.checked_add(info.start_microseconds))
        .ok_or_else(|| io::Error::other("process start token overflow"))?;
    Ok((
        start_token,
        i32::try_from(info.parent_process_id)
            .map_err(|_| io::Error::other("parent process ID overflow"))?,
        i32::try_from(info.process_group_id)
            .map_err(|_| io::Error::other("process group ID overflow"))?,
        session_id,
    ))
}

#[cfg(target_os = "linux")]
fn process_identity_parts(process_id: i32) -> Result<(u64, i32, i32, i32), ProcessError> {
    let stat = std::fs::read_to_string(format!("/proc/{process_id}/stat"))?;
    let closing_name = stat
        .rfind(')')
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "invalid /proc stat"))?;
    let fields = stat[closing_name + 1..]
        .split_whitespace()
        .collect::<Vec<_>>();
    if fields.len() < 20 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "short /proc stat").into());
    }
    let parent_process_id = fields[1]
        .parse()
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid parent process"))?;
    let process_group_id = fields[2]
        .parse()
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid process group"))?;
    let session_id = fields[3]
        .parse()
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid process session"))?;
    let start_token = fields[19]
        .parse()
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid process start token"))?;
    Ok((start_token, parent_process_id, process_group_id, session_id))
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn process_identity_parts(_process_id: i32) -> Result<(u64, i32, i32, i32), ProcessError> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "process start identity is unavailable on this platform",
    )
    .into())
}

fn descriptor_flags(descriptor: std::os::raw::c_int) -> io::Result<Option<std::os::raw::c_int>> {
    let result = unsafe_sys::descriptor_flags(descriptor);
    if result != -1 {
        return Ok(Some(result));
    }
    let error = io::Error::last_os_error();
    if error.raw_os_error() == Some(unsafe_sys::BAD_FILE_DESCRIPTOR) {
        Ok(None)
    } else {
        Err(error)
    }
}

/// Reads one opaque LF-terminated frame without decoding its payload.
///
/// # Errors
///
/// Returns [`FrameError`] for I/O failure, CR bytes, oversized frames, or truncated input.
pub fn read_lf_frame<R: BufRead>(reader: &mut R) -> Result<Option<Vec<u8>>, FrameError> {
    let mut frame = Vec::new();
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            return if frame.is_empty() {
                Ok(None)
            } else {
                Err(FrameError::UnterminatedFrame)
            };
        }

        let newline = available.iter().position(|byte| *byte == b'\n');
        let consumed = newline.map_or(available.len(), |position| position + 1);
        if frame.len() + consumed > MAX_LF_FRAME_BYTES {
            return Err(FrameError::FrameTooLarge);
        }
        if available[..consumed].contains(&b'\r') {
            return Err(FrameError::CarriageReturn);
        }
        frame.extend_from_slice(&available[..consumed]);
        reader.consume(consumed);
        if newline.is_some() {
            return Ok(Some(frame));
        }
    }
}

#[cfg(unix)]
/// Connects once to the configured Unix socket and relays opaque LF frames bidirectionally.
///
/// # Errors
///
/// Returns [`PortalRunError`] when connection, framing, or relay I/O fails.
pub fn run_portal(config: &PortalConfig) -> Result<(), PortalRunError> {
    let stream = UnixStream::connect(&config.socket_path)?;
    let request_stream = stream.try_clone()?;
    let (request_result_sender, request_result_receiver) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let result = relay_requests(io::stdin(), request_stream);
        let _ = request_result_sender.send(result);
    });

    relay_responses(stream, io::stdout())?;
    match request_result_receiver.try_recv() {
        Ok(result) => result,
        Err(mpsc::TryRecvError::Empty | mpsc::TryRecvError::Disconnected) => Ok(()),
    }
}

#[cfg(not(unix))]
/// Rejects portal relay on platforms without the required Unix-socket implementation.
///
/// # Errors
///
/// Always returns [`PortalRunError`] because this contract requires AF_UNIX.
pub fn run_portal(_config: &PortalConfig) -> Result<(), PortalRunError> {
    Err(PortalRunError::Io(io::Error::new(
        io::ErrorKind::Unsupported,
        "AF_UNIX portal relay is unavailable on this platform",
    )))
}

#[cfg(unix)]
fn relay_requests<R: Read>(input: R, mut stream: UnixStream) -> Result<(), PortalRunError> {
    let mut reader = BufReader::new(input);
    loop {
        let frame = match read_lf_frame(&mut reader) {
            Ok(Some(frame)) => frame,
            Ok(None) => break,
            Err(error) => {
                let _ = stream.shutdown(std::net::Shutdown::Both);
                return Err(error.into());
            }
        };
        if let Err(error) = stream.write_all(&frame) {
            let _ = stream.shutdown(std::net::Shutdown::Both);
            return Err(error.into());
        }
    }
    stream.shutdown(std::net::Shutdown::Write)?;
    Ok(())
}

#[cfg(unix)]
fn relay_responses<W: Write>(stream: UnixStream, output: W) -> Result<(), PortalRunError> {
    let mut reader = BufReader::new(stream);
    let mut writer = BufWriter::new(output);
    while let Some(frame) = read_lf_frame(&mut reader)? {
        writer.write_all(&frame)?;
        writer.flush()?;
    }
    Ok(())
}

fn invalid<T>(message: impl Into<String>) -> Result<T, SupervisorError> {
    Err(SupervisorError::InvalidInvocation(message.into()))
}

fn exact_environment_value(
    environment: &[(OsString, OsString)],
    expected_name: &str,
) -> Result<String, SupervisorError> {
    let mut matches = environment
        .iter()
        .filter(|(name, _)| name == expected_name)
        .map(|(_, value)| value);
    let Some(value) = matches.next() else {
        return invalid(format!("missing locator environment {expected_name}"));
    };
    if matches.next().is_some() {
        return invalid(format!("duplicate locator environment {expected_name}"));
    }
    value
        .clone()
        .into_string()
        .map_err(|_| SupervisorError::InvalidInvocation(format!("{expected_name} is not UTF-8")))
}

fn validate_socket_path(path: &Path) -> Result<(), SupervisorError> {
    let value = path
        .to_str()
        .ok_or_else(|| SupervisorError::InvalidInvocation("socket path is not UTF-8".into()))?;
    if !path.is_absolute() || value.len() > 103 || value.contains('\0') {
        return invalid("socket locator is not a bounded absolute Unix-socket path");
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return invalid("socket locator contains traversal components");
    }
    Ok(())
}

fn validate_action_locator(value: &str) -> Result<(), SupervisorError> {
    if value.is_empty()
        || value.len() > 513
        || value.contains('\0')
        || !value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'/' | b'-')
        })
        || value.starts_with('/')
        || value.ends_with('/')
        || value.split('/').count() != 2
        || value.split('/').any(str::is_empty)
    {
        return invalid("action-pair locator is invalid");
    }
    Ok(())
}

fn validate_contract_locator(value: &str) -> Result<(), SupervisorError> {
    let Some(hex) = value.strip_prefix("sha256:") else {
        return invalid("contract locator is not a SHA-256 digest");
    };
    if hex.len() != 64
        || !hex
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return invalid("contract locator is not a lowercase SHA-256 digest");
    }
    Ok(())
}

#[allow(unsafe_code)]
mod unsafe_sys {
    use std::io;
    use std::os::raw::{c_int, c_uint};

    pub const BAD_FILE_DESCRIPTOR: c_int = 9;
    pub const FD_CLOEXEC: c_int = 1;
    pub const INTERRUPTED: c_int = 4;
    pub const NO_SUCH_PROCESS: c_int = 3;
    pub const OPERATION_NOT_PERMITTED: c_int = 1;
    pub const SIGKILL: c_int = 9;
    pub const SIGTERM: c_int = 15;
    const F_GETFD: c_int = 1;
    const F_SETFD: c_int = 2;
    const WNOHANG: c_int = 1;

    unsafe extern "C" {
        fn fcntl(descriptor: c_int, command: c_int, ...) -> c_int;
        fn geteuid() -> c_uint;
        fn getpid() -> c_int;
        fn getsid(process_id: c_int) -> c_int;
        fn kill(process_id: c_int, signal: c_int) -> c_int;
        fn waitpid(process_id: c_int, status: *mut c_int, options: c_int) -> c_int;
    }

    pub fn descriptor_flags(descriptor: c_int) -> c_int {
        // SAFETY: F_GETFD takes no variadic argument and does not dereference memory.
        unsafe { fcntl(descriptor, F_GETFD) }
    }

    pub fn set_descriptor_flags(descriptor: c_int, flags: c_int) -> c_int {
        // SAFETY: F_SETFD consumes one integer variadic argument and does not dereference memory.
        unsafe { fcntl(descriptor, F_SETFD, flags) }
    }

    pub fn effective_user_id() -> u32 {
        // SAFETY: geteuid takes no arguments and has no failure mode.
        unsafe { geteuid() }
    }

    pub fn current_process_id() -> i32 {
        // SAFETY: getpid takes no arguments and has no failure mode.
        unsafe { getpid() }
    }

    pub fn process_session_id(process_id: i32) -> io::Result<i32> {
        // SAFETY: getsid consumes one integer and does not dereference memory.
        let result = unsafe { getsid(process_id) };
        if result == -1 {
            Err(io::Error::last_os_error())
        } else {
            Ok(result)
        }
    }

    pub fn signal_process_group(process_group_id: i32, signal: i32) -> i32 {
        // SAFETY: a negative PID targets the named process group; caller validates isolation.
        unsafe { kill(-process_group_id, signal) }
    }

    pub fn process_group_exists(process_group_id: i32) -> io::Result<bool> {
        // SAFETY: signal zero probes existence without delivering a signal.
        let result = unsafe { kill(-process_group_id, 0) };
        if result == 0 {
            return Ok(true);
        }
        let error = io::Error::last_os_error();
        if error.raw_os_error() == Some(NO_SUCH_PROCESS) {
            Ok(false)
        } else {
            Err(error)
        }
    }

    pub fn wait_for_process(process_id: i32, nonblocking: bool) -> i32 {
        let mut status = 0;
        let options = if nonblocking { WNOHANG } else { 0 };
        // SAFETY: status points to valid writable storage for waitpid's duration.
        unsafe { waitpid(process_id, &raw mut status, options) }
    }

    #[cfg(target_os = "macos")]
    pub fn peer_credentials(descriptor: i32) -> io::Result<(u32, u32, i32, Option<[u32; 8]>)> {
        const SOL_LOCAL: c_int = 0;
        const LOCAL_PEERPID: c_int = 2;
        const LOCAL_PEERTOKEN: c_int = 6;
        let mut user_id = 0_u32;
        let mut group_id = 0_u32;
        // SAFETY: the two pointers name valid writable credential integers.
        if unsafe { getpeereid(descriptor, &raw mut user_id, &raw mut group_id) } == -1 {
            return Err(io::Error::last_os_error());
        }
        let process_id = socket_option::<c_int>(descriptor, SOL_LOCAL, LOCAL_PEERPID)?;
        let audit_token = socket_option::<[u32; 8]>(descriptor, SOL_LOCAL, LOCAL_PEERTOKEN)?;
        Ok((user_id, group_id, process_id, Some(audit_token)))
    }

    #[cfg(target_os = "linux")]
    pub fn peer_credentials(descriptor: i32) -> io::Result<(u32, u32, i32, Option<[u32; 8]>)> {
        const SOL_SOCKET: c_int = 1;
        const SO_PEERCRED: c_int = 17;
        #[repr(C)]
        #[derive(Clone, Copy)]
        struct UCred {
            process_id: c_int,
            user_id: u32,
            group_id: u32,
        }
        let credentials = socket_option::<UCred>(descriptor, SOL_SOCKET, SO_PEERCRED)?;
        Ok((
            credentials.user_id,
            credentials.group_id,
            credentials.process_id,
            None,
        ))
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    pub fn peer_credentials(_descriptor: i32) -> io::Result<(u32, u32, i32, Option<[u32; 8]>)> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "local peer credentials are unavailable on this platform",
        ))
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    fn socket_option<T: Copy>(descriptor: i32, level: i32, option: i32) -> io::Result<T> {
        let mut value = std::mem::MaybeUninit::<T>::zeroed();
        let mut length = u32::try_from(std::mem::size_of::<T>())
            .map_err(|_| io::Error::other("socket option size overflow"))?;
        // SAFETY: value and length point to correctly sized writable storage for getsockopt.
        let result = unsafe {
            getsockopt(
                descriptor,
                level,
                option,
                value.as_mut_ptr().cast(),
                &raw mut length,
            )
        };
        if result == -1 {
            return Err(io::Error::last_os_error());
        }
        if usize::try_from(length).ok() != Some(std::mem::size_of::<T>()) {
            return Err(io::Error::other(
                "socket option returned an unexpected size",
            ));
        }
        // SAFETY: getsockopt succeeded and reported the complete T-sized value.
        Ok(unsafe { value.assume_init() })
    }

    #[cfg(target_os = "macos")]
    #[derive(Debug, Clone, Copy)]
    pub struct DarwinProcessInfo {
        pub process_id: u32,
        pub parent_process_id: u32,
        pub process_group_id: u32,
        pub start_seconds: u64,
        pub start_microseconds: u64,
    }

    #[cfg(target_os = "macos")]
    #[repr(C)]
    struct ProcBsdInfo {
        flags: u32,
        status: u32,
        exit_status: u32,
        process_id: u32,
        parent_process_id: u32,
        user_id: u32,
        group_id: u32,
        real_user_id: u32,
        real_group_id: u32,
        saved_user_id: u32,
        saved_group_id: u32,
        reserved: u32,
        command: [std::os::raw::c_char; 16],
        name: [std::os::raw::c_char; 32],
        file_count: u32,
        process_group_id: u32,
        job_control_count: u32,
        controlling_device: u32,
        terminal_process_group_id: u32,
        nice: i32,
        start_seconds: u64,
        start_microseconds: u64,
    }

    #[cfg(target_os = "macos")]
    #[link(name = "proc")]
    unsafe extern "C" {
        fn proc_pidinfo(
            process_id: c_int,
            flavor: c_int,
            argument: u64,
            buffer: *mut std::os::raw::c_void,
            buffer_size: c_int,
        ) -> c_int;
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    unsafe extern "C" {
        fn getsockopt(
            descriptor: c_int,
            level: c_int,
            option: c_int,
            value: *mut std::os::raw::c_void,
            length: *mut u32,
        ) -> c_int;
    }

    #[cfg(target_os = "macos")]
    unsafe extern "C" {
        fn getpeereid(descriptor: c_int, user_id: *mut u32, group_id: *mut u32) -> c_int;
    }

    #[cfg(target_os = "macos")]
    pub fn darwin_process_info(process_id: i32) -> io::Result<DarwinProcessInfo> {
        const PROC_PIDTBSDINFO: c_int = 3;
        let mut info = std::mem::MaybeUninit::<ProcBsdInfo>::zeroed();
        let expected_size = std::mem::size_of::<ProcBsdInfo>();
        let buffer_size = c_int::try_from(expected_size)
            .map_err(|_| io::Error::other("process info size overflow"))?;
        // SAFETY: info is a correctly sized writable ProcBsdInfo buffer for proc_pidinfo.
        let read = unsafe {
            proc_pidinfo(
                process_id,
                PROC_PIDTBSDINFO,
                0,
                info.as_mut_ptr().cast(),
                buffer_size,
            )
        };
        if read != buffer_size {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: proc_pidinfo reported that it initialized the complete buffer.
        let info = unsafe { info.assume_init() };
        Ok(DarwinProcessInfo {
            process_id: info.process_id,
            parent_process_id: info.parent_process_id,
            process_group_id: info.process_group_id,
            start_seconds: info.start_seconds,
            start_microseconds: info.start_microseconds,
        })
    }
}
