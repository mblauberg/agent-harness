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
    assert!(peer.audit_token.is_some());
}

#[allow(unsafe_code)]
mod libc_test {
    unsafe extern "C" {
        pub fn geteuid() -> u32;
        pub fn getegid() -> u32;
    }
}
