# Relay Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add relay records (4 swimmers, one entry per age group, club vs national/provincial scope) to Club Record, including schema, editing UI, CSV bulk-upload, public display, and CSVs generated from `SNC/Canadian Masters Records.xlsx`.

**Architecture:** Approach A from the spec — extend the existing `records` / `record_lists` tables with nullable relay columns and two list-level discriminators (`record_type`, `scope`). One code path; the history chain, flags, RLS, `RecordTable`, `CSVUploader`, and public display all extend rather than fork.

**Tech Stack:** Next.js 16 / React 19 / TypeScript (strict), Supabase (Postgres + RLS), Tailwind 4, PapaParse. Excel→CSV prep is standalone Python 3 (stdlib only).

---

## Verification Approach (read before starting)

This project has **no JavaScript test framework** (`CLAUDE.md`: "No test framework is configured"; there are zero test files). The TDD-heavy default of the writing-plans skill is adapted to the project's documented reality, consistent with how the prior `2026-05-15-last-updated-indicator` feature was verified:

- **TypeScript/React code** is verified by, in order: `npx tsc --noEmit` (strict typecheck), `npm run lint`, `npm run build`, then an explicit **manual checklist** exercising the flow in `npm run dev`. Do **not** introduce a JS test framework — it is not in the approved spec.
- **The Python prep script (Task 9) is genuinely test-driven** with the standard-library `unittest` runner (zero dependencies, no install). That is where bug-prone parsing/time-conversion lives and where TDD pays for itself.

Commands run from `club-record/` unless stated otherwise. **Migrations are applied to Supabase manually by the user** (same workflow as `add_updated_at_tracking.sql`); plan steps only write and verify the SQL text, they do not run it.

**Commit policy:** This working copy is not a git repo and the user controls git tightly. Each task ends with a **"Checkpoint"** step (stage-and-describe) instead of an automatic commit. If the user has initialized git and asked for commits, the Checkpoint step's `git` command applies; otherwise it is a no-op review point. Never `git push`.

---

## File Structure

**New files:**
- `club-record/supabase/migrations/add_relay_fields_to_record_lists.sql` — `record_type`, `scope`, widened `gender` CHECK.
- `club-record/supabase/migrations/add_relay_columns_to_records.sql` — 6 nullable relay columns.
- `club-record/supabase/migrations/add_standard_age_groups.sql` — new admin-editable table + seed.
- `club-record/supabase/migrations/add_kind_to_standard_events.sql` — `kind` column + relay-event seed.
- `SNC/relay-prep/xlsx_to_csv.py` — standalone Excel→CSV converter (stdlib).
- `SNC/relay-prep/test_xlsx_to_csv.py` — unittest tests for the converter.
- `SNC/relay-csv/*.csv` + `SNC/relay-csv/needs-review.txt` — generated output (Task 9 product).

**Modified files:**
- `club-record/types/database.ts` — extend `RecordList`, `SwimRecord`, `StandardEvent`; add `StandardAgeGroup`; register table.
- `club-record/lib/csv-parser.ts` — relay-aware `CSVRecord`, `parseRecordsCSV`, `generateCSVTemplate`.
- `club-record/components/CSVUploader.tsx` — relay props, relay template, relay preview columns.
- `club-record/components/RecordTable.tsx` — relay-mode editing (4 names, age group, club, province, datalists).
- `club-record/app/(dashboard)/dashboard/records/new/page.tsx` — record type / scope / mixed gender.
- `club-record/app/(dashboard)/dashboard/records/[listId]/page.tsx` — fetch standard sets, pass relay props, persist relay columns.
- `club-record/app/(dashboard)/dashboard/records/bulk-upload/page.tsx` — relay filename detection, relay insert.
- `club-record/app/admin/[clubId]/upload/page.tsx` — relay filename detection, relay payload.
- `club-record/app/api/admin/upload/route.ts` — relay fields in `RecordData`, list-create, inserts.
- `club-record/app/[clubSlug]/ClubRecordBrowser.tsx` — group label for `mixed`, pass list to search.
- `club-record/app/[clubSlug]/[recordSlug]/page.tsx` — pass list to search.
- `club-record/app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx` — relay columns (table + mobile).

**Out of scope (explicit):** the embed widget `app/embed/[clubSlug]/page.tsx` and the embed JSON route `app/api/clubs/[slug]/records/route.ts` (mirrors the last-updated spec's deferral of embed); no admin CRUD screen for `standard_age_groups` (edited directly in Supabase, exactly like `standard_events` today); `SCY` relays; any change to individual records.

---

## Task 1: Database migrations

**Files:**
- Create: `club-record/supabase/migrations/add_relay_fields_to_record_lists.sql`
- Create: `club-record/supabase/migrations/add_relay_columns_to_records.sql`
- Create: `club-record/supabase/migrations/add_standard_age_groups.sql`
- Create: `club-record/supabase/migrations/add_kind_to_standard_events.sql`

- [ ] **Step 1: Write `add_relay_fields_to_record_lists.sql`**

```sql
-- Add relay support to record_lists.
-- record_type: 'individual' (default, all existing lists) or 'relay'
-- scope: only meaningful for relay lists. 'club' = internal (no holding club);
--        'national_provincial' = each record carries a holding club + province.
ALTER TABLE record_lists
  ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (record_type IN ('individual', 'relay'));

ALTER TABLE record_lists
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'club'
    CHECK (scope IN ('club', 'national_provincial'));

-- Widen the existing gender CHECK to allow 'mixed' (relays only).
-- The original constraint from add_gender_to_record_lists.sql is unnamed;
-- Postgres auto-names it record_lists_gender_check.
ALTER TABLE record_lists DROP CONSTRAINT IF EXISTS record_lists_gender_check;
ALTER TABLE record_lists
  ADD CONSTRAINT record_lists_gender_check
    CHECK (gender IN ('male', 'female', 'mixed'));
```

- [ ] **Step 2: Write `add_relay_columns_to_records.sql`**

```sql
-- Relay-only columns on records. All nullable; populated only for rows in a
-- relay list. Leg-1 swimmer reuses the existing swimmer_name column.
ALTER TABLE records ADD COLUMN IF NOT EXISTS swimmer_name_2 TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS swimmer_name_3 TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS swimmer_name_4 TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS age_group TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS record_club TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS province TEXT;
```

- [ ] **Step 3: Write `add_standard_age_groups.sql`**

```sql
-- Admin-editable standard age-group bands (mirrors standard_events: it has no
-- admin UI either; edited directly in Supabase). Public-readable so the
-- relay editor's datalist can be populated with the anon key.
CREATE TABLE IF NOT EXISTS standard_age_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE standard_age_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "standard_age_groups public read" ON standard_age_groups;
CREATE POLICY "standard_age_groups public read"
  ON standard_age_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "standard_age_groups authenticated write" ON standard_age_groups;
CREATE POLICY "standard_age_groups authenticated write"
  ON standard_age_groups FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

INSERT INTO standard_age_groups (name, sort_order) VALUES
  ('72-99', 1),
  ('100-119', 2),
  ('120-159', 3),
  ('160-199', 4),
  ('200-239', 5),
  ('240-279', 6),
  ('280-319', 7),
  ('320-359', 8),
  ('360-399', 9)
ON CONFLICT (name) DO NOTHING;
```

- [ ] **Step 4: Write `add_kind_to_standard_events.sql`**

```sql
-- Tag standard_events so the relay editor's datalist can filter to relay names
-- without polluting individual-event suggestions.
ALTER TABLE standard_events
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'individual'
    CHECK (kind IN ('individual', 'relay'));

-- Seed relay event names. Guarded so re-running is safe even if there is no
-- UNIQUE constraint on standard_events.name.
INSERT INTO standard_events (name, sort_order, kind)
SELECT v.name, v.sort_order, 'relay'
FROM (VALUES
  ('4 X 50 Freestyle Relay', 1001),
  ('4 X 100 Freestyle Relay', 1002),
  ('4 X 50 Medley Relay', 1003),
  ('4 X 100 Medley Relay', 1004)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM standard_events e WHERE e.name = v.name AND e.kind = 'relay'
);
```

- [ ] **Step 5: Verify SQL is well-formed**

Run: `for f in supabase/migrations/add_relay_fields_to_record_lists.sql supabase/migrations/add_relay_columns_to_records.sql supabase/migrations/add_standard_age_groups.sql supabase/migrations/add_kind_to_standard_events.sql; do echo "== $f =="; cat "$f"; done`
Expected: all four files print, no shell errors. (Execution against Supabase is the user's manual step — note this in the handoff.)

- [ ] **Step 6: Checkpoint**

```bash
git add club-record/supabase/migrations/add_relay_fields_to_record_lists.sql club-record/supabase/migrations/add_relay_columns_to_records.sql club-record/supabase/migrations/add_standard_age_groups.sql club-record/supabase/migrations/add_kind_to_standard_events.sql
# commit only if the user manages this repo with git and asked for commits:
# git commit -m "Add relay-records migrations (record_lists, records, standard_age_groups, standard_events.kind)"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `club-record/types/database.ts`

- [ ] **Step 1: Extend `RecordList` (lines 30-39)**

Replace the `RecordList` interface body so it reads:

```ts
export interface RecordList {
  id: string;
  club_id: string;
  title: string;
  slug: string;
  course_type: "SCM" | "SCY" | "LCM";
  gender: "male" | "female" | "mixed" | null;
  record_type: "individual" | "relay";
  scope: "club" | "national_provincial";
  created_at: string;
  updated_at: string;  // DB-managed: set on insert, bumped by trigger on edit
}
```

- [ ] **Step 2: Extend `SwimRecord` (add after `swimmer_name` on line 45)**

Insert these six fields immediately after `swimmer_name: string;`:

```ts
  swimmer_name_2: string | null;
  swimmer_name_3: string | null;
  swimmer_name_4: string | null;
  age_group: string | null;
  record_club: string | null;
  province: string | null;
```

- [ ] **Step 3: Extend `StandardEvent` and add `StandardAgeGroup` (lines 69-73)**

Replace the `StandardEvent` interface and add the new interface after it:

```ts
export interface StandardEvent {
  id: number;
  name: string;
  sort_order: number;
  kind: "individual" | "relay";
}

export interface StandardAgeGroup {
  id: number;
  name: string;
  sort_order: number;
}
```

- [ ] **Step 4: Register `standard_age_groups` in the `Database` map**

After the `standard_events` block in `Database['public']['Tables']` (line 98-102), add:

```ts
      standard_age_groups: {
        Row: StandardAgeGroup;
        Insert: Omit<StandardAgeGroup, "id">;
        Update: Partial<Omit<StandardAgeGroup, "id">>;
      };
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors). Pre-existing lint backlog in `TODO.md` is unrelated; `tsc` should be clean.

- [ ] **Step 6: Checkpoint**

```bash
git add club-record/types/database.ts
# git commit -m "Type relay fields: RecordList, SwimRecord, StandardEvent.kind, StandardAgeGroup"
```

---

## Task 3: Relay-aware CSV parser

**Files:**
- Modify: `club-record/lib/csv-parser.ts`

- [ ] **Step 1: Extend `CSVRecord` (after `swimmer_name` on line 55)**

Insert into the `CSVRecord` interface, immediately after `swimmer_name: string;`:

```ts
  swimmer_name_2: string | null;
  swimmer_name_3: string | null;
  swimmer_name_4: string | null;
  age_group: string | null;
  record_club: string | null;
  province: string | null;
```

- [ ] **Step 2: Add a relay options type and column maps**

Directly above `export function parseRecordsCSV(` (line 76), add:

```ts
export interface RelayParseOptions {
  relay?: boolean;
  scope?: "club" | "national_provincial";
  /** Allowed standard age-group names; when provided, non-matching rows error. */
  allowedAgeGroups?: string[];
}
```

In the `columnMaps` object inside `parseRecordsCSV` (line 96-110), add `"name1"` to the **existing** `swimmer` alias array so the relay template's `Name1` header round-trips (the existing entry is `swimmer: ["swimmer", "swimmer_name", "swimmername", "name", "athlete"]` → make it `swimmer: ["swimmer", "swimmer_name", "swimmername", "name", "name1", "athlete"]`), then add these new entries (keep all existing ones):

```ts
    swimmer2: ["name2", "swimmer2", "swimmer_name_2", "name_2"],
    swimmer3: ["name3", "swimmer3", "swimmer_name_3", "name_3"],
    swimmer4: ["name4", "swimmer4", "swimmer_name_4", "name_4"],
    age_group: ["agegroup", "age_group", "age group", "age"],
    record_club: ["club", "record_club", "team"],
    province: ["province", "prov", "state"],
```

- [ ] **Step 3: Change the `parseRecordsCSV` signature and per-row logic**

Change the signature (line 76) to:

```ts
export function parseRecordsCSV(
  csvContent: string,
  relayOptions: RelayParseOptions = {}
): {
  records: CSVRecord[];
  errors: string[];
} {
```

Inside the `result.data.forEach((row, index) => {` loop, replace the existing block from `const event = findColumn(...)` through the `records.push({ ... });` call with:

```ts
    const event = findColumn(row, columnMaps.event);
    const time = findColumn(row, columnMaps.time);
    const swimmer = findColumn(row, columnMaps.swimmer);
    const date = findColumn(row, columnMaps.date);
    const location = findColumn(row, columnMaps.location);
    const is_national = findColumn(row, columnMaps.is_national);
    const is_current_national = findColumn(row, columnMaps.is_current_national);
    const is_provincial = findColumn(row, columnMaps.is_provincial);
    const is_current_provincial = findColumn(row, columnMaps.is_current_provincial);
    const is_split = findColumn(row, columnMaps.is_split);
    const is_relay_split = findColumn(row, columnMaps.is_relay_split);
    const is_new = findColumn(row, columnMaps.is_new);
    const is_world_record = findColumn(row, columnMaps.is_world_record);

    const isRelay = relayOptions.relay === true;
    const name2 = findColumn(row, columnMaps.swimmer2);
    const name3 = findColumn(row, columnMaps.swimmer3);
    const name4 = findColumn(row, columnMaps.swimmer4);
    const ageGroup = findColumn(row, columnMaps.age_group);
    const recordClub = findColumn(row, columnMaps.record_club);
    const province = findColumn(row, columnMaps.province);

    if (!event || !time || !swimmer) {
      errors.push(
        `Row ${index + 2}: Missing required field (event, time, or swimmer)`
      );
      return;
    }

    const time_ms = parseTimeToMs(time);
    if (time_ms === 0) {
      errors.push(`Row ${index + 2}: Invalid time format "${time}"`);
      return;
    }

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
      if (relayOptions.scope === "national_provincial") {
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
    }

    const isNatProv = isRelay && relayOptions.scope === "national_provincial";

    records.push({
      event_name: event.trim(),
      time_ms,
      swimmer_name: swimmer.trim(),
      swimmer_name_2: isRelay ? name2!.trim() : null,
      swimmer_name_3: isRelay ? name3!.trim() : null,
      swimmer_name_4: isRelay ? name4!.trim() : null,
      age_group: isRelay ? ageGroup!.trim() : null,
      record_club: isNatProv ? recordClub!.trim() : null,
      province: isNatProv ? province!.trim() : null,
      record_date: normalizeDate(date),
      location: location?.trim() || null,
      is_national: parseBoolean(is_national),
      is_current_national: parseBoolean(is_current_national),
      is_provincial: parseBoolean(is_provincial),
      is_current_provincial: parseBoolean(is_current_provincial),
      is_split: parseBoolean(is_split),
      is_relay_split: parseBoolean(is_relay_split),
      is_new: parseBoolean(is_new),
      is_world_record: parseBoolean(is_world_record),
    });
```

- [ ] **Step 4: Add relay variant to `generateCSVTemplate`**

Replace the entire `generateCSVTemplate` function (lines 178-182) with:

```ts
export interface RelayTemplateOptions {
  relay?: boolean;
  scope?: "club" | "national_provincial";
  ageGroups?: string[];
  relayEvents?: string[];
}

/**
 * Generate a CSV template string. Relay variant emits relay columns and one
 * blank row per age group per relay event (mirrors how the individual
 * sample CSV pre-fills events).
 */
export function generateCSVTemplate(options: RelayTemplateOptions = {}): string {
  if (!options.relay) {
    const headers = ["Event", "Time", "Swimmer", "Date", "Location", "is_World_Record", "is_National", "is_Current_National", "is_Provincial", "is_Current_Provincial", "is_Split", "is_RelaySplit", "is_New"];
    const exampleRow = ["50 Free", "24.56", "John Smith", "2024-03-15", "City Championships", "", "", "", "", "", "", "", ""];
    return [headers.join(","), exampleRow.join(",")].join("\n");
  }

  const natProv = options.scope === "national_provincial";
  const headers = [
    "Event", "AgeGroup", "Time", "Name1", "Name2", "Name3", "Name4",
    ...(natProv ? ["Club", "Province"] : []),
    "Date", "Location",
    "is_World_Record", "is_National", "is_Current_National",
    "is_Provincial", "is_Current_Provincial", "is_New",
  ];
  const events = options.relayEvents?.length
    ? options.relayEvents
    : ["4 X 50 Freestyle Relay"];
  const ageGroups = options.ageGroups?.length ? options.ageGroups : [""];
  const blanks = (natProv ? 8 : 6) + 0; // Time..is_New columns left blank
  const rows = events.flatMap((ev) =>
    ageGroups.map((ag) =>
      [ev, ag, ...Array(headers.length - 2).fill("")].join(",")
    )
  );
  void blanks;
  return [headers.join(","), ...rows].join("\n");
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (Callers in CSVUploader still compile because the new `parseRecordsCSV` second arg and the new `generateCSVTemplate` arg are optional — they are wired in Tasks 4-6.)

- [ ] **Step 6: Manual behavior check**

Run: `npm run dev`, then in any list editor open "Import CSV", click "Download CSV template", confirm the individual template is byte-identical to before this task (regression check). Stop the dev server.

- [ ] **Step 7: Checkpoint**

```bash
git add club-record/lib/csv-parser.ts
# git commit -m "csv-parser: relay columns, relay-mode validation, relay template"
```

---

## Task 4: Relay-aware `CSVUploader`

**Files:**
- Modify: `club-record/components/CSVUploader.tsx`

- [ ] **Step 1: Add relay props and thread them through**

Replace the `CSVUploaderProps` interface and the component signature/handlers (lines 6-39) so the props and `handleFile`/`downloadTemplate` become relay-aware:

```ts
interface CSVUploaderProps {
  onUpload: (records: CSVRecord[]) => void;
  relay?: boolean;
  scope?: "club" | "national_provincial";
  allowedAgeGroups?: string[];
  relayEvents?: string[];
}

export default function CSVUploader({
  onUpload,
  relay = false,
  scope = "club",
  allowedAgeGroups,
  relayEvents,
}: CSVUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<CSVRecord[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setErrors([]);
    setPreview(null);

    if (!file.name.endsWith(".csv")) {
      setErrors(["Please upload a CSV file"]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const { records, errors: parseErrors } = parseRecordsCSV(content, {
        relay,
        scope,
        allowedAgeGroups,
      });

      if (parseErrors.length > 0) {
        setErrors(parseErrors);
      }

      if (records.length > 0) {
        setPreview(records);
      }
    };
    reader.readAsText(file);
  };
```

- [ ] **Step 2: Make the template download relay-aware**

Replace `downloadTemplate` (lines 83-92) with:

```ts
  const downloadTemplate = () => {
    const content = generateCSVTemplate(
      relay
        ? { relay: true, scope, ageGroups: allowedAgeGroups, relayEvents }
        : {}
    );
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = relay ? "relay_records_template.csv" : "records_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
```

- [ ] **Step 3: Update the expected-columns hint and preview table for relay**

Replace the hint paragraph (lines 118-120) with:

```tsx
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          {relay
            ? scope === "national_provincial"
              ? "Expected columns: Event, AgeGroup, Time, Name1-Name4, Club, Province, Date, Location"
              : "Expected columns: Event, AgeGroup, Time, Name1-Name4, Date, Location"
            : "Expected columns: Event, Time, Swimmer, Date (optional), Location (optional)"}
        </p>
```

Replace the `<thead>` of the preview table (lines 154-160) with:

```tsx
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Event</th>
                  {relay && (
                    <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Age Group</th>
                  )}
                  <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Time</th>
                  <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">
                    {relay ? "Swimmers" : "Swimmer"}
                  </th>
                </tr>
              </thead>
```

Replace the preview `<tbody>` rows (lines 162-168) with:

```tsx
              <tbody>
                {preview.slice(0, 10).map((record, i) => (
                  <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="px-3 py-2 text-gray-900 dark:text-white">{record.event_name}</td>
                    {relay && (
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{record.age_group}</td>
                    )}
                    <td className="px-3 py-2 text-gray-900 dark:text-white">{record.time_ms}ms</td>
                    <td className="px-3 py-2 text-gray-900 dark:text-white">
                      {relay
                        ? [record.swimmer_name, record.swimmer_name_2, record.swimmer_name_3, record.swimmer_name_4].filter(Boolean).join(", ")
                        : record.swimmer_name}
                    </td>
                  </tr>
                ))}
              </tbody>
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: `tsc` PASS; lint shows only the pre-existing `TODO.md` backlog items, no new violations in `CSVUploader.tsx`.

- [ ] **Step 5: Checkpoint**

```bash
git add club-record/components/CSVUploader.tsx
# git commit -m "CSVUploader: relay mode (props, relay template, relay preview)"
```

---

## Task 5: List-creation form (record type / scope / mixed gender)

**Files:**
- Modify: `club-record/app/(dashboard)/dashboard/records/new/page.tsx`

- [ ] **Step 1: Add state for record type and scope; widen gender**

Replace the three state lines (21-23) with:

```tsx
  const [courseType, setCourseType] = useState<"LCM" | "SCM" | "SCY">("LCM");
  const [gender, setGender] = useState<"male" | "female" | "mixed">("male");
  const [recordType, setRecordType] = useState<"individual" | "relay">("individual");
  const [scope, setScope] = useState<"club" | "national_provincial">("club");
  const [error, setError] = useState<string | null>(null);
```

- [ ] **Step 2: Persist the new fields on insert**

Replace the `.insert({ ... })` object (lines 43-49) with:

```tsx
      .insert({
        club_id: selectedClub.id,
        title,
        slug,
        course_type: courseType,
        gender,
        record_type: recordType,
        scope: recordType === "relay" ? scope : "club",
      })
```

- [ ] **Step 3: Add the Record Type + conditional Scope selectors, and the Mixed option**

Immediately before the existing Course Type `<div>` (line 154, the `<div>` whose label is "Course Type"), insert:

```tsx
          <div>
            <label
              htmlFor="recordType"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Record Type
            </label>
            <select
              id="recordType"
              value={recordType}
              onChange={(e) => {
                const next = e.target.value as "individual" | "relay";
                setRecordType(next);
                if (next === "individual" && gender === "mixed") {
                  setGender("male");
                }
              }}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="individual">Individual</option>
              <option value="relay">Relay</option>
            </select>
          </div>

          {recordType === "relay" && (
            <div>
              <label
                htmlFor="scope"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Scope
              </label>
              <select
                id="scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as "club" | "national_provincial")}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="club">Club records (no holding club)</option>
                <option value="national_provincial">National &amp; Provincial (club + province)</option>
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                National/Provincial lists require a holding Club and Province on every record.
              </p>
            </div>
          )}
```

Replace the gender `<select>` element (lines 180-188) with:

```tsx
            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as "male" | "female" | "mixed")}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              {recordType === "relay" && <option value="mixed">Mixed</option>}
            </select>
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: `tsc` PASS; no new lint violations in `new/page.tsx`.

- [ ] **Step 5: Manual check**

`npm run dev` → `/dashboard/records/new`: switching Record Type to Relay reveals Scope and a Mixed gender option; switching back hides Scope and Mixed. Create one relay `national_provincial` list and confirm it lands on its detail page. Stop dev server.

- [ ] **Step 6: Checkpoint**

```bash
git add "club-record/app/(dashboard)/dashboard/records/new/page.tsx"
# git commit -m "New record list: record type, scope, mixed gender"
```

---

## Task 6: Single-list editor — fetch standard sets, pass relay props, persist relay columns

**Files:**
- Modify: `club-record/app/(dashboard)/dashboard/records/[listId]/page.tsx`

- [ ] **Step 1: Add state for the standard sets and widen edit-gender**

Replace line 31 (`const [editGender, ...]`) with:

```tsx
  const [editGender, setEditGender] = useState<"male" | "female" | "mixed">("male");
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [relayEvents, setRelayEvents] = useState<string[]>([]);
```

- [ ] **Step 2: Fetch the standard sets in `loadData`**

Inside `loadData`, immediately after the `records` fetch block (after line 58 `setRecords(recordsData as SwimRecord[]);` closing brace, before `setLoading(false);` on line 60), insert:

```tsx
    const { data: ageGroupData } = await supabase
      .from("standard_age_groups")
      .select("name")
      .order("sort_order", { ascending: true });
    if (ageGroupData) {
      setAgeGroups(ageGroupData.map((a) => a.name as string));
    }

    const { data: relayEventData } = await supabase
      .from("standard_events")
      .select("name")
      .eq("kind", "relay")
      .order("sort_order", { ascending: true });
    if (relayEventData) {
      setRelayEvents(relayEventData.map((e) => e.name as string));
    }
```

Also update line 47 to allow `mixed`:

```tsx
      setEditGender(listData.gender as "male" | "female" | "mixed" || "male");
```

- [ ] **Step 3: Persist relay columns when inserting new records**

In `handleSaveRecords`, in the new-records insert object (lines 84-102), add these keys (after `swimmer_name: r.swimmer_name,`):

```tsx
          swimmer_name_2: r.swimmer_name_2 ?? null,
          swimmer_name_3: r.swimmer_name_3 ?? null,
          swimmer_name_4: r.swimmer_name_4 ?? null,
          age_group: r.age_group ?? null,
          record_club: r.record_club ?? null,
          province: r.province ?? null,
```

- [ ] **Step 4: Persist relay columns when updating existing records**

In `handleSaveRecords`, in the existing-records update object (lines 147-162), add the same six keys after `swimmer_name: record.swimmer_name,`:

```tsx
          swimmer_name_2: record.swimmer_name_2 ?? null,
          swimmer_name_3: record.swimmer_name_3 ?? null,
          swimmer_name_4: record.swimmer_name_4 ?? null,
          age_group: record.age_group ?? null,
          record_club: record.record_club ?? null,
          province: record.province ?? null,
```

- [ ] **Step 5: Persist relay columns on CSV import**

In `handleCSVUpload`, in the insert map object (lines 215-233), add after `swimmer_name: r.swimmer_name,`:

```tsx
        swimmer_name_2: r.swimmer_name_2,
        swimmer_name_3: r.swimmer_name_3,
        swimmer_name_4: r.swimmer_name_4,
        age_group: r.age_group,
        record_club: r.record_club,
        province: r.province,
```

- [ ] **Step 6: Persist gender on list update; widen the edit gender select**

In `handleUpdateList`, the `.update({ ... })` already sets `title`/`course_type`/`gender` (lines 251-255) — no key change needed, but replace the edit-mode gender `<select>` (lines 343-350) with:

```tsx
              <select
                value={editGender}
                onChange={(e) => setEditGender(e.target.value as "male" | "female" | "mixed")}
                className="mt-1 block rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                {recordList?.record_type === "relay" && <option value="mixed">Mixed</option>}
              </select>
```

And replace the read-mode gender badge (lines 377-381) with one that renders `mixed`:

```tsx
                {recordList.gender && (
                  <span className="rounded bg-purple-100 px-2 py-0.5 text-sm font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                    {recordList.gender === "male" ? "Male" : recordList.gender === "female" ? "Female" : "Mixed"}
                  </span>
                )}
                {recordList.record_type === "relay" && (
                  <span className="rounded bg-teal-100 px-2 py-0.5 text-sm font-medium text-teal-700 dark:bg-teal-900 dark:text-teal-300">
                    Relay · {recordList.scope === "national_provincial" ? "Nat/Prov" : "Club"}
                  </span>
                )}
```

(Record type and scope are intentionally not editable after creation — changing them would orphan relay columns. Only title/course/gender remain editable, as today.)

- [ ] **Step 7: Pass relay props to `CSVUploader` and `RecordTable`**

Replace the `<CSVUploader onUpload={handleCSVUpload} />` (line 450) with:

```tsx
            <CSVUploader
              onUpload={handleCSVUpload}
              relay={recordList.record_type === "relay"}
              scope={recordList.scope}
              allowedAgeGroups={ageGroups}
              relayEvents={relayEvents}
            />
```

Replace the `<RecordTable ... />` block (lines 454-460) with:

```tsx
        <RecordTable
          records={records}
          onSave={handleSaveRecords}
          onDelete={handleDeleteRecord}
          readOnly={!canEdit}
          courseType={recordList.course_type as "LCM" | "SCM" | "SCY"}
          recordType={recordList.record_type}
          scope={recordList.scope}
          ageGroups={ageGroups}
          relayEvents={relayEvents}
        />
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL — `RecordTable` does not yet accept `recordType`/`scope`/`ageGroups`/`relayEvents`. This is expected; Task 7 adds them. (If any error is *not* about those four props, fix it before continuing.)

- [ ] **Step 9: Checkpoint**

```bash
git add "club-record/app/(dashboard)/dashboard/records/[listId]/page.tsx"
# git commit -m "List editor: fetch standard sets, persist relay columns, pass relay props"
```

---

## Task 7: `RecordTable` relay-mode editing

**Files:**
- Modify: `club-record/components/RecordTable.tsx`

- [ ] **Step 1: Add relay props**

Replace `RecordTableProps` (lines 21-28) with:

```ts
interface RecordTableProps {
  records: SwimRecord[];
  onSave: (records: EditableRecord[], historyUpdates?: HistoryFlagUpdate[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBreakRecord?: (oldRecordId: string, newRecordId: string) => Promise<void>;
  readOnly?: boolean;
  courseType?: "LCM" | "SCM" | "SCY";
  recordType?: "individual" | "relay";
  scope?: "club" | "national_provincial";
  ageGroups?: string[];
  relayEvents?: string[];
}
```

Replace the component signature (line 44) with:

```ts
export default function RecordTable({ records, onSave, onDelete, onBreakRecord, readOnly = false, courseType, recordType = "individual", scope = "club", ageGroups = [], relayEvents = [] }: RecordTableProps) {
  const isRelay = recordType === "relay";
  const isNatProv = isRelay && scope === "national_provincial";
```

- [ ] **Step 2: Carry relay fields through `mapRecordToEditable`**

In `mapRecordToEditable` (lines 70-88), add after `swimmer_name: r.swimmer_name,`:

```ts
    swimmer_name_2: r.swimmer_name_2,
    swimmer_name_3: r.swimmer_name_3,
    swimmer_name_4: r.swimmer_name_4,
    age_group: r.age_group,
    record_club: r.record_club,
    province: r.province,
```

- [ ] **Step 3: Default relay fields in `addRow`, `breakRecord`, `addStandardEvents`**

In all three constructors of `EditableRecord` (`addRow` lines 179-197, `breakRecord` lines 207-226, `addStandardEvents` lines 263-281), add after `swimmer_name: "",` (or `swimmer_name: ""` equivalent line):

```ts
      swimmer_name_2: null,
      swimmer_name_3: null,
      swimmer_name_4: null,
      age_group: null,
      record_club: null,
      province: null,
```

(In `addStandardEvents`, the object is inside a `.map`, so the keys go in the same place after `swimmer_name: "",`.)

- [ ] **Step 4: Replace `addStandardEvents` event source for relay lists**

In `addStandardEvents` (line 257), replace:

```ts
    const standardEvents = getStandardEvents(courseType);
```

with:

```ts
    const standardEvents = isRelay
      ? relayEvents.flatMap((ev) => ageGroups.map((ag) => ({ event: ev, ageGroup: ag })))
      : getStandardEvents(courseType).map((event) => ({ event, ageGroup: null as string | null }));
```

Then replace the dedupe + map block (lines 258-281) with:

```ts
    const existingKeys = new Set(
      editableRecords.map((r) => `${r.event_name.toLowerCase()}|${r.age_group ?? ""}`)
    );
    const newPairs = standardEvents.filter(
      ({ event, ageGroup }) =>
        !existingKeys.has(`${event.toLowerCase()}|${ageGroup ?? ""}`)
    );

    const newRecords: EditableRecord[] = newPairs.map(({ event, ageGroup }, i) => ({
      event_name: event,
      time_ms: 0,
      swimmer_name: "",
      swimmer_name_2: null,
      swimmer_name_3: null,
      swimmer_name_4: null,
      age_group: ageGroup,
      record_club: null,
      province: null,
      record_date: null,
      location: null,
      sort_order: editableRecords.length + i,
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
      isNew: true,
    }));
```

- [ ] **Step 5: Add hidden datalists for relay autocomplete**

Immediately inside the top-level returned `<div className="space-y-4">` (right after line 344 `<div className="space-y-4">`), add:

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

- [ ] **Step 6: Add relay header columns**

In `<thead>`, replace the `Event` and `Swimmer` header `<th>`s (lines 383-391) with:

```tsx
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Event
              </th>
              {isRelay && (
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Age Group
                </th>
              )}
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Time
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                {isRelay ? "Swimmers" : "Swimmer"}
              </th>
              {isNatProv && (
                <>
                  <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                    Club
                  </th>
                  <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                    Prov
                  </th>
                </>
              )}
```

- [ ] **Step 7: Add Age Group cell + Club/Prov cells; make Event use the datalist; make Swimmer a 4-name stack for relay**

In the main editable row, replace the Event `<td>` (lines 456-480) with a version that adds the datalist for relay, and add the Age Group `<td>` right after it:

```tsx
                    <td className="px-3 py-2">
                      {readOnly ? (
                        <div className="flex items-center gap-2">
                          {hasHistory && (
                            <button
                              type="button"
                              onClick={() => record.id && toggleHistoryExpanded(record.id)}
                              className="text-gray-400 hover:text-gray-600"
                              title={isExpanded ? "Hide history" : "Show history"}
                            >
                              {isExpanded ? "▼" : "▶"}
                            </button>
                          )}
                          <span className="px-2 py-1 text-sm text-gray-900 dark:text-white">{record.event_name}</span>
                        </div>
                      ) : (
                        <input
                          type="text"
                          list={isRelay ? "relay-events-list" : undefined}
                          value={record.event_name}
                          onChange={(e) => handleCellChange(index, "event_name", e.target.value)}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                          placeholder="Event name"
                        />
                      )}
                    </td>
                    {isRelay && (
                      <td className="px-3 py-2">
                        {readOnly ? (
                          <span className="px-2 py-1 text-sm text-gray-900 dark:text-white">{record.age_group || ""}</span>
                        ) : (
                          <input
                            type="text"
                            list="age-groups-list"
                            value={record.age_group || ""}
                            onChange={(e) => handleCellChange(index, "age_group", e.target.value)}
                            className="w-28 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                            placeholder="Age group"
                          />
                        )}
                      </td>
                    )}
```

Replace the Swimmer `<td>` (lines 504-516) with a relay-aware version, and add Club/Prov cells right after it:

```tsx
                    <td className="px-3 py-2">
                      {readOnly ? (
                        isRelay ? (
                          <div className="space-y-0.5">
                            {[record.swimmer_name, record.swimmer_name_2, record.swimmer_name_3, record.swimmer_name_4]
                              .filter((n) => n && n.trim())
                              .map((n, i) => (
                                <div key={i} className="px-2 text-sm text-gray-900 dark:text-white">{n}</div>
                              ))}
                          </div>
                        ) : (
                          <span className="px-2 py-1 text-sm text-gray-900 dark:text-white">{record.swimmer_name}</span>
                        )
                      ) : isRelay ? (
                        <div className="space-y-1">
                          {(["swimmer_name", "swimmer_name_2", "swimmer_name_3", "swimmer_name_4"] as const).map((field, leg) => (
                            <input
                              key={field}
                              type="text"
                              value={(record[field] as string | null) || ""}
                              onChange={(e) => handleCellChange(index, field, e.target.value)}
                              className="block w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                              placeholder={`Swimmer ${leg + 1}`}
                            />
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={record.swimmer_name}
                          onChange={(e) => handleCellChange(index, "swimmer_name", e.target.value)}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                          placeholder="Swimmer name"
                        />
                      )}
                    </td>
                    {isNatProv && (
                      <>
                        <td className="px-3 py-2">
                          {readOnly ? (
                            <span className="px-2 py-1 text-sm text-gray-900 dark:text-white">{record.record_club || ""}</span>
                          ) : (
                            <input
                              type="text"
                              value={record.record_club || ""}
                              onChange={(e) => handleCellChange(index, "record_club", e.target.value)}
                              className="w-24 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                              placeholder="Club"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {readOnly ? (
                            <span className="px-2 py-1 text-sm text-gray-900 dark:text-white">{record.province || ""}</span>
                          ) : (
                            <input
                              type="text"
                              value={record.province || ""}
                              onChange={(e) => handleCellChange(index, "province", e.target.value)}
                              className="w-16 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                              placeholder="Prov"
                            />
                          )}
                        </td>
                      </>
                    )}
```

- [ ] **Step 8: Add matching empty cells to the history sub-rows**

In the history row (lines 615-708), add an Age Group cell after the history Event `<td>` (after the `<td>` ending at line 630), and Club/Prov cells after the history Swimmer `<td>` (after line 640):

After the history Event `<td>` block, insert:

```tsx
                      {isRelay && (
                        <td className="px-3 py-2">
                          <span className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400">
                            {historyRecord.age_group || ""}
                          </span>
                        </td>
                      )}
```

After the history Swimmer `<td>` block, insert:

```tsx
                      {isNatProv && (
                        <>
                          <td className="px-3 py-2">
                            <span className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400">
                              {historyRecord.record_club || ""}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400">
                              {historyRecord.province || ""}
                            </span>
                          </td>
                        </>
                      )}
```

(The relay history swimmer cell can keep showing `historyRecord.swimmer_name` — leg 1 — for the compact history view; full 4-name expansion is not required for superseded relay rows.)

- [ ] **Step 9: Fix the empty-state `colSpan`**

Replace the empty-state `colSpan` expression (line 715) with one that accounts for the extra relay columns:

```tsx
                  colSpan={(readOnly ? 7 : 8) + (isRelay ? 1 : 0) + (isNatProv ? 2 : 0)}
```

- [ ] **Step 10: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: `tsc` PASS (Task 6's expected failure is now resolved); lint shows only the pre-existing backlog; `npm run build` succeeds.

- [ ] **Step 11: Manual check**

`npm run dev`. In the relay `national_provincial` list created in Task 5: click "+ Standard Events" — confirm rows appear for each relay event × age group; the row shows Event, Age Group, Time, four stacked Swimmer inputs, Club, Prov. Enter one full record (4 names, time `1:39.07`, age group `72-99`, club, prov), Save, reload, confirm it persisted. Repeat "+ Add Row" once. Create a `club`-scope relay list and confirm Club/Prov columns are absent. Confirm an individual list is visually unchanged. Stop dev server.

- [ ] **Step 12: Checkpoint**

```bash
git add club-record/components/RecordTable.tsx
# git commit -m "RecordTable: relay-mode editing (4 names, age group, club/prov, datalists)"
```

---

## Task 8: Public display of relay records

**Files:**
- Modify: `club-record/app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx`
- Modify: `club-record/app/[clubSlug]/[recordSlug]/page.tsx`
- Modify: `club-record/app/[clubSlug]/ClubRecordBrowser.tsx`

- [ ] **Step 1: Add relay props to `PublicRecordSearch`**

Replace the props interface and signature (lines 8-15) with:

```tsx
interface PublicRecordSearchProps {
  records: SwimRecord[];
  recordType?: "individual" | "relay";
  scope?: "club" | "national_provincial";
}

export default function PublicRecordSearch({
  records,
  recordType = "individual",
  scope = "club",
}: PublicRecordSearchProps) {
  const isRelay = recordType === "relay";
  const isNatProv = isRelay && scope === "national_provincial";
```

- [ ] **Step 2: Add relay headers (desktop table)**

In the `<thead>` (lines 113-129), replace the Event and Swimmer `<th>`s so the order is Event, [Age Group], Time, Swimmer(s), [Club, Prov], Date, Location:

```tsx
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Event
                </th>
                {isRelay && (
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                    Age Group
                  </th>
                )}
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isRelay ? "Swimmers" : "Swimmer"}
                </th>
                {isNatProv && (
                  <>
                    <th className="hidden px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 sm:table-cell">
                      Club
                    </th>
                    <th className="hidden px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 sm:table-cell">
                      Prov
                    </th>
                  </>
                )}
```

- [ ] **Step 3: Add relay cells (desktop current rows)**

In the main `<tr>` for `filteredRecords`, add the Age Group cell after the Event `<td>` (after line 154), and replace the Swimmer `<td>` (lines 163-165) plus add Club/Prov cells:

After the Event `<td>` (closing on line 154), insert:

```tsx
                      {isRelay && (
                        <td className="px-4 py-3 text-gray-900 dark:text-white">
                          {record.age_group || "-"}
                        </td>
                      )}
```

Replace the Swimmer `<td>` (lines 163-165) with:

```tsx
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
```

- [ ] **Step 4: Keep history sub-rows column-aligned (desktop)**

In the history `<tr>` (lines 173-198), add an Age Group cell after the history Event `<td>` (after line 180) and Club/Prov cells after the history Swimmer `<td>` (after line 191):

After the history Event `<td>`:

```tsx
                        {isRelay && (
                          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                            {historyRecord.age_group || "-"}
                          </td>
                        )}
```

After the history Swimmer `<td>`:

```tsx
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
```

- [ ] **Step 5: Fix the empty-state `colSpan` and mobile card body**

Replace the empty-state `colSpan={5}` (line 206) with:

```tsx
                    colSpan={5 + (isRelay ? 1 : 0) + (isNatProv ? 2 : 0)}
```

In the mobile card (lines 228-260), replace the swimmer line (line 250-252) with a relay-aware block and add age group/club/prov context:

```tsx
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {isRelay
                    ? [record.swimmer_name, record.swimmer_name_2, record.swimmer_name_3, record.swimmer_name_4]
                        .filter((n) => n && n.trim())
                        .join(", ")
                    : record.swimmer_name}
                </div>
                {isRelay && (record.age_group || isNatProv) && (
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                    {record.age_group}
                    {isNatProv && (record.record_club || record.province) && " • "}
                    {isNatProv && [record.record_club, record.province].filter(Boolean).join(", ")}
                  </div>
                )}
```

- [ ] **Step 6: Pass list info from the direct record page**

In `club-record/app/[clubSlug]/[recordSlug]/page.tsx`, replace the `<PublicRecordSearch records={typedRecords} />` (line 107) with:

```tsx
      <PublicRecordSearch
        records={typedRecords}
        recordType={typedRecordList.record_type}
        scope={typedRecordList.scope}
      />
```

- [ ] **Step 7: Pass list info from the club-page browser**

In `club-record/app/[clubSlug]/ClubRecordBrowser.tsx`, update the `getGroupLabel` to render `mixed` (lines 21-25):

```tsx
function getGroupLabel(courseType: string, gender: string | null): string {
  if (!gender) return courseType;
  const genderLabel =
    gender === "male" ? "Male" : gender === "female" ? "Female" : "Mixed";
  return `${courseType} ${genderLabel}`;
}
```

Replace `const GENDER_ORDER: Array<RecordList["gender"]> = ["male", "female"];` (line 18) with:

```tsx
const GENDER_ORDER: Array<RecordList["gender"]> = ["male", "female", "mixed"];
```

Replace the `<PublicRecordSearch records={records} />` (line 137) with:

```tsx
        <PublicRecordSearch
          records={records}
          recordType={selectedList?.record_type ?? "individual"}
          scope={selectedList?.scope ?? "club"}
        />
```

- [ ] **Step 8: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all PASS; lint shows only the pre-existing backlog.

- [ ] **Step 9: Manual check**

`npm run dev`. Visit `/<clubSlug>?list=<relay-natprov-slug>`: the public table shows Event, Age Group, Time, stacked Swimmers, Club, Prov, Date; the dropdown groups the relay list under e.g. "SCM Male"/"SCM Mixed". Visit the direct `/<clubSlug>/<relay-slug>` page — same columns. Resize to mobile width — card view shows the 4 names and age-group line. Confirm an individual list is visually unchanged. Stop dev server.

- [ ] **Step 10: Checkpoint**

```bash
git add club-record/app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx club-record/app/[clubSlug]/[recordSlug]/page.tsx club-record/app/[clubSlug]/ClubRecordBrowser.tsx
# git commit -m "Public display: relay columns + mixed-gender grouping"
```

---

## Task 9: Bulk-upload + admin-upload relay awareness

**Files:**
- Modify: `club-record/app/(dashboard)/dashboard/records/bulk-upload/page.tsx`
- Modify: `club-record/app/admin/[clubId]/upload/page.tsx`
- Modify: `club-record/app/api/admin/upload/route.ts`

- [ ] **Step 1: Extend `ParsedFile` + filename detection (bulk-upload)**

In `bulk-upload/page.tsx`, replace the `ParsedFile` interface and `parseFilename` (lines 10-48) with:

```tsx
interface ParsedFile {
  file: File;
  title: string;
  slug: string;
  courseType: "LCM" | "SCM" | "SCY";
  gender: "male" | "female" | "mixed" | null;
  recordType: "individual" | "relay";
  scope: "club" | "national_provincial";
  records: CSVRecord[];
  errors: string[];
}

function parseFilename(filename: string): {
  title: string;
  slug: string;
  courseType: "LCM" | "SCM" | "SCY";
  gender: "male" | "female" | "mixed" | null;
  recordType: "individual" | "relay";
  scope: "club" | "national_provincial";
} {
  const nameWithoutExt = filename.replace(/\.csv$/i, "");
  const title = nameWithoutExt.replace(/_/g, " ").trim();
  const slug = nameWithoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const upper = nameWithoutExt.toUpperCase();
  let courseType: "LCM" | "SCM" | "SCY" = "LCM";
  if (upper.includes("SCM")) courseType = "SCM";
  else if (upper.includes("SCY")) courseType = "SCY";
  else if (upper.includes("LCM")) courseType = "LCM";

  const lower = nameWithoutExt.toLowerCase();
  let gender: "male" | "female" | "mixed" | null = null;
  if (lower.includes("mixed")) gender = "mixed";
  else if (lower.includes("women") || lower.includes("female")) gender = "female";
  else if (lower.includes("men") || lower.includes("male")) gender = "male";

  const recordType: "individual" | "relay" = lower.includes("relay")
    ? "relay"
    : "individual";
  const scope: "club" | "national_provincial" =
    recordType === "relay" &&
    (lower.includes("national") || lower.includes("provincial") || lower.includes("canadian"))
      ? "national_provincial"
      : "club";

  return { title, slug, courseType, gender, recordType, scope };
}
```

- [ ] **Step 2: Use relay options when parsing + carry config (bulk-upload)**

Replace the `handleFileSelect` loop body (lines 64-77) with:

```tsx
    for (const file of Array.from(files)) {
      const content = await file.text();
      const { title, slug, courseType, gender, recordType, scope } = parseFilename(file.name);
      const { records, errors } = parseRecordsCSV(content, {
        relay: recordType === "relay",
        scope,
      });

      parsed.push({
        file,
        title,
        slug,
        courseType,
        gender,
        recordType,
        scope,
        records,
        errors,
      });
    }
```

- [ ] **Step 3: Persist list config + relay columns (bulk-upload)**

Replace the `record_lists` insert (lines 110-118) with:

```tsx
      const { data: listData, error: listError } = await supabase
        .from("record_lists")
        .insert({
          club_id: selectedClub.id,
          title: file.title,
          slug: file.slug,
          course_type: file.courseType,
          gender: file.gender,
          record_type: file.recordType,
          scope: file.recordType === "relay" ? file.scope : "club",
        })
        .select()
        .single();
```

Replace the `records` insert map object (lines 127-142) with:

```tsx
        file.records.map((r, idx) => ({
          record_list_id: listData.id,
          event_name: r.event_name,
          time_ms: r.time_ms,
          swimmer_name: r.swimmer_name,
          swimmer_name_2: r.swimmer_name_2,
          swimmer_name_3: r.swimmer_name_3,
          swimmer_name_4: r.swimmer_name_4,
          age_group: r.age_group,
          record_club: r.record_club,
          province: r.province,
          record_date: r.record_date,
          location: r.location,
          sort_order: idx,
          is_national: r.is_national,
          is_current_national: r.is_current_national,
          is_provincial: r.is_provincial,
          is_current_provincial: r.is_current_provincial,
          is_split: r.is_split,
          is_relay_split: r.is_relay_split,
          is_new: r.is_new,
        }))
```

- [ ] **Step 4: Apply the same three edits to the admin upload page**

In `club-record/app/admin/[clubId]/upload/page.tsx`: apply Step 1's `ParsedFile`/`parseFilename` replacement (lines 9-41) and Step 2's `handleFileSelect` loop replacement (lines 85-98) verbatim (same code). Then replace the `fetch("/api/admin/upload", …)` body's JSON (lines 132-152) with:

```tsx
          body: JSON.stringify({
            clubId: club.id,
            title: file.title,
            slug: file.slug,
            courseType: file.courseType,
            gender: file.gender,
            recordType: file.recordType,
            scope: file.recordType === "relay" ? file.scope : "club",
            records: file.records.map((r, idx) => ({
              event_name: r.event_name,
              time_ms: r.time_ms,
              swimmer_name: r.swimmer_name,
              swimmer_name_2: r.swimmer_name_2,
              swimmer_name_3: r.swimmer_name_3,
              swimmer_name_4: r.swimmer_name_4,
              age_group: r.age_group,
              record_club: r.record_club,
              province: r.province,
              record_date: r.record_date,
              location: r.location,
              sort_order: idx,
              is_national: r.is_national,
              is_current_national: r.is_current_national,
              is_provincial: r.is_provincial,
              is_current_provincial: r.is_current_provincial,
              is_split: r.is_split,
              is_relay_split: r.is_relay_split,
              is_new: r.is_new,
            })),
          }),
```

- [ ] **Step 5: Accept relay fields in the admin upload API route**

In `club-record/app/api/admin/upload/route.ts`, replace `RecordData` and `UploadRequest` (lines 5-27) with:

```ts
interface RecordData {
  event_name: string;
  time_ms: number;
  swimmer_name: string;
  swimmer_name_2: string | null;
  swimmer_name_3: string | null;
  swimmer_name_4: string | null;
  age_group: string | null;
  record_club: string | null;
  province: string | null;
  record_date: string | null;
  location: string | null;
  sort_order: number;
  is_national: boolean;
  is_current_national: boolean;
  is_provincial: boolean;
  is_current_provincial: boolean;
  is_split: boolean;
  is_relay_split: boolean;
  is_new: boolean;
}

interface UploadRequest {
  clubId: string;
  title: string;
  slug: string;
  courseType: "LCM" | "SCM" | "SCY";
  gender: "male" | "female" | "mixed" | null;
  recordType: "individual" | "relay";
  scope: "club" | "national_provincial";
  records: RecordData[];
}
```

Replace the destructure (line 47) with:

```ts
  const { clubId, title, slug, courseType, gender, recordType, scope, records } = body;
```

Replace the `record_lists` insert (lines 58-66) with:

```ts
    .from("record_lists")
    .insert({
      club_id: clubId,
      title,
      slug,
      course_type: courseType,
      gender: gender ?? null,
      record_type: recordType ?? "individual",
      scope: recordType === "relay" ? (scope ?? "club") : "club",
    })
    .select()
    .single();
```

Replace the `records` insert map (lines 74-89) with:

```ts
    records.map((r, idx) => ({
      record_list_id: listData.id,
      event_name: r.event_name,
      time_ms: r.time_ms,
      swimmer_name: r.swimmer_name,
      swimmer_name_2: r.swimmer_name_2,
      swimmer_name_3: r.swimmer_name_3,
      swimmer_name_4: r.swimmer_name_4,
      age_group: r.age_group,
      record_club: r.record_club,
      province: r.province,
      record_date: r.record_date,
      location: r.location,
      sort_order: idx,
      is_national: r.is_national,
      is_current_national: r.is_current_national,
      is_provincial: r.is_provincial,
      is_current_provincial: r.is_current_provincial,
      is_split: r.is_split,
      is_relay_split: r.is_relay_split,
      is_new: r.is_new,
    }))
```

- [ ] **Step 6: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all PASS; lint shows only the pre-existing backlog.

- [ ] **Step 7: Manual check**

`npm run dev`. Create a CSV named `Men_SCM_National_Relay.csv` with the relay national/provincial header (use the "Download CSV template" from a relay list to get it) and 2 valid rows. In `/dashboard/records/bulk-upload`, select it: the parsed-file card shows it parsed as relay; upload; open the created list and confirm 4 names + club + prov + age group persisted and display. Repeat via `/admin/<clubId>/upload`. Stop dev server.

- [ ] **Step 8: Checkpoint**

```bash
git add "club-record/app/(dashboard)/dashboard/records/bulk-upload/page.tsx" "club-record/app/admin/[clubId]/upload/page.tsx" club-record/app/api/admin/upload/route.ts
# git commit -m "Bulk/admin upload: relay filename detection + relay column persistence"
```

---

## Task 10: Excel → CSV prep script (test-driven, stdlib)

**Files:**
- Create: `SNC/relay-prep/xlsx_to_csv.py`
- Create: `SNC/relay-prep/test_xlsx_to_csv.py`
- Product: `SNC/relay-csv/*.csv`, `SNC/relay-csv/needs-review.txt`

Run all commands in this task from the repo root `/Users/jackso/code/ClubRecordProject`.

- [ ] **Step 1: Write the failing tests**

Create `SNC/relay-prep/test_xlsx_to_csv.py`:

```python
import unittest
from xlsx_to_csv import excel_fraction_to_time, collapse_blocks, route_filename


class TimeConversion(unittest.TestCase):
    def test_4x50_free_men_72_99(self):
        # 1.1466435185185184e-3 day -> 99.07 s -> "1:39.07"
        self.assertEqual(excel_fraction_to_time(1.1466435185185184e-3), "1:39.07")

    def test_sub_minute(self):
        # 0.0003 day -> 25.92 s -> "25.92"
        self.assertEqual(excel_fraction_to_time(0.0003), "25.92")

    def test_blank(self):
        self.assertEqual(excel_fraction_to_time(None), "")


class BlockCollapsing(unittest.TestCase):
    def test_four_rows_into_one_record(self):
        rows = [
            {"age": "72-99", "name": "R.KOPINSKI", "club": "TECH", "prov": "ON",
             "meet": "Winterlude", "loc": "NEP", "date": "2018-03", "time": 1.1466435185185184e-3},
            {"age": "", "name": "C.VALCIC", "club": "", "prov": "",
             "meet": "", "loc": "", "date": "", "time": None},
            {"age": "", "name": "E.BRAULT", "club": "", "prov": "",
             "meet": "", "loc": "", "date": "", "time": None},
            {"age": "", "name": "R.HANNA", "club": "", "prov": "",
             "meet": "", "loc": "", "date": "", "time": None},
        ]
        recs, review = collapse_blocks(rows, "4 X 50 Freestyle Relay")
        self.assertEqual(len(recs), 1)
        r = recs[0]
        self.assertEqual(r["age_group"], "72-99")
        self.assertEqual(
            [r["name1"], r["name2"], r["name3"], r["name4"]],
            ["R.KOPINSKI", "C.VALCIC", "E.BRAULT", "R.HANNA"],
        )
        self.assertEqual(r["time"], "1:39.07")
        self.assertEqual(r["club"], "TECH")
        self.assertEqual(r["province"], "ON")
        self.assertEqual(review, [])

    def test_blank_province_goes_to_review(self):
        rows = [
            {"age": "120-159", "name": "S.DRINNAN", "club": "EMSC", "prov": "",
             "meet": "WMG", "loc": "EDM", "date": "2005-07", "time": 1.3e-3},
            {"age": "", "name": "NATYWAY", "club": "", "prov": "", "meet": "", "loc": "", "date": "", "time": None},
            {"age": "", "name": "G.MCGINNIS", "club": "", "prov": "", "meet": "", "loc": "", "date": "", "time": None},
            {"age": "", "name": "D.YOUNGER", "club": "", "prov": "", "meet": "", "loc": "", "date": "", "time": None},
        ]
        recs, review = collapse_blocks(rows, "4 X 50 Freestyle Relay")
        self.assertEqual(recs, [])
        self.assertEqual(len(review), 1)
        self.assertIn("province", review[0].lower())


class FilenameRouting(unittest.TestCase):
    def test_routes(self):
        self.assertEqual(
            route_filename("Men's 4 X 50 Freestyle Relay SC", "SC"),
            ("Men", "SCM"),
        )
        self.assertEqual(
            route_filename("Women's 4 X 50 Freestyle Relay LC", "LC"),
            ("Women", "LCM"),
        )
        self.assertEqual(
            route_filename("Mixed 4 X 50 Freestyle Relay SC", "SC"),
            ("Mixed", "SCM"),
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd SNC/relay-prep && python3 -m unittest -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'xlsx_to_csv'`.

- [ ] **Step 3: Write `SNC/relay-prep/xlsx_to_csv.py`**

```python
"""Convert SNC/Canadian Masters Records.xlsx relay sheets to upload-ready CSVs.

Standalone delivery tooling (stdlib only). Not part of the Next.js app.
Output: SNC/relay-csv/<gender>-<course>-relays.csv (national_provincial
relay template) + SNC/relay-csv/needs-review.txt.
"""
import csv
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
HERE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(HERE, "..", "Canadian Masters Records.xlsx")
OUT_DIR = os.path.join(HERE, "..", "relay-csv")

HEADER = [
    "Event", "AgeGroup", "Time", "Name1", "Name2", "Name3", "Name4",
    "Club", "Province", "Date", "Location",
    "is_World_Record", "is_National", "is_Current_National",
    "is_Provincial", "is_Current_Provincial", "is_New",
]


def excel_fraction_to_time(frac):
    if frac is None or frac == "":
        return ""
    total = float(frac) * 86400.0
    total_hundredths = round(total * 100)          # integer; no float carry
    minutes = total_hundredths // 6000
    rem = total_hundredths % 6000
    whole = rem // 100
    hundredths = rem % 100
    if minutes == 0:
        return f"{whole}.{hundredths:02d}"
    return f"{minutes}:{whole:02d}.{hundredths:02d}"


def route_filename(section_title, course_code):
    t = section_title.lower()
    if "mixed" in t:
        gender = "Mixed"
    elif "women" in t or "femme" in t:
        gender = "Women"
    else:
        gender = "Men"
    course = "SCM" if course_code.upper() == "SC" else "LCM"
    return gender, course


def collapse_blocks(rows, event_name):
    """rows: list of dicts with keys age,name,club,prov,meet,loc,date,time.
    A new block starts on a row with a non-empty age. Returns (records, review)."""
    records = []
    review = []
    block = []

    def flush(b):
        if not b:
            return
        head = b[0]
        names = [r["name"].strip() for r in b if r["name"].strip()]
        age = head["age"].strip()
        time = excel_fraction_to_time(head["time"])
        club = head["club"].strip()
        prov = head["prov"].strip()
        problems = []
        if len(names) < 4:
            problems.append(f"only {len(names)} swimmer name(s)")
        if len(names) > 4:
            problems.append(f"{len(names)} swimmer names (expected 4)")
        if not age:
            problems.append("missing age group")
        if not time:
            problems.append("missing/invalid time")
        if not club:
            problems.append("missing club")
        if not prov:
            problems.append("missing province")
        if problems:
            review.append(
                f"{event_name} | age='{age}' names={names} club='{club}' "
                f"prov='{prov}': " + "; ".join(problems)
            )
            return
        records.append({
            "event": event_name, "age_group": age, "time": time,
            "name1": names[0], "name2": names[1], "name3": names[2], "name4": names[3],
            "club": club, "province": prov,
            "date": head["date"].strip(), "location": head["loc"].strip(),
        })

    for row in rows:
        if row["age"].strip() and block:
            flush(block)
            block = []
        block.append(row)
    flush(block)
    return records, review


def _shared_strings(z):
    out = []
    with z.open("xl/sharedStrings.xml") as f:
        root = ET.parse(f).getroot()
    for si in root.findall(NS + "si"):
        out.append("".join(n.text or "" for n in si.iter(NS + "t")))
    return out


def _col_row(ref):
    m = re.match(r"([A-Z]+)(\d+)", ref)
    col, n = m.group(1), 0
    for c in col:
        n = n * 26 + (ord(c) - 64)
    return n - 1, int(m.group(2))


def _sheet_grid(z, path, ss):
    with z.open(path) as f:
        root = ET.parse(f).getroot()
    sd = root.find(NS + "sheetData")
    grid = {}
    for r in sd.findall(NS + "row"):
        for c in r.findall(NS + "c"):
            ci, ri = _col_row(c.get("r"))
            t = c.get("t")
            v = c.find(NS + "v")
            isn = c.find(NS + "is")
            if t == "s" and v is not None:
                val = ss[int(v.text)]
            elif t == "inlineStr" and isn is not None:
                val = "".join(n.text or "" for n in isn.iter(NS + "t"))
            elif v is not None:
                val = v.text
            else:
                val = ""
            grid.setdefault(ri, {})[ci] = val
    return grid


def _parse_relay_sheet(grid):
    """Yield (event_name, [row dicts]) per event section in a relay sheet."""
    max_row = max(grid) if grid else 0
    cur_event = None
    buf = []
    sections = []
    for ri in range(1, max_row + 1):
        row = grid.get(ri, {})
        cells = [str(row.get(ci, "") or "") for ci in range(9)]
        a = cells[0].strip()
        # Section title row: column A holds the event name, rest blank.
        if a and "relay" in a.lower():
            if cur_event and buf:
                sections.append((cur_event, buf))
            cur_event = _normalize_event(a)
            buf = []
            continue
        if a.upper().startswith("AGE GROUP"):
            continue
        if cur_event is None:
            continue
        # Data row (age row or name-only continuation row).
        if any(c.strip() for c in cells):
            buf.append({
                "age": cells[0], "name": cells[1], "club": cells[2],
                "prov": cells[3], "meet": cells[4], "loc": cells[5],
                "date": cells[6],
                "time": cells[7] if cells[7].strip() else None,
            })
    if cur_event and buf:
        sections.append((cur_event, buf))
    return sections


def _normalize_event(title):
    # "Men's 4 X 50 Freestyle Relay SC - 4 X 50 Libre Relais Hommes PB" ->
    # "4 X 50 Freestyle Relay"
    english = title.split(" - ")[0]
    m = re.search(r"(4\s*X\s*\d+\s+\w+\s+Relay)", english, re.IGNORECASE)
    return m.group(1).strip() if m else english.strip()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    z = zipfile.ZipFile(XLSX)
    ss = _shared_strings(z)
    # rId5 -> sheet5 = RELAYS SC; rId6 -> sheet6 = RELAYS LC (from workbook rels)
    sheets = {"SC": "xl/worksheets/sheet5.xml", "LC": "xl/worksheets/sheet6.xml"}
    bucket = {}  # (gender, course) -> list of record dicts
    all_review = []
    for course_code, path in sheets.items():
        grid = _sheet_grid(z, path, ss)
        for event_name, rows in _parse_relay_sheet(grid):
            gender, course = route_filename(event_name + " " + course_code, course_code)
            # gender from the section title itself, not the synthesized string:
            gender, course = route_filename(_section_gender_hint(grid, event_name) or event_name, course_code)
            recs, review = collapse_blocks(rows, event_name)
            all_review.extend(f"[{gender} {course}] {r}" for r in review)
            bucket.setdefault((gender, course), []).extend(recs)
    for (gender, course), recs in sorted(bucket.items()):
        # "national" token => bulk-upload parseFilename infers
        # scope=national_provincial (Canadian Masters relays carry club+province).
        fname = f"{gender.lower()}-{course.lower()}-national-relays.csv"
        with open(os.path.join(OUT_DIR, fname), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(HEADER)
            for r in recs:
                w.writerow([
                    r["event"], r["age_group"], r["time"],
                    r["name1"], r["name2"], r["name3"], r["name4"],
                    r["club"], r["province"], r["date"], r["location"],
                    "", "", "", "", "", "",
                ])
        print(f"wrote {fname}: {len(recs)} records")
    with open(os.path.join(OUT_DIR, "needs-review.txt"), "w") as f:
        f.write("\n".join(all_review) + ("\n" if all_review else ""))
    print(f"needs-review.txt: {len(all_review)} flagged blocks")


def _section_gender_hint(grid, event_name):
    # The section title cell already contains "Men's"/"Women's"/"Mixed".
    return event_name


if __name__ == "__main__":
    main()
```

> Note: `route_filename` keys off the words `mixed`/`women`/`men` in the section title. `_parse_relay_sheet` keeps the original section title for gender detection by passing the raw title text; `_normalize_event` strips it to the clean event name stored in CSV. If gender detection proves wrong against the real file (Step 6), adjust `_parse_relay_sheet` to retain the raw title alongside the normalized event and pass the raw title to `route_filename`.

- [ ] **Step 4: Run the tests to green**

Run: `cd SNC/relay-prep && python3 -m unittest -v`
Expected: PASS — all tests in `TimeConversion`, `BlockCollapsing`, `FilenameRouting` pass.

- [ ] **Step 5: Generate the CSVs**

Run: `cd SNC/relay-prep && python3 xlsx_to_csv.py`
Expected: prints one `wrote <gender>-<course>-relays.csv: N records` line per produced file and a `needs-review.txt: M flagged blocks` line.

- [ ] **Step 6: Inspect the output**

Run: `cd SNC/relay-csv && head -3 *.csv && echo "--- review ---" && cat needs-review.txt`
Expected: each CSV starts with the relay header then real records (4 names, age group, club, prov, `M:SS.hh` time); `needs-review.txt` lists the known messy source rows (e.g. the EMSC blank-province women's LC block). Manually confirm gender/course filenames match the sheet sections; if not, apply the adjustment noted in Step 3.

- [ ] **Step 7: Checkpoint**

```bash
git add SNC/relay-prep/xlsx_to_csv.py SNC/relay-prep/test_xlsx_to_csv.py SNC/relay-csv
# git commit -m "Prep script: Canadian Masters xlsx -> relay upload CSVs (+ needs-review)"
```

---

## Task 11: Full verification + docs

**Files:**
- Modify: `CLAUDE.md` (Architecture / Database sections)

- [ ] **Step 1: Whole-app verification**

Run: `cd club-record && npx tsc --noEmit && npm run lint && npm run build`
Expected: `tsc` clean; lint shows only the pre-existing `TODO.md` backlog (no new IDs); production build succeeds.

- [ ] **Step 2: End-to-end manual smoke**

`npm run dev`. Walk: (a) create a relay national/provincial list; (b) "+ Standard Events" then fill one row, Save, reload — persists; (c) bulk-upload one generated `SNC/relay-csv/*.csv` to a new club-scope relay list and a national/provincial relay list; (d) view both on the public club page and direct record page (desktop + mobile widths); (e) confirm one pre-existing individual list is byte-for-byte unchanged in editor and public view. Stop dev server.

- [ ] **Step 3: Update `CLAUDE.md`**

In the `### Database` section, after the `Permission model` paragraph, add:

```md
**Relay records**: A `record_list` has `record_type` (`individual` | `relay`) and
`scope` (`club` | `national_provincial`). Relay rows reuse `records` with
nullable `swimmer_name_2/3/4`, `age_group`, `record_club`, `province` (leg 1 =
`swimmer_name`). `national_provincial` lists require club + province per record;
`club` scope does not. Standard age-group bands live in the admin-editable
`standard_age_groups` table; relay event names are `standard_events` rows with
`kind='relay'`. Gender allows `mixed` for relay lists.
```

In the `## Environment Variables` area is unaffected. In the `### Utilities` list, no change. Add to the `Key Abstractions` note for `RecordTable` the clause: "— relay lists render 4 swimmer inputs, an age-group cell, and (national/provincial scope) club/province cells."

- [ ] **Step 4: Final checkpoint**

```bash
git add CLAUDE.md
# git commit -m "Docs: relay records model in CLAUDE.md"
```

---

## Self-Review

**Spec coverage:**
- Schema (record_lists.record_type/scope, mixed gender, records relay cols, standard_age_groups, standard_events.kind) → Task 1; types → Task 2. ✓
- Validation/semantics (4 names, age-group in standard set, club+province for national_provincial, individual untouched) → Task 3 (parser) + Task 7 (editor) + Task 1 (CHECKs). ✓
- CSV format + parser + relay template + upload UI → Tasks 3, 4, 9. ✓
- List creation (record type/scope/mixed) → Task 5; editor persistence + standard-set fetch → Task 6; RecordTable relay editing → Task 7. ✓
- Public display (PublicRecordSearch + direct page + browser, mixed grouping) → Task 8. ✓
- Excel→CSV deliverable + needs-review → Task 10. ✓
- Course mapping SC→SCM / LC→LCM → Task 10 `route_filename`. ✓
- Out-of-scope items (embed, no age-group admin CRUD, SCY, individual unchanged) stated in File Structure. ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" steps; every code step carries complete code; the one conditional adjustment (prep-script gender detection) is fully specified with the exact fallback. ✓

**Type consistency:** `RecordList.record_type`/`scope`, `SwimRecord.swimmer_name_2/3/4`/`age_group`/`record_club`/`province`, `StandardEvent.kind`, `StandardAgeGroup`, `RelayParseOptions`, `RelayTemplateOptions`, and the `relay`/`scope`/`ageGroups`/`relayEvents` prop names are used identically across Tasks 2–9. The `parseRecordsCSV(content, relayOptions)` signature added in Task 3 matches every call site updated in Tasks 4 and 9. ✓
