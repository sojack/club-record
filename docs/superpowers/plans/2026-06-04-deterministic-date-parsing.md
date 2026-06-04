# Deterministic Date Parsing (B4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `normalizeDate`'s timezone/engine-dependent `new Date(trimmed)` fallback in `lib/csv-parser.ts` with a deterministic English month-name parser that never shifts the day or silently rolls over impossible dates.

**Architecture:** Add a static `MONTHS` map + a `daysInMonth` helper + a `parseMonthNameDate(trimmed)` function (3 regex patterns, day validated against the month's real length). `normalizeDate`'s three numeric branches are unchanged; only the `new Date` fallback is swapped for `parseMonthNameDate`, falling through to the existing "return trimmed as-is" on no match. Pure TDD against the existing `parseRecordsCSV` test path.

**Tech Stack:** TypeScript, Vitest. No new dependency.

**Spec:** `docs/superpowers/specs/2026-06-04-deterministic-date-parsing-design.md`

**Conventions:**
- Run commands from `/Users/jackso/code/ClubRecordProject/club-record`.
- **Commits are LOCAL ONLY. Never `git push`.** No `Co-Authored-By` trailer.
- Lint is a hard gate (`eslint . --max-warnings 0`).

---

## File Structure

| File | Change |
|------|--------|
| `lib/csv-parser.test.ts` | Add a `free-form month-name dates` describe block |
| `lib/csv-parser.ts` | Add `MONTHS` / `daysInMonth` / `parseMonthNameDate`; swap the `new Date` fallback |
| `TECH_DEBT.md` | Mark B4 done |

---

## Task 1: TDD the deterministic month-name parser

**Files:**
- Modify: `lib/csv-parser.test.ts`
- Modify: `lib/csv-parser.ts`

- [ ] **Step 1: Add the failing tests**

Append this `describe` block to `lib/csv-parser.test.ts` (after the existing top-level `describe("parseRecordsCSV — individual", …)` block — i.e. at the end of the file, top level). Note: date values containing a comma are wrapped in quotes so PapaParse keeps them in one field.

```ts
describe("parseRecordsCSV — free-form month-name dates", () => {
  function dateOf(dateField: string): string | null {
    const csv = `Event,Time,Swimmer,Date\n50 Free,24.56,John Smith,${dateField}`;
    const { records } = parseRecordsCSV(csv);
    return records[0].record_date;
  }

  it("parses 'Month YYYY' to YYYY-MM", () => {
    expect(dateOf("March 2024")).toBe("2024-03");
    expect(dateOf("Mar 2024")).toBe("2024-03");
  });

  it("parses 'Month D, YYYY' to YYYY-MM-DD", () => {
    expect(dateOf('"Mar 15, 2024"')).toBe("2024-03-15");
    expect(dateOf("March 5 2024")).toBe("2024-03-05");
  });

  it("parses 'D Month YYYY' to YYYY-MM-DD", () => {
    expect(dateOf("15 March 2024")).toBe("2024-03-15");
  });

  it("returns an impossible day as-is instead of rolling over", () => {
    expect(dateOf('"Feb 30, 2024"')).toBe("Feb 30, 2024");
  });

  it("validates leap-year February", () => {
    expect(dateOf('"Feb 29, 2024"')).toBe("2024-02-29");
    expect(dateOf('"Feb 29, 2023"')).toBe("Feb 29, 2023");
  });

  it("returns an unknown month name as-is", () => {
    expect(dateOf("Smarch 2024")).toBe("Smarch 2024");
  });
});
```

- [ ] **Step 2: Run — confirm the rollover/leap tests FAIL on current code**

Run: `npx vitest run lib/csv-parser.test.ts`
Expected: FAIL. Specifically "returns an impossible day as-is…" (current `new Date("Feb 30, 2024")` rolls to `2024-03-01`) and "validates leap-year February" (`Feb 29, 2023` rolls to `2023-03-01`) fail; the other new cases pass (current `new Date` already handles them). This demonstrates the bug.

- [ ] **Step 3: Add the parser helpers + swap the fallback**

In `lib/csv-parser.ts`, add these three module-level definitions ABOVE the `normalizeDate` function (after the imports at the top):

```ts
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * Deterministically parse English free-form month-name dates without `new Date`,
 * so the result never depends on timezone and impossible days never roll over.
 * Returns "YYYY-MM" / "YYYY-MM-DD", or null if `trimmed` is not a recognized
 * month-name date.
 */
function parseMonthNameDate(trimmed: string): string | null {
  const lower = trimmed.toLowerCase();
  const pad = (n: number) => String(n).padStart(2, "0");

  // "March 2024" / "Mar 2024" -> YYYY-MM
  let m = lower.match(/^([a-z]+)\s+(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1]];
    return month ? `${m[2]}-${pad(month)}` : null;
  }

  // "Mar 15, 2024" / "March 5 2024" -> YYYY-MM-DD
  m = lower.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1]];
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (month && day >= 1 && day <= daysInMonth(year, month)) {
      return `${m[3]}-${pad(month)}-${pad(day)}`;
    }
    return null;
  }

  // "15 March 2024" -> YYYY-MM-DD
  m = lower.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (m) {
    const month = MONTHS[m[2]];
    const day = Number(m[1]);
    const year = Number(m[3]);
    if (month && day >= 1 && day <= daysInMonth(year, month)) {
      return `${m[3]}-${pad(month)}-${pad(day)}`;
    }
    return null;
  }

  return null;
}
```

Then REPLACE the `new Date` fallback block in `normalizeDate`. The current block to delete is:

```ts
  // Try to parse other formats like "March 2024" or "Mar 15, 2024"
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    // If original didn't have a day, return year-month only
    if (/^[a-zA-Z]+\s+\d{4}$/.test(trimmed)) {
      return `${year}-${month}`;
    }
    return `${year}-${month}-${day}`;
  }

  // Return as-is if we can't parse
  return trimmed;
```

Replace it with:

```ts
  // Free-form English month-name dates, parsed deterministically (no `new Date`,
  // so no timezone shift and no silent rollover of impossible days).
  const monthName = parseMonthNameDate(trimmed);
  if (monthName) return monthName;

  // Return as-is if we can't parse
  return trimmed;
```

Leave the three numeric branches (`YYYY`, `YYYY[-/]M`, `YYYY[-/]M[-/]D`) and the empty/`null` guard above unchanged.

Note: a consequence (intended, per the spec non-goals) is that inputs the old `new Date` happened to coerce — e.g. a US-style `3/15/2024` or an ISO datetime `2024-03-15T10:00:00` — now return as-is rather than being normalized. The CSV `Date` column carries plain dates; `YYYY`-first numeric dates still normalize via the unchanged regex branches.

- [ ] **Step 4: Run — confirm all pass**

Run: `npx vitest run lib/csv-parser.test.ts`
Expected: PASS — the new block is green AND the existing "normalizes deterministic date formats" test still passes.

- [ ] **Step 5: Commit**

```bash
git add lib/csv-parser.ts lib/csv-parser.test.ts
git commit -m "fix(csv): deterministic month-name date parsing (no new Date)"
```

---

## Task 2: Verify + update TECH_DEBT

**Files:**
- Modify: `TECH_DEBT.md`

- [ ] **Step 1: Full gate**

Run: `npx vitest run`
Expected: all green — 107 prior + the 6 new date cases.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run lint`
Expected: exit 0 (`--max-warnings 0`).

Optional sanity (manual): `TZ=America/Los_Angeles npx vitest run lib/csv-parser.test.ts` — same results (proves TZ-independence).

- [ ] **Step 2: Update `TECH_DEBT.md`**

Find the `## Low` (or `## Medium`) item beginning **"B4 — `normalizeDate` timezone-dependent fallback"** and mark it done — move it to `## Done` as a `- [x]` entry noting: the `new Date` fallback was replaced with a deterministic English month-name parser (`MONTHS` map + `daysInMonth` + `parseMonthNameDate`); free-form dates no longer depend on timezone, and impossible days (e.g. Feb 30) return as-is instead of silently rolling into the next month; covered by new `csv-parser` tests.

- [ ] **Step 3: Commit**

```bash
git add TECH_DEBT.md
git commit -m "docs: mark B4 deterministic date parsing done"
```

---

## Self-Review Notes (for the executor)

- **TDD red is real:** Step 2 must show the impossible-day/leap tests failing on the *current* `new Date` code before you implement — that's the proof the fix matters. If they pass before Step 3, the test or environment is wrong.
- **CSV comma quoting:** date values with a comma (`"Mar 15, 2024"`, `"Feb 30, 2024"`, `"Feb 29, …"`) MUST be quoted in the test CSV, or PapaParse splits them into two fields. Comma-free values (`March 2024`, `15 March 2024`, `Smarch 2024`) are passed bare.
- **Pattern order matters:** the `YYYY-MM` pattern (`[a-z]+ \d{4}`) is tried first and is anchored (`$`), so it cannot swallow a `Month D, YYYY` input (which has a non-4-digit token after the month). Keep the order as written.
- **No production behavior beyond dates changes:** `normalizeDate`'s numeric branches, signature, and callers are untouched.
```
