# Design: Relay records (4-swimmer records, club vs national/provincial scope)

**Date:** 2026-05-16
**Status:** Approved (design); pending spec review

## Goal

Add a new record type — **relay records** — to Club Record. A relay record has
**4 swimmer names** instead of one, is organized **one entry per age group**, and
exists in lists that are either **club-internal** (no record-holding club needed)
or **national/provincial** (each record carries the holding club; province
required). Deliver the schema, editing UI, CSV bulk-upload workflow, public
display, and ready-to-upload CSVs generated from the existing
`SNC/Canadian Masters Records.xlsx`.

## Requirements (locked with user)

- **List organization:** one list per gender per course, mirroring the current
  individual model (e.g. "Men's SCM Relays", "Women's SCM Relays", "Mixed SCM
  Relays"). Relays introduce a **Mixed** gender that individuals don't have.
- **Scope is a list property:** a relay list is either
  - `club` — internal club records; **no** record-holding club or province
    fields shown/uploaded/stored, OR
  - `national_provincial` — each record carries the **record-holding club** and
    **province**, both required. National vs provincial within such a list is
    carried by the **existing** per-record flags
    (`is_national`/`is_current_national`/`is_provincial`/`is_current_provincial`),
    which are unchanged.
- **Age groups:** a fixed standard set, **admin-editable** via a table (like
  `standard_events`). Seed: `72-99, 100-119, 120-159, 160-199, 200-239,
  240-279, 280-319, 320-359, 360-399`. Upload rejects non-standard values.
- **All 4 swimmer names required** on a relay record (matches the source data).
- **Province required** for every record in a `national_provincial` list (every
  Canadian Masters record in the source has both club and province).
- **Storage = Approach A:** extend the existing `records` / `record_lists`
  tables. No separate relay table; the history chain, flag columns, RLS
  policies, `RecordTable`, `CSVUploader`, and the public browser extend rather
  than fork.
- **Deliverable includes the data:** convert the existing Canadian Masters
  relay sheets into ready-to-upload CSVs as part of this work.

## Architecture overview

One code path. Relay behavior is driven by two new `record_lists` columns
(`record_type`, `scope`); `records` gains nullable relay-only columns. The
existing single-`records`-table machinery (history `superseded_by`/`is_current`,
flags, `sort_order`, RLS by club membership) is reused unchanged.

## 1. Schema changes

New migration files under `club-record/supabase/migrations/`, following the
existing idempotent style (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT
EXISTS`).

### `add_relay_fields_to_record_lists.sql`

- `record_type TEXT NOT NULL DEFAULT 'individual' CHECK (record_type IN ('individual','relay'))`
- `scope TEXT NOT NULL DEFAULT 'club' CHECK (scope IN ('club','national_provincial'))`
  — only meaningful when `record_type='relay'`; individual lists keep the
  default `'club'` (unused).
- Widen the existing `gender` CHECK to allow `'mixed'`:
  drop the existing constraint and recreate as
  `CHECK (gender IN ('male','female','mixed'))`. (Current constraint is
  `gender IN ('male','female')` from `add_gender_to_record_lists.sql`; the
  constraint name must be looked up / handled defensively in the migration.)

### `add_relay_columns_to_records.sql`

All nullable; populated only for relay rows. Leg-1 swimmer reuses the existing
`swimmer_name`.

- `swimmer_name_2 TEXT`, `swimmer_name_3 TEXT`, `swimmer_name_4 TEXT`
- `age_group TEXT`
- `record_club TEXT`
- `province TEXT`

### `add_standard_age_groups.sql`

New admin-editable table mirroring `standard_events`:

- `id` (int, PK), `name TEXT NOT NULL`, `sort_order INT NOT NULL`
- Seed the 9 standard bands in order (72-99 … 360-399).
- RLS: same read/write posture as `standard_events`.

### `add_kind_to_standard_events.sql`

- `kind TEXT NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual','relay'))`
- Seed relay event names with `kind='relay'`. Confirmed list comes from the
  Excel during data prep; expected:
  `4 X 50 Freestyle Relay`, `4 X 100 Freestyle Relay`,
  `4 X 50 Medley Relay`, `4 X 100 Medley Relay`. Existing rows default to
  `'individual'` so individual-event autocomplete is unaffected.

### `types/database.ts`

- Add `'mixed'` to the `RecordList.gender` union.
- Add `record_type: 'individual' | 'relay'` and `scope: 'club' |
  'national_provincial'` to `RecordList`.
- Add `swimmer_name_2/3/4`, `age_group`, `record_club`, `province`
  (`string | null`) to `SwimRecord`.
- Add `kind: 'individual' | 'relay'` to `StandardEvent`.
- Add `StandardAgeGroup` interface and register `standard_age_groups` in the
  `Database['public']['Tables']` map (Row/Insert/Update like `standard_events`).

## 2. Validation / semantics

- **Relay lists** (`record_type='relay'`):
  - All 4 swimmer names required.
  - `age_group` required and must exactly match a `standard_age_groups.name`;
    upload rejects non-standard values with a per-row error.
- **Scope `national_provincial`:** `record_club` and `province` both required.
- **Scope `club`:** `record_club`/`province` not shown, not uploaded, stored
  null.
- **National vs provincial** within a `national_provincial` list is expressed
  only through the existing per-record `is_national` / `is_current_national` /
  `is_provincial` / `is_current_provincial` flags. No new flag.
- **Individual lists** (`record_type='individual'`) are entirely unaffected;
  relay columns remain null and no relay UI/validation applies.
- **Course mapping for the Canadian data:** relay **SC → `SCM`**, relay
  **LC → `LCM`** (Canadian Masters swim metres; `SCY` is yards and not used
  for this data).

## 3. CSV format & upload workflow

One CSV row per relay record. National/provincial header:

```
Event, AgeGroup, Time, Name1, Name2, Name3, Name4, Club, Province, Date, Location, is_World_Record, is_National, is_Current_National, is_Provincial, is_Current_Provincial, is_New
```

Club-scope template omits `Club, Province`. `Time` stays the app-standard text
format (`MM:SS.hh` / `SS.hh`) parsed by the existing `parseTimeToMs`.

### `lib/csv-parser.ts`

- Extend `CSVRecord` with `swimmer_name_2/3/4`, `age_group`, `record_club`,
  `province`.
- `parseRecordsCSV` gains a relay mode (derived from the target list's
  `record_type`/`scope`, passed in by the caller). New columns get the same
  flexible alias-map treatment as existing ones (e.g. `name1/swimmer1`,
  `agegroup/age_group/age group`, `club`, `prov/province`).
- Per-row validation in relay mode: 4 names present, `age_group` ∈ standard
  set, and (for `national_provincial`) club + province present. Errors use the
  existing `Row N: …` reporting style.
- `generateCSVTemplate` gains a relay variant: emits the relay header (scope-
  appropriate columns) plus one blank row per standard age group per seeded
  relay event — mirroring how `sample-records.csv` pre-fills individual events.

### Upload UI

Reuse the existing `CSVUploader`, the dashboard bulk-upload page
(`app/(dashboard)/dashboard/records/bulk-upload/`), and the admin per-club
upload page (`app/admin/[clubId]/upload/`). When the target list is a relay
list, the uploader expects the relay column set, applies scope-conditional
Club/Province handling, and offers the relay template download. **No parallel
uploader component.**

## 4. List creation + `RecordTable` editing

**List-creation form:** add a "Record type" choice (Individual / Relay). If
Relay: a "Scope" choice (Club records / National & Provincial), and the gender
selector gains **Mixed**.

**`RecordTable` in relay mode** (driven by the list's `record_type`/`scope`):

- The single Swimmer cell becomes **4 stacked name inputs** (leg 1 = existing
  `swimmer_name`).
- New **Age Group** cell with autocomplete from `standard_age_groups`.
- **Club** + **Province** cells, shown only when scope =
  `national_provincial`.
- Event-name autocomplete filtered to `standard_events.kind='relay'`.
- Flags, time validation, the `superseded_by`/`is_current` history chain, and
  `sort_order` reuse existing logic unchanged.

## 5. Public display

Relay lists render with extra columns; the 4 names stack within one cell.
Club/Province columns appear **only** for `national_provincial` scope. The
public club-page course-type dropdown grouping is unchanged; per-gender relay
lists (including Mixed) appear as their own entries. Layout:

```
National/Provincial relay list — "Men's SCM Relays"
┌────────────┬───────────┬───────────────┬──────┬──────┬───────┬─────────┐
│ Event      │ Age Group │ Swimmers      │ Club │ Prov │ Time  │ Date    │
├────────────┼───────────┼───────────────┼──────┼──────┼───────┼─────────┤
│ 4x50 Free  │ 72-99     │ R.Kopinski    │ TECH │ ON   │1:39.07│ 2018-03 │
│            │           │ C.Valcic      │      │      │       │         │
│            │           │ E.Brault      │      │      │       │         │
│            │           │ R.Hanna       │      │      │       │         │
└────────────┴───────────┴───────────────┴──────┴──────┴───────┴─────────┘

Club-scope relay list — identical, minus the Club + Prov columns.
```

`ClubRecordBrowser` server-fetch and client-fetch both select the new columns.

## 6. Excel → CSV deliverable

A throwaway prep script (Python stdlib only — **not** shipped app code; lives
outside `club-record/`, e.g. alongside the data in `SNC/`):

- Parses the `RELAYS SC- RELAIS PB` and `RELAYS LC- RELAIS GB` sheets of
  `SNC/Canadian Masters Records.xlsx`.
- Collapses each 4-row block (age-group row + 3 name-only rows) into one
  record.
- Converts the Excel fractional-day time value → seconds (`value × 86400`) →
  `MM:SS.hh` text.
- Splits by gender (Men's / Women's / Mixed) × course (SC→SCM, LC→LCM) into
  per-gender-per-course CSVs matching the `national_provincial` relay template.
- Output committed under `SNC/relay-csv/` (e.g. `mens-scm-relays.csv`,
  `mixed-lcm-relays.csv`).
- Rows with messy/missing source data (blank `PROV`, malformed names) are
  written to a `SNC/relay-csv/needs-review.txt` report rather than silently
  dropped, so the user can clean them before upload.

## Out of scope

- Per-leg split times (the source has no per-leg data; only 4 names).
- Relay records in `SCY` (yards) — Canadian Masters data is metres only.
- Changing how individual records work in any way.
- Migrating/altering the existing individual record lists.

## Assumptions / notes

- Canadian Masters relay SC = `SCM`, LC = `LCM`.
- The full relay event-name set is finalized from the Excel during data prep
  and seeded into `standard_events` (`kind='relay'`).
- The Mixed gender requires `gender='mixed'` rows in `record_lists`; the
  per-gender list model means Mixed lists are first-class, separate lists.
- Migrations are written here but **applied to Supabase separately** by the
  user (consistent with the existing migration workflow, e.g.
  `add_updated_at_tracking.sql`).
