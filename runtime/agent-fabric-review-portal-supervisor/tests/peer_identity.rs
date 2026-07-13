#![cfg(unix)]
#![allow(unsafe_code)]

use std::os::unix::net::UnixStream;

use agent_fabric_review_portal_supervisor::observe_peer;

#[test]
fn binds_local_peer_credentials_to_pid_start_group_and_session_identity() {
    let (left, _right) = UnixStream::pair().expect("socket pair");
    let peer = observe_peer(&left).expect("peer identity");

    assert_eq!(
        peer.process.process_id,
        i32::try_from(std::process::id()).expect("pid")
    );
    assert!(peer.process.start_token > 0);
    assert_eq!(peer.effective_user_id, unsafe { libc_test::geteuid() });
    assert_eq!(peer.effective_group_id, unsafe { libc_test::getegid() });
    #[cfg(target_os = "macos")]
    {
        assert!(peer.audit_token.is_some());
        assert!(peer.process_id_version.is_some_and(|version| version > 0));
    }
}

#[cfg(target_os = "macos")]
#[test]
fn rejects_tampered_darwin_audit_token_identity_and_generation() {
    use agent_fabric_review_portal_supervisor::{
        validate_darwin_audit_token_fields, validate_darwin_peer_generation,
    };

    let (left, _right) = UnixStream::pair().expect("socket pair");
    let peer = observe_peer(&left).expect("peer identity");
    let token = peer.audit_token.expect("Darwin audit token");

    let mut wrong_pid = token;
    wrong_pid[5] = wrong_pid[5].wrapping_add(1);
    assert!(
        validate_darwin_audit_token_fields(
            wrong_pid,
            peer.effective_user_id,
            peer.effective_group_id,
            peer.process.process_id,
        )
        .is_err()
    );

    let mut wrong_generation = token;
    wrong_generation[7] = wrong_generation[7].wrapping_add(1);
    assert!(validate_darwin_peer_generation(wrong_generation).is_err());
}

#[allow(unsafe_code)]
mod libc_test {
    unsafe extern "C" {
        pub fn geteuid() -> u32;
        pub fn getegid() -> u32;
    }
}
