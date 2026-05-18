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
