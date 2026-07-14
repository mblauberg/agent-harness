
Preflight stages every normalised row and binding before table replacement;
postflight runs foreign-key/integrity checks, identity/count reconciliation,
canonical path/digest queries and registry-trigger probes. Fault injection at
each staging, rebuild, binding and migration-record boundary exposes the
complete old or complete new schema. `artifact-registry.v1` and
`artifact-content-read.v1` advertise only after postflight passes. Spec 05 owns
all Console paging, disclosure, acceptance and viewport behaviour; this spec
owns only the daemon/client capability boundary.
