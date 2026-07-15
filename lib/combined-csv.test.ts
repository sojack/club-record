import { describe, it, expect } from "vitest";
import Papa from "papaparse";
import { buildCombinedCsv, COMBINED_COLUMNS } from "./combined-csv";
import type { RecordList, SwimRecord } from "@/types/database";

function list(over: Partial<RecordList>): RecordList {
  return {
    id: "l1", club_id: "c1", title: "Boys SCM", slug: "boys-scm",
    course_type: "SCM", gender: "male", record_type: "individual", scope: "club",
    created_at: "", updated_at: "", ...over,
  };
}
function rec(over: Partial<SwimRecord>): SwimRecord {
  return {
    id: "r1", record_list_id: "l1", event_name: "50 Free", time_ms: 24560,
    swimmer_name: "A", swimmer_name_2: null, swimmer_name_3: null, swimmer_name_4: null,
    age_group: null, record_club: null, province: null, record_date: "2024-03-15",
    location: "Pool", split_times: null, sort_order: 0,
    is_national: false, is_current_national: false, is_provincial: false,
    is_current_provincial: false, is_split: false, is_relay_split: false,
    is_new: false, is_world_record: false, superseded_by: null, is_current: true,
    created_at: "", updated_at: "", ...over,
  };
}

describe("buildCombinedCsv", () => {
  it("emits identity, linkage and record columns for a current row", () => {
    const csv = buildCombinedCsv(
      [list({})],
      new Map([["l1", [rec({})]]])
    );
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true }).data;
    expect(parsed[0]["List Slug"]).toBe("boys-scm");
    expect(parsed[0]["Course"]).toBe("SCM");
    expect(parsed[0]["Record Type"]).toBe("individual");
    expect(parsed[0]["Record ID"]).toBe("r1");
    expect(parsed[0]["Is Current"]).toBe("x");
    expect(parsed[0]["Superseded By"]).toBe("");
    expect(parsed[0]["Event"]).toBe("50 Free");
    expect(parsed[0]["Time"]).toBe("24.56");
  });

  it("emits history rows with Is Current blank and a Superseded By id", () => {
    const csv = buildCombinedCsv(
      [list({})],
      new Map([[
        "l1",
        [
          rec({ id: "cur", is_current: true }),
          rec({ id: "old", is_current: false, superseded_by: "cur", time_ms: 25000 }),
        ],
      ]])
    );
    const rows = Papa.parse<Record<string, string>>(csv, { header: true }).data;
    const old = rows.find((r) => r["Record ID"] === "old")!;
    expect(old["Is Current"]).toBe("");
    expect(old["Superseded By"]).toBe("cur");
  });

  it("uses the exact COMBINED_COLUMNS header order", () => {
    const csv = buildCombinedCsv([list({})], new Map([["l1", [rec({})]]]));
    expect(csv.split("\n")[0]).toBe(COMBINED_COLUMNS.join(","));
  });
});
