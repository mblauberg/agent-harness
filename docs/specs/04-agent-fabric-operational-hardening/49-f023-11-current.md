
`constraints_json` is a canonical hash mirror, not the enforcement owner. The
current schema stores normalised closed child rows for concrete operation
variants, registered remote identities/revisions/generations/target digests,
fully qualified refs and canonical path prefixes. Operation variants use a
closed enumeration and reject every gate-only value. Composite foreign keys
bind each remote child to `git_remote_registrations`. Empty child sets mean
unavailable for that category; no query treats absence as wildcard.
