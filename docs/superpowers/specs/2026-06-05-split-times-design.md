# Design: Display swim split times

**Date:** 2026-06-05
**Status:** Approved
**Topic:** Store and display per-distance **split times** for records that have
them (e.g. the Canadian Masters Lenex data), surfaced through the existing
expand control on the public record pages and read-only in the editor.

## Context

The swimrankings Lenex exports carry structured splits per record
(`RECORD > SPLITS > SPLIT @distance @swimtime`, cumulative). About **38%** of the
Masters records have them (426 individual + 109 relay). The `records` table has
no place to store splits and no UI shows them. This adds storage + an import path
+ a read-only display.

Note: the existing `is_split` / `is_relay_split` booleans are **flags** ("record
was set as a split of a longer swim") — unrelated to split-time *data*. The new
column is named `split_times` to avoid confusion.

## Goals

1. Store an ordered list of cumulative splits per record.
2. Splits ride in through the normal CSV bulk-upload (a new `Splits` column).
3. Public record pages show a splits breakdown (cumulative + per-segment delta)
   via the existing ▶ expander; the editor shows the same read-only and never
   drops splits on save.
4. Records without splits (≈62% of Masters, and all other clubs) are unaffected —
   the ▶ appears only when there is history **or** splits to show.

## Non-goals

- No splits **editing** UI (read-only everywhere).
- No other unused fields (YoB, FINA points, meet name) — splits only.
- No child table; no change to record-history, flags, or stroke-grouping behavior.
- Not creating the Canadian Masters club / uploading (manual user step).

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Where | Public view **and** editor, both read-only; editor preserves splits on save |
| D2 | Surfacing | Reuse the existing ▶ expander (shows when history **or** splits exist) |
| D3 | Detail | Cumulative time **+ per-segment delta** per split |
| D4 | Storage | `split_times JSONB` on `records` (nullable); no child table |
| D5 | Import path | New optional `Splits` CSV column parsed by `parseRecordsCSV` |

## Design

### Storage (`supabase/migrations/add_split_times.sql`)

```sql
ALTER TABLE records ADD COLUMN split_times JSONB;
```

Value: an ordered array of cumulative splits, or `null`:
`[{ "distance": 50, "ms": 29100 }, { "distance": 100, "ms": 62780 }, ...]`.

Type (`types/database.ts`):

```ts
export interface SplitTime {
  distance: number; // cumulative metres, e.g. 50, 100, 150
  ms: number;       // cumulative time in milliseconds
}
```

Add `split_times: SplitTime[] | null;` to `SwimRecord`.

### Split utilities (`lib/split-utils.ts`, pure + tested)

- `parseSplitsColumn(raw: string | undefined): SplitTime[] | null` — parses the
  CSV cell format `"50=29.10;100=1:02.78;150=1:38.50"` (cumulative
  `distance=time` pairs, `;`-separated; whitespace tolerated). Each time is parsed
  with the existing `parseTimeToMs`. Empty/absent → `null`. Throws a descriptive
  `Error` on a malformed pair (distance not an integer, or unparseable time) so
  the importer can surface a row error.
- `splitRows(splits: SplitTime[]): Array<{ distance: number; cumulativeMs: number; deltaMs: number }>`
  — `deltaMs[0] = ms[0]`; `deltaMs[i] = ms[i] − ms[i−1]`. Pure; display reuses
  `formatMsToTime`.

### Importer (`lib/csv-parser.ts`)

- Add `splits: ["splits", "split_times", "split"]` to `columnMaps`.
- Read the column and set `split_times` on the `CSVRecord` via
  `parseSplitsColumn`. A thrown parse error becomes
  `Row ${index + 2}: <message>` (consistent with existing per-row errors); the
  record is skipped, like other invalid rows.
- Add `split_times: SplitTime[] | null` to the `CSVRecord` interface.

### Insert path (`app/(dashboard)/dashboard/records/bulk-upload/page.tsx`)

Add `split_times: r.split_times,` to the `.from("records").insert(...)` map
(alongside the existing fields at lines 147–169).

### Public display (`app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx`)

- `hasSplits(record) = (record.split_times?.length ?? 0) > 0`.
- The ▶ button currently renders when `historyByRecordId.has(record.id)`. Change
  the condition to `hasHistory || hasSplits(record)`; the toggle title becomes
  "Show splits/history".
- When expanded, render a **Splits** block first (a labelled mini-table of
  `distance` / cumulative `formatMsToTime(cumulativeMs)` / `(+Δ)`
  `formatMsToTime(deltaMs)` from `splitRows`), then the existing history rows.
  Desktop: an extra `<tr>` whose single `<td colSpan={desktopColSpan}>` holds the
  splits table. Mobile: a splits block inside the expanded card, before history.
- History-only and splits-only records both work (each block renders only if it
  has content).

### Editor (`components/RecordTable.tsx`)

- Reuse the existing `expandedHistory` toggle: show the ▶ when the row has
  history **or** splits; render a read-only splits block (same `splitRows`
  breakdown) in the expanded area, before history.
- **Preserve on save:** `split_times` rides on `EditableRecord` (which extends
  `SwimRecord`) and must be included unchanged in whatever object `onSave`
  persists, so editing a record never nulls its splits. (No splits inputs.)

### Generator (`SNC-new/generate_imports.py`, out of repo)

- Append a `Splits` column to both the individual and relay headers.
- For each record, read `SPLITS/SPLIT` (ordered by `@distance`), format each
  cumulative `@swimtime` with the existing time formatter, and join as
  `distance=time;...`. No splits → empty cell.
- Regenerate all 10 CSVs (records counts unchanged; relay/individual files gain
  the `Splits` column).

## Testing

- **`lib/split-utils.test.ts`** (node): `parseSplitsColumn` happy path, empty →
  null, whitespace tolerance, malformed pair throws; `splitRows` delta math
  (first = cumulative, rest = differences), single-split case.
- **`lib/csv-parser.test.ts`**: a row with a `Splits` column → `split_times`
  populated; no column → `null`; a malformed `Splits` cell → a row error, record
  skipped. Existing tests stay green.
- **Component** (`PublicRecordSearch.test.tsx`): a record with `split_times`
  renders the ▶ and, when expanded, shows a split cumulative + delta; a record
  with neither history nor splits shows no ▶.
- **Throwaway validation** (deleted after): regenerate, then run the Masters
  relay + individual files through `parseRecordsCSV` and assert ~426 individual +
  ~109 relay records have non-null `split_times` and 0 parse errors.

## Verification

1. Migration applies; `select("*")` returns `split_times` (already used by the
   public fetch and embed).
2. `npx vitest run` green (new + existing); `npx tsc --noEmit` + `npm run lint`
   clean.
3. Manual: a Masters record with splits shows the ▶, expands to cumulative +
   deltas; a record with only history still shows history; a plain record shows
   no ▶. Editing a record with splits and saving keeps the splits.

## Follow-ups (not this task)

- Optionally show splits for YoB / FINA points later (explicitly out of scope now).
- Optional splits-editing UI if ever needed.
</content>
