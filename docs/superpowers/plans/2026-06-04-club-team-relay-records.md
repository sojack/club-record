# Club-Team Relay Records + Masters Relay Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the importer accept club-team relay records (leg-1 only), then generate + validate the 6 Canadian Masters relay import files.

**Architecture:** Task 1 (TDD) relaxes `parseRecordsCSV`'s relay rule to "1-or-4" and null-safes the absent legs — a committed app change guarded by new tests. Task 2 extends the (out-of-repo) generator to emit the 6 relay CSVs and validates them through the new importer path (throwaway test, no commit).

**Tech Stack:** TypeScript, Vitest; Python 3 stdlib for the generator.

**Spec:** `docs/superpowers/specs/2026-06-04-club-team-relay-records-design.md`

**Conventions:**
- Run commands from `/Users/jackso/code/ClubRecordProject/club-record` unless noted.
- **Never `git push`.** Task 1 commits locally (the app change); Task 2 commits nothing (data lives in `SNC-new/`, outside the repo).
- Lint is a hard gate (`eslint . --max-warnings 0`).

---

## File Structure

| File | Change |
|------|--------|
| `lib/csv-parser.test.ts` | Add relay club-team / full / partial tests |
| `lib/csv-parser.ts` | 1-or-4 relay rule + null-safe legs |
| `SNC-new/generate_imports.py` | Extend to emit the 6 relay files |
| `SNC-new/import/{LCM,SCM} {Men,Women,Mixed} Relay.csv` | **Generated** |
| `club-record/lib/relay-import.validation.test.ts` | **Create then delete** — validates all 10 files |

---

## Task 1: Importer — 1-or-4 relay rule (TDD)

**Files:**
- Modify: `lib/csv-parser.test.ts`
- Modify: `lib/csv-parser.ts`

- [ ] **Step 1: Add the failing tests**

Append to `lib/csv-parser.test.ts` (top level):

```ts
describe("parseRecordsCSV — relay club-team rule", () => {
  it("accepts a club-team relay with only leg 1 (national scope)", () => {
    const csv =
      "Event,AgeGroup,Time,Swimmer,Club,Province\n" +
      "4x50 Free,72-99,1:44.79,Penguin Masters,Penguin Masters,AB";
    const { records, errors } = parseRecordsCSV(csv, { relay: true, scope: "national" });
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0].swimmer_name).toBe("Penguin Masters");
    expect(records[0].swimmer_name_2).toBeNull();
    expect(records[0].swimmer_name_3).toBeNull();
    expect(records[0].swimmer_name_4).toBeNull();
    expect(records[0].record_club).toBe("Penguin Masters");
  });

  it("still accepts a full 4-swimmer relay", () => {
    const csv =
      "Event,AgeGroup,Time,Name1,Name2,Name3,Name4,Club,Province\n" +
      "4x50 Free,72-99,1:44.79,A,B,C,D,Some Club,AB";
    const { records, errors } = parseRecordsCSV(csv, { relay: true, scope: "national" });
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0].swimmer_name).toBe("A");
    expect(records[0].swimmer_name_2).toBe("B");
    expect(records[0].swimmer_name_4).toBe("D");
  });

  it("rejects a partial relay (2 of 4 swimmers)", () => {
    const csv =
      "Event,AgeGroup,Time,Name1,Name2,Club,Province\n" +
      "4x50 Free,72-99,1:44.79,A,B,Some Club,AB";
    const { records, errors } = parseRecordsCSV(csv, { relay: true, scope: "national" });
    expect(records).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — confirm the club-team test FAILS**

Run: `npx vitest run lib/csv-parser.test.ts`
Expected: FAIL — "accepts a club-team relay…" fails (current code rejects it: "require all 4 swimmer names"). The full-relay test passes; the partial test passes (current code already errors on it). This shows the gap.

- [ ] **Step 3: Implement the 1-or-4 rule**

In `lib/csv-parser.ts`, replace this block (currently lines 246-252):

```ts
    if (isRelay) {
      if (!name2?.trim() || !name3?.trim() || !name4?.trim()) {
        errors.push(
          `Row ${index + 2}: Relay records require all 4 swimmer names (Name1-Name4)`
        );
        return;
      }
```

with:

```ts
    if (isRelay) {
      const presentLegs = [name2, name3, name4].filter((n) => n?.trim()).length;
      if (presentLegs !== 0 && presentLegs !== 3) {
        errors.push(
          `Row ${index + 2}: A relay needs all 4 swimmer names, or just the team name in leg 1 (Swimmer)`
        );
        return;
      }
```

(Leave the `allowedAgeGroups` check that follows, and the closing `}` of the `if (isRelay)` block, unchanged.)

Then null-safe the absent legs — replace lines 291-293:

```ts
      swimmer_name_2: isRelay ? name2!.trim() : null,
      swimmer_name_3: isRelay ? name3!.trim() : null,
      swimmer_name_4: isRelay ? name4!.trim() : null,
```

with:

```ts
      swimmer_name_2: isRelay ? (name2?.trim() || null) : null,
      swimmer_name_3: isRelay ? (name3?.trim() || null) : null,
      swimmer_name_4: isRelay ? (name4?.trim() || null) : null,
```

Change nothing else (the base `event/time/swimmer` required check and the
national `recordClub`/`ageGroup`/`province` checks stay — leg-1 still required,
holding the team for a club-team relay).

- [ ] **Step 4: Run — all pass**

Run: `npx vitest run lib/csv-parser.test.ts`
Expected: PASS (the 3 new + all existing).

Run: `npx tsc --noEmit` → exit 0. Run: `npm run lint` → exit 0.

- [ ] **Step 5: Commit (LOCAL ONLY, never push, no Co-Authored-By)**

```bash
git add lib/csv-parser.ts lib/csv-parser.test.ts
git commit -m "feat(csv): support club-team relay records (1-or-4 swimmer rule)"
```

---

## Task 2: Generate + validate the 6 relay files

**Files:**
- Modify: `SNC-new/generate_imports.py`
- Create then delete: `club-record/lib/relay-import.validation.test.ts`

- [ ] **Step 1: Extend the generator for relays**

In `SNC-new/generate_imports.py`, in `main()`'s row loop, the current body
**skips relays** with `if "x" in distance: continue`. Replace the per-row body
(from `distance = g(row, "DISTANCE")` through the `buckets.setdefault(...)` /
`review.append(...)`) so relays are routed to relay files and use the relay
stroke map + the club as leg-1 swimmer. The full replacement loop body:

```python
        distance = g(row, "DISTANCE")
        is_relay = "x" in distance
        course = g(row, "COURSE")
        gender_word = GENDER_WORD.get(g(row, "GENDER"), g(row, "GENDER"))
        filename = f"{course} {gender_word}" + (" Relay" if is_relay else "") + ".csv"

        stroke = g(row, "STROKE")
        if is_relay:
            stroke_name = {"Fr": "Free", "Me": "Medley"}.get(stroke, stroke)
        else:
            stroke_name = STROKES.get(stroke, stroke)
        event = f"{distance} {stroke_name}"
        ag, ag_ok = age_group(g(row, "AGEMIN"), g(row, "AGEMAX"))
        time = g(row, "SWIMTIME").strip()
        club = g(row, "CLUBNAME").strip()
        fullname = g(row, "FULLNAME")
        swimmer = club if is_relay else reformat_name(fullname)
        region = g(row, "REGION").strip()
        date = excel_date(g(row, "MEETDATE"))
        loc = clean_location(g(row, "MEETCITY"))

        # Drop "Target Time" placeholder stubs (individual only; relays never match).
        if not is_relay and fullname.strip().lower() == "target time":
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
```

(The functions, constants, header, and file-writing tail are unchanged.)

- [ ] **Step 2: Run the generator**

Run: `cd /Users/jackso/code/ClubRecordProject/SNC-new && python3 generate_imports.py`
Expected per-file counts (order may vary):
```
LCM Men.csv: 264 records
LCM Women.csv: 267 records
SCM Men.csv: 289 records
SCM Women.csv: 292 records
LCM Men Relay.csv: 41 records
LCM Women Relay.csv: 40 records
LCM Mixed Relay.csv: 44 records
SCM Men Relay.csv: 45 records
SCM Women Relay.csv: 45 records
SCM Mixed Relay.csv: 47 records
_review.csv: 45 rows
TOTAL individual records: 1374
```
(The 4 individual counts are unchanged; 6 relay files total 262; `_review.csv`
is now 45 = 43 individual + 2 relay province placeholders; the printed "TOTAL"
label is now all records, 1374.) If counts differ, debug the generator against
the spec — do not change expectations.

- [ ] **Step 3: Write the throwaway validation test (all 10 files)**

Create `club-record/lib/relay-import.validation.test.ts` with exactly:

```ts
// TEMPORARY — delete after running. Validates the generated Masters import
// files (individual + relay) through the real importer. Machine-local absolute
// path; NOT committed.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseRecordsCSV } from "./csv-parser";

const DIR = "/Users/jackso/code/ClubRecordProject/SNC-new/import";
const INDIVIDUAL: Record<string, number> = {
  "LCM Men.csv": 264, "LCM Women.csv": 267, "SCM Men.csv": 289, "SCM Women.csv": 292,
};
const RELAY: Record<string, number> = {
  "LCM Men Relay.csv": 41, "LCM Women Relay.csv": 40, "LCM Mixed Relay.csv": 44,
  "SCM Men Relay.csv": 45, "SCM Women Relay.csv": 45, "SCM Mixed Relay.csv": 47,
};

describe("Masters import files validate through the importer", () => {
  for (const [file, count] of Object.entries(INDIVIDUAL)) {
    it(`individual ${file}: 0 errors, ${count} records`, () => {
      const csv = readFileSync(`${DIR}/${file}`, "utf-8");
      const { records, errors } = parseRecordsCSV(csv, { relay: false, scope: "national" });
      expect(errors).toEqual([]);
      expect(records).toHaveLength(count);
    });
  }
  for (const [file, count] of Object.entries(RELAY)) {
    it(`relay ${file}: 0 errors, ${count} club-team records`, () => {
      const csv = readFileSync(`${DIR}/${file}`, "utf-8");
      const { records, errors } = parseRecordsCSV(csv, { relay: true, scope: "national" });
      expect(errors).toEqual([]);
      expect(records).toHaveLength(count);
      expect(records[0].swimmer_name_2).toBeNull(); // club-team: no leg 2
    });
  }
});
```

- [ ] **Step 4: Run the validation**

Run: `npx vitest run lib/relay-import.validation.test.ts`
Expected: **10 passed** — all individual + relay files parse with 0 errors and the expected counts, and the relay records are club-team (no leg 2). If a relay file errors, the 1-or-4 rule (Task 1) or the generator (Step 1) is wrong — fix and re-run; do not weaken the test.

- [ ] **Step 5: Delete the temp test + confirm baseline**

Run: `rm "/Users/jackso/code/ClubRecordProject/club-record/lib/relay-import.validation.test.ts"`
Run: `npx vitest run 2>&1 | grep -E "Tests "`
Expected: `Tests  130 passed (130)` — the repo's suite (127 baseline + 3 new relay tests from Task 1), with the temp test gone.

- [ ] **Step 6: Final report**

Report: `SNC-new/import/` now holds all 10 files (4 individual + 6 relay, 1,374 records), validated through the importer with 0 errors. No commit for the data (outside repo). The user's manual steps: create/confirm a national-level "Canadian Masters" club, then bulk-upload all 10 files; optionally fix `_review.csv` and regenerate.

---

## Self-Review Notes (for the executor)

- **TDD red is real:** Step 2 must show the club-team test failing on current code before Task 1 Step 3. If it passes first, the test or environment is wrong.
- **1-or-4 logic:** `presentLegs` counts legs 2-4 only; `0` = club-team (valid), `3` = full relay (valid), `1`/`2` = error. Leg-1 (`Swimmer`) is still required by the unchanged base check.
- **Only Task 1 commits** (the app change, on the feature branch). Task 2 commits nothing — the generator + CSVs live under `SNC-new/`, outside the repo; the validation test is created only to run, then deleted. Confirm `git status` in `club-record/` is clean afterward (aside from the Task 1 commit).
- **Baseline math:** repo suite goes 127 → 130 (Task 1's 3 relay tests); the temp validation test is never counted in the committed baseline.
```
