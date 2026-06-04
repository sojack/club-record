import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabase, pgError, type QueryResult } from "@/lib/test/supabase-mock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";
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
    expect(body.full_name).toBe("ABC Swim Club");
    expect(body.logo_url).toBeNull();
    expect(body.record_lists).toEqual([
      { slug: "scm-male", title: "SCM Male", course_type: "SCM", gender: "male" },
    ]);
  });
});
