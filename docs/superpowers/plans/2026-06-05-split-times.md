# Split Times Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store per-distance swim split times on records and display them (cumulative + per-segment delta) via the existing expand control on the public pages and read-only in the editor.

**Architecture:** A nullable `split_times JSONB` column on `records` holds an ordered array of cumulative splits. Splits arrive through the normal CSV bulk-upload via a new optional `Splits` column parsed by `parseRecordsCSV`. A pure `lib/split-utils.ts` handles parsing and delta computation; the public `PublicRecordSearch` and editor `RecordTable` reuse their existing ▶ expander to show a splits block. The Lenex generator (outside the repo) emits the `Splits` column.

**Tech Stack:** TypeScript, React 19, Supabase (Postgres JSONB), Vitest 4 (node + jsdom), Papa Parse.

**Reference spec:** `docs/superpowers/specs/2026-06-05-split-times-design.md`

---

## File Structure

- **Create** `supabase/migrations/add_split_times.sql` — adds the column.
- **Modify** `types/database.ts` — `SplitTime` interface + `SwimRecord.split_times`.
- **Create** `lib/split-utils.ts` + `lib/split-utils.test.ts` — pure parse + delta helpers.
- **Modify** `lib/csv-parser.ts` — parse the `Splits` column into `CSVRecord.split_times`.
- **Modify** `lib/csv-parser.test.ts` — splits parsing cases.
- **Modify** `app/(dashboard)/dashboard/records/bulk-upload/page.tsx` — write `split_times` on insert.
- **Modify** `app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx` — expand on history-or-splits; render splits block.
- **Modify** `app/[clubSlug]/[recordSlug]/PublicRecordSearch.test.tsx` — splits render test.
- **Modify** `components/RecordTable.tsx` — expand on history-or-splits; render read-only splits block.
- **Modify** `SNC-new/generate_imports.py` (outside repo) — emit `Splits` column; regenerate.

Notes:
- `@/` maps to the `club-record/` root. Vitest collects `lib/**`, `app/**`, `components/**` `*.test.{ts,tsx}`; default env is `node`, component tests use a `// @vitest-environment jsdom` pragma (line 1).
- The editor **persist** path (`app/(dashboard)/dashboard/records/[listId]/page.tsx`) uses field-specific `.update({...})` calls that never reference `split_times`, so existing splits are preserved on edit with no change there. New hand-entered records correctly get `null`.

---

### Task 1: Schema column + types

**Files:**
- Create: `club-record/supabase/migrations/add_split_times.sql`
- Modify: `club-record/types/database.ts`

- [ ] **Step 1: Write the migration**

Create `club-record/supabase/migrations/add_split_times.sql`:

```sql
-- Per-distance cumulative split times for a record (null when unknown).
-- Shape: [{ "distance": 50, "ms": 29100 }, { "distance": 100, "ms": 62780 }]
-- Distinct from the is_split / is_relay_split boolean flags.
ALTER TABLE records ADD COLUMN IF NOT EXISTS split_times JSONB;
```

- [ ] **Step 2: Add the type**

In `club-record/types/database.ts`, immediately **above** `export interface SwimRecord {`, add:

```ts
export interface SplitTime {
  distance: number; // cumulative metres, e.g. 50, 100, 150
  ms: number;       // cumulative time in milliseconds
}
```

Then inside `interface SwimRecord`, directly after the `location: string | null;` line, add:

```ts
  split_times: SplitTime[] | null;
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: this will FAIL with errors in test/mock files that build a full `SwimRecord` without `split_times` (e.g. `components/RecordTable.test.tsx`, `app/[clubSlug]/[recordSlug]/PublicRecordSearch.test.tsx`). That is expected and fixed in Step 4.

- [ ] **Step 4: Add `split_times` to existing `rec()` test factories**

In each of these files, find the object literal returned by the `rec(...)` helper and add `split_times: null,` next to the other `SwimRecord` fields (e.g. after `location: null,`):
- `components/RecordTable.test.tsx`
- `app/[clubSlug]/[recordSlug]/PublicRecordSearch.test.tsx`

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/add_split_times.sql types/database.ts components/RecordTable.test.tsx "app/[clubSlug]/[recordSlug]/PublicRecordSearch.test.tsx"
git commit -m "feat(records): add split_times column and type"
```

---

### Task 2: Pure split helpers (`lib/split-utils.ts`)

**Files:**
- Create: `club-record/lib/split-utils.ts`
- Test: `club-record/lib/split-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `club-record/lib/split-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSplitsColumn, splitRows } from "./split-utils";

describe("parseSplitsColumn", () => {
  it("parses cumulative distance=time pairs into ms", () => {
    expect(parseSplitsColumn("50=29.10;100=1:02.78")).toEqual([
      { distance: 50, ms: 29100 },
      { distance: 100, ms: 62780 },
    ]);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseSplitsColumn(" 50=29.10 ; 100=1:02.78 ")).toEqual([
      { distance: 50, ms: 29100 },
      { distance: 100, ms: 62780 },
    ]);
  });

  it("returns null for empty or missing input", () => {
    expect(parseSplitsColumn("")).toBeNull();
    expect(parseSplitsColumn(undefined)).toBeNull();
  });

  it("throws on a pair with no '='", () => {
    expect(() => parseSplitsColumn("50=29.10;garbage")).toThrow(/Malformed split/);
  });

  it("throws on a non-integer distance", () => {
    expect(() => parseSplitsColumn("x=29.10")).toThrow(/Invalid split distance/);
  });

  it("throws on an unparseable time", () => {
    expect(() => parseSplitsColumn("50=abc")).toThrow(/Invalid split time/);
  });
});

describe("splitRows", () => {
  it("computes cumulative + per-segment deltas", () => {
    expect(
      splitRows([
        { distance: 50, ms: 29100 },
        { distance: 100, ms: 62780 },
        { distance: 150, ms: 98500 },
      ])
    ).toEqual([
      { distance: 50, cumulativeMs: 29100, deltaMs: 29100 },
      { distance: 100, cumulativeMs: 62780, deltaMs: 33680 },
      { distance: 150, cumulativeMs: 98500, deltaMs: 35720 },
    ]);
  });

  it("handles a single split", () => {
    expect(splitRows([{ distance: 50, ms: 29100 }])).toEqual([
      { distance: 50, cumulativeMs: 29100, deltaMs: 29100 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/split-utils.test.ts`
Expected: FAIL — `Failed to resolve import "./split-utils"`.

- [ ] **Step 3: Write the implementation**

Create `club-record/lib/split-utils.ts`:

```ts
import type { SplitTime } from "@/types/database";
import { parseTimeToMs } from "@/lib/time-utils";

/**
 * Parse the CSV `Splits` cell — cumulative `distance=time` pairs separated by
 * `;`, e.g. "50=29.10;100=1:02.78". Returns null for empty/missing input.
 * Throws a descriptive Error on a malformed pair so the importer can surface it.
 */
export function parseSplitsColumn(raw: string | undefined): SplitTime[] | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const out: SplitTime[] = [];
  for (const pairRaw of s.split(";")) {
    const pair = pairRaw.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) {
      throw new Error(`Malformed split "${pair}" (expected distance=time)`);
    }
    const distStr = pair.slice(0, eq).trim();
    const timeStr = pair.slice(eq + 1).trim();
    const distance = Number(distStr);
    if (!Number.isInteger(distance) || distance <= 0) {
      throw new Error(`Invalid split distance "${distStr}"`);
    }
    const ms = parseTimeToMs(timeStr);
    if (ms === 0) {
      throw new Error(`Invalid split time "${timeStr}"`);
    }
    out.push({ distance, ms });
  }
  return out.length > 0 ? out : null;
}

export interface SplitRow {
  distance: number;
  cumulativeMs: number;
  deltaMs: number;
}

/** Cumulative time per split plus the per-segment delta (first delta = itself). */
export function splitRows(splits: SplitTime[]): SplitRow[] {
  return splits.map((s, i) => ({
    distance: s.distance,
    cumulativeMs: s.ms,
    deltaMs: i === 0 ? s.ms : s.ms - splits[i - 1].ms,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/split-utils.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/split-utils.ts lib/split-utils.test.ts
git commit -m "feat(split-utils): parse splits column and compute deltas"
```

---

### Task 3: Importer parses the `Splits` column

**Files:**
- Modify: `club-record/lib/csv-parser.ts`
- Test: `club-record/lib/csv-parser.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `club-record/lib/csv-parser.test.ts` (it already imports `parseRecordsCSV`; if not, add `import { parseRecordsCSV } from "./csv-parser";` at the top):

```ts
describe("parseRecordsCSV splits", () => {
  it("parses a Splits column into split_times", () => {
    const csv = "Event,Time,Swimmer,Splits\n100 Free,1:02.78,Jane Doe,50=29.10;100=1:02.78\n";
    const { records, errors } = parseRecordsCSV(csv);
    expect(errors).toEqual([]);
    expect(records[0].split_times).toEqual([
      { distance: 50, ms: 29100 },
      { distance: 100, ms: 62780 },
    ]);
  });

  it("sets split_times null when no Splits column", () => {
    const csv = "Event,Time,Swimmer\n50 Free,29.10,Jane Doe\n";
    const { records } = parseRecordsCSV(csv);
    expect(records[0].split_times).toBeNull();
  });

  it("reports a row error and skips the record on malformed splits", () => {
    const csv = "Event,Time,Swimmer,Splits\n100 Free,1:02.78,Jane Doe,garbage\n";
    const { records, errors } = parseRecordsCSV(csv);
    expect(records).toHaveLength(0);
    expect(errors[0]).toMatch(/Row 2:.*Malformed split/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/csv-parser.test.ts`
Expected: FAIL — `split_times` is undefined / property missing.

- [ ] **Step 3: Implement**

In `club-record/lib/csv-parser.ts`:

(a) Add the import near the top (after the existing imports):

```ts
import { parseSplitsColumn } from "./split-utils";
import type { SplitTime } from "@/types/database";
```

(b) Add the field to the `CSVRecord` interface, after `location: string | null;`:

```ts
  split_times: SplitTime[] | null;
```

(c) Add a column map entry inside `columnMaps` (after `province: [...]`):

```ts
    splits: ["splits", "split_times"],
```

(d) Inside `result.data.forEach((row, index) => {`, after the line
`const province = findColumn(row, columnMaps.province);`, add:

```ts
    const splitsRaw = findColumn(row, columnMaps.splits);
    let split_times: SplitTime[] | null;
    try {
      split_times = parseSplitsColumn(splitsRaw);
    } catch (e) {
      errors.push(`Row ${index + 2}: ${(e as Error).message}`);
      return;
    }
```

(e) In the `records.push({ ... })` object, after `location: location?.trim() || null,`, add:

```ts
      split_times,
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/csv-parser.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/csv-parser.ts lib/csv-parser.test.ts
git commit -m "feat(csv): parse Splits column into split_times"
```

---

### Task 4: Persist splits on bulk upload

**Files:**
- Modify: `club-record/app/(dashboard)/dashboard/records/bulk-upload/page.tsx`

- [ ] **Step 1: Add the field to the insert map**

In the `.from("records").insert(file.records.map((r, idx) => ({ ... })))` object (around lines 148–169), after `location: r.location,`, add:

```ts
            split_times: r.split_times,
```

- [ ] **Step 2: Verify build & types**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/records/bulk-upload/page.tsx"
git commit -m "feat(bulk-upload): persist split_times on insert"
```

---

### Task 5: Public display — splits in the expander

**Files:**
- Modify: `club-record/app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx`
- Test: `club-record/app/[clubSlug]/[recordSlug]/PublicRecordSearch.test.tsx`

- [ ] **Step 1: Add the import**

After the existing `RecordFlags` import line, add:

```ts
import { splitRows } from "@/lib/split-utils";
```

- [ ] **Step 2: Desktop — expand on history-or-splits, render splits block**

In `renderDesktopRecord`, the function currently begins:

```tsx
  const renderDesktopRecord = (record: SwimRecord) => {
    const hasHistory = historyByRecordId.has(record.id);
    const isExpanded = expandedHistory.has(record.id);
    const history = historyByRecordId.get(record.id) || [];
```

Add a `hasSplits` line below those:

```tsx
    const hasSplits = (record.split_times?.length ?? 0) > 0;
```

Change the expander button condition from `{hasHistory && (` to:

```tsx
              {(hasHistory || hasSplits) && (
```

and update its `title` from `isExpanded ? "Hide history" : "Show previous records"` to
`isExpanded ? "Hide details" : "Show splits / previous records"`.

Then, where the expanded history rows render — the block
`{isExpanded && history.map((historyRecord) => (` — insert the splits row
**immediately before** it:

```tsx
        {isExpanded && hasSplits && (
          <tr className="bg-blue-50/40 dark:bg-blue-900/10">
            <td colSpan={desktopColSpan} className="px-4 py-2">
              <div className="ml-6 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="font-medium text-gray-500 dark:text-gray-400">Splits</span>
                {splitRows(record.split_times!).map((s) => (
                  <span key={s.distance} className="text-gray-700 dark:text-gray-300">
                    <span className="text-gray-400">{s.distance}m</span>{" "}
                    <span className="font-mono">{formatTime(s.cumulativeMs)}</span>
                    {s.distance !== splitRows(record.split_times!)[0].distance && (
                      <span className="ml-1 font-mono text-gray-400">
                        (+{formatTime(s.deltaMs)})
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </td>
          </tr>
        )}
```

- [ ] **Step 3: Mobile — same in the card**

In `renderMobileCard`, add the same `hasSplits` constant after the existing
`hasHistory`/`isExpanded`/`history` constants, change its expander button
condition from `{hasHistory && (` to `{(hasHistory || hasSplits) && (`, and
insert a splits block immediately before the `{isExpanded && history.map(...)`
block:

```tsx
        {isExpanded && hasSplits && (
          <div className="ml-4 mt-1 rounded-lg bg-blue-50/40 p-3 dark:bg-blue-900/10">
            <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Splits</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {splitRows(record.split_times!).map((s, i) => (
                <span key={s.distance} className="text-gray-700 dark:text-gray-300">
                  <span className="text-gray-400">{s.distance}m</span>{" "}
                  <span className="font-mono">{formatTime(s.cumulativeMs)}</span>
                  {i > 0 && (
                    <span className="ml-1 font-mono text-gray-400">(+{formatTime(s.deltaMs)})</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 4: Write the component test**

Append to `club-record/app/[clubSlug]/[recordSlug]/PublicRecordSearch.test.tsx`
(add `import userEvent from "@testing-library/user-event";` at the top if absent):

```tsx
describe("PublicRecordSearch splits", () => {
  it("expands to show split cumulative + delta", async () => {
    const user = userEvent.setup();
    render(
      <PublicRecordSearch
        records={[
          rec({
            id: "s1",
            event_name: "100 Free",
            swimmer_name: "Jane Doe",
            split_times: [
              { distance: 50, ms: 29100 },
              { distance: 100, ms: 62780 },
            ],
          }),
        ]}
        recordType="individual"
        scope="club"
      />
    );
    // Expander present because the record has splits (desktop + mobile = 2)
    const toggles = screen.getAllByTitle("Show splits / previous records");
    expect(toggles.length).toBeGreaterThan(0);
    await user.click(toggles[0]);
    expect(screen.getAllByText("Splits").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50m").length).toBeGreaterThan(0);
    // delta for the 2nd split: 62780-29100 = 33680ms -> "33.68"
    expect(screen.getAllByText("(+33.68)").length).toBeGreaterThan(0);
  });

  it("shows no expander when a record has neither history nor splits", () => {
    render(
      <PublicRecordSearch
        records={[rec({ id: "plain", event_name: "50 Free", swimmer_name: "No Splits" })]}
        recordType="individual"
        scope="club"
      />
    );
    expect(screen.queryByTitle("Show splits / previous records")).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests, types, lint**

Run: `npx vitest run "app/[clubSlug]/[recordSlug]/PublicRecordSearch.test.tsx"`
Expected: PASS (existing stroke tests + 2 new).

Run: `npx tsc --noEmit` && `npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx" "app/[clubSlug]/[recordSlug]/PublicRecordSearch.test.tsx"
git commit -m "feat(public): show split times in the record expander"
```

---

### Task 6: Editor display — read-only splits in `RecordTable`

**Files:**
- Modify: `club-record/components/RecordTable.tsx`

The editor's persist path already preserves `split_times` (field-specific updates), so this task is display-only.

- [ ] **Step 1: Add the import**

After the existing `time-utils` import in `RecordTable.tsx`, add:

```ts
import { splitRows } from "@/lib/split-utils";
```

- [ ] **Step 2: Compute `hasSplits` per row**

In the `editableRecords.map((record, index) => {` body, just after the
`const hasHistory = ...;` line (~line 299), add:

```tsx
              const hasSplits = (record.split_times?.length ?? 0) > 0;
```

- [ ] **Step 3: Show the ▶ when there is history OR splits**

There are two expander buttons (one in the non-readOnly index cell ~line 314, one
in the readOnly event cell ~line 348). For **both**, change the wrapping
condition from `{hasHistory && (` to:

```tsx
                          {(hasHistory || hasSplits) && (
```

and change each button `title` from `isExpanded ? "Hide history" : "Show history"`
to `isExpanded ? "Hide details" : "Show splits / history"`.

- [ ] **Step 4: Render a splits row when expanded**

Immediately before the `{/* History rows */}` comment and its
`{isExpanded && historyForRecord.map((historyRecord) => (` block (~line 573),
insert:

```tsx
                  {isExpanded && hasSplits && (
                    <tr className="border-t border-gray-100 bg-blue-50/40 dark:border-gray-800 dark:bg-blue-900/10">
                      <td
                        colSpan={(readOnly ? 7 : 8) + (showAgeGroup ? 1 : 0) + (showHolderClub ? 1 : 0) + (showProvince ? 1 : 0)}
                        className="px-3 py-2"
                      >
                        <div className="ml-6 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                          <span className="font-medium text-gray-500 dark:text-gray-400">Splits</span>
                          {splitRows(record.split_times!).map((s, i) => (
                            <span key={s.distance} className="text-gray-700 dark:text-gray-300">
                              <span className="text-gray-400">{s.distance}m</span>{" "}
                              <span className="font-mono">{formatMsToTime(s.cumulativeMs)}</span>
                              {i > 0 && (
                                <span className="ml-1 font-mono text-gray-400">(+{formatMsToTime(s.deltaMs)})</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
```

- [ ] **Step 5: Verify build, types, lint, full suite**

Run: `npx tsc --noEmit` && `npm run lint`
Expected: clean.

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add components/RecordTable.tsx
git commit -m "feat(editor): show read-only split times in RecordTable"
```

---

### Task 7: Generator emits `Splits`; regenerate + validate

**Files:**
- Modify: `SNC-new/generate_imports.py` (outside the git repo)

- [ ] **Step 1: Add a splits builder**

In `SNC-new/generate_imports.py`, add this function (after `clean_location`):

```python
def splits_str(rec):
    sp = rec.find("SPLITS")
    if sp is None:
        return ""
    items = []
    for s in sp.findall("SPLIT"):
        d = (s.get("distance") or "").strip()
        t = fmt_time(s.get("swimtime"))
        if d and t:
            items.append((int(d), f"{d}={t}"))
    items.sort(key=lambda x: x[0])
    return ";".join(pair for _, pair in items)
```

- [ ] **Step 2: Add the column to both headers**

Change `IND_HEADER` and `REL_HEADER` to append `"Splits"`:

```python
IND_HEADER = ["Event", "AgeGroup", "Time", "Swimmer", "Club", "Province", "Date", "Location", "is_New", "Splits"]
REL_HEADER = ["Event", "AgeGroup", "Time", "Swimmer", "Name2", "Name3", "Name4", "Club", "Province", "Date", "Location", "is_New", "Splits"]
```

- [ ] **Step 3: Append splits to each emitted row**

Compute `splits = splits_str(rec)` once per record (near where `is_new` is set),
then append `splits` as the final element of both the relay row list and the
individual row list:

- relay: `[event, age_group, time, swimmer, n2, n3, n4, club, province, date, loc, is_new, splits]`
- individual: `[event, age_group, time, swimmer, club, province, date, loc, is_new, splits]`

- [ ] **Step 4: Regenerate**

Run (from `SNC-new/`): `python3 generate_imports.py`
Expected: same record counts as before (264/267/289/292 individual, 41/40/44/45/45/47 relay), now with a `Splits` column.

- [ ] **Step 5: Throwaway validation (run once, then delete)**

Create `club-record/lib/splits-import.validation.test.ts`:

```ts
// THROWAWAY — deleted after confirming Lenex split import. Machine-local paths.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseRecordsCSV } from "./csv-parser";

const DIR = "/Users/jackso/code/ClubRecordProject/SNC-new/import";
const FILES: Array<[string, boolean]> = [
  ["LCM Men.csv", false], ["LCM Women.csv", false],
  ["SCM Men.csv", false], ["SCM Women.csv", false],
  ["LCM Men Relay.csv", true], ["LCM Women Relay.csv", true], ["LCM Mixed Relay.csv", true],
  ["SCM Men Relay.csv", true], ["SCM Women Relay.csv", true], ["SCM Mixed Relay.csv", true],
];

describe("Lenex split import", () => {
  let withSplits = 0;
  it.each(FILES)("%s parses with 0 errors", (file, relay) => {
    const csv = readFileSync(`${DIR}/${file}`, "utf-8");
    const { records, errors } = parseRecordsCSV(csv, { relay, scope: "national" });
    expect(errors).toEqual([]);
    withSplits += records.filter((r) => (r.split_times?.length ?? 0) > 0).length;
  });
  it("populated split_times on a meaningful share of records", () => {
    expect(withSplits).toBeGreaterThan(400);
  });
});
```

Run: `npx vitest run lib/splits-import.validation.test.ts`
Expected: PASS — 0 errors per file; total records with splits > 400 (≈535).

Then delete it:

```bash
rm lib/splits-import.validation.test.ts
```

- [ ] **Step 6: Final full suite + commit note**

Run: `npx vitest run`
Expected: all green (the throwaway file is gone).

The generator and CSVs live in `SNC-new/` (outside the repo) — nothing to commit there. No repo commit for this task.

---

## Self-Review

**Spec coverage:**
- D1 public + editor read-only, editor preserves on save → Tasks 5, 6 (+ persist is field-specific, noted). ✔
- D2 reuse ▶ on history-or-splits → Tasks 5, 6. ✔
- D3 cumulative + delta → `splitRows` (Task 2), rendered Tasks 5, 6. ✔
- D4 `split_times JSONB`, nullable, no child table → Task 1. ✔
- D5 `Splits` CSV column parsed → Tasks 3, 7. ✔
- Import path persists → Task 4. ✔
- ~38% coverage / others unaffected → expander gated on content (Tasks 5, 6); null default. ✔
- Tests: split-utils (Task 2), csv-parser (Task 3), component (Task 5), throwaway data validation (Task 7). ✔

**Placeholder scan:** none — all steps have complete code.

**Type consistency:** `SplitTime { distance, ms }` (Task 1) is used identically in `split-utils`, `csv-parser`, and both render sites; `splitRows` returns `{ distance, cumulativeMs, deltaMs }` used verbatim in Tasks 5–6; `parseSplitsColumn` signature matches its callers; `split_times` field name consistent across schema, type, importer, insert maps, and renders.
</content>
