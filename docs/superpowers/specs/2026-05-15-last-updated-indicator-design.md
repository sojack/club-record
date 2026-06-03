# Design: "Last updated" indicator for record lists

**Date:** 2026-05-15
**Status:** Approved (design); pending spec review

## Goal

Show a human-readable "Last updated <when>" indicator for each record list in the
dashboard, so club staff can see at a glance how fresh a list's data is.

## Requirements (locked with user)

- **Placement:** two locations —
  1. Each list card on `/dashboard/records` (the grid)
  2. The header of the single-list editor page `/dashboard/records/[listId]`
  - The main `/dashboard` landing page is explicitly **out of scope**.
- **Meaning — content freshness:** the indicator reflects
  `GREATEST(record_lists.updated_at, MAX(records.updated_at))` for the list.
  Editing/adding any record in the list moves the timestamp, not just renaming
  the list. A list with no records falls back to its own `record_lists.updated_at`.
- **Format:** relative text (e.g. "2 days ago") with the exact local date/time in
  a native hover tooltip (e.g. "May 15, 2026, 3:42 PM"). Viewer's local timezone.

## Hard dependency

This feature requires `supabase/migrations/add_updated_at_tracking.sql` to be
applied to the Supabase database first. Until then the `updated_at` columns do
not exist and the records query errors. This migration is already written but not
yet applied (tracked separately).

## Architecture

Two new, independently testable units; two edited pages. No new DB objects
(Approach A — client-side compute).

### New: `lib/date-utils.ts` (pure, no dependencies)

Mirrors the structure of the existing `lib/time-utils.ts`. Uses only built-in
`Intl`; no date library is added.

- `maxIso(isos: (string | null | undefined)[]): string | null`
  Returns the latest ISO timestamp, ignoring null/undefined. Returns `null` if
  all inputs are null/undefined. This is the `GREATEST` logic.
- `formatRelativeTime(iso: string): string`
  Returns "just now" / "2 minutes ago" / "3 hours ago" / "2 days ago" /
  "3 weeks ago" / "2 months ago" / "1 year ago" via `Intl.RelativeTimeFormat`.
- `formatExactDateTime(iso: string): string`
  Returns a localized absolute date/time (e.g. "May 15, 2026, 3:42 PM") via
  `Date#toLocaleString` in the viewer's locale/timezone.

### New: `components/LastUpdated.tsx` (presentational)

Follows the existing small-component pattern (e.g. `RecordFlags`).

- Props: `{ iso: string | null }`
- Renders nothing when `iso` is `null`.
- Otherwise renders a single muted span:
  `<span title={formatExactDateTime(iso)}>Last updated {formatRelativeTime(iso)}</span>`
- Styling matches the existing muted metadata text on the cards
  (`text-sm text-gray-500 dark:text-gray-400`).
- Single source of truth for the label's markup/style across both placements.

### Edited: `app/(dashboard)/dashboard/records/page.tsx` (cards grid)

- `loadRecordLists()` already fetches all lists for the club. After it has the
  list IDs, run one additional query:
  `supabase.from("records").select("record_list_id, updated_at").in("record_list_id", listIds)`
- Reduce the result to a `Map<listId, maxRecordUpdatedAt>`.
- For each list compute `maxIso([list.updated_at, map.get(list.id)])` and store
  it on the list object in component state (extend the existing state row type
  with a `lastUpdated: string | null` field).
- Render `<LastUpdated iso={list.lastUpdated} />` inside the card, on its own
  line near the existing "{count} records" text.
- Existing ordering (by `title`) is unchanged.

### Edited: `app/(dashboard)/dashboard/records/[listId]/page.tsx` (single list)

- This page already loads the list row and all of its records for the editor.
  Ensure both fetches include `updated_at` (they use `select("*")`, so the
  column is included automatically once the migration is applied).
- Compute `maxIso([list.updated_at, ...records.map(r => r.updated_at)])` from
  data already in memory — **no extra query**.
- Render `<LastUpdated>` in the page header near the list title / record count.
- After a save, the page already reloads records; the recompute happens on the
  reloaded data, so the indicator refreshes without extra work.

## Data flow summary

| Page | Lists source | Records freshness source | Extra queries |
|---|---|---|---|
| Cards grid | existing list query | new `records(record_list_id, updated_at)` query | 1 |
| Single list | existing list query | already-loaded records | 0 |

The extra cards-grid query selects only two columns over the same list IDs the
page's CSV export already fetches with `select("*")`, so it is strictly lighter
than existing behavior — no performance concern at a single club's data volume.

## Error handling & edge cases

- **Migration not applied:** documented hard dependency above. Behavior in that
  state is covered by graceful degradation below (page still renders).
- **Graceful degradation:** following the pages' existing
  `const { data } = await …` pattern, if the extra records query fails or
  returns nothing, fall back to `list.updated_at` alone. The page never breaks.
  If even that is absent, `maxIso` returns `null` and `LastUpdated` renders
  nothing.
- **Empty list:** no records → `maxIso` falls back to `record_lists.updated_at`,
  which is `NOT NULL` after the migration.
- **Timezone/locale:** relative and exact strings both use the viewer's browser
  locale and timezone (default `Intl` behavior). No server-side formatting.

## Testing

The project has no test framework configured (per `CLAUDE.md`) and this work
does not introduce one (out of scope, YAGNI). Verification:

- `npm run build` — TypeScript typecheck across the edited pages and new files.
- Manual check: both placements display, tooltip shows exact time, indicator
  updates after editing a record on the single-list page.

`lib/date-utils.ts` functions are written as pure functions specifically so they
are trivially unit-testable if a harness is added later.

## Scope guard (YAGNI — explicitly excluded)

- No changes to the main `/dashboard` landing page.
- No Postgres RPC / view (Approach B rejected: extra SQL artifact to coordinate,
  unnecessary at this data volume).
- No PostgREST embedded-aggregate reliance (Approach C rejected: unsupported in
  the pinned Supabase/PostgREST).
- No sort-by-last-updated, no caching layer, no "updated by <user>" attribution.

## Files

| File | Change |
|---|---|
| `lib/date-utils.ts` | new — pure date helpers |
| `components/LastUpdated.tsx` | new — presentational indicator |
| `app/(dashboard)/dashboard/records/page.tsx` | edit — extra query + render in card |
| `app/(dashboard)/dashboard/records/[listId]/page.tsx` | edit — compute from loaded data + render in header |
| `supabase/migrations/add_updated_at_tracking.sql` | pre-existing dependency (must be applied first) |
