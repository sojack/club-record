import { describe, it, expect } from "vitest";
import {
  detectStroke,
  groupRecordsByStroke,
  buildStrokeSections,
  ageBandKey,
} from "./stroke-grouping";
import type { SwimRecord } from "@/types/database";

describe("detectStroke", () => {
  it("maps each stroke suffix to its full label and canonical order", () => {
    expect(detectStroke("50 Free")).toMatchObject({ label: "Freestyle", order: 1 });
    expect(detectStroke("100 Back")).toMatchObject({ label: "Backstroke", order: 2 });
    expect(detectStroke("50 Breast")).toMatchObject({ label: "Breaststroke", order: 3 });
    expect(detectStroke("200 Fly")).toMatchObject({ label: "Butterfly", order: 4 });
    expect(detectStroke("100 Butterfly")).toMatchObject({ label: "Butterfly", order: 4 });
    expect(detectStroke("200 IM")).toMatchObject({ label: "Individual Medley", order: 5 });
    expect(detectStroke("400 Medley")).toMatchObject({ label: "Individual Medley", order: 5 });
  });

  it("falls back to Other for unrecognized events", () => {
    expect(detectStroke("50 Kick")).toMatchObject({ key: "other", label: "Other", order: 6 });
    expect(detectStroke("")).toMatchObject({ key: "other", order: 6 });
  });
});

function rec(overrides: Partial<SwimRecord> = {}): SwimRecord {
  return {
    id: "r1",
    record_list_id: "list-1",
    event_name: "50 Free",
    time_ms: 24560,
    swimmer_name: "John Smith",
    swimmer_name_2: null,
    swimmer_name_3: null,
    swimmer_name_4: null,
    age_group: null,
    record_club: null,
    province: null,
    record_date: null,
    location: null,
    sort_order: 0,
    is_national: false,
    is_current_national: false,
    is_provincial: false,
    is_current_provincial: false,
    is_split: false,
    is_relay_split: false,
    is_new: false,
    is_world_record: false,
    superseded_by: null,
    is_current: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("groupRecordsByStroke", () => {
  it("orders strokes canonically and keeps record order within a stroke", () => {
    const records = [
      rec({ id: "back100", event_name: "100 Back" }),
      rec({ id: "free50", event_name: "50 Free" }),
      rec({ id: "free100", event_name: "100 Free" }),
      rec({ id: "im200", event_name: "200 IM" }),
    ];
    const groups = groupRecordsByStroke(records);
    expect(groups.map((g) => g.stroke.label)).toEqual([
      "Freestyle",
      "Backstroke",
      "Individual Medley",
    ]);
    expect(groups[0].records.map((r) => r.id)).toEqual(["free50", "free100"]);
  });

  it("omits strokes with no records", () => {
    const groups = groupRecordsByStroke([rec({ event_name: "50 Fly" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].stroke.label).toBe("Butterfly");
  });

  it("keeps unrecognized events in a trailing Other group (never dropped)", () => {
    const groups = groupRecordsByStroke([
      rec({ id: "kick", event_name: "50 Kick" }),
      rec({ id: "free", event_name: "50 Free" }),
    ]);
    expect(groups.map((g) => g.stroke.label)).toEqual(["Freestyle", "Other"]);
    expect(groups[1].records.map((r) => r.id)).toEqual(["kick"]);
  });
});

describe("ageBandKey", () => {
  it("uses the first numeric value in the band label", () => {
    expect(ageBandKey("100-199")).toBe(100);
    expect(ageBandKey("18-24")).toBe(18);
    expect(ageBandKey("65+")).toBe(65);
  });

  it("sorts blank or non-numeric bands last", () => {
    expect(ageBandKey(null)).toBe(Number.MAX_SAFE_INTEGER);
    expect(ageBandKey("Open")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("buildStrokeSections", () => {
  it("returns a single null-band section when hasBands is false", () => {
    const sections = buildStrokeSections(
      [rec({ event_name: "50 Free" }), rec({ event_name: "100 Back" })],
      false
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].band).toBeNull();
    expect(sections[0].strokeGroups.map((g) => g.stroke.label)).toEqual([
      "Freestyle",
      "Backstroke",
    ]);
  });

  it("groups by age band (numeric ascending) then stroke when hasBands is true", () => {
    const sections = buildStrokeSections(
      [
        rec({ id: "a", event_name: "50 Free", age_group: "35-39" }),
        rec({ id: "b", event_name: "50 Free", age_group: "18-24" }),
        rec({ id: "c", event_name: "100 Back", age_group: "18-24" }),
      ],
      true
    );
    expect(sections.map((s) => s.band)).toEqual(["18-24", "35-39"]);
    expect(sections[0].strokeGroups.map((g) => g.stroke.label)).toEqual([
      "Freestyle",
      "Backstroke",
    ]);
    expect(sections[1].strokeGroups).toHaveLength(1);
  });

  it("places blank age bands last", () => {
    const sections = buildStrokeSections(
      [
        rec({ id: "blank", event_name: "50 Free", age_group: null }),
        rec({ id: "young", event_name: "50 Free", age_group: "18-24" }),
      ],
      true
    );
    expect(sections.map((s) => s.band)).toEqual(["18-24", "—"]);
  });
});
