#!/usr/bin/env python3
"""Validate the ordered normative specification families."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
from typing import Any, Iterable
import unicodedata
from urllib.parse import unquote


MAX_LINES = 1_000
REQUIRED_FAMILIES = (
    "01-agent-fabric",
    "04-agent-fabric-operational-hardening",
    "05-project-fabric-console",
)
FROZEN_COMMIT = "0305376624fdb03e14166a2a831e0053fca367c9"
FROZEN_SOURCES = {
    "01-agent-fabric": {
        "path": "docs/specs/01-agent-fabric.md",
        "lineCount": 11_514,
        "sha256": "sha256:7a2156feb6c7f3f15bd96c9583f51b22a42688fd298d4db42db4396573df60d0",
    },
    "04-agent-fabric-operational-hardening": {
        "path": "docs/specs/04-agent-fabric-operational-hardening.md",
        "lineCount": 12_024,
        "sha256": "sha256:69354c6dc226d81e1b719a2006a54045942e17fbefc8e11ba381721c0880af17",
    },
    "05-project-fabric-console": {
        "path": "docs/specs/05-project-fabric-console.md",
        "lineCount": 1_534,
        "sha256": "sha256:8bef2451fa6b3ac3c2f7ba4a1485c41b88e84e14b8ffd3454e5036c0377e8c32",
    },
}
BINDING_CONTEXT_RANGES = {
    "01-agent-fabric": ((12, 130), (3_596, 3_613)),
    "04-agent-fabric-operational-hardening": ((14, 109),),
    "05-project-fabric-console": ((17, 95),),
}
EXPECTED_CURRENT_REQUIREMENTS = {
    "01-agent-fabric": 210,
    "04-agent-fabric-operational-hardening": 0,
    "05-project-fabric-console": 0,
}
EXPECTED_SUPERSESSION_IDS = {
    "01-agent-fabric": ("F023-01", "F023-09", "F023-02"),
    "04-agent-fabric-operational-hardening": (
        "F023-10",
        "F023-03",
        "F023-04",
        "F023-11",
        "F023-12",
        "F023-13",
        "F023-14",
        "F023-15",
        "F023-05",
        "F023-16",
        "F023-17",
        "F023-18",
        "F023-19",
        "F023-06",
        "F023-07",
        "F023-20",
    ),
    "05-project-fabric-console": ("F023-21", "F023-08"),
}
AUDIT_ANCHORS = {
    "F023-01": (3_784, 3_786, "sha256:1eae300de6061ec99668d21469067a6adb8374d2664f8e8769e9f1eb743f6e46"),
    "F023-02": (5_829, 5_833, "sha256:9997d38d3e37dae26942090c0d6ac1ed39e2df36f017780acdfcf379c2d00440"),
    "F023-03": (974, 978, "sha256:deb8c9f8091dec146640b80ba2977cbdc6ab09ca20743a9d1483e3cf42bbadae"),
    "F023-04": (997, 1_002, "sha256:9f29e0218e903eccd92cb5afaa17e6f951168ed356f2c331070c84903ca6c6e8"),
    "F023-05": (2_063, 2_072, "sha256:b0035e4261dbbd9ec004b93a1b19b9c197851813d54ba35c13eb7cccdf97c915"),
    "F023-06": (2_423, 2_436, "sha256:d5d5942ccb8e3abdc1da235cbdee6bca2ca73a96856e5c16207fc3a9359eb3e2"),
    "F023-07": (2_459, 2_478, "sha256:617c396239d6812d3320141f86152eb3c3c6b645afb7cd0de25e73c3dc80c2ba"),
    "F023-08": (1_334, 1_366, "sha256:5e8a4d45c5ccd08253c7eb5b7aec908f53f637381704154d395a4c3e83f2d6a9"),
    "F023-09": (3_803, 3_807, "sha256:a5b7b0c64b76d0abee3e8d30f93142f4facb8d9bcde3496349b4bd227dabb41e"),
    "F023-10": (350, 356, "sha256:4eaed778c528e24330667179c71895fca75e72cbe5ec8c95237fc38d3950b163"),
    "F023-11": (1_096, 1_102, "sha256:877fb24e856803dc7a9afd65bc8a6eaba65604ade6804176bbf171491afc5ecb"),
    "F023-12": (1_394, 1_401, "sha256:a889edcfb076ca80b658e9de99959327f3d73cb9ff7e7db382967d89b1e97889"),
    "F023-13": (1_835, 1_848, "sha256:1fcb2b023e810997846d90c79ca9d28ad306da031aeee6491a18078dd77e97ff"),
    "F023-14": (1_850, 1_858, "sha256:39f2b6f2abd47c012315145797ecb54d9c85801b5d859e0928be15cf2f0c8d2e"),
    "F023-15": (1_860, 1_866, "sha256:0be24405ce90781b2a7e6c89d6275a5395ef2b96026869324666720097d29bf3"),
    "F023-16": (2_089, 2_093, "sha256:81652e0774d3728ca7318f6873df02021a4f24139cd97755d635aec042d67984"),
    "F023-17": (2_095, 2_100, "sha256:168651ca70d5a0a6b32b749679fbfc94fde72f4702d8ba77cb34411de81a1975"),
    "F023-18": (2_108, 2_115, "sha256:3467a8e983fa33a389365581d59fb274edd7e84f3f4b02cadddd05869e719461"),
    "F023-19": (2_252, 2_261, "sha256:56eac237f8938b9b36500fb9c726f6cd0f879ce2a3f189c833aed83968a15f3d"),
    "F023-20": (11_100, 11_127, "sha256:191902e774b0b82ce9891518d5ad811ef1ea15e0b469dd87087225a9ac9b9233"),
    "F023-21": (105, 120, "sha256:7fc7e8b52a37b5e744d8b2d268e5f0d99ed2c32eab64058d24dce28337f7f38a"),
}
EXPECTED_MAP_RANGES = {
    "F023-01": (3_775, 3_786, "sha256:2ffa67cc40b992f386c9da72735885684c86f6f67f63ee3442ff798894bfe632"),
    "F023-02": (5_829, 5_844, "sha256:2b4b56157c970a9d7ecadac0f12d59308127b87cd8d515ddd5881531b0270ae9"),
    "F023-03": (974, 988, "sha256:8120f60638672a3edec79dbc279ca87b12f09f40b1b993b2d20662067eff3325"),
    "F023-04": (990, 1_008, "sha256:a557e5846927e19a37249fb0baa8f4ef5ef673f0c4e58a834e3542c67a9f036f"),
    "F023-05": (2_063, 2_079, "sha256:9d4c3705bb965671450b81f9d30e5e1752a6299e7e5a592d1b47fe4ef9d107ae"),
    "F023-06": (2_418, 2_440, "sha256:20e90c0e81c24a52a8d5a79456b0e57fe59b60da1cfcbcd04979efa3937f8366"),
    "F023-07": (2_459, 2_481, "sha256:fbe213dbec56460542c42056d56f17dfbc6bcdc144949f8c59754e73a4dcd46e"),
    "F023-08": (1_334, 1_367, "sha256:f95b40b960c0540c4a7b976d69b7b66a82a0dff515729eab8f4d24f6cb6c28b9"),
    "F023-09": (3_803, 3_807, "sha256:a5b7b0c64b76d0abee3e8d30f93142f4facb8d9bcde3496349b4bd227dabb41e"),
    "F023-10": (350, 356, "sha256:4eaed778c528e24330667179c71895fca75e72cbe5ec8c95237fc38d3950b163"),
    "F023-11": (1_096, 1_102, "sha256:877fb24e856803dc7a9afd65bc8a6eaba65604ade6804176bbf171491afc5ecb"),
    "F023-12": (1_394, 1_401, "sha256:a889edcfb076ca80b658e9de99959327f3d73cb9ff7e7db382967d89b1e97889"),
    "F023-13": (1_835, 1_848, "sha256:1fcb2b023e810997846d90c79ca9d28ad306da031aeee6491a18078dd77e97ff"),
    "F023-14": (1_850, 1_858, "sha256:39f2b6f2abd47c012315145797ecb54d9c85801b5d859e0928be15cf2f0c8d2e"),
    "F023-15": (1_860, 1_866, "sha256:0be24405ce90781b2a7e6c89d6275a5395ef2b96026869324666720097d29bf3"),
    "F023-16": (2_089, 2_093, "sha256:81652e0774d3728ca7318f6873df02021a4f24139cd97755d635aec042d67984"),
    "F023-17": (2_095, 2_100, "sha256:168651ca70d5a0a6b32b749679fbfc94fde72f4702d8ba77cb34411de81a1975"),
    "F023-18": (2_108, 2_115, "sha256:3467a8e983fa33a389365581d59fb274edd7e84f3f4b02cadddd05869e719461"),
    "F023-19": (2_252, 2_261, "sha256:56eac237f8938b9b36500fb9c726f6cd0f879ce2a3f189c833aed83968a15f3d"),
    "F023-20": (11_100, 11_127, "sha256:191902e774b0b82ce9891518d5ad811ef1ea15e0b469dd87087225a9ac9b9233"),
    "F023-21": (105, 120, "sha256:7fc7e8b52a37b5e744d8b2d268e5f0d99ed2c32eab64058d24dce28337f7f38a"),
}
EXPECTED_CURRENT_BINDINGS = {
    "F023-01": (
        "docs/specs/01-agent-fabric/30-f023-01-current.md",
        2,
        11,
        "sha256:5401b29858d03eb9e5b11a469202422d2f7bb4d6cac968a5f6893c8fed17cb85",
    ),
    "F023-09": (
        "docs/specs/01-agent-fabric/31-f023-09-current.md",
        2,
        7,
        "sha256:d39d6fddcaa434bc43328a4809bc4ca27e4632933fd78ec8ff0e575fa2899678",
    ),
    "F023-02": (
        "docs/specs/01-agent-fabric/32-f023-02-current.md",
        2,
        18,
        "sha256:00e5336c6f174ff775c4f2a98824cd8a9abdf15e48a2fc41da972ece6fd39961",
    ),
    "F023-10": (
        "docs/specs/04-agent-fabric-operational-hardening/46-f023-10-current.md",
        2,
        6,
        "sha256:0221837d7a6fc0da6e886213339887818156a4ce45b2683effcf58d372065946",
    ),
    "F023-03": (
        "docs/specs/04-agent-fabric-operational-hardening/47-f023-03-current.md",
        2,
        16,
        "sha256:703b2c2e5eb600e3d63d7408ff973916fdba35e55e4ff6f96f503e6507997348",
    ),
    "F023-04": (
        "docs/specs/04-agent-fabric-operational-hardening/48-f023-04-current.md",
        2,
        19,
        "sha256:acb7fdd8e627f34cfba4416a2c55c02a299fb3419d76e7ef10e1ef840d079ca2",
    ),
    "F023-11": (
        "docs/specs/04-agent-fabric-operational-hardening/49-f023-11-current.md",
        2,
        8,
        "sha256:1a27b35f26591665e28006b959ddf871093141e95563a55adae70dbe4da998a6",
    ),
    "F023-12": (
        "docs/specs/04-agent-fabric-operational-hardening/50-f023-12-current.md",
        2,
        7,
        "sha256:da5aca9a2f8e23e2be6a5161f0c5eea2766ba95ef58b4c75f2ad618e5e010c38",
    ),
    "F023-13": (
        "docs/specs/04-agent-fabric-operational-hardening/51-f023-13-current.md",
        2,
        16,
        "sha256:2feaa91a4738981878bf68358be13cbf56ff86822c0eb251396b0f97b359b686",
    ),
    "F023-14": (
        "docs/specs/04-agent-fabric-operational-hardening/52-f023-14-current.md",
        2,
        9,
        "sha256:d97eabaa200c4ea2498e11748cb31071faa16a68b807a193798f65af91837e84",
    ),
    "F023-15": (
        "docs/specs/04-agent-fabric-operational-hardening/53-f023-15-current.md",
        2,
        8,
        "sha256:c5cdab69e67adb236519a698c706284aba7df0d72721247428b16743e25e6acd",
    ),
    "F023-05": (
        "docs/specs/04-agent-fabric-operational-hardening/54-f023-05-current.md",
        2,
        17,
        "sha256:a2a9f56fcfa1bfa7f407e4fa819073d804834223a4e616d504b68ca440334e7f",
    ),
    "F023-16": (
        "docs/specs/04-agent-fabric-operational-hardening/55-f023-16-current.md",
        1,
        5,
        "sha256:c1c674a40793bb06b8ff5669cc7eac4bb94c8bbb2cad1d2d800bef942cf52df0",
    ),
    "F023-17": (
        "docs/specs/04-agent-fabric-operational-hardening/56-f023-17-current.md",
        2,
        7,
        "sha256:60226e08d5365a6faf734189fd42a13550a12aa17447aea28fb903f27636a607",
    ),
    "F023-18": (
        "docs/specs/04-agent-fabric-operational-hardening/57-f023-18-current.md",
        2,
        10,
        "sha256:e7fec3608216e1a5cf6064b270d806a59d667ec1d14affda3b565e40a258f353",
    ),
    "F023-19": (
        "docs/specs/04-agent-fabric-operational-hardening/58-f023-19-current.md",
        2,
        11,
        "sha256:0385b95b3f7682c80ce778afffdfa18892cf2a47918e38321296914d67699768",
    ),
    "F023-06": (
        "docs/specs/04-agent-fabric-operational-hardening/59-f023-06-current.md",
        1,
        20,
        "sha256:a14dadb0e6a9c92c9226bcf448b16b0c06cd90e400b7f1a8fbd973d189e76364",
    ),
    "F023-07": (
        "docs/specs/04-agent-fabric-operational-hardening/60-f023-07-current.md",
        2,
        27,
        "sha256:231c15a21eb2f6efa68eb514c6d7f9c564c95dcefbd306d3bd6ba956be44e2dc",
    ),
    "F023-20": (
        "docs/specs/04-agent-fabric-operational-hardening/61-f023-20-current.md",
        2,
        24,
        "sha256:235d6c0629cff7eeb073c56ce52d9cbe5431f932e38ff31d7d014ec785e054a0",
    ),
    "F023-21": (
        "docs/specs/05-project-fabric-console/08-f023-21-current.md",
        2,
        16,
        "sha256:93438d9ad3cc9906b409a110539fdef3dad4a53cc11b067f35fd1fca91fc3019",
    ),
    "F023-08": (
        "docs/specs/05-project-fabric-console/09-f023-08-current.md",
        2,
        32,
        "sha256:7a49f8e2f8e3e6f2cd896742f048dfb6f188c2da474afa4a5213331ef942aba8",
    ),
}
EXPECTED_AUTHORITY_REFS = {
    "F023-01": {"A01"},
    "F023-02": {"A01"},
    "F023-03": {"A04"},
    "F023-04": {"A04"},
    "F023-05": {"A04"},
    "F023-06": {"A04"},
    "F023-07": {"A04"},
    "F023-08": {"A05", "A05-current", "D-021", "D-023"},
    "F023-09": {"A01"},
    "F023-10": {"A04"},
    "F023-11": {"A04"},
    "F023-12": {"A04"},
    "F023-13": {"A04"},
    "F023-14": {"A04"},
    "F023-15": {"A04"},
    "F023-16": {"A04"},
    "F023-17": {"A04"},
    "F023-18": {"A04"},
    "F023-19": {"A04"},
    "F023-20": {"A04"},
    "F023-21": {"A05", "A05-current", "D-021", "D-023"},
}
EXPECTED_AUTHORITY_BINDINGS = {
    "A01": (
        "docs/specs/01-agent-fabric/33-binding-current-authority.md",
        2,
        21,
        "sha256:7c61123b0b774c36f4f1696ed95cc1b4bdea7125c67a321fa44eeda80c6f2249",
    ),
    "A04": (
        "docs/specs/04-agent-fabric-operational-hardening/62-binding-current-authority.md",
        2,
        18,
        "sha256:bc84fa16dbd9fe99d741c4568741005ef86b8639129bceddacf7d339bb2997d4",
    ),
    "A05": (
        "docs/specs/05-project-fabric-console/10-binding-current-authority.md",
        2,
        27,
        "sha256:e087087a5a4057b535e6b9e50625582d76afcfc8cc4500efd359eadaa309c49c",
    ),
    "A05-current": (
        "docs/specs/05-project-fabric-console/10-binding-current-authority.md",
        2,
        27,
        "sha256:e087087a5a4057b535e6b9e50625582d76afcfc8cc4500efd359eadaa309c49c",
    ),
    "D-021": (
        "docs/agent-harness-comprehensive-review/decision-register.md",
        32,
        32,
        "sha256:bdab0931e8f4426fe01440d97374cfa5f7c0cede59c05931588add1cc1a83bd1",
    ),
    "D-023": (
        "docs/agent-harness-comprehensive-review/decision-register.md",
        34,
        34,
        "sha256:86b8b96dfa7b251c221ca6fe23f0f816206d89ea71f253d35986b1535b3e9ed2",
    ),
}
FORBIDDEN_CURRENT_MANDATES = {
    "01-agent-fabric": {
        "F023-01": b"Legacy imports create both",
        "F023-09": b"forward migration deterministically revokes",
        "F023-02": b"only the v0.36 client/daemon",
        "version-history": b"Version 0.36 is a draft amendment",
    },
    "04-agent-fabric-operational-hardening": {
        "F023-10": b"This amendment is approved by Spec 05 v1.0",
        "F023-03": b"Compatibility decoders may explain",
        "F023-04": b"The next unused additive migration",
        "R5-03": b"This section owns their additive persistence",
        "F023-11": b"migration normalises closed child rows",
        "F023-12": b"migration transactionally widens the canonical",
        "F023-13": b"Migration preflight shall reject malformed/non-canonical paths",
        "F023-14-version": b"before the schema\nversion advances",
        "F023-14-repair": b"Recovery is forward repair",
        "F023-15": b"migration preflight/rollback",
        "F023-05": b"Migration 0010 rebuilds `artifacts`",
        "F023-16": b"Existing receipts and intake bindings gain exact registry IDs",
        "F023-17": b"`intakes` and `intake_revisions` gain an accepted-scope registry ID",
        "F023-18": b"before table replacement",
        "F023-19": b"The additive persistence change for operation enforcement shall bind",
        "F023-06": b"Legacy imports bind\nboth memberships",
        "F023-07": b"Migration 0013 is forward-only",
        "F023-20": b"The existing `provider_action_routes` row gains non-null",
        "version-history": b"Version 1.31 added",
    },
    "05-project-fabric-console": {
        "F023-21": b"Specs 01 and 04 shall be amended and accepted before implementation",
        "F023-08": b"Spec 05 v1.0 records the human-approved product direction",
        "version-history": b"Version 1.13 records",
    },
}
OBLIGATION_MATRIX_PATH = PurePosixPath(
    "tests/spec_fixtures/f023_obligation_matrix.json"
)
OBLIGATION_MATRIX_SHA256 = (
    "sha256:03ae5633d8af31dc1c1fefa1c795752347327758270c797a0aa265490de2505f"
)
MIXED_OBLIGATION_IDS = (
    "F023-09",
    "F023-02",
    "F023-10",
    "F023-04",
    "F023-11",
    "F023-12",
    "F023-13",
    "F023-14",
    "F023-15",
    "F023-16",
    "F023-17",
    "F023-18",
    "F023-19",
    "F023-06",
    "F023-07",
    "F023-20",
    "F023-21",
    "F023-08",
)
F023_CLOSURE_RECEIPT_PATH = PurePosixPath(
    "tests/spec_fixtures/f023_closure_receipt.json"
)
F023_CLOSURE_RECEIPT_SHA256 = (
    "sha256:acb588932dd6c8489ef0ba9ef8944da916bb2b4a020214ff4377123aec7bddf3"
)
RULE5_CROSSWALK_PATH = PurePosixPath(
    "tests/spec_fixtures/f023_rule5_crosswalk.json"
)
RULE5_CROSSWALK_SHA256 = (
    "sha256:1c10557cd0712909694f69016c74294094d62919f31eaa5b5839c64957451411"
)
SYSTEMIC_MANDATE_CASES_PATH = PurePosixPath(
    "tests/spec_fixtures/f023_systemic_mandate_cases.json"
)
SYSTEMIC_MANDATE_CASES_SHA256 = (
    "sha256:1297fdf07b156cb2bbddebbc26f86af14f4f2a8ba8bd6e82e9afd2d19e8f9d21"
)
EXPECTED_RULE5_TO_F023 = {
    "R5-01": "F023-09",
    "R5-02": "F023-10",
    "R5-03": "F023-04",
    "R5-04": "F023-11",
    "R5-05": "F023-12",
    "R5-06": "F023-13",
    "R5-07": "F023-14",
    "R5-08": "F023-15",
    "R5-09": "F023-16",
    "R5-10": "F023-17",
    "R5-11": "F023-18",
    "R5-12": "F023-19",
    "R5-13": "F023-20",
    "R5-14": "F023-21",
}
ARCHIVE_ONLY_HISTORY_RANGES = {
    "01-agent-fabric": ((12, 130), (3_596, 3_613)),
    "04-agent-fabric-operational-hardening": ((14, 109),),
    "05-project-fabric-console": ((17, 95),),
}
EXPECTED_RELOCATIONS = {
    "01-agent-fabric": (
        (
            "../research/evidence-snapshots/agent-continuity-routing-2026-07.md",
            "../../research/evidence-snapshots/agent-continuity-routing-2026-07.md",
            9_047,
        ),
    ),
    "04-agent-fabric-operational-hardening": (),
    "05-project-fabric-console": (
        (
            "../research/evidence-snapshots/agent-continuity-routing-2026-07.md",
            "../../research/evidence-snapshots/agent-continuity-routing-2026-07.md",
            1_372,
        ),
    ),
}
EXPECTED_SCAFFOLDING = {
    "01-agent-fabric": (),
    "04-agent-fabric-operational-hardening": (
        (12, "~~~\n", "~~~sql\n"),
        (13, "~~~\n", "~~~sql\n"),
    ),
    "05-project-fabric-console": (),
}
MANIFEST_KEYS = {
    "schemaVersion",
    "familyId",
    "familyVersion",
    "indexPath",
    "bindingCurrentContentSha256",
    "archiveContentSha256",
    "moduleSetSha256",
    "transformationReceiptSha256",
    "supersessionMapPath",
    "supersessionMapSha256",
    "sequences",
    "transformation",
    "modules",
}
MODULE_KEYS = {"ordinal", "path", "title", "role", "lineCount", "sha256"}
MODULE_ROLES = {"shared-current", "current-only", "archive-only"}
SOURCE_KINDS = {"candidate-topical", "binding-context"}
SEQUENCE_KEYS = {"bindingCurrent", "archive"}
TRANSFORMATION_KEYS = {
    "schemaVersion",
    "kind",
    "frozenCommit",
    "frozenSourcePath",
    "frozenSourceLineCount",
    "frozenSourceSha256",
    "sourceRanges",
    "relocatedLinks",
    "splitPoints",
    "scaffolding",
}
SOURCE_RANGE_KEYS = {
    "moduleOrdinal",
    "sourceStartLine",
    "sourceEndLine",
    "kind",
}
RELOCATED_LINK_KEYS = {"logicalByteOffset", "beforeUtf8", "afterUtf8"}
SPLIT_POINT_KEYS = {"afterModuleOrdinal", "logicalByteOffset", "boundaryKind"}
SCAFFOLD_KEYS = {"afterModuleOrdinal", "leftAppendUtf8", "rightPrependUtf8"}
BOUNDARY_KINDS = {"section", "paragraph", "sentence", "sql-statement"}
SUPERSESSION_MAP_KEYS = {
    "schemaVersion",
    "familyId",
    "frozenSourceSha256",
    "bindingCurrentContentSha256",
    "entries",
}
SUPERSESSION_ENTRY_KEYS = {
    "id",
    "disposition",
    "frozen",
    "current",
    "authorityRefs",
    "rationale",
}
SUPERSESSION_FROZEN_KEYS = {"path", "startLine", "endLine", "sha256"}
SUPERSESSION_CURRENT_KEYS = {
    "role",
    "modulePath",
    "startLine",
    "endLine",
    "sha256",
}
AUTHORITY_REF_KEYS = {"ref", "path", "startLine", "endLine", "sha256"}
OBLIGATION_MATRIX_KEYS = {"schemaVersion", "entries"}
OBLIGATION_MATRIX_ENTRY_KEYS = {
    "id",
    "family",
    "frozenRange",
    "ownerModulePath",
    "lockstepWith",
    "obligations",
}
OBLIGATION_KEYS = {"key", "marker"}
RULE5_CROSSWALK_KEYS = {"schemaVersion", "decision", "entries"}
RULE5_CROSSWALK_ENTRY_KEYS = {
    "r5Id",
    "f023Id",
    "family",
    "frozenRange",
    "frozenRangeSha256",
    "folded",
}
SYSTEMIC_MANDATE_CASE_KEYS = {
    "schemaVersion",
    "positiveClauses",
    "negativeClauses",
}
SYSTEMIC_MANDATE_POSITIVE_KEYS = {"category", "text", "owner", "expectedPattern"}
SYSTEMIC_MANDATE_NEGATIVE_KEYS = {"category", "text", "exclusion"}
SYSTEMIC_MANDATE_EXCLUSIONS = {
    "negative-prohibition",
    "fresh-baseline",
    "taxonomy",
    "current-optional",
    "nonmigration-additive-forward",
    "operational-revision",
    "governance-provenance",
}
F023_CLOSURE_RECEIPT_KEYS = {
    "schemaVersion",
    "workItem",
    "structuralDecision",
    "semanticDecision",
    "status",
    "repairCycle",
    "w003Head",
    "w017BaseHead",
    "finding",
    "rule5CandidateCount",
    "entryIds",
    "familyVersions",
    "rule5CrosswalkPath",
    "rule5CrosswalkSha256",
    "systemicMandateCasesPath",
    "systemicMandateCasesSha256",
    "obligationMatrixPath",
    "obligationMatrixSha256",
    "equivalenceStatus",
    "acceptanceBoundary",
}
DIGEST_RE = re.compile(r"sha256:[0-9a-f]{64}\Z")
COMMIT_RE = re.compile(r"[0-9a-f]{40}\Z")
FENCE_RE = re.compile(r"^(?: {0,3})(`{3,}|~{3,})(.*)$")
LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")
REQUIREMENT_DEFINITION_RE = re.compile(
    r"^\s*(?:#{2,6}\s+|[-*]\s+\*\*)"
    r"((?:[A-Z][A-Z0-9]*-)?(?:FR|NFR|AC)-[0-9]+[A-Z]?)\b"
)
MANDATE_ACTOR_FRAGMENT = (
    r"(?:forward\s+migration|migration|schema\s+"
    r"(?:migration|upgrade|change|baseline)|backfill|upgrade)"
)
MANDATE_ACTION_VERB_FRAGMENT = (
    r"(?:normali[sz]e(?:s|d)?|widens?|adds?|repairs?|rebuilds?|creates?|"
    r"installs?|converts?|populates?|backfills?|upgrades?|alters?|updates?|enforces?)"
)
MANDATE_EMPHASIS_RE = re.compile(
    rf"(?<!\w)(?P<mark>\*\*|__|\*|_)"
    rf"(?P<actor>{MANDATE_ACTOR_FRAGMENT})(?P=mark)(?!\w)",
    re.IGNORECASE,
)
INDEPENDENT_POSITIVE_AND_ARM_RE = re.compile(
    rf"\band\s+(?=(?:(?:a|an|the)\s+)?{MANDATE_ACTOR_FRAGMENT}\s+"
    rf"(?:that\s+)?(?:(?:transactionally|atomically|deterministically)\s+)?"
    rf"{MANDATE_ACTION_VERB_FRAGMENT}\b)",
    re.IGNORECASE,
)
POSITIVE_MIGRATION_MANDATE_PATTERNS = (
    ("forward-migration", re.compile(r"\bforward\s+migration\b", re.IGNORECASE)),
    (
        "migration-actor",
        re.compile(
            r"(?<!schema\s)\b(?:(?:the|a|an)\s+)?migration\s+"
            r"(?:that\s+)?"
            r"(?:(?:transactionally|atomically|deterministically)\s+)?"
            r"(?:normali[sz]e(?:s|d)?|widens?|adds?|repairs?|rebuilds?|creates?|installs?|"
            r"converts?|populates?|backfills?|upgrades?|alters?|updates?|enforces?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "schema-upgrade-actor",
        re.compile(
            r"\b(?:(?:the|a|an)\s+)?"
            r"(?:schema\s+(?:migration|upgrade|change|baseline)|upgrade)\s+"
            r"(?:that\s+)?"
            r"(?:(?:transactionally|atomically|deterministically)\s+)?"
            r"(?:normali[sz]e(?:s|d)?|widens?|adds?|repairs?|rebuilds?|creates?|installs?|"
            r"converts?|populates?|backfills?|upgrades?|alters?|updates?|enforces?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "backfill-actor",
        re.compile(
            r"\b(?:(?:the|a|an)\s+)?backfill\s+(?:that\s+)?"
            r"(?:(?:transactionally|atomically|deterministically)\s+)?"
            r"(?:normali[sz]e(?:s|d)?|widens?|adds?|repairs?|rebuilds?|creates?|installs?|"
            r"converts?|populates?|backfills?|upgrades?|alters?|updates?|enforces?)\b",
            re.IGNORECASE,
        ),
    ),
    ("migration-preflight", re.compile(r"\bmigration\s+preflight\b", re.IGNORECASE)),
    (
        "additive-persistence",
        re.compile(r"\badditive\s+persistence(?:\s+change)?\b", re.IGNORECASE),
    ),
    (
        "schema-version-chronology",
        re.compile(
            r"\bbefore\s+(?:the\s+)?schema\s+version\s+advances?\b",
            re.IGNORECASE,
        ),
    ),
    (
        "forward-repair",
        re.compile(r"(?<!carry-)\bforward[\s-]+repair\b", re.IGNORECASE),
    ),
    (
        "existing-shape-gains",
        re.compile(
            r"\b(?:existing\s+)?(?:[a-z0-9_`-]+\s+){0,4}"
            r"(?:row|rows|relation|relations|table|tables|state|states|binding|bindings)"
            r"\s+gains?\b",
            re.IGNORECASE,
        ),
    ),
    (
        "named-relations-gain",
        re.compile(
            r"\b[a-z][a-z0-9]*_[a-z0-9_]+"
            r"(?:\s+and\s+[a-z][a-z0-9]*_[a-z0-9_]+)?\s+gains?\b",
            re.IGNORECASE,
        ),
    ),
    ("table-replacement", re.compile(r"\btable\s+replacement\b", re.IGNORECASE)),
    (
        "future-amendment",
        re.compile(r"\bshall\s+be\s+amended\b", re.IGNORECASE),
    ),
    (
        "persistence-migration",
        re.compile(r"\bpersistence\s+migration\b", re.IGNORECASE),
    ),
)


class SpecFamilyError(ValueError):
    """A specification family violates its closed contract."""


@dataclass(frozen=True)
class FamilyResult:
    stem: str
    manifest: dict[str, Any]
    binding_current: bytes
    archive: bytes
    current_requirement_definitions: tuple[str, ...]


def _sha256(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def find_unclassified_positive_mandates(text: str) -> list[str]:
    """Return positive migration/amendment mandates with clause-local polarity."""

    normalised_text = unicodedata.normalize("NFKC", text)
    normalised_text = re.sub(r"`+", "", normalised_text)
    normalised_text = MANDATE_EMPHASIS_RE.sub(
        lambda match: match.group("actor"),
        normalised_text,
    )
    normalised_text = "".join(
        " " if unicodedata.category(character).startswith("Z") else character
        for character in normalised_text
    )
    normalised_text = re.sub(r"[\u2010-\u2015\u2212]", " ", normalised_text)
    normalised_text = INDEPENDENT_POSITIVE_AND_ARM_RE.sub("; ", normalised_text)
    units = re.split(
        r"(?<=[.!?;])\s+|\n\s*\n|"
        r",\s*(?=(?:but|yet|however|whereas)\b)|"
        r"\b(?:but|yet|however|whereas)\b|"
        r",\s+(?=(?:a|an|the)\s+(?:forward\s+)?"
        r"(?:migration|schema\s+(?:migration|upgrade|change)|backfill|upgrade)\b)",
        normalised_text,
        flags=re.IGNORECASE,
    )

    findings: list[str] = []
    for unit in units:
        clause = re.sub(r"\s+", " ", unit).strip(" ,")
        if not clause:
            continue
        for category, pattern in POSITIVE_MIGRATION_MANDATE_PATTERNS:
            for match in pattern.finditer(clause):
                if _mandate_match_is_negated(clause, match):
                    continue
                if _mandate_match_is_structurally_excluded(clause, category, match):
                    continue
                finding = f"{category}: {match.group(0)}"
                if finding not in findings:
                    findings.append(finding)
    return findings


def _mandate_match_is_negated(clause: str, match: re.Match[str]) -> bool:
    prefix = clause[: match.start()]
    suffix = clause[match.end() :]
    if re.search(r"\bno\b[^,;:.!?]{0,100}$", prefix, flags=re.IGNORECASE):
        return True
    if re.search(r"\bwithout\b[^,;:.!?]{0,60}$", prefix, flags=re.IGNORECASE):
        return True
    if re.search(
        r"\b(?:rejects?|forbids?|prohibits?|removes?)\b"
        r"\s+(?:(?:any|a|an|the)\s+)?[^,;:.!?]{0,40}$",
        prefix,
        flags=re.IGNORECASE,
    ):
        return True
    if re.match(
        r"\s+(?:(?:is|are|was|were|be|becomes?|remains?|does|do|must|shall|"
        r"may|can)\s+){0,2}(?:not|never)\b",
        suffix,
        flags=re.IGNORECASE,
    ):
        return True
    if re.match(
        r"\s+(?:is|are|was|were)\s+"
        r"(?:rejected|forbidden|prohibited|removed|absent|unneeded)\b",
        suffix,
        flags=re.IGNORECASE,
    ):
        return True
    return False


def _mandate_match_is_structurally_excluded(
    clause: str,
    category: str,
    match: re.Match[str],
) -> bool:
    lower = clause.lower()
    prefix = clause[: match.start()].lower()
    suffix = clause[match.end() :].lower()

    fresh_baseline = re.search(r"\bfresh(?:\s+schema)?\s+baseline\b", lower)
    if (
        fresh_baseline is not None
        and match.start() <= fresh_baseline.end() + 1
        and match.end() >= fresh_baseline.start()
    ):
        return True
    if category == "forward-repair" and re.search(
        r"\bcarry[\s-]+$", prefix,
        flags=re.IGNORECASE,
    ):
        return True
    if category in {"existing-shape-gains", "named-relations-gain"} and re.search(
        r"\bgains?\s+(?:a\s+)?(?:monotone\s+)?revision\b.*"
        r"\b(?:approved\s+)?current\s+(?:operation|mutation|commit|event)\b",
        lower,
        flags=re.IGNORECASE,
    ):
        return True
    if re.search(r"\b(?:taxonomy|terminology|vocabulary)\b", lower) and re.search(
        r"\b(?:is|are|as)\b.{0,40}\b(?:taxonomy|label|term)s?\b",
        suffix,
        flags=re.IGNORECASE,
    ):
        return True
    if re.search(r"\b(?:fixture|test)\s+category\b", lower):
        return True
    if category == "migration-preflight" and re.search(
        r"\b(?:coverage|fixtures?|tests?|query[\s-]+plan\s+enforcement)\b",
        lower,
    ):
        return True
    if re.search(r"\b(?:current\s+)?optional\s+feature\b", prefix) and re.search(
        r"\blabel\b", suffix, flags=re.IGNORECASE
    ):
        return True
    if re.search(r"\bpinned\s+compatibility\b", prefix[-80:]):
        return True
    if re.search(r"\bfast[\s-]+forward[\s-]+only\b", match.group(0).lower()):
        return True
    governance = re.search(
        r"\b(?:governance|decision|audit|review)\s+(?:register|record)\b",
        lower,
    )
    if governance is not None and abs(match.start() - governance.start()) <= 80:
        return True
    return False


def transformation_receipt_digest(manifest: dict[str, Any]) -> str:
    body = {
        "archiveContentSha256": manifest["archiveContentSha256"],
        "bindingCurrentContentSha256": manifest["bindingCurrentContentSha256"],
        "familyId": manifest["familyId"],
        "familyVersion": manifest["familyVersion"],
        "sequences": manifest["sequences"],
        "supersessionMapSha256": manifest["supersessionMapSha256"],
        "transformation": manifest["transformation"],
    }
    return _sha256(_canonical_json(body))


def module_set_digest(manifest: dict[str, Any]) -> str:
    body = {
        "archiveContentSha256": manifest["archiveContentSha256"],
        "bindingCurrentContentSha256": manifest["bindingCurrentContentSha256"],
        "familyId": manifest["familyId"],
        "familyVersion": manifest["familyVersion"],
        "modules": manifest["modules"],
        "schemaVersion": manifest["schemaVersion"],
        "sequences": manifest["sequences"],
        "supersessionMapPath": manifest["supersessionMapPath"],
        "supersessionMapSha256": manifest["supersessionMapSha256"],
        "transformationReceiptSha256": manifest["transformationReceiptSha256"],
    }
    return _sha256(_canonical_json(body))


def _physical_lines(data: bytes) -> int:
    return data.count(b"\n")


def _closed_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise SpecFamilyError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def _reject_json_constant(token: str) -> None:
    raise SpecFamilyError(f"non-finite JSON number forbidden: {token}")


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _reject_symlink_components(root: Path, path: Path) -> None:
    try:
        relative = path.relative_to(root)
    except ValueError as error:
        raise SpecFamilyError(f"path escapes repository: {path}") from error
    cursor = root
    for part in relative.parts:
        cursor /= part
        if cursor.is_symlink():
            raise SpecFamilyError(f"symlink forbidden: {cursor.relative_to(root)}")


def _read_regular_file(root: Path, path: Path, label: str) -> bytes:
    _reject_symlink_components(root, path)
    if not path.exists():
        raise SpecFamilyError(f"missing {label}: {path.relative_to(root)}")
    if not path.is_file():
        raise SpecFamilyError(f"{label} is not a regular file: {path.relative_to(root)}")
    resolved_root = root.resolve(strict=True)
    resolved = path.resolve(strict=True)
    if not _is_relative_to(resolved, resolved_root):
        raise SpecFamilyError(f"{label} escapes repository: {path.relative_to(root)}")
    data = path.read_bytes()
    if data.startswith(b"\xef\xbb\xbf"):
        raise SpecFamilyError(f"UTF-8 BOM forbidden: {path.relative_to(root)}")
    if b"\r" in data:
        raise SpecFamilyError(f"CR/CRLF forbidden: {path.relative_to(root)}")
    try:
        data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise SpecFamilyError(f"invalid UTF-8: {path.relative_to(root)}") from error
    if not data.endswith(b"\n"):
        raise SpecFamilyError(f"terminal LF required: {path.relative_to(root)}")
    if _physical_lines(data) > MAX_LINES:
        raise SpecFamilyError(
            f"line cap exceeded: {path.relative_to(root)} "
            f"({_physical_lines(data)} > {MAX_LINES})"
        )
    return data


def _require_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    actual = set(value)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise SpecFamilyError(f"{label} keys invalid; missing={missing} extra={extra}")


def _require_string(value: Any, label: str) -> str:
    if type(value) is not str or not value:
        raise SpecFamilyError(f"{label} must be a nonempty string")
    return value


def _require_digest(value: Any, label: str) -> str:
    text = _require_string(value, label)
    if DIGEST_RE.fullmatch(text) is None:
        raise SpecFamilyError(f"{label} must be sha256:<lowercase-hex>")
    return text


def _require_int(
    value: Any,
    label: str,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    if type(value) is not int:
        raise SpecFamilyError(f"{label} must be an integer")
    if minimum is not None and value < minimum:
        raise SpecFamilyError(f"{label} must be at least {minimum}")
    if maximum is not None and value > maximum:
        raise SpecFamilyError(f"{label} must be at most {maximum}")
    return value


def _require_utf8(value: Any, label: str, *, allow_empty: bool = False) -> bytes:
    if type(value) is not str or (not allow_empty and not value):
        qualifier = "a string" if allow_empty else "a nonempty string"
        raise SpecFamilyError(f"{label} must be {qualifier}")
    if "\r" in value:
        raise SpecFamilyError(f"{label} contains CR")
    try:
        return value.encode("utf-8")
    except UnicodeEncodeError as error:
        raise SpecFamilyError(f"{label} is not valid UTF-8") from error


def _canonical_repo_path(value: Any, label: str) -> PurePosixPath:
    text = _require_string(value, label)
    if "\\" in text:
        raise SpecFamilyError(f"{label} contains a backslash")
    path = PurePosixPath(text)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise SpecFamilyError(f"{label} must be a canonical repository-relative path")
    if path.as_posix() != text:
        raise SpecFamilyError(f"{label} is not canonical: {text}")
    return path


def _parse_manifest(data: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            data,
            object_pairs_hook=_closed_object,
            parse_constant=_reject_json_constant,
        )
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise SpecFamilyError(f"invalid JSON in {label}: {error}") from error
    if type(value) is not dict:
        raise SpecFamilyError(f"{label} root must be an object")
    _require_exact_keys(value, MANIFEST_KEYS, label)
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != 3:
        raise SpecFamilyError(f"{label} schemaVersion must equal 3")
    return value


def render_index(manifest: dict[str, Any], title: str, manifest_sha256: str) -> bytes:
    index = PurePosixPath(manifest["indexPath"])
    family_dir = index.with_suffix("")
    modules = {module["ordinal"]: module for module in manifest["modules"]}
    rows = [
        f"# {title}",
        "",
        "Status: Normative specification-family package",
        f"Family ID: `{manifest['familyId']}`",
        f"Family version: `{manifest['familyVersion']}`",
        "Binding-current content SHA-256: "
        f"`{manifest['bindingCurrentContentSha256']}`",
        f"Archive content SHA-256: `{manifest['archiveContentSha256']}`",
        f"Frozen-source SHA-256: `{manifest['transformation']['frozenSourceSha256']}`",
        f"Supersession-map SHA-256: `{manifest['supersessionMapSha256']}`",
        f"Module-set SHA-256: `{manifest['moduleSetSha256']}`",
        f"Transformation receipt SHA-256: `{manifest['transformationReceiptSha256']}`",
        f"Machine manifest SHA-256: `{manifest_sha256}`",
        f"Machine manifest: [manifest.json]({family_dir.name}/manifest.json)",
        "Supersession map: "
        f"[supersession-map.json]({family_dir.name}/supersession-map.json)",
        "",
        "## Binding current (default authority)",
        "",
        "The default verified loader returns this net-effective stream. It keeps",
        "every still-effective requirement, moves live baseline rules out of",
        "revision history and replaces only the exact hash-bound slices in the",
        "supersession map. Revision chronology is not current authority.",
        "",
        "Physical modules are independently valid Markdown. Their raw concatenation",
        "is not the logical content hash: receipt normalisation strips only recorded",
        "standalone-fence scaffolding and inverses only recorded link relocations.",
        "Where a split crosses a long SQL fence, receipt normalisation",
        "closes and reopens its long SQL fence without changing logical bytes.",
        "Paths, roles, hashes, sequence order, map and receipt are binding.",
        "",
        "| Ordinal | Module | Role | Topic | Lines | SHA-256 |",
        "|---:|---|---|---|---:|---|",
    ]
    for ordinal in manifest["sequences"]["bindingCurrent"]:
        module = modules[ordinal]
        module_path = PurePosixPath(module["path"])
        relative = module_path.relative_to(index.parent)
        rows.append(
            f"| {module['ordinal']:02d} | [{module_path.name}]({relative.as_posix()}) "
            f"| `{module['role']}` | {module['title']} | {module['lineCount']} "
            f"| `{module['sha256']}` |"
        )
    rows.extend(
        [
            "",
            "## Frozen archive (traceability only)",
            "",
            "The archive loader reconstructs the exact frozen source bytes at",
            f"`{manifest['transformation']['frozenCommit']}`. It exists for audit",
            "and provenance, not implementation. Receipt normalisation strips the",
            "same recorded fence scaffolding and reverses the recorded module-relative",
            "link relocations before checking the frozen line count and SHA-256.",
            "",
            "| Ordinal | Module | Role | Topic | Lines | SHA-256 |",
            "|---:|---|---|---|---:|---|",
        ]
    )
    for ordinal in manifest["sequences"]["archive"]:
        module = modules[ordinal]
        module_path = PurePosixPath(module["path"])
        relative = module_path.relative_to(index.parent)
        rows.append(
            f"| {module['ordinal']:02d} | [{module_path.name}]({relative.as_posix()}) "
            f"| `{module['role']}` | {module['title']} | {module['lineCount']} "
            f"| `{module['sha256']}` |"
        )
    return ("\n".join(rows) + "\n").encode("utf-8")


def _link_target(raw_target: str) -> tuple[str, str | None] | None:
    target = raw_target.strip()
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1]
    target = target.split(maxsplit=1)[0]
    if not target:
        return None
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", target):
        return None
    path_and_query, separator, fragment = target.partition("#")
    path = path_and_query.split("?", 1)[0]
    return unquote(path), unquote(fragment) if separator else None


def _github_heading_anchors(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    anchors: set[str] = set()
    counts: dict[str, int] = {}
    fence_char: str | None = None
    fence_length = 0
    for line in text.splitlines():
        fence = FENCE_RE.match(line)
        if fence is not None:
            marker = fence.group(1)
            if fence_char is None:
                fence_char = marker[0]
                fence_length = len(marker)
                continue
            if marker[0] == fence_char and len(marker) >= fence_length:
                fence_char = None
                fence_length = 0
                continue
        if fence_char is not None:
            continue
        heading = re.match(r"^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$", line)
        if heading is None:
            continue
        value = re.sub(r"<[^>]+>", "", heading.group(1))
        value = re.sub(r"[`*_~]", "", value)
        value = re.sub(r"[^\w\- ]", "", value.lower())
        base = re.sub(r" +", "-", value.strip())
        occurrence = counts.get(base, 0)
        counts[base] = occurrence + 1
        anchors.add(base if occurrence == 0 else f"{base}-{occurrence}")
    return anchors


def _validate_links(root: Path, source_path: Path, line: str, line_number: int) -> None:
    for match in LINK_RE.finditer(line):
        parsed = _link_target(match.group(1))
        if parsed is None:
            continue
        target, fragment = parsed
        candidate = source_path if target == "" else source_path.parent / target
        try:
            resolved = candidate.resolve(strict=True)
        except FileNotFoundError as error:
            raise SpecFamilyError(
                f"broken link at {source_path.relative_to(root)}:{line_number}: {target}"
            ) from error
        if not _is_relative_to(resolved, root.resolve(strict=True)):
            raise SpecFamilyError(
                f"link escapes repository at {source_path.relative_to(root)}:"
                f"{line_number}: {target}"
            )
        if fragment is not None and resolved.suffix.lower() == ".md":
            if fragment not in _github_heading_anchors(resolved):
                raise SpecFamilyError(
                    f"broken fragment at {source_path.relative_to(root)}:"
                    f"{line_number}: #{fragment}"
                )


def _scan_markdown_stream(
    root: Path,
    module_parts: list[tuple[Path, str]],
) -> tuple[str, ...]:
    definitions: list[str] = []
    fence_char: str | None = None
    fence_length = 0
    fence_source: tuple[Path, int] | None = None

    for source_path, text in module_parts:
        for line_number, line in enumerate(text.splitlines(), start=1):
            fence = FENCE_RE.match(line)
            if fence is not None:
                marker = fence.group(1)
                if fence_char is None:
                    fence_char = marker[0]
                    fence_length = len(marker)
                    fence_source = (source_path, line_number)
                    continue
                if marker[0] == fence_char and len(marker) >= fence_length:
                    fence_char = None
                    fence_length = 0
                    fence_source = None
                    continue
            if fence_char is not None:
                continue
            _validate_links(root, source_path, line, line_number)
            requirement = REQUIREMENT_DEFINITION_RE.match(line)
            if requirement is not None:
                definitions.append(requirement.group(1))

    if fence_source is not None:
        path, line_number = fence_source
        raise SpecFamilyError(
            f"unclosed Markdown fence opened at {path.relative_to(root)}:{line_number}"
        )
    duplicates = sorted({item for item in definitions if definitions.count(item) > 1})
    if duplicates:
        raise SpecFamilyError(f"duplicate requirement definitions: {duplicates}")
    return tuple(definitions)


def _scan_family_markdown(
    root: Path,
    module_parts: list[tuple[Path, str]],
) -> tuple[str, ...]:
    for module_part in module_parts:
        _scan_markdown_stream(root, [module_part])
    return _scan_markdown_stream(root, module_parts)


def _validate_sequences(
    manifest: dict[str, Any],
) -> tuple[tuple[int, ...], tuple[int, ...]]:
    sequences = manifest["sequences"]
    if type(sequences) is not dict:
        raise SpecFamilyError("sequences must be an object")
    _require_exact_keys(sequences, SEQUENCE_KEYS, "sequences")
    modules = manifest["modules"]
    module_count = len(modules)

    parsed: dict[str, tuple[int, ...]] = {}
    for name in ("bindingCurrent", "archive"):
        raw = sequences[name]
        if type(raw) is not list or not raw:
            raise SpecFamilyError(f"sequences.{name} must be a nonempty array")
        values = tuple(
            _require_int(
                value,
                f"sequences.{name}[{position}]",
                minimum=0,
                maximum=module_count - 1,
            )
            for position, value in enumerate(raw)
        )
        if len(values) != len(set(values)):
            raise SpecFamilyError(f"sequences.{name} contains duplicate ordinals")
        parsed[name] = values

    binding_set = set(parsed["bindingCurrent"])
    archive_set = set(parsed["archive"])
    if binding_set | archive_set != set(range(module_count)):
        raise SpecFamilyError("sequences must cover the closed module inventory")
    for ordinal, module in enumerate(modules):
        role = module["role"]
        in_binding = ordinal in binding_set
        in_archive = ordinal in archive_set
        expected = {
            "shared-current": (True, True),
            "current-only": (True, False),
            "archive-only": (False, True),
        }[role]
        if (in_binding, in_archive) != expected:
            raise SpecFamilyError(
                f"module {ordinal} role/sequence membership drift: {role}"
            )
    if not any(module["role"] == "current-only" for module in modules):
        raise SpecFamilyError("family must contain current-only authority")
    if not any(module["role"] == "archive-only" for module in modules):
        raise SpecFamilyError("family must retain archive-only traceability")
    return parsed["bindingCurrent"], parsed["archive"]


def _sql_parentheses_are_balanced(text: str) -> bool:
    depth = 0
    quote: str | None = None
    in_block_comment = False
    index = 0
    while index < len(text):
        char = text[index]
        following = text[index + 1] if index + 1 < len(text) else ""
        if in_block_comment:
            if char == "*" and following == "/":
                in_block_comment = False
                index += 2
                continue
            index += 1
            continue
        if quote is not None:
            if char == quote and following == quote:
                index += 2
                continue
            if char == quote:
                quote = None
            index += 1
            continue
        if char == "-" and following == "-":
            newline = text.find("\n", index + 2)
            index = len(text) if newline < 0 else newline + 1
            continue
        if char == "/" and following == "*":
            in_block_comment = True
            index += 2
            continue
        if char in {"'", '"'}:
            quote = char
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth < 0:
                return False
        index += 1
    return depth == 0 and quote is None and not in_block_comment


def _assert_sql_statement_boundary(content: bytes, offset: int, label: str) -> None:
    prefix = content[:offset].decode("utf-8")
    suffix = content[offset:].decode("utf-8")
    fence_char: str | None = None
    fence_length = 0
    fence_info = ""
    sql_lines: list[str] = []
    for line in prefix.splitlines(keepends=True):
        fence = FENCE_RE.match(line.removesuffix("\n"))
        if fence is not None:
            marker = fence.group(1)
            if fence_char is None:
                fence_char = marker[0]
                fence_length = len(marker)
                fence_info = fence.group(2).strip().split(maxsplit=1)[0].lower()
                sql_lines = []
                continue
            if marker[0] == fence_char and len(marker) >= fence_length:
                fence_char = None
                fence_length = 0
                fence_info = ""
                sql_lines = []
                continue
        if fence_char is not None:
            sql_lines.append(line)
    if fence_char is None or fence_info != "sql":
        raise SpecFamilyError(f"{label} is not inside an open SQL fence")
    sql = "".join(sql_lines)
    previous = next((line.strip() for line in reversed(sql.splitlines()) if line.strip()), "")
    following = next((line.strip() for line in suffix.splitlines() if line.strip()), "")
    if re.fullmatch(r"\);?", previous) is None:
        raise SpecFamilyError(f"{label} does not follow a complete SQL statement")
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*\(", following) is None:
        raise SpecFamilyError(f"{label} does not precede a top-level SQL statement")
    if not _sql_parentheses_are_balanced(sql):
        raise SpecFamilyError(f"{label} crosses an open SQL expression")


def _validate_transformation(
    stem: str,
    manifest: dict[str, Any],
    module_bytes: list[bytes],
    archive_sequence: tuple[int, ...],
) -> tuple[bytes, bytes, dict[int, bytes]]:
    transformation = manifest["transformation"]
    if type(transformation) is not dict:
        raise SpecFamilyError("transformation must be an object")
    _require_exact_keys(transformation, TRANSFORMATION_KEYS, "transformation")
    if type(transformation["schemaVersion"]) is not int or transformation["schemaVersion"] != 1:
        raise SpecFamilyError("transformation.schemaVersion must equal 1")
    if transformation["kind"] != "reversible-family-split-v1":
        raise SpecFamilyError("transformation.kind is invalid")

    frozen = FROZEN_SOURCES[stem]
    if transformation["frozenCommit"] != FROZEN_COMMIT:
        raise SpecFamilyError(f"frozen commit drift for {stem}")
    if COMMIT_RE.fullmatch(transformation["frozenCommit"]) is None:
        raise SpecFamilyError("transformation.frozenCommit must be lowercase hex")
    if transformation["frozenSourcePath"] != frozen["path"]:
        raise SpecFamilyError(f"frozen source path drift for {stem}")
    _canonical_repo_path(
        transformation["frozenSourcePath"], "transformation.frozenSourcePath"
    )
    if transformation["frozenSourceLineCount"] != frozen["lineCount"]:
        raise SpecFamilyError(f"frozen source line-count drift for {stem}")
    if transformation["frozenSourceSha256"] != frozen["sha256"]:
        raise SpecFamilyError(f"frozen source digest drift for {stem}")

    scaffolding = transformation["scaffolding"]
    if type(scaffolding) is not list:
        raise SpecFamilyError("transformation.scaffolding must be an array")
    scaffold_by_boundary: dict[int, tuple[bytes, bytes]] = {}
    observed_scaffolding: list[tuple[int, str, str]] = []
    for position, item in enumerate(scaffolding):
        if type(item) is not dict:
            raise SpecFamilyError(f"scaffolding {position} must be an object")
        _require_exact_keys(item, SCAFFOLD_KEYS, f"scaffolding {position}")
        ordinal = _require_int(
            item["afterModuleOrdinal"],
            f"scaffolding {position} afterModuleOrdinal",
            minimum=0,
            maximum=len(module_bytes) - 1,
        )
        if ordinal in scaffold_by_boundary:
            raise SpecFamilyError(f"duplicate scaffolding boundary: {ordinal}")
        if ordinal not in archive_sequence or archive_sequence[-1] == ordinal:
            raise SpecFamilyError(
                f"scaffolding {position} must name a nonterminal archive module"
            )
        left = _require_utf8(
            item["leftAppendUtf8"],
            f"scaffolding {position} leftAppendUtf8",
            allow_empty=True,
        )
        right = _require_utf8(
            item["rightPrependUtf8"],
            f"scaffolding {position} rightPrependUtf8",
            allow_empty=True,
        )
        if not left and not right:
            raise SpecFamilyError(f"scaffolding {position} cannot be empty")
        if (left and not left.endswith(b"\n")) or (right and not right.endswith(b"\n")):
            raise SpecFamilyError(f"scaffolding {position} must contain complete lines")
        scaffold_by_boundary[ordinal] = (left, right)
        observed_scaffolding.append(
            (ordinal, item["leftAppendUtf8"], item["rightPrependUtf8"])
        )
    if tuple(observed_scaffolding) != EXPECTED_SCAFFOLDING[stem]:
        raise SpecFamilyError(f"scaffolding receipt drift for {stem}")

    archive_positions = {
        ordinal: position for position, ordinal in enumerate(archive_sequence)
    }
    cleaned_modules: dict[int, bytes] = {}
    for ordinal in archive_sequence:
        raw = module_bytes[ordinal]
        cleaned = raw
        position = archive_positions[ordinal]
        prior_ordinal = archive_sequence[position - 1] if position else None
        if prior_ordinal in scaffold_by_boundary:
            prepend = scaffold_by_boundary[prior_ordinal][1]
            if not cleaned.startswith(prepend):
                raise SpecFamilyError(f"module {ordinal} scaffold prefix drift")
            cleaned = cleaned[len(prepend) :]
        if ordinal in scaffold_by_boundary:
            append = scaffold_by_boundary[ordinal][0]
            if not cleaned.endswith(append):
                raise SpecFamilyError(f"module {ordinal} scaffold suffix drift")
            cleaned = cleaned[: -len(append)] if append else cleaned
        if not cleaned:
            raise SpecFamilyError(f"module {ordinal} has no source bytes after scaffolding")
        cleaned_modules[ordinal] = cleaned

    source_ranges = transformation["sourceRanges"]
    if type(source_ranges) is not list or len(source_ranges) != len(archive_sequence):
        raise SpecFamilyError(
            "transformation.sourceRanges must cover every archive module"
        )
    next_line = 1
    observed_context: list[tuple[int, int]] = []
    for position, item in enumerate(source_ranges):
        if type(item) is not dict:
            raise SpecFamilyError(f"source range {position} must be an object")
        _require_exact_keys(item, SOURCE_RANGE_KEYS, f"source range {position}")
        ordinal = archive_sequence[position]
        if item["moduleOrdinal"] != ordinal or type(item["moduleOrdinal"]) is not int:
            raise SpecFamilyError(f"source range {position} ordinal drift")
        start = _require_int(
            item["sourceStartLine"], f"source range {position} start", minimum=1
        )
        end = _require_int(
            item["sourceEndLine"], f"source range {position} end", minimum=start
        )
        if start != next_line:
            raise SpecFamilyError(f"source ranges are not contiguous at module {position}")
        if end - start + 1 != _physical_lines(cleaned_modules[ordinal]):
            raise SpecFamilyError(f"source range line-count drift at module {position}")
        if item["kind"] not in SOURCE_KINDS:
            raise SpecFamilyError(f"source range classification drift at module {position}")
        if item["kind"] == "binding-context":
            observed_context.append((start, end))
        next_line = end + 1
    if next_line - 1 != frozen["lineCount"]:
        raise SpecFamilyError(f"source ranges do not cover frozen source for {stem}")
    if tuple(observed_context) != BINDING_CONTEXT_RANGES[stem]:
        raise SpecFamilyError(f"binding-context range drift for {stem}")

    archival_logical = b"".join(
        cleaned_modules[ordinal] for ordinal in archive_sequence
    )

    split_points = transformation["splitPoints"]
    if type(split_points) is not list or len(split_points) != len(archive_sequence) - 1:
        raise SpecFamilyError(
            "transformation.splitPoints must cover every archive boundary"
        )
    cumulative = 0
    for position, item in enumerate(split_points):
        if type(item) is not dict:
            raise SpecFamilyError(f"split point {position} must be an object")
        _require_exact_keys(item, SPLIT_POINT_KEYS, f"split point {position}")
        ordinal = archive_sequence[position]
        if item["afterModuleOrdinal"] != ordinal or type(item["afterModuleOrdinal"]) is not int:
            raise SpecFamilyError(f"split point {position} ordinal drift")
        cumulative += len(cleaned_modules[ordinal])
        offset = _require_int(
            item["logicalByteOffset"], f"split point {position} offset", minimum=1
        )
        if offset != cumulative:
            raise SpecFamilyError(f"split point {position} offset drift")
        if item["boundaryKind"] not in BOUNDARY_KINDS:
            raise SpecFamilyError(f"split point {position} boundary kind invalid")
        if ordinal in scaffold_by_boundary and item["boundaryKind"] != "sql-statement":
            raise SpecFamilyError(
                f"split point {position} with fence scaffolding must be a SQL statement"
            )
        if item["boundaryKind"] == "sql-statement":
            _assert_sql_statement_boundary(
                archival_logical, offset, f"split point {position}"
            )

    relocated_links = transformation["relocatedLinks"]
    if type(relocated_links) is not list:
        raise SpecFamilyError("transformation.relocatedLinks must be an array")
    inverse: list[tuple[int, bytes, bytes]] = []
    prior_end = -1
    for position, item in enumerate(relocated_links):
        if type(item) is not dict:
            raise SpecFamilyError(f"relocated link {position} must be an object")
        _require_exact_keys(item, RELOCATED_LINK_KEYS, f"relocated link {position}")
        offset = _require_int(
            item["logicalByteOffset"], f"relocated link {position} offset", minimum=0
        )
        before = _require_utf8(item["beforeUtf8"], f"relocated link {position} beforeUtf8")
        after = _require_utf8(item["afterUtf8"], f"relocated link {position} afterUtf8")
        if before == after:
            raise SpecFamilyError(f"relocated link {position} does not change bytes")
        if offset < prior_end:
            raise SpecFamilyError("relocated-link offsets must be ordered and nonoverlapping")
        if archival_logical[offset : offset + len(after)] != after:
            raise SpecFamilyError(f"relocated link {position} target bytes drift")
        prior_end = offset + len(after)
        inverse.append((offset, before, after))

    reconstructed = archival_logical
    for offset, before, after in reversed(inverse):
        reconstructed = reconstructed[:offset] + before + reconstructed[offset + len(after) :]
    if _physical_lines(reconstructed) != frozen["lineCount"]:
        raise SpecFamilyError(f"frozen reconstruction line-count drift for {stem}")
    if _sha256(reconstructed) != frozen["sha256"]:
        raise SpecFamilyError(f"frozen reconstruction digest drift for {stem}")

    expected_relocations = EXPECTED_RELOCATIONS[stem]
    if len(inverse) != len(expected_relocations):
        raise SpecFamilyError(f"relocated-link count drift for {stem}")
    for position, ((offset, before, after), expected) in enumerate(
        zip(inverse, expected_relocations, strict=True)
    ):
        expected_before, expected_after, expected_line = expected
        if before.decode("utf-8") != expected_before or after.decode("utf-8") != expected_after:
            raise SpecFamilyError(f"relocated link {position} byte contract drift")
        frozen_offset = offset - sum(
            len(prior_after) - len(prior_before)
            for _, prior_before, prior_after in inverse[:position]
        )
        actual_line = reconstructed[:frozen_offset].count(b"\n") + 1
        if actual_line != expected_line:
            raise SpecFamilyError(f"relocated link {position} source-line drift")

    return archival_logical, reconstructed, cleaned_modules


def _line_slice(data: bytes, start: int, end: int, label: str) -> bytes:
    lines = data.splitlines(keepends=True)
    if not 1 <= start <= end <= len(lines):
        raise SpecFamilyError(f"{label} line range is outside its source")
    return b"".join(lines[start - 1 : end])


def _parse_closed_json(data: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            data,
            object_pairs_hook=_closed_object,
            parse_constant=_reject_json_constant,
        )
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise SpecFamilyError(f"invalid JSON in {label}: {error}") from error
    if type(value) is not dict:
        raise SpecFamilyError(f"{label} root must be an object")
    return value


def _validate_rule5_evidence_fixtures(
    root: Path,
    stem: str,
    supersession_map: dict[str, Any],
    archive: bytes,
) -> None:
    crosswalk_data = _read_regular_file(
        root,
        root / Path(*RULE5_CROSSWALK_PATH.parts),
        "F023 Rule-5 crosswalk",
    )
    if _sha256(crosswalk_data) != RULE5_CROSSWALK_SHA256:
        raise SpecFamilyError("F023 Rule-5 crosswalk digest drift")
    crosswalk = _parse_closed_json(
        crosswalk_data,
        RULE5_CROSSWALK_PATH.as_posix(),
    )
    _require_exact_keys(crosswalk, RULE5_CROSSWALK_KEYS, "F023 Rule-5 crosswalk")
    if crosswalk["schemaVersion"] != 1 or type(crosswalk["schemaVersion"]) is not int:
        raise SpecFamilyError("F023 Rule-5 crosswalk schemaVersion must equal 1")
    if crosswalk["decision"] != "D-027":
        raise SpecFamilyError("F023 Rule-5 crosswalk decision drift")
    entries = crosswalk["entries"]
    if type(entries) is not list or len(entries) != len(EXPECTED_RULE5_TO_F023):
        raise SpecFamilyError("F023 Rule-5 crosswalk entry-count drift")
    if [entry.get("r5Id") for entry in entries if type(entry) is dict] != list(
        EXPECTED_RULE5_TO_F023
    ):
        raise SpecFamilyError("F023 Rule-5 crosswalk ID/order drift")

    map_by_id = {entry["id"]: entry for entry in supersession_map["entries"]}
    for position, entry in enumerate(entries):
        if type(entry) is not dict:
            raise SpecFamilyError(f"F023 Rule-5 crosswalk entry {position} is not an object")
        _require_exact_keys(
            entry,
            RULE5_CROSSWALK_ENTRY_KEYS,
            f"F023 Rule-5 crosswalk entry {position}",
        )
        r5_id = _require_string(entry["r5Id"], f"Rule-5 entry {position} r5Id")
        f023_id = _require_string(entry["f023Id"], f"Rule-5 entry {position} f023Id")
        if EXPECTED_RULE5_TO_F023.get(r5_id) != f023_id:
            raise SpecFamilyError(f"F023 Rule-5 crosswalk mapping drift: {r5_id}")
        expected_family = next(
            family
            for family, ids in EXPECTED_SUPERSESSION_IDS.items()
            if f023_id in ids
        )
        if entry["family"] != expected_family:
            raise SpecFamilyError(f"F023 Rule-5 crosswalk family drift: {r5_id}")
        frozen_range = entry["frozenRange"]
        if (
            type(frozen_range) is not list
            or len(frozen_range) != 2
            or any(type(value) is not int for value in frozen_range)
        ):
            raise SpecFamilyError(f"F023 Rule-5 crosswalk range invalid: {r5_id}")
        expected_anchor = (
            (
                990,
                995,
                "sha256:b0b333ffde75afc2b79579ec4b54ea6d78f817e24ab9935433beed4339c7b7f2",
            )
            if r5_id == "R5-03"
            else AUDIT_ANCHORS[f023_id]
        )
        if tuple(frozen_range) != expected_anchor[:2]:
            raise SpecFamilyError(f"F023 Rule-5 crosswalk range drift: {r5_id}")
        frozen_digest = _require_digest(
            entry["frozenRangeSha256"],
            f"F023 Rule-5 crosswalk {r5_id} frozenRangeSha256",
        )
        if frozen_digest != expected_anchor[2]:
            raise SpecFamilyError(f"F023 Rule-5 crosswalk digest anchor drift: {r5_id}")
        if type(entry["folded"]) is not bool or entry["folded"] != (r5_id == "R5-03"):
            raise SpecFamilyError(f"F023 Rule-5 crosswalk fold drift: {r5_id}")

        if expected_family != stem:
            continue
        extracted = _line_slice(
            archive,
            frozen_range[0],
            frozen_range[1],
            f"F023 Rule-5 crosswalk {r5_id}",
        )
        if _sha256(extracted) != frozen_digest:
            raise SpecFamilyError(f"F023 Rule-5 frozen-range bytes drift: {r5_id}")
        map_entry = map_by_id.get(f023_id)
        if map_entry is None:
            raise SpecFamilyError(f"F023 Rule-5 map owner missing: {r5_id}")
        mapped = map_entry["frozen"]
        if not (
            mapped["startLine"] <= frozen_range[0]
            and frozen_range[1] <= mapped["endLine"]
        ):
            raise SpecFamilyError(f"F023 Rule-5 map owner range drift: {r5_id}")
        if r5_id != "R5-03" and (
            mapped["startLine"], mapped["endLine"]
        ) != tuple(frozen_range):
            raise SpecFamilyError(f"F023 Rule-5 map boundary drift: {r5_id}")

    cases_data = _read_regular_file(
        root,
        root / Path(*SYSTEMIC_MANDATE_CASES_PATH.parts),
        "F023 systemic mandate cases",
    )
    if _sha256(cases_data) != SYSTEMIC_MANDATE_CASES_SHA256:
        raise SpecFamilyError("F023 systemic-mandate fixture digest drift")
    cases = _parse_closed_json(cases_data, SYSTEMIC_MANDATE_CASES_PATH.as_posix())
    _require_exact_keys(
        cases,
        SYSTEMIC_MANDATE_CASE_KEYS,
        "F023 systemic mandate cases",
    )
    if cases["schemaVersion"] != 1 or type(cases["schemaVersion"]) is not int:
        raise SpecFamilyError("F023 systemic-mandate schemaVersion must equal 1")
    seen_categories: set[str] = set()
    seen_exclusions: set[str] = set()
    for polarity, expected_detected in (
        ("positiveClauses", True),
        ("negativeClauses", False),
    ):
        clauses = cases[polarity]
        if type(clauses) is not list or not clauses:
            raise SpecFamilyError(f"F023 systemic-mandate {polarity} must be nonempty")
        for position, clause in enumerate(clauses):
            if type(clause) is not dict:
                raise SpecFamilyError(
                    f"F023 systemic-mandate {polarity} {position} is not an object"
                )
            _require_exact_keys(
                clause,
                (
                    SYSTEMIC_MANDATE_POSITIVE_KEYS
                    if expected_detected
                    else SYSTEMIC_MANDATE_NEGATIVE_KEYS
                ),
                f"F023 systemic-mandate {polarity} {position}",
            )
            category = _require_string(
                clause["category"],
                f"F023 systemic-mandate {polarity} {position} category",
            )
            text = _require_string(
                clause["text"],
                f"F023 systemic-mandate {polarity} {position} text",
            )
            if category in seen_categories:
                raise SpecFamilyError(f"duplicate systemic-mandate category: {category}")
            seen_categories.add(category)
            findings = find_unclassified_positive_mandates(text)
            if expected_detected:
                owner = _require_string(
                    clause["owner"],
                    f"F023 systemic-mandate {polarity} {position} owner",
                )
                if owner not in EXPECTED_RULE5_TO_F023.values():
                    raise SpecFamilyError(
                        f"systemic-mandate candidate lacks map owner: {category}"
                    )
                expected_pattern = _require_string(
                    clause["expectedPattern"],
                    f"F023 systemic-mandate {polarity} {position} expectedPattern",
                )
                if not any(
                    finding.startswith(f"{expected_pattern}:")
                    for finding in findings
                ):
                    raise SpecFamilyError(
                        f"systemic-mandate classifier polarity drift: {category}"
                    )
                continue
            exclusion = _require_string(
                clause["exclusion"],
                f"F023 systemic-mandate {polarity} {position} exclusion",
            )
            if exclusion not in SYSTEMIC_MANDATE_EXCLUSIONS:
                raise SpecFamilyError(
                    f"unknown systemic-mandate exclusion: {exclusion}"
                )
            seen_exclusions.add(exclusion)
            if findings:
                raise SpecFamilyError(
                    f"systemic-mandate classifier polarity drift: {category}"
                )
    if seen_exclusions != SYSTEMIC_MANDATE_EXCLUSIONS:
        raise SpecFamilyError("systemic-mandate seven-exclusion coverage drift")


def _normalise_current_links(
    content: bytes,
    transformation: dict[str, Any],
) -> bytes:
    normalised = content
    for position, item in enumerate(transformation["relocatedLinks"]):
        before = _require_utf8(
            item["beforeUtf8"], f"relocated link {position} beforeUtf8"
        )
        after = _require_utf8(
            item["afterUtf8"], f"relocated link {position} afterUtf8"
        )
        occurrences = normalised.count(after)
        if occurrences != 1:
            raise SpecFamilyError(
                f"binding-current relocated link {position} occurrence drift"
            )
        normalised = normalised.replace(after, before, 1)
    return normalised


def _validate_obligation_matrix(
    root: Path,
    stem: str,
    supersession_map: dict[str, Any],
    manifest_modules: list[dict[str, Any]],
    module_bytes: list[bytes],
    binding_sequence: tuple[int, ...],
    archive_sequence: tuple[int, ...],
    binding_current: bytes,
) -> None:
    closure_data = _read_regular_file(
        root,
        root / Path(*F023_CLOSURE_RECEIPT_PATH.parts),
        "F023 closure receipt",
    )
    if _sha256(closure_data) != F023_CLOSURE_RECEIPT_SHA256:
        raise SpecFamilyError("D-024/F-023 closure-receipt digest drift")
    closure = _parse_closed_json(
        closure_data, F023_CLOSURE_RECEIPT_PATH.as_posix()
    )
    _require_exact_keys(
        closure, F023_CLOSURE_RECEIPT_KEYS, "D-024/F-023 closure receipt"
    )
    expected_closure = {
        "schemaVersion": 1,
        "workItem": "W017",
        "structuralDecision": "D-024",
        "semanticDecision": "D-027",
        "status": "verifying",
        "repairCycle": 2,
        "w003Head": "b618c789608934e33c0b695cd19bf1bd774354d5",
        "w017BaseHead": "dfa608f3e75db495ef034f63f963410bd2460e9b",
        "finding": "F-023",
        "rule5CandidateCount": 14,
        "entryIds": list(EXPECTED_SUPERSESSION_IDS["01-agent-fabric"])
        + list(EXPECTED_SUPERSESSION_IDS["04-agent-fabric-operational-hardening"])
        + list(EXPECTED_SUPERSESSION_IDS["05-project-fabric-console"]),
        "familyVersions": {
            "01-agent-fabric": "0.37",
            "04-agent-fabric-operational-hardening": "1.32",
            "05-project-fabric-console": "1.14",
        },
        "rule5CrosswalkPath": RULE5_CROSSWALK_PATH.as_posix(),
        "rule5CrosswalkSha256": RULE5_CROSSWALK_SHA256,
        "systemicMandateCasesPath": SYSTEMIC_MANDATE_CASES_PATH.as_posix(),
        "systemicMandateCasesSha256": SYSTEMIC_MANDATE_CASES_SHA256,
        "obligationMatrixPath": OBLIGATION_MATRIX_PATH.as_posix(),
        "obligationMatrixSha256": OBLIGATION_MATRIX_SHA256,
        "equivalenceStatus": (
            "exact net-effective restatement proved by archive equality, "
            "current-only ownership and mutation-sensitive obligation matrices; "
            "final exact-commit reviews pending"
        ),
        "acceptanceBoundary": (
            "F-023 remains open until fresh native and Opus review, chaired "
            "acceptance and the consolidated human gate."
        ),
    }
    if closure != expected_closure:
        raise SpecFamilyError("D-024/F-023 closure-receipt content drift")

    matrix_data = _read_regular_file(
        root,
        root / Path(*OBLIGATION_MATRIX_PATH.parts),
        "F023 obligation matrix",
    )
    if _sha256(matrix_data) != OBLIGATION_MATRIX_SHA256:
        raise SpecFamilyError("F023 obligation-matrix digest drift")
    matrix = _parse_closed_json(matrix_data, OBLIGATION_MATRIX_PATH.as_posix())
    _require_exact_keys(matrix, OBLIGATION_MATRIX_KEYS, "F023 obligation matrix")
    if type(matrix["schemaVersion"]) is not int or matrix["schemaVersion"] != 1:
        raise SpecFamilyError("F023 obligation-matrix schemaVersion must equal 1")
    entries = matrix["entries"]
    if type(entries) is not list:
        raise SpecFamilyError("F023 obligation-matrix entries must be an array")
    observed_ids: list[str] = []
    expected_family = {
        entry_id: family
        for family, ids in EXPECTED_SUPERSESSION_IDS.items()
        for entry_id in ids
        if entry_id in MIXED_OBLIGATION_IDS
    }
    modules_by_path = {module["path"]: module for module in manifest_modules}
    ordinals_by_path = {
        module["path"]: ordinal for ordinal, module in enumerate(manifest_modules)
    }
    binding_set = set(binding_sequence)
    archive_set = set(archive_sequence)
    map_by_id = {entry["id"]: entry for entry in supersession_map["entries"]}
    seen_obligations: set[str] = set()

    for position, entry in enumerate(entries):
        if type(entry) is not dict:
            raise SpecFamilyError(
                f"F023 obligation-matrix entry {position} must be an object"
            )
        _require_exact_keys(
            entry,
            OBLIGATION_MATRIX_ENTRY_KEYS,
            f"F023 obligation-matrix entry {position}",
        )
        entry_id = _require_string(
            entry["id"], f"F023 obligation-matrix entry {position} id"
        )
        observed_ids.append(entry_id)
        if entry_id not in expected_family or entry["family"] != expected_family[entry_id]:
            raise SpecFamilyError(f"F023 obligation-matrix family drift: {entry_id}")
        frozen_range = entry["frozenRange"]
        if (
            type(frozen_range) is not list
            or len(frozen_range) != 2
            or any(type(value) is not int for value in frozen_range)
            or tuple(frozen_range) != EXPECTED_MAP_RANGES[entry_id][:2]
        ):
            raise SpecFamilyError(f"F023 obligation-matrix range drift: {entry_id}")
        owner_path = _canonical_repo_path(
            entry["ownerModulePath"],
            f"F023 obligation-matrix {entry_id} ownerModulePath",
        ).as_posix()
        lockstep = entry["lockstepWith"]
        if (
            type(lockstep) is not list
            or any(type(value) is not str or not value for value in lockstep)
            or len(lockstep) != len(set(lockstep))
        ):
            raise SpecFamilyError(f"F023 obligation-matrix lockstep drift: {entry_id}")
        expected_lockstep = {
            "F023-13": ["F023-15"],
            "F023-15": ["F023-13"],
        }.get(entry_id, [])
        if lockstep != expected_lockstep:
            raise SpecFamilyError(f"F023 obligation-matrix lockstep drift: {entry_id}")
        obligations = entry["obligations"]
        if type(obligations) is not list or not obligations:
            raise SpecFamilyError(f"F023 obligation-matrix entry is empty: {entry_id}")

        if entry["family"] != stem:
            continue
        if entry_id not in map_by_id:
            raise SpecFamilyError(f"F023 obligation-matrix map owner missing: {entry_id}")
        if map_by_id[entry_id]["current"]["modulePath"] != owner_path:
            raise SpecFamilyError(f"F023 obligation-matrix map owner drift: {entry_id}")
        if owner_path not in modules_by_path:
            raise SpecFamilyError(f"F023 obligation owner is outside family: {entry_id}")
        owner_ordinal = ordinals_by_path[owner_path]
        owner_module = modules_by_path[owner_path]
        if (
            owner_module["role"] != "current-only"
            or owner_ordinal not in binding_set
            or owner_ordinal in archive_set
        ):
            raise SpecFamilyError(f"F023 obligation owner role drift: {entry_id}")
        owner_text = module_bytes[owner_ordinal].decode("utf-8")
        current_text = binding_current.decode("utf-8")
        for obligation_position, obligation in enumerate(obligations):
            if type(obligation) is not dict:
                raise SpecFamilyError(
                    f"F023 obligation {entry_id}:{obligation_position} must be an object"
                )
            _require_exact_keys(
                obligation,
                OBLIGATION_KEYS,
                f"F023 obligation {entry_id}:{obligation_position}",
            )
            key = _require_string(
                obligation["key"], f"F023 obligation {entry_id}:{obligation_position} key"
            )
            marker = _require_string(
                obligation["marker"],
                f"F023 obligation {entry_id}:{obligation_position} marker",
            )
            qualified = f"{entry_id}:{key}"
            if qualified in seen_obligations:
                raise SpecFamilyError(f"duplicate F023 obligation key: {qualified}")
            seen_obligations.add(qualified)
            if owner_text.count(marker) != 1 or current_text.count(marker) != 1:
                raise SpecFamilyError(f"F023 obligation owner drift: {qualified}")

    if tuple(observed_ids) != MIXED_OBLIGATION_IDS:
        raise SpecFamilyError("F023 obligation-matrix entry ID/order drift")
    expected_for_family = {
        entry_id for entry_id, family in expected_family.items() if family == stem
    }
    observed_for_family = {
        entry["id"] for entry in entries if entry["family"] == stem
    }
    if observed_for_family != expected_for_family:
        raise SpecFamilyError(f"F023 obligation-matrix family coverage drift: {stem}")


def _validate_supersession_map(
    root: Path,
    stem: str,
    manifest: dict[str, Any],
    manifest_modules: list[dict[str, Any]],
    module_bytes: list[bytes],
    binding_sequence: tuple[int, ...],
    archive_sequence: tuple[int, ...],
    archive: bytes,
    binding_current: bytes,
) -> tuple[dict[str, Any], bytes]:
    expected_path = PurePosixPath("docs") / "specs" / stem / "supersession-map.json"
    map_path_value = _canonical_repo_path(
        manifest["supersessionMapPath"], "supersessionMapPath"
    )
    if map_path_value != expected_path:
        raise SpecFamilyError(f"supersession map path drift for {stem}")
    map_path = root / Path(*map_path_value.parts)
    map_data = _read_regular_file(root, map_path, "supersession map")
    value = _parse_closed_json(map_data, map_path_value.as_posix())
    canonical = _canonical_json(value)
    if map_data != canonical + b"\n":
        raise SpecFamilyError(f"supersession map is not canonical JSON: {stem}")
    expected_map_digest = _require_digest(
        manifest["supersessionMapSha256"], "supersessionMapSha256"
    )
    if _sha256(canonical) != expected_map_digest:
        raise SpecFamilyError(f"supersession map digest drift for {stem}")

    _require_exact_keys(value, SUPERSESSION_MAP_KEYS, "supersession map")
    if value["schemaVersion"] != 1 or type(value["schemaVersion"]) is not int:
        raise SpecFamilyError("supersession map schemaVersion must equal 1")
    if value["familyId"] != manifest["familyId"]:
        raise SpecFamilyError("supersession map familyId drift")
    frozen = FROZEN_SOURCES[stem]
    if value["frozenSourceSha256"] != frozen["sha256"]:
        raise SpecFamilyError("supersession map frozen source digest drift")
    if value["bindingCurrentContentSha256"] != _sha256(binding_current):
        raise SpecFamilyError("supersession map binding-current digest drift")

    entries = value["entries"]
    expected_ids = EXPECTED_SUPERSESSION_IDS[stem]
    if type(entries) is not list or len(entries) != len(expected_ids):
        raise SpecFamilyError(f"supersession map entry set drift for {stem}")

    modules_by_path = {module["path"]: module for module in manifest_modules}
    ordinals_by_path = {
        module["path"]: ordinal for ordinal, module in enumerate(manifest_modules)
    }
    binding_set = set(binding_sequence)
    archive_set = set(archive_sequence)
    archive_ranges = {
        item["moduleOrdinal"]: (
            item["sourceStartLine"],
            item["sourceEndLine"],
        )
        for item in manifest["transformation"]["sourceRanges"]
    }
    mapped_archive_ordinals: set[int] = set()
    current_target_ordinals: set[int] = set()
    current_authority_ordinals: set[int] = set()
    prior_end = 0
    seen_ids: set[str] = set()

    for position, entry in enumerate(entries):
        if type(entry) is not dict:
            raise SpecFamilyError(f"supersession entry {position} must be an object")
        _require_exact_keys(
            entry, SUPERSESSION_ENTRY_KEYS, f"supersession entry {position}"
        )
        entry_id = _require_string(entry["id"], f"supersession entry {position} id")
        if entry_id != expected_ids[position] or entry_id in seen_ids:
            raise SpecFamilyError(f"supersession entry ID/order drift: {entry_id}")
        seen_ids.add(entry_id)
        if entry["disposition"] != "replace":
            raise SpecFamilyError(f"{entry_id} must use replace disposition")

        frozen_entry = entry["frozen"]
        if type(frozen_entry) is not dict:
            raise SpecFamilyError(f"{entry_id} frozen must be an object")
        _require_exact_keys(
            frozen_entry, SUPERSESSION_FROZEN_KEYS, f"{entry_id} frozen"
        )
        if frozen_entry["path"] != frozen["path"]:
            raise SpecFamilyError(f"{entry_id} frozen path drift")
        start = _require_int(frozen_entry["startLine"], f"{entry_id} frozen start", minimum=1)
        end = _require_int(frozen_entry["endLine"], f"{entry_id} frozen end", minimum=start)
        digest = _require_digest(frozen_entry["sha256"], f"{entry_id} frozen sha256")
        expected_start, expected_end, expected_digest = EXPECTED_MAP_RANGES[entry_id]
        if (start, end, digest) != (expected_start, expected_end, expected_digest):
            raise SpecFamilyError(f"{entry_id} expanded frozen range drift")
        if start <= prior_end:
            raise SpecFamilyError("supersession frozen ranges overlap or are unordered")
        prior_end = end
        if _sha256(_line_slice(archive, start, end, f"{entry_id} frozen")) != digest:
            raise SpecFamilyError(f"{entry_id} frozen slice digest drift")

        matching_archive = [
            ordinal
            for ordinal, (range_start, range_end) in archive_ranges.items()
            if range_start <= start and end <= range_end
        ]
        if len(matching_archive) != 1:
            raise SpecFamilyError(f"{entry_id} is not owned by one archive module")
        archive_ordinal = matching_archive[0]
        archive_module = manifest_modules[archive_ordinal]
        if (
            archive_module["role"] != "archive-only"
            or archive_ordinal not in archive_set
            or archive_ordinal in binding_set
            or archive_ordinal in mapped_archive_ordinals
        ):
            raise SpecFamilyError(f"{entry_id} archive owner role drift")
        range_start, range_end = archive_ranges[archive_ordinal]
        before = _line_slice(
            archive, range_start, start - 1, f"{entry_id} archive prefix"
        ) if range_start < start else b""
        after = _line_slice(
            archive, end + 1, range_end, f"{entry_id} archive suffix"
        ) if end < range_end else b""
        if before.strip() or after.strip():
            raise SpecFamilyError(f"{entry_id} archive owner has unmapped semantics")
        mapped_archive_ordinals.add(archive_ordinal)

        current = entry["current"]
        if type(current) is not dict:
            raise SpecFamilyError(f"{entry_id} current must be an object")
        _require_exact_keys(
            current, SUPERSESSION_CURRENT_KEYS, f"{entry_id} current"
        )
        if current["role"] != "replacement":
            raise SpecFamilyError(f"{entry_id} current role must be replacement")
        current_path = _canonical_repo_path(
            current["modulePath"], f"{entry_id} current modulePath"
        ).as_posix()
        if current_path not in modules_by_path:
            raise SpecFamilyError(f"{entry_id} current module is outside its family")
        current_ordinal = ordinals_by_path[current_path]
        current_module = modules_by_path[current_path]
        if (
            current_module["role"] != "current-only"
            or current_ordinal not in binding_set
            or current_ordinal in archive_set
            or current_ordinal in current_target_ordinals
        ):
            raise SpecFamilyError(f"{entry_id} current owner role drift")
        current_start = _require_int(
            current["startLine"], f"{entry_id} current start", minimum=1
        )
        current_end = _require_int(
            current["endLine"], f"{entry_id} current end", minimum=current_start
        )
        current_digest = _require_digest(
            current["sha256"], f"{entry_id} current sha256"
        )
        if (
            current_path,
            current_start,
            current_end,
            current_digest,
        ) != EXPECTED_CURRENT_BINDINGS[entry_id]:
            raise SpecFamilyError(f"{entry_id} current binding drift")
        current_data = module_bytes[current_ordinal]
        current_slice = _line_slice(
            current_data, current_start, current_end, f"{entry_id} current"
        )
        if _sha256(current_slice) != current_digest:
            raise SpecFamilyError(f"{entry_id} current slice digest drift")
        current_lines = current_data.splitlines(keepends=True)
        outside = b"".join(
            current_lines[: current_start - 1] + current_lines[current_end:]
        )
        if outside.strip():
            raise SpecFamilyError(f"{entry_id} current module has unbound semantics")
        current_target_ordinals.add(current_ordinal)

        authority_refs = entry["authorityRefs"]
        if type(authority_refs) is not list or not authority_refs:
            raise SpecFamilyError(f"{entry_id} requires authorityRefs")
        observed_refs: set[str] = set()
        observed_bindings: set[tuple[str, str, int, int]] = set()
        for ref_position, authority in enumerate(authority_refs):
            if type(authority) is not dict:
                raise SpecFamilyError(
                    f"{entry_id} authority ref {ref_position} must be an object"
                )
            _require_exact_keys(
                authority,
                AUTHORITY_REF_KEYS,
                f"{entry_id} authority ref {ref_position}",
            )
            ref = _require_string(
                authority["ref"], f"{entry_id} authority ref {ref_position} ref"
            )
            path_value = _canonical_repo_path(
                authority["path"], f"{entry_id} authority ref {ref_position} path"
            )
            ref_start = _require_int(
                authority["startLine"],
                f"{entry_id} authority ref {ref_position} start",
                minimum=1,
            )
            ref_end = _require_int(
                authority["endLine"],
                f"{entry_id} authority ref {ref_position} end",
                minimum=ref_start,
            )
            ref_digest = _require_digest(
                authority["sha256"],
                f"{entry_id} authority ref {ref_position} sha256",
            )
            binding = (ref, path_value.as_posix(), ref_start, ref_end)
            if binding in observed_bindings:
                raise SpecFamilyError(f"{entry_id} duplicate authority binding")
            observed_bindings.add(binding)
            expected_binding = EXPECTED_AUTHORITY_BINDINGS.get(ref)
            if expected_binding is None or (
                path_value.as_posix(), ref_start, ref_end, ref_digest
            ) != expected_binding:
                raise SpecFamilyError(f"{entry_id} authority binding drift: {ref}")
            ref_data = _read_regular_file(
                root,
                root / Path(*path_value.parts),
                f"{entry_id} authority ref {ref_position}",
            )
            if _sha256(
                _line_slice(
                    ref_data,
                    ref_start,
                    ref_end,
                    f"{entry_id} authority ref {ref_position}",
                )
            ) != ref_digest:
                raise SpecFamilyError(f"{entry_id} authority ref digest drift")
            if ref.startswith("A"):
                ref_path = path_value.as_posix()
                if ref_path not in modules_by_path:
                    raise SpecFamilyError(f"{entry_id} authority is not in its family")
                ref_ordinal = ordinals_by_path[ref_path]
                if (
                    manifest_modules[ref_ordinal]["role"] != "current-only"
                    or ref_ordinal not in binding_set
                    or ref_ordinal in archive_set
                ):
                    raise SpecFamilyError(f"{entry_id} authority owner role drift")
                current_authority_ordinals.add(ref_ordinal)
            observed_refs.add(ref)
        if observed_refs != EXPECTED_AUTHORITY_REFS[entry_id]:
            raise SpecFamilyError(f"{entry_id} authority reference set drift")

        rationale = _require_string(entry["rationale"], f"{entry_id} rationale")
        audit_start, audit_end, audit_digest = AUDIT_ANCHORS[entry_id]
        for required in (
            "Removed:",
            "Preserved:",
            audit_digest,
        ):
            if required not in rationale:
                raise SpecFamilyError(f"{entry_id} rationale omits {required}")
        audit_phrase = f"original audit anchor {audit_start}-{audit_end}"
        if audit_phrase not in rationale.lower():
            raise SpecFamilyError(f"{entry_id} rationale omits {audit_phrase}")
        if entry_id == "F023-04" and (
            "sha256:375befd9f11585dddda097dda1c08dba41ae055847ba96556b3f50fe00078246"
            not in rationale
        ):
            raise SpecFamilyError("F023-04 rationale omits the reviewed continuation")
        if entry_id == "F023-04" and (
            "original audit anchor 990-995" not in rationale.lower()
            or "sha256:b0b333ffde75afc2b79579ec4b54ea6d78f817e24ab9935433beed4339c7b7f2"
            not in rationale
        ):
            raise SpecFamilyError("F023-04 rationale omits the folded R5-03 anchor")

    history_ranges: set[tuple[int, int]] = set()
    for ordinal in archive_sequence:
        module = manifest_modules[ordinal]
        if module["role"] != "archive-only" or ordinal in mapped_archive_ordinals:
            continue
        history_ranges.add(archive_ranges[ordinal])
    if history_ranges != set(ARCHIVE_ONLY_HISTORY_RANGES[stem]):
        raise SpecFamilyError(f"archive-only history closure drift for {stem}")

    current_only = {
        ordinal
        for ordinal, module in enumerate(manifest_modules)
        if module["role"] == "current-only"
    }
    if current_only != current_target_ordinals | current_authority_ordinals:
        raise SpecFamilyError(f"current-only module ownership drift for {stem}")
    _validate_rule5_evidence_fixtures(root, stem, value, archive)
    _validate_obligation_matrix(
        root,
        stem,
        value,
        manifest_modules,
        module_bytes,
        binding_sequence,
        archive_sequence,
        binding_current,
    )
    return value, map_data


def _validate_family(root: Path, stem: str) -> FamilyResult:
    specs = root / "docs" / "specs"
    family_dir = specs / stem
    manifest_path = family_dir / "manifest.json"
    manifest_data = _read_regular_file(root, manifest_path, "family manifest")
    manifest = _parse_manifest(manifest_data, manifest_path.relative_to(root).as_posix())

    expected_family_id = f"spec-{stem}"
    if manifest["familyId"] != expected_family_id:
        raise SpecFamilyError(
            f"familyId mismatch for {stem}: expected {expected_family_id}"
        )
    family_version = _require_string(manifest["familyVersion"], "familyVersion")
    index_path_value = _canonical_repo_path(manifest["indexPath"], "indexPath")
    expected_index = PurePosixPath("docs") / "specs" / f"{stem}.md"
    if index_path_value != expected_index:
        raise SpecFamilyError(f"indexPath mismatch for {stem}: {index_path_value}")
    expected_binding_digest = _require_digest(
        manifest["bindingCurrentContentSha256"], "bindingCurrentContentSha256"
    )
    expected_archive_digest = _require_digest(
        manifest["archiveContentSha256"], "archiveContentSha256"
    )
    _require_digest(manifest["supersessionMapSha256"], "supersessionMapSha256")
    expected_module_set_digest = _require_digest(
        manifest["moduleSetSha256"], "moduleSetSha256"
    )
    expected_receipt_digest = _require_digest(
        manifest["transformationReceiptSha256"], "transformationReceiptSha256"
    )

    modules = manifest["modules"]
    if type(modules) is not list or not modules:
        raise SpecFamilyError(f"modules must be a nonempty array for {stem}")
    seen_paths: set[str] = set()
    module_bytes: list[bytes] = []
    module_parts: list[tuple[Path, str]] = []

    for position, module in enumerate(modules):
        if type(module) is not dict:
            raise SpecFamilyError(f"module {position} must be an object")
        _require_exact_keys(module, MODULE_KEYS, f"module {position}")
        if type(module["ordinal"]) is not int or module["ordinal"] != position:
            raise SpecFamilyError(
                f"module ordinal must be contiguous and ordered: expected {position}"
            )
        module_path_value = _canonical_repo_path(module["path"], f"module {position} path")
        expected_parent = PurePosixPath("docs") / "specs" / stem
        if module_path_value.parent != expected_parent:
            raise SpecFamilyError(f"module {position} is outside its family directory")
        if module_path_value.suffix != ".md":
            raise SpecFamilyError(f"module {position} must use .md")
        if not module_path_value.name.startswith(f"{position:02d}-"):
            raise SpecFamilyError(f"module {position} filename must start with {position:02d}-")
        path_text = module_path_value.as_posix()
        if path_text in seen_paths:
            raise SpecFamilyError(f"duplicate module path: {path_text}")
        seen_paths.add(path_text)
        title = _require_string(module["title"], f"module {position} title")
        if any(character in title for character in "\r\n|"):
            raise SpecFamilyError(f"module {position} title is not table-safe")
        if module["role"] not in MODULE_ROLES:
            raise SpecFamilyError(f"module {position} role invalid: {module['role']}")
        if type(module["lineCount"]) is not int or not 1 <= module["lineCount"] <= MAX_LINES:
            raise SpecFamilyError(f"module {position} lineCount invalid")
        expected_digest = _require_digest(module["sha256"], f"module {position} sha256")
        module_path = root / Path(*module_path_value.parts)
        data = _read_regular_file(root, module_path, f"module {position}")
        if data.endswith(b"\n\n"):
            raise SpecFamilyError(
                f"physical module ends with a blank separator line: {path_text}"
            )
        actual_lines = _physical_lines(data)
        if module["lineCount"] != actual_lines:
            raise SpecFamilyError(
                f"module {position} lineCount drift: {module['lineCount']} != {actual_lines}"
            )
        actual_digest = _sha256(data)
        if expected_digest != actual_digest:
            raise SpecFamilyError(f"module {position} hash drift: {path_text}")
        module_bytes.append(data)
        module_parts.append((module_path, data.decode("utf-8")))

    binding_sequence, archive_sequence = _validate_sequences(manifest)

    expected_entries = {"manifest.json", "supersession-map.json"} | {
        PurePosixPath(path).name for path in seen_paths
    }
    actual_entries = {path.name for path in family_dir.iterdir()}
    if actual_entries != expected_entries:
        raise SpecFamilyError(
            f"unlisted or missing family entries for {stem}: "
            f"unlisted={sorted(actual_entries - expected_entries)} "
            f"missing={sorted(expected_entries - actual_entries)}"
        )

    _, archive_content, cleaned_modules = _validate_transformation(
        stem, manifest, module_bytes, archive_sequence
    )
    binding_parts_bytes = [
        cleaned_modules.get(ordinal, module_bytes[ordinal])
        for ordinal in binding_sequence
    ]
    binding_content = _normalise_current_links(
        b"".join(binding_parts_bytes),
        manifest["transformation"],
    )
    for ordinal in binding_sequence:
        module_text = cleaned_modules.get(
            ordinal,
            module_bytes[ordinal],
        ).decode("utf-8")
        findings = find_unclassified_positive_mandates(module_text)
        if findings:
            raise SpecFamilyError(
                "unclassified positive binding-current migration mandate in "
                f"{modules[ordinal]['path']}: {findings[0]}"
            )
    _validate_supersession_map(
        root,
        stem,
        manifest,
        modules,
        module_bytes,
        binding_sequence,
        archive_sequence,
        archive_content,
        binding_content,
    )
    if transformation_receipt_digest(manifest) != expected_receipt_digest:
        raise SpecFamilyError(f"transformation receipt digest drift for {stem}")
    if module_set_digest(manifest) != expected_module_set_digest:
        raise SpecFamilyError(f"module-set digest drift for {stem}")

    if _sha256(binding_content) != expected_binding_digest:
        raise SpecFamilyError(f"binding-current content hash drift: {stem}")
    for entry_id, obsolete in FORBIDDEN_CURRENT_MANDATES[stem].items():
        if obsolete in binding_content:
            raise SpecFamilyError(
                f"{entry_id} obsolete mandate restored to binding current"
            )
    if expected_archive_digest != FROZEN_SOURCES[stem]["sha256"]:
        raise SpecFamilyError(f"archive content hash anchor drift: {stem}")
    if _sha256(archive_content) != expected_archive_digest:
        raise SpecFamilyError(f"archive content hash drift: {stem}")
    text = binding_content.decode("utf-8")
    first_line = text.splitlines()[0] if text else ""
    if not first_line.startswith("# ") or first_line.startswith("## "):
        raise SpecFamilyError(f"family content must start with one H1: {stem}")
    versions = re.findall(r"^Version: (.+)$", text, flags=re.MULTILINE)
    if versions != [family_version]:
        raise SpecFamilyError(
            f"family version drift for {stem}: manifest={family_version} content={versions}"
        )
    for module_part in module_parts:
        _scan_markdown_stream(root, [module_part])
    binding_parts = [
        (
            module_parts[ordinal][0],
            cleaned_modules.get(ordinal, module_bytes[ordinal]).decode("utf-8"),
        )
        for ordinal in binding_sequence
    ]
    archive_parts = [
        (module_parts[ordinal][0], cleaned_modules[ordinal].decode("utf-8"))
        for ordinal in archive_sequence
    ]
    definitions = _scan_markdown_stream(root, binding_parts)
    archive_definitions = _scan_markdown_stream(root, archive_parts)
    expected_requirement_count = EXPECTED_CURRENT_REQUIREMENTS[stem]
    if len(definitions) != expected_requirement_count:
        raise SpecFamilyError(
            f"current requirement-definition count drift for {stem}: "
            f"{len(definitions)} != {expected_requirement_count}"
        )
    if archive_definitions != definitions:
        raise SpecFamilyError(
            f"current requirement-definition inventory drift for {stem}"
        )

    index_path = root / Path(*index_path_value.parts)
    index_data = _read_regular_file(root, index_path, "family index")
    expected_index_data = render_index(manifest, first_line[2:], _sha256(manifest_data))
    if index_data != expected_index_data:
        raise SpecFamilyError(f"root manifest drift: {index_path_value}")
    for line_number, line in enumerate(index_data.decode("utf-8").splitlines(), start=1):
        _validate_links(root, index_path, line, line_number)

    return FamilyResult(
        stem,
        manifest,
        binding_content,
        archive_content,
        definitions,
    )


def validate_repository(root: Path) -> tuple[FamilyResult, ...]:
    root = root.resolve(strict=True)
    results = tuple(_validate_family(root, stem) for stem in REQUIRED_FAMILIES)
    seen: dict[str, str] = {}
    for result in results:
        for requirement in result.current_requirement_definitions:
            prior = seen.get(requirement)
            if prior is not None:
                raise SpecFamilyError(
                    f"duplicate requirement definition across families: "
                    f"{requirement} in {prior} and {result.stem}"
                )
            seen[requirement] = result.stem
    return results


def load_family_bytes(root: Path, family: str) -> bytes:
    stem = family.removeprefix("spec-")
    if stem not in REQUIRED_FAMILIES:
        raise SpecFamilyError(f"unknown specification family: {family}")
    return _validate_family(root.resolve(strict=True), stem).binding_current


def load_family_text(root: Path, family: str) -> str:
    return load_family_bytes(root, family).decode("utf-8")


def load_family_archive_bytes(root: Path, family: str) -> bytes:
    stem = family.removeprefix("spec-")
    if stem not in REQUIRED_FAMILIES:
        raise SpecFamilyError(f"unknown specification family: {family}")
    return _validate_family(root.resolve(strict=True), stem).archive


def load_family_archive_text(root: Path, family: str) -> str:
    return load_family_archive_bytes(root, family).decode("utf-8")


def _parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="repository root (default: checker parent repository)",
    )
    return parser.parse_args(list(argv))


def main(argv: Iterable[str] = ()) -> int:
    args = _parse_args(argv)
    try:
        results = validate_repository(args.root)
    except (OSError, SpecFamilyError) as error:
        print(f"spec-family-invalid: {error}", file=sys.stderr)
        return 1
    module_count = sum(len(result.manifest["modules"]) for result in results)
    print(f"spec families: ok ({len(results)} families, {module_count} modules)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
