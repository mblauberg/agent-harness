
Each coordination run has exactly one generation-fenced chair. Every chair
generation change atomically revokes the prior chair lease, abandons its
membership with the exact takeover/recovery reason and
binds the successor lease as the sole active required chair-lease membership;
takeover or bridge recovery cannot leave the new current lease outside project-
session membership. Coordinated
mode has exactly one non-terminal coordination run and may contain many
delivery workstreams under it, but their leads are not additional chairs. A
concurrent attempt to create a second non-terminal run fails. Independent mode
also has exactly one non-terminal coordination run per project session; a
project view represents concurrent unrelated runs as separate independent
project sessions, each with its own chair and session authority. Historical
terminal run rows may remain in either mode without becoming live authority.
A project session never implies cross-run authority.
