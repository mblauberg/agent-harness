# EFFORT: project fabric console

Updated: 15 July 2026

Status: active under the [W012/W013 reducer, issue
#23](https://github.com/mblauberg/provenant/issues/23). GitHub issues own live
implementation and acceptance state; this file is only the compact route.

## Current W012 route

- The child-loss cleanup, expired-principal timing repair and partial
  first-frame timing repair are complete in [issues
  #64](https://github.com/mblauberg/provenant/issues/64),
  [#71](https://github.com/mblauberg/provenant/issues/71) and
  [#76](https://github.com/mblauberg/provenant/issues/76).
- [Issue #74](https://github.com/mblauberg/provenant/issues/74) owns the
  remaining deterministic child-bridge test barrier.
- [Issues #72](https://github.com/mblauberg/provenant/issues/72) and
  [#75](https://github.com/mblauberg/provenant/issues/75) own two distinct
  Console full-suite failures whose public error currently hides the failing
  internal stage. Each remains diagnose-first and independently reviewable.
- [Issue #82](https://github.com/mblauberg/provenant/issues/82) owns the
  daemon-stop custody race. Diagnosis identifies competing automatic and
  explicit stop owners; the focused test/support-only repair plan requires
  explicit human approval before implementation.

The linked issues own their acceptance criteria and evidence. Merged pull
requests and historical lane detail remain in Git and are not repeated here.

## Human gates

- [Issue #20](https://github.com/mblauberg/provenant/issues/20): verify the
  private W007 receipt against the exact hosted and mutation evidence, then
  explicitly accept W007. The public machine evidence is complete.
- [Issue #22](https://github.com/mblauberg/provenant/issues/22): separately
  approve the inert W010-A prerequisite, separately grant the W010-B live
  matrix, then explicitly accept a conclusive exact tuple and authorise the
  first provider write grant before W011.
- [Issue #27](https://github.com/mblauberg/provenant/issues/27): choose and
  provision the external lifecycle receipt authority boundary, and separately
  authorise destructive abandon.
- [Issue #30](https://github.com/mblauberg/provenant/issues/30): ratify the
  narrow risk-tier `crucial` envelope used by merged PR #62 or direct a revert;
  after ratification, explicitly accept the machine-verified result.
- [Issue #82](https://github.com/mblauberg/provenant/issues/82): approve the
  focused test/support repair plan before implementation.
- [Issue #23](https://github.com/mblauberg/provenant/issues/23): explicitly
  accept the programme only after W013 passes on one current head.

## Completion

Issue #23 is the only programme reducer and W013 owner. W013 begins only when
W012 has no required implementation gap without an explicit disposition. It
then runs the programme-wide deterministic, security, publication, evaluation,
load, live-MCP, provider-family and usability gates with fresh independent
native and other-primary review. Passing or merging machine work does not
replace the human gates in [HARNESS.md](../../HARNESS.md).
