
## Binding-current authority

Fabric 0.37 uses the accepted capability-compiled authority contract while
keeping workspace writes inert. Every authority boundary uses
`AuthorityEnvelopeV2`; the profile set is exactly `review-readonly` and
`workspace-write-offline`; compilation is monotone and binds an immutable
native-settings receipt; certifying review remains read-only. The write profile
is unavailable until the exact provider tuple passes the Step-3 adversarial
containment gate. This authority enables no write, tool egress, external effect,
deployment or irreversible action.

Fabric has one current database baseline and public protocol. It preserves
incompatible local state without mutation and rejects that state explicitly
instead of importing or emulating it. Fabric owns exact project/session/run
topology, coordinated workstreams, generation-bound live chair handoff and
typed operator effects. An incremental migration number, vintage daemon or
client, implicit run import, retired decoder, coarse authority bundle or
compatibility retry is not an implementation requirement. Current
optional-feature negotiation, provider-capability discovery and pinned adapter
artifacts remain required security controls.
