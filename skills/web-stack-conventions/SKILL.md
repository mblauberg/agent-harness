---
name: web-stack-conventions
description: Use when configuring or upgrading Vite (Vite 8, Rolldown, Oxc, vite.config), auditing web accessibility against WCAG 2.2, interpreting Lighthouse v13 scores, or generating OpenAPI 3.1 specs. Captures only the post-2025 deltas that are easy to get wrong from memory — Rolldown/Oxc config renames, the nine new WCAG 2.2 success criteria (24px target size, focus-not-obscured, dragging alternatives, accessible auth), Lighthouse Insight-Audit renames, and OpenAPI 3.1 nullable/type-array and webhooks gotchas.
---

# Web stack conventions

Load only the relevant post-2025 delta. Do not repeat generic Vite, WCAG,
Lighthouse or OpenAPI guidance the agent already knows.

- Vite 8, Rolldown, Oxc and migration: [Vite 8](references/vite-8.md)
- WCAG 2.2 additions and removed SC 4.1.1: [WCAG 2.2](references/wcag-2.2.md)
- Lighthouse v13 Insight Audit identifiers: [Lighthouse 13](references/lighthouse-13.md)
- OpenAPI 3.1 JSON Schema and codegen traps: [OpenAPI 3.1](references/openapi-3.1.md)

Verify installed versions and generated output before changing configuration or
making compliance claims. These references carry deltas, not a complete audit
standard or migration guide.
