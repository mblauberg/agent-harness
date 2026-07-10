# TypeScript patterns — worked examples

Examples for the bright-line rules in SKILL.md. Only the non-obvious ones.

## Discriminated union over flag soup

```typescript
// Bad — every field optional; illegal combos representable (loading + error?)
interface State { loading: boolean; data?: User; error?: Error }

// Good — each variant carries exactly its fields; compiler narrows on `status`
type State =
  | { status: 'loading' }
  | { status: 'ok'; data: User }
  | { status: 'err'; error: Error };

if (s.status === 'ok') s.data;      // narrowed, no `!`
```

## Exhaustiveness with `never`

```typescript
function assertNever(x: never): never {
  throw new Error(`Unhandled: ${JSON.stringify(x)}`);
}
function label(s: State): string {
  switch (s.status) {
    case 'loading': return '…';
    case 'ok':      return s.data.name;
    case 'err':     return s.error.message;
    default:        return assertNever(s); // adding a variant breaks compile here
  }
}
```

## Earn the type, don't assert it

```typescript
// Bad — a lie the compiler can't check; wrong shape blows up at runtime
const user = JSON.parse(body) as User;

// Good — validated, so the type is real
const user = UserSchema.parse(JSON.parse(body)); // z.infer<typeof UserSchema>

// Narrowing instead of asserting
function isUser(x: unknown): x is User {
  return typeof x === 'object' && x !== null && 'id' in x;
}
```

`satisfies` checks a value against a type without widening it — use it instead of `as`:

```typescript
const config = { port: 3000, host: 'localhost' } satisfies ServerConfig;
// config.port stays 3000 (literal), and shape is checked
```

## Branded primitives

```typescript
type UserId = string & { readonly __brand: 'UserId' };
const asUserId = (s: string) => s as UserId;   // one sanctioned mint point
function load(id: UserId): User { /* … */ }
load(order.customerId);   // compile error unless customerId is a UserId
```

## `noUncheckedIndexedAccess` in practice

```typescript
// With the flag on, indexing yields T | undefined — forces the check you'd forget
const first = items[0];          // User | undefined
first.name;                      // error
first?.name;                     // ok
const row = map.get(key);        // already T | undefined; same discipline
```

## Errors: narrow `unknown`, wrap with `cause`

```typescript
class ConfigError extends Error {
  constructor(msg: string, options?: { cause: unknown }) { super(msg, options); }
}

async function readConfig(path: string): Promise<Config> {
  try {
    return ConfigSchema.parse(JSON.parse(await fs.readFile(path, 'utf-8')));
  } catch (err) {                              // err: unknown
    throw new ConfigError(`Bad config at ${path}`, { cause: err }); // chain preserved
  }
}

// Consuming: narrow before touching fields
try { await readConfig(p); }
catch (err) {
  if (err instanceof ConfigError) log.warn(err.message);
  else throw err;
}
```

## Return union, not null; empty over null

```typescript
// Expected failure as data, not an exception, not null
type Parsed = { ok: true; value: number } | { ok: false; reason: string };

function getUsers(): User[] {           // [] when none — safe to map/filter
  return rows.length ? rows.map(toUser) : [];
}
```

## Async pitfalls

```typescript
// Bad — floating promise: rejection is swallowed, ordering unclear
sendEmail(user);

// Good — await, or explicitly discard
await sendEmail(user);
void fireAndForget();                    // intent is explicit

// Sequential awaits that don't depend on each other → parallelise
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

## Type-level tests

```typescript
import { expectTypeOf } from 'vitest';

expectTypeOf(parseId('x')).toEqualTypeOf<UserId>();

// @ts-expect-error — passing a raw string must NOT compile
load('raw-string');
```
