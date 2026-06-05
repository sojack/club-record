# Design: Extract RecordTable's pure logic into a tested module

**Date:** 2026-06-04
**Status:** Approved
**Topic:** Move the pure, non-React logic out of `components/RecordTable.tsx`
(~891 LOC) into `lib/record-table-utils.ts` with direct unit tests, thinning the
component. (TECH_DEBT High #1 — the deferred RecordTable refactor.)

## Context

`RecordTable` is the core inline-editing UI. It is large and mixes pure logic
(record builders, the save filter, history grouping, column-config derivation)
with React state and JSX. The pure logic is currently reachable only through the
heavy `RecordTable.test.tsx` RTL characterization tests (added 2026-06-04),
which are now the safety net that makes this extraction low-risk.

The codebase already keeps pure logic in `lib/` (`time-utils`, `csv-parser`,
`date-utils`) with co-located node-environment Vitest tests — this refactor
follows that pattern.

## Goals

1. The pure logic lives in `lib/record-table-utils.ts`, directly unit-tested.
2. `components/RecordTable.tsx` shrinks: its handlers call the helpers; all
   React state, effects, and JSX stay.
3. **No behavior change** — the existing `RecordTable.test.tsx` (10 tests) stays
   green throughout, and existing importers of the shared types keep working.
4. `vitest` / `tsc` / `npm run lint` all green.

## Non-goals

- Any behavior, markup, or styling change.
- Touching the flag-menu / history-edit / cell-edit **rendering** (only the pure
  helpers those handlers call are extracted).
- New dependencies; splitting the JSX into sub-components (separate future
  work).

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Module location | `lib/record-table-utils.ts` (matches `lib/` pure-logic pattern; node-testable) |
| D2 | Shared types | `EditableRecord` / `RecordFlagType` / `HistoryFlagUpdate` move to the module; `RecordTable.tsx` **re-exports** them so existing importers are unchanged |
| D3 | Breadth | Extract the ~11 pure helpers listed below; React state/effects/handlers/JSX stay in the component |

## Design

### `lib/record-table-utils.ts` — exported surface

Types (moved from `RecordTable.tsx`):
- `EditableRecord` — `Omit<SwimRecord, "id"|"created_at"|"updated_at"|"record_list_id">` plus `id?`, `isNew?`, `_breakingRecordId?`.
- `RecordFlagType` — the 8-flag union.
- `HistoryFlagUpdate` — `{ id: string; flags: Record<RecordFlagType, boolean> }`.

Pure functions (each lifted verbatim from the component, parameterized on what it
currently reads from props/state):

| Function | Signature | Replaces (current inline) |
|----------|-----------|---------------------------|
| `getStandardEvents` | `(courseType?: string) => string[]` | module-level fn (relocated) |
| `mapRecordToEditable` | `(r: SwimRecord) => EditableRecord` | `mapRecordToEditable` |
| `makeEmptyRecord` | `(sortOrder: number) => EditableRecord` | `addRow` body |
| `makeBreakingRecord` | `(oldRecord: EditableRecord) => EditableRecord` | `breakRecord` body |
| `buildStandardEventRows` | `(opts: { isRelay: boolean; courseType?: "LCM"\|"SCM"\|"SCY"; relayEvents: string[]; ageGroups: string[]; existing: EditableRecord[]; startSortOrder: number }) => EditableRecord[]` | `addStandardEvents` body |
| `buildHistoryMap` | `(records: SwimRecord[]) => Map<string, SwimRecord[]>` | the `historyByRecordId` build + sort |
| `filterSavableRecords` | `(records: EditableRecord[]) => EditableRecord[]` | `handleSave` `event_name.trim() !== ""` filter |
| `buildHistoryUpdates` | `(edited: Map<string, SwimRecord>) => HistoryFlagUpdate[]` | `handleSave` history-flag mapping |
| `getColumnConfig` | `(opts: { recordType: "individual"\|"relay"; scope: "club"\|"provincial"\|"national" }) => { isRelay: boolean; showHolderClub: boolean; showProvince: boolean; showAgeGroup: boolean }` | the `isRelay`/`showHolderClub`/`showProvince`/`showAgeGroup` derivation |
| `computeAgeGroupOptions` | `(ageGroups: string[], records: SwimRecord[]) => string[]` | the `ageGroupOptions` derivation |
| `reorderRecords` | `(records: EditableRecord[], index: number, direction: "up"\|"down") => EditableRecord[]` | `moveRow` body (swap + reassign `sort_order`; on a bounds no-op returns the **same array reference** so the caller can skip the state update / `setHasChanges`) |

All functions are pure: no React, no I/O, deterministic. `makeEmptyRecord` /
`makeBreakingRecord` set the same field defaults as today (incl. `isNew: true`,
and `_breakingRecordId` for the breaking row).

### `components/RecordTable.tsx` — after

- Imports the helpers + types from `@/lib/record-table-utils`, and **re-exports**
  the three types: `export type { EditableRecord, RecordFlagType, HistoryFlagUpdate } from "@/lib/record-table-utils";` (so `app/(dashboard)/dashboard/records/[listId]/page.tsx`, which imports `HistoryFlagUpdate` from `@/components/RecordTable`, is untouched).
- The derived constants become `const { isRelay, showHolderClub, showProvince, showAgeGroup } = getColumnConfig({ recordType, scope });` and `const ageGroupOptions = computeAgeGroupOptions(ageGroups, records);`.
- `historyByRecordId` becomes `buildHistoryMap(records)`.
- Handlers become thin: `addRow` → append `makeEmptyRecord(editableRecords.length)`; `breakRecord` → splice in `makeBreakingRecord(oldRecord)`; `addStandardEvents` → append `buildStandardEventRows({...})`; `handleSave` → `filterSavableRecords(editableRecords)` + `buildHistoryUpdates(editedHistoryRecords)`; `moveRow` → `reorderRecords(...)`. State setting, `setHasChanges`, `onSave`/`onDelete` calls stay in the component.
- `mapRecordToEditable` references (initial state + the records-sync effect) call the imported helper.

### Testing

New `lib/record-table-utils.test.ts` (node environment — no jsdom pragma), unit
tests per helper, including the cases the RTL suite cannot easily reach:
- `makeEmptyRecord` / `makeBreakingRecord`: field defaults; breaking row carries
  `_breakingRecordId`, `isNew: true`, copies `event_name`/`sort_order` from the
  old record, resets `time_ms`/`swimmer_name`.
- `buildStandardEventRows`: individual vs relay event sets; dedup against
  `existing` by `event|ageGroup`; `sort_order` continues from `startSortOrder`.
- `buildHistoryMap`: groups by `superseded_by`; sorts each group by
  `record_date` descending; ignores history rows without `superseded_by`.
- `filterSavableRecords`: drops empty/whitespace `event_name`, keeps the rest.
- `buildHistoryUpdates`: maps the edited map to `HistoryFlagUpdate[]` with all 8
  flags coerced to booleans.
- `getColumnConfig`: each `recordType`×`scope` combination.
- `computeAgeGroupOptions`: union of `ageGroups` + record age groups, de-duped,
  blanks filtered.
- `reorderRecords`: up/down swaps and `sort_order` reassignment; first-up and
  last-down return the same array reference (so the component skips the state
  update and does not mark `hasChanges` — matching today's early-return).
- `getStandardEvents`: LCM omits "100 IM"; SCM/SCY include it.

The existing `components/RecordTable.test.tsx` is unchanged and must stay green
(it now exercises the component-via-helpers path end-to-end).

## Verification

1. `npx vitest run` → all green (107 + the new unit tests; the 10 RecordTable
   RTL tests included and unchanged).
2. `npx tsc --noEmit` → clean.
3. `npm run lint` → exit 0 (`--max-warnings 0`).
4. `npm run build` → clean.

## Follow-ups (not here)

- Splitting RecordTable's JSX into sub-components (the row, the flag menu, the
  history panel) — a separate future refactor, now easier with the logic out.
</content>
