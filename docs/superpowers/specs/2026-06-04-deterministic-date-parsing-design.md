# Design: Deterministic free-form date parsing (B4)

**Date:** 2026-06-04
**Status:** Approved
**Topic:** Replace the timezone/engine-dependent `new Date(trimmed)` fallback in
`lib/csv-parser.ts`'s `normalizeDate` with a deterministic month-name parser.
(TECH_DEBT Medium / B4.)

## Context

`normalizeDate(value)` (in `lib/csv-parser.ts`) normalizes CSV `Date` column
values to `YYYY` / `YYYY-MM` / `YYYY-MM-DD`. Its first three branches are
deterministic regex matches on numeric input:

- `YYYY` (e.g. `2024`) → returned as-is.
- `YYYY[-/]M[M]` (e.g. `2024-3`) → `YYYY-MM`.
- `YYYY[-/]M[M][-/]D[D]` (e.g. `2024/03/15`) → `YYYY-MM-DD`.

The **final fallback** for free-form strings is the bug:

```ts
const parsed = new Date(trimmed);
if (!isNaN(parsed.getTime())) {
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  // …returns YYYY-MM (month-name+year) or YYYY-MM-DD
}
```

`new Date(<free-form string>)` is implementation-/locale-/timezone-defined, and
the code then reads **local** components (`getFullYear/getMonth/getDate`). Two
real problems:

1. **TZ/engine non-determinism** — the same CSV can normalize differently
   depending on where it is parsed (the parser runs client-side in
   `CSVUploader` and could run server-side too).
2. **Silent rollover** — `new Date("Feb 30, 2024")` yields March 1/2, so an
   invalid input is silently turned into a *valid-looking wrong date* and
   stored.

Only the three numeric branches are currently tested
(`csv-parser.test.ts` → "normalizes deterministic date formats"); the free-form
fallback has no coverage.

## Goals

1. Free-form date normalization is fully deterministic — independent of
   timezone and JS engine (no `new Date`).
2. Invalid dates are never silently rolled over.
3. The supported free-form formats ("March 2024", "Mar 15, 2024",
   "15 March 2024") still normalize correctly.
4. No new runtime dependency.

## Non-goals

- Non-English month names.
- Disambiguating numeric `D/M/Y` vs `M/D/Y` — left returned as-is (today's
  behavior; guessing is unsafe).
- Time-of-day / weekday parsing, or any format beyond the three month-name
  patterns below.
- Changing the lenient "unrecognized → return the trimmed string as-is"
  contract.

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Mechanism | Hand-rolled deterministic month-name parser; no `new Date`, no new dep |
| D2 | Supported free-form formats | `MonthName YYYY`, `MonthName D[,] YYYY`, `D MonthName YYYY` (English, full + 3-letter abbrev, case-insensitive) |
| D3 | Invalid/unrecognized input | Validate the day against the month's real length (days-per-month, incl. leap-year February); on any failure return the trimmed string as-is (no rollover, no TZ shift, no impossible dates emitted) |

## Design

### Behavior

Replace the `new Date` fallback (the block from `const parsed = new Date(...)`
through its `return`s) with deterministic parsing. The first three numeric
branches and the `null`/empty guard are unchanged.

**Month map** (module-level constant): full names and 3-letter abbreviations →
month number, e.g. `january`/`jan` → 1 … `december`/`dec` → 12. Lookup is
case-insensitive (lowercase the token).

**Patterns** (tried in order; `MONTH` = a month full-name or abbrev):

1. `^MONTH\s+(\d{4})$` → "March 2024" → `YYYY-MM` (month from the map).
2. `^MONTH\s+(\d{1,2}),?\s+(\d{4})$` → "Mar 15, 2024" / "March 5 2024" →
   `YYYY-MM-DD` (day validated against the month length).
3. `^(\d{1,2})\s+MONTH\s+(\d{4})$` → "15 March 2024" → `YYYY-MM-DD`
   (day validated against the month length).

For matches: resolve the month via the map (so the month is always valid 1–12);
validate the day against `daysInMonth(year, month)` (a small lookup table with a
leap-year case for February); zero-pad month and day; build the result string.
If the month token is not in the map, or the day exceeds the month's real
length, the pattern does not "win" → fall through.

If no pattern matches (or a matched day is out of range), **return the trimmed
string as-is** — identical to today's final `return trimmed;`.

### Structure

A single self-contained change inside `lib/csv-parser.ts`:
- Add a module-level `MONTHS: Record<string, number>` constant.
- Optionally extract the month-name parsing into a small local helper
  `parseMonthNameDate(trimmed: string): string | null` (returns the normalized
  string, or `null` to mean "not a month-name date" → caller returns
  `trimmed`). Keeps `normalizeDate` readable.

No change to `normalizeDate`'s signature, its callers, or the `YYYY` /
`YYYY-MM` / `YYYY-MM-DD` numeric branches.

## Testing (TDD)

Drive via the existing `parseRecordsCSV` path (as the current date test does),
in `lib/csv-parser.test.ts`. New cases assert exact outputs:

- `"March 2024"` → `"2024-03"`; `"Mar 2024"` → `"2024-03"`.
- `"Mar 15, 2024"` → `"2024-03-15"`; `"March 5 2024"` → `"2024-03-05"`.
- `"15 March 2024"` → `"2024-03-15"`.
- **No rollover / impossible day:** `"Feb 30, 2024"` → `"Feb 30, 2024"`
  (returned as-is — NOT rolled to a March date, and NOT emitted as the
  impossible `"2024-02-30"`).
- **Leap year:** `"Feb 29, 2024"` → `"2024-02-29"` (2024 is a leap year);
  `"Feb 29, 2023"` → `"Feb 29, 2023"` (as-is — 2023 is not).
- **Unknown month:** `"Smarch 2024"` → `"Smarch 2024"` (as-is).
- **Determinism:** because the implementation no longer calls `new Date`, the
  outputs are TZ-independent **by construction** — so the exact-value
  assertions above _are_ the determinism guarantee. (Do not attempt to flip
  `process.env.TZ` mid-test: Node caches the zone at startup, so that would not
  reliably exercise anything.) Optionally, the run can be sanity-checked under a
  non-UTC `TZ=America/Los_Angeles npx vitest run` once, manually — the same
  values must hold.

The existing "normalizes deterministic date formats" test must stay green.

## Verification

1. `npx vitest run` → all green (existing 107 + new cases).
2. `npx tsc --noEmit` → clean.
3. `npm run lint` → exit 0 (`--max-warnings 0`).

## Follow-ups (not here)

- The TECH_DEBT "time-utils residual edge limitations" item is separate and
  unaffected.
</content>
