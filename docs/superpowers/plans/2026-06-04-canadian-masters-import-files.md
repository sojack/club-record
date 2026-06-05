# Canadian Masters Individual Import Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate 4 upload-ready CSV files (LCM/SCM × Men/Women) of Canadian Masters **individual** records from the source xlsx, plus a `_review.csv`, and validate them through the app's own parser.

**Architecture:** A stdlib Python generator reads `SNC-new/Records-CAN.MS (1).xlsx` (xlsx = zipped XML), maps each individual row to the importer's national-scope columns (dropping "Target Time" stubs, placeholdering missing Province), and writes the CSVs to `SNC-new/import/`. A throwaway Vitest test runs each file through `parseRecordsCSV` to prove 0 parse errors.

**Tech Stack:** Python 3 stdlib (`zipfile`, `xml.etree`, `csv`); Vitest + the app's `parseRecordsCSV` for validation.

**Spec:** `docs/superpowers/specs/2026-06-04-canadian-masters-import-files-design.md`

**Important — no git commits:** the deliverables (generator + CSVs) live under `SNC-new/`, which is **outside the git repo** (the repo is `club-record/`). The validation test is created inside `club-record/`, run, then **deleted**. So this plan commits nothing. (The spec + this plan were already committed.)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `SNC-new/generate_imports.py` | **Create** — reads the xlsx, writes the CSVs + `_review.csv` |
| `SNC-new/import/{LCM,SCM} {Men,Women}.csv` | **Generated** — the 4 upload files |
| `SNC-new/import/_review.csv` | **Generated** — dropped/placeholdered/malformed rows |
| `club-record/lib/masters-import.validation.test.ts` | **Create then delete** — validates the files via the app parser |

---

## Task 1: Write and run the generator

**Files:**
- Create: `SNC-new/generate_imports.py`

- [ ] **Step 1: Create the generator**

Create `SNC-new/generate_imports.py` with exactly:

```python
#!/usr/bin/env python3
"""Generate Canadian Masters INDIVIDUAL record import CSVs from the source xlsx.

Run from the SNC-new/ directory:  python3 generate_imports.py
Stdlib only. Rerunnable (overwrites import/).
"""
import csv
import datetime
import os
import zipfile
import xml.etree.ElementTree as ET

SRC = "Records-CAN.MS (1).xlsx"
OUTDIR = "import"
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
HEADER = ["Event", "AgeGroup", "Time", "Swimmer", "Club", "Province", "Date", "Location"]
STROKES = {"Fr": "Free", "Bk": "Back", "Br": "Breast", "Bu": "Fly", "Me": "IM"}
GENDER_WORD = {"M": "Men", "F": "Women", "X": "Mixed"}
PROVINCE_PLACEHOLDER = "Unknown"


def load_rows(path):
    z = zipfile.ZipFile(path)
    shared = [
        "".join(t.text or "" for t in si.iter(f"{M}t"))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{M}si")
    ]

    def col_index(ref):
        letters = "".join(ch for ch in ref if ch.isalpha())
        n = 0
        for ch in letters:
            n = n * 26 + (ord(ch) - 64)
        return n - 1

    rows = []
    for r in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(f"{M}row"):
        cells, maxc = {}, 0
        for c in r.findall(f"{M}c"):
            ci = col_index(c.get("r"))
            maxc = max(maxc, ci)
            t = c.get("t")
            v = c.find(f"{M}v")
            if t == "s" and v is not None:
                cells[ci] = shared[int(v.text)]
            elif v is not None:
                cells[ci] = v.text
            else:
                cells[ci] = ""
        rows.append([cells.get(i, "") for i in range(maxc + 1)])
    return rows


def smart_title(s):
    out = []
    cap = True
    for ch in s:
        if ch.isalpha():
            out.append(ch.upper() if cap else ch.lower())
            cap = False
        else:
            out.append(ch)
            cap = ch in " -(/"  # capitalize the next letter after these only
    return "".join(out)


def reformat_name(fullname):
    s = (fullname or "").strip()
    if "," in s:
        last, first = s.split(",", 1)
        s = f"{first.strip()} {last.strip()}"
    return smart_title(s)


def excel_date(serial):
    s = (serial or "").strip()
    if not s:
        return ""
    try:
        days = int(float(s))
    except ValueError:
        return ""
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=days)).isoformat()


def clean_location(city):
    c = (city or "").strip()
    return "" if c.lower() in ("???", "unknown", "") else c


def age_group(agemin, agemax):
    """Return (value, ok). ok is False for a malformed band."""
    lo_s, hi_s = (agemin or "").strip(), (agemax or "").strip()
    try:
        lo = int(lo_s)
    except ValueError:
        return (f"{lo_s}-{hi_s}", False)
    try:
        hi = int(hi_s)
    except ValueError:
        return (f"{lo}+", False)
    if hi < lo:
        return (f"{lo}+", False)
    return (f"{lo}-{hi}", True)


def main():
    rows = load_rows(SRC)
    header = rows[1]
    idx = {name: i for i, name in enumerate(header)}

    def g(row, name):
        i = idx.get(name)
        return row[i] if (i is not None and i < len(row)) else ""

    buckets = {}   # filename -> list[list[str]]
    review = []    # list[list[str]]

    for excel_row_num, row in enumerate(rows[2:], start=3):
        if not g(row, "COURSE"):
            continue
        distance = g(row, "DISTANCE")
        if "x" in distance:
            continue  # relay — deferred to a separate feature

        course = g(row, "COURSE")
        gender_word = GENDER_WORD.get(g(row, "GENDER"), g(row, "GENDER"))
        filename = f"{course} {gender_word}.csv"

        stroke = g(row, "STROKE")
        event = f"{distance} {STROKES.get(stroke, stroke)}"
        ag, ag_ok = age_group(g(row, "AGEMIN"), g(row, "AGEMAX"))
        time = g(row, "SWIMTIME").strip()
        club = g(row, "CLUBNAME").strip()
        fullname = g(row, "FULLNAME")
        swimmer = reformat_name(fullname)
        region = g(row, "REGION").strip()
        date = excel_date(g(row, "MEETDATE"))
        loc = clean_location(g(row, "MEETCITY"))

        # Drop "Target Time" placeholder stubs (not real records).
        if fullname.strip().lower() == "target time":
            review.append([excel_row_num, "target-time placeholder, dropped", "",
                           event, ag, swimmer, club, region, date])
            continue

        issues = []
        province = region
        if not province:
            province = PROVINCE_PLACEHOLDER
            issues.append("missing province -> placeholder")
        if not ag_ok:
            issues.append("malformed age band")

        buckets.setdefault(filename, []).append(
            [event, ag, time, swimmer, club, province, date, loc]
        )
        if issues:
            review.append([excel_row_num, "; ".join(issues), filename,
                           event, ag, swimmer, club, province, date])

    os.makedirs(OUTDIR, exist_ok=True)
    total = 0
    for filename in sorted(buckets):
        with open(os.path.join(OUTDIR, filename), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(HEADER)
            w.writerows(buckets[filename])
        total += len(buckets[filename])
        print(f"{filename}: {len(buckets[filename])} records")

    with open(os.path.join(OUTDIR, "_review.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["SourceRow", "Issue", "TargetFile", "Event", "AgeGroup",
                    "Swimmer", "Club", "Province", "Date"])
        w.writerows(review)

    print(f"_review.csv: {len(review)} rows")
    print(f"TOTAL individual records: {total}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the generator**

Run: `cd /Users/jackso/code/ClubRecordProject/SNC-new && python3 generate_imports.py`
Expected output (exactly these counts):
```
LCM Men.csv: 264 records
LCM Women.csv: 267 records
SCM Men.csv: 289 records
SCM Women.csv: 292 records
_review.csv: 43 rows
TOTAL individual records: 1112
```
If any count differs, the mapping/filter logic is wrong — do not proceed; debug against the spec.

- [ ] **Step 3: Spot-check the output**

Run: `head -3 "/Users/jackso/code/ClubRecordProject/SNC-new/import/LCM Men.csv"`
Expected: a header line `Event,AgeGroup,Time,Swimmer,Club,Province,Date,Location` then a row like `50 Free,18-24,25.24,David Morin,C.N. Jonquiere,QC,2005-11-26,` (first data row — note the trailing empty Location for the `???` meet city).

Run: `grep -m1 Unknown "/Users/jackso/code/ClubRecordProject/SNC-new/import/LCM Men.csv"`
Expected: a row whose `Province` column is `Unknown` (a placeholdered record, e.g. an "Unattached Canada" swimmer).

Run: `head -4 "/Users/jackso/code/ClubRecordProject/SNC-new/import/_review.csv"`
Expected: the review header then rows including `target-time placeholder, dropped` and `missing province -> placeholder` issues.

(No git commit — `SNC-new/` is outside the repo.)

---

## Task 2: Validate through the app parser, then clean up

**Files:**
- Create then delete: `club-record/lib/masters-import.validation.test.ts`

- [ ] **Step 1: Write the throwaway validation test**

Create `club-record/lib/masters-import.validation.test.ts` with exactly:

```ts
// TEMPORARY — delete after running. Validates the generated Masters import
// files against the real importer. Depends on a machine-local absolute path to
// data outside the repo, so it is NOT committed.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseRecordsCSV } from "./csv-parser";

const DIR = "/Users/jackso/code/ClubRecordProject/SNC-new/import";
const FILES: Record<string, number> = {
  "LCM Men.csv": 264,
  "LCM Women.csv": 267,
  "SCM Men.csv": 289,
  "SCM Women.csv": 292,
};

describe("Canadian Masters individual import files", () => {
  for (const [file, count] of Object.entries(FILES)) {
    it(`${file}: parses with 0 errors and ${count} records`, () => {
      const csv = readFileSync(`${DIR}/${file}`, "utf-8");
      const { records, errors } = parseRecordsCSV(csv, { relay: false, scope: "national" });
      expect(errors).toEqual([]);
      expect(records).toHaveLength(count);
    });
  }
});
```

- [ ] **Step 2: Run the validation**

Run: `cd /Users/jackso/code/ClubRecordProject/club-record && npx vitest run lib/masters-import.validation.test.ts`
Expected: **4 passed** — each file parses with 0 errors and the listed record count. (This proves every row satisfies the national-scope requirements: event/time/swimmer present, age group present, club present, province present.)

If a file reports parse errors, read the error messages — they name the row and the missing requirement — and fix the generator (Task 1), regenerate, and re-run. Do not weaken the assertions.

- [ ] **Step 3: Delete the temporary test**

Run: `rm "/Users/jackso/code/ClubRecordProject/club-record/lib/masters-import.validation.test.ts"`

Run: `cd /Users/jackso/code/ClubRecordProject/club-record && npx vitest run 2>&1 | grep -E "Tests "`
Expected: `Tests  127 passed (127)` — the repo's suite is back to its baseline (the temp test is gone, nothing else changed).

- [ ] **Step 4: Final report**

Report the deliverables: `SNC-new/import/` contains `LCM Men.csv` (264), `LCM Women.csv` (267), `SCM Men.csv` (289), `SCM Women.csv` (292), and `_review.csv` (43 rows), all validated through the app's parser with 0 errors. Note the user's remaining manual steps: create/confirm a national-level "Canadian Masters" club, then bulk-upload the 4 files; optionally fix `_review.csv` rows and regenerate. Relay records remain a separate follow-up feature.

---

## Self-Review Notes (for the executor)

- **No git commits anywhere** — the generator and CSVs are under `SNC-new/` (outside the repo); the validation test is created in-repo only to run, then deleted. Confirm `git status` in `club-record/` is clean at the end (aside from the already-committed spec/plan).
- **Counts are the contract:** the generator must print 264/267/289/292 (total 1112) and `_review.csv: 43 rows`; the validation test asserts the same per-file counts with 0 parse errors. A mismatch means a mapping bug, not a test to relax.
- **Why 0 errors is expected:** Target-Time rows (the only blank-club rows) are dropped; every remaining row has a club, an age group, and either a real or `"Unknown"` province — satisfying national scope.
- **`smart_title`** capitalizes after space/`-`/`(`/`/` but NOT after an apostrophe, so `PRUD'HOMME, Marc → Marc Prud'homme` and `ST-PIERRE → St-Pierre`.
```
