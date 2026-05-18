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
