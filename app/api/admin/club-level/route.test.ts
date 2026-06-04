import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeChain } from "@/lib/test/supabase-mock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

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
