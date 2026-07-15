import { describe, it, expect } from "vitest";
import Papa from "papaparse";
import { buildCombinedCsv, COMBINED_COLUMNS, parseCombinedCsv, planReconciliation, type CombinedGroup } from "./combined-csv";
import type { RecordList, SwimRecord } from "@/types/database";
import type { CSVRecord } from "@/lib/csv-parser";

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

describe("parseCombinedCsv", () => {
  const header = COMBINED_COLUMNS.join(",");

  it("groups rows by List Slug and reads linkage columns", () => {
    const csv = [
      header,
      "Boys SCM,SCM,male,individual,boys-scm,r1,x,,50 Free,,24.56,A,,,,,,2024,Pool,,,,,,,,,",
      "Boys SCM,SCM,male,individual,boys-scm,old,,r1,50 Free,,25.00,B,,,,,,2023,Pool,,,,,,,,,",
      "Girls LCM,LCM,female,relay,girls-lcm,,,,4x50 Free,10-12,2:00.00,W,X,Y,Z,,,2024,Pool,,,,,,,,,",
    ].join("\n");
    const { groups, errors } = parseCombinedCsv(csv, "club");
    expect(errors).toEqual([]);
    expect(groups).toHaveLength(2);
    const boys = groups.find((g) => g.slug === "boys-scm")!;
    expect(boys.recordType).toBe("individual");
    expect(boys.rows).toHaveLength(2);
    expect(boys.rows[0].recordId).toBe("r1");
    expect(boys.rows[0].isCurrent).toBe(true);
    expect(boys.rows[1].isCurrent).toBe(false);
    expect(boys.rows[1].supersededBy).toBe("r1");
    const girls = groups.find((g) => g.slug === "girls-lcm")!;
    expect(girls.recordType).toBe("relay");
    expect(girls.rows[0].record.swimmer_name_2).toBe("X");
  });

  it("collects a row error and drops that row", () => {
    const csv = [
      header,
      "Boys SCM,SCM,male,individual,boys-scm,,x,,50 Free,,notatime,A,,,,,,2024,Pool,,,,,,,,,",
    ].join("\n");
    const { groups, errors } = parseCombinedCsv(csv, "club");
    expect(errors.length).toBe(1);
    expect(groups.find((g) => g.slug === "boys-scm")?.rows ?? []).toHaveLength(0);
  });
});

function csvRec(over: Partial<CSVRecord>): CSVRecord {
  return {
    event_name: "50 Free", time_ms: 24560, swimmer_name: "A",
    swimmer_name_2: null, swimmer_name_3: null, swimmer_name_4: null,
    age_group: null, record_club: null, province: null, record_date: null,
    location: null, split_times: null, is_national: false, is_current_national: false,
    is_provincial: false, is_current_provincial: false, is_split: false,
    is_relay_split: false, is_new: false, is_world_record: false, ...over,
  };
}
function group(rows: CombinedGroup["rows"]): CombinedGroup {
  return { slug: "boys-scm", title: "Boys SCM", courseType: "SCM", gender: "male", recordType: "individual", rows };
}

describe("planReconciliation — update", () => {
  it("updates a row matched by Record ID in place", () => {
    const g = group([{ recordId: "r1", isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 24000 }) }]);
    const plan = planReconciliation(g, { id: "l1" }, [rec({ id: "r1", time_ms: 24560 })], "club");
    expect(plan.action).toBe("update");
    expect(plan.ops).toEqual([{ kind: "update", id: "r1", fields: csvRec({ time_ms: 24000 }) }]);
  });

  it("supersedes when a new no-id row beats the current record in the slot", () => {
    const g = group([{ recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 24000, swimmer_name: "New" }) }]);
    const plan = planReconciliation(g, { id: "l1" }, [rec({ id: "r1", time_ms: 24560, sort_order: 3 })], "club");
    expect(plan.ops).toEqual([{ kind: "supersede", oldId: "r1", fields: csvRec({ time_ms: 24000, swimmer_name: "New" }), sortOrder: 3 }]);
  });

  it("inserts (not supersede) and flags when the new time is not faster", () => {
    const g = group([{ recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 25000 }) }]);
    const plan = planReconciliation(g, { id: "l1" }, [rec({ id: "r1", time_ms: 24560, sort_order: 0 })], "club");
    expect(plan.ops[0].kind).toBe("insert");
    expect(plan.flags.length).toBe(1);
  });

  it("inserts and flags when the slot has more than one current record", () => {
    const g = group([{ recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 20000 }) }]);
    const existing = [rec({ id: "a", time_ms: 24560 }), rec({ id: "b", time_ms: 24560, is_split: true })];
    const plan = planReconciliation(g, { id: "l1" }, existing, "club");
    expect(plan.ops[0].kind).toBe("insert");
    expect(plan.flags.length).toBe(1);
  });

  it("does not emit any op for existing DB records absent from the CSV", () => {
    const g = group([{ recordId: "r1", isCurrent: true, supersededBy: null, record: csvRec({}) }]);
    const existing = [rec({ id: "r1" }), rec({ id: "keep", event_name: "100 Free" })];
    const plan = planReconciliation(g, { id: "l1" }, existing, "club");
    expect(plan.ops.some((o) => "id" in o && o.id === "keep")).toBe(false);
    expect(plan.ops.some((o) => o.kind === "supersede" && o.oldId === "keep")).toBe(false);
  });
});

describe("planReconciliation — create", () => {
  it("plans current rows with ordinals and links history via csv id", () => {
    const g = group([
      { recordId: "cur", isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 24000 }) },
      { recordId: "old", isCurrent: false, supersededBy: "cur", record: csvRec({ time_ms: 25000 }) },
    ]);
    const plan = planReconciliation(g, null, [], "club");
    expect(plan.action).toBe("create");
    expect(plan.createRows).toHaveLength(2);
    const hist = plan.createRows.find((r) => !r.isCurrent)!;
    expect(hist.supersededByCsvId).toBe("cur");
  });

  it("drops and flags a history row whose supersededBy matches no current row", () => {
    const g = group([
      { recordId: "old", isCurrent: false, supersededBy: "ghost", record: csvRec({}) },
    ]);
    const plan = planReconciliation(g, null, [], "club");
    expect(plan.createRows).toHaveLength(0);
    expect(plan.flags.length).toBe(1);
  });
});
