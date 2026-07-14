# Project Fabric Console and adaptive session orchestration

Status: Normative specification-family package
Family ID: `spec-05-project-fabric-console`
Family version: `1.14`
Binding-current content SHA-256: `sha256:65fb80cb1144ec7cf752c49a99944c6b44b237e14b27940e813828284c125e31`
Archive content SHA-256: `sha256:8bef2451fa6b3ac3c2f7ba4a1485c41b88e84e14b8ffd3454e5036c0377e8c32`
Frozen-source SHA-256: `sha256:8bef2451fa6b3ac3c2f7ba4a1485c41b88e84e14b8ffd3454e5036c0377e8c32`
Supersession-map SHA-256: `sha256:cb391529b6c82961556d53b75b863824294a012665555b4b2d95be3c56f71c79`
Module-set SHA-256: `sha256:9c8829a6a7a76d732d19ae2628ff9dadbab71db13c602460fa6e5b1df102a576`
Transformation receipt SHA-256: `sha256:41cbdfbd8e3204033b4848eb428a70b6902b68baa64fcfd22d974fa7f4516198`
Machine manifest SHA-256: `sha256:7c9088bd77ee1cd8e70815681f72802d5ca92eb7a78c10800d1bb3d0757701f3`
Machine manifest: [manifest.json](05-project-fabric-console/manifest.json)
Supersession map: [supersession-map.json](05-project-fabric-console/supersession-map.json)

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
| 00 | [00-authority-and-status-header.md](05-project-fabric-console/00-authority-and-status-header.md) | `shared-current` | Authority and status header | 16 | `sha256:7389641af2ba977acc13040097894d32b6264eea1b92221c0482b9ccc9bf2ef9` |
| 10 | [10-binding-current-authority.md](05-project-fabric-console/10-binding-current-authority.md) | `current-only` | Binding-current authority | 27 | `sha256:6e9e85d155cc852008951c9a7733b2f3d1062a40e19dbebd586fde12a7c05818` |
| 02 | [02-console-contract.md](05-project-fabric-console/02-console-contract.md) | `shared-current` | Console contract | 8 | `sha256:fdae6e457ca26777a7a5b088f7b2e3731c25a1f5d7ef3dc8d5320e970dc16747` |
| 08 | [08-f023-21-current.md](05-project-fabric-console/08-f023-21-current.md) | `current-only` | F023-21 binding-current replacement | 16 | `sha256:d3b25956c22df68ffea5b02707fe96ba01bf5c125019e037bc9deae1bc6ee876` |
| 06 | [06-console-contract-continued-2.md](05-project-fabric-console/06-console-contract-continued-2.md) | `shared-current` | Console contract (continued 2) | 709 | `sha256:33ffe5bd316447ffa908da73f8e3035a0e4170161bb85d7c658d2b1211ebb50d` |
| 03 | [03-integrations-lifecycle-and-acceptance.md](05-project-fabric-console/03-integrations-lifecycle-and-acceptance.md) | `shared-current` | Integrations, lifecycle and acceptance | 503 | `sha256:7d05d690abef7811c15601d74618928641171927b5bdc9fdb83ed9cd420059a7` |
| 09 | [09-f023-08-current.md](05-project-fabric-console/09-f023-08-current.md) | `current-only` | F023-08 binding-current replacement | 32 | `sha256:8c7f2fc93c18e99e4bc1a86329d66194497f6b7b115a88918ca3b695f41ae12b` |
| 04 | [04-continuity-and-authority.md](05-project-fabric-console/04-continuity-and-authority.md) | `shared-current` | Continuity and authority | 167 | `sha256:6d9d28c37658cd244f92cc77e19ee80d84d351e6d1089800671a331901d8f736` |

## Frozen archive (traceability only)

The archive loader reconstructs the exact frozen source bytes at
`0305376624fdb03e14166a2a831e0053fca367c9`. It exists for audit
and provenance, not implementation. Receipt normalisation strips the
same recorded fence scaffolding and reverses the recorded module-relative
link relocations before checking the frozen line count and SHA-256.

| Ordinal | Module | Role | Topic | Lines | SHA-256 |
|---:|---|---|---|---:|---|
| 00 | [00-authority-and-status-header.md](05-project-fabric-console/00-authority-and-status-header.md) | `shared-current` | Authority and status header | 16 | `sha256:7389641af2ba977acc13040097894d32b6264eea1b92221c0482b9ccc9bf2ef9` |
| 01 | [01-version-history.md](05-project-fabric-console/01-version-history.md) | `archive-only` | Version history | 79 | `sha256:8c868dacf025f90fbcb4a7e05a445dab4084f7888400f4d9158683be1628744c` |
| 02 | [02-console-contract.md](05-project-fabric-console/02-console-contract.md) | `shared-current` | Console contract | 8 | `sha256:fdae6e457ca26777a7a5b088f7b2e3731c25a1f5d7ef3dc8d5320e970dc16747` |
| 05 | [05-f023-21-archive.md](05-project-fabric-console/05-f023-21-archive.md) | `archive-only` | F023-21 frozen archive slice | 17 | `sha256:c7a8b0e2eb0fa246a0c88fcb7c4b288eaa38ae02fdb246720cf3224aa0c690e4` |
| 06 | [06-console-contract-continued-2.md](05-project-fabric-console/06-console-contract-continued-2.md) | `shared-current` | Console contract (continued 2) | 709 | `sha256:33ffe5bd316447ffa908da73f8e3035a0e4170161bb85d7c658d2b1211ebb50d` |
| 03 | [03-integrations-lifecycle-and-acceptance.md](05-project-fabric-console/03-integrations-lifecycle-and-acceptance.md) | `shared-current` | Integrations, lifecycle and acceptance | 503 | `sha256:7d05d690abef7811c15601d74618928641171927b5bdc9fdb83ed9cd420059a7` |
| 07 | [07-f023-08-archive.md](05-project-fabric-console/07-f023-08-archive.md) | `archive-only` | F023-08 frozen archive slice | 35 | `sha256:e274ed515887df46d338845cfdb8b1365a2fb38fe1dea3e3562f67aaa08bbd00` |
| 04 | [04-continuity-and-authority.md](05-project-fabric-console/04-continuity-and-authority.md) | `shared-current` | Continuity and authority | 167 | `sha256:6d9d28c37658cd244f92cc77e19ee80d84d351e6d1089800671a331901d8f736` |
