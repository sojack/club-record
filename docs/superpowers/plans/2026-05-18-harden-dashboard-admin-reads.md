# Harden Dashboard/Admin Server Reads — Implementation Plan (sub-project C1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply sub-project A's `unwrap` guard to the unchecked dashboard/admin **server** reads so DB failures stop silently rendering "no clubs" or mis-scoping uploads.

**Architecture:** Reuse `lib/supabase/guard.ts` (`unwrap`/`DataAccessError`/`dbErrorToResponse`) from sub-project A — no new helper. Fatal reads throw → a new `app/admin/error.tsx` boundary (or the existing root `app/error.tsx` for the dashboard layout's own throw); best-effort admin-bootstrap ops log + continue. The upload route's `clubRow` becomes `.maybeSingle()`+`unwrap` inside a `try/catch`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase JS, Vitest 4, npm. Spec: `docs/superpowers/specs/2026-05-18-harden-dashboard-admin-reads-design.md`.

> **⚠️ Git policy:** User controls git tightly. Each task ends with a commit *step*, but **do not `git commit`/`git push` without the user's explicit go-ahead**. Subagents **never** push. Repo root **is** `club-record/`; paths are relative to it. Feature branch off `main`, local commits only (subagent-driven-development creates the branch).

> **⚠️ Execution revision (Task 4, code review):** Spec §3 kept `(clubRow.level ?? "regular") as "regular"|"provincial"|"national"`. Code review correctly flagged that after the new `if (!clubRow)` guard, `?? "regular"` is dead AND the `as` cast is unsound (`{level:string}` is wider than the enum); the fallback would mask schema corruption rather than surface it. Reversed: type the read `unwrap<Pick<Club,"level">>(...)` and call `scopeForClubLevel(clubRow.level)` directly (no cast, no `?? "regular"`). `scopeForClubLevel` already handles the full domain. Same rationale as the Task-2 revision (don't ship code the change just made dead/misleading).

> **⚠️ Execution revision (Task 2, code review):** Spec §1 / Task 2 Step 3 said leave `{clubs && clubs.length > 0 ?` as-is for minimal diff. Code review correctly flagged that `unwrap(...) ?? []` makes `clubs` a non-nullable array, so `clubs &&` is now dead/misleading code *this change created* (it was meaningful before). Reversed: the JSX condition becomes `{clubs.length > 0 ? (`. Fixing code you just made misleading is part of a clean change, not scope creep.

> **⚠️ Pre-existing condition:** `npm run lint` fails with 7 errors + 6 warnings in unrelated pre-existing app code (documented in `TECH_DEBT.md`, non-blocking in CI). Verification requires `tsc --noEmit` exit 0, full Vitest suite green, and **no NEW lint problems from changed files** — not an overall-clean lint run. `lib/supabase/guard.ts` already exists from sub-project A and is unit-tested; do not modify it.

---

### Task 1: `app/admin/error.tsx` (new error boundary)

No unit test (thin declarative client boundary — consistent with sub-project A). Verify via tsc + lint.

**Files:**
- Create: `app/admin/error.tsx`

- [ ] **Step 1: Create `app/admin/error.tsx`** with EXACTLY:

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

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint app/admin/error.tsx`
Expected: zero problems. (`error` is in the prop type but intentionally not destructured — no unused-var; matches A's `app/[clubSlug]/error.tsx` convention. If `@typescript-eslint/no-unused-vars` unexpectedly flags it, STOP and report BLOCKED with the exact message — do not change the signature without reporting.)

- [ ] **Step 3: Confirm the suite is still green**

Run: `npm test`
Expected: full Vitest suite green, unchanged count (no tests added/affected).

- [ ] **Step 4: Commit** *(only with user go-ahead)*

```bash
git add app/admin/error.tsx
git commit -m "feat(admin): add admin route error boundary with retry"
```

---

### Task 2: `app/admin/page.tsx` — route `clubs` through `unwrap`

RSC; no unit test (the `unwrap` decision logic is covered by `lib/supabase/guard.test.ts`). Verify via tsc + lint + suite.

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Add the guard import**

Add this line immediately after the existing `import { createClient } from "@/lib/supabase/server";` line:

```ts
import { unwrap } from "@/lib/supabase/guard";
```

- [ ] **Step 2: Replace the unchecked `clubs` read**

Replace exactly:

```ts
  // Fetch all clubs (admin can see all)
  const { data: clubs } = await supabase
    .from("clubs")
    .select("*, record_lists(count)")
    .order("created_at", { ascending: false });
```

with:

```ts
  // Fetch all clubs (admin can see all)
  const clubs =
    unwrap<(Club & { record_lists: { count: number }[] })[]>(
      await supabase
        .from("clubs")
        .select("*, record_lists(count)")
        .order("created_at", { ascending: false }),
      "admin: clubs list"
    ) ?? [];
```

- [ ] **Step 3: Remove the now-redundant `.map` cast**

Replace exactly:

```tsx
          {(clubs as (Club & { record_lists: { count: number }[] })[]).map((club) => (
```

with:

```tsx
          {clubs.map((club) => (
```

Do NOT change the surrounding JSX condition `{clubs && clubs.length > 0 ? (` — leave it exactly as-is (per spec §1, minimal diff; `clubs` is now always a non-null array so `clubs &&` is harmlessly always truthy). No other lines change.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0. (`Club` import remains used as the `unwrap` generic arg.)
Run: `npx eslint app/admin/page.tsx`
Expected: zero NEW problems from this file.

- [ ] **Step 5: Suite still green**

Run: `npm test`
Expected: full Vitest suite green, count unchanged.

- [ ] **Step 6: Commit** *(only with user go-ahead)*

```bash
git add app/admin/page.tsx
git commit -m "fix(admin): clubs list throws on DB error (was a silent empty list)"
```

---

### Task 3: `app/(dashboard)/layout.tsx` — fatal `memberships`, non-fatal admin bootstrap

RSC; no unit test. Verify via tsc + lint + suite.

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Add the guard import**

Add immediately after the existing `import { createAdminClient } from "@/lib/supabase/admin";` line:

```ts
import { unwrap } from "@/lib/supabase/guard";
```

- [ ] **Step 2: Make the admin-bootstrap `allClubs` read non-fatal**

Replace exactly:

```ts
    // Fetch all clubs
    const { data: allClubs } = await adminClient.from("clubs").select("id");
```

with:

```ts
    // Fetch all clubs (best-effort admin bootstrap — non-fatal)
    const { data: allClubs, error: allClubsError } = await adminClient
      .from("clubs")
      .select("id");
    if (allClubsError) {
      console.error(
        "[data-access] dashboard(admin): all clubs",
        allClubsError
      );
    }
```

- [ ] **Step 3: Make the admin-bootstrap `upsert` non-fatal**

Replace exactly:

```ts
      await adminClient
        .from("club_members")
        .upsert(membershipsToUpsert, { onConflict: "club_id,user_id" });
```

with:

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

- [ ] **Step 4: Make the `memberships` read fatal via `unwrap`**

Replace exactly:

```ts
  // Query clubs through club_members to get role info
  const { data: memberships } = await supabase
    .from("club_members")
    .select("role, clubs(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  // Transform to ClubWithMembership[]
  const clubs: ClubWithMembership[] = (memberships || [])
    .filter((m) => m.clubs) // Filter out any null clubs
    .map((m) => {
```

with:

```ts
  // Query clubs through club_members to get role info
  const memberships =
    unwrap<{ role: string; clubs: unknown }[]>(
      await supabase
        .from("club_members")
        .select("role, clubs(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      "dashboard: memberships"
    ) ?? [];

  // Transform to ClubWithMembership[]
  const clubs: ClubWithMembership[] = memberships
    .filter((m) => m.clubs) // Filter out any null clubs
    .map((m) => {
```

Leave the rest of the `.map` body (`const club = m.clubs as unknown as Club;` … `role: m.role as ClubMemberRole`) and everything else (the `auth.getUser()` block, the `DashboardShell` return) **unchanged**. (`auth.getUser()` is out of scope — sub-project C3.)

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0. (`memberships` typed `{role:string;clubs:unknown}[]`; `.filter(m => m.clubs)` truthy-checks `unknown`; `m.clubs as unknown as Club` and `m.role as ClubMemberRole` remain valid; `ClubWithMembership`/`Club`/`ClubMemberRole` imports still used.)
Run: `npx eslint "app/(dashboard)/layout.tsx"`
Expected: zero NEW problems from this file.

- [ ] **Step 6: Suite still green**

Run: `npm test`
Expected: full Vitest suite green, count unchanged.

- [ ] **Step 7: Commit** *(only with user go-ahead)*

```bash
git add "app/(dashboard)/layout.tsx"
git commit -m "fix(dashboard): memberships read throws on DB error; admin bootstrap logs+continues"
```

---

### Task 4: `app/api/admin/upload/route.ts` — guard `clubRow` (TDD, extend the B route test)

**Files:**
- Modify: `app/api/admin/upload/route.test.ts` (extend — do NOT rewrite)
- Modify: `app/api/admin/upload/route.ts`

- [ ] **Step 1: Add the two failing C1 tests**

In `app/api/admin/upload/route.test.ts`, inside the existing
`describe("POST /api/admin/upload", () => { … })` block, immediately AFTER the
existing `it("200 success JSON for admin + valid body", …)` test and BEFORE
the closing `});` of the describe, insert these two tests verbatim:

```ts
  it("500 when the club-level lookup hits a DB error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup({
      user: { email: "admin@test.com" },
      byTable: {
        clubs: { data: null, error: { message: "boom", code: "XX000" } },
      },
    });
    const res = await call(validBody);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("400 'Club not found' when the clubId does not exist", async () => {
    setup({
      user: { email: "admin@test.com" },
      byTable: { clubs: { data: null, error: null } },
    });
    const res = await call(validBody);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Club not found" });
  });
```

Do not modify the existing helpers (`makeChain`, `setup`, `validRecord`,
`validBody`, `call`), the `beforeEach`/`afterEach`, or the 5 existing tests.
(The existing `setup`'s `byTable` value type is `{ data?: unknown; error: unknown }`,
so the inline error object needs no import/cast. The first test stubs
`console.error` locally because `unwrap` logs before throwing — keeps output
clean without altering the shared `beforeEach`.)

- [ ] **Step 2: Run the suite to verify the two new tests FAIL**

Run: `npx vitest run app/api/admin/upload/route.test.ts`
Expected: the two new tests FAIL — current code uses `.single()` and ignores
the error, so `clubRow` is `null`, `scopeForClubLevel("regular")` runs, the
mocked `record_lists`/`records` inserts return `{data:null}`/default, and the
route does NOT return 500 or `{error:"Club not found"}` (it errors on
`listData.id` / returns a different shape). The 5 existing tests still pass.
Confirm the two new ones fail before editing the route.

- [ ] **Step 3: Add the guard import to the route**

In `app/api/admin/upload/route.ts`, replace exactly:

```ts
import { parseJsonBody } from "@/lib/validation/parse";
import { uploadSchema } from "./schema";
```

with:

```ts
import { parseJsonBody } from "@/lib/validation/parse";
import {
  unwrap,
  DataAccessError,
  dbErrorToResponse,
} from "@/lib/supabase/guard";
import { uploadSchema } from "./schema";
```

- [ ] **Step 4: Wrap the DB section in try/catch and guard `clubRow`**

In `app/api/admin/upload/route.ts`, replace exactly this block (everything
from the admin-client comment through the final success response):

```ts
  // Use admin client to bypass RLS
  const adminClient = createAdminClient();

  // Derive scope from club's level
  const { data: clubRow } = await adminClient
    .from("clubs")
    .select("level")
    .eq("id", clubId)
    .single();
  const listScope = scopeForClubLevel(
    (clubRow?.level ?? "regular") as "regular" | "provincial" | "national"
  );

  // Create record list
  const { data: listData, error: listError } = await adminClient
    .from("record_lists")
    .insert({
      club_id: clubId,
      title,
      slug,
      course_type: courseType,
      gender: gender ?? null,
      record_type: recordType ?? "individual",
      scope: listScope,
    })
    .select()
    .single();

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 400 });
  }

  // Insert records
  const { error: recordsError } = await adminClient.from("records").insert(
    records.map((r, idx) => ({
      record_list_id: listData.id,
      event_name: r.event_name,
      time_ms: r.time_ms,
      swimmer_name: r.swimmer_name,
      swimmer_name_2: r.swimmer_name_2,
      swimmer_name_3: r.swimmer_name_3,
      swimmer_name_4: r.swimmer_name_4,
      age_group: r.age_group,
      record_club: r.record_club,
      province: r.province,
      record_date: r.record_date,
      location: r.location,
      sort_order: idx,
      is_national: r.is_national,
      is_current_national: r.is_current_national,
      is_provincial: r.is_provincial,
      is_current_provincial: r.is_current_provincial,
      is_split: r.is_split,
      is_relay_split: r.is_relay_split,
      is_new: r.is_new,
    }))
  );

  if (recordsError) {
    return NextResponse.json(
      { error: `Records failed: ${recordsError.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    listId: listData.id,
    recordCount: records.length,
  });
}
```

with (note the new `try {` wrapper, `.maybeSingle()`+`unwrap`, the
not-found 400, and the `catch`; the record_lists/records insert blocks are
**byte-identical**, only re-indented inside the `try`):

```ts
  try {
    // Use admin client to bypass RLS
    const adminClient = createAdminClient();

    // Derive scope from club's level
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

    // Create record list
    const { data: listData, error: listError } = await adminClient
      .from("record_lists")
      .insert({
        club_id: clubId,
        title,
        slug,
        course_type: courseType,
        gender: gender ?? null,
        record_type: recordType ?? "individual",
        scope: listScope,
      })
      .select()
      .single();

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 400 });
    }

    // Insert records
    const { error: recordsError } = await adminClient.from("records").insert(
      records.map((r, idx) => ({
        record_list_id: listData.id,
        event_name: r.event_name,
        time_ms: r.time_ms,
        swimmer_name: r.swimmer_name,
        swimmer_name_2: r.swimmer_name_2,
        swimmer_name_3: r.swimmer_name_3,
        swimmer_name_4: r.swimmer_name_4,
        age_group: r.age_group,
        record_club: r.record_club,
        province: r.province,
        record_date: r.record_date,
        location: r.location,
        sort_order: idx,
        is_national: r.is_national,
        is_current_national: r.is_current_national,
        is_provincial: r.is_provincial,
        is_current_provincial: r.is_current_provincial,
        is_split: r.is_split,
        is_relay_split: r.is_relay_split,
        is_new: r.is_new,
      }))
    );

    if (recordsError) {
      return NextResponse.json(
        { error: `Records failed: ${recordsError.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      listId: listData.id,
      recordCount: records.length,
    });
  } catch (err) {
    if (!(err instanceof DataAccessError)) {
      console.error("[route] admin/upload: unexpected error", err);
    }
    return dbErrorToResponse({});
  }
}
```

(Auth checks, `parseJsonBody`, and the destructure above the `try` are
unchanged. The `listError`/`recordsError` `if`-blocks are byte-identical and
`return` — not caught by the new `catch`. `record_type: recordType ?? "individual"`
stays verbatim per the B decision.)

- [ ] **Step 5: Run tests to verify all pass**

Run: `npx vitest run app/api/admin/upload/route.test.ts`
Expected: PASS — all 7 (5 existing B + 2 new C1) green. The 200-success test
still passes (`clubs:{data:{level:"regular"}}` → `clubRow` truthy via
`.maybeSingle()` → unchanged success path).

- [ ] **Step 6: Typecheck + lint + full suite**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint "app/api/admin/upload/route.ts" "app/api/admin/upload/route.test.ts"`
Expected: zero NEW problems.
Run: `npx vitest run`
Expected: full suite green (was 71; now 73 with the 2 new tests).

- [ ] **Step 7: Commit** *(only with user go-ahead)*

```bash
git add "app/api/admin/upload/route.ts" "app/api/admin/upload/route.test.ts"
git commit -m "fix(api): upload route 500 on DB error / 400 on unknown clubId (was silent mis-scope)"
```

---

### Task 5: Final verification + TECH_DEBT.md

**Files:**
- Modify: `TECH_DEBT.md`

> Housekeeping beyond spec §6's code list (the ledger's purpose is to track this). Minimal.

- [ ] **Step 1: Full verification**

Run: `npm test`
Expected: full suite green (73 tests).
Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npm run lint`
Expected: only the documented pre-existing 7 errors + 6 warnings; no new problems from any file this plan added/changed (`app/admin/error.tsx`, `app/admin/page.tsx`, `app/(dashboard)/layout.tsx`, `app/api/admin/upload/route.ts`, `app/api/admin/upload/route.test.ts`). List the flagged files to confirm they're all the pre-existing set.

- [ ] **Step 2: Update `TECH_DEBT.md`**

Read `TECH_DEBT.md`. Find this exact `## High` bullet (added in sub-project A's Task 7):

```markdown
- [ ] **Near-absent error handling — dashboard/admin/auth (remaining)** — the
  public read path is now hardened via `lib/supabase/guard.ts` (see Done).
  The remaining ~30 unchecked Supabase calls in dashboard/admin/layout/auth
  still swallow errors; apply the same `unwrap` guard pattern there
  (tech-debt sub-project C).
```

Replace it with:

```markdown
- [ ] **Near-absent error handling — dashboard client + auth (remaining)** —
  the public path (A) and the admin/dashboard **server** reads (C1: `unwrap`
  in `app/admin/page.tsx`, `app/(dashboard)/layout.tsx`, the `clubRow` lookup
  in `app/api/admin/upload/route.ts`; new `app/admin/error.tsx`) are now
  hardened. Remaining: the ~6 dashboard **client** components — inline
  error-state + retry (sub-project C2); and the auth flows
  (signup/reset-password) (sub-project C3).
```

Make no other edits.

- [ ] **Step 3: Confirm acceptance criteria**

Verify the spec's "Acceptance criteria" 1–5 each hold; note any deviation.

- [ ] **Step 4: Commit** *(only with user go-ahead)*

```bash
git add TECH_DEBT.md
git commit -m "docs: mark dashboard/admin server-read hardening (C1) done in TECH_DEBT"
```

---

## Self-Review

**Spec coverage:** §1 `admin/page.tsx` → Task 2. §2 `(dashboard)/layout.tsx` (memberships fatal; allClubs+upsert non-fatal; auth untouched) → Task 3. §3 upload `clubRow` (.maybeSingle+unwrap, 400 not-found, try/catch → `dbErrorToResponse({})`) → Task 4. §4 `app/admin/error.tsx` only (no `(dashboard)/error.tsx`) → Task 1. §5 testing (RSC not unit-tested; upload route test extended with the 2 C1 cases; existing B tests stay green) → Tasks 2–4. §6 scope respected (auth/C2/C3/leaky-insert/lint-debt all out). Acceptance criteria 1–5 → Task 5 Step 3. No gaps.

**Placeholder scan:** No TBD/vague steps; every code step shows the complete before/after; every command has an expected result. The upload-route replacement shows the full new block (the insert bodies repeated verbatim so the engineer never reconstructs them).

**Type/name consistency:** `unwrap`/`DataAccessError`/`dbErrorToResponse` imported from `@/lib/supabase/guard` (the A module, unmodified) and used with identical signatures everywhere. `unwrap<T>(...) ?? []` for arrays (admin clubs, memberships), `unwrap<{level:string}>(...)` + null-check for the single clubRow. `dbErrorToResponse({})` matches A's `(headers: Record<string,string>)` signature. The route's `catch (err) { if (!(err instanceof DataAccessError)) console.error(...) }` mirrors sub-project A's API-route catch convention exactly. Test additions reuse the existing B `setup`/`call`/`validBody` helpers unchanged; new SHAs/test counts (71 → 73) are consistent across Tasks 4–5.
