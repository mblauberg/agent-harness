# Retrieval & tool routing

Multi-agent orchestration fails when agents search the wrong place, use generic tools where specialised
tools exist, or duplicate each other's retrieval path. Route **sources and tools** as deliberately as
models.

## Routing order

1. **Identify the evidence surface.** Local files, web, issue tracker, database, browser, logs, official
   docs, PDFs, or prior run artifacts.
2. **Prefer specialised tools.** A repository search, official-doc connector, PDF renderer, test runner,
   or database query beats broad web/general chat when the source is local or structured.
3. **Start broad, then narrow.** For unfamiliar corpora, begin with short broad searches/indexes, then
   drill down with exact terms, locators, and source-specific tools.
4. **Partition retrieval paths.** Assign workers distinct source slices or question families so they do not
   repeat the same search.
5. **Keep retrievable pointers.** Every finding should include file path, URL, line/page, query, or command
   used to produce it.
6. **Stop stale retrieval.** If an index/manifest conflicts with a primary source or current status file,
   trust the primary/current source and mark the index stale.

## Worker brief fields

Use the canonical [worker contract](orchestration-contract.md#worker-contract).
For retrieval lanes, bind the allowed evidence surface, search strategy,
must-check and must-not-use sources, and source-bound locator output inside that
contract.

## Skill and tool descriptions

Skill and MCP/tool routing depends heavily on natural-language descriptions. Current skill and MCP
research supports:

- clear trigger language and capability labels;
- concise but complete descriptions;
- grouping related skills/tools so visible requirements stay covered under small context budgets;
- testing descriptions against real prompt phrases, not only synthetic ideal cases.

## Research anchors

- Anthropic, "How we built our multi-agent research system" (2025): orchestrator-worker search, tool
  selection, broad-to-narrow search, 3-5 parallel subagents, eval/observability.
- Anthropic, "Writing effective tools for AI agents" (2025): tool descriptions and tool ergonomics
  directly affect agent task success.
- `arXiv:2602.18914`: smell-aware MCP description quality; compliant descriptions improved selection
  probability in competitive settings.
- `arXiv:2602.14878`: large-scale MCP description-quality study across 856 tools.
- `arXiv:2603.18743` and `arXiv:2605.06978`: skill files and group-structured skill retrieval make
  routing quality part of agent performance, not documentation polish.
