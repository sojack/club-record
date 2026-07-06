import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabase } from "@/lib/test/supabase-mock";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

function setup(clubId: string | null = "club-1") {
  const supabase = makeSupabase({
    clubs: { data: clubId ? { id: clubId } : null, error: null },
    page_views: { error: null },
  });
  vi.mocked(createAdminClient).mockReturnValue(
    supabase as unknown as ReturnType<typeof createAdminClient>
  );
  return supabase;
}

function call(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("http://t/api/track", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "user-agent": BROWSER_UA,
        "x-forwarded-for": "1.2.3.4",
        ...headers,
      },
    })
  );
}

/** The chain returned by the page_views from() call (second from() call). */
function insertChain(supabase: ReturnType<typeof makeSupabase>) {
  const idx = supabase.from.mock.calls.findIndex(([t]) => t === "page_views");
  return idx === -1 ? null : (supabase.from.mock.results[idx].value as { insert: ReturnType<typeof vi.fn> });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/track", () => {
  it("inserts a page view and returns 204 for a valid payload", async () => {
    const supabase = setup();
    const res = await call(
      JSON.stringify({
        path: "/rhac",
        clubSlug: "rhac",
        listSlug: "scm-records",
        referrer: "https://google.com/",
      })
    );
    expect(res.status).toBe(204);
    const chain = insertChain(supabase);
    expect(chain).not.toBeNull();
    expect(chain!.insert).toHaveBeenCalledTimes(1);
    const row = chain!.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      club_id: "club-1",
      club_slug: "rhac",
      list_slug: "scm-records",
      path: "/rhac",
      referrer: "https://google.com/",
    });
    expect(row.visitor_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns 204 and skips the insert for bot user agents", async () => {
    const supabase = setup();
    const res = await call(
      JSON.stringify({ path: "/rhac", clubSlug: "rhac" }),
      { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }
    );
    expect(res.status).toBe(204);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns 204 and skips the insert for malformed JSON", async () => {
    const supabase = setup();
    const res = await call("{not json");
    expect(res.status).toBe(204);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns 204 and skips the insert for an invalid payload", async () => {
    const supabase = setup();
    const res = await call(JSON.stringify({ clubSlug: "rhac" }));
    expect(res.status).toBe(204);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("inserts with null club_id when the club slug is unknown", async () => {
    const supabase = setup(null);
    const res = await call(JSON.stringify({ path: "/gone", clubSlug: "gone" }));
    expect(res.status).toBe(204);
    const chain = insertChain(supabase);
    expect(chain!.insert.mock.calls[0][0]).toMatchObject({ club_id: null });
  });

  it("still returns 204 when the admin client throws", async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error("no credentials");
    });
    const res = await call(JSON.stringify({ path: "/rhac", clubSlug: "rhac" }));
    expect(res.status).toBe(204);
  });
});
