use std::ffi::OsString;

use agent_fabric_review_portal_supervisor::{
    PORTAL_MODE, REVIEW_ACTION_ENV, REVIEW_CONTRACT_ENV, REVIEW_SOCKET_ENV, parse_portal_invocation,
};

fn exact_environment() -> Vec<(OsString, OsString)> {
    vec![
        (REVIEW_SOCKET_ENV.into(), "/tmp/review-portal.sock".into()),
        (REVIEW_ACTION_ENV.into(), "cursor/action-01".into()),
        (
            REVIEW_CONTRACT_ENV.into(),
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
        ),
    ]
}

#[test]
fn accepts_only_the_fixed_portal_mode_and_three_locator_environment() {
    let config = parse_portal_invocation(&[PORTAL_MODE.into()], &exact_environment())
        .expect("the exact portal invocation must be admitted");

    assert_eq!(config.socket_path.to_str(), Some("/tmp/review-portal.sock"));
    assert_eq!(config.action_locator, "cursor/action-01");
    assert_eq!(
        config.contract_locator,
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
}

#[test]
fn rejects_extra_arguments_and_ambient_environment() {
    assert!(parse_portal_invocation(&[], &exact_environment()).is_err());
    assert!(
        parse_portal_invocation(&[PORTAL_MODE.into(), "extra".into()], &exact_environment())
            .is_err()
    );

    let mut ambient = exact_environment();
    ambient.push(("PATH".into(), "/usr/bin".into()));
    assert!(parse_portal_invocation(&[PORTAL_MODE.into()], &ambient).is_err());
}
