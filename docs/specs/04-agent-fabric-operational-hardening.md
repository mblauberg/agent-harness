# Agent fabric operational hardening

Status: Normative specification-family package
Family ID: `spec-04-agent-fabric-operational-hardening`
Family version: `1.32`
Binding-current content SHA-256: `sha256:54606d63c75844506519b5fcb8dbf98efdff7f159c728f0599237f66f5e86ee2`
Archive content SHA-256: `sha256:69354c6dc226d81e1b719a2006a54045942e17fbefc8e11ba381721c0880af17`
Frozen-source SHA-256: `sha256:69354c6dc226d81e1b719a2006a54045942e17fbefc8e11ba381721c0880af17`
Supersession-map SHA-256: `sha256:8ab59b93f0d97fdef434838f4d67f99565176a1cdd4b6f8365697daf84c319d2`
Module-set SHA-256: `sha256:57213ded76af085d743472ca5924d28ec1d1fb0443af4c142458ae77ce4716aa`
Transformation receipt SHA-256: `sha256:6c04197c012715821d6ed8346b72651ba28446669c4227edfc8d0f2649992ea2`
Machine manifest SHA-256: `sha256:e2fc12bd4f8a8dacea8258bdc70068b474fcadccd14815f7772a42c54f992193`
Machine manifest: [manifest.json](04-agent-fabric-operational-hardening/manifest.json)
Supersession map: [supersession-map.json](04-agent-fabric-operational-hardening/supersession-map.json)

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
| 00 | [00-authority-and-status-header.md](04-agent-fabric-operational-hardening/00-authority-and-status-header.md) | `shared-current` | Authority and status header | 13 | `sha256:41e8ab2296d5942c61e041c42a2f622184d565541cbac8e79be5424e6bf401fa` |
| 62 | [62-binding-current-authority.md](04-agent-fabric-operational-hardening/62-binding-current-authority.md) | `current-only` | Binding-current authority | 18 | `sha256:f168a3b7a6be19e38002720e23b976de70a479126cfaf7522d692a0d24a734b5` |
| 02 | [02-baseline-hardening.md](04-agent-fabric-operational-hardening/02-baseline-hardening.md) | `shared-current` | Baseline hardening | 239 | `sha256:5a505770fd607410afd033472cc0ed2bc903fd6f85fea66e1aa772292359d1c8` |
| 46 | [46-f023-10-current.md](04-agent-fabric-operational-hardening/46-f023-10-current.md) | `current-only` | F023-10 binding-current replacement | 6 | `sha256:058375ed9c5ae69cfe935c841faa7f22c86aefad0a49d8f969b36724b855faa8` |
| 20 | [20-console-and-daemon-foundations-continued-1.md](04-agent-fabric-operational-hardening/20-console-and-daemon-foundations-continued-1.md) | `shared-current` | Console and daemon foundations (continued 1) | 616 | `sha256:76ba7791939cc65898f8b800aa951b203a2d0728339c4a0e9b8e3c348f303752` |
| 47 | [47-f023-03-current.md](04-agent-fabric-operational-hardening/47-f023-03-current.md) | `current-only` | F023-03 binding-current replacement | 16 | `sha256:eb0d3e6eb77eba7401ea7e0ca35fd4421acd345a7edca5874dd06a566f589c24` |
| 48 | [48-f023-04-current.md](04-agent-fabric-operational-hardening/48-f023-04-current.md) | `current-only` | F023-04 binding-current replacement | 19 | `sha256:6952535b39992edf42403ef990330fb246aa9aa5d4750508a32189605ffd3738` |
| 22 | [22-typed-git-custody-schema-continued-1.md](04-agent-fabric-operational-hardening/22-typed-git-custody-schema-continued-1.md) | `shared-current` | Typed Git custody schema (continued 1) | 86 | `sha256:331d182ea35092676da8aaeb57153d23f8638f7cad93842482b87d4576cd345a` |
| 49 | [49-f023-11-current.md](04-agent-fabric-operational-hardening/49-f023-11-current.md) | `current-only` | F023-11 binding-current replacement | 8 | `sha256:dd4aaf046d7bfc09ca65b87c13989c76c235588076cf29d577abd583e2830e0a` |
| 24 | [24-typed-git-custody-schema-continued-3.md](04-agent-fabric-operational-hardening/24-typed-git-custody-schema-continued-3.md) | `shared-current` | Typed Git custody schema (continued 3) | 285 | `sha256:a1941444a85cfc8c4da5d14c366f53ef2db6f6952472a4bbb2e2f8aafd1fb426` |
| 05 | [05-typed-git-recovery.md](04-agent-fabric-operational-hardening/05-typed-git-recovery.md) | `shared-current` | Typed Git recovery | 5 | `sha256:6448cc538a89f9c52365e8da4c62bcf7aa4c3ae9d2e9a9c1ef11314cbf124e73` |
| 50 | [50-f023-12-current.md](04-agent-fabric-operational-hardening/50-f023-12-current.md) | `current-only` | F023-12 binding-current replacement | 7 | `sha256:43919bf01db1baf354907d1c854f9c0d2c1cfb2ff4cea17ad5e56cbe6af314f6` |
| 26 | [26-typed-git-recovery-continued-2.md](04-agent-fabric-operational-hardening/26-typed-git-recovery-continued-2.md) | `shared-current` | Typed Git recovery (continued 2) | 432 | `sha256:55f906b089851b7edea4ddf4461bf4d72b3682db6f897056e5fc9e940db51d7c` |
| 51 | [51-f023-13-current.md](04-agent-fabric-operational-hardening/51-f023-13-current.md) | `current-only` | F023-13 binding-current replacement | 16 | `sha256:9c8f3cfb52cf4828350f506410fa9411e31366ca59a8b7dc91cedbd70baea375` |
| 52 | [52-f023-14-current.md](04-agent-fabric-operational-hardening/52-f023-14-current.md) | `current-only` | F023-14 binding-current replacement | 9 | `sha256:99c303f9f4ac8d99488d658fc69494e2558d3c670ef9cb3fac3243aed3cb3f21` |
| 53 | [53-f023-15-current.md](04-agent-fabric-operational-hardening/53-f023-15-current.md) | `current-only` | F023-15 binding-current replacement | 8 | `sha256:f2afaec52935c41c69326f23abdc22dd89e5d72509a52d118d0a47d97d814193` |
| 30 | [30-typed-git-recovery-continued-6.md](04-agent-fabric-operational-hardening/30-typed-git-recovery-continued-6.md) | `shared-current` | Typed Git recovery (continued 6) | 94 | `sha256:535d236dfa0690aa024d58dfb30e53cbcf6d33cc0e53a6e87dcd7e3587953771` |
| 06 | [06-console-effect-and-budget-custody.md](04-agent-fabric-operational-hardening/06-console-effect-and-budget-custody.md) | `shared-current` | Console effect and budget custody | 101 | `sha256:90c7e3abc0f13633060fcddd4cfd91ec3e9da098cdccf74f2df0299cec4b4568` |
| 54 | [54-f023-05-current.md](04-agent-fabric-operational-hardening/54-f023-05-current.md) | `current-only` | F023-05 binding-current replacement | 17 | `sha256:d46686547f2ece3f650067f077b6298ea36214df11ec4d89e36e7d13de7b812a` |
| 32 | [32-console-effect-and-budget-custody-continued-2.md](04-agent-fabric-operational-hardening/32-console-effect-and-budget-custody-continued-2.md) | `shared-current` | Console effect and budget custody (continued 2) | 9 | `sha256:ebdf04f73767f6c74882bb0efec0955e6944286759bce8d24fe9a7fe988a9b14` |
| 55 | [55-f023-16-current.md](04-agent-fabric-operational-hardening/55-f023-16-current.md) | `current-only` | F023-16 binding-current replacement | 5 | `sha256:c1c674a40793bb06b8ff5669cc7eac4bb94c8bbb2cad1d2d800bef942cf52df0` |
| 56 | [56-f023-17-current.md](04-agent-fabric-operational-hardening/56-f023-17-current.md) | `current-only` | F023-17 binding-current replacement | 7 | `sha256:0339baeca3eb09ababf4f1511f01cdb63bda70788316501973a39d48bd0a14fc` |
| 35 | [35-console-effect-and-budget-custody-continued-5.md](04-agent-fabric-operational-hardening/35-console-effect-and-budget-custody-continued-5.md) | `shared-current` | Console effect and budget custody (continued 5) | 6 | `sha256:31d423aca8d6261ecd987c52f6d25a0d092c691cfce46ea3e7dc608a72216d1f` |
| 57 | [57-f023-18-current.md](04-agent-fabric-operational-hardening/57-f023-18-current.md) | `current-only` | F023-18 binding-current replacement | 10 | `sha256:0da7f6a13d15c6b524b830fb0b607dcf9ed1084a8a222b856627f579274bc9d9` |
| 37 | [37-console-effect-and-budget-custody-continued-7.md](04-agent-fabric-operational-hardening/37-console-effect-and-budget-custody-continued-7.md) | `shared-current` | Console effect and budget custody (continued 7) | 135 | `sha256:cee51439a7ad2b256e0f81d0615df5f6b3a6bbf4c3bae165420c7c73d3454e70` |
| 58 | [58-f023-19-current.md](04-agent-fabric-operational-hardening/58-f023-19-current.md) | `current-only` | F023-19 binding-current replacement | 11 | `sha256:ac0b51dad9cb9e6af001132b1fa3777bac0ee1d5d55563eb4b6f44c206c4486f` |
| 39 | [39-console-effect-and-budget-custody-continued-9.md](04-agent-fabric-operational-hardening/39-console-effect-and-budget-custody-continued-9.md) | `shared-current` | Console effect and budget custody (continued 9) | 156 | `sha256:73d07128cea3cff0b3cee3260d43542219f545baf6cb49ce5b8dcca15b533ee9` |
| 59 | [59-f023-06-current.md](04-agent-fabric-operational-hardening/59-f023-06-current.md) | `current-only` | F023-06 binding-current replacement | 20 | `sha256:a14dadb0e6a9c92c9226bcf448b16b0c06cd90e400b7f1a8fbd973d189e76364` |
| 41 | [41-console-effect-and-budget-custody-continued-11.md](04-agent-fabric-operational-hardening/41-console-effect-and-budget-custody-continued-11.md) | `shared-current` | Console effect and budget custody (continued 11) | 17 | `sha256:54269cb1e1c4372019853d7c838b979acde240758e52cc4d33702cc451e9966e` |
| 60 | [60-f023-07-current.md](04-agent-fabric-operational-hardening/60-f023-07-current.md) | `current-only` | F023-07 binding-current replacement | 27 | `sha256:fe446b2e9ceda0af9efd1d1883cb6870b160d1f0ce4f71259b59a816b56d7609` |
| 43 | [43-console-effect-and-budget-custody-continued-13.md](04-agent-fabric-operational-hardening/43-console-effect-and-budget-custody-continued-13.md) | `shared-current` | Console effect and budget custody (continued 13) | 122 | `sha256:8ce5e2b201aade8d1a04ecb9047eb4e925ab982b16e942071f3ccdbfb1ddadde` |
| 07 | [07-review-bundle-and-target-persistence.md](04-agent-fabric-operational-hardening/07-review-bundle-and-target-persistence.md) | `shared-current` | Review bundle and target persistence | 795 | `sha256:d1e48ba67261c9f15af41397e2552e3ec6a53a8d559a73e4b02ab1f5f2708aa4` |
| 08 | [08-review-route-admission-a.md](04-agent-fabric-operational-hardening/08-review-route-admission-a.md) | `shared-current` | Review route admission A | 701 | `sha256:9a39e45d7ea996d03c43a3ddf9745ca3d52cc8d09b5f5af6349a8cecfd6de116` |
| 09 | [09-review-route-admission-b.md](04-agent-fabric-operational-hardening/09-review-route-admission-b.md) | `shared-current` | Review route admission B | 700 | `sha256:7dfeb4112957840b886ba522de4f314dd87ba46152ff008a6f7a7ac565935e72` |
| 10 | [10-review-route-admission-c.md](04-agent-fabric-operational-hardening/10-review-route-admission-c.md) | `shared-current` | Review route admission C | 664 | `sha256:ae4383f177085bb37ba9c7ee4e07261d26e406d3aea6859207abbea1e1504320` |
| 11 | [11-review-results-heads-and-recovery.md](04-agent-fabric-operational-hardening/11-review-results-heads-and-recovery.md) | `shared-current` | Review results, heads and recovery | 630 | `sha256:3fdc7f727dcb6684980cb1046fe41234817999ef4e43ad06e62b14889140df58` |
| 12 | [12-lifecycle-rotation-schema-a.md](04-agent-fabric-operational-hardening/12-lifecycle-rotation-schema-a.md) | `shared-current` | Lifecycle rotation schema A | 865 | `sha256:9e6bca970e8f37542fc59e32427a0ff26838de6c6c674a361fbc3d1de5e767b4` |
| 13 | [13-lifecycle-rotation-schema-b.md](04-agent-fabric-operational-hardening/13-lifecycle-rotation-schema-b.md) | `shared-current` | Lifecycle rotation schema B | 784 | `sha256:a4d7649b306ef8fcf03b5fdfa3d01191b702b8353a41e1064cf3684651f468a7` |
| 14 | [14-lifecycle-rotation-schema-c.md](04-agent-fabric-operational-hardening/14-lifecycle-rotation-schema-c.md) | `shared-current` | Lifecycle rotation schema C | 857 | `sha256:121605295a18408efa8794c17d8196afaed3ec70de4b825b1f905b4d84ee53ae` |
| 15 | [15-capability-route-persistence-a.md](04-agent-fabric-operational-hardening/15-capability-route-persistence-a.md) | `shared-current` | Capability route persistence A | 768 | `sha256:76df2a2896906eca97484f03ef62bbeb007a6d43607c63ca75e104c2f6aa1270` |
| 16 | [16-capability-route-persistence-b.md](04-agent-fabric-operational-hardening/16-capability-route-persistence-b.md) | `shared-current` | Capability route persistence B | 710 | `sha256:f4eabbee63b8925daed398eacacd2512d9f5046bc6f77ec271793ebe317a4611` |
| 17 | [17-authority-attestation-and-receipts.md](04-agent-fabric-operational-hardening/17-authority-attestation-and-receipts.md) | `shared-current` | Authority attestation and receipts | 851 | `sha256:5bdf73ec4a4b5571ed1a61191e17fb2fe12e1cd92c782ee8aedc8319ba737b41` |
| 18 | [18-authority-enforcement-and-telemetry.md](04-agent-fabric-operational-hardening/18-authority-enforcement-and-telemetry.md) | `shared-current` | Authority enforcement and telemetry | 174 | `sha256:15f3ef204d8676ccdc8bd42bc9542cf2c61b70d320ff6792e6b5fe340a45e57c` |
| 61 | [61-f023-20-current.md](04-agent-fabric-operational-hardening/61-f023-20-current.md) | `current-only` | F023-20 binding-current replacement | 24 | `sha256:e4c20a98a98835f433e48018ea936e8b6e3ebb8d406a81462a76a92edc2dec64` |
| 45 | [45-authority-enforcement-and-telemetry-continued-2.md](04-agent-fabric-operational-hardening/45-authority-enforcement-and-telemetry-continued-2.md) | `shared-current` | Authority enforcement and telemetry (continued 2) | 635 | `sha256:5d355a39804017c7768f059361698d230217da000d61a322c18e61886d774a32` |
| 19 | [19-console-read-persistence.md](04-agent-fabric-operational-hardening/19-console-read-persistence.md) | `shared-current` | Console read persistence | 262 | `sha256:e9f1c6408f053943976b8af092a28c11a842d8d46339fcbd9b94db3c27f23006` |

## Frozen archive (traceability only)

The archive loader reconstructs the exact frozen source bytes at
`0305376624fdb03e14166a2a831e0053fca367c9`. It exists for audit
and provenance, not implementation. Receipt normalisation strips the
same recorded fence scaffolding and reverses the recorded module-relative
link relocations before checking the frozen line count and SHA-256.

| Ordinal | Module | Role | Topic | Lines | SHA-256 |
|---:|---|---|---|---:|---|
| 00 | [00-authority-and-status-header.md](04-agent-fabric-operational-hardening/00-authority-and-status-header.md) | `shared-current` | Authority and status header | 13 | `sha256:41e8ab2296d5942c61e041c42a2f622184d565541cbac8e79be5424e6bf401fa` |
| 01 | [01-version-history.md](04-agent-fabric-operational-hardening/01-version-history.md) | `archive-only` | Version history | 96 | `sha256:27d4e939a8f0bbdd2a84be6601b7c1d83fe1636f71f42870e6325876fbb0c9f5` |
| 02 | [02-baseline-hardening.md](04-agent-fabric-operational-hardening/02-baseline-hardening.md) | `shared-current` | Baseline hardening | 239 | `sha256:5a505770fd607410afd033472cc0ed2bc903fd6f85fea66e1aa772292359d1c8` |
| 03 | [03-console-daemon-foundations.md](04-agent-fabric-operational-hardening/03-console-daemon-foundations.md) | `archive-only` | Console and daemon foundations | 8 | `sha256:f6af6f6957caadf354aee6966d8de04e4d9bdfce9e1cf075fa541e8e8da0a9aa` |
| 20 | [20-console-and-daemon-foundations-continued-1.md](04-agent-fabric-operational-hardening/20-console-and-daemon-foundations-continued-1.md) | `shared-current` | Console and daemon foundations (continued 1) | 616 | `sha256:76ba7791939cc65898f8b800aa951b203a2d0728339c4a0e9b8e3c348f303752` |
| 21 | [21-f023-03-archive.md](04-agent-fabric-operational-hardening/21-f023-03-archive.md) | `archive-only` | F023-03 frozen archive slice | 16 | `sha256:025d7583fb15926ff17657676d1df1ac38a4f834611b5504164ea20ff73e716c` |
| 04 | [04-typed-git-custody-schema.md](04-agent-fabric-operational-hardening/04-typed-git-custody-schema.md) | `archive-only` | Typed Git custody schema | 20 | `sha256:6cae396ccff2f71dc8ccd79ec9b113100c1ecc9bd7cba7ac068fdb9e05ef90ad` |
| 22 | [22-typed-git-custody-schema-continued-1.md](04-agent-fabric-operational-hardening/22-typed-git-custody-schema-continued-1.md) | `shared-current` | Typed Git custody schema (continued 1) | 86 | `sha256:331d182ea35092676da8aaeb57153d23f8638f7cad93842482b87d4576cd345a` |
| 23 | [23-f023-11-archive.md](04-agent-fabric-operational-hardening/23-f023-11-archive.md) | `archive-only` | F023-11 frozen archive slice | 8 | `sha256:f4d897467a3703911ed034554bd2b37837271ae0e69dc4e8fafb6a385f1e1f99` |
| 24 | [24-typed-git-custody-schema-continued-3.md](04-agent-fabric-operational-hardening/24-typed-git-custody-schema-continued-3.md) | `shared-current` | Typed Git custody schema (continued 3) | 285 | `sha256:a1941444a85cfc8c4da5d14c366f53ef2db6f6952472a4bbb2e2f8aafd1fb426` |
| 05 | [05-typed-git-recovery.md](04-agent-fabric-operational-hardening/05-typed-git-recovery.md) | `shared-current` | Typed Git recovery | 5 | `sha256:6448cc538a89f9c52365e8da4c62bcf7aa4c3ae9d2e9a9c1ef11314cbf124e73` |
| 25 | [25-f023-12-archive.md](04-agent-fabric-operational-hardening/25-f023-12-archive.md) | `archive-only` | F023-12 frozen archive slice | 9 | `sha256:8f8cd6a41f3ab8b40a1afe251510234f5cdf01128f004a92e1eae72d98819b90` |
| 26 | [26-typed-git-recovery-continued-2.md](04-agent-fabric-operational-hardening/26-typed-git-recovery-continued-2.md) | `shared-current` | Typed Git recovery (continued 2) | 432 | `sha256:55f906b089851b7edea4ddf4461bf4d72b3682db6f897056e5fc9e940db51d7c` |
| 27 | [27-f023-13-archive.md](04-agent-fabric-operational-hardening/27-f023-13-archive.md) | `archive-only` | F023-13 frozen archive slice | 15 | `sha256:7e55bebc4a6160070d48e8c250f0c48f5c39a7caca6826324c3888d6df4b9bf6` |
| 28 | [28-f023-14-archive.md](04-agent-fabric-operational-hardening/28-f023-14-archive.md) | `archive-only` | F023-14 frozen archive slice | 10 | `sha256:3842c3bdcff6017c0c2a7c202b4b5ac7c2d38fd7fb87544b178a9e604ea35e89` |
| 29 | [29-f023-15-archive.md](04-agent-fabric-operational-hardening/29-f023-15-archive.md) | `archive-only` | F023-15 frozen archive slice | 8 | `sha256:70f2c7e3c1ceae3585efda26692f8d778dc19b8aeb614f213e837a312ff25627` |
| 30 | [30-typed-git-recovery-continued-6.md](04-agent-fabric-operational-hardening/30-typed-git-recovery-continued-6.md) | `shared-current` | Typed Git recovery (continued 6) | 94 | `sha256:535d236dfa0690aa024d58dfb30e53cbcf6d33cc0e53a6e87dcd7e3587953771` |
| 06 | [06-console-effect-and-budget-custody.md](04-agent-fabric-operational-hardening/06-console-effect-and-budget-custody.md) | `shared-current` | Console effect and budget custody | 101 | `sha256:90c7e3abc0f13633060fcddd4cfd91ec3e9da098cdccf74f2df0299cec4b4568` |
| 31 | [31-f023-05-archive.md](04-agent-fabric-operational-hardening/31-f023-05-archive.md) | `archive-only` | F023-05 frozen archive slice | 18 | `sha256:0df85185847245d22ef643806985f71bbf5e4a841071d80dadee03f048e2460b` |
| 32 | [32-console-effect-and-budget-custody-continued-2.md](04-agent-fabric-operational-hardening/32-console-effect-and-budget-custody-continued-2.md) | `shared-current` | Console effect and budget custody (continued 2) | 9 | `sha256:ebdf04f73767f6c74882bb0efec0955e6944286759bce8d24fe9a7fe988a9b14` |
| 33 | [33-f023-16-archive.md](04-agent-fabric-operational-hardening/33-f023-16-archive.md) | `archive-only` | F023-16 frozen archive slice | 5 | `sha256:81652e0774d3728ca7318f6873df02021a4f24139cd97755d635aec042d67984` |
| 34 | [34-f023-17-archive.md](04-agent-fabric-operational-hardening/34-f023-17-archive.md) | `archive-only` | F023-17 frozen archive slice | 7 | `sha256:0891942d356561e6f4a21aab10684f94872f4a9944958c23cb3e2ff3d6c8fcc7` |
| 35 | [35-console-effect-and-budget-custody-continued-5.md](04-agent-fabric-operational-hardening/35-console-effect-and-budget-custody-continued-5.md) | `shared-current` | Console effect and budget custody (continued 5) | 6 | `sha256:31d423aca8d6261ecd987c52f6d25a0d092c691cfce46ea3e7dc608a72216d1f` |
| 36 | [36-f023-18-archive.md](04-agent-fabric-operational-hardening/36-f023-18-archive.md) | `archive-only` | F023-18 frozen archive slice | 9 | `sha256:eb56ceeb849167562b1cc7358ed93124666272ef93eab985d058529f12009935` |
| 37 | [37-console-effect-and-budget-custody-continued-7.md](04-agent-fabric-operational-hardening/37-console-effect-and-budget-custody-continued-7.md) | `shared-current` | Console effect and budget custody (continued 7) | 135 | `sha256:cee51439a7ad2b256e0f81d0615df5f6b3a6bbf4c3bae165420c7c73d3454e70` |
| 38 | [38-f023-19-archive.md](04-agent-fabric-operational-hardening/38-f023-19-archive.md) | `archive-only` | F023-19 frozen archive slice | 11 | `sha256:93171aa640879ef4bcef3143f57c094d2f76cf4d06709b368364e54c51b5b659` |
| 39 | [39-console-effect-and-budget-custody-continued-9.md](04-agent-fabric-operational-hardening/39-console-effect-and-budget-custody-continued-9.md) | `shared-current` | Console effect and budget custody (continued 9) | 156 | `sha256:73d07128cea3cff0b3cee3260d43542219f545baf6cb49ce5b8dcca15b533ee9` |
| 40 | [40-f023-06-archive.md](04-agent-fabric-operational-hardening/40-f023-06-archive.md) | `archive-only` | F023-06 frozen archive slice | 23 | `sha256:20e90c0e81c24a52a8d5a79456b0e57fe59b60da1cfcbcd04979efa3937f8366` |
| 41 | [41-console-effect-and-budget-custody-continued-11.md](04-agent-fabric-operational-hardening/41-console-effect-and-budget-custody-continued-11.md) | `shared-current` | Console effect and budget custody (continued 11) | 17 | `sha256:54269cb1e1c4372019853d7c838b979acde240758e52cc4d33702cc451e9966e` |
| 42 | [42-f023-07-archive.md](04-agent-fabric-operational-hardening/42-f023-07-archive.md) | `archive-only` | F023-07 frozen archive slice | 24 | `sha256:720a7af97e6ba9753c3f7b8d210f50fcdb60cf8cbed5a6fd28a82aa007ded578` |
| 43 | [43-console-effect-and-budget-custody-continued-13.md](04-agent-fabric-operational-hardening/43-console-effect-and-budget-custody-continued-13.md) | `shared-current` | Console effect and budget custody (continued 13) | 122 | `sha256:8ce5e2b201aade8d1a04ecb9047eb4e925ab982b16e942071f3ccdbfb1ddadde` |
| 07 | [07-review-bundle-and-target-persistence.md](04-agent-fabric-operational-hardening/07-review-bundle-and-target-persistence.md) | `shared-current` | Review bundle and target persistence | 795 | `sha256:d1e48ba67261c9f15af41397e2552e3ec6a53a8d559a73e4b02ab1f5f2708aa4` |
| 08 | [08-review-route-admission-a.md](04-agent-fabric-operational-hardening/08-review-route-admission-a.md) | `shared-current` | Review route admission A | 701 | `sha256:9a39e45d7ea996d03c43a3ddf9745ca3d52cc8d09b5f5af6349a8cecfd6de116` |
| 09 | [09-review-route-admission-b.md](04-agent-fabric-operational-hardening/09-review-route-admission-b.md) | `shared-current` | Review route admission B | 700 | `sha256:7dfeb4112957840b886ba522de4f314dd87ba46152ff008a6f7a7ac565935e72` |
| 10 | [10-review-route-admission-c.md](04-agent-fabric-operational-hardening/10-review-route-admission-c.md) | `shared-current` | Review route admission C | 664 | `sha256:ae4383f177085bb37ba9c7ee4e07261d26e406d3aea6859207abbea1e1504320` |
| 11 | [11-review-results-heads-and-recovery.md](04-agent-fabric-operational-hardening/11-review-results-heads-and-recovery.md) | `shared-current` | Review results, heads and recovery | 630 | `sha256:3fdc7f727dcb6684980cb1046fe41234817999ef4e43ad06e62b14889140df58` |
| 12 | [12-lifecycle-rotation-schema-a.md](04-agent-fabric-operational-hardening/12-lifecycle-rotation-schema-a.md) | `shared-current` | Lifecycle rotation schema A | 865 | `sha256:9e6bca970e8f37542fc59e32427a0ff26838de6c6c674a361fbc3d1de5e767b4` |
| 13 | [13-lifecycle-rotation-schema-b.md](04-agent-fabric-operational-hardening/13-lifecycle-rotation-schema-b.md) | `shared-current` | Lifecycle rotation schema B | 784 | `sha256:a4d7649b306ef8fcf03b5fdfa3d01191b702b8353a41e1064cf3684651f468a7` |
| 14 | [14-lifecycle-rotation-schema-c.md](04-agent-fabric-operational-hardening/14-lifecycle-rotation-schema-c.md) | `shared-current` | Lifecycle rotation schema C | 857 | `sha256:121605295a18408efa8794c17d8196afaed3ec70de4b825b1f905b4d84ee53ae` |
| 15 | [15-capability-route-persistence-a.md](04-agent-fabric-operational-hardening/15-capability-route-persistence-a.md) | `shared-current` | Capability route persistence A | 768 | `sha256:76df2a2896906eca97484f03ef62bbeb007a6d43607c63ca75e104c2f6aa1270` |
| 16 | [16-capability-route-persistence-b.md](04-agent-fabric-operational-hardening/16-capability-route-persistence-b.md) | `shared-current` | Capability route persistence B | 710 | `sha256:f4eabbee63b8925daed398eacacd2512d9f5046bc6f77ec271793ebe317a4611` |
| 17 | [17-authority-attestation-and-receipts.md](04-agent-fabric-operational-hardening/17-authority-attestation-and-receipts.md) | `shared-current` | Authority attestation and receipts | 851 | `sha256:5bdf73ec4a4b5571ed1a61191e17fb2fe12e1cd92c782ee8aedc8319ba737b41` |
| 18 | [18-authority-enforcement-and-telemetry.md](04-agent-fabric-operational-hardening/18-authority-enforcement-and-telemetry.md) | `shared-current` | Authority enforcement and telemetry | 174 | `sha256:15f3ef204d8676ccdc8bd42bc9542cf2c61b70d320ff6792e6b5fe340a45e57c` |
| 44 | [44-f023-20-archive.md](04-agent-fabric-operational-hardening/44-f023-20-archive.md) | `archive-only` | F023-20 frozen archive slice | 29 | `sha256:5ae4ecbb95d6d081114c7703f269589e28aa19fad4e816e39d2a87d1a9700815` |
| 45 | [45-authority-enforcement-and-telemetry-continued-2.md](04-agent-fabric-operational-hardening/45-authority-enforcement-and-telemetry-continued-2.md) | `shared-current` | Authority enforcement and telemetry (continued 2) | 635 | `sha256:5d355a39804017c7768f059361698d230217da000d61a322c18e61886d774a32` |
| 19 | [19-console-read-persistence.md](04-agent-fabric-operational-hardening/19-console-read-persistence.md) | `shared-current` | Console read persistence | 262 | `sha256:e9f1c6408f053943976b8af092a28c11a842d8d46339fcbd9b94db3c27f23006` |
