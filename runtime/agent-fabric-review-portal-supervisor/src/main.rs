use std::process::ExitCode;

use agent_fabric_review_portal_supervisor::{
    parse_portal_invocation, require_portal_descriptors_closed, run_portal,
};

fn main() -> ExitCode {
    let arguments = std::env::args_os().skip(1).collect::<Vec<_>>();
    let environment = std::env::vars_os().collect::<Vec<_>>();
    let result = parse_portal_invocation(&arguments, &environment)
        .and_then(|config| {
            require_portal_descriptors_closed()?;
            Ok(config)
        })
        .and_then(|config| {
            run_portal(&config).map_err(|error| {
                agent_fabric_review_portal_supervisor::SupervisorError::InvalidInvocation(
                    error.to_string(),
                )
            })
        });
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("review portal helper failed closed: {error}");
            ExitCode::FAILURE
        }
    }
}
