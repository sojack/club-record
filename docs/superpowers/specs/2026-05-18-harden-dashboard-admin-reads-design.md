# Design: Harden dashboard/admin server reads (Tech-debt High #3, sub-project C — slice C1)

**Date:** 2026-05-18
**Status:** Approved
**Topic:** Apply sub-project A's `unwrap` guard pattern to the unchecked
server-side Supabase reads in the admin/dashboard area, so DB failures stop
silently rendering "no clubs" / mis-scoping uploads.

## Context

Sub-project A hardened the public path; B added admin API input validation.
Tech-debt High #3 ("near-absent error handling") remains for the
dashboard/admin/auth area. That area is large and heterogeneous (~30 unchecked
reads across ~12 files, RSC vs client vs auth) so it was decomposed into:
**C1** (server/layout reads + the one API line B deferred — *this spec*),
**C2** (dashboard client components — inline error state), **C3** (auth flows).

C1's three unchecked server reads and their current silent failure modes:

- `app/admin/page.tsx:9` — `const { data: clubs } = await supabase.from("clubs").select("*, record_lists(count)")…` → on DB error `clubs` is `null` → renders "No clubs found." (a DB outage looks like an empty admin).
- `app/(dashboard)/layout.tsx`:
  - `:30` `const { data: allClubs } = await adminClient.from("clubs").select("id")` (admin-only branch) — unchecked.
  - `:40` `await adminClient.from("club_members").upsert(…)` — return value **entirely ignored**.
  - `:47` `const { data: memberships } = await supabase.from("club_members").select("role, clubs(*)").eq("user_id", user.id)…` → on DB error `memberships` is `null` → `clubs` becomes `[]` → the whole dashboard silently renders as "you have no clubs".
- `app/api/admin/upload/route.ts:34` (the line B explicitly deferred) — `const { data: clubRow } = await adminClient.from("clubs").select("level").eq("id", clubId).single()` → on DB error **or a non-existent `clubId`**, `clubRow` is `null` → `scopeForClubLevel("regular")` silently mis-scopes the inserted record list. Silent data-correctness bug.

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Mechanism | Reuse A's `lib/supabase/guard.ts` (`unwrap`/`DataAccessError`/`dbErrorToResponse`); no new helper |
| D2 | Error UX | `unwrap` throws → a **new `app/admin/error.tsx`** boundary catches `app/admin/page.tsx`. `(dashboard)/layout.tsx`'s own throw bubbles to the existing root `app/error.tsx` (sibling-layout rule). **`app/(dashboard)/error.tsx` is NOT created** (no C1 consumer — YAGNI; deferred) |
| D3 | `upload` `clubRow` | `.single()`→`.maybeSingle()`+`unwrap`; DB error → **500**; `clubId` not found → **400 `{error:"Club not found"}`** (400, not 404 — consistent with B's admin body-error contract; `clubId` is in the POST body) |
| D4 | Dashboard-layout split | `memberships` read = **fatal** (throw → root boundary). The admin-bootstrap `allClubs` read + `club_members.upsert` = **non-fatal** (`console.error` + continue — hard-failing would lock an admin out of an otherwise-working dashboard) |

## Design

### §1. `app/admin/page.tsx`

Replace the unchecked read with:

```ts
import { unwrap } from "@/lib/supabase/guard";
// …
const clubs =
  unwrap<(Club & { record_lists: { count: number }[] })[]>(
    await supabase
      .from("clubs")
      .select("*, record_lists(count)")
      .order("created_at", { ascending: false }),
    "admin: clubs list"
  ) ?? [];
```

DB error → `unwrap` throws `DataAccessError` → caught by `app/admin/error.tsx`
(§4). Genuine empty → `[]` → existing "No clubs found." block (unchanged).
The `(clubs as (Club & { record_lists: { count: number }[] })[])` cast in the
`.map` is removed (the `unwrap` generic supplies the element type). The JSX
condition `{clubs && clubs.length > 0 ? …}` is left **exactly as-is**
(`clubs` is now always a non-null array so `clubs &&` is harmlessly always
truthy — not simplified, to keep the diff minimal and the change purely the
read + cast removal). No other lines in the file change.

### §2. `app/(dashboard)/layout.tsx`

- Add `import { unwrap } from "@/lib/supabase/guard";`.
- **`memberships` (fatal):**
  ```ts
  const memberships =
    unwrap<{ role: string; clubs: unknown }[]>(
      await supabase
        .from("club_members")
        .select("role, clubs(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      "dashboard: memberships"
    ) ?? [];
  ```
  The existing `(memberships || [])` becomes `memberships` (already
  `?? []`-coalesced); the `.filter`/`.map` + `m.clubs as unknown as Club`
  transform is unchanged. DB error → throws; this is the segment's own
  layout, so the throw is **not** caught by any `(dashboard)` boundary and
  bubbles to the existing root `app/error.tsx` (accepted). Genuine empty →
  `[]` → DashboardShell with no clubs (legitimate "no memberships yet").
- **`allClubs` (non-fatal):**
  ```ts
  const { data: allClubs, error: allClubsError } = await adminClient
    .from("clubs")
    .select("id");
  if (allClubsError) {
    console.error("[data-access] dashboard(admin): all clubs", allClubsError);
  }
  ```
  The existing `if (allClubs && allClubs.length > 0) { … }` already tolerates
  a null `allClubs`; on error we logged and fall through (no upsert).
- **`club_members.upsert` (non-fatal):**
  ```ts
  const { error: upsertError } = await adminClient
    .from("club_members")
    .upsert(membershipsToUpsert, { onConflict: "club_id,user_id" });
  if (upsertError) {
    console.error(
      "[data-access] dashboard(admin): upsert memberships",
      upsertError
    );
  }
  ```
  Best-effort admin bootstrap; failure is logged, the request continues (the
  `memberships` read below still returns any pre-existing memberships).
- `supabase.auth.getUser()` (`:16`) — **unchanged, out of scope** (auth =
  sub-project C3).

### §3. `app/api/admin/upload/route.ts` (the `clubRow` line)

Post-B the route is: auth 401/403 → `parseJsonBody` → `createAdminClient()` →
`clubRow` `.single()` → `scopeForClubLevel` → `record_lists` insert
(`if (listError) 400`) → `records` insert (`if (recordsError) 400`) → success.
The route currently has **no `try/catch`**. Changes:

- Add `import { unwrap, DataAccessError, dbErrorToResponse } from "@/lib/supabase/guard";`.
- Wrap the DB section — from `const adminClient = createAdminClient();` through
  the final success `NextResponse.json` — in a `try`:
  ```ts
  try {
    const adminClient = createAdminClient();

    const clubRow = unwrap<{ level: string }>(
      await adminClient
        .from("clubs")
        .select("level")
        .eq("id", clubId)
        .maybeSingle(),
      `admin/upload: club level id=${clubId}`
    );
    if (!clubRow) {
      return NextResponse.json(
        { error: "Club not found" },
        { status: 400 }
      );
    }
    const listScope = scopeForClubLevel(
      (clubRow.level ?? "regular") as "regular" | "provincial" | "national"
    );

    // … existing record_lists insert + if (listError) 400 …
    // … existing records insert + if (recordsError) 400 …
    // … existing success NextResponse.json({ success, listId, recordCount }) …
  } catch (err) {
    if (!(err instanceof DataAccessError)) {
      console.error("[route] admin/upload: unexpected error", err);
    }
    return dbErrorToResponse({});
  }
  ```
  `dbErrorToResponse({})` — this route uses no CORS headers, so an empty
  headers object is passed (the helper signature requires one).
- The existing **already-checked** `listError`/`recordsError` `if`-blocks
  (they return 400 with `error.message`) are **unchanged and out of scope**
  (they are handled, merely leaky — a separate future polish, not C1's
  "unchecked reads" focus). They `return` (not throw) so the new `try/catch`
  does not alter their behavior.

### §4. Error boundary — `app/admin/error.tsx` (new)

A thin client boundary, in-app/admin wording + retry, same shape as A's
`app/[clubSlug]/error.tsx`:

```tsx
"use client";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
        Something went wrong
      </h1>
      <p className="mb-6 text-gray-500 dark:text-gray-400">
        We couldn&apos;t load this admin page. Please try again.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}
```

`app/admin/page.tsx`'s thrown `DataAccessError` is caught here. `app/admin/`
has its own `layout.tsx` (admin-gated); a segment's `error.tsx` does not catch
its own layout's errors, but `admin/page.tsx` is a *page* under that layout, so
this boundary catches it. **`app/(dashboard)/error.tsx` is intentionally NOT
created** (the only C1 dashboard RSC throw is `(dashboard)/layout.tsx`, which
bubbles to root `app/error.tsx` regardless; dashboard *pages* are client
components handled in C2). `error` is in the prop type but not destructured
(no unused-var), matching A's boundary convention.

### §5. Testing

- `app/admin/page.tsx`, `app/(dashboard)/layout.tsx` — RSC; **not unit-tested**
  (consistent with A §5: the `unwrap` decision logic is already covered by
  `lib/supabase/guard.test.ts`). Verified via `tsc --noEmit` + lint + the full
  Vitest suite staying green.
- `app/api/admin/upload/route.test.ts` — **extend** the existing B suite (do
  not rewrite it) with two new cases that pin C1's change:
  - admin + valid body, `byTable.clubs = { data: null, error: pgError }` →
    **500** (generic body).
  - admin + valid body, `byTable.clubs = { data: null, error: null }`
    (maybeSingle miss) → **400 `{ error: "Club not found" }`**.
  The existing B tests must stay green unchanged: the 200-success test's
  `byTable.clubs = { data: { level: "regular" }, error: null }` works
  identically through `.maybeSingle()`; the 401/403/400-validation tests are
  unaffected (they never reach the `clubRow` read).
- `app/admin/error.tsx` — thin client boundary, **not unit-tested**
  (consistent with A).
- Full suite green; `tsc --noEmit` exit 0; lint introduces no new problems
  (the pre-existing 7 errors + 6 warnings are unchanged and remain
  non-blocking).

### §6. Scope boundary

**In:** `app/admin/page.tsx`; the three ops in `app/(dashboard)/layout.tsx`
(`memberships` fatal; `allClubs` + `upsert` non-fatal); the `clubRow` read +
`try/catch` in `app/api/admin/upload/route.ts`; new `app/admin/error.tsx`;
extended `app/api/admin/upload/route.test.ts`.

**Out:** `supabase.auth.getUser()` and all auth flows (C3); the dashboard
client components (C2); `app/(dashboard)/error.tsx` (no C1 consumer — YAGNI);
the already-checked `listError`/`recordsError` insert blocks (handled, just
leaky — future polish); the `react-hooks/set-state-in-effect` lint debt
(separate Medium item); CORS/rate-limiting/observability.

## Acceptance criteria

1. `app/admin/page.tsx` routes its `clubs` read through `unwrap`; a simulated
   DB error throws (→ `app/admin/error.tsx`); genuine empty still renders
   "No clubs found." (cast removed; types from the `unwrap` generic).
2. `app/(dashboard)/layout.tsx`: `memberships` via `unwrap` (DB error throws →
   root `app/error.tsx`); `allClubs` + `club_members.upsert` capture `error`,
   `console.error`, and continue (non-fatal); `auth.getUser()` unchanged.
3. `app/api/admin/upload/route.ts`: `clubRow` via `.maybeSingle()`+`unwrap`
   inside a `try/catch`; DB error → 500; `clubId` not found → 400
   `{error:"Club not found"}`; valid existing-club path unchanged
   (record-list created with the correct derived scope).
4. `app/admin/error.tsx` exists as a `"use client"` boundary with a working
   `reset()`; `app/(dashboard)/error.tsx` is NOT created.
5. `app/api/admin/upload/route.test.ts` gains the two C1 cases (500 on DB
   error, 400 on missing club) and all pre-existing B tests still pass; full
   Vitest suite green; `tsc --noEmit` exit 0; no new lint problems.

## Notes on git

`docs/` is gitignored (project convention) — this spec is local-only. C1 runs
on a feature branch with local-only commits; nothing committed/pushed without
an explicit prompt; subagents never push.
