# TanStack Query review checklist

Select the lenses that fit the change; do not manufacture findings.

## Correctness

- Every query-function dependency is represented in a serialisable key.
- Key prefixes and exact matches invalidate the intended cache set only.
- Query functions reject failed responses and do not return `undefined`.
- Cache updates preserve the exact stored shape and are immutable.
- Mutation success, error and settlement paths cannot leave stale optimistic
  state behind.
- Infinite and paginated queries cannot duplicate pages or issue overlapping
  next-page requests.

## Concurrency and lifecycle

- Obsolete requests consume `AbortSignal` where supported.
- Independent requests start in parallel; genuine dependencies are explicit.
- Concurrent optimistic mutations have stable client identities and deterministic
  rollback/refetch behaviour.
- `staleTime`, `gcTime`, polling and refetch triggers reflect product semantics.
- Disabled queries intentionally opt out of automatic invalidation/refetch.

## UX honesty

- Initial pending, background fetching, empty-success and error states are
  distinguishable.
- Existing data remains visible during a background refetch unless the product
  deliberately requires replacement.
- Placeholder data is visibly transitional where acting on it could mislead.
- Mutation errors remain recoverable and do not silently discard user input.

## Boundaries, SSR and security

- Server and client state are not duplicated into another store without need.
- Server-rendered requests use isolated `QueryClient` instances.
- Dehydrated payloads contain no secrets or user data outside the request's
  authorisation boundary.
- Persistence/offline support has an explicit retention, versioning and privacy
  policy.

## Verification

- Tests use fresh clients and deliberate retry settings.
- Network behaviour is tested through the public transport boundary.
- Typecheck and the TanStack Query ESLint rules pass where configured.
- Acceptance evidence covers refetch, invalidation, error, concurrency and
  hydration behaviour touched by the change.
