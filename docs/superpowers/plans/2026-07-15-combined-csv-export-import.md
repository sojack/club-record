# Combined CSV Export & Re-import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lossy flat CSV export with a complete, history-preserving combined CSV, and add a non-destructive, history-aware re-import so a club's records can round-trip (export → edit / "update with AI" → re-import).

**Architecture:** A new pure module `lib/combined-csv.ts` holds the column contract, the export row builder, the parse+group step, and a pure reconciliation planner. The export button (`records/page.tsx`) and a new "Combined CSV" mode on the bulk-upload page consume it. Record-field parsing/validation is reused from `lib/csv-parser.ts` via a new per-row helper. All DB mutation stays in the UI layer; the planner emits a plain-data plan that both drives the confirm-preview and is applied by an executor.

**Tech Stack:** Next.js 16 / React 19 / TypeScript (strict), Supabase JS client, PapaParse, Vitest.

## Global Constraints

- All source lives under `club-record/`; run every command from `club-record/`.
- `@/*` maps to the `club-record/` root.
- Tests are Vitest; run with `npm run test`. Unit tests are colocated `*.test.ts`.
- Typographic quotes in user-facing prose/JSX text; straight quotes in code.
- A list's `scope` is derived authoritatively from the club's level via `scopeForClubLevel(club.level)` — never from a CSV column or filename.
- Supersession sequence (must match `app/(dashboard)/dashboard/records/[listId]/page.tsx:156-177` exactly): insert the new faster row `is_current:true, superseded_by:null` copying the beaten row's `sort_order`; set the beaten row `is_current:false, superseded_by:<newId>`; re-parent ancestors with `update({superseded_by:newId}).eq("superseded_by", oldId)`. **Never hard-delete a record during import.**
- The combined-CSV insert path writes **all** record fields including `is_world_record` and `split_times`.
- Do not `git push`. Local commits only.

---

## File Structure

- **Create** `lib/combined-csv.ts` — column contract, `buildCombinedCsv`, `parseCombinedCsv`, `planReconciliation` (all pure).
- **Create** `lib/combined-csv.test.ts` — unit tests for the above.
- **Modify** `lib/split-utils.ts` — add `formatSplitsColumn` (serialize `SplitTime[]` back to the `Splits` cell).
- **Modify** `lib/split-utils.test.ts` — tests for `formatSplitsColumn`.
- **Modify** `lib/csv-parser.ts` — add `is_relaysplit` alias; extract exported `parseRecordRow` reused by the combined importer.
- **Modify** `lib/csv-parser.test.ts` — a test that `is_RelaySplit` header maps to `is_relay_split`.
- **Modify** `app/(dashboard)/dashboard/records/page.tsx` — rewrite `handleExportCSV` to build the combined format.
- **Modify** `app/(dashboard)/dashboard/records/bulk-upload/page.tsx` — add the "Combined CSV" import mode (parse → plan → confirm preview → execute).

---

## Task 1: `formatSplitsColumn` (export splits serialization)

**Files:**
- Modify: `lib/split-utils.ts`
- Test: `lib/split-utils.test.ts`

**Interfaces:**
- Produces: `formatSplitsColumn(splits: SplitTime[] | null): string` — inverse of `parseSplitsColumn`. `null`/empty → `""`; otherwise `"50=29.10;100=1:02.78"` using `formatMsToTime` for each cumulative time.

- [ ] **Step 1: Write the failing test** — append to `lib/split-utils.test.ts`:

```ts
import { formatSplitsColumn } from "./split-utils";

describe("formatSplitsColumn", () => {
  it("returns empty string for null", () => {
    expect(formatSplitsColumn(null)).toBe("");
  });

  it("serializes cumulative distance=time pairs", () => {
    expect(
      formatSplitsColumn([
        { distance: 50, ms: 29100 },
        { distance: 100, ms: 62780 },
      ])
    ).toBe("50=29.10;100=1:02.78");
  });

  it("round-trips through parseSplitsColumn", () => {
    const splits = [
      { distance: 50, ms: 29100 },
      { distance: 100, ms: 62780 },
    ];
    expect(parseSplitsColumn(formatSplitsColumn(splits))).toEqual(splits);
  });
});
```

Ensure `parseSplitsColumn` is imported at the top of the test file (add to the existing import if needed).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- split-utils`
Expected: FAIL — `formatSplitsColumn is not a function`.

- [ ] **Step 3: Implement** — add to `lib/split-utils.ts`:

```ts
import { formatMsToTime } from "@/lib/time-utils";

/**
 * Serialize cumulative splits back to the CSV `Splits` cell — inverse of
 * `parseSplitsColumn`. Returns "" for null/empty so the export cell is blank.
 */
export function formatSplitsColumn(splits: SplitTime[] | null): string {
  if (!splits || splits.length === 0) return "";
  return splits.map((s) => `${s.distance}=${formatMsToTime(s.ms)}`).join(";");
}
```

(`parseTimeToMs` is already imported; add `formatMsToTime` to that import line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- split-utils`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/split-utils.ts lib/split-utils.test.ts
git commit -m "feat: add formatSplitsColumn for CSV export"
```

---

## Task 2: `parseRecordRow` extraction + `is_relaysplit` alias

**Files:**
- Modify: `lib/csv-parser.ts`
- Test: `lib/csv-parser.test.ts`

**Interfaces:**
- Consumes: existing `CSVRecord`, `RelayParseOptions`, `RawCSVRow`.
- Produces: `parseRecordRow(row: RawCSVRow, relayOptions: RelayParseOptions, humanRow: number): { record: CSVRecord | null; error: string | null }` — parses one already-parsed CSV row (keys lowercased/trimmed). Returns `{record, null}` on success or `{null, error}` on the first validation failure. `parseRecordsCSV` is refactored to call it per row (behavior unchanged).

- [ ] **Step 1: Write the failing test** — add to `lib/csv-parser.test.ts`:

```ts
import { parseRecordRow } from "./csv-parser";

describe("is_RelaySplit header alias", () => {
  it("maps is_RelaySplit column to is_relay_split", () => {
    const csv = "Event,Time,Swimmer,is_RelaySplit\n50 Free,24.56,A,x";
    const { records, errors } = parseRecordsCSV(csv);
    expect(errors).toEqual([]);
    expect(records[0].is_relay_split).toBe(true);
  });
});

describe("parseRecordRow", () => {
  it("parses a single lowercased row", () => {
    const { record, error } = parseRecordRow(
      { event: "50 Free", time: "24.56", swimmer: "A" },
      {},
      2
    );
    expect(error).toBeNull();
    expect(record?.time_ms).toBe(24560);
  });

  it("returns an error with the given human row number", () => {
    const { record, error } = parseRecordRow(
      { event: "", time: "24.56", swimmer: "A" },
      {},
      7
    );
    expect(record).toBeNull();
    expect(error).toContain("Row 7");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- csv-parser`
Expected: FAIL — `parseRecordRow is not a function` and the `is_RelaySplit` test fails (header lowercases to `is_relaysplit`, not in the alias list).

- [ ] **Step 3: Implement**

In `lib/csv-parser.ts`, add the alias to `columnMaps.is_relay_split`:

```ts
    is_relay_split: ["is_relay_split", "is_relaysplit", "relay_split", "relay"],
```

Then extract the per-row body. Move the `columnMaps`, `parseBoolean`, and `findColumn` definitions to module scope (above `parseRecordsCSV`) so both functions share them, and add:

```ts
export function parseRecordRow(
  row: RawCSVRow,
  relayOptions: RelayParseOptions,
  humanRow: number
): { record: CSVRecord | null; error: string | null } {
  const event = findColumn(row, columnMaps.event);
  const time = findColumn(row, columnMaps.time);
  const swimmer = findColumn(row, columnMaps.swimmer);
  const date = findColumn(row, columnMaps.date);
  const location = findColumn(row, columnMaps.location);
  const is_national = findColumn(row, columnMaps.is_national);
  const is_current_national = findColumn(row, columnMaps.is_current_national);
  const is_provincial = findColumn(row, columnMaps.is_provincial);
  const is_current_provincial = findColumn(row, columnMaps.is_current_provincial);
  const is_split = findColumn(row, columnMaps.is_split);
  const is_relay_split = findColumn(row, columnMaps.is_relay_split);
  const is_new = findColumn(row, columnMaps.is_new);
  const is_world_record = findColumn(row, columnMaps.is_world_record);

  const isRelay = relayOptions.relay === true;
  const name2 = findColumn(row, columnMaps.swimmer2);
  const name3 = findColumn(row, columnMaps.swimmer3);
  const name4 = findColumn(row, columnMaps.swimmer4);
  const ageGroup = findColumn(row, columnMaps.age_group);
  const recordClub = findColumn(row, columnMaps.record_club);
  const province = findColumn(row, columnMaps.province);
  const splitsRaw = findColumn(row, columnMaps.splits);
  let split_times: SplitTime[] | null;
  try {
    split_times = parseSplitsColumn(splitsRaw);
  } catch (e) {
    return { record: null, error: `Row ${humanRow}: ${(e as Error).message}` };
  }

  if (!event || !time || !swimmer) {
    return {
      record: null,
      error: `Row ${humanRow}: Missing required field (event, time, or swimmer)`,
    };
  }

  const time_ms = parseTimeToMs(time);
  if (time_ms === 0) {
    return { record: null, error: `Row ${humanRow}: Invalid time format "${time}"` };
  }

  const rawScope = relayOptions.scope;
  const scope =
    rawScope === "national" ? "national" : rawScope === "provincial" ? "provincial" : "club";
  const carriesAgeClub = scope !== "club";
  const carriesProvince = scope === "national";

  if (isRelay) {
    const presentLegs = [name2, name3, name4].filter((n) => n?.trim()).length;
    if (presentLegs !== 0 && presentLegs !== 3) {
      return {
        record: null,
        error: `Row ${humanRow}: A relay needs all 4 swimmer names, or just the team name in leg 1 (Swimmer)`,
      };
    }
    if (
      relayOptions.allowedAgeGroups &&
      relayOptions.allowedAgeGroups.length > 0 &&
      ageGroup?.trim() &&
      !relayOptions.allowedAgeGroups.includes(ageGroup.trim())
    ) {
      return {
        record: null,
        error: `Row ${humanRow}: Age Group "${ageGroup.trim()}" is not a standard age group`,
      };
    }
  }

  if (carriesAgeClub) {
    if (!ageGroup?.trim()) {
      return {
        record: null,
        error: `Row ${humanRow}: ${scope === "national" ? "National" : "Provincial"} records require an Age Group`,
      };
    }
    if (!recordClub?.trim()) {
      return {
        record: null,
        error: `Row ${humanRow}: ${scope === "national" ? "National" : "Provincial"} records require a Club`,
      };
    }
    if (carriesProvince && !province?.trim()) {
      return { record: null, error: `Row ${humanRow}: National records require a Province` };
    }
  }

  return {
    record: {
      event_name: event.trim(),
      time_ms,
      swimmer_name: swimmer.trim(),
      swimmer_name_2: isRelay ? name2?.trim() || null : null,
      swimmer_name_3: isRelay ? name3?.trim() || null : null,
      swimmer_name_4: isRelay ? name4?.trim() || null : null,
      age_group: carriesAgeClub ? ageGroup!.trim() : null,
      record_club: carriesAgeClub ? recordClub!.trim() : null,
      province: carriesProvince ? province!.trim() : null,
      record_date: normalizeDate(date),
      location: location?.trim() || null,
      split_times,
      is_national: parseBoolean(is_national),
      is_current_national: parseBoolean(is_current_national),
      is_provincial: parseBoolean(is_provincial),
      is_current_provincial: parseBoolean(is_current_provincial),
      is_split: parseBoolean(is_split),
      is_relay_split: parseBoolean(is_relay_split),
      is_new: parseBoolean(is_new),
      is_world_record: parseBoolean(is_world_record),
    },
    error: null,
  };
}
```

Rewrite the body of `parseRecordsCSV`'s `result.data.forEach` to delegate:

```ts
  result.data.forEach((row, index) => {
    const { record, error } = parseRecordRow(row, relayOptions, index + 2);
    if (error) errors.push(error);
    if (record) records.push(record);
  });
```

Also export `RawCSVRow` (change `interface RawCSVRow` to `export interface RawCSVRow`) so the combined importer can type its rows.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- csv-parser`
Expected: PASS (new tests **and** all pre-existing csv-parser tests still green).

- [ ] **Step 5: Commit**

```bash
git add lib/csv-parser.ts lib/csv-parser.test.ts
git commit -m "refactor: extract parseRecordRow; add is_relaysplit alias"
```

---

## Task 3: `buildCombinedCsv` (export builder)

**Files:**
- Create: `lib/combined-csv.ts`
- Test: `lib/combined-csv.test.ts`

**Interfaces:**
- Consumes: `RecordList`, `SwimRecord` (`@/types/database`), `formatMsToTime` (`@/lib/time-utils`), `formatSplitsColumn` (`@/lib/split-utils`), `Papa` (`papaparse`).
- Produces:
  - `COMBINED_COLUMNS: string[]` — the header order (identity + linkage + record columns).
  - `buildCombinedCsv(lists: RecordList[], recordsByList: Map<string, SwimRecord[]>): string` — one row per record (current + history), grouped by list in `lists` order, records in the given array order. Uses `Papa.unparse`.

- [ ] **Step 1: Write the failing test** — create `lib/combined-csv.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- combined-csv`
Expected: FAIL — module `./combined-csv` not found.

- [ ] **Step 3: Implement** — create `lib/combined-csv.ts`:

```ts
import Papa from "papaparse";
import type { RecordList, SwimRecord } from "@/types/database";
import { formatMsToTime } from "@/lib/time-utils";
import { formatSplitsColumn } from "@/lib/split-utils";

/** Header order for the combined export/import CSV. */
export const COMBINED_COLUMNS = [
  "List Title", "Course", "Gender", "Record Type", "List Slug",
  "Record ID", "Is Current", "Superseded By",
  "Event", "AgeGroup", "Time", "Swimmer", "Name2", "Name3", "Name4",
  "Club", "Province", "Date", "Location",
  "is_World_Record", "is_National", "is_Current_National",
  "is_Provincial", "is_Current_Provincial", "is_Split", "is_RelaySplit",
  "is_New", "Splits",
] as const;

const flag = (b: boolean): string => (b ? "x" : "");

function rowFor(list: RecordList, r: SwimRecord): Record<string, string> {
  return {
    "List Title": list.title,
    "Course": list.course_type,
    "Gender": list.gender ?? "",
    "Record Type": list.record_type,
    "List Slug": list.slug,
    "Record ID": r.id,
    "Is Current": flag(r.is_current),
    "Superseded By": r.superseded_by ?? "",
    "Event": r.event_name,
    "AgeGroup": r.age_group ?? "",
    "Time": formatMsToTime(r.time_ms),
    "Swimmer": r.swimmer_name,
    "Name2": r.swimmer_name_2 ?? "",
    "Name3": r.swimmer_name_3 ?? "",
    "Name4": r.swimmer_name_4 ?? "",
    "Club": r.record_club ?? "",
    "Province": r.province ?? "",
    "Date": r.record_date ?? "",
    "Location": r.location ?? "",
    "is_World_Record": flag(r.is_world_record),
    "is_National": flag(r.is_national),
    "is_Current_National": flag(r.is_current_national),
    "is_Provincial": flag(r.is_provincial),
    "is_Current_Provincial": flag(r.is_current_provincial),
    "is_Split": flag(r.is_split),
    "is_RelaySplit": flag(r.is_relay_split),
    "is_New": flag(r.is_new),
    "Splits": formatSplitsColumn(r.split_times),
  };
}

/**
 * Build the combined club CSV: one row per record (current AND history),
 * grouped by list, in the given orders. Robust quoting via Papa.unparse.
 */
export function buildCombinedCsv(
  lists: RecordList[],
  recordsByList: Map<string, SwimRecord[]>
): string {
  const rows: Record<string, string>[] = [];
  for (const list of lists) {
    for (const r of recordsByList.get(list.id) ?? []) {
      rows.push(rowFor(list, r));
    }
  }
  return Papa.unparse({ fields: [...COMBINED_COLUMNS], data: rows });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- combined-csv`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/combined-csv.ts lib/combined-csv.test.ts
git commit -m "feat: buildCombinedCsv export builder"
```

---

## Task 4: `parseCombinedCsv` (parse + group)

**Files:**
- Modify: `lib/combined-csv.ts`
- Test: `lib/combined-csv.test.ts`

**Interfaces:**
- Consumes: `parseRecordRow`, `RawCSVRow` (`@/lib/csv-parser`), `ListScope` (`@/lib/scope`), `CSVRecord`.
- Produces:
  - `interface CombinedRow { recordId: string | null; isCurrent: boolean; supersededBy: string | null; record: CSVRecord; }`
  - `interface CombinedGroup { slug: string; title: string; courseType: "SCM"|"SCY"|"LCM"; gender: "male"|"female"|"mixed"|null; recordType: "individual"|"relay"; rows: CombinedRow[]; }`
  - `parseCombinedCsv(csvContent: string, scope: ListScope): { groups: CombinedGroup[]; errors: string[] }` — Papa.parse (header, lowercased), group rows by `list slug`, parse each row's record fields via `parseRecordRow` (relay from the `Record Type` column, scope from the argument), collecting metadata columns. Blank-slug rows are grouped under `""`. Row errors are collected; the erroring row is dropped.

- [ ] **Step 1: Write the failing test** — add to `lib/combined-csv.test.ts`:

```ts
import { parseCombinedCsv } from "./combined-csv";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- combined-csv`
Expected: FAIL — `parseCombinedCsv is not a function`.

- [ ] **Step 3: Implement** — add to `lib/combined-csv.ts`:

```ts
import Papa from "papaparse";
import { parseRecordRow, type RawCSVRow } from "@/lib/csv-parser";
import type { CSVRecord } from "@/lib/csv-parser";
import type { ListScope } from "@/lib/scope";

export interface CombinedRow {
  recordId: string | null;
  isCurrent: boolean;
  supersededBy: string | null;
  record: CSVRecord;
}

export interface CombinedGroup {
  slug: string;
  title: string;
  courseType: "SCM" | "SCY" | "LCM";
  gender: "male" | "female" | "mixed" | null;
  recordType: "individual" | "relay";
  rows: CombinedRow[];
}

const truthy = (v: string | undefined): boolean => {
  const s = (v ?? "").toLowerCase().trim();
  return s === "x" || s === "true" || s === "yes" || s === "1";
};

const asCourse = (v: string | undefined): "SCM" | "SCY" | "LCM" => {
  const u = (v ?? "").toUpperCase().trim();
  return u === "SCM" || u === "SCY" ? u : "LCM";
};

const asGender = (v: string | undefined): "male" | "female" | "mixed" | null => {
  const s = (v ?? "").toLowerCase().trim();
  return s === "male" || s === "female" || s === "mixed" ? s : null;
};

export function parseCombinedCsv(
  csvContent: string,
  scope: ListScope
): { groups: CombinedGroup[]; errors: string[] } {
  const errors: string[] = [];
  const parsed = Papa.parse<RawCSVRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  parsed.errors.forEach((e) => errors.push(`Row ${e.row}: ${e.message}`));

  const bySlug = new Map<string, CombinedGroup>();

  parsed.data.forEach((row, index) => {
    const slug = (row["list slug"] ?? "").trim();
    const recordType: "individual" | "relay" =
      (row["record type"] ?? "").trim().toLowerCase() === "relay" ? "relay" : "individual";

    const { record, error } = parseRecordRow(row, { relay: recordType === "relay", scope }, index + 2);
    if (error) {
      errors.push(error);
      return;
    }
    if (!record) return;

    let group = bySlug.get(slug);
    if (!group) {
      group = {
        slug,
        title: (row["list title"] ?? "").trim(),
        courseType: asCourse(row["course"]),
        gender: asGender(row["gender"]),
        recordType,
        rows: [],
      };
      bySlug.set(slug, group);
    }

    const recordId = (row["record id"] ?? "").trim() || null;
    const supersededBy = (row["superseded by"] ?? "").trim() || null;
    // Default missing "Is Current" to true so hand-authored files (no linkage
    // columns) treat every row as a live record.
    const isCurrent = row["is current"] === undefined ? true : truthy(row["is current"]);

    group.rows.push({ recordId, isCurrent, supersededBy, record });
  });

  return { groups: [...bySlug.values()], errors };
}
```

(Merge the new imports with the file's existing import block; do not duplicate the `Papa` import.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- combined-csv`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/combined-csv.ts lib/combined-csv.test.ts
git commit -m "feat: parseCombinedCsv parse-and-group step"
```

---

## Task 5: `planReconciliation` (history-aware planner)

**Files:**
- Modify: `lib/combined-csv.ts`
- Test: `lib/combined-csv.test.ts`

**Interfaces:**
- Consumes: `CombinedGroup`, `CombinedRow`, `SwimRecord`, `CSVRecord`, `ListScope`.
- Produces the plan types and `planReconciliation`:

```ts
export type RecordOp =
  | { kind: "update"; id: string; fields: CSVRecord }
  | { kind: "insert"; fields: CSVRecord; sortOrder: number }
  | { kind: "supersede"; oldId: string; fields: CSVRecord; sortOrder: number };

export interface CreateRow { fields: CSVRecord; isCurrent: boolean; csvRecordId: string | null; supersededByCsvId: string | null; sortOrder: number; }

export interface ListPlan {
  slug: string;
  title: string;
  courseType: "SCM" | "SCY" | "LCM";
  gender: "male" | "female" | "mixed" | null;
  recordType: "individual" | "relay";
  scope: ListScope;
  action: "update" | "create";
  ops: RecordOp[];         // action === "update"
  createRows: CreateRow[]; // action === "create"
  flags: string[];         // human-readable warnings for the preview
}

export function planReconciliation(
  group: CombinedGroup,
  existingList: { id: string } | null,
  existingRecords: SwimRecord[],
  scope: ListScope
): ListPlan;
```

**Algorithm (encode exactly):**

*Slot key:* `slotKey(r) = r.event_name.toLowerCase().trim() + "|" + (r.age_group ?? "")`.

*action === "create"* (`existingList === null`): partition rows by `isCurrent`. Current rows → `CreateRow` with `sortOrder = ordinal among current rows (0-based)`. History rows → `CreateRow` with `sortOrder = 0` (executor re-derives from the linked current row). If a history row's `supersededBy` is not a `csvRecordId` present among the current rows, push flag `"history row for <event> has no matching current record — skipped"` and DROP it.

*action === "update"* (`existingList !== null`): build `byId = Map(existingRecords by id)`; `currentBySlot = Map<slotKey, SwimRecord[]>` over `existingRecords.filter(is_current)` (snapshot; not mutated during the pass); `maxSort = max(sort_order)` over existingRecords, default -1; a running `appendCounter` starting at `maxSort + 1`; and `supersededOldIds = new Set<string>()`.

For each row in `group.rows`:
1. `row.recordId` is set **and** `byId.has(row.recordId)` → push `{kind:"update", id:row.recordId, fields:row.record}`.
2. Else if `row.isCurrent === false` → this is an orphan history row against an existing list; push flag `"history row for <event> has no matching record — skipped"`; DROP.
3. Else (a new current row): compute `slot = slotKey(row.record)`; `inSlot = currentBySlot.get(slot) ?? []`.
   - `inSlot.length === 1` and `row.record.time_ms < inSlot[0].time_ms`:
     - If `supersededOldIds.has(inSlot[0].id)` → push flag `"multiple new records break the same record (<event>) — added as new instead"`; push `{kind:"insert", fields:row.record, sortOrder: appendCounter++}`.
     - Else → `supersededOldIds.add(inSlot[0].id)`; push `{kind:"supersede", oldId: inSlot[0].id, fields: row.record, sortOrder: inSlot[0].sort_order}`.
   - `inSlot.length === 1` and `row.record.time_ms >= inSlot[0].time_ms` → push flag `"<event>: new time is not faster than the current record — added as a separate record"`; push `{kind:"insert", fields:row.record, sortOrder: appendCounter++}`.
   - `inSlot.length === 0` → push `{kind:"insert", fields:row.record, sortOrder: appendCounter++}` (no flag).
   - `inSlot.length > 1` → push flag `"<event> (<age group>): more than one current record in this slot — added as new, not auto-superseded"`; push `{kind:"insert", fields:row.record, sortOrder: appendCounter++}`.

- [ ] **Step 1: Write the failing test** — add to `lib/combined-csv.test.ts` (reuse the `rec` helper from Task 3; add a `csvRec` helper):

```ts
import { planReconciliation, type CombinedGroup } from "./combined-csv";
import type { CSVRecord } from "@/lib/csv-parser";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- combined-csv`
Expected: FAIL — `planReconciliation is not a function`.

- [ ] **Step 3: Implement** — add to `lib/combined-csv.ts` the types from the Interfaces block above and:

```ts
import type { SwimRecord } from "@/types/database";

const slotKey = (r: { event_name: string; age_group: string | null }): string =>
  `${r.event_name.toLowerCase().trim()}|${r.age_group ?? ""}`;

export function planReconciliation(
  group: CombinedGroup,
  existingList: { id: string } | null,
  existingRecords: SwimRecord[],
  scope: ListScope
): ListPlan {
  const base = {
    slug: group.slug, title: group.title, courseType: group.courseType,
    gender: group.gender, recordType: group.recordType, scope,
  };

  if (!existingList) {
    const flags: string[] = [];
    const createRows: CreateRow[] = [];
    const currentCsvIds = new Set(
      group.rows.filter((r) => r.isCurrent && r.recordId).map((r) => r.recordId as string)
    );
    let ordinal = 0;
    for (const row of group.rows) {
      if (row.isCurrent) {
        createRows.push({
          fields: row.record, isCurrent: true, csvRecordId: row.recordId,
          supersededByCsvId: null, sortOrder: ordinal++,
        });
      } else {
        if (!row.supersededBy || !currentCsvIds.has(row.supersededBy)) {
          flags.push(`history row for ${row.record.event_name} has no matching current record — skipped`);
          continue;
        }
        createRows.push({
          fields: row.record, isCurrent: false, csvRecordId: row.recordId,
          supersededByCsvId: row.supersededBy, sortOrder: 0,
        });
      }
    }
    return { ...base, action: "create", ops: [], createRows, flags };
  }

  const byId = new Map(existingRecords.map((r) => [r.id, r]));
  const currentBySlot = new Map<string, SwimRecord[]>();
  for (const r of existingRecords) {
    if (!r.is_current) continue;
    const k = slotKey(r);
    currentBySlot.set(k, [...(currentBySlot.get(k) ?? []), r]);
  }
  let appendCounter = existingRecords.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
  const supersededOldIds = new Set<string>();
  const ops: RecordOp[] = [];
  const flags: string[] = [];

  for (const row of group.rows) {
    if (row.recordId && byId.has(row.recordId)) {
      ops.push({ kind: "update", id: row.recordId, fields: row.record });
      continue;
    }
    if (!row.isCurrent) {
      flags.push(`history row for ${row.record.event_name} has no matching record — skipped`);
      continue;
    }
    const inSlot = currentBySlot.get(slotKey(row.record)) ?? [];
    if (inSlot.length === 1 && row.record.time_ms < inSlot[0].time_ms) {
      if (supersededOldIds.has(inSlot[0].id)) {
        flags.push(`multiple new records break the same record (${row.record.event_name}) — added as new instead`);
        ops.push({ kind: "insert", fields: row.record, sortOrder: appendCounter++ });
      } else {
        supersededOldIds.add(inSlot[0].id);
        ops.push({ kind: "supersede", oldId: inSlot[0].id, fields: row.record, sortOrder: inSlot[0].sort_order });
      }
    } else if (inSlot.length === 1) {
      flags.push(`${row.record.event_name}: new time is not faster than the current record — added as a separate record`);
      ops.push({ kind: "insert", fields: row.record, sortOrder: appendCounter++ });
    } else if (inSlot.length === 0) {
      ops.push({ kind: "insert", fields: row.record, sortOrder: appendCounter++ });
    } else {
      flags.push(`${row.record.event_name} (${row.record.age_group ?? "no age group"}): more than one current record in this slot — added as new, not auto-superseded`);
      ops.push({ kind: "insert", fields: row.record, sortOrder: appendCounter++ });
    }
  }
  return { ...base, action: "update", ops, createRows: [], flags };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- combined-csv`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/combined-csv.ts lib/combined-csv.test.ts
git commit -m "feat: planReconciliation history-aware planner"
```

---

## Task 6: Wire the export button

**Files:**
- Modify: `app/(dashboard)/dashboard/records/page.tsx:157-235` (`handleExportCSV`)

**Interfaces:**
- Consumes: `buildCombinedCsv` (`@/lib/combined-csv`).

- [ ] **Step 1: Replace the imports and handler**

At the top of the file, replace the `formatMsToTime` import with:

```ts
import { buildCombinedCsv } from "@/lib/combined-csv";
```

(Remove the now-unused `formatMsToTime` import. Keep `SwimRecord`/`RecordList` type imports.)

Replace the whole `handleExportCSV` body (lines 157–235) with:

```ts
  const handleExportCSV = async () => {
    if (!selectedClub) return;
    setIsExporting(true);
    try {
      const supabase = createClient();

      const { data: lists } = await supabase
        .from("record_lists")
        .select("*")
        .eq("club_id", selectedClub.id)
        .order("title");
      if (!lists || lists.length === 0) return;

      const listIds = lists.map((l) => l.id);
      const { data: records } = await supabase
        .from("records")
        .select("*")
        .in("record_list_id", listIds)
        .order("sort_order");
      if (!records) return;

      // Group records by list, current rows before their history within a list.
      const byList = new Map<string, SwimRecord[]>();
      for (const r of records as SwimRecord[]) {
        byList.set(r.record_list_id, [...(byList.get(r.record_list_id) ?? []), r]);
      }
      for (const [id, recs] of byList) {
        recs.sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return (a.is_current ? 0 : 1) - (b.is_current ? 0 : 1);
        });
        byList.set(id, recs);
      }

      const csvContent = buildCombinedCsv(lists as RecordList[], byList);

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedClub.slug}-records.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[mutation] dashboard: export CSV", e);
      alert("Something went wrong. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };
```

- [ ] **Step 2: Typecheck & lint**

Run: `npm run lint`
Expected: no errors (in particular, no unused-import error for `formatMsToTime`).

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. On `/dashboard/records` for a club that has at least one list with record history, click **Export CSV**. Open the file and confirm:
- Header row equals the `COMBINED_COLUMNS` order.
- Each list's rows carry `List Slug`, `Course`, `Record Type`.
- Historical rows appear with `Is Current` blank and a `Superseded By` value that matches a current row's `Record ID`.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/dashboard/records/page.tsx"
git commit -m "feat: combined CSV export with list metadata and history"
```

---

## Task 7: Wire the combined re-import (bulk-upload page)

**Files:**
- Modify: `app/(dashboard)/dashboard/records/bulk-upload/page.tsx`

**Interfaces:**
- Consumes: `parseCombinedCsv`, `planReconciliation`, `ListPlan`, `RecordOp`, `CreateRow` (`@/lib/combined-csv`); `scopeForClubLevel` (already imported); `createClient`, `useClub` (already imported).

This task adds a second import mode to the existing page. Keep the current filename-per-list flow intact; add a mode toggle. The combined mode: pick a file → parse → build plans against the DB → show a confirm preview (counts + flags) → on confirm, execute plans → show per-list results.

- [ ] **Step 1: Add the parse + plan builder**

Add a mode state and a handler that reads the file, parses it, and builds one `ListPlan` per group by fetching that list's existing records. Insert near the existing handlers:

```ts
import { parseCombinedCsv, planReconciliation, type ListPlan, type RecordOp, type CreateRow } from "@/lib/combined-csv";

// ...inside the component:
const [mode, setMode] = useState<"per-list" | "combined">("per-list");
const [plans, setPlans] = useState<ListPlan[] | null>(null);
const [planErrors, setPlanErrors] = useState<string[]>([]);

const handleCombinedFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file || !selectedClub) return;
  const content = await file.text();
  const scope = scopeForClubLevel(selectedClub.level);
  const { groups, errors } = parseCombinedCsv(content, scope);
  setPlanErrors(errors);

  const supabase = createClient();
  const built: ListPlan[] = [];
  for (const group of groups) {
    let existingList: { id: string } | null = null;
    let existingRecords: import("@/types/database").SwimRecord[] = [];
    if (group.slug) {
      const { data: list } = await supabase
        .from("record_lists")
        .select("id")
        .eq("club_id", selectedClub.id)
        .eq("slug", group.slug)
        .maybeSingle();
      if (list) {
        existingList = { id: list.id };
        const { data: recs } = await supabase
          .from("records")
          .select("*")
          .eq("record_list_id", list.id);
        existingRecords = (recs as import("@/types/database").SwimRecord[]) ?? [];
      }
    }
    built.push(planReconciliation(group, existingList, existingRecords, scope));
  }
  setPlans(built);
  setResults(null);
};
```

- [ ] **Step 2: Add the executor**

Add a function that applies the plans. It must never delete; it inserts one-by-one to capture generated ids (mirroring `handleSaveRecords`). Insert after `handleCombinedFile`:

```ts
const insertRecord = async (
  supabase: ReturnType<typeof createClient>,
  listId: string,
  fields: CreateRow["fields"],
  sortOrder: number,
  isCurrent: boolean,
  supersededBy: string | null
) => {
  const { data, error } = await supabase
    .from("records")
    .insert({
      record_list_id: listId,
      event_name: fields.event_name,
      time_ms: fields.time_ms,
      swimmer_name: fields.swimmer_name,
      swimmer_name_2: fields.swimmer_name_2,
      swimmer_name_3: fields.swimmer_name_3,
      swimmer_name_4: fields.swimmer_name_4,
      age_group: fields.age_group,
      record_club: fields.record_club,
      province: fields.province,
      record_date: fields.record_date,
      location: fields.location,
      split_times: fields.split_times,
      sort_order: sortOrder,
      is_national: fields.is_national,
      is_current_national: fields.is_current_national,
      is_provincial: fields.is_provincial,
      is_current_provincial: fields.is_current_provincial,
      is_split: fields.is_split,
      is_relay_split: fields.is_relay_split,
      is_new: fields.is_new,
      is_world_record: fields.is_world_record,
      is_current: isCurrent,
      superseded_by: supersededBy,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
};

const executePlans = async () => {
  if (!selectedClub || !plans) return;
  setUploading(true);
  const supabase = createClient();
  const success: string[] = [];
  const failed: string[] = [];

  for (const plan of plans) {
    try {
      let listId: string;
      if (plan.action === "create") {
        const slug =
          plan.slug ||
          plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const { data: listData, error } = await supabase
          .from("record_lists")
          .insert({
            club_id: selectedClub.id,
            title: plan.title,
            slug,
            course_type: plan.courseType,
            gender: plan.gender,
            record_type: plan.recordType,
            scope: plan.scope,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        listId = listData.id;

        // Insert current rows, mapping csv id -> new db id, then history rows.
        const idMap = new Map<string, string>();
        for (const cr of plan.createRows.filter((r) => r.isCurrent)) {
          const newId = await insertRecord(supabase, listId, cr.fields, cr.sortOrder, true, null);
          if (cr.csvRecordId) idMap.set(cr.csvRecordId, newId);
        }
        for (const cr of plan.createRows.filter((r) => !r.isCurrent)) {
          const parentId = cr.supersededByCsvId ? idMap.get(cr.supersededByCsvId) ?? null : null;
          await insertRecord(supabase, listId, cr.fields, cr.sortOrder, false, parentId);
        }
      } else {
        // action === "update": re-resolve the list id by slug to apply ops.
        const { data: list } = await supabase
          .from("record_lists")
          .select("id")
          .eq("club_id", selectedClub.id)
          .eq("slug", plan.slug)
          .maybeSingle();
        if (!list) throw new Error("list vanished");
        listId = list.id;

        for (const op of plan.ops) {
          if (op.kind === "update") {
            const { error } = await supabase.from("records").update({
              event_name: op.fields.event_name, time_ms: op.fields.time_ms,
              swimmer_name: op.fields.swimmer_name, swimmer_name_2: op.fields.swimmer_name_2,
              swimmer_name_3: op.fields.swimmer_name_3, swimmer_name_4: op.fields.swimmer_name_4,
              age_group: op.fields.age_group, record_club: op.fields.record_club,
              province: op.fields.province, record_date: op.fields.record_date,
              location: op.fields.location, split_times: op.fields.split_times,
              is_national: op.fields.is_national, is_current_national: op.fields.is_current_national,
              is_provincial: op.fields.is_provincial, is_current_provincial: op.fields.is_current_provincial,
              is_split: op.fields.is_split, is_relay_split: op.fields.is_relay_split,
              is_new: op.fields.is_new, is_world_record: op.fields.is_world_record,
            }).eq("id", op.id);
            if (error) throw new Error(error.message);
          } else if (op.kind === "insert") {
            await insertRecord(supabase, listId, op.fields, op.sortOrder, true, null);
          } else {
            // supersede: insert new current, mark old, re-parent ancestors
            const newId = await insertRecord(supabase, listId, op.fields, op.sortOrder, true, null);
            const { error: e1 } = await supabase.from("records")
              .update({ superseded_by: newId, is_current: false }).eq("id", op.oldId);
            if (e1) throw new Error(e1.message);
            await supabase.from("records").update({ superseded_by: newId }).eq("superseded_by", op.oldId);
          }
        }
      }
      success.push(`${plan.title}: ${plan.action === "create" ? "created" : "updated"}`);
    } catch (err) {
      failed.push(`${plan.title}: ${(err as Error).message}`);
    }
  }

  setResults({ success, failed });
  setPlans(null);
  setUploading(false);
};
```

- [ ] **Step 3: Add the mode toggle + combined UI**

Add a toggle between "Files per list" and "Combined CSV". In combined mode render a file input calling `handleCombinedFile`, then when `plans` is set render the preview: per plan show title, action (Create/Update), and counts derived from `plan.ops`/`plan.createRows` — updates (`ops.filter(o=>o.kind==="update").length`), new records (`insert` + created current rows), supersessions (`ops.filter(o=>o.kind==="supersede").length`) — plus `plan.flags` as a warning list, `planErrors` if any, and a reassurance line: "Existing records not in this file are kept." Add a **Confirm & import** button calling `executePlans` (disabled while `uploading`). Reuse the existing `results` success/failed rendering block.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification (round-trip)**

Run: `npm run dev`.
1. Export a club's CSV (Task 6).
2. On `/dashboard/records/bulk-upload`, choose **Combined CSV**, select the exported file. The preview should show every list as **Update**, 0 supersessions, 0 new records, no flags. Confirm → verify in the DB (or the record pages) that record counts and history are unchanged (no deletions).
3. Edit the CSV: add a new row in an existing list's slot with **no Record ID** and a faster time than the current record. Re-import → preview shows 1 supersession. Confirm → the old record is now history (`is_current=false`, `superseded_by` = the new row) and still present.
4. Delete a whole list in the app, then re-import the original CSV → that list is **Create**d and its history chain is rebuilt (historical rows present and linked).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/records/bulk-upload/page.tsx"
git commit -m "feat: combined CSV re-import with history-aware reconciliation"
```

---

## Self-Review Notes

- **Spec coverage:** export format → Tasks 1,3,6; identity+linkage columns → Task 3; `Papa.unparse` → Task 3; parse+group → Task 4; non-destructive history-aware reconciliation (match-by-id, supersede-on-faster, never-delete, ambiguous-slot flag, create/restore chain rebuild) → Task 5,7; confirm preview → Task 7; `is_world_record` written → Task 7 `insertRecord`; `is_relaysplit` alias → Task 2; scope from club level → Tasks 4,7. AI-import-prompt update is explicitly out of scope in the spec.
- **Type consistency:** `CSVRecord` (from `@/lib/csv-parser`) is the single field carrier across `parseCombinedCsv`, `planReconciliation`, and the executor. `ListPlan.action` drives `ops` vs `createRows`. `insertRecord` signature is shared by create and update paths.
- **Known limitation (documented in preview flags):** slot matching is `event_name + age_group`; slots with more than one current record (e.g. a split alongside a full record) are never auto-superseded — the new row is added and flagged for human review.
