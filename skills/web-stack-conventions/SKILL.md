---
name: web-stack-conventions
description: Use when configuring or upgrading Vite (Vite 8, Rolldown, Oxc, vite.config), auditing web accessibility against WCAG 2.2, interpreting Lighthouse v13 scores, or generating OpenAPI 3.1 specs. Captures only the post-2025 deltas that are easy to get wrong from memory — Rolldown/Oxc config renames, the nine new WCAG 2.2 success criteria (24px target size, focus-not-obscured, dragging alternatives, accessible auth), Lighthouse Insight-Audit renames, and OpenAPI 3.1 nullable/type-array and webhooks gotchas.
---

# Web stack conventions (post-2025 deltas)

Terse, high-churn facts only. Everything else about Vite, WCAG, Lighthouse, and OpenAPI you already know — this file is the part that changed after early 2026 and is commonly misremembered.

## 1. Vite 8 — Rolldown + Oxc migration

Vite 8 replaces esbuild + Rollup with **Rolldown** (Rust bundler) and the **Oxc** transformer. Config keys were renamed:

- `build.rollupOptions` → **`build.rolldownOptions`** (same `external` / `output.globals` shape).
- Top-level **`esbuild`** option → **`oxc`**. JSX config moved into a nested object:
  - Classic: `oxc: { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }` (old `jsxFactory`/`jsxFragment` are gone).
  - Automatic: `oxc: { jsx: { runtime: 'automatic', importSource: 'react' } }`.
  - `jsxInject` now lives under `oxc`, not top level.
  - Transform scoping is `oxc: { include, exclude }`.
- Rollup **plugins still work** — Rolldown implements Rollup's plugin API. A build-only plugin still needs `{ ...plugin(), enforce: 'post', apply: 'build' }`.
- Migrate gradually: install `rolldown-vite` and change the config import from `'vite'` to `'rolldown-vite'` (drop-in), stabilise, then move to `vite@8`.
- To force Vite 8 under a framework pinned to older Vite, use a package-manager override, e.g. pnpm `"pnpm": { "overrides": { "vite": "8.0.0" } }`.
- `@vitejs/plugin-react` now uses Oxc by default; `plugin-react-swc` remains the SWC alternative.

## 2. WCAG 2.2 — the nine new success criteria

WCAG 2.2 added these SC (and **removed 4.1.1 Parsing** entirely — don't flag HTML-parsing/duplicate-ID issues as a 4.1.1 failure). Only audit the *new* ones from memory; the rest are unchanged from 2.1.

- **2.4.11 Focus Not Obscured (Minimum, AA):** a keyboard-focused element must not be *entirely* hidden by sticky headers/footers/overlays. **2.4.12 (Enhanced, AAA):** no part may be hidden. Fix with `scroll-margin-top`/`scroll-margin-bottom` sized to the sticky bars.
- **2.4.13 Focus Appearance (AAA):** focus indicator must be large enough and contrast enough (area ≥ 2px-thick perimeter, ≥ 3:1 against adjacent colours).
- **2.5.7 Dragging Movements (AA):** any drag action needs a single-pointer alternative (tap/click buttons), unless dragging is essential.
- **2.5.8 Target Size (Minimum, AA):** interactive targets ≥ **24 × 24 CSS px**. Exceptions: inline links in text, browser-default controls, and targets whose 24px-diameter circles don't overlap a neighbour's. (44 × 44 is only the *recommended* comfortable size, not the AA bar.)
- **3.2.6 Consistent Help (A):** a repeated help mechanism (contact, chat, FAQ) must appear in the **same relative order** across pages.
- **3.3.7 Redundant Entry (A):** don't make users re-enter info already given **in the same session** — autofill or offer selection. Exceptions: security re-confirmation, expired data.
- **3.3.8 Accessible Authentication (Minimum, AA):** no cognitive-function test (remembering/transcribing a password, puzzles) *unless* an alternative exists — copy-paste/autofill allowed, passkey/SSO/email-link, or object/personal-content recognition. **3.3.9 (Enhanced, AAA)** drops the object-recognition exception.

## 3. Lighthouse v13 — Insight Audits

Lighthouse v13 (Oct 2025+) migrated Performance from per-opportunity audits to **Performance Insight Audits**. The *advice* is unchanged; only IDs/report shape moved. Treat older Lighthouse JSON as a **superset**, not a contradiction.

- **Removed/merged audit IDs** (don't reference by these old names): `first-meaningful-paint`, `no-document-write`, `uses-passive-event-listeners`, `uses-rel-preload`.
- CLS-related audits (layout shifts, non-composited animations, unsized images) are consolidated into **`cls-culprits-insight`**.
- Image audits are merged into **`image-delivery-insight`**.
- When parsing results, key off the new `*-insight` audit IDs; map legacy names forward rather than expecting them to still emit.
- LCP micro-opt worth knowing: serve **HTTP `103 Early Hints`** with `Link: rel=preload`/`preconnect` headers so the browser starts fetching the LCP image/font/CSS before the origin finishes the full response (supported by Chrome + Cloudflare/Fastly-class edges).

## 4. OpenAPI 3.1 — codegen gotchas

3.1 is a full **JSON Schema 2020-12** dialect, which breaks habits carried from 3.0:

- **`nullable: true` is gone.** Express nullability with a type array: `type: ['string', 'null']` (or add `'null'` to any existing type). Tools that still emit `nullable` are producing 3.0 — don't hand-write it into a 3.1 doc.
- **`example` (singular) → `examples` (array)** on schema objects (JSON Schema keyword). Media-type objects still use `example`/`examples` map — don't conflate the two.
- **Top-level `webhooks`** is new in 3.1 for inbound/callback events defined outside `paths`. Use it instead of faking webhooks as regular paths.
- JSON Schema keywords now valid inline: `const`, `if`/`then`/`else`, `prefixItems` (tuples), `contains`, `$defs`. `type` may be an array.
- **Tooling lag is the real trap:** many generators (`openapi-generator-cli` targets, older `tsoa`) still assume 3.0 and either downgrade the spec or mishandle `type: [...]` arrays. FastAPI/Pydantic v2 emits true 3.1. Validate the *generated* spec with a 3.1-aware linter (Spectral `spectral:oas`, Redocly) before trusting an SDK build.
- `additionalProperties: true` + `type: object` is still the way to model open maps; `format` remains annotation-only (validators won't enforce it).
