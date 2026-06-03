# API Input Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the two admin POST request bodies with zod so malformed/garbage input is a structured 400 instead of an uncaught 500 or a corrupt service-role DB insert.

**Architecture:** A shared `lib/validation/parse.ts` (`parseJsonBody`) reads `request.json()` (catching malformed JSON), runs `schema.safeParse`, and returns a discriminated result `{ok:true,data} | {ok:false,response}` (returns a Response, not a throw — correct for API routes; mirrors sub-project A's `dbErrorToResponse`). Co-located zod schemas per route; route types come from `z.infer` (deletes the lying `as UploadRequest` casts).

**Tech Stack:** Next.js 16 App Router, TypeScript strict, **zod v4**, Vitest 4, npm. Spec: `docs/superpowers/specs/2026-05-18-api-input-validation-design.md`.

> **⚠️ Git policy (overrides the skill's default commit cadence):** The user controls git tightly. Each task ends with a commit *step*, but **do not run `git commit` or `git push` without the user's explicit go-ahead**. `commit ≠ push`. Subagents **never** push. Repo root **is** `club-record/`; all paths relative to it. Per the user's confirmed workflow: feature branch off `main`, local commits only (subagent-driven-development creates the branch).

> **⚠️ Pre-existing condition:** `npm run lint` fails with 7 errors + 6 warnings in unrelated pre-existing app code (documented in `TECH_DEBT.md`, non-blocking in CI). Verification requires `tsc --noEmit` exit 0, full Vitest suite green, and **no NEW lint problems from changed files** — not an overall-clean lint run. `vitest.config.ts` already globs `lib/**` and `app/**` `*.test.ts` with an `@/` alias (from sub-project A) — do **not** modify it.

---

### Task 1: Add the `zod` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install zod as a runtime dependency**

Run: `npm install zod`
Expected: completes; `package.json` `dependencies` (NOT devDependencies) gains `"zod": "^4.x"`. (zod is already present transitively as `zod@4.3.5`, so the install dedupes cleanly.)

- [ ] **Step 2: Verify the resolved version and that it's a prod dependency**

Run: `node -e "console.log(require('zod/package.json').version)"`
Expected: prints a `4.x.y` version.
Run: `node -e "const p=require('./package.json');console.log('dep:',p.dependencies.zod,'| dev:',p.devDependencies&&p.devDependencies.zod)"`
Expected: `dep: ^4.x.y | dev: undefined`.

- [ ] **Step 3: Confirm the toolchain is still green**

Run: `npx tsc --noEmit && npm test`
Expected: tsc exit 0; full Vitest suite still green (no test count change yet).

- [ ] **Step 4: Commit** *(only with user go-ahead — see Git policy)*

```bash
git add package.json package-lock.json
git commit -m "build: add zod as a runtime dependency"
```

---

### Task 2: `lib/validation/parse.ts` (TDD)

**Files:**
- Create: `lib/validation/parse.ts`
- Create: `lib/validation/parse.test.ts`

- [ ] **Step 1: Write the failing tests** — create `lib/validation/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseJsonBody } from "./parse";

const schema = z.object({
  a: z.string(),
  nested: z.array(z.object({ time_ms: z.number() })),
  mode: z
    .enum(["x", "y"])
    .nullish()
    .transform((v) => v ?? "x"),
});

function req(body: string): Request {
  return new Request("http://t/x", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

describe("parseJsonBody", () => {
  it("returns a 400 'Invalid JSON body' on unparseable JSON", async () => {
    const r = await parseJsonBody(req("{not json"), schema);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.response.status).toBe(400);
    expect(await r.response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns a 400 'Validation failed' with dotted issue paths", async () => {
    const r = await parseJsonBody(
      req(JSON.stringify({ a: 1, nested: [{ time_ms: "bad" }] })),
      schema
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.response.status).toBe(400);
    const body = await r.response.json();
    expect(body.error).toBe("Validation failed");
    const paths = body.issues.map((i: { path: string }) => i.path);
    expect(paths).toContain("a");
    expect(paths).toContain("nested.0.time_ms");
    for (const issue of body.issues) {
      expect(typeof issue.message).toBe("string");
    }
  });

  it("returns ok:true with parsed+typed data (unknown keys stripped, transform applied)", async () => {
    const r = await parseJsonBody(
      req(JSON.stringify({ a: "hi", nested: [], extra: 99 })),
      schema
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected success");
    expect(r.data).toEqual({ a: "hi", nested: [], mode: "x" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/validation/parse.test.ts`
Expected: FAIL — cannot resolve `./parse` / `parseJsonBody is not defined`.

- [ ] **Step 3: Create `lib/validation/parse.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * Read + validate a JSON request body against a zod schema.
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/validation/parse.test.ts`
Expected: PASS — 3/3 green.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint lib/validation/parse.ts lib/validation/parse.test.ts`
Expected: zero problems.

- [ ] **Step 6: Commit** *(only with user go-ahead)*

```bash
git add lib/validation/parse.ts lib/validation/parse.test.ts
git commit -m "feat(validation): add parseJsonBody (zod body parse → 400 or typed data)"
```

---

### Task 3: `app/api/admin/club-level/schema.ts` (TDD)

**Files:**
- Create: `app/api/admin/club-level/schema.ts`
- Create: `app/api/admin/club-level/schema.test.ts`

- [ ] **Step 1: Write the failing tests** — create `app/api/admin/club-level/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clubLevelSchema } from "./schema";

describe("clubLevelSchema", () => {
  it("accepts a valid payload", () => {
    const r = clubLevelSchema.safeParse({
      clubId: "c1",
      level: "provincial",
      province: "ON",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an omitted province", () => {
    const r = clubLevelSchema.safeParse({ clubId: "c1", level: "regular" });
    expect(r.success).toBe(true);
  });

  it("accepts province: null", () => {
    const r = clubLevelSchema.safeParse({
      clubId: "c1",
      level: "national",
      province: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing clubId", () => {
    const r = clubLevelSchema.safeParse({ level: "regular" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty clubId", () => {
    const r = clubLevelSchema.safeParse({ clubId: "", level: "regular" });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid level", () => {
    const r = clubLevelSchema.safeParse({ clubId: "c1", level: "gold" });
    expect(r.success).toBe(false);
  });

  it("rejects a non-string province", () => {
    const r = clubLevelSchema.safeParse({
      clubId: "c1",
      level: "provincial",
      province: 5,
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/admin/club-level/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Create `app/api/admin/club-level/schema.ts`**

```ts
import { z } from "zod";

export const clubLevelSchema = z.object({
  clubId: z.string().min(1),
  level: z.enum(["regular", "provincial", "national"]),
  province: z.string().nullable().optional(),
});

export type ClubLevelInput = z.infer<typeof clubLevelSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/admin/club-level/schema.test.ts`
Expected: PASS — 7/7 green.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint "app/api/admin/club-level/schema.ts" "app/api/admin/club-level/schema.test.ts"`
Expected: zero problems.

- [ ] **Step 6: Commit** *(only with user go-ahead)*

```bash
git add "app/api/admin/club-level/schema.ts" "app/api/admin/club-level/schema.test.ts"
git commit -m "feat(validation): clubLevelSchema for the club-level admin route"
```

---

### Task 4: `app/api/admin/upload/schema.ts` (TDD)

**Files:**
- Create: `app/api/admin/upload/schema.ts`
- Create: `app/api/admin/upload/schema.test.ts`

- [ ] **Step 1: Write the failing tests** — create `app/api/admin/upload/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { uploadSchema } from "./schema";

function record(overrides: Record<string, unknown> = {}) {
  return {
    event_name: "50 Free",
    time_ms: 24560,
    swimmer_name: "A",
    swimmer_name_2: null,
    swimmer_name_3: null,
    swimmer_name_4: null,
    age_group: null,
    record_club: null,
    province: null,
    record_date: null,
    location: null,
    is_national: false,
    is_current_national: false,
    is_provincial: false,
    is_current_provincial: false,
    is_split: false,
    is_relay_split: false,
    is_new: false,
    ...overrides,
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    clubId: "c1",
    title: "SCM Male",
    slug: "scm-male",
    courseType: "SCM",
    gender: "male",
    recordType: "individual",
    records: [record()],
    ...overrides,
  };
}

describe("uploadSchema", () => {
  it("accepts a valid payload", () => {
    expect(uploadSchema.safeParse(payload()).success).toBe(true);
  });

  it("defaults recordType to 'individual' when omitted", () => {
    const p = payload();
    delete (p as Record<string, unknown>).recordType;
    const r = uploadSchema.safeParse(p);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recordType).toBe("individual");
  });

  it("treats recordType: null as 'individual'", () => {
    const r = uploadSchema.safeParse(payload({ recordType: null }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recordType).toBe("individual");
  });

  it("accepts an omitted gender", () => {
    const p = payload();
    delete (p as Record<string, unknown>).gender;
    expect(uploadSchema.safeParse(p).success).toBe(true);
  });

  it("accepts an empty records array (no regression)", () => {
    expect(uploadSchema.safeParse(payload({ records: [] })).success).toBe(true);
  });

  it("strips unknown keys like sort_order / is_world_record", () => {
    const r = uploadSchema.safeParse(
      payload({ records: [record({ sort_order: 7, is_world_record: true })] })
    );
    expect(r.success).toBe(true);
    if (r.success) {
      const rec = r.data.records[0] as Record<string, unknown>;
      expect("sort_order" in rec).toBe(false);
      expect("is_world_record" in rec).toBe(false);
    }
  });

  it("rejects an invalid courseType", () => {
    expect(uploadSchema.safeParse(payload({ courseType: "XXX" })).success).toBe(
      false
    );
  });

  it("rejects a missing clubId", () => {
    const p = payload();
    delete (p as Record<string, unknown>).clubId;
    expect(uploadSchema.safeParse(p).success).toBe(false);
  });

  it("rejects records that is not an array", () => {
    expect(uploadSchema.safeParse(payload({ records: "nope" })).success).toBe(
      false
    );
  });

  it("rejects a string time_ms with a precise path", () => {
    const r = uploadSchema.safeParse(payload({ records: [record({ time_ms: "x" })] }));
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.map(String).join("."));
      expect(paths).toContain("records.0.time_ms");
    }
  });

  it("rejects a NaN time_ms", () => {
    expect(
      uploadSchema.safeParse(payload({ records: [record({ time_ms: NaN })] }))
        .success
    ).toBe(false);
  });

  it("rejects a non-boolean flag", () => {
    expect(
      uploadSchema.safeParse(payload({ records: [record({ is_new: "yes" })] }))
        .success
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/admin/upload/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Create `app/api/admin/upload/schema.ts`**

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/admin/upload/schema.test.ts`
Expected: PASS — all green.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint "app/api/admin/upload/schema.ts" "app/api/admin/upload/schema.test.ts"`
Expected: zero problems.

- [ ] **Step 6: Commit** *(only with user go-ahead)*

```bash
git add "app/api/admin/upload/schema.ts" "app/api/admin/upload/schema.test.ts"
git commit -m "feat(validation): uploadSchema (incl. nested records[]) for the upload route"
```

---

### Task 5: Wire `club-level/route.ts` + route test

**Files:**
- Create: `app/api/admin/club-level/route.test.ts`
- Modify: `app/api/admin/club-level/route.ts`

- [ ] **Step 1: Write the failing route test** — create `app/api/admin/club-level/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

function makeChain(result: { data?: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "insert", "update", "order", "limit"])
    chain[m] = () => chain;
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(f, r);
  return chain;
}

function setup(opts: {
  user: { email: string } | null;
  adminResult?: { error: unknown };
}) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => makeChain(opts.adminResult ?? { error: null }),
  } as unknown as ReturnType<typeof createAdminClient>);
}

function call(body: string) {
  return POST(
    new NextRequest("http://t/api/admin/club-level", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    })
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv("ADMIN_EMAIL", "admin@test.com");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/admin/club-level", () => {
  it("401 when unauthenticated, without parsing the body", async () => {
    setup({ user: null });
    const res = await call("{not json"); // malformed; must NOT be reached
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("403 when the user is not the admin email", async () => {
    setup({ user: { email: "nope@test.com" } });
    const res = await call(JSON.stringify({ clubId: "c1", level: "regular" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("400 'Invalid JSON body' for admin + malformed JSON", async () => {
    setup({ user: { email: "admin@test.com" } });
    const res = await call("{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("400 'Validation failed' for admin + invalid body", async () => {
    setup({ user: { email: "admin@test.com" } });
    const res = await call(JSON.stringify({ clubId: "c1", level: "gold" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("200 { ok: true } for admin + valid body", async () => {
    setup({ user: { email: "admin@test.com" }, adminResult: { error: null } });
    const res = await call(
      JSON.stringify({ clubId: "c1", level: "provincial", province: "ON" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/admin/club-level/route.test.ts`
Expected: FAIL — the malformed-JSON test gets a 500 (current `await request.json()` is uncaught), expected 400; the invalid-body test gets `{error:"Missing or invalid fields"}` not `{error:"Validation failed"}`.

- [ ] **Step 3: Rewrite `app/api/admin/club-level/route.ts`** to exactly:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/validation/parse";
import { clubLevelSchema } from "./schema";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody(request, clubLevelSchema);
  if (!parsed.ok) return parsed.response;
  const { clubId, level, province } = parsed.data;

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("clubs")
    .update({
      level,
      province: level === "provincial" ? (province?.trim() || null) : null,
    })
    .eq("id", clubId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
```

(The `interface ClubLevelRequest` is deleted; the auth checks, the admin update, and the Supabase `error` handling are otherwise unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/admin/club-level/route.test.ts`
Expected: PASS — 5/5 green.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint "app/api/admin/club-level/route.ts" "app/api/admin/club-level/route.test.ts"`
Expected: zero problems.

- [ ] **Step 6: Commit** *(only with user go-ahead)*

```bash
git add "app/api/admin/club-level/route.ts" "app/api/admin/club-level/route.test.ts"
git commit -m "fix(api): validate club-level body with zod (400 not 500 on bad input)"
```

---

### Task 6: Wire `upload/route.ts` + route test

**Files:**
- Create: `app/api/admin/upload/route.test.ts`
- Modify: `app/api/admin/upload/route.ts`

- [ ] **Step 1: Write the failing route test** — create `app/api/admin/upload/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

function makeChain(result: { data?: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "insert", "update", "order", "limit"])
    chain[m] = () => chain;
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(f, r);
  return chain;
}

function setup(opts: {
  user: { email: string } | null;
  byTable?: Record<string, { data?: unknown; error: unknown }>;
}) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  const byTable = opts.byTable ?? {};
  vi.mocked(createAdminClient).mockReturnValue({
    from: (t: string) => makeChain(byTable[t] ?? { data: null, error: null }),
  } as unknown as ReturnType<typeof createAdminClient>);
}

const validRecord = {
  event_name: "50 Free",
  time_ms: 24560,
  swimmer_name: "A",
  swimmer_name_2: null,
  swimmer_name_3: null,
  swimmer_name_4: null,
  age_group: null,
  record_club: null,
  province: null,
  record_date: null,
  location: null,
  is_national: false,
  is_current_national: false,
  is_provincial: false,
  is_current_provincial: false,
  is_split: false,
  is_relay_split: false,
  is_new: false,
};

const validBody = JSON.stringify({
  clubId: "c1",
  title: "SCM Male",
  slug: "scm-male",
  courseType: "SCM",
  gender: "male",
  recordType: "individual",
  records: [validRecord],
});

function call(body: string) {
  return POST(
    new NextRequest("http://t/api/admin/upload", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    })
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv("ADMIN_EMAIL", "admin@test.com");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/admin/upload", () => {
  it("401 when unauthenticated, without parsing the body", async () => {
    setup({ user: null });
    const res = await call("{not json");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("403 when the user is not the admin email", async () => {
    setup({ user: { email: "nope@test.com" } });
    const res = await call(validBody);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("400 'Invalid JSON body' for admin + malformed JSON", async () => {
    setup({ user: { email: "admin@test.com" } });
    const res = await call("{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("400 'Validation failed' for admin + invalid body", async () => {
    setup({ user: { email: "admin@test.com" } });
    const res = await call(
      JSON.stringify({
        clubId: "c1",
        title: "t",
        slug: "s",
        courseType: "XXX",
        records: [],
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("200 success JSON for admin + valid body", async () => {
    setup({
      user: { email: "admin@test.com" },
      byTable: {
        clubs: { data: { level: "regular" }, error: null },
        record_lists: { data: { id: "l1" }, error: null },
        records: { error: null },
      },
    });
    const res = await call(validBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      listId: "l1",
      recordCount: 1,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/admin/upload/route.test.ts`
Expected: FAIL — malformed-JSON test gets 500 (uncaught `request.json()`), expected 400; invalid-body test gets `{error:"Missing required fields"}` not `{error:"Validation failed"}`.

- [ ] **Step 3: Rewrite `app/api/admin/upload/route.ts`** to exactly:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scopeForClubLevel } from "@/lib/scope";
import { parseJsonBody } from "@/lib/validation/parse";
import { uploadSchema } from "./schema";

export async function POST(request: NextRequest) {
  // Verify user is admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse + validate request body
  const parsed = await parseJsonBody(request, uploadSchema);
  if (!parsed.ok) return parsed.response;
  const { clubId, title, slug, courseType, gender, recordType, records } =
    parsed.data;

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

(The `interface RecordData` and `interface UploadRequest` are deleted. The
`record_type: recordType ?? "individual"` line stays — now harmlessly
redundant since the schema guarantees `recordType`. Auth checks, scope
derivation, both inserts, and the existing Supabase `error` handling are
otherwise unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/admin/upload/route.test.ts`
Expected: PASS — 5/5 green.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx eslint "app/api/admin/upload/route.ts" "app/api/admin/upload/route.test.ts"`
Expected: zero problems.

- [ ] **Step 6: Commit** *(only with user go-ahead)*

```bash
git add "app/api/admin/upload/route.ts" "app/api/admin/upload/route.test.ts"
git commit -m "fix(api): validate upload body (incl. records[]) with zod (400 not 500)"
```

---

### Task 7: Final verification + TECH_DEBT.md

**Files:**
- Modify: `TECH_DEBT.md`

> Housekeeping beyond spec §6's code list (the spec scope was code; updating the ledger when its item is addressed is the ledger's purpose). Minimal.

- [ ] **Step 1: Full verification**

Run: `npm test`
Expected: green — existing 39 + parse (3) + club-level schema (7) + upload schema (~12) + 2 route suites (5 each) all pass.
Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npm run lint`
Expected: only the documented pre-existing 7 errors + 6 warnings; no new problems from any file added/changed by this plan (verify the flagged files are all the pre-existing dashboard/admin/component set, none are `lib/validation/*`, `app/api/admin/*/schema*`, `app/api/admin/*/route*`).

- [ ] **Step 2: Update `TECH_DEBT.md`**

Read `TECH_DEBT.md`. In the `## Done` section, append:
```markdown
- [x] **No input validation at trust boundaries (admin APIs)** — added
  `lib/validation/parse.ts` (`parseJsonBody`) + zod schemas; `api/admin/upload`
  (incl. the nested `records[]` array) and `api/admin/club-level` now reject
  malformed JSON / bad shapes with a structured **400** (was an uncaught 500
  or a corrupt service-role insert). The 3 hand-rolled `interface`s were
  replaced by `z.infer` types.
```
Then find and DELETE this exact `## High` bullet (the work is now done; the
public `?list=` param is deliberately YAGNI per the spec, and CSV import has
its own per-row validation in `lib/csv-parser.ts`):
```markdown
- [ ] **No input validation at trust boundaries** — CSV import and API routes
  accept untrusted input with hand-rolled checks; no schema validation
  (e.g. `zod`).
```
Make no other edits.

- [ ] **Step 3: Confirm acceptance criteria**

Verify the spec's "Acceptance criteria" 1–5 each hold; note any deviation.

- [ ] **Step 4: Commit** *(only with user go-ahead)*

```bash
git add TECH_DEBT.md
git commit -m "docs: mark admin API input validation done in TECH_DEBT"
```

---

## Self-Review

**Spec coverage:** §1 `parseJsonBody` → Task 2 (full TDD incl. malformed/issues/success+strip+transform). §2 schemas → Tasks 3 (club-level) & 4 (upload, incl. every no-regression pin: recordType default & null, gender omitted, empty records, unknown-key strip, NaN/string time_ms, non-bool, bad enum, missing clubId). §3 route wiring + auth-before-validate ordering → Tasks 5 & 6 (route tests pin 401-without-parse, 403, 400-malformed, 400-invalid, 200-valid). §4 testing → Tasks 2–6. §5 zod dep → Task 1. §6 scope respected; `?list=` untouched; admin Supabase error-handling left for sub-project C. Acceptance criteria 1–5 → Task 7 Step 3. No gaps.

**Placeholder scan:** No TBD/vague steps; every code step has complete code; every command has an expected result. The supabase mock is fully spelled out in both route-test files (intentionally duplicated per file, consistent with sub-project A's accepted decision rather than adding a shared test module outside spec scope).

**Type/name consistency:** `parseJsonBody`/`ParseResult` signatures identical in Task 2 and their consumers (Tasks 5–6). `clubLevelSchema`/`uploadSchema` names match between schema tasks (3,4), route wiring (5,6), and imports. `parsed.ok`/`parsed.response`/`parsed.data` used consistently. Route success-JSON shapes (`{ok:true}`, `{success,listId,recordCount}`) match the unchanged downstream code and the route-test assertions. `z.infer` output types (`recordType` post-transform `"individual"|"relay"`, `gender` nullish, `province` nullable-optional) are consistent with how the route bodies destructure and use them (`recordType ?? "individual"`, `gender ?? null`, `province?.trim()` all remain valid).
