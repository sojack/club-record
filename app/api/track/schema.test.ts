import { describe, it, expect } from "vitest";
import { trackSchema } from "./schema";

describe("trackSchema", () => {
  it("accepts a minimal valid payload", () => {
    const r = trackSchema.safeParse({ path: "/rhac", clubSlug: "rhac" });
    expect(r.success).toBe(true);
  });

  it("accepts optional listSlug and referrer (including null)", () => {
    const r = trackSchema.safeParse({
      path: "/rhac/scm-records",
      clubSlug: "rhac",
      listSlug: "scm-records",
      referrer: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing path or clubSlug", () => {
    expect(trackSchema.safeParse({ clubSlug: "rhac" }).success).toBe(false);
    expect(trackSchema.safeParse({ path: "/rhac" }).success).toBe(false);
  });

  it("rejects oversized fields", () => {
    const r = trackSchema.safeParse({ path: "x".repeat(501), clubSlug: "rhac" });
    expect(r.success).toBe(false);
  });

  it("rejects non-string values", () => {
    const r = trackSchema.safeParse({ path: 5, clubSlug: "rhac" });
    expect(r.success).toBe(false);
  });
});
