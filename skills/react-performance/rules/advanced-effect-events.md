---
title: Keep Reactive and Non-Reactive Effect Logic Separate
impact: MEDIUM
impactDescription: avoids stale closures and unnecessary resubscriptions
tags: advanced, hooks, useEffectEvent, effects, subscriptions
---

## Keep Reactive and Non-Reactive Effect Logic Separate

Use `useEffectEvent` only when an Effect or a subscription created by that
Effect needs the latest committed value without that value resynchronising the
Effect. Keep genuinely reactive values in the dependency array.

```tsx
import { useEffect, useEffectEvent } from 'react'

function useWindowEvent(
  event: string,
  handler: (event: Event) => void,
) {
  const onEvent = useEffectEvent(handler)

  useEffect(() => {
    const listener = (value: Event) => onEvent(value)
    window.addEventListener(event, listener)
    return () => window.removeEventListener(event, listener)
  }, [event])
}
```

Bright lines:

- An Effect Event may be called only from an Effect or another Effect Event.
- Do not call it during render or pass it to another component or Hook.
- Its identity changes on every render. Do not include it in dependencies or
  use it as an external subscription callback directly; call it from the
  listener created inside the Effect.
- Do not use it to hide a value that should cause reconnection,
  resubscription, refetching or another synchronisation change.
- On older React versions, use a deliberately maintained ref for the latest
  callback and keep the stable listener inside the Effect.

Reference: [React `useEffectEvent`](https://react.dev/reference/react/useEffectEvent).
