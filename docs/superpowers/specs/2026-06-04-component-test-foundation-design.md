# Design: Component/auth test foundation + C2/C3 coverage

**Date:** 2026-06-04
**Status:** Approved
**Topic:** Stand up a jsdom + React Testing Library foundation alongside the
existing node-only Vitest setup, extract the duplicated Supabase mock into a
shared helper, and use both to cover the error-handling paths shipped in the
C2/C3 round (TECH_DEBT High #1, first slice).

## Context

The error-handling hardening for dashboard client components (C2) and auth
flows (C3) shipped on 2026-06-03 with manual verification only — components,
pages, and auth still have zero automated coverage (TECH_DEBT High #1). The
existing Vitest setup is deliberately `node`-only (`lib/` pure logic + 4
API-route suites, 73 tests). Component tests need a DOM environment and React
Testing Library, plus a way to mock the browser Supabase client, the
`useClub()` context, and `next/navigation`.

The 4 API-route tests already use a chainable `makeChain`/`makeSupabase`
Supabase mock that is copy-pasted across all 4 files — TECH_DEBT flags this as
a rule-of-three duplication to extract. This work is the natural moment to
extract it (the client components need the same mock, extended).

## Goals

1. A jsdom + RTL foundation that coexists with the node suites without slowing
   or changing them.
2. One shared, reusable Supabase mock helper used by both the new component
   tests and the retrofitted API-route tests.
3. Representative coverage proving the C2 read pattern and the C2/C3 mutation
   pattern, plus tests for the genuinely distinct logic (members'
   `error`→`loadError` conversion, signup orphaned-account recovery,
   reset-password `getSession()` guard).
4. `vitest run`, `tsc --noEmit`, and `eslint` all stay green.

## Non-goals (out of scope — logged, not done now)

- Tests for the remaining ~15 identical mutation wrappers (the pattern is
  proven by the representative handlers; mechanically re-testing identical
  `try/catch/finally` wrappers has low marginal value).
- Tests for the two large editors (`records/[listId]/page.tsx` ~556 LOC,
  `RecordTable.tsx` ~892 LOC) — separate, larger efforts.
- End-to-end / Playwright; coverage-reporting packages (`@vitest/coverage-*`);
  any CI workflow change beyond the suite staying green.
- Promoting `eslint` to a hard CI gate (tracked separately).

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Coverage breadth | Representative + special cases (~7 test files), not exhaustive per-handler |
| D2 | Shared mock | Extract `makeChain`/`makeSupabase` to `lib/test/supabase-mock.ts` (extended) **and** retrofit the 4 existing API-route tests to use it |
| D3 | jsdom strategy | Per-file `// @vitest-environment jsdom` pragma; `node` stays the global default (no workspace/projects restructure) |
| D4 | RTL cleanup | Explicit `afterEach(cleanup)` in a setup file (do not enable `globals`; existing tests import `describe/it/expect` explicitly) |

## Design

### §1. Infrastructure

**Dev dependencies** (pinned, added to `package.json` devDependencies):
`jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`.

**`vitest.config.ts`** (extend the current file; keep `environment: "node"`):
- `test.include` adds `"components/**/*.test.{ts,tsx}"` and
  `"app/**/*.test.tsx"` (current globs `"lib/**/*.test.ts"`,
  `"app/**/*.test.ts"` stay).
- Add `test.setupFiles: ["./vitest.setup.ts"]`.
- `environment` stays `"node"` as the default; component test files opt into
  jsdom per-file (D3).

**`vitest.setup.ts`** (new, repo root):
```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
```
This runs in every test's environment. Importing jest-dom only registers
matchers (harmless in the node suites, which don't use DOM matchers). `cleanup`
unmounts React trees between tests.

**Per-file opt-in:** each component test file begins with the docblock
`// @vitest-environment jsdom` so only `.test.tsx` files pay the jsdom cost.

### §2. Shared Supabase mock — `lib/test/supabase-mock.ts`

Extract the existing `makeChain`/`makeSupabase` (today duplicated in the 4
route tests) into one module and extend it for the client-component surfaces.

Responsibilities / interface:
- `makeChain(result)` — returns a chainable, thenable object. Builder methods
  (`select`, `eq`, `order`, `limit`, `in`, `insert`, `update`, `delete`,
  `upsert`) return the chain; `single`/`maybeSingle` resolve `result`; the
  chain itself is thenable (so `await supabase.from(t).delete().eq(...)`
  resolves to `result`). Builder methods are `vi.fn()`s wrapping the
  chain-return so tests can assert calls/arguments.
- `makeSupabase(config)` — returns an object shaped like the browser client:
  - `from(table)` → a chain whose result is `config.tables?.[table]`
    (default `{ data: null, error: null }`).
  - `rpc(fnName, args)` → a thenable resolving `config.rpc?.[fnName]`.
  - `auth` → object with `signUp`, `signInWithPassword`, `updateUser`,
    `resetPasswordForEmail`, `getUser`, `getSession`, each a `vi.fn()`
    resolving the configured result (or rejecting, to simulate a thrown/network
    error).
- A small helper (e.g. `mockBrowserClient(config)`) that does
  `vi.mocked(createClient).mockReturnValue(makeSupabase(config) as ...)` for the
  client tests, mirroring the existing `mockDb` convenience.

The `PostgrestError`-shaped `pgError` test constant moves here too (it is
re-declared in each route test).

**Retrofit:** the 4 existing API-route test files
(`app/api/clubs/[slug]/route.test.ts`,
`app/api/clubs/[slug]/records/route.test.ts`,
`app/api/admin/club-level/route.test.ts`,
`app/api/admin/upload/route.test.ts`) import `makeSupabase`/`makeChain`/
`pgError` from `@/lib/test/supabase-mock` instead of their local copies. Their
`vi.mock(...)` of `@/lib/supabase/server` and all assertions stay unchanged;
only the mock-construction source moves. The route tests use the
`server`-client `createClient` (async), the component tests use the
`browser`-client `createClient` (sync) — the helper supports both by returning
the same `makeSupabase` object (the test wires it to the right mock with
`mockResolvedValue` vs `mockReturnValue`).

### §3. Coverage — component/auth tests (~7 files)

Every component test mocks three modules: `@/lib/supabase/client`
(`createClient` → `makeSupabase(...)`), `@/contexts/ClubContext` (`useClub`
returns a configurable `{ selectedClub, setSelectedClub, isLoading, isOwner,
isEditor, canEdit }`), and `next/navigation` (`useRouter` →
`{ push: vi.fn(), refresh: vi.fn() }`; `useParams` where needed). Async
state-driven assertions use RTL `findBy*` / `waitFor`. User actions use
`@testing-library/user-event`.

| File | Cases |
|------|-------|
| `components/LoadError.test.tsx` | (a) renders the default message + "Try again"; (b) renders a custom `message`; (c) clicking "Try again" calls `onRetry`. |
| `app/(dashboard)/dashboard/page.test.tsx` | **Read pattern.** (a) success: lists render; (b) read returns `error` → `<LoadError>` shows, the "No record lists yet" empty state does NOT; (c) clicking "Try again" re-runs the loader and, with the mock now succeeding, renders the lists. |
| `app/(dashboard)/dashboard/members/page.test.tsx` | **`error`→`loadError` conversion.** (a) `get_club_members_with_email` rpc error → `<LoadError>`; (b) success → members render. (`useClub` mocked as owner so the page doesn't redirect.) |
| `app/(auth)/login/page.test.tsx` | **Mutation pattern.** (a) `signInWithPassword` returns `{error}` → `error.message` shown, button re-enabled; (b) `signInWithPassword` throws → generic "Something went wrong. Please try again." shown, button re-enabled; (c) success → `router.push("/dashboard")`. |
| `app/(dashboard)/dashboard/settings/page.test.tsx` | **Dashboard mutation.** `clubs.update` throws → generic message in the `message` banner, "Save Changes" re-enabled (`saving` reset). (`useClub` mocked as owner.) |
| `app/(auth)/signup/page.test.tsx` | **Special: orphaned-account recovery.** On the club step, `signUp` succeeds but `clubs.insert` returns `{error}` → `router.push("/dashboard")` is called and NO raw DB error text is rendered. |
| `app/(auth)/reset-password/page.test.tsx` | **Special: session guard.** (a) `getSession()` rejects → no unhandled crash, the form still renders (the component's readiness fallback); (b) submit with matching valid passwords and `updateUser` success → success view; (c) `updateUser` throws → generic message, button re-enabled. |

### §4. Verification

1. `npx vitest run` — existing 73 stay green; new component/auth tests pass.
2. `npx tsc --noEmit` — clean (the new `.test.tsx` files and the shared helper
   type-check).
3. `npx eslint .` — no NEW errors/warnings beyond the known backlog (the test
   files and helper introduce none).

## Follow-ups (logged, not done here)

- Coverage for the large editors (`records/[listId]/page.tsx`,
  `RecordTable.tsx`) and the remaining mutation handlers, if/when those areas
  change.
- Promote `eslint` to a hard CI gate once the 2 remaining
  `set-state-in-effect` errors are fixed (separate item).
</content>
