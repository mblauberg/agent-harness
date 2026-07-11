---
title: Consolidate Material Global Subscriptions
impact: LOW
impactDescription: single listener for N components
tags: client, event-listeners, subscription
---

## Consolidate material global subscriptions

Multiple listeners are not automatically a performance problem. Consolidate only
when a profile shows material duplicated work or when the event source has an
explicit single-subscriber contract. Prefer the repository's existing event or
subscription owner; do not add a server-state library just for this pattern.

**Simple per-instance subscription (profile before replacing):**

```tsx
function useKeyboardShortcut(key: string, callback: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === key) {
        callback()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, callback])
}
```

When using the `useKeyboardShortcut` hook multiple times, each instance will register a new listener.

**One dependency-free option when consolidation is justified:**

```tsx
type KeyHandler = (event: KeyboardEvent) => void
const handlers = new Set<KeyHandler>()
let listening = false

function dispatch(event: KeyboardEvent) {
  for (const handler of handlers) handler(event)
}

export function subscribeKeydown(handler: KeyHandler) {
  handlers.add(handler)
  if (!listening) {
    window.addEventListener('keydown', dispatch)
    listening = true
  }

  return () => {
    handlers.delete(handler)
    if (listening && handlers.size === 0) {
      window.removeEventListener('keydown', dispatch)
      listening = false
    }
  }
}
```

Subscribe from an Effect and return the disposer. Preserve callback freshness,
server-rendering boundaries, Strict Mode remount behaviour and hot-reload cleanup.
Re-profile after the change; a shared registry adds state and failure modes, so
keep the simpler per-component listener when the measured gain is negligible.
