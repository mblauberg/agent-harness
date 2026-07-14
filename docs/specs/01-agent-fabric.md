# Shared agent fabric

Status: Normative specification-family package
Family ID: `spec-01-agent-fabric`
Family version: `0.37`
Binding-current content SHA-256: `sha256:c1e7a5503fa8924647189fa08a141bdd692b91d301d935b14512263d03adeada`
Archive content SHA-256: `sha256:7a2156feb6c7f3f15bd96c9583f51b22a42688fd298d4db42db4396573df60d0`
Frozen-source SHA-256: `sha256:7a2156feb6c7f3f15bd96c9583f51b22a42688fd298d4db42db4396573df60d0`
Supersession-map SHA-256: `sha256:5a75b2516c2e906c9b353b847244efbb6eceaf323a5a32e2d5d0aeedc022524d`
Module-set SHA-256: `sha256:5e2d33d92e5000167aca50273a988aadc68cda35aebe6f0f3d28775a862715b4`
Transformation receipt SHA-256: `sha256:bfdf73cd84e86c7a50a61a0f4949dd26cf9e638cbeb99e548584f3e1147a525f`
Machine manifest SHA-256: `sha256:0bd20536b20d7caa6a2ea8183579a77676b7f77e2c2a200b533d8c400c10b84a`
Machine manifest: [manifest.json](01-agent-fabric/manifest.json)
Supersession map: [supersession-map.json](01-agent-fabric/supersession-map.json)

## Binding current (default authority)

The default verified loader returns this net-effective stream. It keeps
every still-effective requirement, moves live baseline rules out of
revision history and replaces only the exact hash-bound slices in the
supersession map. Revision chronology is not current authority.

Physical modules are independently valid Markdown. Their raw concatenation
is not the logical content hash: receipt normalisation strips only recorded
standalone-fence scaffolding and inverses only recorded link relocations.
Where a split crosses a long SQL fence, receipt normalisation
closes and reopens its long SQL fence without changing logical bytes.
Paths, roles, hashes, sequence order, map and receipt are binding.

| Ordinal | Module | Role | Topic | Lines | SHA-256 |
|---:|---|---|---|---:|---|
| 00 | [00-authority-and-status-header.md](01-agent-fabric/00-authority-and-status-header.md) | `shared-current` | Authority and status header | 11 | `sha256:76608ec019d8dfb0e996a8fcf95dd52a5ad6b63f17a4ac03ee81cbc4d22c3b09` |
| 33 | [33-binding-current-authority.md](01-agent-fabric/33-binding-current-authority.md) | `current-only` | Binding-current authority | 21 | `sha256:760d00b7d2ccc0cfb0a030da64c33dc1fe0f22df74355c2e09df583a9cbc2a3a` |
| 02 | [02-foundations-and-execution-control.md](01-agent-fabric/02-foundations-and-execution-control.md) | `shared-current` | Foundations and execution control | 356 | `sha256:276f9a01ce15f27948615b77deb3c69d3992bb4e0a53920bb2ed0cb09ab3978b` |
| 03 | [03-lifecycle-receipts-a.md](01-agent-fabric/03-lifecycle-receipts-a.md) | `shared-current` | Lifecycle receipts A | 707 | `sha256:ad08ac869cbd554c00bf3b80bdcccf282016710153526d3b81c74f8b8fdd0874` |
| 04 | [04-lifecycle-receipts-b.md](01-agent-fabric/04-lifecycle-receipts-b.md) | `shared-current` | Lifecycle receipts B | 590 | `sha256:b05440c93a611c90f29b215f2f4ea46552eb86f48f3904d48affffea05da1b10` |
| 05 | [05-hybrid-topology-and-security.md](01-agent-fabric/05-hybrid-topology-and-security.md) | `shared-current` | Hybrid topology and security | 535 | `sha256:ab6e8592522f64c5879df95d20fd91cb1a617f9481154865df30f5274e2ae486` |
| 06 | [06-observability-and-receipt-export.md](01-agent-fabric/06-observability-and-receipt-export.md) | `shared-current` | Observability and receipt export | 803 | `sha256:15a2cc4f325fdfde1c3207a5257e304c5b24e3bcff6d53648f3a9a3437c0b4ca` |
| 07 | [07-baseline-requirements.md](01-agent-fabric/07-baseline-requirements.md) | `shared-current` | Baseline requirements | 474 | `sha256:018be90469ffb97a33650e563906c3c26d17101060247a3ef4d89b92bb86c88a` |
| 09 | [09-approval-and-delivery-gates.md](01-agent-fabric/09-approval-and-delivery-gates.md) | `shared-current` | Approval and delivery gates | 53 | `sha256:edec96079385d1a8592f8a1dd615a761de3463be5eb80a901ff3d58b95230c52` |
| 10 | [10-project-session-protocol-core.md](01-agent-fabric/10-project-session-protocol-core.md) | `shared-current` | Project-session protocol core | 107 | `sha256:68d1c3833c654d3047c24aa03487c7f3864bea33691b6ec276f7abdfd3d9ff53` |
| 30 | [30-f023-01-current.md](01-agent-fabric/30-f023-01-current.md) | `current-only` | F023-01 binding-current replacement | 11 | `sha256:efecd54a8cfc37ac91b24d8ebf2dea51268a71fa8ddcce722eeb991f671caadb` |
| 25 | [25-project-session-protocol-core-continued-2.md](01-agent-fabric/25-project-session-protocol-core-continued-2.md) | `shared-current` | Project-session protocol core (continued 2) | 15 | `sha256:3a96156fe569ab0ac13ac7bed488c031a9ed1d4711d504142f7dadd02a781b46` |
| 31 | [31-f023-09-current.md](01-agent-fabric/31-f023-09-current.md) | `current-only` | F023-09 binding-current replacement | 7 | `sha256:7cf2085fb6bee742abf1b7b2e13ab3e7e127bf5d8f5baf7887dea1f8107a85e0` |
| 27 | [27-project-session-protocol-core-continued-4.md](01-agent-fabric/27-project-session-protocol-core-continued-4.md) | `shared-current` | Project-session protocol core (continued 4) | 298 | `sha256:ee327139e8bf07cc37f0e99823c7211b148d281b74bb596cb16065976ee7c42d` |
| 11 | [11-operator-bootstrap-and-chair-lifecycle.md](01-agent-fabric/11-operator-bootstrap-and-chair-lifecycle.md) | `shared-current` | Operator bootstrap and chair lifecycle | 643 | `sha256:92defb8eb3dbf677f14c9982eec666de94d38aa22da2c156aa5c07118bbafbfc` |
| 12 | [12-typed-git-authority.md](01-agent-fabric/12-typed-git-authority.md) | `shared-current` | Typed Git authority | 799 | `sha256:31e69cd1897b57908e88d4cd0e3254d9d1d5f2978c6abd81a63f9c65430ef5c5` |
| 13 | [13-operator-artifacts-notifications-budget.md](01-agent-fabric/13-operator-artifacts-notifications-budget.md) | `shared-current` | Operator artifacts, notifications and budget | 280 | `sha256:dcc44e2391679d8b1324479bfb6e87f804f218cca08b4245640ac78ac653547d` |
| 32 | [32-f023-02-current.md](01-agent-fabric/32-f023-02-current.md) | `current-only` | F023-02 binding-current replacement | 18 | `sha256:f82801e564e8bcf569c8698d2001e3df988650c175ed6fc309afa38484ceccd9` |
| 29 | [29-operator-artifacts-notifications-and-budget-continued-2.md](01-agent-fabric/29-operator-artifacts-notifications-and-budget-continued-2.md) | `shared-current` | Operator artifacts, notifications and budget (continued 2) | 248 | `sha256:2d89bd96b9f86cc1bfec2e1ae8806c51ac06f1cbb0252e81a2fca300e11b3d16` |
| 14 | [14-review-publication-and-bundle-a.md](01-agent-fabric/14-review-publication-and-bundle-a.md) | `shared-current` | Review publication and bundle A | 715 | `sha256:64cf9ffb8616e4b0288cfbf8492913a2c3fbe68e95f343998fc4dabdda44d874` |
| 15 | [15-review-bundle-b.md](01-agent-fabric/15-review-bundle-b.md) | `shared-current` | Review bundle B | 497 | `sha256:1f8ac3a0ac861beaa3a8498d84e7b2460b9ca1d049bd4a48870949895de7a3d9` |
| 16 | [16-review-profile-routing-and-results.md](01-agent-fabric/16-review-profile-routing-and-results.md) | `shared-current` | Review profile, routing and results | 726 | `sha256:3eb27dd79d3e0a85d15cef4d6c8fabbe57f0451963141e593284e47a69ed8986` |
| 17 | [17-review-heads-completion-and-recovery.md](01-agent-fabric/17-review-heads-completion-and-recovery.md) | `shared-current` | Review heads, completion and recovery | 673 | `sha256:95d7dea013a8c5c5b06682c7799c5da2ce08659f1cd740a2632ab084882d22fc` |
| 18 | [18-lifecycle-rotation-custody.md](01-agent-fabric/18-lifecycle-rotation-custody.md) | `shared-current` | Lifecycle rotation custody | 339 | `sha256:583eaff7f536009b28d50312437fd573ef063f29770b7fb3cfd81046a143be1c` |
| 19 | [19-deployed-routes-and-telemetry.md](01-agent-fabric/19-deployed-routes-and-telemetry.md) | `shared-current` | Deployed routes and telemetry | 780 | `sha256:5cc3a7e4fe4fabf4a0a67e1c6f60a2c854bee7c70f8575396671e8383163c873` |
| 20 | [20-console-read-and-authority-profiles.md](01-agent-fabric/20-console-read-and-authority-profiles.md) | `shared-current` | Console read and authority profiles | 612 | `sha256:89e4c47ac96cde2858bb4006bdda294d8a6251a4143dac471800b398612c341f` |
| 21 | [21-authority-compilation-a.md](01-agent-fabric/21-authority-compilation-a.md) | `shared-current` | Authority compilation A | 497 | `sha256:7e74404cebb76d34a6349e5add6b847eebec296afb5c8ad157ed25173c71ff3c` |
| 22 | [22-authority-compilation-b.md](01-agent-fabric/22-authority-compilation-b.md) | `shared-current` | Authority compilation B | 513 | `sha256:ff7046616eaf29c543d3a3fc716116af8d74bf5734ff44ea732867f26f298308` |
| 23 | [23-activation-and-acceptance.md](01-agent-fabric/23-activation-and-acceptance.md) | `shared-current` | Activation and acceptance | 70 | `sha256:5169cb9bbc01cdd9f2cdf51411dc02fddd0ba998deabcc8f52def774fc51cfa3` |

## Frozen archive (traceability only)

The archive loader reconstructs the exact frozen source bytes at
`0305376624fdb03e14166a2a831e0053fca367c9`. It exists for audit
and provenance, not implementation. Receipt normalisation strips the
same recorded fence scaffolding and reverses the recorded module-relative
link relocations before checking the frozen line count and SHA-256.

| Ordinal | Module | Role | Topic | Lines | SHA-256 |
|---:|---|---|---|---:|---|
| 00 | [00-authority-and-status-header.md](01-agent-fabric/00-authority-and-status-header.md) | `shared-current` | Authority and status header | 11 | `sha256:76608ec019d8dfb0e996a8fcf95dd52a5ad6b63f17a4ac03ee81cbc4d22c3b09` |
| 01 | [01-version-history.md](01-agent-fabric/01-version-history.md) | `archive-only` | Version history | 119 | `sha256:735dbd96ec82e8cdc6a6fc57dd81a435d63af3a07186976beed145754bcb7a62` |
| 02 | [02-foundations-and-execution-control.md](01-agent-fabric/02-foundations-and-execution-control.md) | `shared-current` | Foundations and execution control | 356 | `sha256:276f9a01ce15f27948615b77deb3c69d3992bb4e0a53920bb2ed0cb09ab3978b` |
| 03 | [03-lifecycle-receipts-a.md](01-agent-fabric/03-lifecycle-receipts-a.md) | `shared-current` | Lifecycle receipts A | 707 | `sha256:ad08ac869cbd554c00bf3b80bdcccf282016710153526d3b81c74f8b8fdd0874` |
| 04 | [04-lifecycle-receipts-b.md](01-agent-fabric/04-lifecycle-receipts-b.md) | `shared-current` | Lifecycle receipts B | 590 | `sha256:b05440c93a611c90f29b215f2f4ea46552eb86f48f3904d48affffea05da1b10` |
| 05 | [05-hybrid-topology-and-security.md](01-agent-fabric/05-hybrid-topology-and-security.md) | `shared-current` | Hybrid topology and security | 535 | `sha256:ab6e8592522f64c5879df95d20fd91cb1a617f9481154865df30f5274e2ae486` |
| 06 | [06-observability-and-receipt-export.md](01-agent-fabric/06-observability-and-receipt-export.md) | `shared-current` | Observability and receipt export | 803 | `sha256:15a2cc4f325fdfde1c3207a5257e304c5b24e3bcff6d53648f3a9a3437c0b4ca` |
| 07 | [07-baseline-requirements.md](01-agent-fabric/07-baseline-requirements.md) | `shared-current` | Baseline requirements | 474 | `sha256:018be90469ffb97a33650e563906c3c26d17101060247a3ef4d89b92bb86c88a` |
| 08 | [08-review-history.md](01-agent-fabric/08-review-history.md) | `archive-only` | Review history | 18 | `sha256:11f62209cc14b2d101afabd47d9fccbe7ea051285cb5e8ef594304d979415594` |
| 09 | [09-approval-and-delivery-gates.md](01-agent-fabric/09-approval-and-delivery-gates.md) | `shared-current` | Approval and delivery gates | 53 | `sha256:edec96079385d1a8592f8a1dd615a761de3463be5eb80a901ff3d58b95230c52` |
| 10 | [10-project-session-protocol-core.md](01-agent-fabric/10-project-session-protocol-core.md) | `shared-current` | Project-session protocol core | 107 | `sha256:68d1c3833c654d3047c24aa03487c7f3864bea33691b6ec276f7abdfd3d9ff53` |
| 24 | [24-f023-01-archive.md](01-agent-fabric/24-f023-01-archive.md) | `archive-only` | F023-01 frozen archive slice | 13 | `sha256:e0ec100771f15fc83137b842ef005bcf15b7d4dd0445b6f95f3d77e7a774d6a9` |
| 25 | [25-project-session-protocol-core-continued-2.md](01-agent-fabric/25-project-session-protocol-core-continued-2.md) | `shared-current` | Project-session protocol core (continued 2) | 15 | `sha256:3a96156fe569ab0ac13ac7bed488c031a9ed1d4711d504142f7dadd02a781b46` |
| 26 | [26-f023-09-archive.md](01-agent-fabric/26-f023-09-archive.md) | `archive-only` | F023-09 frozen archive slice | 6 | `sha256:d96647fb107bc6dc4f35e471dacf0c1f623be3feb1cb97d3cd3f58e28b81a292` |
| 27 | [27-project-session-protocol-core-continued-4.md](01-agent-fabric/27-project-session-protocol-core-continued-4.md) | `shared-current` | Project-session protocol core (continued 4) | 298 | `sha256:ee327139e8bf07cc37f0e99823c7211b148d281b74bb596cb16065976ee7c42d` |
| 11 | [11-operator-bootstrap-and-chair-lifecycle.md](01-agent-fabric/11-operator-bootstrap-and-chair-lifecycle.md) | `shared-current` | Operator bootstrap and chair lifecycle | 643 | `sha256:92defb8eb3dbf677f14c9982eec666de94d38aa22da2c156aa5c07118bbafbfc` |
| 12 | [12-typed-git-authority.md](01-agent-fabric/12-typed-git-authority.md) | `shared-current` | Typed Git authority | 799 | `sha256:31e69cd1897b57908e88d4cd0e3254d9d1d5f2978c6abd81a63f9c65430ef5c5` |
| 13 | [13-operator-artifacts-notifications-budget.md](01-agent-fabric/13-operator-artifacts-notifications-budget.md) | `shared-current` | Operator artifacts, notifications and budget | 280 | `sha256:dcc44e2391679d8b1324479bfb6e87f804f218cca08b4245640ac78ac653547d` |
| 28 | [28-f023-02-archive.md](01-agent-fabric/28-f023-02-archive.md) | `archive-only` | F023-02 frozen archive slice | 17 | `sha256:9504a5d2e9c5dd76256f88ec72151a0c45758ac7c70e68d2d6f3d248c5a7c768` |
| 29 | [29-operator-artifacts-notifications-and-budget-continued-2.md](01-agent-fabric/29-operator-artifacts-notifications-and-budget-continued-2.md) | `shared-current` | Operator artifacts, notifications and budget (continued 2) | 248 | `sha256:2d89bd96b9f86cc1bfec2e1ae8806c51ac06f1cbb0252e81a2fca300e11b3d16` |
| 14 | [14-review-publication-and-bundle-a.md](01-agent-fabric/14-review-publication-and-bundle-a.md) | `shared-current` | Review publication and bundle A | 715 | `sha256:64cf9ffb8616e4b0288cfbf8492913a2c3fbe68e95f343998fc4dabdda44d874` |
| 15 | [15-review-bundle-b.md](01-agent-fabric/15-review-bundle-b.md) | `shared-current` | Review bundle B | 497 | `sha256:1f8ac3a0ac861beaa3a8498d84e7b2460b9ca1d049bd4a48870949895de7a3d9` |
| 16 | [16-review-profile-routing-and-results.md](01-agent-fabric/16-review-profile-routing-and-results.md) | `shared-current` | Review profile, routing and results | 726 | `sha256:3eb27dd79d3e0a85d15cef4d6c8fabbe57f0451963141e593284e47a69ed8986` |
| 17 | [17-review-heads-completion-and-recovery.md](01-agent-fabric/17-review-heads-completion-and-recovery.md) | `shared-current` | Review heads, completion and recovery | 673 | `sha256:95d7dea013a8c5c5b06682c7799c5da2ce08659f1cd740a2632ab084882d22fc` |
| 18 | [18-lifecycle-rotation-custody.md](01-agent-fabric/18-lifecycle-rotation-custody.md) | `shared-current` | Lifecycle rotation custody | 339 | `sha256:583eaff7f536009b28d50312437fd573ef063f29770b7fb3cfd81046a143be1c` |
| 19 | [19-deployed-routes-and-telemetry.md](01-agent-fabric/19-deployed-routes-and-telemetry.md) | `shared-current` | Deployed routes and telemetry | 780 | `sha256:5cc3a7e4fe4fabf4a0a67e1c6f60a2c854bee7c70f8575396671e8383163c873` |
| 20 | [20-console-read-and-authority-profiles.md](01-agent-fabric/20-console-read-and-authority-profiles.md) | `shared-current` | Console read and authority profiles | 612 | `sha256:89e4c47ac96cde2858bb4006bdda294d8a6251a4143dac471800b398612c341f` |
| 21 | [21-authority-compilation-a.md](01-agent-fabric/21-authority-compilation-a.md) | `shared-current` | Authority compilation A | 497 | `sha256:7e74404cebb76d34a6349e5add6b847eebec296afb5c8ad157ed25173c71ff3c` |
| 22 | [22-authority-compilation-b.md](01-agent-fabric/22-authority-compilation-b.md) | `shared-current` | Authority compilation B | 513 | `sha256:ff7046616eaf29c543d3a3fc716116af8d74bf5734ff44ea732867f26f298308` |
| 23 | [23-activation-and-acceptance.md](01-agent-fabric/23-activation-and-acceptance.md) | `shared-current` | Activation and acceptance | 70 | `sha256:5169cb9bbc01cdd9f2cdf51411dc02fddd0ba998deabcc8f52def774fc51cfa3` |
