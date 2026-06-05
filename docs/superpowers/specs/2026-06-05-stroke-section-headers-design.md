# Design: Stroke section headers on the public record display

**Date:** 2026-06-05
**Status:** Approved
**Topic:** Group records on the public club/record pages under **stroke** section
headers (Freestyle, Backstroke, Breaststroke, Butterfly, Individual Medley) so
visitors can scan a list by stroke, as illustrated in the user's screenshot.

## Context

The public display (`app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx`,
reached via `ClubRecordBrowser`) renders current records as a desktop table +
mobile cards. It already has **one** grouping mechanism: individual lists whose
records carry an `age_group` (national/provincial scope) render age-band section
header rows (`groupedBands`); everything else renders flat.

Event names follow a `{distance} {stroke}` convention (`50 Free`, `200 IM`,
`100 Back`) and `standard_events.sort_order` encodes the canonical stroke order
(Free → Back → Breast → Fly → IM). There is no existing stroke-parsing logic.

This task adds stroke grouping to the **public display only** — no DB change, no
migration, no importer change.

## Goals

1. Every **individual** record list groups its current records under stroke
   section headers in canonical order, with full-word labels.
2. National/provincial lists keep their age-band headers; stroke headers nest
   **inside** each age band.
3. Unrecognized event names still appear (in a trailing "Other" group) — nothing
   is dropped.
4. Search filtering still runs first; empty stroke/band groups disappear as the
   user types.

## Non-goals

- **Relay lists** — unchanged. They keep their current flat rendering with the
  age-group column. (Out of scope; relay event names like "4x50 Free" could be
  grouped later if wanted.)
- No DB / migration / importer / editor changes.
- No change to record history (superseded) rendering, flags, or search.

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Which lists | **All individual lists** (regular club + national/provincial) |
| D2 | Stroke order | **Canonical**: Free → Back → Breast → Fly → IM, then Other |
| D3 | Labels | **Full names**: Freestyle, Backstroke, Breaststroke, Butterfly, Individual Medley |
| D4 | Age-band interaction | **Age band (top) → stroke (sub)** for national/provincial; regular club lists get stroke headers only |
| D5 | Unknown strokes | Trailing **Other** group (never dropped) |
| D6 | Relays | Unchanged (out of scope) |

## Design

### Part 1 — Pure helper (`lib/stroke-grouping.ts`)

Mirrors the existing `lib/record-table-utils.ts` pattern (pure, unit-tested).

**Stroke detection** — `detectStroke(eventName: string): StrokeInfo`. Lowercase
the event name, then test keywords **in this order** (so e.g. "Backstroke" never
matches "free"):

| Test (substring unless noted) | key | label | order |
|---|---|---|---|
| `back` | `back` | Backstroke | 2 |
| `breast` | `breast` | Breaststroke | 3 |
| `fly` or `butterfly` | `fly` | Butterfly | 4 |
| `medley`, or `im` as a whole word (`/\bim\b/`) | `im` | Individual Medley | 5 |
| `free` | `free` | Freestyle | 1 |
| (none of the above) | `other` | Other | 6 |

```ts
export interface StrokeInfo { key: string; label: string; order: number; }
```

The `order` field drives sorting; `key` is used as a stable React key.

**Grouping** — `groupRecordsByStroke(records: SwimRecord[]): StrokeGroup[]`:
stable-bucket records by `detectStroke(record.event_name).key`, then return the
buckets sorted by stroke `order`. Records **within** a bucket keep their incoming
order (already distance-sorted via `sort_order`). Empty strokes are omitted.

```ts
export interface StrokeGroup { stroke: StrokeInfo; records: SwimRecord[]; }
```

**Sections** — `buildStrokeSections(records, hasBands): StrokeSection[]`:

```ts
export interface StrokeSection { band: string | null; strokeGroups: StrokeGroup[]; }
```

- `hasBands === false` → one section `{ band: null, strokeGroups: groupRecordsByStroke(records) }`.
- `hasBands === true` → bucket records by `age_group` (blank → `"—"`), order
  bands by their first numeric value ascending (reuse the existing `ageBandKey`
  logic — move it into this module), and for each band emit
  `{ band, strokeGroups: groupRecordsByStroke(bandRecords) }`.

### Part 2 — Render (`PublicRecordSearch.tsx`)

`strokeGrouped = recordType === "individual"`. Relays keep today's flat path.

`hasBands` = the current `grouped` condition (individual list with any non-empty
`age_group`). Build `sections = buildStrokeSections(filteredRecords, hasBands)`.

**Desktop `<tbody>`** renders, per section:
- If `section.band !== null`: the existing dark band header row
  (`bg-gray-800 … text-lg font-bold`, `colSpan={desktopColSpan}`).
- For each `strokeGroup`: a **stroke header row** —
  `bg-gray-100 dark:bg-gray-700/50`, `font-semibold text-gray-700 dark:text-gray-200`,
  `colSpan={desktopColSpan}`; the `<td>` gets `pl-8` when `section.band !== null`
  (indented sub-header) else `pl-4`. Then the group's records via the unchanged
  `renderDesktopRecord`.

The empty-state row (`filteredRecords.length === 0`) is unchanged.

**Mobile cards** mirror this: dark band `<div>` (when banded) → stroke header
`<div>` (`bg-gray-100 dark:bg-gray-700/50 font-semibold`, indented when banded) →
`renderMobileCard` per record.

`renderDesktopRecord`, `renderMobileCard`, history expansion, flags, and search
are untouched.

### Part 3 — Tests

**`lib/stroke-grouping.test.ts`** (node env — pure):
- `detectStroke`: `"50 Free"→Freestyle`, `"100 Back"→Backstroke`,
  `"50 Breast"→Breaststroke`, `"200 Fly"→Butterfly`, `"100 Butterfly"→Butterfly`,
  `"200 IM"→Individual Medley`, `"400 Medley"→Individual Medley`,
  `"50 Kick"→Other`.
- `groupRecordsByStroke`: a mixed, out-of-canonical-order input returns groups in
  Free→Back→Breast→Fly→IM→Other order; records inside a stroke keep input order;
  empty strokes absent.
- `buildStrokeSections`: `hasBands:false` → single `band:null` section;
  `hasBands:true` → bands ordered by first numeric, each with its stroke groups.

**`PublicRecordSearch` component test** (jsdom, `// @vitest-environment jsdom`):
render an individual list with two strokes and assert both stroke header labels
appear and a known swimmer renders. (Light smoke test — the grouping logic is
covered by the pure tests.)

## Verification

1. `npx vitest run lib/stroke-grouping.test.ts` green; full `npx vitest run`
   green; `npx tsc --noEmit` + `npm run lint` clean.
2. Manual: a regular club individual list shows stroke headers
   (Freestyle/Backstroke/…); a national/provincial list shows age-band headers
   with stroke sub-headers nested inside; a relay list is unchanged; searching
   collapses empty groups.

## Follow-ups (not this task)

- Optionally extend stroke grouping to relay lists.
- Optionally make the stroke set / labels configurable per list.
</content>
</invoke>
