# EFFORT: project fabric console

Updated: 15 July 2026

Status: Console W012 implementation is complete under the [W012/W013 reducer,
issue #23](https://github.com/mblauberg/provenant/issues/23). GitHub issues own
live implementation and acceptance state; this file is only the compact route.

## Current W012 route

- The child-bridge, expired-principal and partial first-frame timing repairs are
  complete in [issues
  #64](https://github.com/mblauberg/provenant/issues/64),
  [#71](https://github.com/mblauberg/provenant/issues/71),
  [#74](https://github.com/mblauberg/provenant/issues/74),
  [#76](https://github.com/mblauberg/provenant/issues/76).
- The final bounded Console repairs are complete: pagination in [issue
  #72](https://github.com/mblauberg/provenant/issues/72) and [PR
  #90](https://github.com/mblauberg/provenant/pull/90); existing-session reopen
  in [issue #75](https://github.com/mblauberg/provenant/issues/75), [PR
  #91](https://github.com/mblauberg/provenant/pull/91) and [PR
  #92](https://github.com/mblauberg/provenant/pull/92); and daemon-stop custody
  in [issue #82](https://github.com/mblauberg/provenant/issues/82) and [PR
  #94](https://github.com/mblauberg/provenant/pull/94). No active Console
  implementation lane remains.

The linked issues own their acceptance criteria and evidence. Merged pull
requests and historical lane detail remain in Git and are not repeated here.

## Human gates

- [Issue #20](https://github.com/mblauberg/provenant/issues/20): verify the
  private W007 receipt against the exact hosted and mutation evidence, then
  explicitly accept W007. The public machine evidence is complete.
- [Issue #22](https://github.com/mblauberg/provenant/issues/22): under the
  [provider-write containment
  specification](../specs/agent-fabric/provider-write-containment.md),
  separately approve the inert W010-A prerequisite, separately grant the
  W010-B live matrix, then explicitly accept a conclusive exact tuple and
  authorise the first provider write grant before W011.
- [Issue #27](https://github.com/mblauberg/provenant/issues/27): choose and
  provision the external lifecycle receipt authority boundary, and separately
  authorise destructive abandon.
- [Issue #30](https://github.com/mblauberg/provenant/issues/30): ratify the
  narrow risk-tier `crucial` envelope used by merged PR #62 or direct a revert;
  after ratification, explicitly accept the machine-verified result.
- [Issue #23](https://github.com/mblauberg/provenant/issues/23): explicitly
  accept the programme only after W013 passes on one current head.

## Completion

Issue #23 is the only programme reducer and W013 owner. W013 begins only when
W012 has no required implementation gap without an explicit disposition. It
then runs the programme-wide deterministic, security, publication, evaluation,
load, live-MCP, provider-family and usability gates with fresh independent
native and other-primary review. Passing or merging machine work does not
replace the human gates in [HARNESS.md](../../HARNESS.md).
