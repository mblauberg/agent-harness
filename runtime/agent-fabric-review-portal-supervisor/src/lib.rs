use std::ffi::OsString;
use std::fmt;
use std::io::{self, BufRead, BufReader, BufWriter, Read, Write};
#[cfg(unix)]
use std::os::unix::net::UnixStream;
use std::path::{Component, Path, PathBuf};
#[cfg(unix)]
use std::sync::Arc;
#[cfg(unix)]
use std::sync::atomic::{AtomicBool, Ordering};
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
pub const REAP_DEADLINE: Duration = Duration::from_millis(250);
pub const CUSTODY_CLAIM_NAME_CODEC: &str = "agent-fabric-custody-claim-v1";

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

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct CustodyEntry {
    pub identity: FileIdentity,
    pub kind: CustodyEntryKind,
    pub digest: [u8; 32],
    pub link_count: u64,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum CustodyRemovalPhase {
    Canonical,
    Claimed,
    Removed,
    IntegrityFailure,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct CustodyRemovalRequest<'path> {
    pub canonical_directory: &'path Path,
    pub expected_canonical_directory: FileIdentity,
    pub claim_directory: &'path Path,
    pub expected_claim_directory: FileIdentity,
    pub canonical_basename: &'path str,
    pub persisted_claim_basename: &'path str,
    pub expected_entry: CustodyEntry,
    pub persisted_phase: CustodyRemovalPhase,
}

#[derive(Debug)]
pub enum CustodyError {
    InvalidBasename,
    DirectoryIdentityMismatch,
    DirectoryNotPrivate,
    ClaimDirectoryNotDistinct,
    ClaimDirectoryCrossDevice,
    ClaimBasenameMismatch,
    PhasePresenceMismatch,
    PersistedIntegrityFailure,
    EntryIdentityMismatch,
    EntryDigestMismatch,
    EntryLinkCountMismatch,
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
    pub process_id_version: Option<u32>,
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

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct TerminationEvidence {
    pub trigger: CleanupTrigger,
    pub outcome: TerminationOutcome,
}

#[derive(Debug)]
pub enum ProcessError {
    IdentityMismatch,
    AncestryMismatch,
    AuditTokenMismatch,
    ProcessGroupNotIsolated,
    ReapDeadlineExceeded,
    ProcessGroupSurvivedTermination,
    Io(io::Error),
}

impl fmt::Display for ProcessError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::IdentityMismatch => formatter.write_str("process identity changed"),
            Self::AncestryMismatch => formatter.write_str("process escaped the custody ancestry"),
            Self::AuditTokenMismatch => {
                formatter.write_str("Darwin audit token does not match the observed peer")
            }
            Self::ProcessGroupNotIsolated => {
                formatter.write_str("process group/session is not isolated")
            }
            Self::ReapDeadlineExceeded => {
                formatter.write_str("verified child was not reaped before the fixed deadline")
            }
            Self::ProcessGroupSurvivedTermination => {
                formatter.write_str("isolated process group survived bounded termination")
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
            Self::ClaimDirectoryNotDistinct => {
                formatter.write_str("custody claim directory is not a distinct trusted namespace")
            }
            Self::ClaimDirectoryCrossDevice => formatter
                .write_str("custody source and claim directories are on different filesystems"),
            Self::ClaimBasenameMismatch => {
                formatter.write_str("persisted custody claim basename does not match v1 derivation")
            }
            Self::PhasePresenceMismatch => formatter
                .write_str("persisted custody phase does not match canonical/claim presence"),
            Self::PersistedIntegrityFailure => {
                formatter.write_str("custody removal is terminally integrity-failed")
            }
            Self::EntryIdentityMismatch => formatter.write_str("custody entry identity changed"),
            Self::EntryDigestMismatch => formatter.write_str("custody entry digest changed"),
            Self::EntryLinkCountMismatch => {
                formatter.write_str("custody entry is not a singleton hard link")
            }
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

/// Verifies that portal mode inherited no descriptors beyond standard input/output/error.
///
/// # Errors
///
/// Returns [`SupervisorError`] when any descriptor above 2 is open or inspection fails.
pub fn require_portal_descriptors_closed() -> Result<(), SupervisorError> {
    // Collect first, then drop ReadDir before checking. `/dev/fd` includes its own transient scan
    // descriptor; after the iterator closes, that candidate reads EBADF while every inherited
    // descriptor remains observable, including one above a subsequently lowered RLIMIT_NOFILE.
    let descriptors = {
        let entries = std::fs::read_dir("/dev/fd").map_err(|error| {
            SupervisorError::InvalidInvocation(format!(
                "cannot enumerate portal descriptors: {error}"
            ))
        })?;
        entries
            .map(|entry| {
                let entry = entry.map_err(|error| {
                    SupervisorError::InvalidInvocation(format!(
                        "cannot enumerate a portal descriptor: {error}"
                    ))
                })?;
                entry
                    .file_name()
                    .into_string()
                    .map_err(|_| {
                        SupervisorError::InvalidInvocation(
                            "portal descriptor name is not UTF-8".into(),
                        )
                    })?
                    .parse::<i32>()
                    .map_err(|_| {
                        SupervisorError::InvalidInvocation(
                            "portal descriptor namespace contained a non-numeric entry".into(),
                        )
                    })
            })
            .collect::<Result<Vec<_>, _>>()?
    };
    for descriptor in descriptors.into_iter().filter(|descriptor| *descriptor > 2) {
        match descriptor_flags(descriptor) {
            Ok(None) => {}
            Ok(Some(_)) => {
                return invalid(format!(
                    "portal mode inherited non-stdio descriptor {descriptor}"
                ));
            }
            Err(error) => {
                return invalid(format!(
                    "cannot verify portal descriptor {descriptor} closure: {error}"
                ));
            }
        }
    }
    Ok(())
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
/// Returns [`CustodyError`] when the directory or entry identity, mode, owner, singleton link count,
/// or type is unsafe.
pub fn inspect_custody_entry(
    directory: &Path,
    expected_directory: FileIdentity,
    basename: &str,
) -> Result<CustodyEntry, CustodyError> {
    validate_cleanup_basename(basename)?;
    let directory = open_private_custody_directory(directory, expected_directory)?;
    inspect_custody_entry_at(&directory, basename)
}

#[cfg(unix)]
/// Derives the persisted v1 claim basename for one exact canonical entry.
///
/// # Errors
///
/// Returns [`CustodyError::InvalidBasename`] when the canonical name is not one relative basename.
pub fn derive_custody_claim_basename(
    basename: &str,
    expected_entry: CustodyEntry,
) -> Result<String, CustodyError> {
    validate_cleanup_basename(basename)?;
    let basename = custody_basename_c_string(basename)?;
    custody_claim_basename(&basename, expected_entry)
        .into_string()
        .map_err(|_| CustodyError::InvalidBasename)
}

#[cfg(unix)]
/// Advances one exact custody entry by at most one durable removal phase.
///
/// The caller must persist the claim-directory path and identity for crash recovery and keep that
/// namespace outside the authority of every process able to mutate the canonical directory. It
/// must also persist the exact v1 claim basename and each returned phase before calling again.
/// `Canonical` atomically claims (or recovers an exact claim), fsyncs both directories and returns
/// `Claimed`; `Claimed` removes (or confirms a completed removal), fsyncs the claim directory and
/// returns `Removed`. `Removed` is idempotent only while both names remain absent. A
/// presence/phase mismatch is an integrity failure, not inferred progress, and `IntegrityFailure`
/// is terminal. The expected and every observed entry must have link count one, preventing a
/// provider-retained hard-link alias from being misreported as removed.
///
/// # Errors
///
/// Returns [`CustodyError`] when any custody check fails, the persisted phase disagrees with path
/// presence, the directories cannot support one atomic rename, or the requested transition cannot
/// complete. After a phase/presence or post-claim verification failure, the caller must durably
/// record `IntegrityFailure` rather than infer a later phase.
pub fn advance_custody_removal(
    request: CustodyRemovalRequest<'_>,
) -> Result<CustodyRemovalPhase, CustodyError> {
    use std::os::fd::AsRawFd;

    let CustodyRemovalRequest {
        canonical_directory: directory,
        expected_canonical_directory: expected_directory,
        claim_directory,
        expected_claim_directory,
        canonical_basename: basename,
        persisted_claim_basename,
        expected_entry,
        persisted_phase,
    } = request;
    validate_cleanup_basename(basename)?;
    validate_cleanup_basename(persisted_claim_basename)?;
    if expected_directory == expected_claim_directory {
        return Err(CustodyError::ClaimDirectoryNotDistinct);
    }
    require_same_custody_filesystem(expected_directory, expected_claim_directory)?;
    let directory = open_private_custody_directory(directory, expected_directory)?;
    let claim_directory =
        open_private_custody_directory(claim_directory, expected_claim_directory)?;
    let basename_c = custody_basename_c_string(basename)?;
    let claim_basename = custody_claim_basename(&basename_c, expected_entry);
    let basename = basename_c
        .to_str()
        .map_err(|_| CustodyError::InvalidBasename)?;
    let claim_name = claim_basename
        .to_str()
        .map_err(|_| CustodyError::InvalidBasename)?;
    if persisted_claim_basename != claim_name || persisted_claim_basename == basename {
        return Err(CustodyError::ClaimBasenameMismatch);
    }

    if persisted_phase == CustodyRemovalPhase::IntegrityFailure {
        return Err(CustodyError::PersistedIntegrityFailure);
    }

    let presence = custody_removal_presence(&directory, basename, &claim_directory, claim_name)?;
    match persisted_phase {
        CustodyRemovalPhase::Canonical => {
            match (presence.canonical, presence.claimed) {
                (Some(canonical), None) => {
                    require_expected_custody_entry(canonical, expected_entry)?;
                    // The raced source namespace chooses which inode reaches this atomic
                    // transition. Validate again only after it reaches the trusted namespace.
                    unsafe_sys::rename_entry_no_replace_at(
                        directory.as_raw_fd(),
                        &basename_c,
                        claim_directory.as_raw_fd(),
                        &claim_basename,
                    )?;
                }
                (None, Some(claimed_entry)) => {
                    require_expected_custody_entry(claimed_entry, expected_entry)?;
                }
                _ => return Err(CustodyError::PhasePresenceMismatch),
            }
            let claimed_presence =
                custody_removal_presence(&directory, basename, &claim_directory, claim_name)?;
            let (None, Some(claimed_entry)) =
                (claimed_presence.canonical, claimed_presence.claimed)
            else {
                return Err(CustodyError::PhasePresenceMismatch);
            };
            require_expected_custody_entry(claimed_entry, expected_entry)?;
            directory.sync_all()?;
            claim_directory.sync_all()?;
            Ok(CustodyRemovalPhase::Claimed)
        }
        CustodyRemovalPhase::Claimed => match (presence.canonical, presence.claimed) {
            (None, Some(claimed_entry)) => {
                require_expected_custody_entry(claimed_entry, expected_entry)?;
                unsafe_sys::unlink_entry_at(claim_directory.as_raw_fd(), &claim_basename)?;
                let removed_presence =
                    custody_removal_presence(&directory, basename, &claim_directory, claim_name)?;
                if removed_presence.canonical.is_some() || removed_presence.claimed.is_some() {
                    return Err(CustodyError::PhasePresenceMismatch);
                }
                claim_directory.sync_all()?;
                Ok(CustodyRemovalPhase::Removed)
            }
            (None, None) => {
                claim_directory.sync_all()?;
                Ok(CustodyRemovalPhase::Removed)
            }
            _ => Err(CustodyError::PhasePresenceMismatch),
        },
        CustodyRemovalPhase::Removed => {
            if presence.canonical.is_some() || presence.claimed.is_some() {
                return Err(CustodyError::PhasePresenceMismatch);
            }
            Ok(CustodyRemovalPhase::Removed)
        }
        CustodyRemovalPhase::IntegrityFailure => unreachable!("handled before path inspection"),
    }
}

#[cfg(unix)]
#[derive(Debug, Clone, Copy, Eq, PartialEq)]
struct CustodyRemovalPresence {
    canonical: Option<CustodyEntry>,
    claimed: Option<CustodyEntry>,
}

#[cfg(unix)]
fn custody_removal_presence(
    directory: &std::fs::File,
    basename: &str,
    claim_directory: &std::fs::File,
    claim_name: &str,
) -> Result<CustodyRemovalPresence, CustodyError> {
    Ok(CustodyRemovalPresence {
        canonical: inspect_optional_custody_entry(directory, basename)?,
        claimed: inspect_optional_custody_entry(claim_directory, claim_name)?,
    })
}

#[cfg(unix)]
fn inspect_optional_custody_entry(
    directory: &std::fs::File,
    basename: &str,
) -> Result<Option<CustodyEntry>, CustodyError> {
    match inspect_custody_entry_at(directory, basename) {
        Ok(entry) => Ok(Some(entry)),
        Err(error) if custody_entry_is_absent(&error) => Ok(None),
        Err(error) => Err(error),
    }
}

#[cfg(unix)]
fn require_same_custody_filesystem(
    directory: FileIdentity,
    claim_directory: FileIdentity,
) -> Result<(), CustodyError> {
    if directory.device != claim_directory.device {
        return Err(CustodyError::ClaimDirectoryCrossDevice);
    }
    Ok(())
}

#[cfg(unix)]
fn custody_entry_is_absent(error: &CustodyError) -> bool {
    matches!(error, CustodyError::Io(error) if error.kind() == io::ErrorKind::NotFound)
}

#[cfg(unix)]
fn require_expected_custody_entry(
    actual: CustodyEntry,
    expected: CustodyEntry,
) -> Result<(), CustodyError> {
    if actual.identity != expected.identity || actual.kind != expected.kind {
        return Err(CustodyError::EntryIdentityMismatch);
    }
    if actual.digest != expected.digest {
        return Err(CustodyError::EntryDigestMismatch);
    }
    if actual.link_count != 1
        || expected.link_count != 1
        || actual.link_count != expected.link_count
    {
        return Err(CustodyError::EntryLinkCountMismatch);
    }
    Ok(())
}

#[cfg(unix)]
fn custody_claim_basename(
    basename: &std::ffi::CStr,
    expected_entry: CustodyEntry,
) -> std::ffi::CString {
    use std::fmt::Write as _;

    let mut claim_material = Vec::with_capacity(128);
    claim_material.extend_from_slice(CUSTODY_CLAIM_NAME_CODEC.as_bytes());
    claim_material.push(0);
    claim_material.extend_from_slice(basename.to_bytes());
    claim_material.extend_from_slice(&expected_entry.identity.device.to_be_bytes());
    claim_material.extend_from_slice(&expected_entry.identity.inode.to_be_bytes());
    claim_material.push(match expected_entry.kind {
        CustodyEntryKind::Socket => 0,
        CustodyEntryKind::RegularFile => 1,
    });
    claim_material.extend_from_slice(&expected_entry.digest);
    let digest = sha256_bytes(&claim_material);
    let mut claim = String::from(".agent-fabric-claim-");
    for byte in digest {
        write!(&mut claim, "{byte:02x}").expect("writing to a String cannot fail");
    }
    std::ffi::CString::new(claim).expect("claim name is fixed lowercase ASCII")
}

#[cfg(unix)]
fn open_private_custody_directory(
    directory: &Path,
    expected_directory: FileIdentity,
) -> Result<std::fs::File, CustodyError> {
    use std::os::fd::AsRawFd;
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::MetadataExt;

    let mut components = directory.components();
    if !directory.is_absolute() || !matches!(components.next(), Some(Component::RootDir)) {
        return Err(CustodyError::DirectoryIdentityMismatch);
    }
    let mut current = unsafe_sys::open_root_directory()?;
    for component in components {
        let Component::Normal(component) = component else {
            return Err(CustodyError::DirectoryIdentityMismatch);
        };
        let component = std::ffi::CString::new(component.as_bytes())
            .map_err(|_| CustodyError::DirectoryIdentityMismatch)?;
        current = unsafe_sys::open_directory_at(current.as_raw_fd(), &component)?;
    }
    let metadata = current.metadata()?;
    let identity = FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    };
    if !metadata.file_type().is_dir() || identity != expected_directory {
        return Err(CustodyError::DirectoryIdentityMismatch);
    }
    if metadata.mode() & 0o077 != 0 || metadata.uid() != unsafe_sys::effective_user_id() {
        return Err(CustodyError::DirectoryNotPrivate);
    }
    Ok(current)
}

#[cfg(unix)]
fn custody_basename_c_string(basename: &str) -> Result<std::ffi::CString, CustodyError> {
    std::ffi::CString::new(basename.as_bytes()).map_err(|_| CustodyError::InvalidBasename)
}

#[cfg(unix)]
fn inspect_custody_entry_at(
    directory: &std::fs::File,
    basename: &str,
) -> Result<CustodyEntry, CustodyError> {
    use std::os::fd::AsRawFd;
    use std::os::unix::fs::MetadataExt;

    let basename = custody_basename_c_string(basename)?;
    let status = unsafe_sys::entry_status_at(directory.as_raw_fd(), &basename)?;
    let (identity, kind) = entry_identity_and_kind(status)?;
    if status.user_id != unsafe_sys::effective_user_id() {
        return Err(CustodyError::DirectoryNotPrivate);
    }
    if status.hard_links != 1 {
        return Err(CustodyError::EntryLinkCountMismatch);
    }
    let digest = match kind {
        CustodyEntryKind::Socket => socket_identity_digest(identity),
        CustodyEntryKind::RegularFile => {
            let mut file = unsafe_sys::open_regular_entry_at(directory.as_raw_fd(), &basename)?;
            let metadata = file.metadata()?;
            if (FileIdentity {
                device: metadata.dev(),
                inode: metadata.ino(),
            }) != identity
                || metadata.mode() & unsafe_sys::FILE_TYPE_MASK != unsafe_sys::REGULAR_FILE_TYPE
                || metadata.nlink() != status.hard_links
            {
                return Err(CustodyError::EntryIdentityMismatch);
            }
            let digest = sha256_reader(&mut file)?;
            let final_metadata = file.metadata()?;
            if (FileIdentity {
                device: final_metadata.dev(),
                inode: final_metadata.ino(),
            }) != identity
                || final_metadata.len() != metadata.len()
                || final_metadata.mtime() != metadata.mtime()
                || final_metadata.mtime_nsec() != metadata.mtime_nsec()
                || final_metadata.nlink() != metadata.nlink()
            {
                return Err(CustodyError::EntryIdentityMismatch);
            }
            digest
        }
    };
    Ok(CustodyEntry {
        identity,
        kind,
        digest,
        link_count: status.hard_links,
    })
}

#[cfg(unix)]
fn entry_identity_and_kind(
    status: unsafe_sys::EntryStatus,
) -> Result<(FileIdentity, CustodyEntryKind), CustodyError> {
    let kind = match status.mode & unsafe_sys::FILE_TYPE_MASK {
        unsafe_sys::SOCKET_FILE_TYPE => CustodyEntryKind::Socket,
        unsafe_sys::REGULAR_FILE_TYPE => CustodyEntryKind::RegularFile,
        _ => return Err(CustodyError::EntryTypeForbidden),
    };
    Ok((
        FileIdentity {
            device: status.device,
            inode: status.inode,
        },
        kind,
    ))
}

#[cfg(unix)]
fn socket_identity_digest(identity: FileIdentity) -> [u8; 32] {
    let mut input = Vec::with_capacity(58);
    input.extend_from_slice(b"agent-fabric-custody-socket-v1\0");
    input.extend_from_slice(&identity.device.to_be_bytes());
    input.extend_from_slice(&identity.inode.to_be_bytes());
    sha256_bytes(&input)
}

fn sha256_reader<R: Read>(reader: &mut R) -> io::Result<[u8; 32]> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => return hasher.finalize(),
            Ok(length) => hasher.update(&buffer[..length])?,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) => return Err(error),
        }
    }
}

fn sha256_bytes(bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher
        .update(bytes)
        .expect("in-memory SHA-256 input length is bounded");
    hasher
        .finalize()
        .expect("in-memory SHA-256 bit length is bounded")
}

struct Sha256 {
    state: [u32; 8],
    block: [u8; 64],
    block_length: usize,
    byte_length: u64,
}

impl Sha256 {
    const fn new() -> Self {
        Self {
            state: [
                0x6a09_e667,
                0xbb67_ae85,
                0x3c6e_f372,
                0xa54f_f53a,
                0x510e_527f,
                0x9b05_688c,
                0x1f83_d9ab,
                0x5be0_cd19,
            ],
            block: [0; 64],
            block_length: 0,
            byte_length: 0,
        }
    }

    fn update(&mut self, mut bytes: &[u8]) -> io::Result<()> {
        self.byte_length = self
            .byte_length
            .checked_add(
                u64::try_from(bytes.len())
                    .map_err(|_| io::Error::other("SHA-256 input length overflow"))?,
            )
            .ok_or_else(|| io::Error::other("SHA-256 input length overflow"))?;
        while !bytes.is_empty() {
            let available = 64 - self.block_length;
            let consumed = available.min(bytes.len());
            self.block[self.block_length..self.block_length + consumed]
                .copy_from_slice(&bytes[..consumed]);
            self.block_length += consumed;
            bytes = &bytes[consumed..];
            if self.block_length == 64 {
                let block = self.block;
                sha256_compress(&mut self.state, &block);
                self.block_length = 0;
            }
        }
        Ok(())
    }

    fn finalize(mut self) -> io::Result<[u8; 32]> {
        let bit_length = self
            .byte_length
            .checked_mul(8)
            .ok_or_else(|| io::Error::other("SHA-256 bit length overflow"))?;
        self.block[self.block_length] = 0x80;
        self.block_length += 1;
        if self.block_length > 56 {
            self.block[self.block_length..].fill(0);
            let block = self.block;
            sha256_compress(&mut self.state, &block);
            self.block = [0; 64];
            self.block_length = 0;
        }
        self.block[self.block_length..56].fill(0);
        self.block[56..].copy_from_slice(&bit_length.to_be_bytes());
        let block = self.block;
        sha256_compress(&mut self.state, &block);

        let mut digest = [0_u8; 32];
        for (chunk, word) in digest.chunks_exact_mut(4).zip(self.state) {
            chunk.copy_from_slice(&word.to_be_bytes());
        }
        Ok(digest)
    }
}

const SHA256_ROUND_CONSTANTS: [u32; 64] = [
    0x428a_2f98,
    0x7137_4491,
    0xb5c0_fbcf,
    0xe9b5_dba5,
    0x3956_c25b,
    0x59f1_11f1,
    0x923f_82a4,
    0xab1c_5ed5,
    0xd807_aa98,
    0x1283_5b01,
    0x2431_85be,
    0x550c_7dc3,
    0x72be_5d74,
    0x80de_b1fe,
    0x9bdc_06a7,
    0xc19b_f174,
    0xe49b_69c1,
    0xefbe_4786,
    0x0fc1_9dc6,
    0x240c_a1cc,
    0x2de9_2c6f,
    0x4a74_84aa,
    0x5cb0_a9dc,
    0x76f9_88da,
    0x983e_5152,
    0xa831_c66d,
    0xb003_27c8,
    0xbf59_7fc7,
    0xc6e0_0bf3,
    0xd5a7_9147,
    0x06ca_6351,
    0x1429_2967,
    0x27b7_0a85,
    0x2e1b_2138,
    0x4d2c_6dfc,
    0x5338_0d13,
    0x650a_7354,
    0x766a_0abb,
    0x81c2_c92e,
    0x9272_2c85,
    0xa2bf_e8a1,
    0xa81a_664b,
    0xc24b_8b70,
    0xc76c_51a3,
    0xd192_e819,
    0xd699_0624,
    0xf40e_3585,
    0x106a_a070,
    0x19a4_c116,
    0x1e37_6c08,
    0x2748_774c,
    0x34b0_bcb5,
    0x391c_0cb3,
    0x4ed8_aa4a,
    0x5b9c_ca4f,
    0x682e_6ff3,
    0x748f_82ee,
    0x78a5_636f,
    0x84c8_7814,
    0x8cc7_0208,
    0x90be_fffa,
    0xa450_6ceb,
    0xbef9_a3f7,
    0xc671_78f2,
];

fn sha256_compress(state: &mut [u32; 8], block: &[u8; 64]) {
    let mut schedule = [0_u32; 64];
    for (index, chunk) in block.chunks_exact(4).enumerate() {
        schedule[index] = u32::from_be_bytes(
            chunk
                .try_into()
                .expect("SHA-256 message schedule chunk is four bytes"),
        );
    }
    for index in 16..64 {
        let small_zero = schedule[index - 15].rotate_right(7)
            ^ schedule[index - 15].rotate_right(18)
            ^ (schedule[index - 15] >> 3);
        let small_one = schedule[index - 2].rotate_right(17)
            ^ schedule[index - 2].rotate_right(19)
            ^ (schedule[index - 2] >> 10);
        schedule[index] = schedule[index - 16]
            .wrapping_add(small_zero)
            .wrapping_add(schedule[index - 7])
            .wrapping_add(small_one);
    }

    let mut working = *state;
    for index in 0..64 {
        let big_one =
            working[4].rotate_right(6) ^ working[4].rotate_right(11) ^ working[4].rotate_right(25);
        let choice = (working[4] & working[5]) ^ ((!working[4]) & working[6]);
        let temporary_one = working[7]
            .wrapping_add(big_one)
            .wrapping_add(choice)
            .wrapping_add(SHA256_ROUND_CONSTANTS[index])
            .wrapping_add(schedule[index]);
        let big_zero =
            working[0].rotate_right(2) ^ working[0].rotate_right(13) ^ working[0].rotate_right(22);
        let majority =
            (working[0] & working[1]) ^ (working[0] & working[2]) ^ (working[1] & working[2]);
        let temporary_two = big_zero.wrapping_add(majority);
        working = [
            temporary_one.wrapping_add(temporary_two),
            working[0],
            working[1],
            working[2],
            working[3].wrapping_add(temporary_one),
            working[4],
            working[5],
            working[6],
        ];
    }
    for (target, value) in state.iter_mut().zip(working) {
        *target = target.wrapping_add(value);
    }
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
    trigger: CleanupTrigger,
) -> Result<TerminationEvidence, ProcessError> {
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
        if unsafe_sys::child_exited_without_reaping(expected.process_id)?
            && !process_group_has_other_members(expected.process_group_id, expected.process_id)?
        {
            reap_before_deadline(
                expected.process_id,
                std::time::Instant::now() + REAP_DEADLINE,
            )?;
            require_group_absent_before_deadline(
                expected.process_group_id,
                std::time::Instant::now() + REAP_DEADLINE,
            )?;
            return Ok(TerminationEvidence {
                trigger,
                outcome: TerminationOutcome::Terminated,
            });
        }
        thread::sleep(Duration::from_millis(5));
    }

    // This function is the verified child's sole reaper. Keeping its direct-child leader
    // unreaped during the grace period anchors both PID and process-group number, so escalation
    // cannot target a reused group if the leader exits before one of its descendants.
    signal_group_if_present(expected.process_group_id, unsafe_sys::SIGKILL)?;
    reap_before_deadline(
        expected.process_id,
        std::time::Instant::now() + REAP_DEADLINE,
    )?;
    require_group_absent_before_deadline(
        expected.process_group_id,
        std::time::Instant::now() + REAP_DEADLINE,
    )?;
    Ok(TerminationEvidence {
        trigger,
        outcome: TerminationOutcome::Killed,
    })
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
) -> Result<TerminationEvidence, ProcessError> {
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
    let process_id_version = peer_process_id_version(
        audit_token,
        effective_user_id,
        effective_group_id,
        process_id,
    )?;
    let process = observe_process(process_id)?;
    verify_peer_generation(audit_token)?;
    Ok(PeerIdentity {
        effective_user_id,
        effective_group_id,
        process,
        audit_token,
        process_id_version,
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

#[cfg(unix)]
fn reap_before_deadline(process_id: i32, deadline: std::time::Instant) -> Result<(), ProcessError> {
    reap_with_deadline(deadline, || wait_for_child(process_id, true))
}

#[cfg(unix)]
fn reap_with_deadline<F>(deadline: std::time::Instant, mut poll: F) -> Result<(), ProcessError>
where
    F: FnMut() -> Result<ChildWait, ProcessError>,
{
    loop {
        match poll()? {
            ChildWait::Reaped => return Ok(()),
            ChildWait::Running if std::time::Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(5));
            }
            ChildWait::Running => return Err(ProcessError::ReapDeadlineExceeded),
        }
    }
}

#[cfg(unix)]
fn require_group_absent_before_deadline(
    process_group_id: i32,
    deadline: std::time::Instant,
) -> Result<(), ProcessError> {
    while unsafe_sys::process_group_exists(process_group_id)? {
        if std::time::Instant::now() >= deadline {
            return Err(ProcessError::ProcessGroupSurvivedTermination);
        }
        thread::sleep(Duration::from_millis(5));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn process_group_has_other_members(
    process_group_id: i32,
    leader_process_id: i32,
) -> Result<bool, ProcessError> {
    Ok(unsafe_sys::process_group_members(process_group_id)?
        .into_iter()
        .any(|process_id| process_id != leader_process_id))
}

#[cfg(target_os = "linux")]
fn process_group_has_other_members(
    process_group_id: i32,
    leader_process_id: i32,
) -> Result<bool, ProcessError> {
    for entry in std::fs::read_dir("/proc")? {
        let entry = entry?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Ok(process_id) = name.parse::<i32>() else {
            continue;
        };
        if process_id == leader_process_id {
            continue;
        }
        match process_identity_parts(process_id) {
            Ok((_, _, candidate_group_id, _)) if candidate_group_id == process_group_id => {
                return Ok(true);
            }
            Ok(_) => {}
            Err(ProcessError::Io(error))
                if matches!(
                    error.kind(),
                    io::ErrorKind::NotFound | io::ErrorKind::PermissionDenied
                ) => {}
            Err(error) => return Err(error),
        }
    }
    Ok(false)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn process_group_has_other_members(
    _process_group_id: i32,
    _leader_process_id: i32,
) -> Result<bool, ProcessError> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "process-group membership inspection is unavailable on this platform",
    )
    .into())
}

#[cfg(target_os = "macos")]
/// Validates the stable fields carried by a Darwin kernel audit token.
///
/// # Errors
///
/// Returns [`ProcessError::AuditTokenMismatch`] when any field differs or the PID generation is
/// zero.
pub fn validate_darwin_audit_token_fields(
    audit_token: [u32; 8],
    effective_user_id: u32,
    effective_group_id: u32,
    process_id: i32,
) -> Result<u32, ProcessError> {
    let fields = unsafe_sys::darwin_audit_token_fields(audit_token);
    if fields.effective_user_id != effective_user_id
        || fields.effective_group_id != effective_group_id
        || fields.process_id != process_id
        || fields.process_id_version == 0
    {
        return Err(ProcessError::AuditTokenMismatch);
    }
    Ok(fields.process_id_version)
}

#[cfg(target_os = "macos")]
/// Requires a Darwin audit token to still name its live, exact PID generation.
///
/// # Errors
///
/// Returns [`ProcessError::AuditTokenMismatch`] when the generation no longer exists.
pub fn validate_darwin_peer_generation(audit_token: [u32; 8]) -> Result<(), ProcessError> {
    unsafe_sys::validate_live_darwin_audit_token(audit_token)
        .map_err(|_| ProcessError::AuditTokenMismatch)
}

#[cfg(target_os = "macos")]
fn peer_process_id_version(
    audit_token: Option<[u32; 8]>,
    effective_user_id: u32,
    effective_group_id: u32,
    process_id: i32,
) -> Result<Option<u32>, ProcessError> {
    let audit_token = audit_token.ok_or(ProcessError::AuditTokenMismatch)?;
    validate_darwin_peer_generation(audit_token)?;
    validate_darwin_audit_token_fields(
        audit_token,
        effective_user_id,
        effective_group_id,
        process_id,
    )
    .map(Some)
}

#[cfg(not(target_os = "macos"))]
fn peer_process_id_version(
    audit_token: Option<[u32; 8]>,
    _effective_user_id: u32,
    _effective_group_id: u32,
    _process_id: i32,
) -> Result<Option<u32>, ProcessError> {
    if audit_token.is_some() {
        return Err(ProcessError::AuditTokenMismatch);
    }
    Ok(None)
}

#[cfg(target_os = "macos")]
fn verify_peer_generation(audit_token: Option<[u32; 8]>) -> Result<(), ProcessError> {
    validate_darwin_peer_generation(audit_token.ok_or(ProcessError::AuditTokenMismatch)?)
}

#[cfg(not(target_os = "macos"))]
fn verify_peer_generation(audit_token: Option<[u32; 8]>) -> Result<(), ProcessError> {
    if audit_token.is_some() {
        return Err(ProcessError::AuditTokenMismatch);
    }
    Ok(())
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
    unsafe_sys::mark_descriptor_nonblocking(0)?;
    request_stream.set_write_timeout(Some(REAP_DEADLINE))?;
    let stop_requests = Arc::new(AtomicBool::new(false));
    let request_thread_stop = Arc::clone(&stop_requests);
    let request_thread = thread::Builder::new()
        .name("review-portal-request-relay".into())
        .spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                relay_requests_nonblocking(io::stdin(), &request_stream, &request_thread_stop)
            }))
            .unwrap_or_else(|_| {
                Err(PortalRunError::Io(io::Error::other(
                    "request relay panicked",
                )))
            });
            if result.is_err() {
                // Wake the response owner only after the request thread owns its terminal result.
                // The owner always joins below, so an independent broker EOF cannot mask it.
                let _ = request_stream.shutdown(std::net::Shutdown::Both);
            }
            result
        })?;

    let response_result = relay_responses(stream, io::stdout());
    stop_requests.store(true, Ordering::Release);
    let request_result = request_thread.join().map_err(|_| {
        PortalRunError::Io(io::Error::other(
            "request relay terminated without evidence",
        ))
    })?;
    request_result?;
    response_result
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
fn relay_requests_nonblocking<R: Read>(
    mut input: R,
    mut stream: &UnixStream,
    stop: &AtomicBool,
) -> Result<(), PortalRunError> {
    let mut frame = Vec::new();
    let mut input_buffer = [0_u8; 8192];
    loop {
        match input.read(&mut input_buffer) {
            Ok(0) => {
                if !frame.is_empty() {
                    return Err(FrameError::UnterminatedFrame.into());
                }
                if !stop.load(Ordering::Acquire) {
                    stream.shutdown(std::net::Shutdown::Write)?;
                }
                return Ok(());
            }
            Ok(length) => {
                for byte in &input_buffer[..length] {
                    if *byte == b'\r' {
                        return Err(FrameError::CarriageReturn.into());
                    }
                    if frame.len() == MAX_LF_FRAME_BYTES {
                        return Err(FrameError::FrameTooLarge.into());
                    }
                    frame.push(*byte);
                    if *byte == b'\n' {
                        stream.write_all(&frame)?;
                        frame.clear();
                    }
                }
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                if stop.load(Ordering::Acquire) {
                    return if frame.is_empty() {
                        Ok(())
                    } else {
                        Err(FrameError::UnterminatedFrame.into())
                    };
                }
                thread::sleep(Duration::from_millis(1));
            }
            Err(error) => return Err(error.into()),
        }
    }
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
    use std::ffi::CStr;
    use std::fs::File;
    use std::io;
    use std::os::fd::FromRawFd;
    use std::os::raw::{c_int, c_uint};

    pub const BAD_FILE_DESCRIPTOR: c_int = 9;
    pub const FD_CLOEXEC: c_int = 1;
    pub const INTERRUPTED: c_int = 4;
    pub const NO_SUCH_PROCESS: c_int = 3;
    pub const OPERATION_NOT_PERMITTED: c_int = 1;
    pub const SIGKILL: c_int = 9;
    pub const SIGTERM: c_int = 15;
    pub const FILE_TYPE_MASK: u32 = 0o170_000;
    pub const REGULAR_FILE_TYPE: u32 = 0o100_000;
    pub const SOCKET_FILE_TYPE: u32 = 0o140_000;
    const F_GETFD: c_int = 1;
    const F_GETFL: c_int = 3;
    const F_SETFD: c_int = 2;
    const F_SETFL: c_int = 4;
    const WNOHANG: c_int = 1;

    #[repr(C, align(8))]
    struct SignalInfo([u8; 128]);

    #[cfg(target_os = "macos")]
    const OPEN_CLOSE_ON_EXEC: c_int = 0x0100_0000;
    #[cfg(target_os = "macos")]
    const OPEN_DIRECTORY: c_int = 0x0010_0000;
    #[cfg(target_os = "macos")]
    const OPEN_NO_FOLLOW: c_int = 0x0000_0100;
    #[cfg(target_os = "macos")]
    const OPEN_NONBLOCK: c_int = 0x0000_0004;
    #[cfg(target_os = "macos")]
    const AT_SYMLINK_NO_FOLLOW: c_int = 0x0020;

    #[cfg(target_os = "linux")]
    const OPEN_CLOSE_ON_EXEC: c_int = 0x0008_0000;
    #[cfg(target_os = "linux")]
    const OPEN_DIRECTORY: c_int = 0x0001_0000;
    #[cfg(target_os = "linux")]
    const OPEN_NO_FOLLOW: c_int = 0x0002_0000;
    #[cfg(target_os = "linux")]
    const OPEN_NONBLOCK: c_int = 0x0000_0800;
    #[cfg(target_os = "linux")]
    const AT_SYMLINK_NO_FOLLOW: c_int = 0x0100;

    #[cfg(target_os = "macos")]
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct PlatformTimespec {
        seconds: i64,
        nanoseconds: i64,
    }

    #[cfg(target_os = "macos")]
    #[repr(C)]
    struct PlatformStat {
        device: i32,
        mode: u16,
        hard_links: u16,
        inode: u64,
        user_id: u32,
        group_id: u32,
        special_device: i32,
        access_time: PlatformTimespec,
        modification_time: PlatformTimespec,
        change_time: PlatformTimespec,
        birth_time: PlatformTimespec,
        size: i64,
        blocks: i64,
        block_size: i32,
        flags: u32,
        generation: u32,
        spare: i32,
        quad_spare: [i64; 2],
    }

    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    #[repr(C)]
    struct PlatformStat {
        device: u64,
        inode: u64,
        hard_links: u64,
        mode: u32,
        user_id: u32,
        group_id: u32,
        padding: i32,
        special_device: u64,
        size: i64,
        block_size: i64,
        blocks: i64,
        access_seconds: i64,
        access_nanoseconds: i64,
        modification_seconds: i64,
        modification_nanoseconds: i64,
        change_seconds: i64,
        change_nanoseconds: i64,
        reserved: [i64; 3],
    }

    #[cfg(all(target_os = "linux", not(target_arch = "x86_64")))]
    #[repr(C)]
    struct PlatformStat {
        device: u64,
        inode: u64,
        mode: u32,
        hard_links: u32,
        user_id: u32,
        group_id: u32,
        special_device: u64,
        padding: u64,
        size: i64,
        block_size: i32,
        padding_two: i32,
        blocks: i64,
        access_seconds: i64,
        access_nanoseconds: u64,
        modification_seconds: i64,
        modification_nanoseconds: u64,
        change_seconds: i64,
        change_nanoseconds: u64,
        unused: [u32; 2],
    }

    #[derive(Debug, Clone, Copy)]
    pub struct EntryStatus {
        pub device: u64,
        pub inode: u64,
        pub mode: u32,
        pub user_id: u32,
        pub hard_links: u64,
    }

    unsafe extern "C" {
        fn fcntl(descriptor: c_int, command: c_int, ...) -> c_int;
        fn fstatat(
            directory_descriptor: c_int,
            path: *const std::os::raw::c_char,
            status: *mut PlatformStat,
            flags: c_int,
        ) -> c_int;
        fn geteuid() -> c_uint;
        fn getpid() -> c_int;
        #[cfg(target_os = "macos")]
        fn getsid(process_id: c_int) -> c_int;
        fn kill(process_id: c_int, signal: c_int) -> c_int;
        fn open(path: *const std::os::raw::c_char, flags: c_int, ...) -> c_int;
        fn openat(
            directory_descriptor: c_int,
            path: *const std::os::raw::c_char,
            flags: c_int,
            ...
        ) -> c_int;
        fn waitid(id_type: c_int, id: c_uint, info: *mut SignalInfo, options: c_int) -> c_int;
        fn waitpid(process_id: c_int, status: *mut c_int, options: c_int) -> c_int;
        fn unlinkat(
            directory_descriptor: c_int,
            path: *const std::os::raw::c_char,
            flags: c_int,
        ) -> c_int;
    }

    fn file_from_descriptor(descriptor: c_int) -> io::Result<File> {
        if descriptor == -1 {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: descriptor is a fresh owned descriptor returned by open/openat.
        Ok(unsafe { File::from_raw_fd(descriptor) })
    }

    pub fn open_root_directory() -> io::Result<File> {
        let root = c"/";
        // SAFETY: root is a permanent NUL-terminated path and no mode argument is needed without
        // O_CREAT.
        file_from_descriptor(unsafe {
            open(
                root.as_ptr(),
                OPEN_DIRECTORY | OPEN_NO_FOLLOW | OPEN_CLOSE_ON_EXEC,
            )
        })
    }

    pub fn open_directory_at(directory_descriptor: c_int, name: &CStr) -> io::Result<File> {
        // SAFETY: name is NUL-terminated, directory_descriptor remains borrowed for the call, and
        // no mode argument is needed without O_CREAT.
        file_from_descriptor(unsafe {
            openat(
                directory_descriptor,
                name.as_ptr(),
                OPEN_DIRECTORY | OPEN_NO_FOLLOW | OPEN_CLOSE_ON_EXEC,
            )
        })
    }

    pub fn open_regular_entry_at(directory_descriptor: c_int, name: &CStr) -> io::Result<File> {
        // SAFETY: name is NUL-terminated, directory_descriptor remains borrowed for the call, and
        // no mode argument is needed without O_CREAT. O_NONBLOCK prevents a raced FIFO from
        // blocking before its fstat/type rejection.
        file_from_descriptor(unsafe {
            openat(
                directory_descriptor,
                name.as_ptr(),
                OPEN_NO_FOLLOW | OPEN_CLOSE_ON_EXEC | OPEN_NONBLOCK,
            )
        })
    }

    pub fn entry_status_at(directory_descriptor: c_int, name: &CStr) -> io::Result<EntryStatus> {
        let mut status = std::mem::MaybeUninit::<PlatformStat>::zeroed();
        // SAFETY: status is correctly sized/aligned platform storage, name is NUL-terminated, and
        // AT_SYMLINK_NOFOLLOW prevents the terminal component from being followed.
        if unsafe {
            fstatat(
                directory_descriptor,
                name.as_ptr(),
                status.as_mut_ptr(),
                AT_SYMLINK_NO_FOLLOW,
            )
        } == -1
        {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: successful fstatat initialized the complete platform stat structure.
        let status = unsafe { status.assume_init() };
        #[cfg(target_os = "macos")]
        let device = u64::from(status.device.cast_unsigned());
        #[cfg(target_os = "linux")]
        let device = status.device;
        #[cfg(target_os = "macos")]
        let mode = u32::from(status.mode);
        #[cfg(target_os = "linux")]
        let mode = status.mode;
        #[cfg(any(
            target_os = "macos",
            all(target_os = "linux", not(target_arch = "x86_64"))
        ))]
        let hard_links = u64::from(status.hard_links);
        #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
        let hard_links = status.hard_links;
        Ok(EntryStatus {
            device,
            inode: status.inode,
            mode,
            user_id: status.user_id,
            hard_links,
        })
    }

    pub fn unlink_entry_at(directory_descriptor: c_int, name: &CStr) -> io::Result<()> {
        // SAFETY: name is NUL-terminated and directory_descriptor stays open for the call.
        if unsafe { unlinkat(directory_descriptor, name.as_ptr(), 0) } == -1 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    #[cfg(target_os = "macos")]
    pub fn rename_entry_no_replace_at(
        old_directory: c_int,
        old_name: &CStr,
        new_directory: c_int,
        new_name: &CStr,
    ) -> io::Result<()> {
        const RENAME_EXCLUSIVE: c_uint = 4;
        // SAFETY: both names are NUL-terminated, both descriptors stay open for the call, and
        // RENAME_EXCL atomically refuses to overwrite an existing claim.
        if unsafe {
            renameatx_np(
                old_directory,
                old_name.as_ptr(),
                new_directory,
                new_name.as_ptr(),
                RENAME_EXCLUSIVE,
            )
        } == -1
        {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    #[cfg(target_os = "linux")]
    pub fn rename_entry_no_replace_at(
        old_directory: c_int,
        old_name: &CStr,
        new_directory: c_int,
        new_name: &CStr,
    ) -> io::Result<()> {
        const RENAME_NO_REPLACE: c_uint = 1;
        // SAFETY: both names are NUL-terminated, both descriptors stay open for the call, and
        // RENAME_NOREPLACE atomically refuses to overwrite an existing claim.
        if unsafe {
            renameat2(
                old_directory,
                old_name.as_ptr(),
                new_directory,
                new_name.as_ptr(),
                RENAME_NO_REPLACE,
            )
        } == -1
        {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    pub fn rename_entry_no_replace_at(
        _old_directory: c_int,
        _old_name: &CStr,
        _new_directory: c_int,
        _new_name: &CStr,
    ) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "atomic custody claims are unavailable on this platform",
        ))
    }

    pub fn descriptor_flags(descriptor: c_int) -> c_int {
        // SAFETY: F_GETFD takes no variadic argument and does not dereference memory.
        unsafe { fcntl(descriptor, F_GETFD) }
    }

    pub fn mark_descriptor_nonblocking(descriptor: c_int) -> io::Result<()> {
        // SAFETY: F_GETFL takes no variadic argument and does not dereference memory.
        let flags = unsafe { fcntl(descriptor, F_GETFL) };
        if flags == -1 {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: F_SETFL consumes one integer variadic argument and does not dereference memory.
        if unsafe { fcntl(descriptor, F_SETFL, flags | OPEN_NONBLOCK) } == -1 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
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

    #[cfg(target_os = "macos")]
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
        match error.raw_os_error() {
            Some(NO_SUCH_PROCESS) => Ok(false),
            // Darwin returns EPERM while a signalled group has only unreaped zombie members.
            // Treat that as present so the bounded absence poll can wait; persistence through the
            // deadline remains a hard failure rather than an access-denied success.
            Some(OPERATION_NOT_PERMITTED) => Ok(true),
            _ => Err(error),
        }
    }

    pub fn wait_for_process(process_id: i32, nonblocking: bool) -> i32 {
        let mut status = 0;
        let options = if nonblocking { WNOHANG } else { 0 };
        // SAFETY: status points to valid writable storage for waitpid's duration.
        unsafe { waitpid(process_id, &raw mut status, options) }
    }

    pub fn child_exited_without_reaping(process_id: i32) -> io::Result<bool> {
        const P_PID: c_int = 1;
        const WEXITED: c_int = 4;
        #[cfg(target_os = "macos")]
        const WNOWAIT: c_int = 0x20;
        #[cfg(not(target_os = "macos"))]
        const WNOWAIT: c_int = 0x0100_0000;

        let process_id_unsigned = u32::try_from(process_id)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "negative child PID"))?;
        loop {
            let mut info = SignalInfo([0; 128]);
            // SAFETY: info is an aligned, zeroed buffer at least as large as siginfo_t on the
            // supported Darwin and Linux targets. WNOWAIT prevents this observation from reaping.
            let result = unsafe {
                waitid(
                    P_PID,
                    process_id_unsigned,
                    &raw mut info,
                    WEXITED | WNOHANG | WNOWAIT,
                )
            };
            if result == 0 {
                #[cfg(target_os = "macos")]
                const PID_OFFSET: usize = 12;
                #[cfg(not(target_os = "macos"))]
                const PID_OFFSET: usize = 16;
                // SAFETY: PID_OFFSET names the aligned si_pid field within the platform siginfo_t
                // prefix, and SignalInfo is initialized before the read.
                let observed = unsafe {
                    std::ptr::read_unaligned(info.0.as_ptr().add(PID_OFFSET).cast::<c_int>())
                };
                return Ok(observed == process_id);
            }
            let error = io::Error::last_os_error();
            if error.raw_os_error() == Some(INTERRUPTED) {
                continue;
            }
            return Err(error);
        }
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

    #[cfg(target_os = "macos")]
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct AuditToken {
        values: [u32; 8],
    }

    #[cfg(target_os = "macos")]
    #[derive(Debug, Clone, Copy)]
    pub struct DarwinAuditTokenFields {
        pub effective_user_id: u32,
        pub effective_group_id: u32,
        pub process_id: i32,
        pub process_id_version: u32,
    }

    #[cfg(target_os = "macos")]
    pub fn darwin_audit_token_fields(token: [u32; 8]) -> DarwinAuditTokenFields {
        let token = AuditToken { values: token };
        // SAFETY: libbsm consumes the complete by-value audit token and returns scalar fields.
        DarwinAuditTokenFields {
            effective_user_id: unsafe { audit_token_to_euid(token) },
            effective_group_id: unsafe { audit_token_to_egid(token) },
            process_id: unsafe { audit_token_to_pid(token) },
            process_id_version: unsafe { audit_token_to_pidversion(token) }.cast_unsigned(),
        }
    }

    #[cfg(target_os = "macos")]
    pub fn validate_live_darwin_audit_token(token: [u32; 8]) -> io::Result<()> {
        let mut token = AuditToken { values: token };
        let mut path = [0_u8; 4096];
        // SAFETY: token and path point to live, correctly sized storage. libproc validates the
        // audit-token PID generation before returning the executable path.
        let length = unsafe {
            proc_pidpath_audittoken(
                &raw mut token,
                path.as_mut_ptr().cast(),
                u32::try_from(path.len()).expect("fixed path buffer fits u32"),
            )
        };
        if length <= 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    #[cfg(target_os = "macos")]
    pub fn process_group_members(process_group_id: i32) -> io::Result<Vec<i32>> {
        let mut process_ids = vec![0_i32; 4096];
        let byte_capacity = c_int::try_from(
            process_ids
                .len()
                .checked_mul(std::mem::size_of::<i32>())
                .ok_or_else(|| io::Error::other("process group buffer overflow"))?,
        )
        .map_err(|_| io::Error::other("process group buffer is too large"))?;
        // SAFETY: process_ids is a writable byte_capacity-sized PID array for libproc.
        let count = unsafe {
            proc_listpgrppids(
                process_group_id,
                process_ids.as_mut_ptr().cast(),
                byte_capacity,
            )
        };
        if count < 0 {
            return Err(io::Error::last_os_error());
        }
        let count =
            usize::try_from(count).map_err(|_| io::Error::other("negative process group count"))?;
        if count >= process_ids.len() {
            return Err(io::Error::other(
                "process group exceeds bounded inspection capacity",
            ));
        }
        process_ids.truncate(count);
        Ok(process_ids)
    }

    #[cfg(target_os = "linux")]
    pub fn peer_credentials(descriptor: i32) -> io::Result<(u32, u32, i32, Option<[u32; 8]>)> {
        const SOL_SOCKET: c_int = 1;
        const SO_PEERCRED: c_int = 17;
        #[repr(C)]
        #[derive(Clone, Copy)]
        struct UCred {
            pid: c_int,
            uid: u32,
            gid: u32,
        }
        let credentials = socket_option::<UCred>(descriptor, SOL_SOCKET, SO_PEERCRED)?;
        Ok((credentials.uid, credentials.gid, credentials.pid, None))
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
        fn proc_listpgrppids(
            process_group_id: c_int,
            buffer: *mut std::os::raw::c_void,
            buffer_size: c_int,
        ) -> c_int;
        fn proc_pidpath_audittoken(
            audit_token: *mut AuditToken,
            buffer: *mut std::os::raw::c_void,
            buffer_size: u32,
        ) -> c_int;
    }

    #[cfg(target_os = "macos")]
    unsafe extern "C" {
        fn renameatx_np(
            old_directory: c_int,
            old_name: *const std::os::raw::c_char,
            new_directory: c_int,
            new_name: *const std::os::raw::c_char,
            flags: c_uint,
        ) -> c_int;
    }

    #[cfg(target_os = "linux")]
    unsafe extern "C" {
        fn renameat2(
            old_directory: c_int,
            old_name: *const std::os::raw::c_char,
            new_directory: c_int,
            new_name: *const std::os::raw::c_char,
            flags: c_uint,
        ) -> c_int;
    }

    #[cfg(target_os = "macos")]
    #[link(name = "bsm")]
    unsafe extern "C" {
        fn audit_token_to_euid(audit_token: AuditToken) -> u32;
        fn audit_token_to_egid(audit_token: AuditToken) -> u32;
        fn audit_token_to_pid(audit_token: AuditToken) -> c_int;
        fn audit_token_to_pidversion(audit_token: AuditToken) -> c_int;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_the_standard_empty_message_vector() {
        assert_eq!(
            sha256_bytes(b""),
            [
                0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f,
                0xb9, 0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b,
                0x78, 0x52, 0xb8, 0x55,
            ]
        );
        assert_eq!(
            sha256_bytes(b"abc"),
            [
                0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae,
                0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61,
                0xf2, 0x00, 0x15, 0xad,
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn custody_domains_and_both_claim_names_match_the_golden_vectors() {
        let identity = FileIdentity {
            device: 1,
            inode: 2,
        };
        let socket_digest = socket_identity_digest(identity);
        assert_eq!(
            socket_digest,
            [
                0xce, 0xdc, 0x25, 0xa7, 0xce, 0xdc, 0xa4, 0xf4, 0x57, 0xde, 0xda, 0x03, 0x49, 0xcc,
                0x04, 0x95, 0x01, 0x48, 0xdc, 0x6b, 0x7c, 0xa4, 0x2d, 0x05, 0x19, 0xbc, 0x42, 0xcb,
                0x34, 0x47, 0x45, 0x39,
            ]
        );
        assert_eq!(
            derive_custody_claim_basename(
                "portal.sock",
                CustodyEntry {
                    identity,
                    kind: CustodyEntryKind::Socket,
                    digest: socket_digest,
                    link_count: 1,
                },
            )
            .expect("socket claim vector"),
            ".agent-fabric-claim-b5f0a24d6c67d3056a7bf3a515db57e7b02d3ecaf6e780073b004adba747cee6"
        );

        let capsule_digest = sha256_bytes(b"opaque capsule");
        assert_eq!(
            capsule_digest,
            [
                0x51, 0xd2, 0x99, 0xe9, 0x1b, 0x2c, 0x47, 0x83, 0x22, 0xac, 0x37, 0x7d, 0x05, 0xf3,
                0xb4, 0x66, 0xeb, 0x62, 0xee, 0xd9, 0xe5, 0xa1, 0x96, 0x6d, 0x2d, 0x25, 0xc2, 0xd9,
                0x9a, 0xad, 0x22, 0xc7,
            ]
        );
        assert_eq!(
            derive_custody_claim_basename(
                "capsule",
                CustodyEntry {
                    identity,
                    kind: CustodyEntryKind::RegularFile,
                    digest: capsule_digest,
                    link_count: 1,
                },
            )
            .expect("capsule claim vector"),
            ".agent-fabric-claim-33c9ccda17436d2eeff16182e2f8c84508d0db6a100deb0fc8d1260f72a867e5"
        );
    }

    #[cfg(unix)]
    #[test]
    fn custody_claim_preflight_rejects_a_cross_device_transition() {
        assert!(matches!(
            require_same_custody_filesystem(
                FileIdentity {
                    device: 41,
                    inode: 1,
                },
                FileIdentity {
                    device: 42,
                    inode: 2,
                },
            ),
            Err(CustodyError::ClaimDirectoryCrossDevice)
        ));
    }

    #[cfg(unix)]
    #[test]
    fn reap_polling_stops_at_the_fixed_deadline_without_a_blocking_wait() {
        let started = std::time::Instant::now();
        let result = reap_with_deadline(started + Duration::from_millis(15), || {
            Ok(ChildWait::Running)
        });
        assert!(matches!(result, Err(ProcessError::ReapDeadlineExceeded)));
        assert!(started.elapsed() < Duration::from_millis(100));
    }
}
