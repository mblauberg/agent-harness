# Agent fabric activation handoff

Status: historical; superseded by the Project Fabric Console handoff
Effort: agent-fabric-activation
Leg: 6
Supersedes: none
Superseded-by: [Project Fabric Console activation and acceptance](HANDOFF-2026-07-12-project-fabric-console.md)
Consumed-at: 12 July 2026

> Historical activation snapshot only. Do not use the roster, process or test
> counts below as current machine state; query `agent-fabric status --json` and
> `agent-fabric doctor --json`, then follow the successor handoff.

## Goal

Implement and activate all model-execution adapters, a read-only Herdr observer and explicit coordinated seat rotation under the approved [Spec 03](../specs/03-agent-fabric-activation.md).

## Historical snapshot

- Baseline commit: `2e7770f`.
- Stable-runtime coordination daemon, five renewed MCP seats and the read-only `fabric-events` pane are live.
- Claude, Codex, Agy, Cursor and Kiro adapters are active and passed provider-backed read-only smokes.
- Pi is pinned but inactive because no trusted open-weight Pi provider/model is available.

## Successor route

Spec 05 superseded this acceptance route with the current protocol/database
baseline, on-demand daemon lifecycle, generation-bound seats and standalone
Console. Follow the linked successor handoff. Push and release still require
separate explicit authority.

## Final evidence

- Runtime: 91 files / 323 tests, typecheck and build passed.
- Harness: 314 tests; held-out routing 18/18; evaluation 13/13; load 1/1.
- Production dependency audit: zero vulnerabilities.
- Provider smokes: five activated adapters passed pinned executable/wrapper/manifest checks, exact sentinel output and unchanged isolated workspaces.
- Live fabric: five seats healthy; Codex↔Claude acknowledged round trip passed after the final daemon restart.
- Reviews: Fable, native security and native adapter re-reviews are clean at P0-P2.
- Observer: `fabric-events` is live with bounded previews and explicit Brisbane `AEST (UTC+10)` timestamps; the daemon is isolated in the `infrastructure` tab.

## Verification

```sh
npm --prefix runtime/agent-fabric run check
scripts/check-harness
skills/deliver/scripts/validate_delivery.py \
  .agent-run/AFAB-002/RUN.json --workspace-root "$PWD" --verify-hashes
```
