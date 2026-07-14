---
schema_version: 1
id: <PROJECT-ID>
title: <Vertical slice title>
state: scoped
outcome: <Independently valuable and testable result>
non_goals: []
acceptance:
  - id: AC-1
    criterion: <Observable result>
    evidence_ref: null
links:
  specs: []
  adrs: []
  parent: null
  prs: []
dependencies: []
conflict_keys: []
risk:
  tier: substantial
  factors: []
authority:
  charter_digest: sha256:<64 hex>
  write_paths: []
  prohibited_actions: []
  expires_at: YYYY-MM-DDTHH:MM:SSZ
evidence:
  deterministic: []
  judgement: []
  live: []
review:
  class: cross-primary
  required_families: []
effects:
  allowed: []
pr_strategy: undecided
---

# <Vertical slice title>

## Why

Additional human-readable context, without restating the linked spec.

## Plan notes

Current implementation approach. The issue owns work state, not requirements.

## Discovered work

Link follow-up issues. Do not expand scope silently.
