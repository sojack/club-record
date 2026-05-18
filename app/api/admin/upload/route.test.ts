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
