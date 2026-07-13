# Tooling, installation, security and infrastructure

## 1. Root workspace

### Recommendation

Add a root Node workspace before introducing a sophisticated task runner.

Illustrative:

```json
{
  "private": true,
  "packageManager": "npm@<pinned>",
  "workspaces": ["runtime/agent-fabric-*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "check": "npm run check:generated && npm run typecheck && npm run build && npm run test",
    "audit:prod": "npm audit --omit=dev --audit-level=high --workspaces"
  }
}
```

Use one lockfile and TypeScript project references. Continue to pin dependencies. Add Nx/Turbo only if measured build times or cache sharing justify it.

### Python

Use `pyproject.toml` for:

- minimum Python;
- pytest configuration;
- formatting/linting;
- PyYAML/test dependencies;
- console entry points for installer/worktree/check tools if consolidated.

Do not migrate working Python scripts to TypeScript solely for language uniformity.

## 2. Unified CLI

Create a product-level CLI:

```text
harness install
harness update
harness uninstall
harness doctor
harness status
harness init-project
harness policy check
harness model route
harness worktree ...
harness fabric ...
harness console
harness retention ...
harness export ...
```

All commands support `--json`.

### Installer options

```text
--target claude|codex|both
--scope user|project
--profile core|full|custom
--mode copy|link
--dry-run
```

### Installation transaction

1. discover provider locations;
2. validate source/package manifest;
3. calculate plan;
4. detect unmanaged conflicts;
5. back up managed blocks/files;
6. install/copy/link atomically;
7. generate provider config/hooks;
8. run doctor;
9. commit installation manifest;
10. roll back on failure.

Link mode is for harness development. Copy/package mode is the reliable distribution default.

## 3. Instruction layering

### User/global

Small bootstrap only:

- authority and safety precedence;
- how to locate the installed harness;
- when to invoke intake/lifecycle;
- cross-project preference policy.

No absolute repository path.

### Project root

`AGENTS.md`:

- project outcome/context;
- build/test commands;
- repository conventions;
- authority/worktree/effect policy;
- canonical docs.

`CLAUDE.md` imports `AGENTS.md` and adds Claude-only mechanics.

### Path scoped

- nested `AGENTS.md`;
- `.claude/rules/*.md`;
- generated/provider-specific metadata.

Do not duplicate the full constitution.

## 4. Hook compiler

Canonical policy:

```yaml
events:
  session_start:
    - register_session
    - attest_authority
  before_tool:
    - classify_effect
    - enforce_path_profile
  after_tool:
    - record_observation
  stop:
    - validate_checkpoint
    - submit_receipt
```

Compiler outputs provider-native configurations and conformance tests.

### Uses

- session/thread registration;
- provider identity;
- authority-profile digest;
- worktree/cwd validation;
- command/effect observation;
- checkpoint/receipt;
- prompt/tool injection alerts;
- redaction.

### Limits

A hook may fail, be unsupported or be bypassed by provider behaviour. Hard guarantees remain in:

- provider sandbox/permissions;
- Fabric authorization;
- effect executor;
- OS/container controls;
- database constraints.

## 5. Configuration hierarchy

```text
portable defaults
  < user policy overlay
  < project policy overlay
  < approved run envelope
  < task delegation
  < provider capability intersection
```

Later layers may narrow; only explicit human authority may broaden.

### Files

```text
config/
  adapters/catalog.yaml        # portable
  models/intents.yaml          # portable intent bands
  policies/*.yaml              # portable
.agent/local/
  adapters/*.attestation.json  # machine-local, gitignored
  activation.yaml              # user/project local
```

Machine facts:

- absolute executable;
- digest;
- version;
- platform/architecture;
- observed capabilities;
- smoke result;
- observed time/expiry.

Portable facts:

- adapter ID/protocol;
- expected capability schema;
- supported/tested version range;
- policy constraints;
- support level.

## 6. Security architecture

### 6.1 Threat model

Define assets:

- authority capabilities;
- provider credentials;
- source/worktrees;
- private inputs;
- Fabric database/evidence;
- external effect credentials;
- release artefacts;
- model/provider session references.

Define adversaries:

- accidental model/tool action;
- malicious repository content;
- prompt injection through tools/web/issues;
- compromised dependency/provider adapter;
- malicious same-user process;
- unauthorised local user;
- stale/replayed action;
- confused deputy;
- supply-chain compromise.

Define trust modes and explicit non-goals.

### 6.2 Credential model

- no general external-effect credential in model environment;
- per-run/task capability with expiry;
- capability references rather than values in logs/config;
- OS credential store/keychain where appropriate;
- executor-specific credentials;
- rotation and revocation;
- redaction tests;
- no token passthrough between services;
- audit exact use.

### 6.3 Network

Profiles:

- off;
- package-registry allowlist;
- test endpoint allowlist;
- research web through mediated tool;
- effect executor exact destination.

Record DNS/domain/IP policy and redirects. Fail closed on unsupported enforcement. Do not call a network profile “restricted” if the substrate cannot enforce it.

### 6.4 Tool and path policy

- provider-neutral tool classes;
- exact provider compilation;
- canonical real paths;
- symlink/hard-link escape tests;
- worktree ownership;
- protected paths;
- command templates or sandbox rather than brittle string allowlists;
- no arbitrary effect shell.

### 6.5 Prompt/tool injection

Checks should cover:

- untrusted tool/resource labels;
- issue/PR content;
- web results;
- generated instructions;
- cross-agent messages;
- memory/notes promotion;
- provider tool descriptions;
- effect proposal payloads.

Treat external content as data. Authority never comes from content.

## 7. Security evidence implementation map

The catalogue should include:

```yaml
checks:
  secrets-scan:
    status: implemented
    command: ...
    version: ...
  sast-typescript:
    status: implemented
  prompt-injection-tests:
    status: project-provided
  provenance:
    status: release-only
  licence:
    status: implemented
```

Statuses:

- implemented;
- project-provided;
- external-manual;
- unavailable;
- not-applicable.

A required unavailable check blocks or triggers an explicit accepted-risk gate.

## 8. CI

### Preserve

- least-privilege workflow permissions;
- immutable action SHAs;
- locked installs;
- production dependency audit;
- separate evaluation/load suites;
- clean protocol build assertions.

### Add

1. generated-file/manifest check;
2. root workspace build;
3. formatter/linter;
4. architecture boundaries;
5. coverage for critical policy/recovery paths;
6. secrets scanning;
7. TypeScript SAST;
8. licence/SBOM;
9. macOS runner for supported POSIX paths;
10. installer smoke by target/scope/mode;
11. database migration/recovery matrix;
12. provider adapter conformance;
13. release candidate workflow with authorised live smokes;
14. artefact retention and provenance.

Avoid running real provider calls on untrusted pull requests.

## 9. Repository governance

### Branch/ruleset

For release candidates:

- pull request required;
- named checks required;
- conversation resolution;
- no force push;
- signed/tagged release as desired;
- CODEOWNERS only where there are actual independent owners;
- merge queue optional.

A personal project can allow direct work, but the release commit should still be independently checkable.

### PR evidence

Retain the current substantive template. Generate evidence links where possible instead of asking authors to paste facts already in receipts.

### Contribution

Add `CONTRIBUTING.md` or explicitly decline outside contributions. Include:

- support matrix;
- setup;
- tests;
- design/spec authority;
- breaking-change policy;
- security reporting;
- AI contribution disclosure/evidence expectations if desired.

## 10. Release and supply chain

When distributing:

- reproducible package/binary;
- source commit;
- lockfile;
- SBOM;
- provenance attestation;
- checksums/signature;
- third-party notices;
- migration/rollback;
- installer compatibility;
- support status.

Keep optional provider packages separate so their SDKs and release cadence do not expand the core attack surface.

## 11. Portability

### Honest near-term support

Declare:

- macOS arm64/x64: supported after CI/acceptance;
- Linux x64/arm64: supported after CI/acceptance;
- Windows: unsupported or experimental until IPC, permissions, symlinks and installer are implemented.

### Abstractions

- local transport port: Unix socket / named pipe / loopback;
- credential store port;
- file-permission port;
- process supervision port;
- platform path resolver;
- terminal capabilities;
- executable attestation.

Do not scatter platform checks across command handlers.

## 12. Observability and telemetry

Local by default. Collect:

- state transitions;
- provider action latency/result;
- model/effort route;
- tokens/cost where provider reports;
- review findings/yield;
- deterministic gate results;
- retries/degradation;
- human decision latency;
- effect outcomes;
- retention volume.

Do not retain raw private prompts by default. Use redacted summaries/digests and project policy.

## 13. Operational runbooks

Keep runbooks task-oriented:

- install/update/rollback;
- trust/provision;
- start/attach;
- provider upgrade;
- recovery;
- lost chair;
- ambiguous effect;
- database cutover;
- retention/legal hold;
- release acceptance;
- incident bundle.

Generate command examples from CLI metadata to prevent drift.

## 14. Completion criteria

- root workspace and one build graph;
- cross-platform installer modes;
- generated instruction/hooks/config;
- portable/local configuration split;
- explicit threat modes;
- real security evidence implementation map;
- staged effect credentials;
- supported OS matrix in CI;
- release provenance;
- unified doctor/status.
