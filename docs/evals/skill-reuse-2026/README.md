# Skill-reuse routing evaluation

Status: pass at the declared exact-route threshold.

The frozen dataset contains the eight canonical routing cases changed by the
skill-reuse repair. The retained packet excludes expected routes. Three fresh,
no-retry subscription invocations used GPT-5.6 Luna, Terra and Sol at low
reasoning effort. The accepted candidate scored 24/24 exact primary-plus-
companion routes.

`receipt.json` binds the dataset, complete candidate catalogue, classifier,
packet and raw JSON outputs to candidate commit
`92faf6dba6821c13adf30263e6a96886028ae1c2` and tree
`1bc740cee36042397a525039c5c140465c3ccf68`. Validate it from the repository
root:

```sh
python3 scripts/validate_skill_routing_evaluation.py \
  docs/evals/skill-reuse-2026/receipt.json
```

`attempts.json` retains two response-schema rejections that occurred before
inference and two semantic non-passes. Their raw packets and outputs remain
under `attempts/`; no failed row was relabelled or copied into the passing run.

These are direct Codex CLI subscription invocations because Agent Fabric had no
reachable daemon or active adapter during this run. The receipt records that
adapter honestly and does not claim Fabric provider-action certification,
cross-provider independence, production task success or human acceptance.
