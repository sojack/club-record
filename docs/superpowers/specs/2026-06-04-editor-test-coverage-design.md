# Design: Test coverage for the large editors + bulk-upload (High #1, slice 2)

**Date:** 2026-06-04
**Status:** Approved
**Topic:** Add representative characterization tests for the three large,
currently-untested UI surfaces — `components/RecordTable.tsx` (~891 LOC),
`app/(dashboard)/dashboard/records/[listId]/page.tsx` (~556 LOC), and
`app/(dashboard)/dashboard/records/bulk-upload/page.tsx` (~425 LOC) — building
on the existing jsdom + RTL test foundation.

## Context

The 2026-06-04 test-foundation round stood up jsdom + React Testing Library, a
shared Supabase mock (`lib/test/supabase-mock.ts`), and representative C2/C3
coverage. It deliberately deferred the large editors and the bulk-upload UI
(TECH_DEBT High #1). This slice covers them.

`RecordTable` is the highest-value target: it is the core inline-editing UI
(time validation, save/delete contract, relay/scope/readOnly variants) and is
**presentational** — it takes `records` plus `onSave`/`onDelete` callbacks and
touches no Supabase, so it can be tested in isolation with `vi.fn()` callbacks.

## Goals

1. Representative behavioral coverage of the high-value, bug-prone paths in all
   three surfaces.
2. Tests that are **falsifiable** — each would fail if the targeted behavior
   regressed.
3. `vitest run`, `tsc --noEmit`, `npm run lint` (`--max-warnings 0`), and
   `npm run build` all stay green.

## Non-goals (deferred — logged, not done now)

- **No refactor/extraction** of `RecordTable` (characterization tests first;
  any extraction is a later, separately-safety-netted task).
- Exhaustive coverage: the flag-menu editing, history expand/edit, `moveRow`
  reordering, `breakRecord`, and `+ Standard Events` dedup paths are NOT
  covered this round.
- No E2E/Playwright; no coverage-reporting packages.

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | RecordTable approach | Characterization (behavioral RTL) tests only — no refactor |
| D2 | Depth | Representative high-value paths, not exhaustive |
| D3 | Scope | All three surfaces this round (RecordTable, list editor, bulk-upload) |

## Design

All tests use the established pattern: a `// @vitest-environment jsdom` pragma,
`@testing-library/react` + `@testing-library/user-event`, and (for the page
components) `vi.mock` of `@/lib/supabase/client`, `@/contexts/ClubContext`, and
`next/navigation`, wired via `@/lib/test/supabase-mock`.

### §1. `components/RecordTable.test.tsx`

Render with fixture `SwimRecord[]` and `onSave = vi.fn()`, `onDelete = vi.fn()`.
Known DOM handles: toolbar buttons `+ Add Row`, `+ Standard Events`, and
`Save Changes` / `Saving...` (the Save button renders only after an edit sets
`hasChanges`); input placeholders `Event name`, `0:00.00`, `Swimmer name`
(individual) vs `Swimmer 1`..`Swimmer 4` (relay), `Club`/`Prov` (by scope),
`Age group`, `Location`. The per-row delete control is identified by reading the
component (a row remove button); the implementer confirms its exact selector.

Cases:
- **Renders rows:** given 1–2 records, their `event_name`/`swimmer_name` appear
  as input values.
- **Save contract — valid rows pass, empty-event rows are filtered:** edit a
  row's event-name input (Save button appears), append a new row via
  `+ Add Row` and leave its event name empty, click `Save Changes`; assert
  `onSave` was called once and the payload array contains the edited row but
  **not** the empty-event row (the `r.event_name.trim() !== ""` filter).
- **Add row:** `+ Add Row` increases the rendered editable-row count by one.
- **Delete:** the remove control on a **persisted** row (has `id`) calls
  `onDelete(id)`; on a brand-new unsaved row it does NOT call `onDelete`.
- **Time entry:** typing `1:02.50` into a `0:00.00` input and blurring leaves
  the input showing the parsed/formatted time (asserts the `time-utils`
  integration; an invalid entry like `abc` does not crash).
- **readOnly variant:** with `readOnly`, the `Save Changes`/`+ Add Row` toolbar
  is absent.
- **relay variant:** `recordType="relay"` renders `Swimmer 1`..`Swimmer 4`
  inputs (and not the single `Swimmer name`).
- **scope variant:** `scope="national"` renders the province (`Prov`) input.

If the file grows unwieldy, it may be split into
`RecordTable.save.test.tsx` / `RecordTable.variants.test.tsx`; a single file
with `describe` blocks is the default.

### §2. `app/(dashboard)/dashboard/records/[listId]/page.test.tsx`

Mocks `@/lib/supabase/client`, `useClub` (a club with `canEdit: true`),
`useParams` (`{ listId: "list-1" }`), and `useRouter`. `loadData` reads
`record_lists` (`.maybeSingle()`), `records`, `standard_age_groups`,
`standard_events`; configure via `makeSupabase({ ... })`.

Cases:
- **loadData success:** the list title renders and the embedded `RecordTable`
  shows a seeded record (e.g. its swimmer name).
- **List read error:** `record_lists` → `{ error: pgError }` renders
  `<LoadError>` ("We couldn't load this right now…") with a retry button.
- **Genuinely not-found:** `record_lists` → `{ data: null, error: null }`
  renders "Record list not found" (confirms the `.maybeSingle()` behavior from
  the C2 round — a missing list is NOT shown as a load error).
- **Delete-list wiring:** trigger the delete-list flow (open confirm, confirm);
  assert a `record_lists` delete occurred and `router.push("/dashboard/records")`
  was called.

### §3. `app/(dashboard)/dashboard/records/bulk-upload/page.test.tsx`

Mocks `@/lib/supabase/client` and `useClub` (a `selectedClub` with a `level`).
Uses the **real** `parseRecordsCSV`/`parseFilename` against in-memory `File`
objects (`new File([csv], "SCM-Male.csv", { type: "text/csv" })`); `File.text()`
resolves in jsdom. File selection is driven with `userEvent.upload(input, file)`.

Cases:
- **File select → preview:** uploading a `File` whose CSV parses to N valid
  records shows the "N records" preview for that file.
- **Upload success:** with the Supabase `record_lists` insert (returning an
  inserted row) and `records` insert mocked OK, clicking the upload button
  surfaces a success result for the file.
- **No valid rows:** a `File` that parses to 0 records surfaces the
  "No valid records" failure entry (no Supabase insert attempted for it).

## Verification

1. `npx vitest run` → existing 90 + the new tests, all green.
2. `npx tsc --noEmit` → clean (new `.test.tsx` files type-check).
3. `npm run lint` → exit 0 (`--max-warnings 0`; the test files add no lint
   problems).
4. `npm run build` → clean.

## Follow-ups (not here)

- A later, safety-netted refactor extracting `RecordTable`'s pure logic
  (validation / standard-events / break-record builders) into a tested module.
- Coverage for the deferred flag/history/reorder paths if those areas change.
</content>
