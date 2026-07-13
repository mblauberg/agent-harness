#![cfg(unix)]

use std::fs;
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::os::unix::net::UnixListener;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use agent_fabric_review_portal_supervisor::{
    CustodyEntryKind, CustodyError, FileIdentity, inspect_custody_entry, remove_custody_entry,
    validate_cleanup_basename,
};

const CRASH_HELPER_ENV: &str = "AGENT_FABRIC_CUSTODY_CRASH_HELPER";
const CRASH_SOURCE_ENV: &str = "AGENT_FABRIC_CUSTODY_CRASH_SOURCE";
const CRASH_CLAIM_ENV: &str = "AGENT_FABRIC_CUSTODY_CRASH_CLAIM";

fn private_directory() -> std::path::PathBuf {
    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(0);
    let nonce = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
    let temporary_root = fs::canonicalize(std::env::temp_dir()).expect("canonical temp root");
    let directory = temporary_root.join(format!("afpc-{}-{nonce:x}", std::process::id()));
    fs::create_dir(&directory).expect("custody directory");
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).expect("private mode");
    directory
}

fn identity_of(directory: &std::path::Path) -> FileIdentity {
    let metadata = fs::metadata(directory).expect("directory metadata");
    FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    }
}

fn remove_with_private_claim(
    directory: &std::path::Path,
    directory_identity: FileIdentity,
    basename: &str,
    expected: agent_fabric_review_portal_supervisor::CustodyEntry,
) -> Result<(), agent_fabric_review_portal_supervisor::CustodyError> {
    let claim_directory = private_directory();
    let claim_directory_identity = identity_of(&claim_directory);
    let result = remove_custody_entry(
        directory,
        directory_identity,
        &claim_directory,
        claim_directory_identity,
        basename,
        expected,
    );
    fs::remove_dir_all(&claim_directory).expect("claim cleanup");
    result
}

#[test]
fn removes_only_the_exact_preinspected_entry_identity() {
    let directory = private_directory();
    let metadata = fs::metadata(&directory).expect("directory metadata");
    let directory_identity = FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    };
    fs::write(directory.join("capsule"), b"first").expect("capsule");
    let entry =
        inspect_custody_entry(&directory, directory_identity, "capsule").expect("inspect capsule");
    remove_with_private_claim(&directory, directory_identity, "capsule", entry)
        .expect("remove exact capsule");
    assert!(!directory.join("capsule").exists());

    fs::write(directory.join("capsule"), b"replacement").expect("replacement");
    assert!(remove_with_private_claim(&directory, directory_identity, "capsule", entry).is_err());
    assert!(directory.join("capsule").exists());
    fs::remove_dir_all(&directory).expect("cleanup");
}

#[test]
fn rejects_same_inode_capsule_content_drift_before_unlink() {
    let directory = private_directory();
    let metadata = fs::metadata(&directory).expect("directory metadata");
    let directory_identity = FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    };
    let capsule = directory.join("capsule");
    fs::write(&capsule, b"sealed-first").expect("initial capsule");
    let expected =
        inspect_custody_entry(&directory, directory_identity, "capsule").expect("inspect capsule");

    fs::write(&capsule, b"mutated-data").expect("mutate same inode");
    let metadata_after = fs::metadata(&capsule).expect("mutated metadata");
    assert_eq!(
        expected.identity,
        FileIdentity {
            device: metadata_after.dev(),
            inode: metadata_after.ino(),
        },
        "canary must mutate content without replacing the inode"
    );
    assert!(
        remove_with_private_claim(&directory, directory_identity, "capsule", expected).is_err()
    );
    assert_eq!(
        fs::read(&capsule).expect("preserved capsule"),
        b"mutated-data"
    );
    fs::remove_dir_all(&directory).expect("cleanup");
}

#[test]
fn rejects_a_swapped_or_symlinked_custody_directory() {
    let directory = private_directory();
    let metadata = fs::metadata(&directory).expect("directory metadata");
    let directory_identity = FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    };
    fs::write(directory.join("capsule"), b"sealed").expect("capsule");
    let expected =
        inspect_custody_entry(&directory, directory_identity, "capsule").expect("inspect capsule");

    let retained = directory.with_extension("retained");
    fs::rename(&directory, &retained).expect("retain original directory");
    std::os::unix::fs::symlink(&retained, &directory).expect("swap path with symlink");
    assert!(
        remove_with_private_claim(&directory, directory_identity, "capsule", expected).is_err()
    );
    assert!(retained.join("capsule").exists());
    fs::remove_file(&directory).expect("remove swap symlink");
    fs::remove_dir_all(&retained).expect("cleanup retained directory");
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[test]
fn never_unlinks_a_concurrently_swapped_in_entry() {
    let mut successful_claims = 0;
    for _iteration in 0..768 {
        let directory = private_directory();
        let claim_directory = private_directory();
        let claim_directory_identity = identity_of(&claim_directory);
        let metadata = fs::metadata(&directory).expect("directory metadata");
        let directory_identity = FileIdentity {
            device: metadata.dev(),
            inode: metadata.ino(),
        };
        let capsule = directory.join("capsule");
        let swap = directory.join("swap");
        fs::write(&capsule, b"expected").expect("expected capsule");
        fs::write(&swap, b"attacker").expect("attacker capsule");
        let expected_inode = fs::metadata(&capsule).expect("expected metadata").ino();
        let attacker_inode = fs::metadata(&swap).expect("attacker metadata").ino();
        let expected = inspect_custody_entry(&directory, directory_identity, "capsule")
            .expect("inspect expected capsule");

        let stop = Arc::new(AtomicBool::new(false));
        let swapper_stop = Arc::clone(&stop);
        let swapper = thread::spawn(move || {
            while !swapper_stop.load(Ordering::Acquire) {
                let _ = libc_test::swap_paths(&capsule, &swap);
            }
        });
        let removal = remove_custody_entry(
            &directory,
            directory_identity,
            &claim_directory,
            claim_directory_identity,
            "capsule",
            expected,
        );
        stop.store(true, Ordering::Release);
        swapper.join().expect("swapper completion");

        let attacker_survived = [&directory, &claim_directory].into_iter().any(|location| {
            fs::read_dir(location)
                .expect("remaining custody entries")
                .flatten()
                .any(|entry| {
                    entry
                        .metadata()
                        .is_ok_and(|metadata| metadata.ino() == attacker_inode)
                })
        });
        assert!(
            attacker_survived,
            "cleanup deleted swapped-in attacker inode {attacker_inode}; removal={removal:?}"
        );
        if removal.is_ok() {
            successful_claims += 1;
            let remaining_inode = fs::metadata(directory.join("swap"))
                .expect("one stable remaining entry")
                .ino();
            assert_eq!(
                remaining_inode, attacker_inode,
                "cleanup deleted swapped-in attacker inode {attacker_inode}, leaving expected inode {expected_inode}"
            );
        }
        fs::remove_dir_all(&directory).expect("cleanup");
        fs::remove_dir_all(&claim_directory).expect("claim cleanup");
    }
    assert!(successful_claims > 0, "swap canary never reached an unlink");
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[test]
fn never_unlinks_an_entry_swapped_into_the_active_claim_path() {
    let claim_swaps = Arc::new(AtomicU64::new(0));
    let claim_probes = Arc::new(AtomicU64::new(0));
    for iteration in 0..64 {
        let directory = private_directory();
        let metadata = fs::metadata(&directory).expect("directory metadata");
        let directory_identity = FileIdentity {
            device: metadata.dev(),
            inode: metadata.ino(),
        };
        let capsule = directory.join("capsule");
        let swap = directory.join("swap");
        fs::write(&capsule, vec![b'e'; 2 * 1024 * 1024]).expect("expected capsule");
        fs::write(&swap, b"attacker").expect("attacker capsule");
        let attacker_inode = fs::metadata(&swap).expect("attacker metadata").ino();
        let expected = inspect_custody_entry(&directory, directory_identity, "capsule")
            .expect("inspect expected capsule");

        let stop = Arc::new(AtomicBool::new(false));
        let swapper_stop = Arc::clone(&stop);
        let swapper_directory = directory.clone();
        let swapper_swap = swap.clone();
        let swapper_claim_swaps = Arc::clone(&claim_swaps);
        let swapper_claim_probes = Arc::clone(&claim_probes);
        let swapper = thread::spawn(move || {
            while !swapper_stop.load(Ordering::Acquire) {
                swapper_claim_probes.fetch_add(1, Ordering::Relaxed);
                let Ok(entries) = fs::read_dir(&swapper_directory) else {
                    continue;
                };
                for entry in entries.flatten() {
                    if entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with(".agent-fabric-claim-")
                        && libc_test::swap_paths(&entry.path(), &swapper_swap)
                    {
                        swapper_claim_swaps.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }
        });
        let removal =
            remove_with_private_claim(&directory, directory_identity, "capsule", expected);
        stop.store(true, Ordering::Release);
        swapper.join().expect("swapper completion");

        let attacker_survived = fs::read_dir(&directory)
            .expect("remaining custody entries")
            .flatten()
            .any(|entry| {
                entry
                    .metadata()
                    .is_ok_and(|metadata| metadata.ino() == attacker_inode)
            });
        fs::remove_dir_all(&directory).expect("cleanup");
        assert!(
            removal.is_ok(),
            "iteration {iteration} did not complete through the trusted claim namespace: {removal:?}"
        );
        assert!(
            attacker_survived,
            "iteration {iteration} deleted the inode swapped into the active claim; removal={removal:?}"
        );
    }
    assert!(
        claim_probes.load(Ordering::Relaxed) > 0,
        "claim-path canary never probed the raced source namespace"
    );
    assert_eq!(
        claim_swaps.load(Ordering::Relaxed),
        0,
        "the active claim leaked into the raced source namespace"
    );
}

#[test]
fn rejects_the_raced_source_directory_as_its_own_claim_namespace() {
    let directory = private_directory();
    let directory_identity = identity_of(&directory);
    fs::write(directory.join("capsule"), b"expected").expect("expected capsule");
    let expected = inspect_custody_entry(&directory, directory_identity, "capsule")
        .expect("inspect expected capsule");

    assert!(matches!(
        remove_custody_entry(
            &directory,
            directory_identity,
            &directory,
            directory_identity,
            "capsule",
            expected,
        ),
        Err(CustodyError::ClaimDirectoryNotDistinct)
    ));
    assert!(directory.join("capsule").exists());
    fs::remove_dir_all(&directory).expect("cleanup");
}

#[test]
fn retry_recovers_a_claim_left_by_process_crash_after_rename() {
    let directory = private_directory();
    let directory_identity = identity_of(&directory);
    let claim_directory = private_directory();
    let claim_directory_identity = identity_of(&claim_directory);
    let capsule = directory.join("capsule");
    fs::write(&capsule, vec![b'c'; 8 * 1024 * 1024]).expect("crash capsule");
    let expected = inspect_custody_entry(&directory, directory_identity, "capsule")
        .expect("inspect crash capsule");

    let mut helper = Command::new(std::env::current_exe().expect("current test binary"))
        .arg("custody_crash_after_claim_helper")
        .arg("--exact")
        .env_clear()
        .env(CRASH_HELPER_ENV, "1")
        .env(CRASH_SOURCE_ENV, &directory)
        .env(CRASH_CLAIM_ENV, &claim_directory)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn custody crash helper");
    let deadline = Instant::now() + Duration::from_secs(5);
    while capsule.exists() {
        assert!(
            Instant::now() < deadline,
            "helper never entered the claimed state"
        );
        assert!(
            helper.try_wait().expect("helper status").is_none(),
            "helper exited before the claimed-state crash point"
        );
        thread::sleep(Duration::from_millis(1));
    }
    helper.kill().expect("crash helper after claim");
    helper.wait().expect("reap crashed helper");
    let claimed_inode = fs::read_dir(&claim_directory)
        .expect("claimed entries")
        .flatten()
        .find_map(|entry| entry.metadata().ok().map(|metadata| metadata.ino()));
    assert_eq!(claimed_inode, Some(expected.identity.inode));

    let retry = remove_custody_entry(
        &directory,
        directory_identity,
        &claim_directory,
        claim_directory_identity,
        "capsule",
        expected,
    );
    let retry_removed = !capsule.exists()
        && fs::read_dir(&claim_directory)
            .expect("claim state after retry")
            .next()
            .is_none();
    let removed_retry = remove_custody_entry(
        &directory,
        directory_identity,
        &claim_directory,
        claim_directory_identity,
        "capsule",
        expected,
    );
    fs::remove_dir_all(&directory).expect("source cleanup");
    fs::remove_dir_all(&claim_directory).expect("claim cleanup");
    retry.expect("retry completes a crash-left claim");
    assert!(retry_removed, "retry did not reach the removed state");
    removed_retry.expect("removed-state retry is idempotent");
}

#[test]
fn retry_recovers_a_claim_left_by_unlink_failure() {
    let directory = private_directory();
    let directory_identity = identity_of(&directory);
    let claim_directory = private_directory();
    let claim_directory_identity = identity_of(&claim_directory);
    let capsule = directory.join("capsule");
    fs::write(&capsule, vec![b'u'; 8 * 1024 * 1024]).expect("unlink capsule");
    let expected = inspect_custody_entry(&directory, directory_identity, "capsule")
        .expect("inspect unlink capsule");

    let fault_capsule = capsule.clone();
    let fault_claim_directory = claim_directory.clone();
    let fault = thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(5);
        while fault_capsule.exists() {
            assert!(
                Instant::now() < deadline,
                "cleanup never entered the claimed state"
            );
            thread::sleep(Duration::from_millis(1));
        }
        fs::set_permissions(&fault_claim_directory, fs::Permissions::from_mode(0o500))
            .expect("deny claim unlink");
    });
    let first = remove_custody_entry(
        &directory,
        directory_identity,
        &claim_directory,
        claim_directory_identity,
        "capsule",
        expected,
    );
    fault.join().expect("unlink fault completion");
    fs::set_permissions(&claim_directory, fs::Permissions::from_mode(0o700))
        .expect("restore claim permissions");
    assert!(
        first.is_err(),
        "forced unlink failure unexpectedly succeeded"
    );
    assert!(
        !capsule.exists(),
        "failed unlink restored the canonical name"
    );
    assert_eq!(
        fs::read_dir(&claim_directory)
            .expect("claimed entries")
            .count(),
        1,
        "failed unlink did not preserve one retryable claim"
    );

    let retry = remove_custody_entry(
        &directory,
        directory_identity,
        &claim_directory,
        claim_directory_identity,
        "capsule",
        expected,
    );
    let retry_removed = !capsule.exists()
        && fs::read_dir(&claim_directory)
            .expect("claim state after retry")
            .next()
            .is_none();
    let removed_retry = remove_custody_entry(
        &directory,
        directory_identity,
        &claim_directory,
        claim_directory_identity,
        "capsule",
        expected,
    );
    fs::remove_dir_all(&directory).expect("source cleanup");
    fs::remove_dir_all(&claim_directory).expect("claim cleanup");
    retry.expect("retry completes an unlink-failed claim");
    assert!(retry_removed, "retry did not reach the removed state");
    removed_retry.expect("removed-state retry is idempotent");
}

#[test]
fn custody_crash_after_claim_helper() {
    if std::env::var_os(CRASH_HELPER_ENV).is_none() {
        return;
    }
    let directory =
        std::path::PathBuf::from(std::env::var_os(CRASH_SOURCE_ENV).expect("crash helper source"));
    let claim_directory =
        std::path::PathBuf::from(std::env::var_os(CRASH_CLAIM_ENV).expect("crash helper claim"));
    let directory_identity = identity_of(&directory);
    let claim_directory_identity = identity_of(&claim_directory);
    let expected = inspect_custody_entry(&directory, directory_identity, "capsule")
        .expect("inspect helper capsule");
    let _ = remove_custody_entry(
        &directory,
        directory_identity,
        &claim_directory,
        claim_directory_identity,
        "capsule",
        expected,
    );
}

#[test]
fn accepts_only_a_single_relative_cleanup_basename() {
    validate_cleanup_basename("portal.sock").expect("valid socket basename");
    validate_cleanup_basename("capsule-01").expect("valid capsule basename");
    for invalid in [
        "",
        ".",
        "..",
        "/tmp/portal.sock",
        "../portal.sock",
        "a/b",
        "a\\b",
        "nul\0x",
    ] {
        assert!(validate_cleanup_basename(invalid).is_err(), "{invalid:?}");
    }
}

#[test]
fn inspects_only_the_exact_private_directory_and_non_symlink_socket_or_file() {
    let directory = private_directory();
    let metadata = fs::metadata(&directory).expect("directory metadata");
    let identity = FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    };
    let socket_path = directory.join("portal.sock");
    let listener = UnixListener::bind(&socket_path).expect("socket");

    let entry =
        inspect_custody_entry(&directory, identity, "portal.sock").expect("exact socket custody");
    assert_eq!(entry.kind, CustodyEntryKind::Socket);
    assert_ne!(entry.digest, [0; 32]);
    assert!(
        inspect_custody_entry(
            &directory,
            FileIdentity {
                device: identity.device,
                inode: identity.inode + 1,
            },
            "portal.sock",
        )
        .is_err()
    );

    fs::write(directory.join("capsule"), b"opaque").expect("capsule");
    std::os::unix::fs::symlink("capsule", directory.join("link")).expect("symlink");
    assert!(inspect_custody_entry(&directory, identity, "link").is_err());

    drop(listener);
    fs::remove_dir_all(&directory).expect("cleanup");
}

#[allow(unsafe_code)]
mod libc_test {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    #[cfg(target_os = "macos")]
    unsafe extern "C" {
        fn renamex_np(
            old_path: *const std::os::raw::c_char,
            new_path: *const std::os::raw::c_char,
            flags: std::os::raw::c_uint,
        ) -> std::os::raw::c_int;
    }

    #[cfg(target_os = "linux")]
    unsafe extern "C" {
        fn renameat2(
            old_directory: std::os::raw::c_int,
            old_path: *const std::os::raw::c_char,
            new_directory: std::os::raw::c_int,
            new_path: *const std::os::raw::c_char,
            flags: std::os::raw::c_uint,
        ) -> std::os::raw::c_int;
    }

    pub fn swap_paths(old_path: &std::path::Path, new_path: &std::path::Path) -> bool {
        const RENAME_EXCHANGE: std::os::raw::c_uint = 2;
        let old_path = CString::new(old_path.as_os_str().as_bytes()).expect("old swap path");
        let new_path = CString::new(new_path.as_os_str().as_bytes()).expect("new swap path");
        #[cfg(target_os = "macos")]
        // SAFETY: both paths are valid NUL-terminated test paths and RENAME_SWAP is atomic.
        let result = unsafe { renamex_np(old_path.as_ptr(), new_path.as_ptr(), RENAME_EXCHANGE) };
        #[cfg(target_os = "linux")]
        // SAFETY: both paths are valid NUL-terminated absolute test paths and RENAME_EXCHANGE is
        // atomic on the containing filesystem.
        let result = unsafe {
            renameat2(
                -100,
                old_path.as_ptr(),
                -100,
                new_path.as_ptr(),
                RENAME_EXCHANGE,
            )
        };
        result == 0
    }
}
