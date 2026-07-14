# Source and coverage map

## Repository baseline

- Repository: `mblauberg/provenant`
- Default branch: `main`
- Reviewed commit: `9f168eed9ac7001744d372a840be9648bb11edcf`
- Prior audit baseline: `0ea935f8ccaad550d8db0f9ea40324f58bdda569`
- Distance reported by comparison: 70 commits ahead, 0 behind
- Review mode: connected GitHub static inspection

## Principal evidence

| Area | Paths/surfaces |
|---|---|
| Product and constitution | `README.md`, `AGENTS.md`, `HARNESS.md`, `docs/ARCHITECTURE.md` |
| Decisions | `docs/adr/README.md`, ADRs 0002–0008, review decision register |
| Autonomous charter | `docs/agent-harness-comprehensive-review/CHAIR-CHARTER.md` |
| Current work | `docs/efforts/EFFORT-capability-profiles.md`, active V2 handoff |
| Specifications | Spec index; Specs 01, 02, 04 and 05; amendment audit |
| Document skills | `scope`, `engineering-docs`, `session`, `work-map`, `implement`, `orchestrate` |
| Build/CI | root `package.json`, `.github/workflows/ci.yml`, PR #7 |
| Issue/PR governance | issue template config, feature form, PR template, `CONTRIBUTING.md` |
| Runtime concentration | Fabric façade, lifecycle engine |
| Console | presenter and renderer/interaction entrypoint |
| Review portal | Rust README/library and CI matrix |
| Provider compatibility | `config/adapter-compatibility.yaml` |
| Gate/decision protocol | `operator-actions.ts`, `gates.ts` |
| Generated catalogue | `scripts/render_skill_catalogue.py`, harness gate |
| History/status | recent commits, PRs, workflow/status connector results |

## Current-head evidence boundary

The review found:

- a substantially improved CI definition;
- extensive local verification recorded in merged PR #7;
- a cancelled PR-associated workflow run for the PR #7 head;
- no PR-associated workflow evidence returned for the current reviewed head;
- the active effort map's explicit red Fabric/Rust baseline.

The connector's commit-workflow wrapper returns pull-request-triggered runs only,
so an absent result is not proof that no push run exists. This report therefore
does not claim current-head CI success or failure beyond the repository's own
recorded integration state.

## Not executed

- root npm install/build/test;
- Fabric/Console/Herdr tests;
- Rust build/tests;
- database migration/baseline;
- provider calls;
- Console human evaluation;
- installer/update;
- static security and release checks;
- branch/ruleset verification;
- live issue/PR mutation;
- operating-system containment.

## Audit interpretation

A source file or test definition establishes implementation intent. A reported
local result establishes a claim by the author. A current, independently
retrievable workflow result or reproduced local run establishes execution
evidence. These are kept separate throughout the assessment.
