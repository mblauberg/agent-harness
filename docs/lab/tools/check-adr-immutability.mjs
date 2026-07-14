#!/usr/bin/env node
/* check-adr-immutability.mjs — freeze-and-verify guard for frozen ADRs.
 *
 * DISCIPLINE: a frozen ADR body (Status: decided | superseded) is append-only
 * decision evidence. It must NEVER be substantively edited. To change a decision
 * you author a NEW superseding ADR; the old ADR is touched ONLY to add a
 * `Superseded-by:` pointer + a one-line status flip.
 *
 * This tool makes that mechanically enforceable:
 *   --baseline   (re)generate `.decided-adr-manifest.json`, mapping every FROZEN
 *                ADR (adr/<id>.md whose Status is `decided` or `superseded`) to a
 *                sha256 content hash of its file (v1 hashes the whole file —
 *                simple + robust).
 *   <no flag>    recompute the hashes and FAIL (exit 1) if any manifested ADR
 *                changed at all. Strict by design: v1 does not try to auto-classify
 *                metadata-only vs substantive edits — it flags ANY drift and hands
 *                the human two explicit resolutions:
 *                  (a) confirm it was an allowed metadata-only edit -> re-baseline;
 *                  (b) it was substantive -> revert + author a superseding ADR.
 *
 * Layout: the lab keeps one flat file per decision at adr/<id>.md. Cross-family
 * review sidecars live under adr/_reviews/ and option matrices / heavy research
 * under adr/_meta/ — both are evidence, NOT frozen records, and are skipped (they
 * are subdirectories, so they never match adr/*.md).
 *
 * Dependency-free: Node built-ins only (node:crypto, node:fs, node:path, node:url).
 * Run from anywhere — paths resolve from this file, not from cwd:
 *   node tools/check-adr-immutability.mjs --baseline
 *   node tools/check-adr-immutability.mjs
 */

import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  statSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/* ----------------------------------------------------------------- locations */
/* This file lives at <lab>/tools/check-adr-immutability.mjs, so the lab dir is
   the tools/ parent — one directory up. Resolving from the script (not cwd)
   keeps it robust to where it is launched from. */
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const LAB_DIR = resolve(SCRIPT_DIR, '..');
const ADR_DIR = join(LAB_DIR, 'adr');
const MANIFEST_PATH = join(LAB_DIR, '.decided-adr-manifest.json');
const MANIFEST_REL = '.decided-adr-manifest.json';

const MANIFEST_VERSION = 1;
const HASH_ALGO = 'sha256';

/* A frozen ADR is one whose Status line is `decided` or `superseded`: the
   decision is settled, so its body becomes append-only evidence. ADRs still in
   flight (proposed / exploring / forked) are mutable work-in-progress and are
   neither baselined nor checked. */
const FROZEN_STATUSES = new Set(['decided', 'superseded']);

/* ------------------------------------------------------------------- helpers */

function relFromLab(absPath) {
  return absPath.slice(LAB_DIR.length + 1).split('\\').join('/');
}

/* sha256 of the raw file bytes. v1 hashes the whole file: the simplest contract
   that is impossible to game — there is no "body extraction" heuristic to drift. */
function hashFile(absPath) {
  const buf = readFileSync(absPath);
  return createHash(HASH_ALGO).update(buf).digest('hex');
}

/* Detect the ADR's status from its first `Status:` line. Markdown bold/emphasis
   is tolerated (the search is a plain substring over the lower-cased line). */
function detectStatus(absPath) {
  const text = readFileSync(absPath, 'utf8');
  const line = text.split(/\r?\n/).find((l) => /status\s*:/i.test(l));
  if (!line) return 'unknown';
  const lower = line.toLowerCase();
  for (const s of ['superseded', 'decided', 'forked', 'exploring', 'proposed']) {
    if (lower.includes(s)) return s;
  }
  return 'unknown';
}

/* Discover every flat ADR record on disk: adr/<id>.md (one file per decision).
   The _reviews/ and _meta/ subdirs hold evidence, not frozen records; they are
   directories so they never match the `.md` test and are skipped automatically.
   Returns sorted [{ id, rel, abs, status }]. */
function discoverAdrs() {
  if (!existsSync(ADR_DIR)) {
    fail(`adr/ directory not found at ${ADR_DIR}`);
  }
  const out = [];
  for (const name of readdirSync(ADR_DIR)) {
    if (!name.endsWith('.md')) continue; // skip the _reviews/ and _meta/ subdirs
    const abs = join(ADR_DIR, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const id = name.replace(/\.md$/, '');
    out.push({ id, rel: relFromLab(abs), abs, status: detectStatus(abs) });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/* The subset of discovered ADRs that are frozen (decided | superseded). */
function discoverFrozenAdrs() {
  return discoverAdrs().filter((a) => FROZEN_STATUSES.has(a.status));
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    fail(
      `manifest not found: ${MANIFEST_REL}\n` +
        `Run a baseline first:  node tools/check-adr-immutability.mjs --baseline`,
    );
  }
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    fail(`manifest is not valid JSON (${MANIFEST_REL}): ${e.message}`);
  }
}

function fail(msg) {
  process.stderr.write(`\nERROR: ${msg}\n`);
  process.exit(2);
}

/* -------------------------------------------------------------- --baseline */

function runBaseline() {
  const adrs = discoverFrozenAdrs();
  const entries = {};
  for (const a of adrs) {
    entries[a.id] = {
      path: a.rel,
      status: a.status,
      bytes: statSync(a.abs).size,
      [HASH_ALGO]: hashFile(a.abs),
    };
  }
  const manifest = {
    tool: 'tools/check-adr-immutability.mjs',
    note:
      'Frozen content hashes of decided/superseded ADRs (decision evidence). ' +
      'Frozen ADRs are append-only: never edit a decision in place, supersede it. ' +
      'Do NOT hand-edit this file; regenerate with --baseline after an allowed ' +
      'metadata-only edit or a new/superseding ADR.',
    version: MANIFEST_VERSION,
    hashAlgorithm: HASH_ALGO,
    baselinedAt: new Date().toISOString(),
    count: adrs.length,
    adrs: entries,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const byStatus = {};
  for (const id of Object.keys(entries)) {
    const s = entries[id].status;
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  process.stdout.write(
    `BASELINE WRITTEN: ${MANIFEST_REL}\n` +
      `  ADRs frozen : ${adrs.length}\n` +
      `  by status   : ${Object.entries(byStatus)
        .map(([s, n]) => `${s}=${n}`)
        .join('  ') || '(none)'}\n` +
      `  algorithm   : ${HASH_ALGO}\n` +
      `  baselined   : ${manifest.baselinedAt}\n` +
      `\nThe frozen-ADR corpus is now baselined. Run the check (no flag) to verify.\n`,
  );
  process.exit(0);
}

/* ------------------------------------------------------------------- check */

function runCheck() {
  const manifest = loadManifest();
  const manifestAdrs = manifest.adrs || {};
  const algo = manifest.hashAlgorithm || HASH_ALGO;

  const changed = []; // { id, path, expected, actual, expBytes, actBytes }
  const missing = []; // { id, path }
  const ok = [];
  const newAdrs = []; // frozen ids present on disk but not in manifest

  // 1. Every manifested ADR must still exist and hash identically.
  for (const id of Object.keys(manifestAdrs).sort()) {
    const entry = manifestAdrs[id];
    const abs = join(LAB_DIR, entry.path);
    if (!existsSync(abs)) {
      missing.push({ id, path: entry.path });
      continue;
    }
    const actual = createHash(algo).update(readFileSync(abs)).digest('hex');
    const expected = entry[algo] || entry.sha256;
    if (actual !== expected) {
      changed.push({
        id,
        path: entry.path,
        expected,
        actual,
        expBytes: entry.bytes,
        actBytes: statSync(abs).size,
      });
    } else {
      ok.push(id);
    }
  }

  // 2. Frozen ADRs on disk but not yet baselined — reported, NOT a failure
  //    (finalising a new decision is exactly how the corpus grows).
  const onDisk = discoverFrozenAdrs();
  for (const a of onDisk) {
    if (!(a.id in manifestAdrs)) newAdrs.push(a.id);
  }

  const failed = changed.length > 0 || missing.length > 0;

  // ---- report ----
  process.stdout.write(
    `ADR IMMUTABILITY CHECK\n` +
      `  manifest   : ${MANIFEST_REL} (baselined ${manifest.baselinedAt || '?'})\n` +
      `  frozen     : ${Object.keys(manifestAdrs).length} decided/superseded ADRs\n` +
      `  unchanged  : ${ok.length}\n` +
      `  changed    : ${changed.length}\n` +
      `  missing    : ${missing.length}\n` +
      `  new/unfrozen: ${newAdrs.length}${
        newAdrs.length ? '  (' + newAdrs.join(', ') + ')' : ''
      }\n`,
  );

  if (newAdrs.length) {
    process.stdout.write(
      `\nNOTE: ${newAdrs.length} frozen ADR(s) are not yet in the manifest. New ` +
        `decisions are allowed; add them to the freeze with --baseline when ready.\n`,
    );
  }

  if (!failed) {
    process.stdout.write(`\nPASS: no frozen ADR has been edited in place.\n`);
    process.exit(0);
  }

  // ---- failure detail + remediation ----
  process.stderr.write(`\nFAIL: a frozen (decided/superseded) ADR changed on disk.\n`);

  for (const c of changed) {
    process.stderr.write(
      `\n  CHANGED  ${c.id}\n` +
        `    path     ${c.path}\n` +
        `    expected ${c.expected}  (${c.expBytes} bytes)\n` +
        `    actual   ${c.actual}  (${c.actBytes} bytes)\n` +
        `    inspect  git diff -- ${c.path}\n`,
    );
  }
  for (const m of missing) {
    process.stderr.write(
      `\n  MISSING  ${m.id}\n` +
        `    path     ${m.path}  (a frozen ADR was deleted/moved)\n` +
        `    restore  git checkout -- ${m.path}\n`,
    );
  }

  process.stderr.write(
    `\nFrozen ADRs are append-only decision evidence.\n` +
      `Resolve EACH flagged ADR by exactly ONE of:\n` +
      `\n` +
      `  (a) ALLOWED metadata-only edit — you only added a Superseded-by /\n` +
      `      Valid-as-of line, fixed a broken link, or flipped the status line,\n` +
      `      with NO change to options / scores / decision / consequences:\n` +
      `      confirm the diff is metadata-only, then RE-BASELINE and commit the\n` +
      `      manifest with the edit:\n` +
      `          node tools/check-adr-immutability.mjs --baseline\n` +
      `\n` +
      `  (b) SUBSTANTIVE change — you altered what was decided or why. This is\n` +
      `      NOT allowed in place. Revert it and supersede instead:\n` +
      `          git checkout -- <path>\n` +
      `      then author a NEW ADR carrying  Supersedes: <id>,  and edit the old\n` +
      `      ADR ONLY to add  Superseded-by: <new-id>  + a one-line status flip;\n` +
      `      then re-baseline.\n`,
  );
  process.exit(1);
}

/* -------------------------------------------------------------------- main */

function runHelp() {
  process.stdout.write(
    `check-adr-immutability.mjs — freeze & verify decided/superseded ADRs.\n\n` +
      `Usage:\n` +
      `  node tools/check-adr-immutability.mjs            verify no frozen ADR changed\n` +
      `  node tools/check-adr-immutability.mjs --baseline (re)generate the manifest\n` +
      `  node tools/check-adr-immutability.mjs --help     this message\n\n` +
      `Manifest: ${MANIFEST_REL}\n` +
      `Frozen = adr/<id>.md with Status: decided | superseded ` +
      `(adr/_reviews/ and adr/_meta/ are skipped).\n`,
  );
  process.exit(0);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) runHelp();
else if (args.includes('--baseline')) runBaseline();
else runCheck();
