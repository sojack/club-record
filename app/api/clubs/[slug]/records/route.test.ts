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
    expect(body.list).toEqual({
      slug: "scm-male",
      title: "SCM Male",
      course_type: "SCM",
      gender: "male",
    });
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.records[0].time_formatted).toBe("24.56");
  });
});
