# Design: Canadian Masters individual records → app import files

**Date:** 2026-06-04
**Status:** Approved
**Topic:** Transform the **individual** Canadian Masters records in
`SNC-new/Records-CAN.MS (1).xlsx` into CSV files ready to bulk-upload to a
national-level club. (Relay records are deferred — see Non-goals.)

## Context

`SNC-new/Records-CAN.MS (1).xlsx` (sheet "Records") holds 1,407 Canadian Masters
national records: 1,145 individual + 262 relay, across COURSE (LCM/SCM) ×
GENDER × age band × stroke/distance, with swimmer/club/province(REGION)/
meet-date and splits (splits not imported).

The app's bulk-upload (`app/(dashboard)/dashboard/records/bulk-upload`) ingests
one CSV per record list. `parseRecordsCSV` accepts flexible headers
(`Event`, `Time`, `Swimmer` required; `AgeGroup`, `Club`, `Province`, `Date`,
`Location` optional) and, **for national scope, REQUIRES non-empty `AgeGroup`,
`Club`, AND `Province` per row** (`lib/csv-parser.ts:270-288`).
`parseFilename` infers `courseType`/`gender`/`recordType` from the filename
("women" matched before "men"). Scope comes from the **target club's level**, so
these upload to a national-level "Canadian Masters" club.

This task produces data files only — **no app code changes**.

### Why individual-only, and why drop the "Target Time" rows

- **Relays** require all 4 swimmer names (`csv-parser.ts:246`), but the source
  has only a club per relay. The user chose to support these as *club-team*
  relay records, which needs an **app feature change** — a separate sub-project.
  So relays are out of scope here; the 4 individual files don't depend on it.
- **33 "Target Time" rows** (swimmer literally `"Target Time"`, time
  `59:59.99`, blank club/province, only in the 90-94 / 95-99 bands) are
  placeholders for bands with no record yet — not real records. They are
  dropped (and would fail the national club/province requirement anyway).

## Goals

1. 4 CSV files (LCM/SCM × Men/Women) of individual records, named so the
   importer infers the right course/gender, with national-scope columns.
2. Every real record imports — missing `Province` is filled with a placeholder
   so the row is accepted (and flagged for later correction).
3. A `_review.csv` listing every row that was dropped (Target Time) or
   placeholdered (missing Province) or has a malformed age band.
4. Validation: each file parses through the app's `parseRecordsCSV`
   (`scope: "national"`) with **0 errors**, all rows becoming records.

## Non-goals

- **Relay records** — deferred until the club-team-relay app feature exists
  (separate brainstorm/spec/PR), after which the 6 relay files are generated.
- No app/importer code changes in this task.
- Not creating the "Canadian Masters" club / setting its level (manual user
  step).
- Not importing splits, FINA/Rudolph points, birthdate, club code, nation,
  status.

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Relays | Deferred to a separate club-team-relay feature; **not** in this task |
| D2 | "Target Time" placeholder rows (33) | Dropped (not records); logged in `_review.csv` |
| D3 | Missing Province on a real record | Fill with placeholder `"Unknown"` so it imports; log in `_review.csv` |
| D4 | Individual swimmer name format | Reformat `"LASTNAME, Firstname"` → `"Firstname Lastname"`, smart-title-cased (apostrophes within-word, capitalize after space/hyphen/`(`) |
| D5 | Malformed age band (`105/-1`, 2 rows) | Render `"105+"`; log in `_review.csv` |
| D6 | Output & tooling | Files under `SNC-new/import/`; rerunnable stdlib Python generator |

## Design

### Output files (`SNC-new/import/`)

| File | Records | Province-placeholdered |
|------|---------|------------------------|
| `LCM Men.csv` | 264 | 5 |
| `LCM Women.csv` | 267 | 3 |
| `SCM Men.csv` | 289 | 0 |
| `SCM Women.csv` | 292 | 0 |
| **total** | **1,112** | **8** |

Plus `_review.csv`. (Counts are after dropping the 33 Target Time rows.)

### Column layout (every file)

Header: `Event,AgeGroup,Time,Swimmer,Club,Province,Date,Location`.
Values CSV-quoted when containing commas (the `csv` module handles this).

### Field mapping (per data row, individual only)

A row is **individual** iff `DISTANCE` has no `x`. **Skip** the row if
`FULLNAME` (trimmed, case-insensitive) == `"target time"` (→ `_review.csv`,
issue "target-time placeholder, dropped").

| CSV column | Source → transform |
|---|---|
| `Event` | `DISTANCE` + " " + stroke. `Fr→Free, Bk→Back, Br→Breast, Bu→Fly, Me→IM`. e.g. `50 Free`, `200 IM` |
| `AgeGroup` | `"{AGEMIN}-{AGEMAX}"`; if `AGEMAX` missing/`-1`/`< AGEMIN` → `"{AGEMIN}+"` and flag |
| `Time` | `SWIMTIME` verbatim (`MM:SS.hh` / `SS.hh`) |
| `Swimmer` | `FULLNAME` reformatted (D4) |
| `Club` | `CLUBNAME` verbatim |
| `Province` | `REGION`; if blank → `"Unknown"` (D3) and flag |
| `Date` | `MEETDATE` Excel serial (epoch `1899-12-30`) → `YYYY-MM-DD`; non-numeric/blank → empty |
| `Location` | `MEETCITY`, but empty when value ∈ {`???`, `UNKNOWN`, ``} (case-insensitive) |

**Name reformat (D4):** split `FULLNAME` on the first comma → `last`, `first`;
output `"{first} {last}"`; capitalize the first alpha of each word where a word
starts at string-start or after a space / `-` / `(` / `/`; lowercase the rest;
do NOT capitalize after an apostrophe. So `MORIN, David → David Morin`,
`PRUD'HOMME, Marc → Marc Prud'homme`, `ST-PIERRE, Jean → Jean St-Pierre`,
`HUDGELL (NEE PARKHOUSE), Jaynie → Jaynie Hudgell (Nee Parkhouse)`. No comma →
smart-title the whole string.

### `_review.csv`

Header: `SourceRow,Issue,TargetFile,Event,AgeGroup,Swimmer,Club,Province,Date`.
One row per data row that is dropped (Target Time), province-placeholdered, or
has a malformed age band. `SourceRow` is the 1-based Excel row number (header is
row 2). For dropped rows `TargetFile` is empty. ~41 rows expected (33 dropped +
8 placeholdered; the 2 malformed bands also appear).

### Generator (D6)

`SNC-new/generate_imports.py` — Python 3 stdlib only (`zipfile` +
`xml.etree.ElementTree` to read the xlsx, `csv` to write). Deterministic, no
network, no third-party packages. Rerunnable: overwrites `SNC-new/import/*`.
Reads from `SNC-new/Records-CAN.MS (1).xlsx`. Prints per-file counts + review
count.

### Validation

A **throwaway Vitest test inside `club-record/`**
(`lib/masters-import.validation.test.ts`) is the validator (it runs in the
toolchain that resolves `@/` and `papaparse`). It imports `parseRecordsCSV`,
reads each generated CSV from `SNC-new/import/` by absolute path (`fs`), runs it
with `{ relay: false, scope: "national" }`, and asserts **0 errors** and
`records.length === (number of data rows in the file)`. Run once to confirm
upload-readiness, then **deleted** (depends on machine-local absolute paths to
data outside the repo — not committed).

## Verification

1. `python3 SNC-new/generate_imports.py` → writes 4 CSVs + `_review.csv`;
   printed counts match the table (1,112 total; 33 dropped; 8 placeholdered).
2. Validation test → all 4 files: 0 errors, records == data-row count.
3. Spot-check: `LCM Men.csv` contains
   `50 Free,18-24,25.24,David Morin,C.N. Jonquiere,QC,2005-11-26,` and a
   placeholdered row shows `Province = Unknown`.

## Follow-ups (not this task)

- The user creates/confirms a national-level "Canadian Masters" club, then
  bulk-uploads the 4 files.
- Fix the `_review.csv` rows at source (provinces, the 2 malformed bands) and
  regenerate if desired.
- **Club-team relay feature** (separate sub-project) → then generate the 6
  relay files.
</content>
