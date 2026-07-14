# Security, authority and effects

## 1. Authority principle

Possession of credentials, full-host access or provider capability does not grant permission.

Effective authority is:

```text
human envelope
∩ WorkItem scope
∩ workspace ownership
∩ risk policy
∩ provider capability
∩ local trust posture
∩ budget
∩ effect ceiling
```

Delegation only narrows authority.

That intersection is not a free-form notion. It compiles to exactly one closed
contract — `AuthorityEnvelopeV2` (ADR 0002; dimensions, digests and containment
receipt in `25_AUTHORITY_V2_AND_CONTAINMENT.md`, contract projection in
`03_MINIMAL_CONTRACTS.md` §1.2 and §2). Every principle in this document is a
statement about V2, not about a parallel authority shape. An omitted dimension is
a refusal, not an allowance.

## 2. Initial capability profiles

Implement only:

### `review-readonly`

- admitted repository roots are read-only;
- no network by default;
- no external effects;
- search, read and permitted test metadata;
- suitable for review, exploration and research.

### `workspace-write-offline`

- one exact owned worktree is writable;
- parent, sibling and denied paths inaccessible;
- network denied;
- no push, merge, release, tracker or deployment credentials;
- bounded shell/edit/test tools;
- external effects prohibited;
- exact effective settings recorded.

Do not add networked write profiles until the offline profile is independently proven.

## 3. Worktrees are not security boundaries

A worktree provides collaboration and ownership isolation. It does not prove containment from:

- sibling directories;
- symlinks;
- process inspection;
- same-user secrets;
- network egress;
- other local processes.

The write pilot must prove the actual provider and OS containment mechanism.

## 4. Trust modes

### Cooperative local

Agents are expected to follow policy. Native sandbox, ownership, exact effects and receipts reduce accidents.

### Adversarial content

Issues, files, web pages and tool outputs may contain malicious instructions.

Required:

- provenance classification;
- trusted instruction separation;
- network and tool restriction;
- secret minimisation;
- typed effects;
- adaptive prompt-injection tests.

### Adversarial process

A model-controlled process may execute arbitrary code under the same operating-system identity.

Required where this claim is made:

- container, VM or separate OS identity;
- kernel-enforced filesystem and network controls;
- isolated credentials;
- explicit limitation statements.

Do not claim protections that are not implemented.

## 5. Untrusted data rule

Repository content, issue text, web content, dependency metadata and tool output are data, not authority.

They cannot:

- broaden permissions;
- change the objective;
- authorise an effect;
- override system or human instructions;
- select credentials;
- disable checks.

## 6. Secrets

Write-capable provider sessions receive no general external-effect credentials.

Where a deterministic check needs a secret:

- prefer a test-specific credential;
- scope it narrowly;
- inject it only into the deterministic process;
- do not expose it to model context where avoidable;
- record its class, not value;
- revoke or expire it.

## 7. Effect plane

External effects include:

- branch or tag mutation;
- push;
- PR creation/update/merge;
- issue or Jira mutation;
- package publication;
- deployment;
- infrastructure mutation;
- email or message sending;
- artefact upload;
- production activation.

The model produces an `EffectProposal`. A trusted executor:

1. verifies authority and approvals;
2. validates target and payload;
3. checks preconditions;
4. obtains minimum credentials;
5. executes exactly once or reconciles ambiguity;
6. records the external receipt;
7. observes outcome where required.

## 8. Ambiguity

On timeout or lost response:

- do not blindly retry;
- use the idempotency key and lookup recipe;
- compare expected and observed revision;
- record unresolved ambiguity;
- require human action where exact state cannot be established.

## 9. Security acceptance for write pilot

The pilot must test:

- parent and sibling path escape;
- symlink and junction escape;
- dot-dot and canonicalisation;
- Git metadata mutation;
- network access;
- environment and secret access;
- process inheritance;
- provider settings override;
- tool expansion;
- stale authority;
- stale workspace generation;
- lease loss;
- crash and restart;
- effect attempts;
- prompt-injection attempts.

Model refusal without a tool attempt is not containment evidence.

## 10. Security documentation

Maintain a control matrix:

| Control | Declared | Enforced | Tested | Independently reviewed | Limitations |
|---|---:|---:|---:|---:|---|

Documentation must not present declared controls as implemented controls.
