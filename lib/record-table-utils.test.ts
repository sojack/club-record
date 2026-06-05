import { describe, it, expect } from "vitest";
import type { SwimRecord } from "@/types/database";
import {
  getStandardEvents,
  mapRecordToEditable,
  makeEmptyRecord,
  makeBreakingRecord,
  buildStandardEventRows,
  buildHistoryMap,
  filterSavableRecords,
  buildHistoryUpdates,
  getColumnConfig,
  computeAgeGroupOptions,
  reorderRecords,
  type EditableRecord,
} from "./record-table-utils";

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

describe("getStandardEvents", () => {
  it("includes 100 IM for non-LCM and omits it for LCM", () => {
    expect(getStandardEvents("SCM")).toContain("100 IM");
    expect(getStandardEvents("LCM")).not.toContain("100 IM");
    expect(getStandardEvents("LCM")).toContain("200 IM");
  });
});

describe("mapRecordToEditable", () => {
  it("copies fields and coerces nullish flags / is_current", () => {
    const e = mapRecordToEditable(rec({ is_national: undefined as unknown as boolean, is_current: undefined as unknown as boolean }));
    expect(e.id).toBe("r1");
    expect(e.is_national).toBe(false);
    expect(e.is_current).toBe(true);
  });
});

describe("makeEmptyRecord", () => {
  it("builds a blank new row at the given sort order", () => {
    const e = makeEmptyRecord(3);
    expect(e.event_name).toBe("");
    expect(e.time_ms).toBe(0);
    expect(e.sort_order).toBe(3);
    expect(e.isNew).toBe(true);
    expect(e.id).toBeUndefined();
  });
});

describe("makeBreakingRecord", () => {
  it("carries the old event/sort_order and links via _breakingRecordId", () => {
    const old: EditableRecord = { ...makeEmptyRecord(2), id: "old-1", event_name: "100 Free", sort_order: 2 };
    const b = makeBreakingRecord(old);
    expect(b.event_name).toBe("100 Free");
    expect(b.sort_order).toBe(2);
    expect(b.time_ms).toBe(0);
    expect(b.swimmer_name).toBe("");
    expect(b.is_new).toBe(true);
    expect(b.isNew).toBe(true);
    expect(b._breakingRecordId).toBe("old-1");
  });
});

describe("buildStandardEventRows", () => {
  it("adds individual standard events not already present", () => {
    const rows = buildStandardEventRows({
      isRelay: false, courseType: "SCM", relayEvents: [], ageGroups: [],
      existing: [{ ...makeEmptyRecord(0), event_name: "50 Free" }], startSortOrder: 1,
    });
    expect(rows.find((r) => r.event_name === "50 Free")).toBeUndefined();
    expect(rows.find((r) => r.event_name === "100 Free")).toBeDefined();
    expect(rows[0].sort_order).toBe(1);
  });

  it("builds relay event x age-group pairs", () => {
    const rows = buildStandardEventRows({
      isRelay: true, relayEvents: ["4x50 Free"], ageGroups: ["13-14", "15-16"],
      existing: [], startSortOrder: 0,
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.age_group)).toEqual(["13-14", "15-16"]);
  });
});

describe("buildHistoryMap", () => {
  it("groups superseded rows by superseded_by, newest date first", () => {
    const records = [
      rec({ id: "cur", is_current: true }),
      rec({ id: "h1", is_current: false, superseded_by: "cur", record_date: "2020-01-01" }),
      rec({ id: "h2", is_current: false, superseded_by: "cur", record_date: "2022-01-01" }),
      rec({ id: "orphan", is_current: false, superseded_by: null }),
    ];
    const map = buildHistoryMap(records);
    expect(map.get("cur")!.map((r) => r.id)).toEqual(["h2", "h1"]);
    expect(map.size).toBe(1);
  });
});

describe("filterSavableRecords", () => {
  it("drops rows with empty/whitespace event names", () => {
    const out = filterSavableRecords([
      { ...makeEmptyRecord(0), event_name: "50 Free" },
      { ...makeEmptyRecord(1), event_name: "   " },
      { ...makeEmptyRecord(2), event_name: "" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].event_name).toBe("50 Free");
  });
});

describe("buildHistoryUpdates", () => {
  it("maps edited records to flag payloads", () => {
    const edited = new Map<string, SwimRecord>([["h1", rec({ id: "h1", is_national: true })]]);
    const out = buildHistoryUpdates(edited);
    expect(out).toEqual([
      {
        id: "h1",
        flags: {
          is_national: true, is_current_national: false, is_provincial: false,
          is_current_provincial: false, is_split: false, is_relay_split: false,
          is_new: false, is_world_record: false,
        },
      },
    ]);
  });
});

describe("getColumnConfig", () => {
  it("derives column flags from recordType and scope", () => {
    expect(getColumnConfig({ recordType: "individual", scope: "club" })).toEqual({
      isRelay: false, showHolderClub: false, showProvince: false, showAgeGroup: false,
    });
    expect(getColumnConfig({ recordType: "relay", scope: "club" })).toMatchObject({
      isRelay: true, showAgeGroup: true,
    });
    expect(getColumnConfig({ recordType: "individual", scope: "national" })).toMatchObject({
      showHolderClub: true, showProvince: true, showAgeGroup: true,
    });
    expect(getColumnConfig({ recordType: "individual", scope: "provincial" })).toMatchObject({
      showHolderClub: true, showProvince: false, showAgeGroup: true,
    });
  });
});

describe("computeAgeGroupOptions", () => {
  it("unions configured + record age groups, de-duped, blanks dropped", () => {
    const out = computeAgeGroupOptions(["13-14"], [rec({ age_group: "15-16" }), rec({ age_group: "13-14" }), rec({ age_group: "  " })]);
    expect(out).toEqual(["13-14", "15-16"]);
  });
});

describe("reorderRecords", () => {
  it("swaps and reassigns sort_order", () => {
    const a = { ...makeEmptyRecord(0), event_name: "A" };
    const b = { ...makeEmptyRecord(1), event_name: "B" };
    const out = reorderRecords([a, b], 1, "up");
    expect(out.map((r) => r.event_name)).toEqual(["B", "A"]);
    expect(out.map((r) => r.sort_order)).toEqual([0, 1]);
  });

  it("returns the same array reference on a bounds no-op", () => {
    const arr = [makeEmptyRecord(0), makeEmptyRecord(1)];
    expect(reorderRecords(arr, 0, "up")).toBe(arr);
    expect(reorderRecords(arr, 1, "down")).toBe(arr);
  });
});
