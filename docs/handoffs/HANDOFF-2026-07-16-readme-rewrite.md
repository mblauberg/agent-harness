# Handoff: simplify the repository README

Status: active  
Run: README orientation and skimmability rewrite  
Issue: none; create one only if implementation needs separate tracking  
Supersedes: none  
Consumed-at: pending

## Goal

Rewrite the root [`README.md`](../../README.md) as a clear repository landing
page for a technically capable reader who does not already know Provenant.
Preserve the important operating constraints, but move detailed policy and
implementation explanation to their existing owners.

The result should let a reader quickly answer:

- What is Provenant?
- Why would I use it?
- What do I need to install it?
- What should I run first?
- What are the important limits, and where is the deeper documentation?

This is a documentation-only rewrite. It does not change harness behaviour,
installation, provider activation or support commitments.

## Why change it

The current README is factually sound but uses 1,255 words and 200 lines to
perform several jobs at once. Its opening mixes positioning, implementation
detail and audience qualification. Its quick start mixes commands,
prerequisites, filesystem architecture, installer edge cases, uninstalling and
review policy. The worked example, lifecycle diagram and surrounding prose then
explain much of the same lifecycle three times.

Some phrases also sound defensive or internal rather than welcoming and
direct, including:

- “Coding agents improvise.”
- “An operating system for agent work, not a prompt collection.”
- “Poor fit if you want a prompt pack to skim.”
- “A blocking gap, not a recorded shrug.”
- “The attempt is owed.”

The rewrite should use confident, neutral language and show the value through
specific outcomes instead of contrasting Provenant with an inferior reader or
tool.

## GitHub README practices to apply

The recommendations below come from current GitHub guidance.

### Answer the landing-page questions first

GitHub describes the README as one of the first things a repository visitor
sees. It should explain what the project does, why it is useful, how to get
started, where to get help and who maintains it. See [About the repository
README file](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes).

For Provenant, that means:

- lead with the outcome for Claude Code and Codex users;
- state that this is a personal, changing harness without making that the main
  message;
- place the runnable path before architecture and policy detail; and
- retain clear links to issues and private vulnerability reporting.

### Include only high-value orientation

GitHub's [content-design
principles](https://docs.github.com/en/contributing/writing-for-github-docs/content-design-principles)
recommend creating “just enough” documentation because extra material makes
important content harder to find. They prioritise clarity, meaning,
correctness, consistency and the reader's actual goal.

Apply that principle by linking to canonical owners rather than repeating them:

- [`HARNESS.md`](../../HARNESS.md) owns authority, lifecycle and review policy.
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) owns system structure and design
  rationale.
- [`docs/runbooks/agent-fabric-operations.md`](../runbooks/agent-fabric-operations.md)
  owns Agent Fabric operation.
- [`MAINTAINING.md`](../../MAINTAINING.md) owns repository maintenance.
- [`SECURITY.md`](../../SECURITY.md) owns vulnerability reporting.

### Make the quick start procedural

GitHub's [quickstart content
guidance](https://docs.github.com/en/contributing/style-guide-and-content-model/quickstart-content-type)
recommends stating the audience, prerequisites and intended result, keeping only
essential steps, and linking elsewhere for explanation.

For Provenant:

1. Put requirements before commands.
2. Let the reader install Claude Code support, Codex support or both.
3. Explain the expected installation result.
4. Put verification in its own step.
5. Move installer edge cases and uninstall detail into a short note or collapsed
   section.

The implementation must verify the exact supported development versions before
publishing them. The current root contract is Node.js `>=24.15.0 <25` and npm
`>=11.12.1 <12`; do not reduce that to “Node.js 24”.

### Choose formatting by information type

GitHub's [style
guide](https://docs.github.com/en/contributing/style-guide-and-content-model/style-guide)
favours clear, simple, active language. It recommends reader-ordered unordered
lists and numbered lists for procedures. GitHub also generates a document
outline from headings and supports [`<details>` for optional
material](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections).

Use:

- bullets for benefits, prerequisites and independent constraints;
- numbered lists for installation and verification;
- tables only for compact mappings such as “Need → Skill” or risk → review;
- short prose for explanation and trade-offs; and
- collapsed sections for the full skill catalogue, installer edge cases and
  optional worked example.

Avoid converting connected reasoning into fragments merely to create more
bullets. A list should make parallel items easier to compare or scan.

## Proposed README structure

```text
# Provenant
One-sentence purpose
Badges
Compact personal/pre-release status

## What Provenant adds
Four outcome bullets
Three-component map

## Quick start
Requirements
Install
Verify
Expected result

## Choose a workflow
Existing Need → Skill table

## How it works
One lifecycle diagram
Optional worked example in <details>

## Important constraints
Risk table
Four safety bullets

## Skill library
Existing generated collapsed catalogue

## Documentation and help
Descriptive links
Licence, acknowledgements and notices
```

Aim for roughly 750–900 words and 120–150 lines. These are soft editing targets,
not new repository gates. Prefer removing repetition over removing obligations.

## Section-by-section change

### Opening and status

Replace the current opening with one plain description, for example:

> Provenant is a personal harness for Claude Code and Codex that turns agent
> work into a scoped, verified and independently reviewed delivery workflow.

Follow it with four outcome bullets:

- scope and approve work before implementation;
- run deterministic checks before human review;
- obtain independent review for substantial work; and
- keep acceptance and release as separate human decisions.

Retain the CI and licence badges. Reduce the status paragraph to a short note:
personal harness, interfaces may change, best-effort support, issues for normal
feedback and `SECURITY.md` for vulnerabilities.

### Component map

Name the three components that a new reader needs:

- **Harness:** `HARNESS.md` defines authority, lifecycle and review pressure.
- **Skills:** task-specific procedures load only when relevant.
- **Agent Fabric:** cross-provider execution and durable coordination for Claude
  and Codex; optional providers remain separately activated.

Do not explain the catalogue character budget in the opening. That belongs in
maintainer or architecture documentation.

### Quick start

Put the requirements first:

- Git;
- Python 3.11+;
- Claude Code, Codex or both;
- Node.js and npm at the root workspace versions when running repository
  verification; and
- PyYAML and pytest for the harness checks.

Then present a copyable sequence for clone, `AGENTS_HOME`, installation and
verification. Clarify that exporting `AGENTS_HOME` affects the current shell;
the reader may persist it in their shell configuration.

Keep these installer facts, but express them briefly:

- either platform may be installed independently;
- an existing instruction file is preserved; when the installer prints a
  bootstrap line and exits 3, the reader must paste that line; a Codex
  configuration conflict can also exit 3, so the reader must follow the
  emitted conflict message; and
- the Codex installer adds its managed skill override without replacing the
  rest of `config.toml`.

Move uninstall syntax and the repository filesystem tree into one collapsed
“Installation details” section or link them to maintenance documentation.

State the expected result after verification. Also retain the distinction that
`--doctor` reports configured routes; it does not prove provider sign-in or
reachability.

### Workflows and lifecycle

Move the existing “Core workflows” table directly after the quick start. It is
the clearest navigation surface in the current README and should remain.

Keep one lifecycle diagram. The current text says every human gate can send work
back, while only the specification gate has a drawn return edge. Either adjust
the diagram or use the narrower statement:

> Every gate can stop progression; specification approval and acceptance can
> return work for revision.

Put the worked rate-limiting example in a collapsed section. Refer to “the other
primary” unless the example identifies which family authored the change.

### Constraints and deeper detail

Keep the risk table if review scaling remains a leading differentiator. Move
delivery-profile internals, held-out evaluation detail and bonus-family
mechanics to `HARNESS.md` or Architecture.

Express the durable boundaries as bullets:

- access and credentials do not grant authority;
- branches and worktrees require human approval or an approved authority
  envelope;
- authors do not independently certify their own work; and
- acceptance and release remain human decisions.

Keep the generated skill catalogue and its markers exactly intact. It is
already correctly collapsed and should remain generated rather than manually
maintained.

Replace the final dot-separated link row with a “Documentation and help” list.
Give each important destination a short description. Keep legal and attribution
links compact at the end.

## Facts and constraints that must survive

- Provenant is a personal harness with changing interfaces and best-effort
  support.
- Claude Code and Codex are the supported primary orchestrators.
- Substantial work requires the other-primary review leg before acceptance.
- Routine solo work may complete without that leg; substantial and higher work
  may not.
- Agent Fabric owns answer-bearing provider execution and durable coordination;
  direct command-line calls are preflight or a recorded degraded fallback.
- Specification approval, delivery acceptance and release authority are
  separate human decisions.
- Installation preserves pre-existing instruction files and unrelated Codex
  configuration.
- `--doctor` reports configured routes, not live provider availability.
- The generated skill-count and catalogue markers must remain machine-managed.
- Security reports remain private through `SECURITY.md`.

Do not add compatibility promises, product-readiness claims, a roadmap, a
changelog, provider setup detail or duplicated architecture policy.

## Verification

Run from the repository root:

```sh
git diff --check
python3 scripts/render_skill_catalogue.py --check
python3 skills/engineering-writing/scripts/check_engineering_style.py README.md
python3 scripts/check_harness.py
```

Then inspect the rendered README on GitHub at normal and narrow widths. Verify:

- the purpose and four benefits appear before the first long explanation;
- prerequisites precede every installation command;
- commands are copyable from a fresh clone;
- headings produce a useful GitHub document outline;
- tables do not require horizontal scrolling at a typical narrow width;
- collapsed sections have descriptive summaries;
- every relative link resolves; and
- a new reader can answer the five questions in the Goal section without
  opening Architecture.

## Ordered remainder

1. Rewrite `README.md` only; do not create a parallel overview document.
2. Run the focused verification above.
3. Obtain an independent reader-path review against the five Goal questions.
4. Open a small documentation pull request showing the word/line reduction and
   rendered result.
5. After merge, mark this handoff consumed and remove it from the active index;
   Git history retains it.
