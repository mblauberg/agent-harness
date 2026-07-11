# EFFORT: agent fabric activation

Updated: 11 July 2026
Status: awaiting final human acceptance

## Destination

Deliver [Spec 03](../specs/03-agent-fabric-activation.md): safely activate all model adapters, add a read-only Herdr observer and implement explicit coordinated seat rotation.

## Route

- [x] Leg 1 — approved activation contract, boundary tests and release evidence
- [x] Leg 2 — Claude, Codex, Pi, Agy and Cursor hardened and pinned
- [x] Leg 3 — Kiro ACP implemented and pinned
- [x] Leg 4 — Herdr observer and explicit coordinated rotation complete
- [x] Leg 5 — staged activation, pinned provider smokes, independent review and repair complete
- [ ] Leg 6 — final human acceptance and observation close

## Blocked / parked

- Pi execution only: installed Pi exposes no configured open-weight provider/model. Its wrapper and contract are pinned, but routing remains disabled instead of substituting a closed model.

## Invariants

- Follow [Spec 03](../specs/03-agent-fabric-activation.md) and [HARNESS.md](../../HARNESS.md).
- One serial release operator; partition source writers.
- No adapter joins `activeAdapters` before its negative boundary and compatibility gates pass.
- Preserve coordination-only rollback and never expose capability files. The explicit local observer may render terminal-safe 160-character message previews.

## Trail

- 11 July 2026 Codex: activation authority received; native and Fable audits found real boundary prerequisites, so staged hardening began before configuration promotion.
- 11 July 2026 Codex: Claude/Haiku, Codex/GPT-5.4-mini, Agy/Gemini 3.1 Pro, Cursor/Composer 2.5 and Kiro/DeepSeek 3.2 passed real read-only spawn/turn/release smokes.
- 11 July 2026 Codex: old run closed with a receipt, the five-seat generation renewed atomically, health and two-way smokes passed, and the explicit observer authority/pane started. Machine-specific IDs and expiry are available through `agent-fabric status --json`.
- 11 July 2026 Codex/Fable/native reviewers: closed adapter activation, Kiro confinement/recovery, observer authority, router rollback, Codex notification and Agy session-identity defects. Final reviews are clean at P0-P2.
- 11 July 2026 final gate: runtime 91 files/323 tests, whole harness 314 tests, held-out routing 18/18, evaluation 13/13, load 1/1 and production dependency audit zero vulnerabilities. All five provider smokes verified pinned executable/wrapper/manifest digests, exact output and an unchanged isolated workspace.
