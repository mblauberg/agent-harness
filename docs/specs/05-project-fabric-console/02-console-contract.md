
## 1. Decision and relationship to existing specs

Build a project-scoped operator Console as a separate executable package over
the shared agent fabric. The Console is the human's primary local view of
project state, active runs, agents, evidence and decisions. It may initiate
explicitly requested project sessions and typed operator actions, but it is not
another task orchestrator or authority store.
