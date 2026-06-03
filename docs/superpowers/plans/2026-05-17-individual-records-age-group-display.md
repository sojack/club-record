# Individual Records by Age Band — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the Canadian Masters individual records into 4 national/provincial lists (Men/Women × LC/SC) whose public view groups records under age-band section dividers, reusing the relay-era `age_group`/`record_club`/`province` columns and `scope`.

**Architecture:** Approach A — decouple the relay `relay` boolean into its real axes (swimmer count vs scope vs age-group). The CSV parser gains an individual-national/provincial branch; the editor/public/parser key age-group + club/province off `scope='national_provincial'` instead of `relay`; the public page adds a grouped-by-age-band divider rendering for individual lists that carry age groups. No schema change, no `types/database.ts` change, no migration.

**Tech Stack:** Next.js 16 / React 19 / TS (strict), Supabase, Tailwind, PapaParse. Excel→CSV prep = standalone stdlib Python 3.

---

## Verification & process (read first)

Same regime as the relay plan: **no JS test framework** — verify TS with `npx tsc --noEmit`, `npm run lint` (only the known 14-item `TODO.md` backlog is acceptable; **zero new**), `npm run build`, plus a manual checklist. The **Python prep script (Task E) is genuinely TDD** with stdlib `unittest`.

Git: the app repo root is `/Users/jackso/code/ClubRecordProject/club-record` (branch `main`). Per the user's standing decision this session, commit each task there with **repo-relative paths**, message exactly as given, **no `Co-Authored-By`/AI trailer**, **never `git push`, never branch/amend/rebase/reset**. Use `git -c commit.gpgsign=false commit -m "<msg>"`. **Task E lives at the project root which is NOT a git repo — no git for Task E.** All app commands run from `club-record/`.

Each task here builds clean independently (no deferred-failure ordering needed).

---

## File Structure

**Modify (app, in `club-record/`):**
- `lib/csv-parser.ts` — add individual-national/provincial parse branch; populate `age_group`/`record_club`/`province` by `scope` not `relay`.
- `app/(dashboard)/dashboard/records/bulk-upload/page.tsx` — fix `parseFilename` scope detection + record_lists insert scope (real gap).
- `app/admin/[clubId]/upload/page.tsx` — same fix (identical code).
- `app/api/admin/upload/route.ts` — same insert-scope fix.
- `components/RecordTable.tsx` — broaden `isNatProv`; add `showAgeGroup`; age-group datalist = union with the list's own record bands. Single swimmer stays for non-relay.
- `app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx` — broaden `isNatProv`; extract per-record row/card renderers; add grouped-by-age-band divider rendering for individual lists with age groups.
- `CLAUDE.md` (project root, **outside git** — edited, not committed) — one note.

**Rework (project root, NOT git):**
- `SNC/individual-prep/xlsx_to_individual_csv.py` + `test_xlsx_to_individual_csv.py` — emit 4 files with Club/Province + single Swimmer + AgeGroup; delete the 66 old CSVs.

**Out of scope:** types/database.ts (unchanged), migrations (none), relay display/editor (unchanged), club-scope individual lists (unchanged), embed widget, the list-creation form (`records/new/page.tsx` — these lists arrive via bulk upload, not the form).

---

## Task A: CSV parser — individual national/provincial branch

**Files:** Modify `lib/csv-parser.ts`

- [ ] **Step 1: Replace the relay-gated block (current lines 185–233)**

The current code is the `if (isRelay) { … }` block, then `const isNatProv = isRelay && relayOptions.scope === "national_provincial";`, then the `records.push({ … })` with `swimmer_name_2: isRelay ? … : null`, `age_group: isRelay ? … : null`, `record_club: isNatProv ? … : null`, `province: isNatProv ? … : null`.

Replace **from** `    if (isRelay) {` **through** the line `      province: isNatProv ? province!.trim() : null,` (i.e. lines 185–233 inclusive) with exactly:

```ts
    const isNatProv = relayOptions.scope === "national_provincial";
    const indivNatProv = !isRelay && isNatProv;

    if (isRelay) {
      if (!name2?.trim() || !name3?.trim() || !name4?.trim()) {
        errors.push(
          `Row ${index + 2}: Relay records require all 4 swimmer names (Name1-Name4)`
        );
        return;
      }
      if (!ageGroup?.trim()) {
        errors.push(`Row ${index + 2}: Relay records require an Age Group`);
        return;
      }
      if (
        relayOptions.allowedAgeGroups &&
        relayOptions.allowedAgeGroups.length > 0 &&
        !relayOptions.allowedAgeGroups.includes(ageGroup.trim())
      ) {
        errors.push(
          `Row ${index + 2}: Age Group "${ageGroup.trim()}" is not a standard age group`
        );
        return;
      }
      if (isNatProv) {
        if (!recordClub?.trim()) {
          errors.push(
            `Row ${index + 2}: National/Provincial relay records require a Club`
          );
          return;
        }
        if (!province?.trim()) {
          errors.push(
            `Row ${index + 2}: National/Provincial relay records require a Province`
          );
          return;
        }
      }
    } else if (indivNatProv) {
      if (!ageGroup?.trim()) {
        errors.push(
          `Row ${index + 2}: National/Provincial records require an Age Group`
        );
        return;
      }
      if (!recordClub?.trim()) {
        errors.push(
          `Row ${index + 2}: National/Provincial records require a Club`
        );
        return;
      }
      if (!province?.trim()) {
        errors.push(
          `Row ${index + 2}: National/Provincial records require a Province`
        );
        return;
      }
    }

    const carryAge = isRelay || indivNatProv;

    records.push({
      event_name: event.trim(),
      time_ms,
      swimmer_name: swimmer.trim(),
      swimmer_name_2: isRelay ? name2!.trim() : null,
      swimmer_name_3: isRelay ? name3!.trim() : null,
      swimmer_name_4: isRelay ? name4!.trim() : null,
      age_group: carryAge ? ageGroup!.trim() : null,
      record_club: isNatProv ? recordClub!.trim() : null,
      province: isNatProv ? province!.trim() : null,
```

(The lines that follow — `record_date: normalizeDate(date),` … through the closing `});` and the function's `return { records, errors };` — are unchanged. Do NOT duplicate them.)

Rationale: `isNatProv` is now `scope==='national_provincial'` regardless of relay (relay-natprov still required club/prov inside the relay block; relay-club still yields `isNatProv=false` → club/prov null, unchanged). `indivNatProv` is the new path: 1 swimmer (already validated by the earlier `!event||!time||!swimmer` guard) + required age_group/club/province. `carryAge` populates `age_group` for relay or individual-natprov. Plain individual (scope club) → `indivNatProv=false`, `isNatProv=false`, `carryAge=false` → all relay columns null (existing behavior preserved).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no output). The `!`-assertions on `ageGroup!`/`recordClub!`/`province!` are sound because each is guarded by a returning check before the push when `carryAge`/`isNatProv` are true (relay block or indivNatProv block).

- [ ] **Step 3: Lint this file**

Run: `npx eslint lib/csv-parser.ts`
Expected: 0 issues (this file is not in the backlog).

- [ ] **Step 4: Commit**

```bash
git add lib/csv-parser.ts
git -c commit.gpgsign=false commit -m "csv-parser: individual national/provincial parse branch (age/club/province by scope)"
```

---

## Task B: Fix upload scope gap (parseFilename + insert scope)

**Files:** Modify `app/(dashboard)/dashboard/records/bulk-upload/page.tsx`, `app/admin/[clubId]/upload/page.tsx`, `app/api/admin/upload/route.ts`

The relay-era code hard-gates national/provincial scope to relay files, so individual `*_National*` files would wrongly import as club scope. Fix all three sites.

- [ ] **Step 1: bulk-upload `parseFilename` scope**

In `app/(dashboard)/dashboard/records/bulk-upload/page.tsx`, the current `scope` derivation is:
```ts
  const scope: "club" | "national_provincial" =
    recordType === "relay" &&
    (lower.includes("national") || lower.includes("provincial") || lower.includes("canadian"))
      ? "national_provincial"
      : "club";
```
Replace it with (drop the `recordType === "relay" &&` guard):
```ts
  const scope: "club" | "national_provincial" =
    lower.includes("national") || lower.includes("provincial") || lower.includes("canadian")
      ? "national_provincial"
      : "club";
```

- [ ] **Step 2: bulk-upload record_lists insert scope**

In the same file, the record_lists insert currently has:
```ts
          scope: file.recordType === "relay" ? file.scope : "club",
```
Replace with:
```ts
          scope: file.scope,
```

- [ ] **Step 3: admin upload page — identical fixes**

In `app/admin/[clubId]/upload/page.tsx`, apply the EXACT same two replacements: the `parseFilename` `scope` block (same old/new as Step 1), and the fetch-body line `scope: file.recordType === "relay" ? file.scope : "club",` → `scope: file.scope,`.

- [ ] **Step 4: API route insert scope**

In `app/api/admin/upload/route.ts`, the record_lists insert currently has:
```ts
      scope: recordType === "relay" ? (scope ?? "club") : "club",
```
Replace with:
```ts
      scope: scope ?? "club",
```

- [ ] **Step 5: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint "app/(dashboard)/dashboard/records/bulk-upload/page.tsx" "app/admin/[clubId]/upload/page.tsx" "app/api/admin/upload/route.ts" && npm run build`
Expected: tsc clean; eslint shows only the two upload pages' KNOWN pre-existing backlog items (no NEW ones — confirm by comparing to the relay-era state: `bulk-upload` had a `no-unused-vars` on `router`, `admin/[clubId]/upload` had `react-hooks/immutability` + `exhaustive-deps`; route.ts clean); build succeeds.

Regression reasoning to confirm: relay deliverable files are `*-national-relays.csv` → contain `national` → still `national_provincial` (unchanged). A relay file without a national token → `club` (unchanged). Individual `Men_LCM_National.csv` → no `relay` token ⇒ recordType individual; has `national` ⇒ scope `national_provincial` (newly correct). Individual file without a national token → `club` (unchanged plain-individual behavior).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/records/bulk-upload/page.tsx" "app/admin/[clubId]/upload/page.tsx" app/api/admin/upload/route.ts
git -c commit.gpgsign=false commit -m "Upload: scope from national/provincial filename token regardless of relay"
```

---

## Task C: RecordTable — age-group/club/prov for individual national/provincial

**Files:** Modify `components/RecordTable.tsx`

- [ ] **Step 1: Broaden the flags (current lines 49–50)**

Replace:
```ts
  const isRelay = recordType === "relay";
  const isNatProv = isRelay && scope === "national_provincial";
```
with:
```ts
  const isRelay = recordType === "relay";
  const isNatProv = scope === "national_provincial";
  const showAgeGroup = isRelay || isNatProv;
  const ageGroupOptions = Array.from(
    new Set([
      ...ageGroups,
      ...records
        .map((r) => r.age_group)
        .filter((a): a is string => !!a && a.trim() !== ""),
    ])
  );
```
(`records` is the component's existing prop; `ageGroups` is the existing prop fed from `standard_age_groups`.)

- [ ] **Step 2: Datalist gating (current ~line 380–393)**

The current block is:
```tsx
      {isRelay && (
        <>
          <datalist id="relay-events-list">
            {relayEvents.map((ev) => (
              <option key={ev} value={ev} />
            ))}
          </datalist>
          <datalist id="age-groups-list">
            {ageGroups.map((ag) => (
              <option key={ag} value={ag} />
            ))}
          </datalist>
        </>
      )}
```
Replace it with (relay-events datalist stays relay-only; age-groups datalist renders whenever `showAgeGroup`, sourced from `ageGroupOptions`):
```tsx
      {isRelay && (
        <datalist id="relay-events-list">
          {relayEvents.map((ev) => (
            <option key={ev} value={ev} />
          ))}
        </datalist>
      )}
      {showAgeGroup && (
        <datalist id="age-groups-list">
          {ageGroupOptions.map((ag) => (
            <option key={ag} value={ag} />
          ))}
        </datalist>
      )}
```

- [ ] **Step 3: Age-group column gates → `showAgeGroup`**

There are three `{isRelay && (` gates that render the **Age Group** `<th>`/`<td>` (the relay club/prov gates use `isNatProv` and must NOT change; the swimmer 4-name `isRelay` gates must NOT change; the event `list={isRelay ? "relay-events-list" : undefined}` must NOT change). Change ONLY the Age-Group ones:

1. Thead Age Group header — the `{isRelay && (` immediately preceding a `<th>` whose text is `Age Group` → change that opening to `{showAgeGroup && (`.
2. Main editable row Age Group cell — the `{isRelay && (` immediately preceding the `<td>` containing `list="age-groups-list"` → change to `{showAgeGroup && (`.
3. History row Age Group cell — the `{isRelay && (` immediately preceding the `<td>` rendering `historyRecord.age_group` → change to `{showAgeGroup && (`.

(Locate by the quoted neighboring content, not line numbers. Do not alter any other `isRelay` usage.)

- [ ] **Step 4: Empty-state colSpan (current ~line 870)**

Replace:
```tsx
                  colSpan={(readOnly ? 7 : 8) + (isRelay ? 1 : 0) + (isNatProv ? 2 : 0)}
```
with:
```tsx
                  colSpan={(readOnly ? 7 : 8) + (showAgeGroup ? 1 : 0) + (isNatProv ? 2 : 0)}
```

- [ ] **Step 5: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint components/RecordTable.tsx && npm run build`
Expected: tsc clean; eslint shows only the pre-existing `onBreakRecord` `no-unused-vars` warning (no NEW issues); build succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/RecordTable.tsx
git -c commit.gpgsign=false commit -m "RecordTable: age-group + club/prov for individual national/provincial lists"
```

---

## Task D: PublicRecordSearch — age-band divider rendering

**Files:** Modify `app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx`

- [ ] **Step 1: Broaden `isNatProv`, add grouping state (current lines 19–20)**

Replace:
```tsx
  const isRelay = recordType === "relay";
  const isNatProv = isRelay && scope === "national_provincial";
```
with:
```tsx
  const isRelay = recordType === "relay";
  const isNatProv = scope === "national_provincial";
```

- [ ] **Step 2: Add helpers above the `return` (after `filteredRecords` is defined, before the JSX `return (`)**

Find where `filteredRecords` is computed (a `const filteredRecords = currentRecords.filter(...)`). Immediately after that statement, add:
```tsx
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

  const desktopColSpan = 5 + (isRelay ? 1 : 0) + (isNatProv ? 2 : 0);

  const renderDesktopRecord = (record: SwimRecord) => {
    const hasHistory = historyByRecordId.has(record.id);
    const isExpanded = expandedHistory.has(record.id);
    const history = historyByRecordId.get(record.id) || [];
    return (
      <React.Fragment key={record.id}>
        <tr>
          <td className="px-4 py-3 text-gray-900 dark:text-white">
            <span className="flex items-center gap-2">
              {hasHistory && (
                <button
                  type="button"
                  onClick={() => toggleHistory(record.id)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title={isExpanded ? "Hide history" : "Show previous records"}
                >
                  {isExpanded ? "▼" : "▶"}
                </button>
              )}
              {record.event_name}
            </span>
          </td>
          {isRelay && (
            <td className="px-4 py-3 text-gray-900 dark:text-white">
              {record.age_group || "-"}
            </td>
          )}
          <td className="px-4 py-3 text-gray-900 dark:text-white">
            <span className="flex items-center gap-1">
              <span className="font-mono">
                {record.time_ms > 0 ? formatTime(record.time_ms) : "-"}
              </span>
              <RecordFlags record={record} size="sm" />
            </span>
          </td>
          <td className="px-4 py-3 text-gray-900 dark:text-white">
            {isRelay
              ? [record.swimmer_name, record.swimmer_name_2, record.swimmer_name_3, record.swimmer_name_4]
                  .filter((n) => n && n.trim())
                  .map((n, i) => <div key={i}>{n}</div>)
              : record.swimmer_name || "-"}
          </td>
          {isNatProv && (
            <>
              <td className="hidden px-4 py-3 text-gray-500 dark:text-gray-400 sm:table-cell">
                {record.record_club || "-"}
              </td>
              <td className="hidden px-4 py-3 text-gray-500 dark:text-gray-400 sm:table-cell">
                {record.province || "-"}
              </td>
            </>
          )}
          <td className="hidden px-4 py-3 text-gray-500 dark:text-gray-400 md:table-cell">
            {formatDate(record.record_date)}
          </td>
          <td className="hidden px-4 py-3 text-gray-500 dark:text-gray-400 lg:table-cell">
            {record.location || "-"}
          </td>
        </tr>
        {isExpanded &&
          history.map((historyRecord) => (
            <tr
              key={historyRecord.id}
              className="bg-gray-50/50 dark:bg-gray-800/50"
            >
              <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                <span className="ml-6 text-sm">↳ {historyRecord.event_name}</span>
              </td>
              {isRelay && (
                <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                  {historyRecord.age_group || "-"}
                </td>
              )}
              <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="font-mono text-sm">
                    {historyRecord.time_ms > 0 ? formatTime(historyRecord.time_ms) : "-"}
                  </span>
                  <RecordFlags record={historyRecord} size="sm" />
                </span>
              </td>
              <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                {historyRecord.swimmer_name || "-"}
              </td>
              {isNatProv && (
                <>
                  <td className="hidden px-4 py-2 text-sm text-gray-500 dark:text-gray-400 sm:table-cell">
                    {historyRecord.record_club || "-"}
                  </td>
                  <td className="hidden px-4 py-2 text-sm text-gray-500 dark:text-gray-400 sm:table-cell">
                    {historyRecord.province || "-"}
                  </td>
                </>
              )}
              <td className="hidden px-4 py-2 text-sm text-gray-500 dark:text-gray-400 md:table-cell">
                {formatDate(historyRecord.record_date)}
              </td>
              <td className="hidden px-4 py-2 text-sm text-gray-500 dark:text-gray-400 lg:table-cell">
                {historyRecord.location || "-"}
              </td>
            </tr>
          ))}
      </React.Fragment>
    );
  };
```

(This is the existing per-record desktop markup, verbatim, extracted into a reusable function — DRY for both flat and grouped tbody.)

- [ ] **Step 3: Replace the desktop `<tbody>` contents**

The current `<tbody>` maps `filteredRecords` inline and then has a `filteredRecords.length === 0` empty-state `<tr>`. Replace the **entire `<tbody> … </tbody>`** with:
```tsx
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {grouped
                ? groupedBands.map((g) => (
                    <React.Fragment key={`band-${g.band}`}>
                      <tr className="bg-gray-100 dark:bg-gray-700/60">
                        <td
                          colSpan={desktopColSpan}
                          className="px-4 py-2 text-sm font-semibold text-gray-800 dark:text-gray-200"
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

- [ ] **Step 4: Add a reusable mobile-card renderer**

Immediately after `renderDesktopRecord` (still before the `return (`), add `renderMobileCard` containing the **existing** mobile card markup verbatim, parameterized by `record`. Copy the current mobile `.map` body (the `<div key={`mobile-${record.id}`}> … </div>` including its history `.map`) into:
```tsx
  const renderMobileCard = (record: SwimRecord) => {
    const hasHistory = historyByRecordId.has(record.id);
    const isExpanded = expandedHistory.has(record.id);
    const history = historyByRecordId.get(record.id) || [];
    return (
      /* PASTE the exact current JSX returned inside the existing
         filteredRecords.map((record) => { … return ( <div key={`mobile-${record.id}`}> … </div> ) })
         here, unchanged, including the {isRelay && …} club/prov line and the
         history .map block. */
    );
  };
```
(The implementer must paste the current mobile card JSX exactly as it exists in the file — do not rewrite it. Only the wrapper/extraction is new.)

- [ ] **Step 5: Replace the mobile list container body**

The current mobile container is `<div className="mt-6 space-y-3 md:hidden"> {filteredRecords.map((record) => { … })} </div>`. Replace its children with:
```tsx
      <div className="mt-6 space-y-3 md:hidden">
        {grouped
          ? groupedBands.map((g) => (
              <div key={`mband-${g.band}`} className="space-y-3">
                <div className="px-1 pt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {g.band}
                </div>
                {g.records.map((record) => renderMobileCard(record))}
              </div>
            ))
          : filteredRecords.map((record) => renderMobileCard(record))}
      </div>
```

- [ ] **Step 6: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint "app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx" && npm run build`
Expected: all clean (this file is not in the backlog); build succeeds. If `React` is referenced and not imported, it already is (the file uses `React.Fragment` today) — confirm the import line `import React` is intact.

- [ ] **Step 7: Commit**

```bash
git add "app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx"
git -c commit.gpgsign=false commit -m "Public: age-band section dividers for individual lists with age groups"
```

---

## Task E: Prep script — 4 national CSVs (TDD, project root, NO git)

**Files:** Rework `SNC/individual-prep/xlsx_to_individual_csv.py` and `SNC/individual-prep/test_xlsx_to_individual_csv.py`. Run all commands from `/Users/jackso/code/ClubRecordProject/SNC/individual-prep`. **No git anywhere; do not touch `club-record/`.**

The current script (relay-plan Task 12) emits 66 per-band files, header `Event,Time,Swimmer,Date,Location,is_*`, dropping CLUB/PROV. Rework to emit 4 files with `AgeGroup` + `Club` + `Province` + single `Swimmer`.

- [ ] **Step 1: Update tests first (TDD)**

In `test_xlsx_to_individual_csv.py`, the existing `RowToRecord` tests assume the old record shape. Replace the `RowToRecord` class and add an output-shape test so they assert the NEW behavior:
```python
class RowToRecord(unittest.TestCase):
    def test_valid_row_keeps_club_province(self):
        rec, problem = row_to_record(
            ["50 FR - 50 LI", "DAVID MORIN", "CAMO", "QC",
             "Coupe de Montreal", "MTL", "2005-11", 2.921296296296296e-4])
        self.assertIsNone(problem)
        self.assertEqual(rec["event"], "50 Free")
        self.assertEqual(rec["time"], "25.24")
        self.assertEqual(rec["swimmer"], "DAVID MORIN")
        self.assertEqual(rec["club"], "CAMO")
        self.assertEqual(rec["province"], "QC")
        self.assertEqual(rec["date"], "2005-11")
        self.assertEqual(rec["location"], "MTL")
    def test_missing_club_goes_to_problem(self):
        rec, problem = row_to_record(
            ["50 FR - 50 LI", "X Y", "", "QC", "M", "L", "2005-11", 3.0e-4])
        self.assertIsNone(rec)
        self.assertIsNotNone(problem)
    def test_missing_province_goes_to_problem(self):
        rec, problem = row_to_record(
            ["50 FR - 50 LI", "X Y", "CAMO", "", "M", "L", "2005-11", 3.0e-4])
        self.assertIsNone(rec)
        self.assertIsNotNone(problem)
    def test_missing_swimmer_goes_to_problem(self):
        rec, problem = row_to_record(
            ["50 FR - 50 LI", "", "", "", "", "", "", None])
        self.assertIsNone(rec)
        self.assertIsNotNone(problem)
```
Keep ALL other existing test classes (`TimeConversion`, `EventNormalization`, `BandNormalization`, `SerialDate`, `TimeGuards`) unchanged.

- [ ] **Step 2: Run tests — expect failure**

Run: `python3 -m unittest -v`
Expected: FAIL — `row_to_record` does not yet return `club`/`province` (KeyError/AssertionError on the new assertions).

- [ ] **Step 3: Rework `xlsx_to_individual_csv.py`**

Make these changes (keep `excel_fraction_to_time`, `normalize_event`, `normalize_band`, the Excel-serial-date conversion, `_shared_strings`/`_col_row`/`_sheet_grid`, band/section/header detection EXACTLY as they are):

1. `row_to_record(cells)`: it currently builds a dict with keys `event,time,swimmer,date,location`. Change validity to ALSO require non-empty club (cells[2]) and province (cells[3]); add `club` and `province` to the returned dict. The function becomes (preserve the existing event/time/serial-date logic — only add club/prov):
```python
def row_to_record(cells):
    raw_event = str(cells[0]).strip() if cells[0] else ""
    event = normalize_event(raw_event)
    swimmer = str(cells[1]).strip() if cells[1] else ""
    club = str(cells[2]).strip() if cells[2] else ""
    prov = str(cells[3]).strip() if cells[3] else ""
    location = str(cells[5]).strip() if cells[5] else ""
    date = str(cells[6]).strip() if cells[6] else ""
    if re.fullmatch(r"\d{5}", date):
        date = (_date(1899, 12, 30) + timedelta(days=int(date))).isoformat()
    time_str = excel_fraction_to_time(cells[7])
    if event is None:
        return None, f"unrecognized event '{raw_event}'"
    if not swimmer:
        return None, "no swimmer"
    if not time_str:
        return None, "no time"
    if not club:
        return None, "no club"
    if not prov:
        return None, "no province"
    return {
        "event": event, "time": time_str, "swimmer": swimmer,
        "club": club, "province": prov, "date": date, "location": location,
    }, None
```
(If the existing `row_to_record` differs in detail, preserve its existing serial-date/event/time semantics and ONLY add the `club`/`prov` extraction, the two new "no club"/"no province" checks, and the two new dict keys. Match the existing column indexing — cells[2]=club, cells[3]=prov, cells[5]=location, cells[6]=date, cells[7]=time, per the relay-era spreadsheet layout.)

2. The output: replace the per-band multi-file writer with a 4-file writer keyed by (gender, course). Sheet→(gender,course): `sheet1`→`("Men","LCM")`, `sheet2`→`("Women","LCM")`, `sheet3`→`("Men","SCM")`, `sheet4`→`("Women","SCM")`. For each, accumulate `(band, record)` across all bands; sort by `ageBandKey(band)` ascending (parse leading int; non-parseable last) then keep source event order within a band. Write to `../individual-csv/{Gender}_{Course}_National.csv` with header EXACTLY:
```
Event,AgeGroup,Time,Swimmer,Club,Province,Date,Location,is_World_Record,is_National,is_Current_National,is_Provincial,is_Current_Provincial,is_New
```
and each row: `event, band, time, swimmer, club, province, date, location, "","","","","",""`.
3. Delete the 66 stale files before/at write: at the start of output, remove existing `../individual-csv/*.csv` (the old per-band files) so only the 4 new files + `needs-review.txt` remain. Use `glob` + `os.remove` (stdlib).
4. `needs-review.txt`: same as now — every non-emitted row appended as `[Gender Course band] event='…': reason`. Always written.
5. Print one `wrote <file>: N records` per file + `needs-review.txt: M flagged`.

- [ ] **Step 4: Run tests — green**

Run: `python3 -m unittest -v`
Expected: ALL pass (the prior unchanged classes + the reworked `RowToRecord`). Fix implementation (not tests) if any fail.

- [ ] **Step 5: Generate**

Run: `python3 xlsx_to_individual_csv.py`
Expected: prints exactly 4 `wrote …_National.csv: N records` lines + a needs-review count.

- [ ] **Step 6: Inspect & verify**

Run:
```
cd ../individual-csv && ls -1 && echo "---" && head -1 Men_LCM_National.csv && sed -n '2,4p' Men_LCM_National.csv && echo "--- women differ ---" && sed -n '2,2p' Women_LCM_National.csv && echo "--- bands present ---" && awk -F, 'FNR>1{print $2}' Men_LCM_National.csv | uniq | head -20 && echo "--- no serial dates ---" && awk -F, 'FNR>1 && $7 ~ /^[0-9]{5}$/{c++} END{print c+0}' *.csv && echo "--- review ---" && wc -l needs-review.txt
```
Confirm: directory contains ONLY `Men_LCM_National.csv`, `Men_SCM_National.csv`, `Women_LCM_National.csv`, `Women_SCM_National.csv`, `needs-review.txt` (no leftover per-band files); header matches exactly; col 2 is the age band, col 4 the single swimmer, cols 5/6 club/province populated; bands appear youngest→oldest; **0** five-digit serial dates (col 7); Men ≠ Women data. Report counts.

- [ ] **Step 7: (No commit — project root is not a git repo.)** Report the file list and record/needs-review counts.

---

## Task F: Whole-app verification + docs

**Files:** Modify `/Users/jackso/code/ClubRecordProject/CLAUDE.md` (project root, **outside git — edited, not committed; no git for this**)

- [ ] **Step 1: Whole-app verification**

From `club-record/`: `npx tsc --noEmit && npm run lint && npm run build`
Expected: tsc clean; `npm run lint` = the SAME 14-item pre-existing `TODO.md` backlog, **zero new** (compare file/rule set; line drift OK); build succeeds (22 routes).

- [ ] **Step 2: Manual checklist (human runs; document, do not execute a dev server in a subagent)**

Record in the report that these remain for the user: bulk-upload a generated `SNC/individual-csv/Men_LCM_National.csv` → confirm it creates an `individual` + `national_provincial` list (rename title to "Men LC" in the upload preview); public page shows age-band divider rows youngest→oldest with Club/Prov columns and no age-group column; dashboard editor for that list shows an Age Group cell + Club/Prov cells with a single swimmer input; a relay list still shows its age-group *column* (unchanged); a plain club individual list is unchanged. (These require the relay migrations already applied to Supabase.)

- [ ] **Step 3: CLAUDE.md note**

In `/Users/jackso/code/ClubRecordProject/CLAUDE.md`, in the `### Database` section, at the end of the existing `**Relay records**:` paragraph (the one added by the relay work), append this sentence (keep all existing text; just add):
` Individual lists with \`scope='national_provincial'\` carry the same \`age_group\`/\`record_club\`/\`province\`; their public view groups records under age-band section dividers (relay lists keep an age-group column).`

- [ ] **Step 4: (No commit — CLAUDE.md is outside the git repo; no git for this task.)**

---

## Self-Review

**Spec coverage:**
- §1 parser individual national/provincial branch → Task A. ✓
- §2 prep 4-file output w/ Club/Province + single Swimmer, delete 66 → Task E. ✓
- §3 editor age-group column-per-row + club/prov, single swimmer, datalist union → Task C. ✓
- §4 public age-band dividers, trigger, ordering, history nesting, search, mobile → Task D. ✓
- §5 ordering by leading integer → `ageBandKey` in Task D + Task E sort. ✓
- "bulk/admin parseFilename — verify, only touch if real gap": real gap found (relay-gated scope) → Task B fixes all 3 sites. ✓
- No migration / no types change / relay+club-individual unchanged → none added; gating broadened only via scope; relay column gates left on `isRelay`. ✓

**Placeholder scan:** Task D Step 4 instructs pasting the existing mobile JSX verbatim rather than reprinting ~40 lines — this is deliberate (the engineer copies an exact, present block; reprinting risks drift). Every other code step has complete code. No TBD/TODO/"handle errors" vagueness.

**Type consistency:** `isRelay`/`isNatProv`/`showAgeGroup`/`grouped`/`ageBandKey`/`groupedBands`/`desktopColSpan`/`renderDesktopRecord`/`renderMobileCard`/`ageGroupOptions`/`carryAge`/`indivNatProv` are each defined before use within their task and used consistently. `row_to_record` dict gains `club`/`province` in Task E and the header/writer + tests reference exactly those keys. Parser `scope`/`relay` option names match existing `RelayParseOptions`. Upload `file.scope` matches the existing `ParsedFile.scope` field.
