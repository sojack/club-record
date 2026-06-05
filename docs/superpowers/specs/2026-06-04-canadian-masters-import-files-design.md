# Design: Canadian Masters records → app import files

**Date:** 2026-06-04
**Status:** Approved
**Topic:** Transform the comprehensive Canadian Masters records Excel file
(`SNC-new/Records-CAN.MS (1).xlsx`) into CSV files ready to upload through the
app's bulk-upload importer, plus a review list of incomplete source rows.

## Context

`SNC-new/Records-CAN.MS (1).xlsx` (one sheet, "Records") holds **1,407 Canadian
Masters national records** — 1,145 individual + 262 relay — across COURSE
(LCM/SCM) × GENDER (M/F; X=mixed on relays) × age band × stroke/distance, with
swimmer/club/province(REGION)/meet-date and per-distance splits (splits are not
imported).

The app's bulk-upload (`app/(dashboard)/dashboard/records/bulk-upload`) ingests
one CSV per record list. `parseRecordsCSV` accepts flexible headers and these
relevant columns: `Event`, `Time`, `Swimmer`/`Name1` (all required), `AgeGroup`,
`Club`, `Province`, `Date`, `Location`, `Name2..4` (relay legs). `parseFilename`
derives `courseType` (LCM/SCM/SCY substring), `gender` (mixed/women/men
substring — "women" is matched before "men"), and `recordType` ("relay"
substring) from the filename. **Scope is derived from the target club's level,
not the file** — these records are national, so they upload to a national-level
"Canadian Masters" club (national scope requires AgeGroup + Club + Province per
record).

This task produces data deliverables only — **no app code changes**.

## Goals

1. 10 CSV files (4 individual + 6 relay), correctly named so the importer infers
   the right course/gender/type, with columns the importer accepts.
2. Faithful, deterministic field mapping from the Excel.
3. A `_review.csv` listing every incomplete/odd source row (nothing dropped).
4. Validation that every generated file parses through the app's
   `parseRecordsCSV` with **0 errors** and the expected record count.

## Non-goals

- No app/importer code changes (use it as-is).
- Not creating the "Canadian Masters" club / setting its level — a manual setup
  step for the user (noted, not done).
- Not importing splits, FINA/Rudolph points, birthdate, club code, nation,
  status.
- Not inventing relay swimmer names (the source has none — see D1).

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Relay swimmers (source has only a club name per relay) | Club-team records: put `CLUBNAME` in both `Swimmer` (leg 1) and `Club`; legs 2–4 blank |
| D2 | Individual swimmer name format | Reformat `"LASTNAME, Firstname"` → `"Firstname Lastname"`, title-cased (apostrophes/hyphens preserved) |
| D3 | Incomplete/odd rows (43 blank Province; malformed age band `105/-1`) | Include all; also write `_review.csv` flagging them |
| D4 | Output location & tooling | Files under `SNC-new/import/` (outside the git repo); a rerunnable stdlib Python generator |

## Design

### Output files (`SNC-new/import/`)

Individual (gender M→Men, F→Women):
`LCM Men.csv` (273), `LCM Women.csv` (279), `SCM Men.csv` (295),
`SCM Women.csv` (298).

Relay (gender M→Men, F→Women, X→Mixed):
`LCM Men Relay.csv` (41), `LCM Women Relay.csv` (40), `LCM Mixed Relay.csv` (44),
`SCM Men Relay.csv` (45), `SCM Women Relay.csv` (45), `SCM Mixed Relay.csv` (47).

Plus `_review.csv`. Counts are the expected per-file record totals (1,407 total).

### Column layout (every file)

Header: `Event,AgeGroup,Time,Swimmer,Club,Province,Date,Location`
(Relay legs 2–4 are omitted columns — the importer treats absent name2/3/4 as
null.) Values are CSV-quoted when they contain commas (swimmer "LAST, First"
becomes "First Last" so commas are rare, but club/meet names with commas are
quoted).

### Field mapping

| CSV column | Source → transform |
|---|---|
| `Event` | `DISTANCE` + " " + stroke name. `Fr→Free, Bk→Back, Br→Breast, Bu→Fly`. `Me→IM` for individuals, `Me→Medley` for relays. (e.g. `50 Free`, `200 IM`, `4x100 Medley`, `4x50 Free`) |
| `AgeGroup` | `"{AGEMIN}-{AGEMAX}"`. If `AGEMAX` is missing/`-1`/`< AGEMIN`, render `"{AGEMIN}+"` and add to `_review.csv` |
| `Time` | `SWIMTIME` verbatim (already `MM:SS.hh` / `SS.hh`) |
| `Swimmer` | Individual: reformat `FULLNAME` per D2. Relay: `CLUBNAME` verbatim |
| `Club` | `CLUBNAME` verbatim |
| `Province` | `REGION` (empty → empty cell; flagged in `_review.csv`) |
| `Date` | `MEETDATE` (Excel serial, 1900 date system, epoch `1899-12-30`) → `YYYY-MM-DD`. Non-numeric/blank → empty |
| `Location` | `MEETCITY`, but emit empty when value ∈ {`???`, `UNKNOWN`, ``} (case-insensitive) |

**Name reformat (D2):** split `FULLNAME` on the first comma into
`last, first`; output `"{first} {last}"`; title-case each word
(first letter upper, rest lower) while preserving characters after `'`, `-`,
and inside `()` as word-internal (so `PRUD'HOMME, Marc → Marc Prud'homme`,
`ST-PIERRE, Jean → Jean St-Pierre`, `HUDGELL (NEE PARKHOUSE), Jaynie →
Jaynie Hudgell (Nee Parkhouse)`). A `FULLNAME` with no comma is title-cased
as-is.

**Row partitioning:** a row is **relay** iff `DISTANCE` contains `x`
(e.g. `4x50`), else **individual**. Target file = `(COURSE, genderWord, type)`
where genderWord = `{M:Men, F:Women, X:Mixed}`.

### `_review.csv`

Header: `SourceRow,TargetFile,Issue,Event,AgeGroup,Swimmer,Club,Province,Date`.
One row per source record that has a blank `Province` OR a malformed age band.
`SourceRow` is the 1-based Excel row number (header is row 2, first data row 3)
so the user can locate it. The record is STILL written to its target file — this
is a fix-list, not a drop-list.

### Generator (D4)

`SNC-new/generate_imports.py` — Python 3 stdlib only (`zipfile` +
`xml.etree.ElementTree` to read the xlsx; `csv` to write). Deterministic, no
network, no third-party packages. Rerunnable: it overwrites `SNC-new/import/*`.
It prints a summary (per-file counts, review-row count) so a run is
self-verifying at the count level.

### Validation

A **throwaway Vitest test inside `club-record/`** (e.g.
`lib/masters-import.validation.test.ts`) is the reliable validator — it runs in
the existing toolchain that already resolves the `@/` alias and `papaparse`.
It imports the app's `parseRecordsCSV`, reads each generated CSV from
`SNC-new/import/` by **absolute path** (via Node `fs`), runs it with the correct
`{ relay, scope: "national" }` flags, and asserts **0 parse errors** per file
with the parsed record count equal to the generator's expected count (the table
above). It is run once to confirm upload-readiness, then **deleted** (it depends
on machine-local absolute paths to data outside the repo, so it is not committed
as a permanent test).

## Verification

1. `python3 SNC-new/generate_imports.py` → writes 10 CSVs + `_review.csv`;
   printed per-file counts match the table above (totals 1,145 individual / 262
   relay / 1,407).
2. The validation harness → every file parses with 0 errors; parsed counts
   equal the generator counts.
3. Spot-check: open 2–3 files and confirm a known row (e.g. `LCM Men.csv` →
   `50 Free,18-24,25.24,David Morin,C.N. Jonquiere,QC,2005-11-26,` and a relay
   `LCM Men Relay.csv` → `4x50 Free,72-99,1:44.79,Penguin Masters Swimming,Penguin Masters Swimming,AB,2004-05-21,Edmonton`).

## Follow-ups (the user's manual steps, not this task)

- Create/confirm a "Canadian Masters" club set to `level = national` in the app,
  then bulk-upload the 10 files to it.
- Optionally fix the `_review.csv` rows at source and regenerate.
</content>
