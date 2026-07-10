---
title: Bound and Scope Cross-Request Caches
impact: HIGH
impactDescription: avoids repeated work without leaking stale or private data
tags: server, cache, lru, cross-request, security
---

## Bound and Scope Cross-Request Caches

`React.cache()` is request-local. Before adding a process LRU or durable cache,
check the framework's current data-cache primitives and state the required
sharing boundary, freshness, invalidation and deployment topology.

A process-local LRU is appropriate only for bounded, non-secret data where
occasional cold misses and per-instance divergence are acceptable:

```ts
import { LRUCache } from 'lru-cache'

const cache = new LRUCache<string, PublicConfig>({
  max: 100,
  ttl: 60_000,
})

export async function getPublicConfig(version: string) {
  const cached = cache.get(version)
  if (cached) return cached
  const value = await loadPublicConfig(version)
  cache.set(version, value)
  return value
}
```

Do not cache user or tenant data without including the complete authorisation
scope in the key and proving eviction, invalidation and privacy behaviour.
Process caches are not shared across workers, regions or cold starts. Use the
framework's current cache/tag/lifetime model or a durable shared cache when the
contract requires cross-instance consistency.

References:
[Next.js caching](https://nextjs.org/docs/app/guides/caching) and
[lru-cache](https://github.com/isaacs/node-lru-cache).
