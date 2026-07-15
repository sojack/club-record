# Combined CSV Export & Re-import (history-aware) — Design

**Date:** 2026-07-15
**Status:** Approved (pending spec review)

## Problem

The dashboard "Export CSV" button (`app/(dashboard)/dashboard/records/page.tsx`,
`handleExportCSV`) flattens **all** of a club's record lists into a single flat
CSV. The only thing identifying which list a row came from is a free-text
`Record List` title column; the structured list metadata — course type
(SCM/SCY/LCM), record type (individual/relay), gender — is dropped entirely, and
so are several record fields (relay names 2–4, age group, holder club, province,
splits, world-record flag). The file cannot be edited and re-imported to update a
club's records.

Two goals drive the fix:

1. **Backup / archive** — a complete offline copy that loses nothing, including
   record history.
2. **Re-import to update** — export → edit (by hand or via the existing "prepare
   my data with AI" flow) → re-upload, so records can be updated in bulk. This is
   the "update with AI" loop.

## Critical constraint: record history must never be destroyed

The `records` table stores history in-place. When a record is broken:

- A **new** row is inserted for the faster time with `is_current: true`,
  `superseded_by: null`, copying the old row's `sort_order`.
- The beaten row is set to `is_current: false, superseded_by: <new row id>`.
- Any older history rows that pointed at the beaten row are **re-parented** to the
  new current row, so every historical row in a lineage points directly at the
  single current record (the chain is flattened, not a linked list).

Source of truth: `handleSaveRecords` in
`app/(dashboard)/dashboard/records/[listId]/page.tsx:156-177`, and
`buildHistoryMap` in `lib/record-table-utils.ts:175-195`.

A naive "delete this list's rows, insert the CSV rows" re-import would permanently
destroy this history (the `superseded_by` links and the `is_current = false`
rows). **Therefore re-import is non-destructive: it never hard-deletes records.**

## Overview of the solution

- **Export** produces one combined CSV for the whole club, one row per record
  (**including** historical/superseded rows), with list-identity columns and
  history-linkage columns so the full chain round-trips. Generated with
  `Papa.unparse` for correct quoting. This **replaces** the existing Export CSV
  button behavior.
- **Re-import** is a new "Combined CSV" mode on the existing bulk-upload page
  (`app/(dashboard)/dashboard/records/bulk-upload/page.tsx`). It groups rows by
  list, matches each group to an existing list (or creates it), and reconciles
  records **non-destructively and history-aware**, with a confirm-before-write
  preview.

## Export format

One CSV, filename `<club-slug>-records.csv`. One row per record (current **and**
history), grouped by list, ordered within a list by `sort_order` then current
rows before their history.

### Columns

List-identity (prepended to every row):

| Column | Source |
|---|---|
| `List Title` | `record_lists.title` |
| `Course` | `record_lists.course_type` (SCM/SCY/LCM) |
| `Gender` | `record_lists.gender` (male/female/mixed/blank) |
| `Record Type` | `record_lists.record_type` (individual/relay) |
| `List Slug` | `record_lists.slug` — the hidden match key for re-import |

History-linkage:

| Column | Source |
|---|---|
| `Record ID` | `records.id` (the row's own id) |
| `Is Current` | `records.is_current` (`x` when true, blank when false) |
| `Superseded By` | `records.superseded_by` (a `Record ID` value elsewhere in the file) |

Record data (names chosen to match `parseRecordsCSV`'s accepted vocabulary and
the `generateAIImportPrompt` contract, so a per-list slice is exactly what the AI
flow expects):

`Event`, `AgeGroup`, `Time`, `Swimmer`, `Name2`, `Name3`, `Name4`, `Club`,
`Province`, `Date`, `Location`, `is_World_Record`, `is_National`,
`is_Current_National`, `is_Provincial`, `is_Current_Provincial`, `is_Split`,
`is_RelaySplit`, `is_New`, `Splits`

Notes:

- `Time` uses `formatMsToTime`. Individual rows leave `Name2`–`Name4`, and (for
  club scope) `AgeGroup`/`Club`/`Province`, blank.
- **Scope is not a column** — a list's scope is derived authoritatively from the
  club's level on import (`scopeForClubLevel`), exactly as today.
- `Superseded By` references another row's `Record ID` within the same file, so
  the chain is self-contained and rebuildable.
- The `is_RelaySplit` header round-trips: the parser currently recognizes
  `is_relay_split`/`relay_split`/`relay` but **not** `is_relaysplit`. Fix by
  adding `is_relaysplit` to the parser's accepted aliases so export and import
  agree (see Implementation notes).

## Re-import: non-destructive, history-aware reconciliation

New "Combined CSV" mode on the bulk-upload page. Gated behind `canEdit`.

### Step 1 — parse & group

`Papa.parse` the file (header row). Group rows by `List Slug`. Ignore blank rows.
Record-field validation reuses the existing parser logic (see Implementation
notes) so time/date/relay/scope rules are identical to today.

### Step 2 — per group, resolve the target list

- **`List Slug` matches an existing list in the current club → UPDATE that list**
  (Step 3a).
- **No match (slug blank, edited, or absent) → CREATE / restore the list**
  (Step 3b) from the metadata columns (`List Title`, `Course`, `Gender`,
  `Record Type`; scope from club level).

### Step 3a — update an existing list (non-destructive)

Load the list's existing DB records. Then, per CSV row in the group:

1. **Row has a `Record ID` that exists in the DB** → same record. Update its
   editable fields in place (event, time, swimmer(s), age group, club, province,
   date, location, flags, splits). **Do not** modify `is_current` /
   `superseded_by` from the CSV here — linkage on an existing list is managed only
   by the supersede algorithm below, so a stray spreadsheet edit can't corrupt the
   chain.
2. **Row has no `Record ID`** → it is new. Compute its slot key
   `event_name` + `age_group` (age group is blank/null for club-scope individual
   lists). Look at the existing **current** records in that slot:
   - **Exactly one current record in the slot, and the new `time_ms` is strictly
     faster** → **supersede**, replicating the app's sequence exactly: insert the
     new row `is_current: true, superseded_by: null` copying the beaten row's
     `sort_order`; set the beaten row `is_current: false, superseded_by: <newId>`;
     re-parent ancestors (`update superseded_by = newId where superseded_by =
     oldId`). Never delete the old row.
   - **Otherwise** (no current record in the slot, the new time is not faster, or
     the slot already has more than one current record — e.g. a split plus a full
     record, where "which record it breaks" is ambiguous) → insert as a fresh
     current record appended to the list (`sort_order` after the current max), and
     **flag it in the preview** for human review.
3. **A DB record whose `Record ID` never appears in the CSV** (current or history)
   → left untouched. **Import never hard-deletes.**

History rows (`is_current = false`) present in the CSV with a `Record ID` may have
their editable display fields updated in place, but their linkage is not changed.

### Step 3b — create / restore a list

Create the list from the metadata columns (scope from club level). Insert its rows
while **preserving the chain**:

1. Insert the current rows first; capture generated ids and build a map
   `csvRecordId → newDbId`.
2. Insert the history rows (`Is Current` blank) with
   `is_current: false, superseded_by: map[csvSupersededBy]`, so the restored chain
   points at the new current ids.

Because this is a restore (the list didn't exist), the CSV's `Is Current` /
`Superseded By` values are honored.

### Step 4 — confirm before write

Before any DB write, show a preview summarizing, per list: rows updated, new
records added, **supersessions (breaks)**, new records flagged for review, and new
lists to be created — plus a reassurance line ("N existing records not in the file
will be kept"). Require an explicit confirm click. Report per-list success/failure
after write (mirroring bulk-upload's existing result UI), resilient to partial
failure.

## Fields the new insert path must write

The new/supersede insert path writes **all** record fields including
`is_world_record` and `split_times`. (Note: the existing bulk-upload insert omits
`is_world_record`; the new combined path must not.)

## What changes

| Area | Change |
|---|---|
| `app/(dashboard)/dashboard/records/page.tsx` | Rewrite `handleExportCSV` to emit the combined format above (all rows incl. history, new columns, `Papa.unparse`). |
| `app/(dashboard)/dashboard/records/bulk-upload/page.tsx` | Add a "Combined CSV" import mode: parse+group, reconcile per Step 3, preview per Step 4. |
| `lib/csv-parser.ts` | Add `is_relaysplit` alias; expose a row-level parse helper (see below) reused by the combined importer. |
| A new module (e.g. `lib/combined-csv.ts`) | Shared column definitions, export row builder, and the reconciliation planner (pure, testable). |

## Implementation notes

- **Reuse parser validation.** Prefer refactoring `parseRecordsCSV` to expose a
  `parseRecordRows(rows, options)` (or equivalent) so the combined importer runs
  the same time/date/relay/scope validation per group. Fallback if a refactor is
  too invasive: re-`unparse` each group's record columns and feed the existing
  string-based `parseRecordsCSV`, mapping `Record ID`/`Is Current`/`Superseded By`
  back by row index. Either way, no record-parsing logic is duplicated.
- **Keep the reconciliation planner pure.** Compute the full plan (updates,
  inserts, supersessions, list creations, flags) from the parsed rows + DB state
  as plain data, so it can be unit-tested and drives the preview. Execution
  applies the plan.
- **Permissions.** Export may remain visible as today; the combined import is
  gated behind `canEdit`.

## Testing

- Unit: export row builder (current + history rows, linkage columns, relay vs
  individual, club vs national/provincial scope, correct `Superseded By`
  references).
- Unit: reconciliation planner — matched-by-id update; new-faster-time supersede
  (verify old row → `is_current:false`/`superseded_by:newId` and ancestor
  re-parenting); ambiguous slot (>1 current) flagged not superseded; new-slower
  row appended+flagged; missing-from-CSV rows preserved; new-list restore rebuilds
  the chain via the id map.
- Round-trip: export a club, re-import unchanged → no supersessions, no deletes,
  DB unchanged.
- Edge: `is_RelaySplit` flag survives export→import.

## Out of scope / follow-ups

- Updating `generateAIImportPrompt` (or adding a combined-file variant) to
  instruct an external AI to leave history rows and `Record ID`s untouched when
  editing the combined file. Noted as a fast follow so the "update with AI" loop is
  turnkey; not required for export/import correctness.
- Any change to how supersession works in the RecordTable UI.
