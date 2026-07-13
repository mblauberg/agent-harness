#![cfg(unix)]

use std::fs;
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::os::unix::net::UnixListener;
use std::sync::atomic::{AtomicU64, Ordering};

use agent_fabric_review_portal_supervisor::{
    CustodyEntryKind, FileIdentity, inspect_custody_entry, remove_custody_entry,
    validate_cleanup_basename,
};

fn private_directory() -> std::path::PathBuf {
    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(0);
    let nonce = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
    let temporary_root = fs::canonicalize(std::env::temp_dir()).expect("canonical temp root");
    let directory = temporary_root.join(format!("afpc-{}-{nonce:x}", std::process::id()));
    fs::create_dir(&directory).expect("custody directory");
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).expect("private mode");
    directory
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
    remove_custody_entry(&directory, directory_identity, "capsule", entry)
        .expect("remove exact capsule");
    assert!(!directory.join("capsule").exists());

    fs::write(directory.join("capsule"), b"replacement").expect("replacement");
    assert!(remove_custody_entry(&directory, directory_identity, "capsule", entry,).is_err());
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
    assert!(remove_custody_entry(&directory, directory_identity, "capsule", expected,).is_err());
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
    assert!(remove_custody_entry(&directory, directory_identity, "capsule", expected,).is_err());
    assert!(retained.join("capsule").exists());
    fs::remove_file(&directory).expect("remove swap symlink");
    fs::remove_dir_all(&retained).expect("cleanup retained directory");
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
