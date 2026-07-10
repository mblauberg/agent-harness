#!/usr/bin/env python3
"""Static trigger/doctrine guard for orchestrate.

This is not a live behaviour eval. It checks that the skill remains routable,
bounded, progressively disclosed, and backed by the expected reference files.
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(HERE)
SKILL_MD = os.path.join(SKILL_DIR, "SKILL.md")
REF_DIR = os.path.join(SKILL_DIR, "references")
SCRIPT_DIR = os.path.join(SKILL_DIR, "scripts")
CASES = os.path.join(HERE, "trigger_cases.yaml")

STOP = set(
    "the a an of to and or for with this that in on is be use when it as your you "
    "from into not no never any all each only out off by if".split()
)
PRIMARY_TRIGGER_TERMS = {
    "subagents", "subagent", "independent", "second", "cross-family", "red-team",
    "parallel", "high-stakes", "long-running",
}
REQUIRED_SECTIONS = [
    "## Overview",
    "## Rules",
    "## When This Pays",
    "## Adaptive Loop",
    "## Worker Contract",
    "## References",
]
REQUIRED_REFS = [
    "cli-headless.md",
    "codex-subagents.md",
    "debate-and-panels.md",
    "domain-adaptation.md",
    "dynamic-workflows.md",
    "evaluation-and-observability.md",
    "layering-and-context.md",
    "memory-scratchpad.md",
    "paired-primary.md",
    "retrieval-and-tool-routing.md",
    "routing-and-tiers.md",
    "trigger-boundary.md",
    "verification.md",
]


def parse_cases(path):
    out, key = {}, None
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if re.match(r"^[A-Za-z_]+:\s*$", line):
            key = line.split(":")[0].strip()
            out[key] = []
        elif line.lstrip().startswith("- ") and key:
            item = line.lstrip()[2:].strip().strip('"')
            prompt, _, why = item.partition(" | ")
            out[key].append({"prompt": prompt.strip(), "why": why.strip()})
    return out


def token_norm(w):
    aliases = {"verification": "verify", "verifier": "verify", "verified": "verify"}
    w = aliases.get(w, w)
    if len(w) > 4 and w.endswith("s"):
        w = w[:-1]
    return w


def tokens(s):
    return {token_norm(w) for w in re.findall(r"[a-z0-9]+", s.lower())
            if w not in STOP and len(w) > 2}


def norm(s):
    return re.sub(r"\s+", " ", s).lower()


def frontmatter(text):
    m = re.search(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
    return m.group(1) if m else ""


def description_from_frontmatter(fm):
    m = re.search(r"^description:\s*(?:>\s*)?\n?(.*?)(?:\n[a-zA-Z_]+:|\Z)", fm, re.S | re.M)
    if not m:
        return ""
    return re.sub(r"\s+", " ", m.group(1)).strip().strip('"')


def main():
    fails = []
    if not os.path.exists(SKILL_MD):
        print("FAIL: SKILL.md missing")
        return 1

    text = open(SKILL_MD, encoding="utf-8").read()
    fm = frontmatter(text)
    desc = description_from_frontmatter(fm)
    body = text[len(fm):] if fm else text
    cases = parse_cases(CASES)

    if not fm:
        fails.append("no YAML frontmatter")
    else:
        fm_keys = [line.split(":", 1)[0].strip() for line in fm.splitlines()
                   if re.match(r"^[A-Za-z_]+:", line)]
        if sorted(fm_keys) != ["description", "name"]:
            fails.append(f"frontmatter keys must be only name+description, got {fm_keys}")
        if len(fm) > 1024:
            fails.append(f"frontmatter too long ({len(fm)} chars)")
        if ": " in desc and not re.search(r'description:\s*"', fm) and "description: >" not in fm:
            fails.append("description contains ': ' but is not quoted or folded")

    if not re.search(r"^name:\s*orchestrate\s*$", fm, re.M):
        fails.append("name missing or wrong")
    if not desc.lower().startswith("use when"):
        fails.append("description should start with 'Use when'")
    if "audit this" in desc.lower() or "be thorough" in desc.lower():
        fails.append("description contains overbroad trigger phrase")

    first_250 = desc[:250].lower()
    if not (PRIMARY_TRIGGER_TERMS & tokens(first_250)):
        fails.append("first 250 description chars lack primary trigger terms")

    word_count = len(re.findall(r"\b[\w'-]+\b", text))
    if word_count > 1250:
        fails.append(f"SKILL.md too long for router role ({word_count} words)")

    for section in REQUIRED_SECTIONS:
        if section not in text:
            fails.append(f"missing required section: {section}")

    for script in ("cf_dispatch.sh", "run_dir_init.sh"):
        path = os.path.join(SCRIPT_DIR, script)
        if not os.path.exists(path):
            fails.append(f"missing script: {script}")
            continue
        result = subprocess.run(["bash", "-n", path], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            fails.append(f"script does not parse: {script}: {result.stderr.strip()}")

    desc_tokens = tokens(desc)
    weak_explicit = []
    for case in cases.get("should_trigger_explicit", []):
        if not (tokens(case["prompt"]) & desc_tokens):
            weak_explicit.append(case["prompt"])
    if weak_explicit:
        fails.append("explicit trigger cases with no description token overlap: " + "; ".join(weak_explicit))

    weak_inferred = []
    for case in cases.get("should_trigger_inferred", []):
        overlap = tokens(case["prompt"]) & desc_tokens
        if len(overlap) < 2:
            weak_inferred.append(case["prompt"])
    if weak_inferred:
        fails.append("inferred trigger cases with weak description overlap: " + "; ".join(weak_inferred))

    for case in cases.get("should_not_trigger", []):
        overlap = tokens(case["prompt"]) & desc_tokens
        # Tool names alone must not be treated as trigger coverage.
        meaningful = overlap - {"codex", "agy", "cursor", "kiro", "claude", "file", "high", "stake"}
        if len(meaningful) >= 2:
            fails.append(f"non-trigger case overlaps description too strongly: {case['prompt']} ({sorted(meaningful)})")

    for case in cases.get("ambiguous_confirm_first", []):
        if case["prompt"].lower() in desc.lower():
            fails.append(f"ambiguous phrase appears directly in description: {case['prompt']}")

    ntext = norm(text)
    for inv in cases.get("doctrine_invariants", []):
        if norm(inv["prompt"]) not in ntext:
            fails.append(f"SKILL.md missing doctrine invariant: {inv['prompt']!r}")

    refblob = ""
    for required in REQUIRED_REFS:
        if not os.path.exists(os.path.join(REF_DIR, required)):
            fails.append(f"missing required reference file: {required}")
    if os.path.isdir(REF_DIR):
        for fn in os.listdir(REF_DIR):
            p = os.path.join(REF_DIR, fn)
            if fn.endswith(".md") and os.path.isfile(p):
                refblob += open(p, encoding="utf-8").read() + " "
    dynamic_path = os.path.join(REF_DIR, "dynamic-workflows.md")
    if os.path.exists(dynamic_path):
        dynamic_text = open(dynamic_path, encoding="utf-8").read()
        if "agy --sandbox -p" in dynamic_text and "read-only" in dynamic_text:
            fails.append("dynamic-workflows.md must not imply agy --sandbox certifies read-only verification")
    nref = norm(refblob)
    for inv in cases.get("reference_invariants", []):
        if norm(inv["prompt"]) not in nref and norm(inv["prompt"]) not in ntext:
            fails.append(f"references missing invariant: {inv['prompt']!r}")

    if fails:
        print("SKILL CHECK: FAIL")
        for fail in fails:
            print("  -", fail)
        return 1

    print(
        "SKILL CHECK: PASS "
        f"({len(cases.get('should_trigger_explicit', []))} explicit, "
        f"{len(cases.get('should_trigger_inferred', []))} inferred, "
        f"{word_count} words)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
