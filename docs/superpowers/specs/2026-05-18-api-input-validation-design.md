# Design: API input validation (Tech-debt High, sub-project B)

**Date:** 2026-05-18
**Status:** Approved
**Topic:** Validate untrusted request bodies at the two admin API trust
boundaries with zod, so malformed/garbage input is a structured 400 — not an
uncaught 500 or a corrupt service-role DB insert.

## Context / problem

Two admin POST routes parse the request body with no runtime validation:

- `app/api/admin/upload/route.ts` — `const body: UploadRequest = await
  request.json()` (a *lying* cast). Only `if (!clubId || !title || !slug ||
  !records)` is checked. `courseType`, `gender`, `recordType`, and the entire
  **nested `records[]` array** are then mapped straight into a
  `createAdminClient()` (service-role, RLS-bypassing) insert. A typo'd
  `courseType`, a `time_ms` that is a string/NaN, or a non-boolean flag is
  written to the DB unchecked.
- `app/api/admin/club-level/route.ts` — `const body: ClubLevelRequest = await
  request.json()`; thin hand check (`clubId` truthy + `level` in a list);
  `province` unchecked.

Both call `await request.json()` with no try/catch, so a malformed JSON body
is an uncaught **500** instead of a 400. This is TECH_DEBT High item
"No input validation at trust boundaries".

The third originally-listed surface — `app/api/clubs/[slug]/records` `?list=`
— is a single optional slug already used safely via parameterized `.eq()`;
a schema there is near-zero value and is **out of scope** (YAGNI).

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Validation mechanism | Add **zod** as a direct dependency; schema per route, parsed at the boundary |
| D2 | Surfaces | The **two admin POST routes** + malformed-JSON→400 on both. `?list=` excluded |
| D3 | 400 contract | `{ error: "Validation failed", issues: [{ path, message }] }` from zod issues (full structured, incl. `records[]` array-index paths) |
| D4 | Reuse shape | A shared `parseJsonBody` helper returning a discriminated result (returns a `Response`, not a throw — correct for API routes; mirrors A's `dbErrorToResponse` philosophy) |

## Design

### §1. `lib/validation/parse.ts` (new)

```ts
import { NextResponse } from "next/server";
import { z } from "zod";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * Read+validate a JSON request body against a zod schema.
 * - body not valid JSON → 400 { error: "Invalid JSON body" }
 * - schema failure       → 400 { error: "Validation failed", issues: [...] }
 * - success              → { ok: true, data } (typed via z.infer)
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.map(String).join("."),
      message: i.message,
    }));
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Validation failed", issues },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: result.data };
}
```

Notes: `i.path.map(String).join(".")` yields `records.3.time_ms` for nested
array errors (the admin sees exactly which CSV row/field is bad). Returning a
`Response` (not throwing) is the natural API control flow and is consistent
with sub-project A's `dbErrorToResponse`.

### §2. Schemas (co-located, independently testable)

**`app/api/admin/club-level/schema.ts` (new)**
```ts
import { z } from "zod";

export const clubLevelSchema = z.object({
  clubId: z.string().min(1),
  level: z.enum(["regular", "provincial", "national"]),
  province: z.string().nullable().optional(),
});

export type ClubLevelInput = z.infer<typeof clubLevelSchema>;
```

**`app/api/admin/upload/schema.ts` (new)**
```ts
import { z } from "zod";

const recordSchema = z.object({
  event_name: z.string(),
  time_ms: z.number().int().nonnegative(),
  swimmer_name: z.string(),
  swimmer_name_2: z.string().nullable(),
  swimmer_name_3: z.string().nullable(),
  swimmer_name_4: z.string().nullable(),
  age_group: z.string().nullable(),
  record_club: z.string().nullable(),
  province: z.string().nullable(),
  record_date: z.string().nullable(),
  location: z.string().nullable(),
  is_national: z.boolean(),
  is_current_national: z.boolean(),
  is_provincial: z.boolean(),
  is_current_provincial: z.boolean(),
  is_split: z.boolean(),
  is_relay_split: z.boolean(),
  is_new: z.boolean(),
});

export const uploadSchema = z.object({
  clubId: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  courseType: z.enum(["LCM", "SCM", "SCY"]),
  gender: z.enum(["male", "female", "mixed"]).nullish(),
  recordType: z
    .enum(["individual", "relay"])
    .nullish()
    .transform((v) => v ?? "individual"),
  records: z.array(recordSchema),
});

export type UploadInput = z.infer<typeof uploadSchema>;
```

**Design rules (explicit, to avoid regressing working uploads):**
- Validate **shape/type to reject garbage; do not tighten domain ranges**
  beyond today's behavior. `z.number()` already rejects `NaN`; `.int()` is
  safe because `parseTimeToMs` returns `Math.round(...)`; `.nonnegative()`
  matches `parseTimeToMs`'s `>= 0`. Strings are type-only (`z.string()`, no
  `.min(1)` on `event_name`/`swimmer_name`) — the current code does not
  reject empty strings there.
- `records: z.array(recordSchema)` allows `[]` — the current `!records`
  check also permits an empty array; not changing that.
- `recordType` uses `.nullish().transform(v => v ?? "individual")` to exactly
  reproduce the current `record_type: recordType ?? "individual"` (covers
  omitted **and** explicit null). `gender` uses `.nullish()` to match
  `gender: gender ?? null` (omitted/null both → handled downstream).
- `recordSchema` mirrors **only the fields the upload route reads off each
  record**. It deliberately **omits `sort_order`** (route overrides with the
  array index) and `is_world_record` (this route never inserts it). zod's
  default object behavior **strips unknown keys**, so a CSVUploader payload
  carrying `sort_order`/`is_world_record` validates fine (extra keys dropped).
- Adding the `courseType` / `level` enums is *new* validation the routes
  lacked; this is the intended hardening, not a regression (the admin UI only
  ever emits the allowed values; the DB columns already constrain them).
- The hand-rolled `interface UploadRequest`, `interface RecordData`, and
  `interface ClubLevelRequest` are **deleted**; route code uses
  `z.infer`-derived types (single source of truth).

### §3. Route wiring

Both routes keep their existing **auth ordering**: the `401 Unauthorized`
(no `user`) and `403 Forbidden` (`user.email !== ADMIN_EMAIL`) checks run
**before** body parsing, so validation detail is never returned to anon/
non-admin callers and no body is parsed for them.

- `app/api/admin/upload/route.ts`: replace
  `const body: UploadRequest = await request.json(); const { … } = body; if
  (!clubId || !title || !slug || !records) 400` with:
  ```ts
  const parsed = await parseJsonBody(request, uploadSchema);
  if (!parsed.ok) return parsed.response;
  const { clubId, title, slug, courseType, gender, recordType, records } =
    parsed.data;
  ```
  Everything after (scope derivation via `scopeForClubLevel`, the
  `record_lists` insert, the `records` insert with `sort_order: idx`, and the
  existing Supabase `error` handling) is unchanged. The pre-existing
  `record_type: recordType ?? "individual"` line stays as-is — now harmlessly
  redundant since the schema guarantees `recordType` is `"individual"|"relay"`
  (not changing unrelated lines keeps the diff minimal; the admin routes'
  Supabase `error` handling is sub-project C's concern, not B's).
- `app/api/admin/club-level/route.ts`: replace the `await request.json()` +
  hand check with `parseJsonBody(request, clubLevelSchema)`; use
  `parsed.data` for `{ clubId, level, province }`. Downstream update +
  Supabase error handling unchanged.

### §4. Testing (zod schemas + helper are pure → Vitest, no Supabase)

- `lib/validation/parse.test.ts`: malformed JSON → `ok:false`, 400,
  `{error:"Invalid JSON body"}`; schema failure → `ok:false`, 400,
  `{error:"Validation failed"}` with at least one `{path,message}` and a
  nested array case asserting `path === "records.0.time_ms"`; success →
  `ok:true` with the parsed/typed data (incl. `recordType` defaulted).
- `app/api/admin/upload/schema.test.ts`: a representative valid payload
  passes; targeted failures with expected `path` — bad `courseType`,
  `time_ms` as string and as `NaN`, missing `clubId`, a non-boolean flag,
  `records` not an array, a bad field inside `records[2]`. No-regression
  pins: `recordType` omitted → `"individual"`; explicit `recordType:null` →
  `"individual"`; `gender` omitted → allowed; `records: []` → passes; a
  payload with extra `sort_order`/`is_world_record` → passes (keys stripped).
- `app/api/admin/club-level/schema.test.ts`: valid passes; bad `level`,
  missing `clubId`, non-string `province` fail; `province` omitted → passes.
- Route integration tests (`upload/route.test.ts`,
  `club-level/route.test.ts`) using the sub-project-A pattern
  (`vi.mock("@/lib/supabase/server")`, and mocking `@/lib/supabase/admin`'s
  `createAdminClient` + `supabase.auth.getUser`): (a) no user → **401**, body
  never parsed; (b) wrong email → **403**; (c) admin + malformed JSON →
  **400 `Invalid JSON body`**; (d) admin + schema-invalid body → **400
  `Validation failed`**; (e) admin + valid body → reaches the mocked DB
  layer and returns the existing success JSON (`{ success, listId,
  recordCount }` / `{ ok: true }`). This pins the auth→validate→act ordering
  and that bad input is now a 400, not a 500 — it tests B's own change.
- Full Vitest suite stays green; `tsc --noEmit` exit 0; lint adds no new
  problems (pre-existing app lint debt unchanged, still non-blocking in CI).

### §5. Dependency

`npm install zod` → add to `dependencies` (runs at request time, not dev).
Resolves **zod v4.x** (already present transitively as `zod@4.3.5`, so the
install dedupes cleanly). Schemas use only v4-stable API
(`z.object/enum/array/string/number/boolean`, `.nullable/.nullish/.optional/
.default/.transform`, `schema.safeParse`, `result.error.issues`).

### §6. Scope boundary

**In:** `lib/validation/parse.ts` (+test); `app/api/admin/upload/schema.ts`
& `app/api/admin/club-level/schema.ts` (+tests); wiring both admin routes;
route integration tests for both; the `zod` dependency; deletion of the 3
hand-rolled interfaces.

**Out (other debt items / YAGNI):** the public `?list=` query param;
applying `unwrap`/Supabase-error handling to dashboard/admin reads
(**sub-project C**); any new authn/authz logic; tightening domain ranges
beyond current behavior; structured observability; rate limiting/CORS.

## Acceptance criteria

1. `lib/validation/parse.ts` exports `parseJsonBody` + `ParseResult` per §1;
   `lib/validation/parse.test.ts` covers malformed-JSON / schema-fail /
   success and passes.
2. `uploadSchema` and `clubLevelSchema` exist per §2 with their schema tests
   passing, including every no-regression pin.
3. Both admin routes parse via `parseJsonBody`; auth 401/403 still precede
   parsing; a malformed or schema-invalid body yields the structured **400**
   (not 500); a valid body produces byte-identical success behavior to today
   (regression-pinned by the route tests).
4. The 3 hand-rolled `interface`s are gone; route types derive from
   `z.infer`.
5. `zod` is a direct `dependency`; full Vitest suite green; `tsc --noEmit`
   exit 0; no new lint problems in changed files.

## Notes on git

`docs/` is gitignored (project convention) — this spec is local-only like the
others. Implementation runs on a feature branch with local-only commits;
nothing committed/pushed without an explicit prompt; subagents never push.
