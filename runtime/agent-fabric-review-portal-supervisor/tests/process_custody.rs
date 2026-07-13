#![cfg(unix)]
#![allow(unsafe_code)]

use std::io::{BufRead, BufReader};
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::time::Instant;

use agent_fabric_review_portal_supervisor::{
    CleanupTrigger, ProcessError, TERMINATION_GRACE, TerminationEvidence, TerminationOutcome,
    cleanup_on_control_eof, observe_process, terminate_process_group_and_reap,
    verify_process_identity,
};

#[test]
fn observes_and_rejects_drift_in_pid_start_group_or_session_identity() {
    let identity = observe_process(i32::try_from(std::process::id()).expect("pid"))
        .expect("current process identity");
    assert!(identity.start_token > 0);
    verify_process_identity(identity).expect("stable identity");
    assert!(matches!(
        verify_process_identity(agent_fabric_review_portal_supervisor::ProcessIdentity {
            start_token: identity.start_token + 1,
            ..identity
        }),
        Err(ProcessError::IdentityMismatch)
    ));
}

#[test]
fn control_eof_terminates_and_reaps_the_exact_isolated_child() {
    let mut command = Command::new("/bin/sleep");
    command.arg("60");
    unsafe {
        command.pre_exec(|| {
            if libc_test::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let mut child = command.spawn().expect("isolated child");
    let identity =
        observe_process(i32::try_from(child.id()).expect("child pid")).expect("child identity");

    let started = Instant::now();
    assert_eq!(
        cleanup_on_control_eof(std::io::Cursor::new(Vec::<u8>::new()), identity)
            .expect("control EOF cleanup"),
        TerminationEvidence {
            trigger: CleanupTrigger::ControlEof,
            outcome: TerminationOutcome::Terminated,
        },
    );
    assert!(started.elapsed() < TERMINATION_GRACE);
    let _ = child.wait();
}

#[test]
fn term_then_kills_and_reaps_a_term_resistant_isolated_process_group() {
    let mut command = Command::new("/bin/sh");
    command
        .args(["-c", "trap '' TERM; printf 'ready\\n'; while :; do :; done"])
        .stdout(Stdio::piped());
    unsafe {
        command.pre_exec(|| {
            if libc_test::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let mut child = command.spawn().expect("isolated child");
    let mut ready = String::new();
    BufReader::new(child.stdout.take().expect("child stdout"))
        .read_line(&mut ready)
        .expect("child ready line");
    assert_eq!(ready, "ready\n");
    let process_id = i32::try_from(child.id()).expect("child pid");
    let identity = observe_process(process_id).expect("child identity");
    assert_eq!(identity.process_group_id, process_id);
    assert_eq!(identity.session_id, process_id);

    let started = Instant::now();
    let outcome = terminate_process_group_and_reap(identity, CleanupTrigger::Deadline)
        .expect("bounded cleanup");
    assert_eq!(
        outcome,
        TerminationEvidence {
            trigger: CleanupTrigger::Deadline,
            outcome: TerminationOutcome::Killed,
        }
    );
    assert!(started.elapsed() >= TERMINATION_GRACE);
    assert!(observe_process(process_id).is_err());
    let _ = child.wait();
}

#[test]
fn leader_exit_during_grace_cannot_leave_a_term_resistant_descendant_alive() {
    let mut command = Command::new("/bin/sh");
    command
        .args([
            "-c",
            "trap 'exit 0' TERM; /bin/sh -c 'trap \"\" TERM; while :; do :; done' & printf '%s\\n' \"$!\"; while :; do :; done",
        ])
        .stdout(Stdio::piped());
    unsafe {
        command.pre_exec(|| {
            if libc_test::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let mut child = command.spawn().expect("isolated group leader");
    let mut descendant_line = String::new();
    BufReader::new(child.stdout.take().expect("child stdout"))
        .read_line(&mut descendant_line)
        .expect("descendant pid line");
    let descendant_id = descendant_line
        .trim()
        .parse::<i32>()
        .expect("descendant pid");
    let process_id = i32::try_from(child.id()).expect("leader pid");
    let identity = observe_process(process_id).expect("leader identity");

    let outcome = terminate_process_group_and_reap(identity, CleanupTrigger::Cancellation);
    if outcome.is_err() {
        unsafe {
            libc_test::kill(-identity.process_group_id, 9);
        }
    }
    let _ = child.wait();

    assert_eq!(
        outcome.expect("complete group cleanup"),
        TerminationEvidence {
            trigger: CleanupTrigger::Cancellation,
            outcome: TerminationOutcome::Killed,
        }
    );
    assert!(observe_process(descendant_id).is_err());
}

#[test]
fn detects_setsid_or_reparent_escape_from_the_expected_custody_ancestry() {
    let custody_root =
        observe_process(i32::try_from(std::process::id()).expect("pid")).expect("custody root");
    let mut normal = Command::new("/bin/sleep")
        .arg("60")
        .spawn()
        .expect("normal child");
    let normal_identity =
        observe_process(i32::try_from(normal.id()).expect("pid")).expect("normal identity");
    agent_fabric_review_portal_supervisor::verify_process_within_custody(
        normal_identity,
        custody_root,
    )
    .expect("normal descendant");
    normal.kill().expect("kill normal child");
    normal.wait().expect("reap normal child");

    let mut escaped_command = Command::new("/bin/sleep");
    escaped_command.arg("60");
    unsafe {
        escaped_command.pre_exec(|| {
            if libc_test::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let mut escaped = escaped_command.spawn().expect("escaped child");
    let escaped_identity =
        observe_process(i32::try_from(escaped.id()).expect("pid")).expect("escaped identity");
    assert!(
        agent_fabric_review_portal_supervisor::verify_process_within_custody(
            escaped_identity,
            custody_root,
        )
        .is_err()
    );
    escaped.kill().expect("kill escaped child");
    escaped.wait().expect("reap escaped child");
}

#[allow(unsafe_code)]
mod libc_test {
    unsafe extern "C" {
        pub fn setsid() -> std::os::raw::c_int;
        pub fn kill(
            process_id: std::os::raw::c_int,
            signal: std::os::raw::c_int,
        ) -> std::os::raw::c_int;
    }
}
