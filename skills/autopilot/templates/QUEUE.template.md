# QUEUE — durable work queue + item-lease ledger
<!--
  CONDUCTOR-OWNED. This is the single durable queue AND the crash-safety
  lease ledger (see references/state-contract.md). Record-before-launch:
  flip a row to LEASED with lease-owner + lease-expiry BEFORE dispatching;
  clear the lease only on RECONCILE (the top of the next iteration).

  STATUS vocabulary (controlled — do not invent ad-hoc statuses):
    PENDING   — selectable; not yet dispatched.
    LEASED    — in flight; lease-owner + lease-expiry must be set.
    DONE      — completed; result recorded (delegated decisions point at
                their implement/deliver receipt path in "notes").
    BLOCKED   — dependency or escalation-gated; see GOAL.md Escalation-gated
                items / STATE.md Blockers.
    DEFERRED  — intentionally postponed (why in "notes").

  Dependency-ordered tiers keep foundational one-way-doors first; the
  tiering mechanism is fixed, tier contents are mission instance data.
-->

## Tier 0 — foundational one-way-doors
<!-- gate everything downstream; select first -->

| id | status | depends-on | lease-owner | lease-expiry | notes |
|----|--------|------------|-------------|---------------|-------|

## Tier 1+

| id | status | depends-on | lease-owner | lease-expiry | notes |
|----|--------|------------|-------------|---------------|-------|

## Count summary
<!-- reconcile EVERY item to exactly one disposition before accepting a PAUSED idle checkpoint -->

- pending: 0 · leased: 0 · done: 0 · blocked: 0 · deferred: 0
- total items: 0
