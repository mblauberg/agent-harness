---
title: Use Transitions for Non-Urgent UI Work
impact: LOW
impactDescription: reduces re-renders and improves code clarity
tags: rendering, transitions, useTransition, loading, state
---

## Use Transitions for Non-Urgent UI Work

Use `useTransition` when a state update may render in the background without
blocking urgent input. It provides an aggregate `isPending` signal; it does not
replace every request state or guarantee async request ordering.

**Incorrect (manual loading state):**

```tsx
function SearchResults() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const handleSearch = async (value: string) => {
    setIsLoading(true)
    setQuery(value)
    const data = await fetchResults(value)
    setResults(data)
    setIsLoading(false)
  }

  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {isLoading && <Spinner />}
      <ResultsList results={results} />
    </>
  )
}
```

**Correct (transition plus explicit latest-request ordering):**

```tsx
import { useRef, useTransition, useState } from 'react'

function SearchResults() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isPending, startTransition] = useTransition()
  const latestRequest = useRef(0)

  const handleSearch = (value: string) => {
    setQuery(value) // Update input immediately
    const request = ++latestRequest.current

    startTransition(async () => {
      const data = await fetchResults(value)
      if (request !== latestRequest.current) return
      startTransition(() => setResults(data))
    })
  }

  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {isPending && <Spinner />}
      <ResultsList results={results} />
    </>
  )
}
```

**Benefits:**

- **Automatic pending state**: No need to manually manage `setIsLoading(true/false)`
- **Error resilience**: Pending state correctly resets even if the transition throws
- **Better responsiveness**: Keeps the UI responsive during updates
- **Interruptible rendering**: Urgent updates can interrupt and restart
  transition rendering.

Async requests inside transitions can resolve out of order. Prefer higher-level
ordered abstractions such as `useActionState` or form actions where they fit;
otherwise implement request identity, queuing or cancellation explicitly.

Reference: [useTransition](https://react.dev/reference/react/useTransition)
