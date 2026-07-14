
- Spec 01 remains the coordination, authority and provider-session contract.
  Its amendment in this implementation shall own project-session entities,
  operator principals, scoped gates, result-delivery state and atomic
  request/reply/task completion.
- Spec 02 remains the adaptive harness and delivery-lifecycle contract.
- Spec 03 remains the model-adapter activation and Herdr observation contract.
- Spec 04 remains the protocol, persistence, trust and operational-hardening
  contract. Its amendment shall own lock-safe on-demand bootstrap, global
  daemon liveness/stop predicates, persistence migration and crash recovery.
- This spec owns the project Console, operator projection, adaptive session
  launch, human-attention workflow, Herdr control integration and optional Git
  and GitHub operator adapters.

Specs 01 and 04 shall be amended and accepted before implementation can claim
this spec complete. Product requirements remain here; transaction, schema and
daemon invariants remain with their existing canonical owners.
