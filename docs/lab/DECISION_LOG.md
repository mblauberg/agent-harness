# DECISION LOG — authoritative decided-index (newest first)
<!--
  AUTHORITATIVE for verdicts. One row per DECIDED item, held strictly 1:1 with
  adr/<id>.md files: every decided adr/<id>.md has exactly one row here and
  vice-versa. Append-only by convention (newest at the top, just under the
  header). NEVER rewrite history — to revise a verdict, supersede the ADR and
  add a NEW row. The ID-set diff (this <-> QUEUE <-> adr/*.md) is the integrity canary.

  Column hygiene: escape any literal '|' in a cell as '\|' so the 6-column count
  never breaks (a real, observed drift). Keep IDs unique and never reused.
-->

| ID | Title | Verdict / decision | Reversibility | Cross-family | Date |
|----|-------|--------------------|---------------|--------------|------|
<!-- (no decisions yet) -->
