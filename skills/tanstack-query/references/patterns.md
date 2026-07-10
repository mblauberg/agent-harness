# TanStack Query v5 patterns

## Query contracts

Keep key identity and fetch behaviour together. A small options factory remains
usable from hooks, loaders, prefetchers and cache operations:

```ts
import { queryOptions } from '@tanstack/react-query'

type ProjectFilters = Readonly<{ owner?: string; page: number }>

export const projectQueries = {
  all: () => ['projects'] as const,
  list: (filters: ProjectFilters) =>
    queryOptions({
      queryKey: [...projectQueries.all(), 'list', filters] as const,
      queryFn: ({ signal }) => projectApi.list(filters, { signal }),
      staleTime: 30_000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: [...projectQueries.all(), 'detail', id] as const,
      queryFn: ({ signal }) => projectApi.get(id, { signal }),
    }),
}
```

Use stable serialisable values in keys. Object property order is normalised by
TanStack Query, but array position is significant. If `queryFn` reads a value
that affects its result, that value belongs in the key.

The fetch adapter must reject non-success responses. Passing `signal` prevents
obsolete work from continuing when the transport supports aborts.

## Freshness and retention

- `staleTime` answers: how long may this result be reused without a background
  refetch? The default is immediately stale.
- `gcTime` answers: how long should an inactive result remain cached? The
  browser default is five minutes.
- `refetchInterval` is polling and is independent of `staleTime`.
- `initialData` is real cache data with freshness semantics. `placeholderData`
  is transitional display data and is not persisted as the successful result.

Use `staleTime: Infinity` only when explicit invalidation remains the freshness
mechanism. Use `static` only for data that cannot change during the application
session; invalidation will not cause it to refetch.

## Mutations and invalidation

Await or return invalidation when the mutation must remain pending until fresh
data arrives:

```ts
const renameProject = useMutation({
  mutationFn: projectApi.rename,
  onSuccess: (project) => {
    queryClient.setQueryData(projectQueries.detail(project.id).queryKey, project)
  },
  onSettled: (_data, _error, variables) =>
    queryClient.invalidateQueries({
      queryKey: projectQueries.detail(variables.id).queryKey,
    }),
})
```

Invalidate the smallest complete family whose server truth may have changed.
Prefix matching is deliberate; use `exact: true` when siblings must remain
fresh. Do not update several denormalised projections by hand when a targeted
refetch is safer.

For optimistic presentation, first prefer `mutation.variables` in the owning
UI. Cache-level optimism is warranted when several surfaces must update. Its
transaction is: cancel relevant queries, snapshot previous values, apply an
immutable update, restore the snapshot on error, then invalidate on settlement.
Concurrent mutations need identities such as `submittedAt` or an explicit
client-generated id; a single global pending boolean loses ordering.

## Conditional, parallel and paginated work

- Start independent `useQuery` calls together. Use `useQueries` for dynamic
  cardinality; deduplicate input ids before constructing the array.
- Conditional data dependencies may use `enabled`. TypeScript callers can use
  `skipToken`, but its query cannot be manually `refetch()`ed because no query
  function exists while skipped.
- Put the page or cursor in the query key. `placeholderData: keepPreviousData`
  can retain the last successful page while the next one loads; gate navigation
  with `isPlaceholderData` and server `hasMore` evidence.
- Infinite queries declare `initialPageParam` and both applicable page-param
  functions. Guard repeated `fetchNextPage` calls with fetch state.
- Prefetch where intent is observable (route navigation, hover/focus) and reuse
  the same options factory. Do not prefetch speculative trees without a budget.

## SSR and hydration

Create `QueryClient` per request or per browser lifecycle. A module-global
server client can leak one user's cached data to another. Prefetch authorised
queries, `dehydrate` them and hydrate through the framework's boundary. Give SSR
queries a positive `staleTime` when immediate client refetch would duplicate the
server request. Treat dehydrated state as data crossing a trust boundary: it
must be serialisable, minimal and safe for the client.

## Tests

Build a new client for every test and wrap the unit under test with its provider.
Set query retries to `false` for error-path tests unless retry behaviour is the
subject. Mock the network boundary rather than TanStack Query internals. Assert
observable states and requests: key-dependent refetch, invalidation, rollback,
pagination continuity, cancellation and hydration isolation.
