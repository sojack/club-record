# "Last updated" Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a "Last updated <relative time>" indicator (with exact-datetime tooltip) reflecting content freshness on each record-list card and on the single-list editor page.

**Architecture:** Two new units — pure `lib/date-utils.ts` helpers and a presentational `components/LastUpdated.tsx` — consumed by two edited dashboard pages. "Content freshness" = `GREATEST(record_lists.updated_at, MAX(records.updated_at))`, computed client-side (Approach A): the cards grid runs one extra bounded `records` query; the single-list page computes from records already in memory.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Supabase JS client, built-in `Intl` (no date library added).

**Spec:** `docs/superpowers/specs/2026-05-15-last-updated-indicator-design.md`

---

## ⚠️ Pre-flight notes (read before executing)

1. **Hard DB dependency.** This feature needs `supabase/migrations/add_updated_at_tracking.sql` applied to Supabase. The code degrades gracefully without it (indicator simply renders nothing — see Task 4 verification), but the feature does nothing until that migration runs.
2. **No test framework.** This repo has none and the spec forbids adding one. "Verify" steps are `npm run build` (typecheck) + explicit manual checks. Do **not** scaffold Jest/Vitest.
3. **Commit policy — GATED.** This session has intentionally left all work uncommitted, and a decision in `TODO.md` (whether commits carry a `Co-Authored-By: Claude` trailer) is unresolved. **Do not run the `git commit` steps until the user explicitly authorizes committing and resolves the trailer decision.** The commit commands are written WITHOUT the trailer; add it only if the user decides to keep it. When authorized, commit in task order.
4. All commands run from `club-record/`.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/date-utils.ts` (new) | Pure, dependency-free: `maxIso`, `formatRelativeTime`, `formatExactDateTime`. Sibling of `lib/time-utils.ts`. |
| `components/LastUpdated.tsx` (new) | Presentational. Renders the muted "Last updated …" span with tooltip, or nothing. Single source of truth for the label. |
| `app/(dashboard)/dashboard/records/page.tsx` (modify) | Cards grid: extra records query, per-list freshness, render in card. |
| `app/(dashboard)/dashboard/records/[listId]/page.tsx` (modify) | Single list: compute freshness from loaded data, render in header. |

---

## Task 1: Pure date helpers

**Files:**
- Create: `lib/date-utils.ts`

- [ ] **Step 1: Create `lib/date-utils.ts` with the full implementation**

```ts
/**
 * Date/time helpers for the "last updated" indicator.
 * Pure, dependency-free (built-in Intl only) — mirrors lib/time-utils.ts.
 */

/** Latest of the given ISO timestamps, ignoring null/undefined. Null if none. */
export function maxIso(isos: (string | null | undefined)[]): string | null {
  let max: string | null = null;
  for (const iso of isos) {
    if (!iso) continue;
    if (max === null || new Date(iso).getTime() > new Date(max).getTime()) {
      max = iso;
    }
  }
  return max;
}

/** "just now" / "2 days ago" / "3 months ago" in the viewer's locale. */
export function formatRelativeTime(iso: string): string {
  const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(diffSec) < 45) return "just now";
  const mins = Math.round(diffSec / 60);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(diffSec / 3600);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(diffSec / 86400);
  if (Math.abs(days) < 7) return rtf.format(days, "day");
  const weeks = Math.round(diffSec / (86400 * 7));
  if (Math.abs(weeks) < 5) return rtf.format(weeks, "week");
  const months = Math.round(diffSec / (86400 * 30));
  if (Math.abs(months) < 12) return rtf.format(months, "month");
  const years = Math.round(diffSec / (86400 * 365));
  return rtf.format(years, "year");
}

/** Localized absolute date/time, e.g. "May 15, 2026, 3:42 PM". */
export function formatExactDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: `✓ Compiled successfully`, exit 0, no type errors. (The file is unused so far; this only confirms it compiles under strict mode.)

- [ ] **Step 3: Commit (GATED — see Pre-flight note 3)**

```bash
git add lib/date-utils.ts
git commit -m "feat: add pure date helpers for last-updated indicator"
```

---

## Task 2: `LastUpdated` presentational component

**Files:**
- Create: `components/LastUpdated.tsx`

- [ ] **Step 1: Create `components/LastUpdated.tsx`**

No `"use client"` directive needed: it has no hooks/browser-only APIs and renders fine inside the existing client pages. Styling matches the existing muted metadata text on the cards.

```tsx
import { formatRelativeTime, formatExactDateTime } from "@/lib/date-utils";

export default function LastUpdated({ iso }: { iso: string | null }) {
  if (!iso) return null;
  return (
    <span
      className="text-sm text-gray-500 dark:text-gray-400"
      title={formatExactDateTime(iso)}
    >
      Last updated {formatRelativeTime(iso)}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: `✓ Compiled successfully`, exit 0, no type errors.

- [ ] **Step 3: Commit (GATED — see Pre-flight note 3)**

```bash
git add components/LastUpdated.tsx
git commit -m "feat: add LastUpdated indicator component"
```

---

## Task 3: Render on the cards grid (`/dashboard/records`)

**Files:**
- Modify: `app/(dashboard)/dashboard/records/page.tsx`

- [ ] **Step 1: Add the two imports**

Find this line:

```tsx
import type { RecordList, SwimRecord } from "@/types/database";
```

Add immediately after it:

```tsx
import { maxIso } from "@/lib/date-utils";
import LastUpdated from "@/components/LastUpdated";
```

- [ ] **Step 2: Add a shared row type and use it in state**

Find:

```tsx
export default function RecordListsPage() {
  const { selectedClub, isLoading: clubLoading, canEdit } = useClub();
  const [recordLists, setRecordLists] = useState<(RecordList & { records: { count: number }[] })[]>([]);
```

Replace with (introduces `RecordListRow` so the state, cast, and render all share one type):

```tsx
type RecordListRow = RecordList & {
  records: { count: number }[];
  lastUpdated: string | null;
};

export default function RecordListsPage() {
  const { selectedClub, isLoading: clubLoading, canEdit } = useClub();
  const [recordLists, setRecordLists] = useState<RecordListRow[]>([]);
```

- [ ] **Step 3: Compute per-list freshness in `loadRecordLists`**

Find the entire current function:

```tsx
  const loadRecordLists = async () => {
    if (!selectedClub) return;

    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("record_lists")
      .select("*, records(count)")
      .eq("club_id", selectedClub.id)
      .order("title", { ascending: true });

    setRecordLists((data as (RecordList & { records: { count: number }[] })[]) || []);
    setLoading(false);
    setSelectedIds([]);
  };
```

Replace with:

```tsx
  const loadRecordLists = async () => {
    if (!selectedClub) return;

    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("record_lists")
      .select("*, records(count)")
      .eq("club_id", selectedClub.id)
      .order("title", { ascending: true });

    const lists = (data as (RecordList & { records: { count: number }[] })[]) || [];

    // Content-freshness: latest of each list's own updated_at and the newest
    // updated_at among its records. One bounded extra query over the same
    // list IDs the CSV export already fetches in full — strictly lighter.
    // If the column/migration is absent this query errors and recRows is
    // undefined; we degrade to list.updated_at (also possibly absent → null).
    const listIds = lists.map((l) => l.id);
    const recordMax = new Map<string, string>();
    if (listIds.length > 0) {
      const { data: recRows } = await supabase
        .from("records")
        .select("record_list_id, updated_at")
        .in("record_list_id", listIds);
      for (const row of (recRows as
        | { record_list_id: string; updated_at: string }[]
        | null) || []) {
        const prev = recordMax.get(row.record_list_id);
        if (
          !prev ||
          new Date(row.updated_at).getTime() > new Date(prev).getTime()
        ) {
          recordMax.set(row.record_list_id, row.updated_at);
        }
      }
    }

    const rows: RecordListRow[] = lists.map((l) => ({
      ...l,
      lastUpdated: maxIso([l.updated_at, recordMax.get(l.id)]),
    }));

    setRecordLists(rows);
    setLoading(false);
    setSelectedIds([]);
  };
```

- [ ] **Step 4: Render the indicator in each card**

Find this block (inside the `recordLists.map` card `<Link>`):

```tsx
                  <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                    /{selectedClub.slug}/{list.slug}
                  </div>
                </Link>
```

Replace with:

```tsx
                  <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                    /{selectedClub.slug}/{list.slug}
                  </div>
                  <div className="mt-2">
                    <LastUpdated iso={list.lastUpdated} />
                  </div>
                </Link>
```

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: `✓ Compiled successfully`, exit 0, no type errors.

- [ ] **Step 6: Manual verification**

Run `npm run dev`, open `/dashboard/records` for a club whose DB has the `add_updated_at_tracking.sql` migration applied.
Expected: each list card shows "Last updated <relative>" under the public-path line; hovering shows the exact local date/time tooltip. A list with zero records still shows a value (its own `updated_at`). Without the migration the line is simply absent and the page is otherwise normal.

- [ ] **Step 7: Commit (GATED — see Pre-flight note 3)**

```bash
git add "app/(dashboard)/dashboard/records/page.tsx"
git commit -m "feat: show last-updated on record-list cards"
```

---

## Task 4: Render on the single-list page (`/dashboard/records/[listId]`)

**Files:**
- Modify: `app/(dashboard)/dashboard/records/[listId]/page.tsx`

This page already loads the list row and all its records via `loadData()` (both with `select("*")`, so `updated_at` is included post-migration), and re-runs `loadData()` after every save — so the indicator refreshes automatically with no extra work.

- [ ] **Step 1: Add the two imports**

Find:

```tsx
import RecordTable from "@/components/RecordTable";
```

Add immediately after it:

```tsx
import LastUpdated from "@/components/LastUpdated";
import { maxIso } from "@/lib/date-utils";
```

- [ ] **Step 2: Render the indicator in the header**

Find this block (the list's metadata badges in the header):

```tsx
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  /{selectedClub?.slug}/{recordList.slug}
                </span>
              </div>
            </div>
```

Replace with (adds a new line under the badges, still inside the header's left-column `<div>`; `recordList` is guaranteed non-null here, `records` is the loaded `SwimRecord[]` state):

```tsx
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  /{selectedClub?.slug}/{recordList.slug}
                </span>
              </div>
              <div className="mt-2">
                <LastUpdated
                  iso={maxIso([
                    recordList.updated_at,
                    ...records.map((r) => r.updated_at),
                  ])}
                />
              </div>
            </div>
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: `✓ Compiled successfully`, exit 0, no type errors.

- [ ] **Step 4: Manual verification (including the refresh-after-save behavior)**

Run `npm run dev`, open a list at `/dashboard/records/<id>` (DB migrated).
Expected:
- Header shows "Last updated <relative>" under the course/gender/path badges; tooltip shows exact local date/time.
- Edit a record's time and save. After the page reloads its data, the indicator updates to reflect the just-made edit (e.g. "just now" / "Last updated <today>").
- Without the migration applied: indicator is absent, page otherwise works (graceful degradation).

- [ ] **Step 5: Commit (GATED — see Pre-flight note 3)**

```bash
git add "app/(dashboard)/dashboard/records/[listId]/page.tsx"
git commit -m "feat: show last-updated in single-list header"
```

---

## Final verification

- [ ] `npm run build` passes (exit 0, `✓ Compiled successfully`, zero type errors).
- [ ] Both placements render with correct relative text and exact-time tooltip (migration applied).
- [ ] Single-list indicator updates after a save.
- [ ] Empty list falls back to its own `updated_at`.
- [ ] No new dependency added; no test framework added; `lib/date-utils.ts` is pure.

---

## Self-review (completed by plan author)

**Spec coverage:**
- Placement: cards grid (Task 3) + single-list header (Task 4); main `/dashboard` untouched. ✓
- Content-freshness `GREATEST(list.updated_at, MAX(records.updated_at))`: `maxIso` in Tasks 3 & 4. ✓
- Relative text + exact tooltip: `formatRelativeTime` / `formatExactDateTime` (Task 1), wired in `LastUpdated` (Task 2). ✓
- Graceful degradation / empty list / hard dependency: Pre-flight note 1, Task 3 Step 3 comment, Tasks 3 & 4 manual-verification steps. ✓
- No test framework, verification via build + manual: Pre-flight note 2, every Task. ✓
- Scope guard (no RPC, no main dashboard, no caching/sort): nothing in the plan adds these. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/vague steps. Every code step shows complete code; every verify step shows the command and expected output. ✓

**Type consistency:** `RecordListRow` defined once (Task 3 Step 2) and used in state, mapping, and render. `maxIso`/`formatRelativeTime`/`formatExactDateTime` signatures defined in Task 1 match calls in Tasks 2–4. `LastUpdated` prop `{ iso: string | null }` (Task 2) matches `maxIso` return (`string | null`) passed in Tasks 3 & 4. ✓
