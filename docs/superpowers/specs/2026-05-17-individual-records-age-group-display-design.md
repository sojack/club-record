# Design: Individual records grouped by age band (4 national/provincial lists)

**Date:** 2026-05-17
**Status:** Approved (design); pending spec review
**Builds on:** `2026-05-16-relay-records-design.md` (reuses the `age_group` /
`record_club` / `province` columns, `record_lists.scope`, and the parser/
editor/display plumbing added there).

## Goal

Replace the 64+ per-age-band individual record lists (the discarded "Option A"
output of relay-plan Task 12) with **4 lists** — Men LC, Men SC, Women LC,
Women SC — each holding all age bands, where the public page shows the records
**grouped under age-band section dividers/titles** rather than one list per
band. These are Canadian Masters national/provincial individual records, so
each record also carries the holder's **club** and **province**.

## Requirements (locked with user)

- **4 lists total** for the national/provincial individual data:
  `record_type='individual'`, `scope='national_provincial'`,
  `gender` ∈ {male, female}, `course_type` ∈ {LCM, SCM}.
- **Club + Province shown** per record (reuse `records.record_club` /
  `records.province`, exactly like relay national/provincial lists). The prep
  script keeps the source CLUB/PROV columns instead of discarding them.
- **Editor: age-group column per row.** The dashboard inline editor shows an
  Age Group cell and Club/Prov cells for these lists, with the normal **single**
  swimmer input (not the relay 4-name stack). No section dividers in the editor.
- **Public: age-band section dividers/titles.** The public list view groups
  records into age-band sections with a full-width band-title row before each
  band; no separate age-group column there.
- **Auto-trigger, no flag, no migration.** The grouped display turns on when
  `record_type='individual'` and the list's records carry `age_group`. The
  `age_group`/`record_club`/`province` columns already exist (relay migration);
  no schema change and no new list setting.
- **Task 12's 66 CSVs are replaced** by 4 CSVs. The 66-file output and the
  per-band approach are discarded.

## Architecture (Approach A — generalize the relay plumbing)

The relay feature gated age-group/club/province behavior behind a single
`relay` boolean. Decouple it into the axes that actually matter:

- **Swimmer count:** 4 if `record_type='relay'`, else 1. This is the *only*
  thing `relay` now controls (the 4-name stack in editor/parser/display).
- **Age group + club/province:** driven by `scope='national_provincial'`
  (true for relay national/provincial *and* these individual lists), not by
  `relay`. Club-scope individual lists keep no age/club/province.
- **Grouped divider rendering:** a public-display concern, triggered by
  `record_type='individual'` AND at least one record having a non-empty
  `age_group`. Relay lists keep their existing age-group *column*; flat
  club-scope individual lists are unchanged.

No new DB objects, no `types/database.ts` change (all columns already typed
from the relay work).

## 1. CSV parser — `lib/csv-parser.ts`

`parseRecordsCSV(csvContent, relayOptions)` currently branches on
`relayOptions.relay`. Add a third path:

- **relay** (`relay === true`): unchanged — require 4 names + `age_group`
  (against `allowedAgeGroups` when provided) + (national_provincial) club +
  province.
- **individual national/provincial** (`relay !== true` AND
  `relayOptions.scope === 'national_provincial'`): require `event`, `time`,
  **one** `swimmer`, non-empty `age_group`, non-empty `record_club`, non-empty
  `province`. `age_group` is **not** validated against a standard set
  (individual masters bands are not a fixed app list); only non-empty is
  required. `swimmer_name_2/3/4` stay null. Same `Row N: …` per-row error
  strings/style as the relay path.
- **plain individual** (`relay !== true` AND `scope !== 'national_provincial'`):
  unchanged — existing event/time/swimmer behavior, relay columns null.

The column maps already include `age_group`, `record_club`, `province`,
`swimmer` aliases (incl. `name1`). No new aliases needed. `record_club`/
`province`/`age_group` are populated on the pushed record whenever
`scope === 'national_provincial'` (relay or individual), null otherwise.

## 2. Prep script — `SNC/individual-prep/` (replaces relay-plan Task 12)

Rework `xlsx_to_individual_csv.py` to emit **exactly 4 files** into
`SNC/individual-csv/` (delete the 66 old `*_<band>.csv` files):

- `Men_LCM_National.csv`, `Men_SCM_National.csv`,
  `Women_LCM_National.csv`, `Women_SCM_National.csv`
- Sheet → file map (Canadian Masters = metres): sheet1 MEN LC → Men/LCM,
  sheet2 WOMEN LC → Women/LCM, sheet3 MEN SC → Men/SCM, sheet4 WOMEN SC →
  Women/SCM.
- Header (exact):
  `Event,AgeGroup,Time,Swimmer,Club,Province,Date,Location,is_World_Record,is_National,is_Current_National,is_Provincial,is_Current_Provincial,is_New`
  (single `Swimmer`; `Club`/`Province` kept from source cols C/D; 6 trailing
  flag columns blank, consistent with the relay deliverable).
- One file per (gender, course); **all** age bands in it; rows ordered by age
  band youngest→oldest (band's leading integer ascending), standard event
  order within a band.
- Reuse Task 12's verified logic verbatim where unchanged: `normalize_event`,
  the integer-hundredths `excel_fraction_to_time`, the Excel-serial-date
  conversion (`\d{5}` → ISO via the 1899-12-30 epoch), `normalize_band`,
  band/section/header-row detection.
- A row is emitted only if event recognized + swimmer non-empty + time parses
  **+ club non-empty + province non-empty + the row is under a recognized
  age-band section in the sheet** (the script tracks the current band from the
  section headers — this is sheet-structure tracking, not validation against a
  standard age-band list, consistent with §1); otherwise it
  goes to `SNC/individual-csv/needs-review.txt` with
  `[Gender Course band] event=… : reason` (covers unset placeholder rows and
  the blank-event source anomaly, as before).
- `*_National*` filenames route via the existing bulk-upload `parseFilename`:
  `men`/`women` → gender, `lcm`/`scm` → course, no `relay` token →
  `record_type='individual'`, `national` token → `scope='national_provincial'`.
  The list **title** derived from the filename is e.g. "Men LCM National";
  the bulk-upload preview's editable Title field lets the user rename it to
  "Men LC" etc. at upload time while the filename keeps the routing tokens.
- Standalone stdlib-only Python at the project root (NOT a git repo there;
  no commits for this script/output — same as the relay prep). Test-driven
  with the existing `unittest` file, extended for the new 4-file shape, the
  retained Club/Province, and the single-swimmer header.

## 3. Editor — `components/RecordTable.tsx`

Generalize the existing relay-mode rendering:

- Define `showAgeGroup = isRelay || isNatProv` and keep `isNatProv =
  scope === 'national_provincial'`. (Relay already implies its own age column;
  individual national/provincial now also gets one.)
- For individual national/provincial lists (`!isRelay && isNatProv`): render
  the **Age Group** cell and **Club**/**Prov** cells exactly as relay does,
  but keep the existing **single** swimmer `<input>` (the 4-name stack stays
  gated behind `isRelay`).
- Age-group autocomplete `<datalist>` for these lists = union of the
  `standard_age_groups` names already passed in (relay bands) **and** the
  distinct non-empty `age_group` values present in this list's loaded records.
  No migration/seed; for these lists the data arrives via CSV import first, so
  the list's own bands populate the suggestions; the relay seed remains
  available too. Plain individual and relay editors are otherwise unchanged.
- `colSpan` / header/cell gating updated so columns stay aligned across all
  modes (plain individual; individual national/provincial; relay club; relay
  national/provincial; readOnly vs editable; current vs history rows) — the
  gating predicate must be identical between each `<th>` and its `<td>`.

## 4. Public display — `app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx`

Add a grouped rendering mode:

- **Trigger:** `recordType === 'individual'` AND some current record has a
  non-empty `age_group`. (Relay → keep the existing age-group *column* mode,
  unchanged. Individual with no age groups → existing flat table, unchanged.)
- **Desktop:** one `<thead>` (Event, Time, Swimmer, Club, Prov, Date,
  Location — Club/Prov shown because scope is national/provincial). In
  `<tbody>`, records are grouped by `age_group`; groups ordered by the band's
  leading integer ascending (`"18-24"`→18, `"100-104"`→100, `"105-109"`→105,
  `"100+"`→100); before each group a full-width band-title `<tr>` with a
  single `<td colSpan={total}>` showing the band label. Within a group,
  records keep `sort_order`; history/superseded rows still nest under their
  current record inside the same group (reuse the existing
  superseded_by/history map logic).
- **Search:** the existing text filter applies to records first; only bands
  with ≥1 matching record render their title row (no empty bands).
- **Mobile:** the existing card list, with a band-title heading emitted before
  each band's cards.
- The direct record page (`[recordSlug]/page.tsx`) and `ClubRecordBrowser`
  already pass `recordType`/`scope` to `PublicRecordSearch` (from the relay
  work) — no change needed there; the new mode keys off those existing props +
  the records' `age_group`.

## 5. Ordering rule (single source of truth)

Age-band order everywhere (prep output and public grouping) = ascending by the
**leading integer** parsed from the band string. No reliance on
`standard_age_groups.sort_order` (which holds relay bands). Bands with no
parseable leading integer sort last, stable by string.

## Out of scope / non-goals

- No migration, no `types/database.ts` change, no new list setting/flag.
- No section dividers in the **editor** (column-per-row only).
- Relay lists' display/editor are **unchanged** (they keep the age-group
  column; no dividers).
- Club-scope individual lists are **unchanged** (no age/club/province).
- No strict validation of individual age-band strings against a standard set.
- The embed widget / embed JSON route are out of scope (consistent with the
  relay spec's deferral).
- `is_world_record` etc. flags left blank by the prep script (consistent with
  the relay deliverable; pre-existing convention).

## Assumptions / notes

- The relay migrations and this work share the same columns; this feature is
  inert until the relay migrations are applied to Supabase (already a known
  pending manual step). This feature itself adds **no** new migration.
- Source-data quality issues already surfaced by Task 12 (e.g. the
  `2/2/20202` typo rows, blank-event anomaly, "no record set" placeholder
  rows) continue to be routed to `needs-review.txt`, not silently emitted.
- Bulk/admin upload + `parseFilename` are expected to need **no** code change;
  the implementation plan must verify this assumption and only touch them if
  a real gap is found.
