# Stroke Section Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group records on the public club/record display under stroke section headers (Freestyle, Backstroke, Breaststroke, Butterfly, Individual Medley) in canonical order, nested inside the existing age-band headers for national/provincial lists.

**Architecture:** A new pure, unit-tested helper `lib/stroke-grouping.ts` detects a record's stroke from its `event_name` and builds a `band → stroke → records` section structure. `PublicRecordSearch.tsx` consumes it to render stroke header rows (desktop table) and header blocks (mobile cards). No DB / migration / importer / editor changes. Relay lists are unchanged.

**Tech Stack:** TypeScript, React 19, Vitest 4 (node env for pure tests, jsdom env for the component test), React Testing Library.

**Reference spec:** `docs/superpowers/specs/2026-06-05-stroke-section-headers-design.md`

---

## File Structure

- **Create** `lib/stroke-grouping.ts` — pure helper: `detectStroke`, `STROKE_ORDER`, `groupRecordsByStroke`, `ageBandKey`, `buildStrokeSections`, and the `StrokeInfo` / `StrokeGroup` / `StrokeSection` types. One responsibility: turn a flat record array into ordered stroke (and optionally age-band) sections.
- **Create** `lib/stroke-grouping.test.ts` — pure unit tests (node env).
- **Modify** `app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx` — replace the inline `grouped`/`ageBandKey`/`groupedBands` logic with the helper, and render stroke headers in both the desktop `<tbody>` and the mobile card list.
- **Create** `app/[clubSlug]/[recordSlug]/PublicRecordSearch.test.tsx` — jsdom smoke test that stroke headers render.

Notes for the implementer:
- Vitest collects `lib/**`, `app/**`, `components/**` `*.test.{ts,tsx}` (see `vitest.config.ts`). The `@/` alias maps to the `club-record/` root.
- The default test environment is `node`; component tests opt into jsdom with a `// @vitest-environment jsdom` pragma on line 1 (see `components/RecordTable.test.tsx`).
- `SwimRecord` is defined in `types/database.ts`. Its full field list is reproduced in the `rec()` helpers below — use them verbatim.

---

### Task 1: Stroke detection (`detectStroke`)

**Files:**
- Create: `club-record/lib/stroke-grouping.ts`
- Test: `club-record/lib/stroke-grouping.test.ts`

- [ ] **Step 1: Write the failing test**

Create `club-record/lib/stroke-grouping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectStroke } from "./stroke-grouping";

describe("detectStroke", () => {
  it("maps each stroke suffix to its full label and canonical order", () => {
    expect(detectStroke("50 Free")).toMatchObject({ label: "Freestyle", order: 1 });
    expect(detectStroke("100 Back")).toMatchObject({ label: "Backstroke", order: 2 });
    expect(detectStroke("50 Breast")).toMatchObject({ label: "Breaststroke", order: 3 });
    expect(detectStroke("200 Fly")).toMatchObject({ label: "Butterfly", order: 4 });
    expect(detectStroke("100 Butterfly")).toMatchObject({ label: "Butterfly", order: 4 });
    expect(detectStroke("200 IM")).toMatchObject({ label: "Individual Medley", order: 5 });
    expect(detectStroke("400 Medley")).toMatchObject({ label: "Individual Medley", order: 5 });
  });

  it("falls back to Other for unrecognized events", () => {
    expect(detectStroke("50 Kick")).toMatchObject({ key: "other", label: "Other", order: 6 });
    expect(detectStroke("")).toMatchObject({ key: "other", order: 6 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/stroke-grouping.test.ts`
Expected: FAIL — `Failed to resolve import "./stroke-grouping"` / `detectStroke is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `club-record/lib/stroke-grouping.ts`:

```ts
import type { SwimRecord } from "@/types/database";

export interface StrokeInfo {
  key: string;
  label: string;
  order: number;
}

export interface StrokeGroup {
  stroke: StrokeInfo;
  records: SwimRecord[];
}

export interface StrokeSection {
  band: string | null;
  strokeGroups: StrokeGroup[];
}

// Canonical swim order: Free -> Back -> Breast -> Fly -> IM.
export const STROKE_ORDER: StrokeInfo[] = [
  { key: "free", label: "Freestyle", order: 1 },
  { key: "back", label: "Backstroke", order: 2 },
  { key: "breast", label: "Breaststroke", order: 3 },
  { key: "fly", label: "Butterfly", order: 4 },
  { key: "im", label: "Individual Medley", order: 5 },
];

const STROKE_OTHER: StrokeInfo = { key: "other", label: "Other", order: 6 };

// Order of checks matters so e.g. "Backstroke" never matches "free".
export function detectStroke(eventName: string): StrokeInfo {
  const s = (eventName || "").toLowerCase();
  if (s.includes("back")) return STROKE_ORDER[1];
  if (s.includes("breast")) return STROKE_ORDER[2];
  if (s.includes("fly") || s.includes("butterfly")) return STROKE_ORDER[3];
  if (s.includes("medley") || /\bim\b/.test(s)) return STROKE_ORDER[4];
  if (s.includes("free")) return STROKE_ORDER[0];
  return STROKE_OTHER;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/stroke-grouping.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/stroke-grouping.ts lib/stroke-grouping.test.ts
git commit -m "feat(stroke-grouping): detect stroke from event name"
```

---

### Task 2: Group records by stroke (`groupRecordsByStroke`)

**Files:**
- Modify: `club-record/lib/stroke-grouping.ts`
- Test: `club-record/lib/stroke-grouping.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `club-record/lib/stroke-grouping.test.ts`. First add a `rec` helper and import `groupRecordsByStroke`. Update the existing import line to:

```ts
import { detectStroke, groupRecordsByStroke } from "./stroke-grouping";
import type { SwimRecord } from "@/types/database";
```

Then append:

```ts
function rec(overrides: Partial<SwimRecord> = {}): SwimRecord {
  return {
    id: "r1",
    record_list_id: "list-1",
    event_name: "50 Free",
    time_ms: 24560,
    swimmer_name: "John Smith",
    swimmer_name_2: null,
    swimmer_name_3: null,
    swimmer_name_4: null,
    age_group: null,
    record_club: null,
    province: null,
    record_date: null,
    location: null,
    sort_order: 0,
    is_national: false,
    is_current_national: false,
    is_provincial: false,
    is_current_provincial: false,
    is_split: false,
    is_relay_split: false,
    is_new: false,
    is_world_record: false,
    superseded_by: null,
    is_current: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("groupRecordsByStroke", () => {
  it("orders strokes canonically and keeps record order within a stroke", () => {
    const records = [
      rec({ id: "back100", event_name: "100 Back" }),
      rec({ id: "free50", event_name: "50 Free" }),
      rec({ id: "free100", event_name: "100 Free" }),
      rec({ id: "im200", event_name: "200 IM" }),
    ];
    const groups = groupRecordsByStroke(records);
    expect(groups.map((g) => g.stroke.label)).toEqual([
      "Freestyle",
      "Backstroke",
      "Individual Medley",
    ]);
    expect(groups[0].records.map((r) => r.id)).toEqual(["free50", "free100"]);
  });

  it("omits strokes with no records", () => {
    const groups = groupRecordsByStroke([rec({ event_name: "50 Fly" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].stroke.label).toBe("Butterfly");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/stroke-grouping.test.ts`
Expected: FAIL — `groupRecordsByStroke is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `club-record/lib/stroke-grouping.ts`:

```ts
export function groupRecordsByStroke(records: SwimRecord[]): StrokeGroup[] {
  const byKey = new Map<string, StrokeGroup>();
  for (const record of records) {
    const stroke = detectStroke(record.event_name);
    const existing = byKey.get(stroke.key);
    if (existing) {
      existing.records.push(record);
    } else {
      byKey.set(stroke.key, { stroke, records: [record] });
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => a.stroke.order - b.stroke.order
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/stroke-grouping.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/stroke-grouping.ts lib/stroke-grouping.test.ts
git commit -m "feat(stroke-grouping): group records by stroke in canonical order"
```

---

### Task 3: Build band/stroke sections (`buildStrokeSections`)

**Files:**
- Modify: `club-record/lib/stroke-grouping.ts`
- Test: `club-record/lib/stroke-grouping.test.ts`

- [ ] **Step 1: Write the failing test**

Update the import line in `club-record/lib/stroke-grouping.test.ts` to:

```ts
import {
  detectStroke,
  groupRecordsByStroke,
  buildStrokeSections,
} from "./stroke-grouping";
```

Append (the `rec` helper from Task 2 is reused):

```ts
describe("buildStrokeSections", () => {
  it("returns a single null-band section when hasBands is false", () => {
    const sections = buildStrokeSections(
      [rec({ event_name: "50 Free" }), rec({ event_name: "100 Back" })],
      false
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].band).toBeNull();
    expect(sections[0].strokeGroups.map((g) => g.stroke.label)).toEqual([
      "Freestyle",
      "Backstroke",
    ]);
  });

  it("groups by age band (numeric ascending) then stroke when hasBands is true", () => {
    const sections = buildStrokeSections(
      [
        rec({ id: "a", event_name: "50 Free", age_group: "35-39" }),
        rec({ id: "b", event_name: "50 Free", age_group: "18-24" }),
        rec({ id: "c", event_name: "100 Back", age_group: "18-24" }),
      ],
      true
    );
    expect(sections.map((s) => s.band)).toEqual(["18-24", "35-39"]);
    expect(sections[0].strokeGroups.map((g) => g.stroke.label)).toEqual([
      "Freestyle",
      "Backstroke",
    ]);
    expect(sections[1].strokeGroups).toHaveLength(1);
  });

  it("places blank age bands last", () => {
    const sections = buildStrokeSections(
      [
        rec({ id: "blank", event_name: "50 Free", age_group: null }),
        rec({ id: "young", event_name: "50 Free", age_group: "18-24" }),
      ],
      true
    );
    expect(sections.map((s) => s.band)).toEqual(["18-24", "—"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/stroke-grouping.test.ts`
Expected: FAIL — `buildStrokeSections is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `club-record/lib/stroke-grouping.ts`:

```ts
// First numeric value in a band label drives ascending order; blank/none last.
export function ageBandKey(band: string | null): number {
  if (!band) return Number.MAX_SAFE_INTEGER;
  const m = band.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
}

export function buildStrokeSections(
  records: SwimRecord[],
  hasBands: boolean
): StrokeSection[] {
  if (!hasBands) {
    return [{ band: null, strokeGroups: groupRecordsByStroke(records) }];
  }
  const byBand = new Map<string, SwimRecord[]>();
  for (const r of records) {
    const band = (r.age_group && r.age_group.trim()) || "—";
    const arr = byBand.get(band) || [];
    arr.push(r);
    byBand.set(band, arr);
  }
  return Array.from(byBand.entries())
    .sort(
      (a, b) =>
        ageBandKey(a[0] === "—" ? null : a[0]) -
        ageBandKey(b[0] === "—" ? null : b[0])
    )
    .map(([band, recs]) => ({ band, strokeGroups: groupRecordsByStroke(recs) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/stroke-grouping.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/stroke-grouping.ts lib/stroke-grouping.test.ts
git commit -m "feat(stroke-grouping): build age-band then stroke sections"
```

---

### Task 4: Render stroke headers in `PublicRecordSearch`

**Files:**
- Modify: `club-record/app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx`

This task wires the helper into the component. There is no new automated test here (rendering is covered by Task 5); verify with the build/lint/typecheck commands in Step 4.

- [ ] **Step 1: Add the import**

At the top of `PublicRecordSearch.tsx`, below the existing `RecordFlags` import (line 6), add:

```ts
import { buildStrokeSections } from "@/lib/stroke-grouping";
```

- [ ] **Step 2: Replace the grouping computation**

Find this block (currently lines 102-128):

```ts
  const grouped =
    recordType === "individual" &&
    currentRecords.some((r) => r.age_group && r.age_group.trim() !== "");

  const ageBandKey = (band: string | null): number => {
    if (!band) return Number.MAX_SAFE_INTEGER;
    const m = band.match(/\d+/);
    return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
  };

  const groupedBands: Array<{ band: string; records: SwimRecord[] }> = (() => {
    if (!grouped) return [];
    const byBand = new Map<string, SwimRecord[]>();
    for (const r of filteredRecords) {
      const b = (r.age_group && r.age_group.trim()) || "—";
      const arr = byBand.get(b) || [];
      arr.push(r);
      byBand.set(b, arr);
    }
    return Array.from(byBand.entries())
      .sort(
        (a, b) =>
          ageBandKey(a[0] === "—" ? null : a[0]) -
          ageBandKey(b[0] === "—" ? null : b[0])
      )
      .map(([band, recs]) => ({ band, records: recs }));
  })();
```

Replace it with:

```ts
  // Individual lists group under stroke headers; relays keep the flat layout.
  const strokeGrouped = recordType === "individual";
  // National/provincial individual lists also have age-band headers.
  const hasBands =
    strokeGrouped &&
    currentRecords.some((r) => r.age_group && r.age_group.trim() !== "");
  const sections = buildStrokeSections(filteredRecords, hasBands);
```

(`desktopColSpan` on the next line is unchanged. The `SwimRecord` import is still used elsewhere in the file, so leave it.)

- [ ] **Step 3: Replace the desktop tbody body and the mobile list**

**Desktop:** find the `<tbody>` content (currently lines 373-401):

```tsx
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {grouped
                ? groupedBands.map((g) => (
                    <React.Fragment key={`band-${g.band}`}>
                      <tr className="bg-gray-800 dark:bg-gray-900">
                        <td
                          colSpan={desktopColSpan}
                          className="px-4 py-3 text-lg font-bold tracking-wide text-white dark:text-gray-100"
                        >
                          {g.band}
                        </td>
                      </tr>
                      {g.records.map((record) => renderDesktopRecord(record))}
                    </React.Fragment>
                  ))
                : filteredRecords.map((record) => renderDesktopRecord(record))}
              {filteredRecords.length === 0 && (
                <tr>
                  <td
                    colSpan={desktopColSpan}
                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    {search
                      ? "No records match your search."
                      : "No records available."}
                  </td>
                </tr>
              )}
            </tbody>
```

Replace with:

```tsx
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {strokeGrouped
                ? sections.map((section) => (
                    <React.Fragment
                      key={`section-${section.band ?? "all"}`}
                    >
                      {section.band !== null && (
                        <tr className="bg-gray-800 dark:bg-gray-900">
                          <td
                            colSpan={desktopColSpan}
                            className="px-4 py-3 text-lg font-bold tracking-wide text-white dark:text-gray-100"
                          >
                            {section.band}
                          </td>
                        </tr>
                      )}
                      {section.strokeGroups.map((g) => (
                        <React.Fragment
                          key={`stroke-${section.band ?? "all"}-${g.stroke.key}`}
                        >
                          <tr className="bg-gray-100 dark:bg-gray-700/50">
                            <td
                              colSpan={desktopColSpan}
                              className={`${
                                section.band !== null ? "pl-8" : "pl-4"
                              } pr-4 py-2 font-semibold text-gray-700 dark:text-gray-200`}
                            >
                              {g.stroke.label}
                            </td>
                          </tr>
                          {g.records.map((record) =>
                            renderDesktopRecord(record)
                          )}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))
                : filteredRecords.map((record) => renderDesktopRecord(record))}
              {filteredRecords.length === 0 && (
                <tr>
                  <td
                    colSpan={desktopColSpan}
                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    {search
                      ? "No records match your search."
                      : "No records available."}
                  </td>
                </tr>
              )}
            </tbody>
```

**Mobile:** find the mobile card list (currently lines 407-418):

```tsx
      <div className="mt-6 space-y-3 md:hidden">
        {grouped
          ? groupedBands.map((g) => (
              <div key={`mband-${g.band}`} className="space-y-3">
                <div className="rounded-md bg-gray-800 px-3 py-2 text-lg font-bold tracking-wide text-white dark:bg-gray-900 dark:text-gray-100">
                  {g.band}
                </div>
                {g.records.map((record) => renderMobileCard(record))}
              </div>
            ))
          : filteredRecords.map((record) => renderMobileCard(record))}
      </div>
```

Replace with:

```tsx
      <div className="mt-6 space-y-3 md:hidden">
        {strokeGrouped
          ? sections.map((section) => (
              <div
                key={`msection-${section.band ?? "all"}`}
                className="space-y-3"
              >
                {section.band !== null && (
                  <div className="rounded-md bg-gray-800 px-3 py-2 text-lg font-bold tracking-wide text-white dark:bg-gray-900 dark:text-gray-100">
                    {section.band}
                  </div>
                )}
                {section.strokeGroups.map((g) => (
                  <div
                    key={`mstroke-${section.band ?? "all"}-${g.stroke.key}`}
                    className="space-y-3"
                  >
                    <div
                      className={`rounded-md bg-gray-100 px-3 py-2 font-semibold text-gray-700 dark:bg-gray-700/50 dark:text-gray-200 ${
                        section.band !== null ? "ml-4" : ""
                      }`}
                    >
                      {g.stroke.label}
                    </div>
                    {g.records.map((record) => renderMobileCard(record))}
                  </div>
                ))}
              </div>
            ))
          : filteredRecords.map((record) => renderMobileCard(record))}
      </div>
```

- [ ] **Step 4: Verify build, types, and lint**

Run: `npx tsc --noEmit`
Expected: no errors (in particular, no "unused variable" for a removed `grouped`/`groupedBands`/`ageBandKey`).

Run: `npm run lint`
Expected: clean (lint runs with `--max-warnings 0`).

Run: `npx vitest run`
Expected: the full existing suite stays green.

- [ ] **Step 5: Commit**

```bash
git add app/\[clubSlug\]/\[recordSlug\]/PublicRecordSearch.tsx
git commit -m "feat(public): render stroke section headers on individual lists"
```

---

### Task 5: Component smoke test for stroke headers

**Files:**
- Create: `club-record/app/[clubSlug]/[recordSlug]/PublicRecordSearch.test.tsx`

- [ ] **Step 1: Write the test**

Create `club-record/app/[clubSlug]/[recordSlug]/PublicRecordSearch.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SwimRecord } from "@/types/database";
import PublicRecordSearch from "./PublicRecordSearch";

function rec(overrides: Partial<SwimRecord> = {}): SwimRecord {
  return {
    id: "r1",
    record_list_id: "list-1",
    event_name: "50 Free",
    time_ms: 24560,
    swimmer_name: "John Smith",
    swimmer_name_2: null,
    swimmer_name_3: null,
    swimmer_name_4: null,
    age_group: null,
    record_club: null,
    province: null,
    record_date: null,
    location: null,
    sort_order: 0,
    is_national: false,
    is_current_national: false,
    is_provincial: false,
    is_current_provincial: false,
    is_split: false,
    is_relay_split: false,
    is_new: false,
    is_world_record: false,
    superseded_by: null,
    is_current: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("PublicRecordSearch stroke headers", () => {
  it("renders canonical stroke headers for an individual list", () => {
    render(
      <PublicRecordSearch
        records={[
          rec({ id: "a", event_name: "100 Back", swimmer_name: "Ann Back" }),
          rec({ id: "b", event_name: "50 Free", swimmer_name: "Fred Free" }),
        ]}
        recordType="individual"
        scope="club"
      />
    );
    // Headers render in both the desktop table and the mobile card list,
    // so each label appears at least once.
    expect(screen.getAllByText("Freestyle").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Backstroke").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fred Free").length).toBeGreaterThan(0);
  });

  it("does not render stroke headers for a relay list", () => {
    render(
      <PublicRecordSearch
        records={[rec({ id: "rel", event_name: "4x50 Free", age_group: "72-99" })]}
        recordType="relay"
        scope="club"
      />
    );
    expect(screen.queryByText("Freestyle")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run app/\[clubSlug\]/\[recordSlug\]/PublicRecordSearch.test.tsx`
Expected: PASS (2 tests). (The component already renders stroke headers after Task 4, so this confirms behavior end-to-end.)

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add app/\[clubSlug\]/\[recordSlug\]/PublicRecordSearch.test.tsx
git commit -m "test(public): stroke headers render for individual, absent for relay"
```

---

## Self-Review

**Spec coverage:**
- D1 all individual lists → `strokeGrouped = recordType === "individual"` (Task 4). ✔
- D2 canonical order → `STROKE_ORDER` + sort by `order` (Tasks 1-2). ✔
- D3 full labels → labels in `STROKE_ORDER` (Task 1). ✔
- D4 band→stroke nesting → `buildStrokeSections(records, hasBands)` + indented sub-headers (Tasks 3-4). ✔
- D5 unknown → "Other" trailing group (Task 1). ✔
- D6 relays unchanged → flat branch kept in Task 4; Task 5 asserts no headers. ✔
- Search-then-group (empty groups disappear) → `sections` built from `filteredRecords` (Task 4). ✔
- Tests: pure helper (Tasks 1-3) + component smoke (Task 5). ✔

**Placeholder scan:** none — every code step has complete code.

**Type consistency:** `StrokeInfo`/`StrokeGroup`/`StrokeSection`, `detectStroke`, `groupRecordsByStroke`, `ageBandKey`, `buildStrokeSections`, and field names (`stroke.key`, `stroke.label`, `stroke.order`, `section.band`, `section.strokeGroups`) are used identically across the helper, the component, and the tests.
</content>
