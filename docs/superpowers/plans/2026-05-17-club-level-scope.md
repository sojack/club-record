# Club-Level Records Authority — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a club's `level` (regular | provincial | national) the authoritative source of its lists' `scope`, deleting the fragile filename-based scope inference and adding the national-vs-provincial province distinction.

**Architecture:** Approach B from the spec. Add `clubs.level` + `clubs.province`. Keep `record_lists.scope` as the denormalised behavioural switch (~8 read sites), widen it `club|provincial|national`, and set it from the club's level at write time. Read sites refactor from one bool (`isNatProv`) to two (`showHolderClub`, `showProvince`). A **transitional superset** scope union (`…|national_provincial`) keeps `tsc` green through the refactor; the final task narrows it away as a completeness check.

**Tech Stack:** Next.js 16 / React 19 / TS (strict, untyped Supabase client), Supabase, Tailwind. No JS test framework.

---

## Process / verification (read first)

Same as the prior plans in this repo: **no JS test framework** — verify TS with `npx tsc --noEmit`, `npm run lint` (only the known 14-item `TODO.md` backlog is acceptable; **zero new**), `npm run build`, plus a manual checklist. Commits on local `main`, **repo-relative paths**, exact message given, **no `Co-Authored-By`/AI trailer**, **never `git push`/branch/amend/rebase/reset**, `git -c commit.gpgsign=false commit -m "<msg>"`. Migrations are applied to Supabase **manually by the user** (this plan only writes/verifies the SQL). All app commands from `/Users/jackso/code/ClubRecordProject/club-record`.

Because the Supabase client is **untyped** (`createClient()`), DB inserts of `scope:'national'` are not type-checked; the only type-coupled sites are code that compares a typed `.scope` to a literal or annotates a `scope` prop. The transitional superset union means **every task here leaves `tsc` green**; Task G's narrowing is the safety net that proves no `national_provincial` comparison was missed.

---

## File Structure

**Create:**
- `supabase/migrations/add_club_level.sql`
- `supabase/migrations/widen_record_lists_scope.sql`
- `lib/scope.ts` — `ClubLevel`, `ListScope`, `scopeForClubLevel()`
- `app/api/admin/club-level/route.ts` — admin-only POST to set a club's level/province

**Modify:**
- `types/database.ts` — `Club.level`/`Club.province`; `RecordList.scope` (transitional superset, narrowed in G)
- `lib/csv-parser.ts` — `RelayParseOptions`/`RelayTemplateOptions` scope unions; per-row 3-behaviour rewrite
- (Task B also widens — annotation only — the `scope?:` prop union in `components/CSVUploader.tsx`, `components/RecordTable.tsx`, `app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx` so the widened `RecordList.scope` assigns into them; their *logic* is refactored in D/E and the unions narrowed in G.)
- `app/(dashboard)/dashboard/records/bulk-upload/page.tsx` — drop filename scope, derive from `selectedClub.level`
- `app/admin/[clubId]/upload/page.tsx` — drop filename scope; add the admin level/province control
- `app/api/admin/upload/route.ts` — derive scope from club level server-side
- `app/(dashboard)/dashboard/records/new/page.tsx` — remove scope `<select>`, derive from club level
- `components/RecordTable.tsx` — `isNatProv` → `showHolderClub`/`showProvince`; split Club/Prov cells
- `app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx` — same split (table + history + mobile + colSpan)
- `app/(dashboard)/dashboard/records/[listId]/page.tsx` — 3-value scope badge
- `components/CSVUploader.tsx` — scope union; provincial template omits Province
- `CLAUDE.md` (project root, **outside git** — edited, not committed)

**Out of scope:** SNC prep scripts (national data unaffected), the owner New Club form (level defaults `regular`), regular-club behaviour, pre-existing backlog items.

---

## Task A: Migrations + scope helper

**Files:** Create `supabase/migrations/add_club_level.sql`, `supabase/migrations/widen_record_lists_scope.sql`, `lib/scope.ts`

- [ ] **Step 1:** Create `supabase/migrations/add_club_level.sql`:
```sql
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'regular'
    CHECK (level IN ('regular', 'provincial', 'national'));
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS province TEXT;
```

- [ ] **Step 2:** Create `supabase/migrations/widen_record_lists_scope.sql`:
```sql
-- The existing scope CHECK is the unnamed inline constraint from
-- add_relay_fields_to_record_lists.sql; Postgres auto-names it
-- record_lists_scope_check. Drop -> migrate values -> re-add (order matters).
ALTER TABLE record_lists DROP CONSTRAINT IF EXISTS record_lists_scope_check;
UPDATE record_lists SET scope = 'national' WHERE scope = 'national_provincial';
ALTER TABLE record_lists
  ADD CONSTRAINT record_lists_scope_check
    CHECK (scope IN ('club', 'provincial', 'national'));
```

- [ ] **Step 3:** Create `lib/scope.ts`:
```ts
export type ClubLevel = "regular" | "provincial" | "national";
export type ListScope = "club" | "provincial" | "national";

/** A club's level authoritatively determines its lists' scope. */
export function scopeForClubLevel(
  level: ClubLevel | null | undefined
): ListScope {
  return level === "national"
    ? "national"
    : level === "provincial"
    ? "provincial"
    : "club";
}
```

- [ ] **Step 4: Verify** — from repo root: `npx tsc --noEmit` (clean — `lib/scope.ts` is new, unused yet) and `npx eslint lib/scope.ts` (0 issues). Print the 2 SQL files.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/add_club_level.sql supabase/migrations/widen_record_lists_scope.sql lib/scope.ts
git -c commit.gpgsign=false commit -m "Club level: migrations (clubs.level/province, widen record_lists.scope) + scope helper"
```

---

## Task B: Types + parser 3-behaviour

**Files:** Modify `types/database.ts`, `lib/csv-parser.ts`

- [ ] **Step 1: `types/database.ts` — `Club` interface.** Add after the `slug` field (keep all other fields):
```ts
  level: "regular" | "provincial" | "national";
  province: string | null;
```

- [ ] **Step 2: `types/database.ts` — `RecordList.scope`.** Change the `scope` field's type to the **transitional superset** (keeps `national_provincial` valid so comparisons still type-check during the refactor; narrowed in Task G):
```ts
  scope: "club" | "provincial" | "national" | "national_provincial";
```

- [ ] **Step 3: Widen the transitional superset on EVERY `scope` type annotation that receives a `RecordList.scope` (assignment-direction fix).** Widening `RecordList.scope` (Step 2) makes pages pass a 4-value union into component props typed 2-value → TS2322. So change `scope?: "club" | "national_provincial";` (or the prop's `scope` annotation) to `scope?: "club" | "provincial" | "national" | "national_provincial";` in ALL of:
  - `lib/csv-parser.ts` — `RelayParseOptions` (~L80) and `RelayTemplateOptions` (~L274).
  - `components/CSVUploader.tsx` — the `scope?:` prop in its props interface.
  - `components/RecordTable.tsx` — the `scope?:` prop in `RecordTableProps`.
  - `app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx` — the `scope?:` prop in its props interface.

  This is a **type-annotation-only** widening in the components — their *logic* (the `=== "national_provincial"` comparisons) is untouched here and is refactored in Tasks D/E; Task G narrows all of these same unions back to 3 values as the completeness check. Do NOT touch the upload-page `ParsedFile`/`parseFilename` scope annotations or `new/page.tsx`'s `useState` scope (those are independent literals, removed in Task C — they don't receive `RecordList.scope`).

- [ ] **Step 4: `lib/csv-parser.ts` — per-row 3-behaviour.** Replace the block from `    const isNatProv = relayOptions.scope === "national_provincial";` (currently line 185) through the `province: isNatProv ? province!.trim() : null,` line inside `records.push` (currently line 255) with EXACTLY:
```ts
    const rawScope = relayOptions.scope;
    const scope =
      rawScope === "national" || rawScope === "national_provincial"
        ? "national"
        : rawScope === "provincial"
        ? "provincial"
        : "club";
    const carriesAgeClub = scope !== "club"; // provincial + national
    const carriesProvince = scope === "national";

    if (isRelay) {
      if (!name2?.trim() || !name3?.trim() || !name4?.trim()) {
        errors.push(
          `Row ${index + 2}: Relay records require all 4 swimmer names (Name1-Name4)`
        );
        return;
      }
      if (
        relayOptions.allowedAgeGroups &&
        relayOptions.allowedAgeGroups.length > 0 &&
        ageGroup?.trim() &&
        !relayOptions.allowedAgeGroups.includes(ageGroup.trim())
      ) {
        errors.push(
          `Row ${index + 2}: Age Group "${ageGroup.trim()}" is not a standard age group`
        );
        return;
      }
    }

    if (carriesAgeClub) {
      if (!ageGroup?.trim()) {
        errors.push(
          `Row ${index + 2}: ${scope === "national" ? "National" : "Provincial"} records require an Age Group`
        );
        return;
      }
      if (!recordClub?.trim()) {
        errors.push(
          `Row ${index + 2}: ${scope === "national" ? "National" : "Provincial"} records require a Club`
        );
        return;
      }
      if (carriesProvince && !province?.trim()) {
        errors.push(
          `Row ${index + 2}: National records require a Province`
        );
        return;
      }
    }

    records.push({
      event_name: event.trim(),
      time_ms,
      swimmer_name: swimmer.trim(),
      swimmer_name_2: isRelay ? name2!.trim() : null,
      swimmer_name_3: isRelay ? name3!.trim() : null,
      swimmer_name_4: isRelay ? name4!.trim() : null,
      age_group: carriesAgeClub ? ageGroup!.trim() : null,
      record_club: carriesAgeClub ? recordClub!.trim() : null,
      province: carriesProvince ? province!.trim() : null,
```
(The lines after `province:` — `record_date: normalizeDate(date),` … the closing `});`, `})`, and `return { records, errors };` — are unchanged. Note the relay `allowedAgeGroups` check now guards on `ageGroup?.trim()` first so it only validates when an age group is present and applies to relay; the old standalone "Relay records require an Age Group" / relay-natprov club/province checks and the separate `else if (indivNatProv)` block are fully replaced by the unified `carriesAgeClub`/`carriesProvince` logic. `isNatProv`/`indivNatProv`/`carryAge` are gone — confirm no other reference to them remains in the file.)

- [ ] **Step 5: Verify** — `npx tsc --noEmit` (clean; superset union keeps any remaining `=== "national_provincial"` valid) and `npx eslint lib/csv-parser.ts` (0 issues). Manually reason: `scope:'club'`→plain; `'provincial'`→age+club, no province; `'national'`(or legacy `'national_provincial'`)→age+club+province; relay always 4 names.

- [ ] **Step 6: Commit**
```bash
git add types/database.ts lib/csv-parser.ts
git -c commit.gpgsign=false commit -m "Club level: Club.level/province types + 3-behaviour CSV parser (club/provincial/national)"
```

---

## Task C: Write sides — scope from club level

**Files:** Modify `app/(dashboard)/dashboard/records/bulk-upload/page.tsx`, `app/admin/[clubId]/upload/page.tsx`, `app/api/admin/upload/route.ts`, `app/(dashboard)/dashboard/records/new/page.tsx`

- [ ] **Step 1: bulk-upload `parseFilename` — drop scope.** In `app/(dashboard)/dashboard/records/bulk-upload/page.tsx`: remove `scope` from the `ParsedFile` interface and from `parseFilename`'s return type, delete the `const scope: "club" | "national_provincial" = …;` block and the `scope` key in its returned object. (Keep title/slug/courseType/gender/recordType.)

- [ ] **Step 2: bulk-upload — derive scope from club level, CAPTURED AT PARSE TIME.** Add `import { scopeForClubLevel, type ListScope } from "@/lib/scope";`. Capture the club-derived scope ONCE in the file-select/parse handler and reuse it at upload — do NOT re-derive it at upload time (re-deriving desyncs the parsed record columns from the inserted list scope if the user switches the selected club between parsing and clicking upload). Concretely: in the parse handler compute `const listScope = scopeForClubLevel(selectedClub?.level);`; pass `scope: listScope` into `parseRecordsCSV(content, { relay: …, scope: listScope })`; add a `listScope: ListScope` field to the `ParsedFile` interface and set it in `parsed.push({ …, listScope })`. At upload time, the `record_lists` insert MUST use `scope: file.listScope` (NOT a fresh `scopeForClubLevel(selectedClub?.level)`). Remove the old `scope` from the `parsed.push({...})` object and the `const { …, scope } = parseFilename(...)` destructure (that field no longer exists on parseFilename). This guarantees a file's parsed record columns and its list `scope` always come from the same `selectedClub.level` snapshot.

- [ ] **Step 3: admin upload page — drop scope, stop sending it.** In `app/admin/[clubId]/upload/page.tsx`: same `parseFilename`/`ParsedFile` scope removal as Step 1. In the upload `fetch("/api/admin/upload", …)` body, **remove** the `scope: file.scope,` line (the server derives it). Remove `scope` from the parseFilename destructure/usage.

- [ ] **Step 4: admin upload API route — derive scope from club.level server-side.** In `app/api/admin/upload/route.ts`: add `import { scopeForClubLevel } from "@/lib/scope";`. Remove `scope` from the `UploadRequest` interface and from the `const { … } = body;` destructure. After the club is known by `clubId`, load its level with the admin client and derive scope:
```ts
  const { data: clubRow } = await adminClient
    .from("clubs")
    .select("level")
    .eq("id", clubId)
    .single();
  const listScope = scopeForClubLevel(
    (clubRow?.level ?? "regular") as "regular" | "provincial" | "national"
  );
```
(use the existing admin/service client variable name in that file). Set the `record_lists` insert `scope: listScope` (replacing `scope: scope ?? "club"`). If the records insert needs scope-derived behaviour it is already handled by the parser client-side; the route only persists rows.

- [ ] **Step 5: New List form — remove scope select, derive from club.** In `app/(dashboard)/dashboard/records/new/page.tsx`: add `import { scopeForClubLevel } from "@/lib/scope";`. Delete `const [scope, setScope] = useState<"club" | "national_provincial">("club");`. Delete the entire `{recordType === "relay" && ( <div> … Scope … </div> )}` JSX block (the scope `<label>`/`<select>`/help `<p>`). In the `record_lists` insert, replace `scope: recordType === "relay" ? scope : "club",` with `scope: scopeForClubLevel(selectedClub?.level),`.

- [ ] **Step 6: ClubContext / clubs fetch carries `level`.** Verify the server query that supplies `clubs` to `ClubProvider` uses `select("*")` (so `level` flows once the column + types exist). Find it: `grep -rn 'from("clubs")' app | grep -i select`. If it selects specific columns rather than `*`, add `level` (and `province`) to that select. (`ClubWithMembership extends Club`, so the type already carries `level` after Task B; no type change here — just ensure the data is fetched.) Report which file/line was checked and whether a change was needed.

- [ ] **Step 7: Verify** — `npx tsc --noEmit` (clean) ; `npx eslint` on the 4 changed page/route files plus any clubs-fetch file touched (only the known pre-existing backlog items allowed for `bulk-upload`/`admin upload`; the new route + `new/page.tsx` must be clean — state new-vs-preexisting) ; `npm run build` (exit 0).

- [ ] **Step 8: Commit**
```bash
git add "app/(dashboard)/dashboard/records/bulk-upload/page.tsx" "app/admin/[clubId]/upload/page.tsx" app/api/admin/upload/route.ts "app/(dashboard)/dashboard/records/new/page.tsx"
# also add the clubs-fetch file if Step 6 changed it
git -c commit.gpgsign=false commit -m "Club level: derive list scope from club level; remove filename/scope-select inference"
```

---

## Task D: RecordTable + list-editor badge + CSVUploader read refactor

**Files:** Modify `components/RecordTable.tsx`, `app/(dashboard)/dashboard/records/[listId]/page.tsx`, `components/CSVUploader.tsx`

- [ ] **Step 1: RecordTable flags.** Replace (currently lines 50-51):
```ts
  const isNatProv = scope === "national_provincial";
  const showAgeGroup = isRelay || isNatProv;
```
with:
```ts
  const showHolderClub = scope !== "club";
  const showProvince = scope === "national" || scope === "national_provincial";
  const showAgeGroup = isRelay || showHolderClub;
```
(`scope` is the component prop. `national_provincial` is still in the prop union transitionally — Task G removes it. Leave the `isRelay` line as-is.)

- [ ] **Step 2: RecordTable — split the 3 combined Club/Prov fragments.** There are exactly three `{isNatProv && ( <> <…>Club…</…> <…>Prov…</…> </> )}` fragments — in `<thead>` (the `<th>Club</th><th>Prov</th>`), the main editable row (the two `<td>`s with the `record_club`/`province` inputs), and the history sub-row (the two read-only `<td>`s with `historyRecord.record_club`/`historyRecord.province`). For EACH, replace the single `{isNatProv && (<>CLUB_CELL PROV_CELL</>)}` with two independent guards:
```tsx
{showHolderClub && (CLUB_CELL)}
{showProvince && (PROV_CELL)}
```
where `CLUB_CELL` / `PROV_CELL` are the **exact existing** `<th>`/`<td>` JSX for Club and Prov respectively (unchanged markup — only the wrapping `{isNatProv && (<>…</>)}` becomes two separate `{showHolderClub && (…)}` / `{showProvince && (…)}` expressions). Apply at all three locations. Any other `isNatProv` use must be removed (there are none beyond these + the flags + colSpan).

- [ ] **Step 3: RecordTable colSpan.** Replace (currently line 879):
```tsx
                  colSpan={(readOnly ? 7 : 8) + (showAgeGroup ? 1 : 0) + (isNatProv ? 2 : 0)}
```
with:
```tsx
                  colSpan={(readOnly ? 7 : 8) + (showAgeGroup ? 1 : 0) + (showHolderClub ? 1 : 0) + (showProvince ? 1 : 0)}
```

- [ ] **Step 4: list-editor badge — 3 values.** In `app/(dashboard)/dashboard/records/[listId]/page.tsx`, the relay badge currently reads `Relay · {recordList.scope === "national_provincial" ? "Nat/Prov" : "Club"}`. Replace that expression with:
```tsx
Relay · {recordList.scope === "national" || recordList.scope === "national_provincial" ? "National" : recordList.scope === "provincial" ? "Provincial" : "Club"}
```
(Leave the rest of that file unchanged — it already passes `scope={recordList.scope}` to RecordTable/CSVUploader, now 3-valued.)

- [ ] **Step 5: CSVUploader + `generateCSVTemplate` — provincial/national template & columns.** Two parts:
  **(5a) `lib/csv-parser.ts` `generateCSVTemplate`:** it currently computes `const natProv = options.scope === "national_provincial"` and emits the `Club`/`Province` columns from that single boolean. Replace that with scope-3 logic so the generated template matches the parser's requirements: `const wantsClub = options.scope === "provincial" || options.scope === "national" || options.scope === "national_provincial"; const wantsProvince = options.scope === "national" || options.scope === "national_provincial";` then emit the `Club` header/column when `wantsClub` and the `Province` header/column when `wantsProvince` (national & legacy → Club+Province; provincial → Club only, no Province; club → neither). Adjust any blank-cell count / `void blanks` arithmetic so the example/blank rows still have the right number of fields for the chosen columns. (`RelayTemplateOptions.scope` is the 4-value transitional superset from Task B; Task G narrows it and per Task G Step 2's carve-out you keep the scope-3 logic here, only dropping the now-impossible `national_provincial` literal.)
  **(5b) `components/CSVUploader.tsx`:** (its `scope?:` prop union was already widened in Task B — leave that annotation; Task G narrows it). Where it builds the expected-columns *hint text* based on `scope === "national_provincial"`, replace with `const wantsProvince = scope === "national" || scope === "national_provincial"; const wantsClub = scope !== "club";` and word the hint as: provincial → "…AgeGroup, Club…" (no Province); national → "…AgeGroup, Club, Province…"; club → today's plain hint. Pass `scope` through to `generateCSVTemplate` unchanged (it's already forwarded).

- [ ] **Step 6: Verify** — `npx tsc --noEmit` (clean) ; `npx eslint components/RecordTable.tsx components/CSVUploader.tsx "app/(dashboard)/dashboard/records/[listId]/page.tsx"` (RecordTable: only the pre-existing `onBreakRecord` warning; CSVUploader & [listId]: [listId] has its known pre-existing backlog items only; no NEW issues — state new-vs-preexisting) ; `npm run build` (exit 0). Reason through column-count parity: thead/main/history each now emit Club iff `showHolderClub` and Prov iff `showProvince`, identical predicate per cell, and `colSpan` sums the same — so national (club+prov, +2), provincial (club only, +1), club (0) all stay aligned.

- [ ] **Step 7: Commit**
```bash
git add components/RecordTable.tsx components/CSVUploader.tsx "app/(dashboard)/dashboard/records/[listId]/page.tsx"
git -c commit.gpgsign=false commit -m "Club level: RecordTable/CSVUploader/editor — split Club & Province by scope"
```

---

## Task E: PublicRecordSearch read refactor

**Files:** Modify `app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx`

- [ ] **Step 1: flags.** Replace (currently line 20) `const isNatProv = scope === "national_provincial";` with:
```tsx
  const showHolderClub = scope !== "club";
  const showProvince = scope === "national" || scope === "national_provincial";
```
(Leave `isRelay` and the `grouped` computation unchanged — `grouped` depends on `recordType==='individual'` + records having `age_group`, which provincial/national now populate.)

- [ ] **Step 2: desktopColSpan.** Replace (currently line 125):
```tsx
  const desktopColSpan = 5 + (isRelay ? 1 : 0) + (isNatProv ? 2 : 0);
```
with:
```tsx
  const desktopColSpan = 5 + (isRelay ? 1 : 0) + (showHolderClub ? 1 : 0) + (showProvince ? 1 : 0);
```

- [ ] **Step 3: split the combined Club/Prov fragments.** There are three `{isNatProv && (<> CLUB_CELL PROV_CELL </>)}` fragments: the desktop `<thead>` Club/Prov `<th>`s, the desktop record row Club/Prov `<td>`s (`record.record_club`/`record.province`), and the history sub-row Club/Prov `<td>`s (`historyRecord.record_club`/`historyRecord.province`). For each, replace the single fragment with:
```tsx
{showHolderClub && (CLUB_CELL)}
{showProvince && (PROV_CELL)}
```
using the **exact existing** Club and Prov `<th>`/`<td>` markup (unchanged classes incl. the `hidden … sm:table-cell` responsive classes — only the wrapping guard changes).

- [ ] **Step 4: mobile card line.** The mobile block currently has:
```tsx
              {isNatProv && (record.record_club || record.province) && " • "}
              {isNatProv && [record.record_club, record.province].filter(Boolean).join(", ")}
```
Replace with:
```tsx
              {showHolderClub && (record.record_club || (showProvince && record.province)) && " • "}
              {showHolderClub && [record.record_club, showProvince ? record.province : null].filter(Boolean).join(", ")}
```
And the surrounding `{isRelay && (record.age_group || isNatProv) && (` guard on the mobile age/club line: replace `isNatProv` there with `showHolderClub`.

- [ ] **Step 5:** Search the file for any remaining `isNatProv` — there must be none (flags removed, all 3 fragments + mobile + colSpan updated).

- [ ] **Step 6: Verify** — `npx tsc --noEmit` (clean) ; `npx eslint "app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx"` (0 issues — not in backlog) ; `npm run build` (exit 0). Reason column parity in grouped + flat + mobile for national (club+prov), provincial (club only), club (none); the age-band divider `colSpan={desktopColSpan}` now matches.

- [ ] **Step 7: Commit**
```bash
git add "app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx"
git -c commit.gpgsign=false commit -m "Club level: PublicRecordSearch — Club always, Province only for national"
```

---

## Task F: Admin level/province control

**Files:** Create `app/api/admin/club-level/route.ts`; Modify `app/admin/[clubId]/upload/page.tsx`

- [ ] **Step 1: admin route.** Create `app/api/admin/club-level/route.ts` mirroring the auth pattern of `app/api/admin/upload/route.ts` (verify the exact pattern by reading that file — it checks `supabase.auth.getUser()` and `user.email !== process.env.ADMIN_EMAIL`, then uses the service-role/admin client). The route: `POST` with body `{ clubId: string; level: "regular" | "provincial" | "national"; province: string | null }`; after the admin-email check, validate `level` ∈ the 3 values; update via the admin client:
```ts
  await adminClient
    .from("clubs")
    .update({
      level,
      province: level === "provincial" ? (province?.trim() || null) : null,
    })
    .eq("id", clubId);
```
Return `{ ok: true }` (or `{ error }` with 4xx on auth/validation failure), matching the upload route's response shape/conventions.

- [ ] **Step 2: admin page UI.** In `app/admin/[clubId]/upload/page.tsx` (which already loads `club` via `from("clubs").select("*").eq("id", clubId)`), add a "Club level" settings block at the top of the rendered page (above the existing uploader UI). It has: a `<select>` for `level` (Regular / Provincial / National) initialised from `club?.level ?? "regular"`, a `province` text `<input>` shown only when the selected level is `provincial` (initialised from `club?.province ?? ""`), and a Save button that `POST`s `{ clubId, level, province }` to `/api/admin/club-level`, then refetches the club (reuse the page's existing club-load function) and shows a success/error message using the page's existing message UI pattern. Keep styling consistent with the file's existing Tailwind classes.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` (clean) ; `npx eslint app/api/admin/club-level/route.ts "app/admin/[clubId]/upload/page.tsx"` (route clean; admin page: no NEW issues vs its known pre-existing backlog — state explicitly) ; `npm run build` (exit 0).

- [ ] **Step 4: Commit**
```bash
git add app/api/admin/club-level/route.ts "app/admin/[clubId]/upload/page.tsx"
git -c commit.gpgsign=false commit -m "Club level: admin-only control to set club level/province"
```

---

## Task G: Narrow scope union (completeness check) + verify + docs

**Files:** Modify `types/database.ts`, `lib/csv-parser.ts`, `components/CSVUploader.tsx`, `components/RecordTable.tsx`, `app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx` (+ any other file whose `scope` annotation still lists `national_provincial`); `CLAUDE.md` (project root, not committed)

- [ ] **Step 1: Narrow every transitional union.** Remove `"national_provincial"` from every `scope` type union introduced/kept in Tasks B–E: `RecordList.scope` → `"club" | "provincial" | "national"`; `RelayParseOptions.scope` / `RelayTemplateOptions.scope` → `"club" | "provincial" | "national" | undefined` (keep `?:`); `CSVUploader`/`RecordTable`/`PublicRecordSearch` `scope` prop unions → `"club" | "provincial" | "national"`. `grep -rn '"national_provincial"' app components lib types` and remove the literal from every **type annotation**.

- [ ] **Step 2: Resolve fallout (the safety net).** Run `npx tsc --noEmit`. Any remaining **value** comparison `=== "national_provincial"` is now a TS2367 ("no overlap") error — these are sites the refactor missed. For each, the fix is to drop only the now-impossible `national_provincial` literal while **preserving the intended scope-3 behaviour**: a guard like `scope === "national" || scope === "national_provincial"` → `scope === "national"` (the `|| …"national_provincial"` clause is dead — the value no longer exists post-migration). **Carve-outs (do NOT collapse the boolean to a constant):** in `generateCSVTemplate`/`CSVUploader` the `wantsClub`/`wantsProvince` derivations from Task D Step 5 must keep their `provincial`/`national` cases — only the `|| …"national_provincial"` alternative is removed, leaving `wantsClub = scope==='provincial'||scope==='national'`, `wantsProvince = scope==='national'`. Likewise `RecordTable`/`PublicRecordSearch` keep `showHolderClub = scope!=='club'`, `showProvince = scope==='national'`. Re-run until `tsc` is **clean**; spot-check a couple of carve-out sites to confirm the column logic is intact, not flattened. Also fix the parser's `rawScope === "national_provincial"` branch in Task B's code: it can stay (harmless dead compare against a never-occurring value) **or** be removed for cleanliness — remove the `rawScope === "national_provincial" ||` and the `|| rawScope === "national_provincial"` fragments so `tsc` (now narrowed) doesn't flag them; the `scope` derivation then reads `rawScope === "national" ? "national" : rawScope === "provincial" ? "provincial" : "club"`.

- [ ] **Step 3: Whole-app verify.** `npx tsc --noEmit` (CLEAN — zero errors; this proves no `national_provincial` comparison was missed) ; `npm run lint` (only the known 14-item `TODO.md` backlog, **zero new** — compare file/rule set) ; `npm run build` (exit 0, all routes).

- [ ] **Step 4: CLAUDE.md note (project root — edit, do NOT git/commit).** In `/Users/jackso/code/ClubRecordProject/CLAUDE.md`, in the `### Database` section, append to the end of the existing `**Relay records**:` paragraph (one sentence, keep existing text):
` A club has \`level\` (regular | provincial | national); a list's \`record_lists.scope\` (club | provincial | national) is derived authoritatively from the club's level (no filename inference) — national shows a Province column, provincial shows holder Club only (the province is the provincial club's \`clubs.province\`), regular is ordinary club records. Club level is admin-only.`

- [ ] **Step 5: Commit (code only; CLAUDE.md is outside the repo, not committed).**
```bash
git add types/database.ts lib/csv-parser.ts components/CSVUploader.tsx components/RecordTable.tsx "app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx"
# include any other file Step 1/2 narrowed
git -c commit.gpgsign=false commit -m "Club level: narrow scope union to club|provincial|national (completeness check)"
```

- [ ] **Step 6: Remediation runbook (report to the user — operational, not code).** Document, for the user to execute: (1) apply `add_club_level.sql` + `widen_record_lists_scope.sql` to Supabase; (2) deploy `origin/main`; (3) via the new admin control, set the Canadian Masters club `level='national'`; (4) delete the 4 bad lists `Men/Women {LCM,SCM} National`; (5) re-bulk-upload the 4 `SNC/individual-csv/*_National.csv` into that club; (6) re-run the verification query — expect `scope='national'`, `with_age_group=total`, real `sample_bands`. Existing relay national lists were auto-migrated (`national_provincial→national`) — no action.

---

## Self-Review

**Spec coverage:** §1 schema → Task A (migrations) + Task B (types). §2 write side → Task C (all 4 sites + clubs-fetch). §3 parser 3-behaviour → Task B Step 4. §4 read-site `isNatProv`→`showHolderClub`/`showProvince` + public province heading → Tasks D (RecordTable/editor/CSVUploader) + E (PublicRecordSearch). §5 admin-only UI on the per-club admin page + route → Task F. §6 migration data-map (`national_provincial→national`) → Task A Step 2; remediation runbook → Task G Step 6. Non-goals (regular unchanged, relay identical, no prep/SNC change, no New-Club-form change) respected — none of those files are in scope. ✓

**Placeholder scan:** Parser block is complete code; UI splits give the exact mechanical transform (`{isNatProv && (<>C P</>)}` → `{showHolderClub && C}{showProvince && P}`) with the existing cells reused verbatim — no "TBD"/"handle X". The admin route/UI steps specify body shape, the exact update, and "mirror the upload route's auth" (a concrete, present reference). ✓

**Type consistency:** `scopeForClubLevel`/`ClubLevel`/`ListScope` (Task A) used in C; `showHolderClub = scope!=='club'`, `showProvince = scope==='national'(||'national_provincial')` identical across D & E; `Club.level`/`Club.province` (B) consumed by C/F; transitional superset union (B) kept through C–E and narrowed in G; parser `carriesAgeClub`/`carriesProvince` names self-consistent within Task B. Each task leaves `tsc` green; G's narrowing is the explicit completeness gate. ✓
