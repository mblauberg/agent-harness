
Public project-session transition cannot enter `quiescing`; the typed,
receipt-producing project-drain custody is its sole owner and changes the
session and every affected run atomically. Public transitions among `active`,
`visibility_degraded`, `reconciling`, `recovery_required` and `quarantined`
likewise compare-and-set the session, affected runs and current chair leases in
one transaction. Work-admitting targets keep the current chair lease active;
reconciliation, recovery and quarantine freeze it. Reactivation requires a
live current-chair capability plus exact active required run and current-chair-
lease membership. A durable lost launched-chair bridge reserves every
lifecycle departure to chair-recovery custody.
