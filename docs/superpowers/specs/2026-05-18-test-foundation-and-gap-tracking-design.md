# Design: Test foundation + gap tracking (first step)

**Date:** 2026-05-18
**Status:** Approved
**Topic:** Establish a unit-test foundation for the pure-logic layer, wire CI, and
record all known software-development gaps in a tracked debt document.

## Context

Club Record has zero automated tests, no CI, and no tracked record of technical
debt. The highest-risk logic is pure and trivially testable: `lib/time-utils.ts`
(swim-time parse/format — the product's core correctness) and `lib/csv-parser.ts`
(import of untrusted spreadsheets). A bug in either silently corrupts public
records. This first step closes the largest risk with the least ceremony and
captures every remaining gap so the rest can be addressed deliberately over time.

## Goals

1. A green test pipeline runnable locally and in CI.
2. Unit tests for `lib/time-utils.ts` and `lib/csv-parser.ts`, including bugs.
3. Bugs surfaced by the tests in these two modules are **fixed** (true TDD:
   failing test for correct behavior → fix code), except B4 (see below).
4. A tracked, prioritized `TECH_DEBT.md` capturing all known gaps.

## Non-goals (out of scope for this step — logged in `TECH_DEBT.md`, not done now)

- Component or end-to-end tests (`RecordTable.tsx`, public pages, auth flow).
- API-route tests.
- Input-validation library (e.g. `zod`) at API/CSV boundaries.
- Error tracking / observability / structured logging.
- Database migration tooling or generated DB types.
- README/docs improvements.
- Fixing B4 (`normalizeDate` timezone-dependent fallback) — its own task.

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Gap-tracking doc location | Tracked `TECH_DEBT.md` at the `club-record/` root |
| D2 | Bugs found by tests | True TDD — failing test for correct behavior, then fix the code |
| D3 | Test runner | Vitest (single pinned dev dep, minimal config, no coverage/UI packages yet) |

## Design

### 1. Test scaffold

- Add `vitest` as a pinned dev dependency. No `@vitest/coverage-*` or
  `@vitest/ui` until actually needed.
- `vitest.config.ts`: `test.environment = "node"`, default include glob, no
  extra plugins.
- `package.json` scripts:
  - `"test": "vitest run"`
  - `"test:watch": "vitest"`
- Test files co-located with source: `lib/time-utils.test.ts`,
  `lib/csv-parser.test.ts`.
- Sequencing: scaffold-first. Land Vitest + a single trivial passing test +
  CI (green) before touching any logic, so every later change has a working
  safety net.

### 2. `lib/time-utils.ts` — behavioral contract (true TDD)

Tests assert the **correct** behavior; code is fixed to match. Concrete cases:

**Bugs to fix:**

| ID | Input | Current (wrong) | Correct |
|----|-------|-----------------|---------|
| B1 | `formatMsToTime(59999)` | `"60.00"` | `"1:00.00"` (rounds/rolls into minutes) |
| B2 | `formatMsToTime(69995)` | `"1:09.100"` | `"1:10.00"` (hundredths overflow carries into seconds/minutes) |
| B3 | `parseTimeToMs("abc")`, `parseTimeToMs("1:ab.cd")` | `NaN` | `0` (invalid/non-numeric → 0, so the csv-parser `time_ms === 0` guard works) |
| B3b | `parseTimeToMs("12x")` (partial garbage) | `12000` (silently accepted via `parseFloat`) | `0` (input must be a well-formed time or it is rejected) |

**Contract details:**

- `formatMsToTime` always emits exactly 2 fractional digits; rounding is
  applied once at the hundredths place and any overflow carries into seconds
  and then minutes. `ms <= 0` → `""`.
- `parseTimeToMs` returns an integer ms only when the input is a well-formed
  time (matches a recognized pattern, including the malformed-but-accepted
  `MM:SS:hh` form); for empty, whitespace, non-numeric, or partially numeric
  input (`"12x"`) it returns `0` (never `NaN`, never a partial `parseFloat`
  result). The B3 fix validates the input shape before numeric conversion.
- `format(parse(x))` is stable (idempotent) for canonical inputs.

**Happy-path / boundary coverage (assert, no code change expected):**

- `parseTimeToMs`: `"20.91"` → `20910`; `"1:42.00"` → `102000`;
  `"14:30.67"` → `870670`; malformed `"1:42:00"` → `102000`;
  `""` / `"   "` → `0`; `"1:02:03.45"` (H:MM:SS.hh) → `3723450`.
- `formatMsToTime`: `0` and negative → `""`; `20910` → `"20.91"`;
  `102000` → `"1:42.00"`; sub-minute keeps `SS.hh`.
- `isValidTimeFormat`: true for `20.91`, `1:42.00`, `14:30.67`; false for
  empty, `"abc"`, `"1:2"`. (Document, do not change, that this function is not
  used by csv-parser — the parser relies on `time_ms === 0`.)

### 3. `lib/csv-parser.ts` — test scope

Tests assert current intended behavior; the only behavior change here is the
B3 interaction (NaN-time rows must now be rejected once B3 is fixed).

- Column-name variation mapping (e.g. `event`/`event_name`/`eventname`,
  `swimmer`/`name`/`athlete`).
- Boolean parsing: `x`, `yes`, `1`, `true` (case-insensitive) → `true`;
  others/blank → `false`.
- Missing required field (`event`/`time`/`swimmer`) → row error with the
  correct human row number (`index + 2`).
- B3 interaction: a row with a non-numeric time produces an
  `Invalid time format` error and is **not** pushed to `records` (regression
  test that fails before B3 is fixed).
- Relay mode: all of Name2–Name4 required; `allowedAgeGroups` rejection.
- Scope rules: `club` carries no age/club/province; `provincial` requires
  age group + club; `national` additionally requires province.
- `normalizeDate` deterministic inputs only: `"2024"` → `"2024"`;
  `"2024-3"` → `"2024-03"`; `"2024/03/15"` → `"2024-03-15"`;
  `"2024-03-15"` → `"2024-03-15"`.
- **B4 (logged, not fixed):** `normalizeDate`'s `new Date(trimmed)` fallback
  for free-form strings (e.g. `"Mar 15, 2024"`) is timezone-dependent and can
  shift the day. This is the one exception to D2 — a date-parsing rewrite is
  disproportionate for this step. Logged in `TECH_DEBT.md`; no test is written
  against the non-deterministic fallback path.

### 4. CI

- `.github/workflows/ci.yml`, triggered on push to `main` and on pull
  requests.
- Steps: checkout → setup Node 25 (matches local `v25.8.1`) → `npm ci` →
  `npm run lint` (**non-blocking**, `continue-on-error: true`) →
  `npx tsc --noEmit` → `npm test`.
- Hard gates: `tsc --noEmit` and `npm test`. Lint is non-blocking because the
  codebase has 7 pre-existing `react-hooks` errors + 6 warnings unrelated to
  this work (discovered during Task 1; see §5). It stays visible in CI logs
  and is promoted to a hard gate once the lint debt is cleared.
- Working directory is `club-record/` (the repo root is that subdirectory).
- CI performs verification only — it never pushes, commits, or deploys.

### 5. `TECH_DEBT.md` (tracked, `club-record/` root)

A prioritized checklist. Each item: title, severity (High/Med/Low), one-line
"why it matters", and a `- [ ]` checkbox. Sections by severity. Contents:

- **High:** No automated tests beyond this step's two modules; swallowed
  Supabase errors in `app/api/clubs/[slug]/records/route.ts` (DB failure looks
  like 404/empty); near-absent error handling (only 2 files use `try/catch`);
  no input validation at API/CSV trust boundaries.
- **Medium:** Pre-existing lint failures (7 errors + 6 warnings, mostly
  `react-hooks/set-state-in-effect`) — lint is non-blocking in CI until these
  are fixed and the step is promoted to a hard gate; no error tracking /
  observability / structured logging; manual SQL migrations with hand-mirrored
  `types/database.ts` (schema-drift risk); untested complexity hotspots
  (`RecordTable.tsx` ~892 LOC, `[listId]/page.tsx` ~556 LOC); B4
  (`normalizeDate` timezone-dependent fallback).
- **Low:** Public records API CORS `*` with no rate limiting; no env-var
  validation at startup; no dependency/security scanning (Dependabot/
  `npm audit` in CI); gitignored `docs/` and near-empty `README.md`.
- CI gap is closed by §4 — recorded as done in the doc.

## Acceptance criteria

1. `npm test` runs Vitest and all tests pass.
2. `lib/time-utils.test.ts` and `lib/csv-parser.test.ts` exist with the
   coverage in §2–§3; B1, B2, B3, B3b are demonstrably fixed (their tests fail
   on the pre-fix code and pass after).
3. `.github/workflows/ci.yml` runs lint (non-blocking) + typecheck + test on
   push/PR.
4. `TECH_DEBT.md` exists at the `club-record/` root with all gaps from §5
   (including the pre-existing-lint debt item).
5. `tsc --noEmit` and `npm test` are green; `npm run lint` introduces no new
   problems beyond the documented pre-existing failures.

## Notes on git

`docs/` is gitignored in this repo, so this spec (like the existing
plans/specs) is not tracked. `TECH_DEBT.md` and the new test/CI files live
outside `docs/` and are trackable. Per the user's standing instruction,
nothing is committed or pushed without an explicit prompt.
