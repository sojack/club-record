# RecordTable Pure-Logic Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract RecordTable's pure logic into `lib/record-table-utils.ts` with direct unit tests, then thin `components/RecordTable.tsx` to call the helpers — behavior-preserving.

**Architecture:** Task 1 creates the standalone, unit-tested module (types + 11 pure helpers, lifted verbatim). Task 2 rewrites RecordTable to import + re-export from it and reduce its handlers to thin wrappers. The existing `RecordTable.test.tsx` (10 RTL tests) is the behavior safety net.

**Tech Stack:** TypeScript, React 19, Vitest (node env for the new unit tests).

**Spec:** `docs/superpowers/specs/2026-06-04-recordtable-extract-pure-logic-design.md`

**Conventions:**
- Run commands from `/Users/jackso/code/ClubRecordProject/club-record`.
- **Commits are LOCAL ONLY. Never `git push`.** No `Co-Authored-By` trailer.
- Lint is a hard gate (`eslint . --max-warnings 0`).
- Behavior-preserving: do not change any field defaults, ordering, or markup.

---

## File Structure

| File | Change |
|------|--------|
| `lib/record-table-utils.ts` | **Create** — types + 11 pure helpers |
| `lib/record-table-utils.test.ts` | **Create** — node-env unit tests |
| `components/RecordTable.tsx` | Import/re-export from the module; thin the handlers; delete the inline copies |
| `TECH_DEBT.md` | Note the refactor done |

---

## Task 1: Create `lib/record-table-utils.ts` + unit tests

**Files:**
- Create: `lib/record-table-utils.ts`
- Create: `lib/record-table-utils.test.ts`

- [ ] **Step 1: Create the module**

```ts
import type { SwimRecord } from "@/types/database";

export interface EditableRecord
  extends Omit<SwimRecord, "id" | "created_at" | "updated_at" | "record_list_id"> {
  id?: string;
  isNew?: boolean;
  _breakingRecordId?: string;
}

export type RecordFlagType =
  | "is_national"
  | "is_current_national"
  | "is_provincial"
  | "is_current_provincial"
  | "is_split"
  | "is_relay_split"
  | "is_new"
  | "is_world_record";

export interface HistoryFlagUpdate {
  id: string;
  flags: Record<RecordFlagType, boolean>;
}

export function getStandardEvents(courseType?: string): string[] {
  const events = [
    "50 Free", "100 Free", "200 Free", "400 Free", "800 Free", "1500 Free",
    "50 Back", "100 Back", "200 Back",
    "50 Breast", "100 Breast", "200 Breast",
    "50 Fly", "100 Fly", "200 Fly",
  ];
  if (courseType !== "LCM") {
    events.push("100 IM");
  }
  events.push("200 IM", "400 IM");
  return events;
}

export function mapRecordToEditable(r: SwimRecord): EditableRecord {
  return {
    id: r.id,
    event_name: r.event_name,
    time_ms: r.time_ms,
    swimmer_name: r.swimmer_name,
    swimmer_name_2: r.swimmer_name_2,
    swimmer_name_3: r.swimmer_name_3,
    swimmer_name_4: r.swimmer_name_4,
    age_group: r.age_group,
    record_club: r.record_club,
    province: r.province,
    record_date: r.record_date,
    location: r.location,
    sort_order: r.sort_order,
    is_national: r.is_national || false,
    is_current_national: r.is_current_national || false,
    is_provincial: r.is_provincial || false,
    is_current_provincial: r.is_current_provincial || false,
    is_split: r.is_split || false,
    is_relay_split: r.is_relay_split || false,
    is_new: r.is_new || false,
    is_world_record: r.is_world_record || false,
    superseded_by: r.superseded_by,
    is_current: r.is_current ?? true,
  };
}

export function makeEmptyRecord(sortOrder: number): EditableRecord {
  return {
    event_name: "",
    time_ms: 0,
    swimmer_name: "",
    swimmer_name_2: null,
    swimmer_name_3: null,
    swimmer_name_4: null,
    age_group: null,
    record_club: null,
    province: null,
    record_date: null,
    location: null,
    sort_order: sortOrder,
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
    isNew: true,
  };
}

export function makeBreakingRecord(oldRecord: EditableRecord): EditableRecord {
  return {
    event_name: oldRecord.event_name,
    time_ms: 0,
    swimmer_name: "",
    swimmer_name_2: null,
    swimmer_name_3: null,
    swimmer_name_4: null,
    age_group: null,
    record_club: null,
    province: null,
    record_date: null,
    location: null,
    sort_order: oldRecord.sort_order,
    is_national: false,
    is_current_national: false,
    is_provincial: false,
    is_current_provincial: false,
    is_split: false,
    is_relay_split: false,
    is_new: true,
    is_world_record: false,
    superseded_by: null,
    is_current: true,
    isNew: true,
    _breakingRecordId: oldRecord.id,
  };
}

export function buildStandardEventRows(opts: {
  isRelay: boolean;
  courseType?: "LCM" | "SCM" | "SCY";
  relayEvents: string[];
  ageGroups: string[];
  existing: EditableRecord[];
  startSortOrder: number;
}): EditableRecord[] {
  const { isRelay, courseType, relayEvents, ageGroups, existing, startSortOrder } = opts;
  const standardEvents = isRelay
    ? relayEvents.flatMap((ev) => ageGroups.map((ag) => ({ event: ev, ageGroup: ag })))
    : getStandardEvents(courseType).map((event) => ({ event, ageGroup: null as string | null }));
  const existingKeys = new Set(
    existing.map((r) => `${r.event_name.toLowerCase()}|${r.age_group ?? ""}`)
  );
  const newPairs = standardEvents.filter(
    ({ event, ageGroup }) =>
      !existingKeys.has(`${event.toLowerCase()}|${ageGroup ?? ""}`)
  );

  return newPairs.map(({ event, ageGroup }, i) => ({
    event_name: event,
    time_ms: 0,
    swimmer_name: "",
    swimmer_name_2: null,
    swimmer_name_3: null,
    swimmer_name_4: null,
    age_group: ageGroup,
    record_club: null,
    province: null,
    record_date: null,
    location: null,
    sort_order: startSortOrder + i,
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
    isNew: true,
  }));
}

export function buildHistoryMap(records: SwimRecord[]): Map<string, SwimRecord[]> {
  const historyRecords = records.filter((r) => r.is_current === false);
  const historyByRecordId = new Map<string, SwimRecord[]>();
  historyRecords.forEach((hr) => {
    if (hr.superseded_by) {
      const existing = historyByRecordId.get(hr.superseded_by) || [];
      existing.push(hr);
      historyByRecordId.set(hr.superseded_by, existing);
    }
  });
  historyByRecordId.forEach((recs, key) => {
    recs.sort((a, b) => {
      if (!a.record_date && !b.record_date) return 0;
      if (!a.record_date) return 1;
      if (!b.record_date) return -1;
      return b.record_date.localeCompare(a.record_date);
    });
    historyByRecordId.set(key, recs);
  });
  return historyByRecordId;
}

export function filterSavableRecords(records: EditableRecord[]): EditableRecord[] {
  return records.filter((r) => r.event_name.trim() !== "");
}

export function buildHistoryUpdates(
  edited: Map<string, SwimRecord>
): HistoryFlagUpdate[] {
  return Array.from(edited.entries()).map(([id, record]) => ({
    id,
    flags: {
      is_national: record.is_national || false,
      is_current_national: record.is_current_national || false,
      is_provincial: record.is_provincial || false,
      is_current_provincial: record.is_current_provincial || false,
      is_split: record.is_split || false,
      is_relay_split: record.is_relay_split || false,
      is_new: record.is_new || false,
      is_world_record: record.is_world_record || false,
    },
  }));
}

export function getColumnConfig(opts: {
  recordType: "individual" | "relay";
  scope: "club" | "provincial" | "national";
}): { isRelay: boolean; showHolderClub: boolean; showProvince: boolean; showAgeGroup: boolean } {
  const isRelay = opts.recordType === "relay";
  const showHolderClub = opts.scope !== "club";
  const showProvince = opts.scope === "national";
  const showAgeGroup = isRelay || showHolderClub;
  return { isRelay, showHolderClub, showProvince, showAgeGroup };
}

export function computeAgeGroupOptions(
  ageGroups: string[],
  records: SwimRecord[]
): string[] {
  return Array.from(
    new Set([
      ...ageGroups,
      ...records
        .map((r) => r.age_group)
        .filter((a): a is string => !!a && a.trim() !== ""),
    ])
  );
}

export function reorderRecords(
  records: EditableRecord[],
  index: number,
  direction: "up" | "down"
): EditableRecord[] {
  if (
    (direction === "up" && index === 0) ||
    (direction === "down" && index === records.length - 1)
  ) {
    return records; // bounds no-op: same reference, caller skips the update
  }
  const newRecords = [...records];
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  [newRecords[index], newRecords[targetIndex]] = [
    newRecords[targetIndex],
    newRecords[index],
  ];
  newRecords.forEach((r, i) => {
    r.sort_order = i;
  });
  return newRecords;
}
```

- [ ] **Step 2: Create the unit tests**

```ts
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
```

- [ ] **Step 3: Run the unit tests + type-check**

Run: `npx vitest run lib/record-table-utils.test.ts`
Expected: all green.

Run: `npx tsc --noEmit`
Expected: exit 0. (RecordTable.tsx still has its own copies at this point — no conflict; they're separate files.)

- [ ] **Step 4: Commit**

```bash
git add lib/record-table-utils.ts lib/record-table-utils.test.ts
git commit -m "feat(records): extract RecordTable pure logic into tested lib module"
```

---

## Task 2: Refactor `components/RecordTable.tsx` to use the module

**Files:**
- Modify: `components/RecordTable.tsx`

**Read the file first.** All edits are behavior-preserving — only the *source* of the logic moves.

- [ ] **Step 1: Delete the inline type + function copies**

Remove these blocks (now provided by the module):
- The `interface EditableRecord { … }`, `export type RecordFlagType = …`, and `export interface HistoryFlagUpdate { … }` declarations (near the top).
- The module-level `function getStandardEvents(courseType?: string): string[] { … }`.
- The inline `const mapRecordToEditable = (r: SwimRecord): EditableRecord => ({ … });` inside the component.

- [ ] **Step 2: Add the import + type re-export**

After the existing imports (next to `import RecordFlags from "./RecordFlags";`), add:

```tsx
import {
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
  type RecordFlagType,
  type HistoryFlagUpdate,
} from "@/lib/record-table-utils";

export type { EditableRecord, RecordFlagType, HistoryFlagUpdate };
```

Note: `getStandardEvents` is intentionally NOT imported — after Step 1 the
component no longer calls it directly (it lives inside `buildStandardEventRows`
now). Importing it would be an unused import and fail the lint gate. If, after
your edits, `tsc`/lint reports any of the imported names as unused (i.e. a call
site you didn't convert), that's a signal you missed a replacement — fix the
call site rather than the import.

- [ ] **Step 3: Replace the derived constants**

At the top of the component body, replace the inline `isRelay` / `showHolderClub`
/ `showProvince` / `showAgeGroup` declarations and the `ageGroupOptions` block
with:

```tsx
const { isRelay, showHolderClub, showProvince, showAgeGroup } = getColumnConfig({
  recordType,
  scope,
});
const ageGroupOptions = computeAgeGroupOptions(ageGroups, records);
```

Keep the `currentRecords` and `historyRecords` consts as they are (they are used
elsewhere: initial state, the records-sync effect, and `toggleHistoryFlag`).

- [ ] **Step 4: Replace the history-map build**

Replace the inline `historyByRecordId` construction + sort loop (the
`const historyByRecordId = new Map…` block through the `.forEach(…sort…)`) with:

```tsx
const historyByRecordId = buildHistoryMap(records);
```

- [ ] **Step 5: Thin the handlers**

Replace each handler body (keep the surrounding `const name = … => { … }` and any
guard lines noted):

`addRow`:
```tsx
const addRow = () => {
  setEditableRecords([...editableRecords, makeEmptyRecord(editableRecords.length)]);
  setHasChanges(true);
};
```

`breakRecord` (keep the leading guard):
```tsx
const breakRecord = (index: number) => {
  const oldRecord = editableRecords[index];
  if (!oldRecord.id) return; // Can't break a new record
  const newRecords = [...editableRecords];
  newRecords.splice(index + 1, 0, makeBreakingRecord(oldRecord));
  setEditableRecords(newRecords);
  setHasChanges(true);
};
```

`addStandardEvents`:
```tsx
const addStandardEvents = () => {
  const newRecords = buildStandardEventRows({
    isRelay,
    courseType,
    relayEvents,
    ageGroups,
    existing: editableRecords,
    startSortOrder: editableRecords.length,
  });
  setEditableRecords([...editableRecords, ...newRecords]);
  setHasChanges(true);
};
```

`handleSave` — replace only the `validRecords` and `historyUpdates` derivations
(keep the `setSaving`/`try`/`finally`, the `await onSave(...)`, and
`setHasChanges(false)`):
```tsx
const handleSave = async () => {
  setSaving(true);
  try {
    const validRecords = filterSavableRecords(editableRecords);
    const historyUpdates = buildHistoryUpdates(editedHistoryRecords);
    await onSave(validRecords, historyUpdates.length > 0 ? historyUpdates : undefined);
    setHasChanges(false);
  } finally {
    setSaving(false);
  }
};
```

`moveRow`:
```tsx
const moveRow = (index: number, direction: "up" | "down") => {
  const next = reorderRecords(editableRecords, index, direction);
  if (next === editableRecords) return; // bounds no-op
  setEditableRecords(next);
  setHasChanges(true);
};
```

The two `mapRecordToEditable(...)` call sites (the `useState` initializer and the
records-sync `useEffect`) stay exactly as written — they now resolve to the
imported function.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (If it reports a duplicate-identifier or unused-var error,
you left an inline copy behind, or `getStandardEvents` is unused — fix per Step 2.)

- [ ] **Step 7: Run the RTL suite + lint**

Run: `npx vitest run components/RecordTable.test.tsx`
Expected: 10 passed (behavior unchanged).

Run: `npm run lint`
Expected: exit 0 (`--max-warnings 0`).

- [ ] **Step 8: Commit**

```bash
git add components/RecordTable.tsx
git commit -m "refactor(records): RecordTable delegates pure logic to lib module"
```

---

## Task 3: Verify + update TECH_DEBT

**Files:**
- Modify: `TECH_DEBT.md`

- [ ] **Step 1: Full gate**

Run: `npx vitest run`
Expected: all green (113 prior + the new `record-table-utils` unit tests).

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run lint` → exit 0.
Run: `npm run build` → clean.

- [ ] **Step 2: Update `TECH_DEBT.md`**

In the High #1 test-coverage item, update the "Still uncovered" note: RecordTable's
pure logic is now extracted to `lib/record-table-utils.ts` and directly unit-tested
(builders, save filter, history map, history updates, column config, age-group
options, reorder, standard-events) — so the previously-deferred flag/break/
standard-events/reorder *logic* is covered; what remains is the flag-menu /
history-edit *rendering* and a future JSX sub-component split. Reference
`docs/superpowers/{specs,plans}/2026-06-04-recordtable-extract-pure-logic.*`.

- [ ] **Step 3: Commit**

```bash
git add TECH_DEBT.md
git commit -m "docs: record RecordTable pure-logic extraction in TECH_DEBT"
```

---

## Self-Review Notes (for the executor)

- **Behavior-preserving:** field defaults, the history sort, the dedup key, and
  the `sort_order` reassignment are lifted verbatim. The `RecordTable.test.tsx`
  RTL suite (Task 2 Step 7) is the proof nothing changed.
- **`reorderRecords` identity guard:** it returns the same array reference on a
  bounds no-op; the `moveRow` wrapper checks `next === editableRecords` and
  returns early, exactly matching the old early-return (no `setHasChanges` on a
  no-op).
- **Type re-export** keeps `app/(dashboard)/dashboard/records/[listId]/page.tsx`
  (which imports `HistoryFlagUpdate` from `@/components/RecordTable`) working
  unchanged — do not edit that import.
- **Order of tasks matters:** Task 1's module + tests land and pass *before*
  RecordTable is touched, so a Task 2 mistake is caught against a known-good,
  tested module.
```
