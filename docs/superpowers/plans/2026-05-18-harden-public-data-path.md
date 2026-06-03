# Harden the Public Data Path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the public read paths from silently turning Supabase errors into fake 404s / empty tables — distinguish "not found" from "DB failure", surface failures, and establish a reusable guard pattern.

**Architecture:** A small `lib/supabase/guard.ts` (`unwrap`, `DataAccessError`, `dbErrorToResponse`) centralises "log + throw on error, return data otherwise". Public single-row reads migrate `.single()`→`.maybeSingle()` so `null` cleanly means not-found. API routes catch → 500 `{error}`; pages throw → new `error.tsx` boundaries; the one client fetch gets an inline retry UI.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase JS v2, Vitest 4, npm. Spec: `docs/superpowers/specs/2026-05-18-harden-public-data-path-design.md`.

> **⚠️ Git policy (overrides the skill's default commit cadence):** The user controls git tightly. Each task ends with a commit *step*, but **do not run `git commit` or `git push` without the user's explicit go-ahead**. `commit ≠ push`. Subagents must **never** push. The repo root **is** the `club-record/` directory; all paths are relative to it. Work on a feature branch (subagent-driven-development creates it); local commits only.

> **⚠️ Pre-existing condition:** `npm run lint` fails with 7 errors + 6 warnings in unrelated pre-existing app code (documented in `TECH_DEBT.md`, non-blocking in CI). Verification below requires `tsc --noEmit` exit 0, the full Vitest suite green, and **no NEW lint problems from changed files** — not an overall-clean lint run.

> **⚠️ Execution revision (during Task 6, code review):** Plan bug: Task 6 Edit 2 placed `setLoadError(false)` only on the fetch path, *after* the existing default-list early-return (`if (listId === defaultListId) { setRecords(defaultRecords); return; }`). So after a failed load, switching to the default list left the stale error card over correct data (Retry loops). Fix: add `setLoadError(false);` inside that early-return branch, before `setRecords(defaultRecords);`.

> **⚠️ Execution revision (during Task 2, code review):** Both public API routes' `catch` must also log unexpected (non-`DataAccessError`) errors so a programming bug isn't a silent 500 — this is the sub-project's whole point. The catch in **Tasks 2 and 3** is therefore: `} catch (err) { if (!(err instanceof DataAccessError)) console.error("[route] unexpected", err); return dbErrorToResponse(corsHeaders); }`, and the guard import becomes `import { unwrap, dbErrorToResponse, DataAccessError } from "@/lib/supabase/guard";`. Each API success test also pins `full_name` and `logo_url` (Task 2) / the full `list` shape (Task 3) so the response contract can't silently regress. `generateMetadata` catches stay swallow-only (already logged in `unwrap`; metadata must not be noisy).

> **⚠️ Execution revision (during Task 2):** The plan under-specified test infra. `vitest.config.ts` previously only had `include: ["lib/**/*.test.ts"]` and no `@/` alias, so API route tests under `app/` were neither discovered nor able to resolve `@/...` imports. Task 2 amended `vitest.config.ts` to `include: ["lib/**/*.test.ts", "app/**/*.test.ts"]` and add `resolve.alias { "@": repo-root }`. This is committed with Task 2 (3 files in that commit, not 2). Task 3's `app/...` test is therefore already discoverable — Task 3 must **not** re-edit `vitest.config.ts`.

---

### Task 1: Guard module (TDD)

**Files:**
- Create: `lib/supabase/guard.ts`
- Create: `lib/supabase/guard.test.ts`

- [ ] **Step 1: Write the failing tests** — create `lib/supabase/guard.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { unwrap, DataAccessError, dbErrorToResponse } from "./guard";

const pgError = {
  message: "boom",
  details: "",
  hint: "",
  code: "XX000",
  name: "PostgrestError",
} as unknown as PostgrestError;

afterEach(() => vi.restoreAllMocks());

describe("unwrap", () => {
  it("returns data on success", () => {
    expect(unwrap({ data: { id: 1 }, error: null }, "ctx")).toEqual({ id: 1 });
  });

  it("returns null on a maybeSingle miss (no rows, no error)", () => {
    expect(unwrap({ data: null, error: null }, "ctx")).toBeNull();
  });

  it("logs and throws DataAccessError when error is set", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      unwrap({ data: null, error: pgError }, "clubs: by slug")
    ).toThrow(DataAccessError);
    expect(spy).toHaveBeenCalledWith("[data-access] clubs: by slug", pgError);
  });
});

describe("DataAccessError", () => {
  it("carries name, context, and cause", () => {
    const err = new DataAccessError("clubs: by slug", pgError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DataAccessError");
    expect(err.context).toBe("clubs: by slug");
    expect(err.cause).toBe(pgError);
  });
});

describe("dbErrorToResponse", () => {
  it("returns a generic 500 with the given headers, no internal detail", async () => {
    const res = dbErrorToResponse({ "Access-Control-Allow-Origin": "*" });
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/supabase/guard.test.ts`
Expected: FAIL — `Failed to resolve import "./guard"` / `unwrap is not defined` (module not created yet).

- [ ] **Step 3: Create `lib/supabase/guard.ts`**

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
 * - error set    → console.error(context, error) then throw DataAccessError
 * - otherwise    → return data (null = "no rows" for a maybeSingle read)
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

/** Build a generic 500 JSON response with the given (CORS) headers. */
export function dbErrorToResponse(
  headers: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500, headers }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/supabase/guard.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Typecheck + lint the new files**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint lib/supabase/guard.ts lib/supabase/guard.test.ts`
Expected: exit 0, zero problems.

- [ ] **Step 6: Commit** *(only with user go-ahead — see Git policy)*

```bash
git add lib/supabase/guard.ts lib/supabase/guard.test.ts
git commit -m "feat(guard): add Supabase unwrap/DataAccessError/dbErrorToResponse"
```

---

### Task 2: Harden `api/clubs/[slug]/route.ts` (TDD with mock)

**Files:**
- Create: `app/api/clubs/[slug]/route.test.ts`
- Modify: `app/api/clubs/[slug]/route.ts`

- [ ] **Step 1: Write the failing tests** — create `app/api/clubs/[slug]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

type QueryResult = { data: unknown; error: PostgrestError | null };

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (
    onF: (v: QueryResult) => unknown,
    onR?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(onF, onR);
  return chain;
}

function makeSupabase(byTable: Record<string, QueryResult>) {
  return {
    from: (t: string) => makeChain(byTable[t] ?? { data: null, error: null }),
  };
}

const pgError = { message: "boom", code: "XX000" } as unknown as PostgrestError;
const club = {
  id: "c1",
  slug: "abc",
  short_name: "ABC",
  full_name: "ABC Swim Club",
  logo_url: null,
};
const list = { slug: "scm-male", title: "SCM Male", course_type: "SCM", gender: "male" };

function mockDb(byTable: Record<string, QueryResult>) {
  vi.mocked(createClient).mockResolvedValue(
    makeSupabase(byTable) as unknown as Awaited<ReturnType<typeof createClient>>
  );
}

const call = () =>
  GET(new NextRequest("http://t/api/clubs/abc"), {
    params: Promise.resolve({ slug: "abc" }),
  });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/clubs/[slug]", () => {
  it("returns 404 when the club genuinely does not exist", async () => {
    mockDb({ clubs: { data: null, error: null } });
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Club not found" });
  });

  it("returns 500 + generic error on a DB failure (not 404)", async () => {
    mockDb({ clubs: { data: null, error: pgError } });
    const res = await call();
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("returns 200 with the existing shape on success", async () => {
    mockDb({
      clubs: { data: club, error: null },
      record_lists: { data: [list], error: null },
    });
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe("abc");
    expect(body.short_name).toBe("ABC");
    expect(body.record_lists).toEqual([
      { slug: "scm-male", title: "SCM Male", course_type: "SCM", gender: "male" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/api/clubs/[slug]/route.test.ts"`
Expected: FAIL — the DB-failure test gets **404** (current code treats `error` as "not found"), expected **500**. (The 404 and success tests may already pass against `.single()`.)

- [ ] **Step 3: Rewrite `app/api/clubs/[slug]/route.ts`** to exactly:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unwrap, dbErrorToResponse } from "@/lib/supabase/guard";
import type { Club, RecordList } from "@/types/database";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const supabase = await createClient();

    const club = unwrap<Club>(
      await supabase.from("clubs").select("*").eq("slug", slug).maybeSingle(),
      `clubs: slug=${slug}`
    );

    if (!club) {
      return NextResponse.json(
        { error: "Club not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const lists =
      unwrap<RecordList[]>(
        await supabase
          .from("record_lists")
          .select("*")
          .eq("club_id", club.id)
          .order("created_at", { ascending: true }),
        `record_lists: club_id=${club.id}`
      ) ?? [];

    return NextResponse.json(
      {
        slug: club.slug,
        short_name: club.short_name,
        full_name: club.full_name,
        logo_url: club.logo_url,
        record_lists: lists.map((l) => ({
          slug: l.slug,
          title: l.title,
          course_type: l.course_type,
          gender: l.gender,
        })),
      },
      { headers: corsHeaders }
    );
  } catch {
    return dbErrorToResponse(corsHeaders);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/api/clubs/[slug]/route.test.ts"`
Expected: PASS — all 3 tests green (DB-failure now 500).

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint "app/api/clubs/[slug]/route.ts" "app/api/clubs/[slug]/route.test.ts"`
Expected: zero problems.

- [ ] **Step 6: Commit** *(only with user go-ahead)*

```bash
git add "app/api/clubs/[slug]/route.ts" "app/api/clubs/[slug]/route.test.ts"
git commit -m "fix(api): clubs/[slug] returns 500 on DB error, 404 only when missing"
```

---

### Task 3: Harden `api/clubs/[slug]/records/route.ts` (TDD with mock)

**Files:**
- Create: `app/api/clubs/[slug]/records/route.test.ts`
- Modify: `app/api/clubs/[slug]/records/route.ts`

- [ ] **Step 1: Write the failing tests** — create `app/api/clubs/[slug]/records/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

type QueryResult = { data: unknown; error: PostgrestError | null };

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (
    onF: (v: QueryResult) => unknown,
    onR?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(onF, onR);
  return chain;
}

function makeSupabase(byTable: Record<string, QueryResult>) {
  return {
    from: (t: string) => makeChain(byTable[t] ?? { data: null, error: null }),
  };
}

const pgError = { message: "boom", code: "XX000" } as unknown as PostgrestError;
const club = { id: "c1", slug: "abc", short_name: "ABC" };
const list = {
  id: "l1",
  slug: "scm-male",
  title: "SCM Male",
  course_type: "SCM",
  gender: "male",
};
const record = {
  id: "r1",
  event_name: "50 Free",
  swimmer_name: "A",
  time_ms: 24560,
  record_date: "2024-01-01",
  location: null,
  is_current: true,
  superseded_by: null,
  is_national: false,
  is_current_national: false,
  is_provincial: false,
  is_current_provincial: false,
  is_split: false,
  is_relay_split: false,
  is_new: false,
  is_world_record: false,
};

function mockDb(byTable: Record<string, QueryResult>) {
  vi.mocked(createClient).mockResolvedValue(
    makeSupabase(byTable) as unknown as Awaited<ReturnType<typeof createClient>>
  );
}

const call = () =>
  GET(new NextRequest("http://t/api/clubs/abc/records"), {
    params: Promise.resolve({ slug: "abc" }),
  });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/clubs/[slug]/records", () => {
  it("returns 404 when the club genuinely does not exist", async () => {
    mockDb({ clubs: { data: null, error: null } });
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Club not found" });
  });

  it("returns 500 + generic error on a DB failure (not 404)", async () => {
    mockDb({ clubs: { data: null, error: pgError } });
    const res = await call();
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("returns 500 when the records query fails", async () => {
    mockDb({
      clubs: { data: club, error: null },
      record_lists: { data: list, error: null },
      records: { data: null, error: pgError },
    });
    const res = await call();
    expect(res.status).toBe(500);
  });

  it("returns 200 with the existing shape on success", async () => {
    mockDb({
      clubs: { data: club, error: null },
      record_lists: { data: list, error: null },
      records: { data: [record], error: null },
    });
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.club_slug).toBe("abc");
    expect(body.club_name).toBe("ABC");
    expect(body.list.slug).toBe("scm-male");
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.records[0].time_formatted).toBe("24.56");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/api/clubs/[slug]/records/route.test.ts"`
Expected: FAIL — the two DB-failure tests get 404/200 under current `.single()` code, expected 500.

- [ ] **Step 3: Rewrite `app/api/clubs/[slug]/records/route.ts`** to exactly:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unwrap, dbErrorToResponse } from "@/lib/supabase/guard";
import { formatMsToTime } from "@/lib/time-utils";
import type { Club, RecordList, SwimRecord } from "@/types/database";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function formatRecord(r: SwimRecord) {
  return {
    event_name: r.event_name,
    swimmer_name: r.swimmer_name,
    time_ms: r.time_ms,
    time_formatted: r.time_ms > 0 ? formatMsToTime(r.time_ms) : "",
    record_date: r.record_date,
    location: r.location,
    flags: {
      is_national: r.is_national,
      is_current_national: r.is_current_national,
      is_provincial: r.is_provincial,
      is_current_provincial: r.is_current_provincial,
      is_split: r.is_split,
      is_relay_split: r.is_relay_split,
      is_new: r.is_new,
      is_world_record: r.is_world_record,
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const listSlug = request.nextUrl.searchParams.get("list");

  try {
    const supabase = await createClient();

    const club = unwrap<Club>(
      await supabase.from("clubs").select("*").eq("slug", slug).maybeSingle(),
      `clubs: slug=${slug}`
    );

    if (!club) {
      return NextResponse.json(
        { error: "Club not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const recordList = unwrap<RecordList>(
      listSlug
        ? await supabase
            .from("record_lists")
            .select("*")
            .eq("club_id", club.id)
            .eq("slug", listSlug)
            .maybeSingle()
        : await supabase
            .from("record_lists")
            .select("*")
            .eq("club_id", club.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
      `record_lists: club_id=${club.id} list=${listSlug ?? "(default)"}`
    );

    if (!recordList) {
      return NextResponse.json(
        { error: "Record list not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const records =
      unwrap<SwimRecord[]>(
        await supabase
          .from("records")
          .select("*")
          .eq("record_list_id", recordList.id)
          .order("sort_order", { ascending: true }),
        `records: record_list_id=${recordList.id}`
      ) ?? [];

    const currentRecords = records.filter((r) => r.is_current !== false);
    const historyRecords = records.filter((r) => r.is_current === false);

    const historyByRecordId = new Map<string, SwimRecord[]>();
    for (const hr of historyRecords) {
      if (hr.superseded_by) {
        const existing = historyByRecordId.get(hr.superseded_by) || [];
        existing.push(hr);
        historyByRecordId.set(hr.superseded_by, existing);
      }
    }

    historyByRecordId.forEach((recs) => {
      recs.sort((a, b) => {
        if (!a.record_date && !b.record_date) return 0;
        if (!a.record_date) return 1;
        if (!b.record_date) return -1;
        return b.record_date.localeCompare(a.record_date);
      });
    });

    const responseRecords = currentRecords.map((r) => ({
      ...formatRecord(r),
      history: (historyByRecordId.get(r.id) || []).map(formatRecord),
    }));

    return NextResponse.json(
      {
        club_slug: club.slug,
        club_name: club.short_name,
        list: {
          slug: recordList.slug,
          title: recordList.title,
          course_type: recordList.course_type,
          gender: recordList.gender,
        },
        records: responseRecords,
      },
      { headers: corsHeaders }
    );
  } catch {
    return dbErrorToResponse(corsHeaders);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/api/clubs/[slug]/records/route.test.ts"`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint "app/api/clubs/[slug]/records/route.ts" "app/api/clubs/[slug]/records/route.test.ts"`
Expected: zero problems.

- [ ] **Step 6: Commit** *(only with user go-ahead)*

```bash
git add "app/api/clubs/[slug]/records/route.ts" "app/api/clubs/[slug]/records/route.test.ts"
git commit -m "fix(api): clubs/[slug]/records returns 500 on DB error, 404 only when missing"
```

---

### Task 4: Migrate public RSC reads to `unwrap` (4 files)

No unit tests (RSC; logic is the guard's, already tested in Task 1 — see spec §5). Verification is `tsc --noEmit` + lint + the existing suite staying green. Apply each edit exactly.

**Files:**
- Modify: `app/[clubSlug]/layout.tsx`
- Modify: `app/[clubSlug]/page.tsx`
- Modify: `app/[clubSlug]/[recordSlug]/page.tsx`
- Modify: `app/embed/[clubSlug]/page.tsx`

- [ ] **Step 1: `app/[clubSlug]/layout.tsx`** — add the import and replace the club query block.

Add after the existing `createClient` import line:
```ts
import { unwrap } from "@/lib/supabase/guard";
```
Replace:
```ts
  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", clubSlug)
    .single();

  if (!club) {
    notFound();
  }

  const typedClub = club as Club;
```
with:
```ts
  const club = unwrap<Club>(
    await supabase.from("clubs").select("*").eq("slug", clubSlug).maybeSingle(),
    `clubs: slug=${clubSlug}`
  );

  if (!club) {
    notFound();
  }

  const typedClub = club;
```

- [ ] **Step 2: `app/[clubSlug]/page.tsx`** — add `import { unwrap } from "@/lib/supabase/guard";` after the `createClient` import.

In `generateMetadata`, replace:
```ts
  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", clubSlug)
    .single();

  if (!club) {
    return { title: "Club Not Found" };
  }

  return {
    title: `${(club as Club).full_name} - Club Records`,
    description: `View club records for ${(club as Club).full_name}`,
  };
```
with (metadata must never throw — local try/catch swallows the DataAccessError; `unwrap` already logged it):
```ts
  try {
    const club = unwrap<Club>(
      await supabase
        .from("clubs")
        .select("*")
        .eq("slug", clubSlug)
        .maybeSingle(),
      `clubs(meta): slug=${clubSlug}`
    );

    if (!club) {
      return { title: "Club Not Found" };
    }

    return {
      title: `${club.full_name} - Club Records`,
      description: `View club records for ${club.full_name}`,
    };
  } catch {
    return { title: "Club Records" };
  }
```

In `ClubPage`, replace:
```ts
  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", clubSlug)
    .single();

  if (!club) {
    notFound();
  }

  const typedClub = club as Club;

  const { data: recordLists } = await supabase
    .from("record_lists")
    .select("*, records(count)")
    .eq("club_id", typedClub.id)
    .order("title", { ascending: true });

  const typedLists = (recordLists || []) as (RecordList & {
    records: { count: number }[];
  })[];
```
with:
```ts
  const club = unwrap<Club>(
    await supabase.from("clubs").select("*").eq("slug", clubSlug).maybeSingle(),
    `clubs: slug=${clubSlug}`
  );

  if (!club) {
    notFound();
  }

  const typedClub = club;

  const typedLists =
    unwrap<(RecordList & { records: { count: number }[] })[]>(
      await supabase
        .from("record_lists")
        .select("*, records(count)")
        .eq("club_id", typedClub.id)
        .order("title", { ascending: true }),
      `record_lists: club_id=${typedClub.id}`
    ) ?? [];
```
Then replace:
```ts
  const { data: defaultRecordsData } = await supabase
    .from("records")
    .select("*")
    .eq("record_list_id", defaultList.id)
    .order("sort_order", { ascending: true });

  const defaultRecords = (defaultRecordsData || []) as SwimRecord[];
```
with:
```ts
  const defaultRecords =
    unwrap<SwimRecord[]>(
      await supabase
        .from("records")
        .select("*")
        .eq("record_list_id", defaultList.id)
        .order("sort_order", { ascending: true }),
      `records: record_list_id=${defaultList.id}`
    ) ?? [];
```

- [ ] **Step 3: `app/[clubSlug]/[recordSlug]/page.tsx`** — add `import { unwrap } from "@/lib/supabase/guard";` after the `createClient` import.

In `generateMetadata`, replace the whole body after `const supabase = await createClient();` (the two `.single()` blocks and the returns) with:
```ts
  try {
    const club = unwrap<Club>(
      await supabase
        .from("clubs")
        .select("*")
        .eq("slug", clubSlug)
        .maybeSingle(),
      `clubs(meta): slug=${clubSlug}`
    );

    if (!club) {
      return { title: "Not Found" };
    }

    const recordList = unwrap<RecordList>(
      await supabase
        .from("record_lists")
        .select("*")
        .eq("club_id", club.id)
        .eq("slug", recordSlug)
        .maybeSingle(),
      `record_lists(meta): club_id=${club.id} slug=${recordSlug}`
    );

    if (!recordList) {
      return { title: "Not Found" };
    }

    return {
      title: `${recordList.title} - ${club.short_name} Club Records`,
      description: `${recordList.title} records for ${club.full_name}`,
    };
  } catch {
    return { title: "Club Records" };
  }
```

In `RecordPage`, replace:
```ts
  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", clubSlug)
    .single();

  if (!club) {
    notFound();
  }

  const typedClub = club as Club;

  const { data: recordList } = await supabase
    .from("record_lists")
    .select("*")
    .eq("club_id", typedClub.id)
    .eq("slug", recordSlug)
    .single();

  if (!recordList) {
    notFound();
  }

  const typedRecordList = recordList as RecordList;

  const { data: records } = await supabase
    .from("records")
    .select("*")
    .eq("record_list_id", typedRecordList.id)
    .order("sort_order", { ascending: true });

  const typedRecords = (records || []) as SwimRecord[];
```
with:
```ts
  const club = unwrap<Club>(
    await supabase.from("clubs").select("*").eq("slug", clubSlug).maybeSingle(),
    `clubs: slug=${clubSlug}`
  );

  if (!club) {
    notFound();
  }

  const typedClub = club;

  const typedRecordList = unwrap<RecordList>(
    await supabase
      .from("record_lists")
      .select("*")
      .eq("club_id", typedClub.id)
      .eq("slug", recordSlug)
      .maybeSingle(),
    `record_lists: club_id=${typedClub.id} slug=${recordSlug}`
  );

  if (!typedRecordList) {
    notFound();
  }

  const typedRecords =
    unwrap<SwimRecord[]>(
      await supabase
        .from("records")
        .select("*")
        .eq("record_list_id", typedRecordList.id)
        .order("sort_order", { ascending: true }),
      `records: record_list_id=${typedRecordList.id}`
    ) ?? [];
```

- [ ] **Step 4: `app/embed/[clubSlug]/page.tsx`** — add `import { unwrap } from "@/lib/supabase/guard";` after the `createClient` import.

Replace:
```ts
  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", clubSlug)
    .single();

  if (!club) {
    notFound();
  }

  const typedClub = club as Club;

  // Find the requested list, or default to the first one
  let recordList: RecordList | null = null;

  if (listSlug) {
    const { data } = await supabase
      .from("record_lists")
      .select("*")
      .eq("club_id", typedClub.id)
      .eq("slug", listSlug)
      .single();
    recordList = data as RecordList | null;
  } else {
    const { data } = await supabase
      .from("record_lists")
      .select("*")
      .eq("club_id", typedClub.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    recordList = data as RecordList | null;
  }

  if (!recordList) {
    notFound();
  }

  const { data: records } = await supabase
    .from("records")
    .select("*")
    .eq("record_list_id", recordList.id)
    .order("sort_order", { ascending: true });

  const typedRecords = (records || []) as SwimRecord[];
```
with:
```ts
  const typedClub = unwrap<Club>(
    await supabase.from("clubs").select("*").eq("slug", clubSlug).maybeSingle(),
    `clubs: slug=${clubSlug}`
  );

  if (!typedClub) {
    notFound();
  }

  const recordList = unwrap<RecordList>(
    listSlug
      ? await supabase
          .from("record_lists")
          .select("*")
          .eq("club_id", typedClub.id)
          .eq("slug", listSlug)
          .maybeSingle()
      : await supabase
          .from("record_lists")
          .select("*")
          .eq("club_id", typedClub.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
    `record_lists: club_id=${typedClub.id} list=${listSlug ?? "(default)"}`
  );

  if (!recordList) {
    notFound();
  }

  const typedRecords =
    unwrap<SwimRecord[]>(
      await supabase
        .from("records")
        .select("*")
        .eq("record_list_id", recordList.id)
        .order("sort_order", { ascending: true }),
      `records: record_list_id=${recordList.id}`
    ) ?? [];
```
(The rest of the file already references `recordList` and `typedRecords` — unchanged.)

- [ ] **Step 5: Typecheck + lint + suite**

Run: `npx tsc --noEmit`
Expected: exit 0 (no unused `RecordList`/`Club` import errors — they are still used as `unwrap` type args).
Run: `npx eslint "app/[clubSlug]/layout.tsx" "app/[clubSlug]/page.tsx" "app/[clubSlug]/[recordSlug]/page.tsx" "app/embed/[clubSlug]/page.tsx"`
Expected: zero NEW problems from these files.
Run: `npm test`
Expected: full suite still green.

- [ ] **Step 6: Commit** *(only with user go-ahead)*

```bash
git add "app/[clubSlug]/layout.tsx" "app/[clubSlug]/page.tsx" "app/[clubSlug]/[recordSlug]/page.tsx" "app/embed/[clubSlug]/page.tsx"
git commit -m "fix(public): route RSC reads through unwrap; throw on DB error, notFound only when missing"
```

---

### Task 5: Error boundaries

No unit tests (thin client boundary components — spec §5). Verify via tsc + lint.

**Files:**
- Create: `app/error.tsx`
- Create: `app/[clubSlug]/error.tsx`

- [ ] **Step 1: Create `app/error.tsx`**

```tsx
"use client";

export default function GlobalRouteError({
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
        We couldn&apos;t load this page right now. Please try again.
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

- [ ] **Step 2: Create `app/[clubSlug]/error.tsx`**

```tsx
"use client";

export default function ClubError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
        Records temporarily unavailable
      </h1>
      <p className="mb-6 text-gray-500 dark:text-gray-400">
        We hit a problem loading these records. Please try again in a moment.
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

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint app/error.tsx "app/[clubSlug]/error.tsx"`
Expected: zero problems. (`error` appears only in the prop *type* and is deliberately not destructured — only `reset` is bound — so there is no unused-variable to flag. The type still documents the full Next.js boundary signature `{ error, reset }`.)

- [ ] **Step 4: Commit** *(only with user go-ahead)*

```bash
git add app/error.tsx "app/[clubSlug]/error.tsx"
git commit -m "feat(public): add route error boundaries with retry"
```

---

### Task 6: Client error UI in `ClubRecordBrowser`

No unit test (client component; React Testing Library is not set up — deferred to sub-project D per spec §5). Verify via tsc + lint.

**Files:**
- Modify: `app/[clubSlug]/ClubRecordBrowser.tsx`

- [ ] **Step 1: Add a `loadError` state**

Replace:
```ts
  const [loading, setLoading] = useState(false);
```
with:
```ts
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
```

- [ ] **Step 2: Handle the fetch error in `handleListChange`**

Replace:
```ts
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("records")
      .select("*")
      .eq("record_list_id", listId)
      .order("sort_order", { ascending: true });

    setRecords((data as SwimRecord[]) || []);
    setLoading(false);
```
with:
```ts
    setLoading(true);
    setLoadError(false);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("records")
      .select("*")
      .eq("record_list_id", listId)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error(`[data-access] records: record_list_id=${listId}`, error);
      setLoadError(true);
      setLoading(false);
      return;
    }

    setRecords((data as SwimRecord[]) || []);
    setLoading(false);
```

- [ ] **Step 3: Render the inline retry block**

Replace:
```tsx
      {loading ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
          <p className="text-gray-500 dark:text-gray-400">
            Loading records...
          </p>
        </div>
      ) : (
        <PublicRecordSearch
          records={records}
          recordType={selectedList?.record_type ?? "individual"}
          scope={selectedList?.scope ?? "club"}
        />
      )}
```
with:
```tsx
      {loadError ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
          <p className="mb-4 text-gray-500 dark:text-gray-400">
            Couldn&apos;t load that list. Please try again.
          </p>
          <button
            onClick={() => handleListChange(selectedListId)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
          <p className="text-gray-500 dark:text-gray-400">
            Loading records...
          </p>
        </div>
      ) : (
        <PublicRecordSearch
          records={records}
          recordType={selectedList?.record_type ?? "individual"}
          scope={selectedList?.scope ?? "club"}
        />
      )}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint "app/[clubSlug]/ClubRecordBrowser.tsx"`
Expected: zero NEW problems.

- [ ] **Step 5: Commit** *(only with user go-ahead)*

```bash
git add "app/[clubSlug]/ClubRecordBrowser.tsx"
git commit -m "fix(public): show inline retry instead of empty table on client fetch error"
```

---

### Task 7: Final verification + TECH_DEBT.md update

**Files:**
- Modify: `TECH_DEBT.md`

> Housekeeping beyond spec §6's code list: the spec's scope list covered code changes; updating the debt ledger when its item is addressed is the ledger's purpose. Kept minimal.

- [ ] **Step 1: Full verification**

Run: `npm test`
Expected: green — existing 26 + `lib/supabase/guard.test.ts` + the 2 API route test suites all pass.
Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npm run lint`
Expected: only the documented pre-existing 7 errors + 6 warnings; no new problems from any file touched by this plan.

- [ ] **Step 2: Update `TECH_DEBT.md`**

In the `## Done` section, append:
```markdown
- [x] **Swallowed Supabase errors (public path)** — `lib/supabase/guard.ts`
  (`unwrap`/`DataAccessError`/`dbErrorToResponse`); public API routes return
  500 on DB error (404 only when genuinely missing), public pages throw to new
  `error.tsx` boundaries, `ClubRecordBrowser` shows an inline retry. Reusable
  guard pattern for sub-projects B/C.
```
In the `## High` section, replace the line:
```markdown
- [ ] **Swallowed Supabase errors in `app/api/clubs/[slug]/records/route.ts`**
  — query `.error` is never checked, so a DB failure returns 404/empty instead
  of 5xx, masking outages and corrupting the public view.
```
with:
```markdown
- [ ] **Near-absent error handling — dashboard/admin/auth (remaining)** — the
  public path is now hardened via `lib/supabase/guard.ts` (see Done); the
  ~30 unchecked Supabase calls in dashboard/admin/layout/auth still swallow
  errors. Apply the guard pattern there (tech-debt sub-project C).
```
(The original generic "Near-absent error handling — only ~2 files use try/catch" line stays; this replaced line now scopes the *remaining* work and points at the guard pattern.)

- [ ] **Step 3: Confirm acceptance criteria** (spec "Acceptance criteria" 1–6) — verify each holds; note any deviation.

- [ ] **Step 4: Commit** *(only with user go-ahead)*

```bash
git add TECH_DEBT.md
git commit -m "docs: mark public-path error handling done in TECH_DEBT"
```

---

## Self-Review

**Spec coverage:** §1 guard → Task 1. §2 server path: API routes → Tasks 2–3 (with regression-pinning tests), RSC/layout + `generateMetadata` no-throw rule → Task 4. §3 boundaries → Task 5. §4 client → Task 6. §5 testing → Tasks 1–3 (guard + 2 API suites); RSC/boundary/client explicitly not unit-tested per spec. §6 scope honored; TECH_DEBT.md update in Task 7 is flagged as deliberate housekeeping beyond the code list. Acceptance criteria 1–6 → Task 7 Step 3. No gaps.

**Placeholder scan:** No TBD/"handle errors"/vague steps; every code step shows complete code; every command has an expected result. The `eslint` note in Task 5 Step 3 gives a concrete fallback (`_error`) rather than leaving it open.

**Type/name consistency:** `unwrap<T>`, `DataAccessError`, `dbErrorToResponse(headers)` signatures are identical across Tasks 1–4. `unwrap` returns `T | null`; every call site handles `null` (`if (!x) notFound()/404`) or coalesces array reads with `?? []`. Generic type args (`Club`, `RecordList`, `SwimRecord`, `RecordList & { records: { count: number }[] }`) match `types/database.ts` usage in the original files, so the previously-imported types remain used (no new unused-import lint errors). Mock factory (`makeChain`/`makeSupabase`) is identical and self-contained in both API test files (intentional duplication — kept per-file rather than adding an unlisted shared module, since the spec scope was explicit; ~18 lines, acceptable).
