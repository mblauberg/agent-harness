# Lighthouse 13 Insight Audits

Lighthouse v13 migrated Performance from opportunity audits to Performance
Insight Audits. Advice is unchanged, but identifiers and report shape moved.
Treat older JSON as a superset, not a contradiction.

- Removed or merged identifiers: `first-meaningful-paint`,
  `no-document-write`, `uses-passive-event-listeners`, `uses-rel-preload`.
- Layout shifts, non-composited animations and unsized images are consolidated
  in `cls-culprits-insight`.
- Image audits are merged into `image-delivery-insight`.
- Parse new `*-insight` identifiers and map legacy names forward; do not expect
  legacy identifiers to emit.
- For LCP, HTTP `103 Early Hints` may send `Link: rel=preload` or `preconnect`
  so supporting browsers and edges fetch the LCP image, font or CSS before the
  full origin response.
