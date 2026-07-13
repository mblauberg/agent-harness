---
name: refactor
description: Use for an approved behaviour-preserving structural change with equivalence, locality and deletion evidence. Not for new observable behaviour, unresolved failures, read-only architecture exploration or cosmetic churn.
---

# Refactor

Improve internal structure while preserving the approved observable contract.

## Contract

Before editing, record:

- behaviours and interfaces that must remain stable;
- current consumers and compatibility obligations;
- structural pressure and desired locality;
- protected state, migrations and recovery paths;
- exact deletion target;
- deterministic equivalence evidence.

For a pre-release or private system with no evidenced consumer, default to a
direct cutover. A compatibility path requires a named consumer, owner, expiry,
usage signal, removal test and approved waiver.

## Method

1. Characterise the affected behaviour, including failure and recovery paths.
2. Draw the current ownership/dependency shape when the change crosses modules.
3. Establish the smallest useful boundary only when it reduces change
   amplification; avoid pass-through wrappers and anaemic services.
4. Move one coherent responsibility at a time. Keep transactions and effect
   ownership explicit.
5. Run targeted equivalence tests after each structural step.
6. Delete superseded code, tests, adapters, flags and documentation in the same
   tranche unless an approved compatibility obligation prevents it.
7. Run dependency, interface, migration, fault and clean-checkout gates.
8. Obtain independent review focused on behaviour preservation, architecture
   locality, compatibility debt and deletion completeness.

## Evidence

Return:

- before/after ownership or dependency map;
- equivalence and negative-test results;
- public API/schema differences;
- compatibility decision and evidence;
- deleted paths and residual debt;
- recovery/migration result;
- review findings and adjudication.

If observable behaviour must change, separate it into an approved `implement`
or `tdd` scope. If the target architecture is uncertain, use
`architecture-review` before implementation.
