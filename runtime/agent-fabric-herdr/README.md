# Agent Fabric Herdr adapter

This package is the optional, non-authoritative boundary between Agent Fabric
and Herdr. It exposes typed pane, presence, focus, wake, metadata, attention,
notification and direct-steer operations. It does not own coordination state,
authority, persistence or provider sessions.

## Use the adapter

Provide three ports to `HerdrAdapter`:

- `FabricActionJournalPort`, backed by Fabric's durable stable-action records;
- `HerdrControlPort`, backed by the admitted Herdr CLI or socket integration;
- `HerdrPresencePort`, backed only by structured presence metadata.

Fabric must prepare an action and its intent digest before calling
`HerdrAdapter.execute`. The adapter records `dispatched` before the external
call. If the call or its receipt is uncertain, it performs lookup and leaves the
action `ambiguous`; it never blindly repeats the effect.

Provider readiness requires exact reconciliation of project, session, run,
agent, provider, model, provider-session reference and session generation.
Pane existence alone returns `identity-unverified`. Missing Herdr visibility
returns provider state `unknown`, not lost or stopped.

## Direct steering

Use `DirectSteerService` only for one-way steering where no answer is needed.
It requires:

- explicit `fireAndForget: true`;
- a caller-supplied Fabric task or message reference;
- authoritative validation of that exact reference and target;
- no acknowledgement, expected result or dependent completion barrier; and
- a terminal-neutral prompt of at most 4096 UTF-8 bytes.

Fabric prepares the stable action before injection. A successful pane write is
reported only as `dispatched-unconfirmed`; it is never a delivery
acknowledgement and cannot complete expected work or close a barrier.

## Degraded artifact collection

When structured provider callback is unavailable, call
`createDegradedArtifactCollectionPlan` with the exact artifact path and digest,
request task/message, collector, stable collection action, deadline and finite
attempt bound. Run `collectDegradedArtifact` through a Fabric-authorised
artifact resolver. The function stops at the declared bound or deadline and
reports missing or conflicting evidence explicitly.

Even a matching digest is `collected-unverified`. A separate authorised Fabric
workflow must review and commit any result or completion transition; this
fallback supplies neither delivery evidence nor barrier satisfaction.

## Verify

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

Tests use only fake Fabric and Herdr ports. They do not start Herdr, inject text,
open panes or perform other external effects.
