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

  it("only supersedes once when two new rows target the same record; the second is inserted", () => {
    const g = group([
      { recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 24000 }) },
      { recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 23000 }) },
    ]);
    const plan = planReconciliation(g, { id: "l1" }, [rec({ id: "r1", time_ms: 24560, sort_order: 5 })], "club");
    const supersedes = plan.ops.filter((o) => o.kind === "supersede");
    const inserts = plan.ops.filter((o) => o.kind === "insert");
    expect(supersedes).toHaveLength(1);
    expect(inserts).toHaveLength(1);
    expect((supersedes[0] as { oldId: string }).oldId).toBe("r1");
    expect(plan.flags.some((f) => f.toLowerCase().includes("same record"))).toBe(true);
  });

  it("inserts a new record with no flag when its slot has no current record", () => {
    const g = group([{ recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ event_name: "200 IM", time_ms: 130000 }) }]);
    const plan = planReconciliation(g, { id: "l1" }, [rec({ id: "r1", event_name: "50 Free" })], "club");
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0].kind).toBe("insert");
    expect(plan.flags).toEqual([]);
  });

  it("drops and flags a non-current row with no matching existing record (update)", () => {
    const g = group([{ recordId: "ghost", isCurrent: false, supersededBy: "x", record: csvRec({ swimmer_name: "Ghost", time_ms: 99999 }) }]);
    const plan = planReconciliation(g, { id: "l1" }, [rec({ id: "r1" })], "club");
    expect(plan.ops).toEqual([]);
    expect(plan.flags.length).toBe(1);
  });

  it("does not resurrect a re-listed broken record whose Record ID and Is Current were stripped", () => {
    // A slower row read as current (Is Current lost -> defaults true) that
    // exactly matches an existing HISTORY record must be a no-op, not inserted
    // as a new current event. The live record's row updates in place.
    const g = group([
      { recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 24000, swimmer_name: "Fast" }) },
      { recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 25000, swimmer_name: "Slow" }) },
    ]);
    const existing = [
      rec({ id: "C", time_ms: 24000, swimmer_name: "Fast", is_current: true, sort_order: 0 }),
      rec({ id: "H", time_ms: 25000, swimmer_name: "Slow", is_current: false, superseded_by: "C", sort_order: 0 }),
    ];
    const plan = planReconciliation(g, { id: "l1" }, existing, "club");
    expect(plan.ops.filter((o) => o.kind === "insert")).toHaveLength(0);
    expect(plan.ops).toEqual([{ kind: "update", id: "C", fields: csvRec({ time_ms: 24000, swimmer_name: "Fast" }) }]);
  });

  it("treats an id-less row exactly matching an existing record (same time+swimmer) as an update, not a duplicate", () => {
    const g = group([{ recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 24560, swimmer_name: "A" }) }]);
    const plan = planReconciliation(g, { id: "l1" }, [rec({ id: "r1", time_ms: 24560, swimmer_name: "A" })], "club");
    expect(plan.ops).toEqual([{ kind: "update", id: "r1", fields: csvRec({ time_ms: 24560, swimmer_name: "A" }) }]);
    expect(plan.flags).toEqual([]);
  });

  it("no-ops (no flag) a correctly-marked history row that content-matches an existing history record", () => {
    const g = group([{ recordId: null, isCurrent: false, supersededBy: null, record: csvRec({ time_ms: 25000, swimmer_name: "Slow" }) }]);
    const existing = [
      rec({ id: "C", time_ms: 24000, swimmer_name: "Fast", is_current: true }),
      rec({ id: "H", time_ms: 25000, swimmer_name: "Slow", is_current: false, superseded_by: "C" }),
    ];
    const plan = planReconciliation(g, { id: "l1" }, existing, "club");
    expect(plan.ops).toEqual([]);
    expect(plan.flags).toEqual([]);
  });

  it("updates in place when an isCurrent=false row content-matches the live record", () => {
    const g = group([{ recordId: null, isCurrent: false, supersededBy: null, record: csvRec({ time_ms: 24560, swimmer_name: "A", location: "New Pool" }) }]);
    const plan = planReconciliation(g, { id: "l1" }, [rec({ id: "r1", time_ms: 24560, swimmer_name: "A", is_current: true })], "club");
    expect(plan.ops).toEqual([{ kind: "update", id: "r1", fields: csvRec({ time_ms: 24560, swimmer_name: "A", location: "New Pool" }) }]);
    expect(plan.flags).toEqual([]);
  });

  it("still supersedes an id-less faster row that does NOT exactly match", () => {
    const g = group([{ recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 24000, swimmer_name: "New" }) }]);
    const plan = planReconciliation(g, { id: "l1" }, [rec({ id: "r1", time_ms: 24560, swimmer_name: "Old", sort_order: 2 })], "club");
    expect(plan.ops).toEqual([{ kind: "supersede", oldId: "r1", fields: csvRec({ time_ms: 24000, swimmer_name: "New" }), sortOrder: 2 }]);
  });

  it("flags an id-matched row whose time changed (a correction, no history)", () => {
    const g = group([{ recordId: "r1", isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 23000 }) }]);
    const plan = planReconciliation(g, { id: "l1" }, [rec({ id: "r1", time_ms: 24560 })], "club");
    expect(plan.ops).toEqual([{ kind: "update", id: "r1", fields: csvRec({ time_ms: 23000 }) }]);
    expect(plan.flags.length).toBe(1);
    expect(plan.flags[0].toLowerCase()).toContain("correction");
  });

  it("does not flag an id-matched row whose time is unchanged", () => {
    const g = group([{ recordId: "r1", isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 24560 }) }]);
    const plan = planReconciliation(g, { id: "l1" }, [rec({ id: "r1", time_ms: 24560 })], "club");
    expect(plan.flags).toEqual([]);
  });
});

describe("planReconciliation — create", () => {
  it("plans current rows with ordinals and links history to its current row", () => {
    const g = group([
      { recordId: "cur", isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 24000 }) },
      { recordId: "old", isCurrent: false, supersededBy: "cur", record: csvRec({ time_ms: 25000 }) },
    ]);
    const plan = planReconciliation(g, null, [], "club");
    expect(plan.action).toBe("create");
    expect(plan.createRows).toHaveLength(2);
    const cur = plan.createRows.find((r) => r.isCurrent)!;
    const hist = plan.createRows.find((r) => !r.isCurrent)!;
    expect(hist.supersededByLocalId).toBe(cur.localId);
  });

  it("resolves a break on create: fastest current wins, the slower becomes history", () => {
    // A break represented as two current rows (old with id + new faster, no id).
    const g = group([
      { recordId: "0f8ad973", isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 36000, swimmer_name: "Old" }) },
      { recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 34500, swimmer_name: "New" }) },
    ]);
    const plan = planReconciliation(g, null, [], "club");
    const currents = plan.createRows.filter((r) => r.isCurrent);
    const history = plan.createRows.filter((r) => !r.isCurrent);
    expect(currents).toHaveLength(1);
    expect(currents[0].fields.time_ms).toBe(34500);
    expect(history).toHaveLength(1);
    expect(history[0].fields.time_ms).toBe(36000);
    expect(history[0].supersededByLocalId).toBe(currents[0].localId);
  });

  it("keeps a split-time record current alongside the main record on create", () => {
    const g = group([
      { recordId: "m", isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 34500, swimmer_name: "Main" }) },
      { recordId: "s", isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 16000, swimmer_name: "Main", is_split: true }) },
    ]);
    const plan = planReconciliation(g, null, [], "club");
    expect(plan.createRows.filter((r) => r.isCurrent)).toHaveLength(2);
  });

  it("does not link a split history row to a demoted break-loser (drops+flags instead)", () => {
    // Two current rows in a slot -> the slower (id "loser") is demoted to history.
    // A split history row referencing "loser" must not resolve to a non-current
    // parent (which would orphan it in the DB); it is dropped and flagged.
    const g = group([
      { recordId: "loser", isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 36000, swimmer_name: "Old" }) },
      { recordId: null, isCurrent: true, supersededBy: null, record: csvRec({ time_ms: 34500, swimmer_name: "New" }) },
      { recordId: "sp", isCurrent: false, supersededBy: "loser", record: csvRec({ time_ms: 16000, swimmer_name: "Old", is_split: true }) },
    ]);
    const plan = planReconciliation(g, null, [], "club");
    // The split history row is not created (no valid current parent).
    expect(plan.createRows.some((r) => r.fields.is_split)).toBe(false);
    expect(plan.flags.length).toBeGreaterThanOrEqual(1);
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
