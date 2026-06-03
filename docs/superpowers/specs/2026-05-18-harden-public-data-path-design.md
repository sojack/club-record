# Design: Harden the public data path (Tech-debt High, sub-project A)

**Date:** 2026-05-18
**Status:** Approved
**Topic:** Stop the public read paths from silently swallowing Supabase errors.
Distinguish a genuine "not found" from a real DB failure, surface the failure
to clients/visitors/logs, and establish a reusable error-handling pattern that
sub-projects B and C will inherit.

## Context / problem

~85% of Supabase calls (`const { data } = await supabase…`) ignore `error`.
On the public path this means a DB outage, RLS misconfig, or network failure
returns `data: null`, which the code treats identically to "no rows":

- API routes return **404 "not found"** on a real DB error.
- Pages call `notFound()` (the 404 page) or render `(data || [])` → falsely
  empty record tables.

`.single()` makes this unavoidable as written: it returns an `error` for **0
rows** (`PGRST116`) as well as for real failures, so a `!data` check cannot
tell them apart. Result: outages look like "this club has no records."

This is the named TECH_DEBT High item #2 ("Swallowed Supabase errors") plus the
public-path portion of #3 ("near-absent error handling").

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | API route on a genuine DB error | **HTTP 500** + `{ error }` JSON (with CORS headers); 404 reserved for genuinely-not-found |
| D2 | Public page on a genuine DB error | Add `error.tsx` boundary(ies) and **throw**; `notFound()` only for genuinely-missing |
| D3 | Logging scope | Minimal `console.error` via the shared helper; structured observability/Sentry stays the separate Medium debt item |
| D4 | Not-found vs error mechanism | Migrate public-path single-row reads from `.single()` → `.maybeSingle()` + a shared guard helper (Approach 1) |

## Design

### §1. Guard module — `lib/supabase/guard.ts` (new)

```ts
import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

export class DataAccessError extends Error {
  readonly context: string;
  constructor(context: string, cause: PostgrestError) {
    super(`Data access failed: ${context}`, { cause });
    this.name = "DataAccessError";
    this.context = context;
  }
}

/**
 * Unwrap a Supabase result.
 * - error set      → console.error(context, error) then throw DataAccessError
 * - data null/ok   → return data (null means "no rows" for maybeSingle reads)
 */
export function unwrap<T>(
  result: { data: T | null; error: PostgrestError | null },
  context: string
): T | null {
  if (result.error) {
    console.error(`[data-access] ${context}`, result.error);
    throw new DataAccessError(context, result.error);
  }
  return result.data;
}

/** Build a generic 500 JSON response with the given headers (CORS-safe). */
export function dbErrorToResponse(
  headers: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500, headers }
  );
}
```

Notes:
- The client error body is generic (`"Internal server error"`) — no
  PostgREST/internal detail leaks to public consumers; detail goes to
  `console.error` (server logs / Vercel) only.
- `unwrap` returning `null` is the **not-found** signal for `.maybeSingle()`
  reads; callers decide `notFound()` / 404. For list/array reads `data` is `[]`
  on success and the function only ever returns the array (errors throw).

### §2. Server data path (RSC + API)

Migrate single-row public reads `.single()` → `.maybeSingle()` and route every
result through `unwrap(...)`. Array/list reads keep their query but also go
through `unwrap` (so a DB error throws instead of silently `(data || [])`).

Files and the queries to convert:

- `app/api/clubs/[slug]/route.ts` — club (`.single`→`.maybeSingle`), lists.
  Wrap handler body in `try/catch`; any caught error → `dbErrorToResponse(corsHeaders)` (500). `club == null` → existing 404. Success shape unchanged.
- `app/api/clubs/[slug]/records/route.ts` — club, recordList (both
  `.single`→`.maybeSingle`), records. Same `try/catch` → `dbErrorToResponse(corsHeaders)` (500); `null` → existing 404s. Success shape unchanged.
- `app/[clubSlug]/layout.tsx` — club (`.single`→`.maybeSingle`). `unwrap` throws on error; `null` → `notFound()`.
- `app/[clubSlug]/page.tsx` — `generateMetadata` (club) **must not throw**: see rule below. `ClubPage`: club (→`maybeSingle`), recordLists, defaultRecords through `unwrap`; `null` club → `notFound()`; empty lists → existing "no record lists" UI (that is a legitimate empty success, not an error).
- `app/[clubSlug]/[recordSlug]/page.tsx` — `generateMetadata` (club,
  recordList) must not throw; `RecordPage`: club, recordList (→`maybeSingle`),
  records through `unwrap`; `null` → `notFound()`.
- `app/embed/[clubSlug]/page.tsx` — club, recordList (both branches,
  →`maybeSingle`), records through `unwrap`; `null` → `notFound()`.

**`generateMetadata` rule (explicit, single mechanism):** metadata is SEO-only
and must never throw. Each `generateMetadata` wraps its query + `unwrap` call
in a local `try/catch`; a caught `DataAccessError` is swallowed (the
`console.error` already fired inside `unwrap`) and a generic title is returned
(`"Club Records"` / `"Not Found"`, matching today's strings). No separate
non-throwing helper variant is introduced (YAGNI). The **page/layout component
query** is the one that throws and triggers the boundary, so the visitor still
gets the error page — metadata just degrades quietly.

### §3. Error boundaries (Next.js App Router semantics)

A segment's `error.tsx` is rendered *inside* that segment's `layout.tsx`, so it
does **not** catch errors thrown by its own layout. Therefore:

- `app/error.tsx` (**new**, `"use client"`) — root route boundary. Catches
  `app/[clubSlug]/layout.tsx` errors and `app/embed/[clubSlug]/page.tsx`
  errors (embed has no nearer boundary). Styled "Something went wrong — please
  try again" with a `reset()` retry button. Accepts `{ error, reset }`.
- `app/[clubSlug]/error.tsx` (**new**, `"use client"`) — catches
  `app/[clubSlug]/page.tsx` and `app/[clubSlug]/[recordSlug]/page.tsx` errors;
  renders a friendlier message within the club shell. `{ error, reset }`.

Root `app/layout.tsx` has no data fetching and is **not** modified, so no
`global-error.tsx` is required. `app/not-found.tsx` is unchanged and continues
to serve genuine 404s.

### §4. Client component — `app/[clubSlug]/ClubRecordBrowser.tsx`

`handleListChange` performs a browser-side Supabase fetch and currently does
`setRecords((data) || [])`, silently showing an empty table on failure. An
`error.tsx` boundary cannot catch an event-handler rejection, so this gets its
own contained pattern:

- Destructure `error` from the query. On error: `console.error(...)` + set a
  new `loadError` state; render an inline block "Couldn't load that list —
  Retry" (the Retry button re-invokes `handleListChange(selectedListId)`).
- Clear `loadError` at the start of each `handleListChange`. Success path and
  the existing default-list shortcut are unchanged.

### §5. Testing (ships with this sub-project)

- `lib/supabase/guard.test.ts` — unit:
  - `unwrap`: returns `data` on `{data, error:null}`; returns `null` on
    `{data:null, error:null}`; on `{error}` calls `console.error` (spied) **and**
    throws `DataAccessError`.
  - `DataAccessError`: `name`, `context`, and `cause` are set.
  - `dbErrorToResponse`: status 500, supplied headers present, JSON body
    `{ error: "Internal server error" }`, no internal/PostgREST detail in body.
- `app/api/clubs/[slug]/route.test.ts` and
  `app/api/clubs/[slug]/records/route.test.ts` — mock `@/lib/supabase/server`
  via `vi.mock`; per route assert three paths:
  1. DB error on a query → **500**, body `{error}`, CORS header present.
  2. Genuine not-found (`maybeSingle` → `{data:null,error:null}`) → **404**
     with the existing message.
  3. Success → **200** with the current JSON shape (regression pin).
- **Not unit-tested** (deferred to sub-project D / e2e): RSC page rendering,
  `error.tsx` boundary visuals, the client `ClubRecordBrowser` UI. The guard +
  API tests exercise every branching decision; the boundary/client files are
  thin and declarative.
- Full suite (existing 26 + new) stays green; `tsc --noEmit` exit 0; lint adds
  no new problems (pre-existing app lint debt unchanged, still non-blocking).

### §6. Scope boundary

**In scope:** `lib/supabase/guard.ts` (+test); the 6 server files in §2;
`app/error.tsx` and `app/[clubSlug]/error.tsx`; `ClubRecordBrowser.tsx` client
error UI; the 2 API route test files.

**Out of scope (other tracked debt items):** dashboard/admin/auth/layout error
handling (sub-project C); API input validation (sub-project B); structured
logging / Sentry (Medium observability); CORS-`*` and rate limiting (Low); the
unused `app/auth/callback/route.ts`; broad component/e2e coverage (sub-project
D).

## Acceptance criteria

1. `lib/supabase/guard.ts` exists with `unwrap`, `DataAccessError`,
   `dbErrorToResponse` per §1; `lib/supabase/guard.test.ts` covers §5 bullet 1
   and passes.
2. All 6 server files route public reads through `unwrap`, with single-row
   public reads using `.maybeSingle()`. A simulated DB error yields **500 +
   {error}** for the 2 API routes and a thrown error (→ boundary) for pages;
   genuine not-found still yields **404 / `notFound()`**; success responses are
   byte-unchanged from today (regression-pinned by the API tests).
3. `generateMetadata` never throws on a DB error (logs + generic title).
4. `app/error.tsx` and `app/[clubSlug]/error.tsx` exist as client boundaries
   with a working `reset()` retry.
5. `ClubRecordBrowser` shows an inline retry block (not a false-empty table) on
   a client fetch error.
6. The 2 API route test files assert the error / not-found / success paths and
   pass. Full Vitest suite green, `tsc --noEmit` exit 0, no new lint problems.

## Notes on git

`docs/` is gitignored (project convention), so this spec is local-only like the
others. Implementation files are tracked. Per the user's standing instruction,
nothing is committed or pushed without an explicit prompt; the implementation
will run on a feature branch with local-only commits.
