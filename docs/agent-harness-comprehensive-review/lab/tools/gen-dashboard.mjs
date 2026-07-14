#!/usr/bin/env node
// gen-dashboard.mjs — regenerate the human-glance DASHBOARD.md for an autonomous lab.
//
// DOMAIN-AGNOSTIC. Ships with the autonomous-lab skill and is copied into each
// lab's tools/ dir by bootstrap. It carries NO project-specifics: no repo table,
// no hardcoded counts, no absolute paths. Everything is derived live from the
// lab's own source files, which live one level up from this script's tools/ dir.
//
// WHY: the append-only ledgers (GOAL/STATE/DECISION_LOG/DECISION_QUEUE/runs) are
// AI memory — large and heavy for a human. This script DERIVES a thin, current-
// state snapshot from those source files and writes <lab>/DASHBOARD.md. It never
// mutates the ledgers; it only reads them.
//
// PROPERTIES:
//   - Idempotent: re-running with the sources unchanged writes byte-identical
//     output. The "generated-at" date comes from a CLI arg or the lab's latest
//     git commit date (NOT Date.now), so the snapshot doesn't drift on every run.
//     The footer is STABLE — it pins NO volatile git HEAD-SHA / dirty flag, which
//     would self-invalidate --check on every commit (incl. committing DASHBOARD
//     itself). If the lab is not a git repo and no --date is given, the date line
//     is omitted rather than filled from the clock (keeps --check green).
//   - Safe to re-run: read-only against every source; the only write is
//     DASHBOARD.md, fully regenerated each time.
//
// SIGNALS (all derived, none hardcoded):
//   - Lifecycle      : last "STATUS:" line in GOAL.md.
//   - Decided        : count of adr/*.md files (skips adr/_reviews/ + adr/_meta/),
//                      cross-checked 1:1 against DECISION_LOG.md table rows.
//   - Live forks     : forks/* whose README Status is "open" and which have no
//                      VERDICT.md.
//   - Queue index    : tally of per-entry STATUS markers in DECISION_QUEUE.md.
//   - In-flight runs : data rows under the In-flight table in .orchestrator/runs.md.
//   - Human gates    : DECISION_QUEUE entries whose STATUS marker names a human/
//                      expert gate (HUMAN-TIE-BREAK / *-GATED).
//
// OPTIONAL build/verify section: if tools/dashboard.extras.json exists it is
// rendered verbatim as a "Build / verify" table; otherwise the section is omitted.
// Schema (all fields optional except rows[].name):
//   { "title": "Build / verify",
//     "note":  "one-line note shown above the table",
//     "rows":  [ { "name": "app", "path": "app/", "verify": "pnpm test",
//                  "expect": "all green" } ] }
//
// USAGE:
//   node tools/gen-dashboard.mjs                 # date = latest lab commit (if git)
//   node tools/gen-dashboard.mjs --date=2026-06-26
//   node tools/gen-dashboard.mjs --check         # exit 1 if DASHBOARD.md drifted

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAB_DIR = path.resolve(__dirname, ".."); // the lab = parent of tools/
const OUT = path.join(LAB_DIR, "DASHBOARD.md");
const LAB_NAME = path.basename(LAB_DIR) || "lab";

// ---- tiny helpers ---------------------------------------------------------
const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, "utf8");
const readOpt = (p) => (exists(p) ? read(p) : ""); // tolerant: "" if absent

function git(repo, args) {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function subdirs(dir) {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);
}

// A markdown table data row: starts with "|", is not a separator (|---|---|),
// and is not the header (its first cell, stripped, equals the given header key).
function isTableDataRow(line, headerKey) {
  if (!line.startsWith("|")) return false;
  if (/^\|[\s:|-]+\|*\s*$/.test(line)) return false; // separator row
  const first = (line.slice(1).split("|")[0] || "").replace(/[*`]/g, "").trim();
  if (headerKey && first.toLowerCase() === headerKey.toLowerCase()) return false;
  return true;
}

// ---- derivations ----------------------------------------------------------

// 1) Lifecycle STATUS from GOAL.md — the last line that starts with "STATUS:".
function deriveStatus() {
  const txt = readOpt(path.join(LAB_DIR, "GOAL.md"));
  const matches = [...txt.matchAll(/^STATUS:\s*([^\s<]+)/gm)];
  return matches.length ? matches[matches.length - 1][1] : "UNKNOWN";
}

// 2) Decided decisions: count adr/*.md records and DECISION_LOG.md table rows;
//    flag if they disagree (the ledger and the ADR files should be 1:1). The
//    adr/_reviews/ and adr/_meta/ subdirs are evidence, not records — and being
//    directories they are naturally excluded by the *.md file filter.
function deriveDecisions() {
  const adrDir = path.join(LAB_DIR, "adr");
  const files = exists(adrDir)
    ? fs.readdirSync(adrDir).filter((n) => n.endsWith(".md")).length
    : 0;

  const log = readOpt(path.join(LAB_DIR, "DECISION_LOG.md"));
  let rows = 0;
  for (const line of log.split(/\r?\n/)) {
    if (isTableDataRow(line, "ID")) rows++;
  }
  return { files, rows, match: files === rows };
}

// 3) Live forks: a fork dir is LIVE if its README Status line's first state word
//    is "open" (not "resolved"/"closed"/"dormant"/"merged"/"folded") AND it has
//    no VERDICT.md. The first-word rule matters because an open fork's prose can
//    later say "...closed in-transaction" without being a resolved fork.
function deriveForks() {
  const forksDir = path.join(LAB_DIR, "forks");
  const live = [];
  for (const name of subdirs(forksDir)) {
    const dir = path.join(forksDir, name);
    const hasVerdict = exists(path.join(dir, "VERDICT.md"));
    const rp = path.join(dir, "README.md");
    let state = "unknown";
    if (exists(rp)) {
      const line =
        read(rp).split(/\r?\n/).find((l) => /\*\*Status/i.test(l)) || "";
      const lower = line.toLowerCase();
      const oi = lower.indexOf("open");
      const ri = lower.search(/resolved|dormant|closed|merged|folded/);
      if (oi >= 0 && (ri < 0 || oi < ri)) state = "open";
      else if (ri >= 0) state = "resolved";
    }
    if (state === "open" && !hasVerdict) live.push(name.split("-")[0]);
  }
  return live.sort();
}

// 4) DECISION_QUEUE status index: tally every per-entry STATUS marker. Markers
//    are "**STATUS: TOKEN**" or a line-leading "STATUS: TOKEN" — the controlled
//    status vocabulary is domain-extensible, so we tally whatever tokens appear.
//    Also count the human/expert GATES (HUMAN-TIE-BREAK / *-GATED), which may sit
//    in a compound marker (e.g. "DECIDED-PROVISIONAL · HUMAN-TIE-BREAK").
function deriveQueue() {
  const txt = readOpt(path.join(LAB_DIR, "DECISION_QUEUE.md"));
  const tally = new Map();
  let total = 0;
  let gates = 0;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/(?:\*\*|^\s*)STATUS:\s*([A-Z][A-Z0-9-]*)/);
    if (!m) continue;
    total++;
    const tok = m[1];
    tally.set(tok, (tally.get(tok) || 0) + 1);
    if (/HUMAN-TIE-BREAK|HUMAN-GATED?|[A-Z]+-GATED/.test(line)) gates++;
  }
  const summary = [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k} ${v}`);
  return { total, summary, gates };
}

// 5) In-flight runs: the data rows of the In-flight table in .orchestrator/runs.md.
//    We locate the table by its "## In-flight" heading or the machine-findable
//    "IN-FLIGHT TABLE" marker comment, then count data rows until the next "##".
function deriveInFlight() {
  const txt = readOpt(path.join(LAB_DIR, ".orchestrator", "runs.md"));
  if (!txt) return 0;
  const lines = txt.split(/\r?\n/);
  // Anchor on the "## In-flight" heading if present (canonical bootstrap layout
  // puts the heading first); else fall back to the "IN-FLIGHT TABLE" marker
  // comment. Heading-first is robust to the comment-before-heading ordering.
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+In[\s-]?flight\b/i.test(lines[i])) { start = i + 1; break; }
  }
  if (start < 0) {
    for (let i = 0; i < lines.length; i++) {
      if (/IN[\s-]?FLIGHT[\s-]?TABLE/i.test(lines[i])) { start = i + 1; break; }
    }
  }
  if (start < 0) return 0;
  let count = 0;
  let inFence = false;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line)) break; // next section
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (isTableDataRow(line, "run-id")) count++;
  }
  return count;
}

// 6) Generated-at date: --date arg wins; else the lab's latest git commit date
//    (day-granular → idempotent within a day, doesn't churn on a clean re-run);
//    else null (not a git repo, no arg) → the date line is omitted entirely.
function deriveGeneratedAt() {
  const arg = process.argv.find((a) => a.startsWith("--date="));
  if (arg) return { date: arg.slice("--date=".length), src: "--date arg" };
  const iso = git(LAB_DIR, ["log", "-1", "--format=%cI"]);
  if (iso) return { date: iso.slice(0, 10), src: "latest lab commit" };
  return { date: null, src: null };
}

// 7) Optional build/verify table from tools/dashboard.extras.json (verbatim).
function deriveExtras() {
  const p = path.join(__dirname, "dashboard.extras.json");
  if (!exists(p)) return null;
  let cfg;
  try {
    cfg = JSON.parse(read(p));
  } catch (e) {
    process.stderr.write(`warning: ignoring unreadable dashboard.extras.json (${e.message})\n`);
    return null;
  }
  const rows = Array.isArray(cfg.rows) ? cfg.rows.filter((r) => r && r.name) : [];
  if (!rows.length) return null;
  return { title: cfg.title || "Build / verify", note: cfg.note || "", rows };
}

// ---- render ---------------------------------------------------------------
function render() {
  const status = deriveStatus();
  const dec = deriveDecisions();
  const forks = deriveForks();
  const queue = deriveQueue();
  const inflight = deriveInFlight();
  const gen = deriveGeneratedAt();
  const extras = deriveExtras();

  const decFlag = dec.match
    ? `OK (adr ${dec.files} == log ${dec.rows})`
    : `MISMATCH (adr/ files ${dec.files} vs DECISION_LOG rows ${dec.rows})`;

  const queueLine = queue.total
    ? `**${queue.total}** — ${queue.summary.join(" · ")}`
    : `**0** — (no STATUS markers found)`;

  const forksLine = forks.length
    ? `**${forks.length}** — ${forks.join(", ")}`
    : `**0**`;

  let extrasBlock = "";
  if (extras) {
    const body = extras.rows
      .map((r) => {
        const pathCell = r.path ? `\`${r.path}\`` : "—";
        let verify = "—";
        if (r.verify) {
          const cmd = r.path ? `(cd ${r.path} && ${r.verify})` : r.verify;
          verify = `\`${cmd}${r.expect ? `  # ${r.expect}` : ""}\``;
        }
        return `| **${r.name}** | ${pathCell} | ${verify} |`;
      })
      .join("\n");
    extrasBlock =
      `\n## ${extras.title}\n\n` +
      (extras.note ? `${extras.note}\n\n` : "") +
      `| Component | Path | One-line verify |\n|---|---|---|\n${body}\n`;
  }

  const nextStop =
    status === "RUN"
      ? "The run is active — watch `STATE.md`; clear the open gates to unblock more work."
      : "Next stop: clear the open gates, then set `GOAL.md` -> `STATUS: RUN` to resume.";

  const footerDate = gen.date ? `Generated ${gen.date} (${gen.src}) ` : "Generated ";

  return `# DASHBOARD — ${LAB_NAME} at a glance

> GENERATED — do not hand-edit. Run \`node tools/gen-dashboard.mjs\` to refresh.
> A thin human snapshot derived from the source-of-truth ledgers
> (GOAL / STATE / DECISION_LOG / DECISION_QUEUE / .orchestrator/runs.md).
> Those stay intact; this file is regenerable and a gitignore candidate.

| Signal | Value |
|---|---|
| **Lifecycle (GOAL.md STATUS)** | \`${status}\` |
| **Decided decisions (adr/*.md)** | **${dec.files}** — ${decFlag} |
| **Live forks** | ${forksLine} |
| **Queue status index** | ${queueLine} |
| **In-flight runs** | **${inflight}** |
| **Open human/expert gates** | **${queue.gates}** |
${extrasBlock}
---
*${footerDate}by \`tools/gen-dashboard.mjs\`. ${nextStop}*
`;
}

// ---- main -----------------------------------------------------------------
const content = render();

if (process.argv.includes("--check")) {
  const current = exists(OUT) ? read(OUT) : "";
  if (current !== content) {
    process.stderr.write("DASHBOARD.md is stale — run: node tools/gen-dashboard.mjs\n");
    process.exit(1);
  }
  process.stdout.write("DASHBOARD.md up to date.\n");
  process.exit(0);
}

fs.writeFileSync(OUT, content);
process.stdout.write(`wrote ${path.relative(LAB_DIR, OUT)}\n`);
