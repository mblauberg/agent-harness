# Contributing to Provenant

Provenant is a personal agent harness that other people can install, so changes
need reproducible evidence. Work from a fork and follow the pull request
template.

Before starting:

- read [`HARNESS.md`](HARNESS.md) for lifecycle, authority and review policy;
- read [`MAINTAINING.md`](MAINTAINING.md) when changing skills or release
  machinery;
- report vulnerabilities through [`SECURITY.md`](SECURITY.md), never in an
  issue; and
- follow the [`Code of Conduct`](CODE_OF_CONDUCT.md).

You need Git, Python 3.11+ with `pytest` and `pyyaml`, and Node.js 24.

## Get the boundary approved

Changes to authority, gates, contracts or routing need an approved standalone
specification in [`docs/specs/`](docs/specs/README.md) before implementation.
This includes changes to `HARNESS.md`, `config/risk-policy.json`,
`config/delivery-profiles.json`, the `deliver` validator and skill routing
descriptions. Bug fixes, documentation and new tests do not need a spec.

The pull request template records the risk tier, authorised write scope and
evidence. [`HARNESS.md`](HARNESS.md) owns those rules and the maintainer-owned
independent review gate.

## Verify the change

Run the repository gate from the checkout root:

```sh
scripts/check-harness
```

It runs policy checks, trigger fixtures, shell parsing, public-release and
static-security scans, and the Python tests. If you change `runtime/`, also run
the root Node.js checks and any evaluation or load command exposed by the
affected workspace:

```sh
npm ci
npm run check
```

Paste exact commands and results into the pull request. Name any skipped gate;
do not imply it passed.

## Change a skill

Use a skill-proposal issue for a new or materially changed skill. The promotion,
trigger-fixture, catalogue-budget and retirement rules live in the
[`MAINTAINING.md`](MAINTAINING.md) sections "Change a skill" and "Promote and
retire".

## Style

Use Australian English: `licence` as a noun, `authorised` and `behaviour`. Do
not use em dashes. Run the style checker on each prose file you change:

```sh
python3 skills/engineering-writing/scripts/check_engineering_style.py FILE
```

The checker is a prompt for review, not proof that the prose is clear.

## Worktrees and licence

Agents follow the branch and worktree authority rules in
[`docs/worktrees.md`](docs/worktrees.md).

By contributing, you agree that your work is licensed under the
[`MIT licence`](LICENSE).
