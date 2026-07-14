#!/usr/bin/env node
/**
 * gen-adr-code-index.mjs — the "decision → code/artifact" half of the spine.
 *
 * Reads every decided record `adr/<id>.md` and parses its Evidence section
 * (`## Evidence`, or `## Evidence links`) for the file paths it cites, then
 * writes `ADR_CODE_INDEX.md`: a table mapping each decision to the artifacts /
 * code it points at. It is the readable inverse of the immutability + dashboard
 * scanners — together they let a human (or a Verify pass) confirm the design
 * (this lab) and its implementing artifacts have not silently drifted apart.
 *
 * Domain-agnostic + portable by construction:
 *   - the lab root is resolved from THIS file (the tools/ parent), never from
 *     cwd and never from a hardcoded absolute path — drop the lab anywhere;
 *   - no repo names or domain paths are baked in: every path printed is read
 *     verbatim out of an ADR's Evidence section, exactly as that ADR wrote it
 *     (it may be relative to the lab root or to a sibling code repo — the tool
 *     reports the citation, it does not resolve or validate it);
 *   - the `_reviews/` and `_meta/` subdirs are skipped (cross-family review
 *     sidecars + option matrices, not decided records).
 *
 * Pure Node ESM, zero dependencies. Run from anywhere:
 *   node tools/gen-adr-code-index.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

/* --------------------------------------------------------------- locations */
// This file lives at <lab>/tools/gen-adr-code-index.mjs, so the lab root is one
// directory up. Resolving from the script (not cwd) keeps it robust to where it
// is launched from, and free of any machine- or user-specific absolute path.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const LAB_DIR = resolve(SCRIPT_DIR, "..");
const ADR_DIR = join(LAB_DIR, "adr");
const OUT_FILE = join(LAB_DIR, "ADR_CODE_INDEX.md");
const OUT_REL = "ADR_CODE_INDEX.md";

/* ----------------------------------------------------------------- helpers */

/** Natural-order compare so e.g. D3 < D12 < D12a regardless of the id scheme. */
function naturalCompare(a, b) {
  const ax = String(a).match(/\d+|\D+/g) || [];
  const bx = String(b).match(/\d+|\D+/g) || [];
  const n = Math.max(ax.length, bx.length);
  for (let i = 0; i < n; i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
      const d = parseInt(x, 10) - parseInt(y, 10);
      if (d) return d;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Decide whether a citation token is a file path (vs a code identifier, a
 * version string, or prose). A path either contains a "/" directory separator,
 * or — when bare — looks like `name.ext` with a letter-led extension of 1–4
 * characters (the shape of virtually every real file extension). That cap is
 * what separates a top-level file (`README.md`, `OPERATING_MANUAL.md`) from a
 * dotted code symbol (`config.value`, `user.email`); a bare code identifier
 * (`redis`) and a version (`0.17.7`) are rejected too. A
 * longer-suffixed real file (e.g. `App.swift`) is still caught whenever it is
 * cited with its directory, which is the common case.
 */
function looksLikePath(tok) {
  const t = tok.trim().replace(/^\.\//, "");
  if (!t || /\s/.test(t)) return false; // real paths carry no whitespace
  if (t.includes("/")) return true; // any directory separator ⇒ a path
  return /\.[A-Za-z][A-Za-z0-9]{0,3}$/.test(t); // bare `name.ext`, 1–4-char ext
}

/**
 * Extract the body of the ADR's Evidence (or "Evidence links") section: from
 * just after its heading to the next heading of the same-or-higher level.
 * Matches only a heading whose entire text is "Evidence" / "Evidence links",
 * so an "## Evidence quality" table row or an H1 that merely contains the word
 * "evidence" is never mistaken for the section.
 */
function extractEvidenceSection(text) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    const headingText = m[2].replace(/[*_`]/g, "").trim();
    if (/^evidence(\s+links)?\s*:?\s*$/i.test(headingText)) {
      start = i + 1;
      level = m[1].length;
      break;
    }
  }
  if (start === -1) return "";
  const body = [];
  for (let i = start; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,6})\s+/);
    if (h && h[1].length <= level) break; // next sibling/ancestor heading ends it
    body.push(lines[i]);
  }
  return body.join("\n");
}

/**
 * Pull file-path citations out of an Evidence section: backtick-delimited spans
 * (`...`) and markdown-link targets ([text](target)), each filtered through
 * looksLikePath(). Returns a de-duplicated, naturally-sorted array — verbatim.
 */
function extractPaths(section) {
  const paths = new Set();
  for (const m of section.matchAll(/`([^`]+)`/g)) {
    const tok = m[1].trim();
    if (looksLikePath(tok)) paths.add(tok);
  }
  for (const m of section.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const tok = m[1].trim();
    if (looksLikePath(tok)) paths.add(tok);
  }
  return [...paths].sort(naturalCompare);
}

/** Derive a clean title from the ADR's H1, stripping a leading "<id> — " prefix. */
function extractTitle(text, id) {
  const m = text.match(/^#\s+(.+?)\s*$/m);
  if (!m) return "";
  let t = m[1].replace(/[*_`]/g, "").trim();
  const escId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  t = t.replace(new RegExp("^" + escId + "\\s*[—:\\-]+\\s*"), "").trim();
  return t;
}

/** Discover decided records: top-level adr/<id>.md only; skip _reviews/ _meta/. */
function discoverAdrs() {
  if (!existsSync(ADR_DIR)) {
    process.stderr.write(`ERROR: adr/ directory not found at ${ADR_DIR}\n`);
    process.exit(2);
  }
  const out = [];
  for (const name of readdirSync(ADR_DIR)) {
    if (name.startsWith("_")) continue; // _reviews/ _meta/ + any sidecar
    if (!name.endsWith(".md")) continue;
    const abs = join(ADR_DIR, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    out.push({ id: name.replace(/\.md$/, ""), abs });
  }
  out.sort((a, b) => naturalCompare(a.id, b.id));
  return out;
}

/* -------------------------------------------------------------------- main */

const adrs = discoverAdrs();
const rows = []; // { id, title, paths: string[] }
const allPaths = new Set();

for (const a of adrs) {
  let text;
  try {
    text = readFileSync(a.abs, "utf8");
  } catch {
    continue;
  }
  const title = extractTitle(text, a.id);
  const paths = extractPaths(extractEvidenceSection(text));
  for (const p of paths) allPaths.add(p);
  rows.push({ id: a.id, title, paths });
}

const withCites = rows.filter((r) => r.paths.length);
const gaps = rows.filter((r) => !r.paths.length);
const now = new Date().toISOString().replace("T", " ").slice(0, 16) + "Z";

const cell = (s) => s.replace(/\|/g, "\\|");
const clip = (s) => (s.length > 110 ? s.slice(0, 107) + "…" : s);

const lines = [];
lines.push("# ADR_CODE_INDEX.md — decision → implementing code / evidence");
lines.push("");
lines.push("> **GENERATED** by `tools/gen-adr-code-index.mjs` — do not edit by hand; re-run the generator.");
lines.push("> The *decision → code/artifact* half of the traceability spine: each decided");
lines.push("> record `adr/<id>.md` mapped to the file paths cited in its **Evidence** (or");
lines.push("> **Evidence links**) section. Paths are reported verbatim, exactly as the ADR");
lines.push("> wrote them — nothing is resolved against the filesystem, so a path may be");
lines.push("> relative to the lab root or to a sibling code repo as that ADR intended.");
lines.push("> `_reviews/` and `_meta/` are skipped (sidecars, not decided records).");
lines.push("");
lines.push(
  `> Generated: ${now} · ADRs scanned: ${adrs.length} · ADRs citing ≥1 path: ${withCites.length} · distinct paths: ${allPaths.size}`,
);
lines.push("");
lines.push("## Summary");
lines.push("");
lines.push(`- **ADRs scanned:** ${adrs.length}`);
lines.push(`- **ADRs citing ≥1 evidence path:** ${withCites.length}`);
lines.push(`- **Distinct file paths referenced:** ${allPaths.size}`);
lines.push(
  `- **ADRs with NO evidence path:** ${gaps.length}${gaps.length ? " (" + gaps.map((r) => r.id).join(", ") + ")" : ""}`,
);
lines.push("");
lines.push("## Decision → evidence / code");
lines.push("");
lines.push("| Decision | # | Title | Evidence paths (verbatim) |");
lines.push("|----------|---|-------|---------------------------|");
for (const r of withCites) {
  const title = r.title ? cell(clip(r.title)) : "_(untitled)_";
  const col = r.paths.map((p) => "`" + cell(p) + "`").join("<br>");
  lines.push(`| ${r.id} | ${r.paths.length} | ${title} | ${col} |`);
}
lines.push("");
if (gaps.length) {
  lines.push("## ⚠ ADRs with no parsed Evidence path");
  lines.push("");
  lines.push("These decided records cite no file path in an Evidence / Evidence-links section.");
  lines.push("Either the decision is genuinely artifact-free (pure policy / architecture) or its");
  lines.push("Evidence section is missing, mis-headed, or written as bare prose instead of");
  lines.push("`backtick`-quoted paths — worth a glance before trusting the trace as complete.");
  lines.push("");
  for (const r of gaps) {
    lines.push(`- **${r.id}** — ${r.title ? cell(r.title) : "_(untitled)_"}`);
  }
  lines.push("");
}

writeFileSync(OUT_FILE, lines.join("\n") + "\n");

const rel = relative(process.cwd(), OUT_FILE) || OUT_REL;
process.stdout.write(
  `ADR_CODE_INDEX written -> ${rel}\n` +
    `  ADRs scanned        : ${adrs.length}\n` +
    `  ADRs citing a path  : ${withCites.length}\n` +
    `  distinct paths      : ${allPaths.size}\n` +
    `  ADRs with no path   : ${gaps.length}${gaps.length ? "  (" + gaps.map((r) => r.id).join(", ") + ")" : ""}\n`,
);
