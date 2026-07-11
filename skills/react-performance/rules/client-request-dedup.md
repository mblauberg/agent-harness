---
title: Deduplicate Client Requests With the Existing Data Owner
impact: MEDIUM-HIGH
impactDescription: avoid duplicate client work without changing cache semantics
tags: client, deduplication, data-fetching, server-state
---

## Deduplicate client requests with the existing data owner

First prove that equivalent requests overlap on a material path. Several fetches
can be correct when their keys, authentication context, freshness requirements or
cancellation lifetimes differ.

Prefer the repository's existing owner, in this order:

1. Fetch once at the route, server or page boundary and pass the result down when
   the data has one clear owner.
2. Reuse the installed router, framework or server-state client's keyed request
   primitive. Preserve its key, freshness, retry, cancellation, error and mutation
   semantics. For TanStack Query, load `tanstack-query`; for SWR, follow the
   installed version's documentation.
3. Add a new data-fetching dependency only with dependency and architecture
   authority, after showing why the existing stack cannot own the request.

Do not label raw `fetch` as inherently wrong or introduce SWR solely to reduce a
render count. Verify the change in a production build and test loading, stale,
error, cancellation and mutation paths. A faster duplicate request that serves
the wrong user or stale data is a regression.
