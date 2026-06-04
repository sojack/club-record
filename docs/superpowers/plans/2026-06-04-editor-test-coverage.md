# Editor + Bulk-Upload Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add representative characterization tests for `RecordTable`, the `[listId]` list editor, and the bulk-upload page, on the existing jsdom + RTL foundation.

**Architecture:** `RecordTable` is presentational (props `records` + `onSave`/`onDelete`), tested in isolation with `vi.fn()` callbacks — no Supabase. The two page components are tested like the existing page tests: `vi.mock` of `@/lib/supabase/client`, `@/contexts/ClubContext`, `next/navigation`, wired via `@/lib/test/supabase-mock`. No production code changes; no refactor.

**Tech Stack:** Vitest 4, React Testing Library, `@testing-library/user-event`, jsdom.

**Spec:** `docs/superpowers/specs/2026-06-04-editor-test-coverage-design.md`

**Conventions for every task:**
- Run commands from `/Users/jackso/code/ClubRecordProject/club-record`.
- These characterize EXISTING behavior — a new test should PASS on first run. A failure means the test/selector is wrong (read the component and adjust the selector/assertion only — never change production code or weaken intent).
- Each new `.test.tsx` starts with `// @vitest-environment jsdom`.
- **Commits are LOCAL ONLY. Never `git push`.** No `Co-Authored-By` trailer.
- Lint is now a hard gate (`eslint . --max-warnings 0`) — test files must add no unused imports/vars.

---

## File Structure

| File | Change |
|------|--------|
| `components/RecordTable.test.tsx` | **Create** — isolated component tests |
| `app/(dashboard)/dashboard/records/[listId]/page.test.tsx` | **Create** — list-editor page |
| `app/(dashboard)/dashboard/records/bulk-upload/page.test.tsx` | **Create** — bulk-upload page |
| `TECH_DEBT.md` | Update High #1 progress |

---

## Task 1: `components/RecordTable.test.tsx`

**Files:**
- Create: `components/RecordTable.test.tsx`

Known DOM handles (verified against the component): toolbar buttons `+ Add Row`, `+ Standard Events`, `Save Changes` (appears only after an edit sets `hasChanges`); per-row remove button text `Remove`; input placeholders `Event name`, `0:00.00`, `Swimmer name` (individual) / `Swimmer 1`..`Swimmer 4` (relay), `Prov` (national scope). Time input value: while focused it shows `String(time_ms)`, otherwise `formatMsToTime(time_ms)` (or empty when 0).

- [ ] **Step 1: Write the test file**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SwimRecord } from "@/types/database";
import RecordTable from "./RecordTable";

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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("RecordTable", () => {
  it("renders a record's event and swimmer values", () => {
    render(<RecordTable records={[rec()]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" />);
    expect(screen.getByDisplayValue("50 Free")).toBeInTheDocument();
    expect(screen.getByDisplayValue("John Smith")).toBeInTheDocument();
  });

  it("formats a record's time via time-utils", () => {
    render(<RecordTable records={[rec({ time_ms: 24560 })]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" />);
    expect(screen.getByDisplayValue("24.56")).toBeInTheDocument();
  });

  it("excludes empty-event rows from the onSave payload", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RecordTable records={[rec({ id: "r1", event_name: "50 Free" })]} onSave={onSave} onDelete={vi.fn()} courseType="SCM" />);

    // Add an empty row (also flips hasChanges so Save Changes appears).
    await userEvent.click(screen.getByRole("button", { name: "+ Add Row" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload).toHaveLength(1);
    expect(payload[0].event_name).toBe("50 Free");
  });

  it("adds an editable row on '+ Add Row'", async () => {
    render(<RecordTable records={[rec()]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" />);
    expect(screen.getAllByPlaceholderText("Event name")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "+ Add Row" }));
    expect(screen.getAllByPlaceholderText("Event name")).toHaveLength(2);
  });

  it("calls onDelete for a persisted row's Remove", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<RecordTable records={[rec({ id: "r1" })]} onSave={vi.fn()} onDelete={onDelete} courseType="SCM" />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onDelete).toHaveBeenCalledWith("r1");
  });

  it("does not call onDelete when removing a brand-new unsaved row", async () => {
    const onDelete = vi.fn();
    render(<RecordTable records={[]} onSave={vi.fn()} onDelete={onDelete} courseType="SCM" />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add Row" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("parses a typed time on blur", async () => {
    render(<RecordTable records={[rec({ time_ms: 0 })]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" />);
    const timeInput = screen.getByPlaceholderText("0:00.00");
    await userEvent.click(timeInput);
    await userEvent.clear(timeInput);
    await userEvent.type(timeInput, "1:02.50");
    await userEvent.tab(); // blur
    expect(timeInput).toHaveValue("1:02.50");
  });

  it("hides editing controls in readOnly mode", () => {
    render(<RecordTable records={[rec()]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" readOnly />);
    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add Row" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("renders 4 swimmer inputs for a relay list", () => {
    render(
      <RecordTable
        records={[rec({ swimmer_name: "A", swimmer_name_2: "B", swimmer_name_3: "C", swimmer_name_4: "D", age_group: "13-14", event_name: "4x50 Free" })]}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        courseType="SCM"
        recordType="relay"
        ageGroups={["13-14"]}
        relayEvents={["4x50 Free"]}
      />
    );
    expect(screen.getByPlaceholderText("Swimmer 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Swimmer 4")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Swimmer name")).not.toBeInTheDocument();
  });

  it("renders a province input for national scope", () => {
    render(<RecordTable records={[rec({ province: "ON" })]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" scope="national" />);
    expect(screen.getByPlaceholderText("Prov")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run components/RecordTable.test.tsx`
Expected: 10 passed. If a selector fails, read `components/RecordTable.tsx` and adjust ONLY the selector/assertion (e.g. exact placeholder/button text). Do not change the component. (If the "parses a typed time on blur" test proves flaky due to the focused-input `String(time_ms)` binding, keep the `clear()` before `type()`; that is what neutralises the initial value.)

- [ ] **Step 3: Commit**

```bash
git add components/RecordTable.test.tsx
git commit -m "test(records): characterization tests for RecordTable"
```

---

## Task 2: `app/(dashboard)/dashboard/records/[listId]/page.test.tsx`

**Files:**
- Create: `app/(dashboard)/dashboard/records/[listId]/page.test.tsx`

The page's `loadData` reads `record_lists` (`.maybeSingle()`), `records`, `standard_age_groups`, `standard_events`. It renders the embedded `RecordTable`. `canEdit` (from `useClub`) gates the Edit/Delete header buttons. The delete flow: click header `Delete` → confirm modal ("Are you sure…") → click the modal's `Delete` → `handleDeleteList` deletes `record_lists` and `router.push("/dashboard/records")`.

- [ ] **Step 1: Write the test file**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/contexts/ClubContext", () => ({ useClub: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn(), useParams: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import { useRouter, useParams } from "next/navigation";
import { makeSupabase, pgError } from "@/lib/test/supabase-mock";
import ListDetailPage from "./page";

const club = { id: "club-1", slug: "uac", short_name: "UAC", full_name: "Uptown Aquatic Club", logo_url: null };

const listRow = {
  id: "list-1",
  club_id: "club-1",
  title: "SCM Male Records",
  slug: "scm-male",
  course_type: "SCM",
  gender: "male",
  record_type: "individual",
  scope: "club",
  updated_at: "2026-01-01T00:00:00Z",
};

const recordRow = {
  id: "r1",
  record_list_id: "list-1",
  event_name: "50 Free",
  time_ms: 24560,
  swimmer_name: "John Smith",
  swimmer_name_2: null, swimmer_name_3: null, swimmer_name_4: null,
  age_group: null, record_club: null, province: null,
  record_date: null, location: null, sort_order: 0,
  is_national: false, is_current_national: false, is_provincial: false,
  is_current_provincial: false, is_split: false, is_relay_split: false,
  is_new: false, is_world_record: false, superseded_by: null, is_current: true,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

const push = vi.fn();

function mockClient(sb: ReturnType<typeof makeSupabase>) {
  vi.mocked(createClient).mockReturnValue(sb as unknown as ReturnType<typeof createClient>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  push.mockClear();
  vi.mocked(useRouter).mockReturnValue({ push, refresh: vi.fn() } as unknown as ReturnType<typeof useRouter>);
  vi.mocked(useParams).mockReturnValue({ listId: "list-1" } as unknown as ReturnType<typeof useParams>);
  vi.mocked(useClub).mockReturnValue({
    selectedClub: club, setSelectedClub: vi.fn(), isLoading: false,
    isOwner: true, isEditor: false, canEdit: true,
  } as unknown as ReturnType<typeof useClub>);
});

describe("ListDetailPage", () => {
  it("renders the list and its records on a successful load", async () => {
    mockClient(makeSupabase({
      record_lists: { data: listRow, error: null },
      records: { data: [recordRow], error: null },
      standard_age_groups: { data: [], error: null },
      standard_events: { data: [], error: null },
    }));

    render(<ListDetailPage />);

    expect(await screen.findByText("SCM Male Records")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("John Smith")).toBeInTheDocument();
  });

  it("shows LoadError when the list read errors", async () => {
    mockClient(makeSupabase({
      record_lists: { data: null, error: pgError },
      records: { data: [], error: null },
    }));

    render(<ListDetailPage />);

    expect(await screen.findByText("We couldn't load this right now. Please try again.")).toBeInTheDocument();
  });

  it("shows 'Record list not found' when the list genuinely does not exist", async () => {
    mockClient(makeSupabase({
      record_lists: { data: null, error: null },
      records: { data: [], error: null },
      standard_age_groups: { data: [], error: null },
      standard_events: { data: [], error: null },
    }));

    render(<ListDetailPage />);

    expect(await screen.findByText("Record list not found")).toBeInTheDocument();
  });

  it("deletes the list and navigates away on confirm", async () => {
    const sb = makeSupabase({
      record_lists: { data: listRow, error: null },
      records: { data: [recordRow], error: null },
      standard_age_groups: { data: [], error: null },
      standard_events: { data: [], error: null },
    });
    mockClient(sb);

    render(<ListDetailPage />);
    await screen.findByText("SCM Male Records");

    // Header "Delete" opens the confirm modal.
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/Are you sure you want to delete/)).toBeInTheDocument();

    // The modal's confirm "Delete" is the last Delete button.
    const deletes = screen.getAllByRole("button", { name: "Delete" });
    await userEvent.click(deletes[deletes.length - 1]);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/records"));
    expect(sb.from).toHaveBeenCalledWith("record_lists");
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run "app/(dashboard)/dashboard/records/[listId]/page.test.tsx"`
Expected: 4 passed. If the "not found" or "Delete" strings differ, read the component and adjust the assertion strings only.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/records/[listId]/page.test.tsx"
git commit -m "test(records): cover list-editor load states + delete-list wiring"
```

---

## Task 3: `app/(dashboard)/dashboard/records/bulk-upload/page.test.tsx`

**Files:**
- Create: `app/(dashboard)/dashboard/records/bulk-upload/page.test.tsx`

The page uses `useClub` (for `selectedClub.level`), a hidden file input `#csv-files`, the real `parseRecordsCSV`/`parseFilename`, a per-file preview showing `{records.length} records`, and a `Create All Lists` button (`disabled` when every file has 0 records). Valid CSV: `Event,Time,Swimmer\n50 Free,24.56,John Smith` → 1 record. Empty-event CSV: `Event,Time,Swimmer\n,24.56,A` → 0 records.

- [ ] **Step 1: Write the test file**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/contexts/ClubContext", () => ({ useClub: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import { makeSupabase } from "@/lib/test/supabase-mock";
import BulkUploadPage from "./page";

const club = { id: "club-1", slug: "uac", short_name: "UAC", full_name: "Uptown Aquatic Club", logo_url: null, level: "regular" };

function fileInput(): HTMLInputElement {
  return document.getElementById("csv-files") as HTMLInputElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(useClub).mockReturnValue({
    selectedClub: club, setSelectedClub: vi.fn(), isLoading: false,
    isOwner: true, isEditor: false, canEdit: true,
  } as unknown as ReturnType<typeof useClub>);
});

describe("BulkUploadPage", () => {
  it("previews the parsed record count after selecting a file", async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>);
    render(<BulkUploadPage />);

    const file = new File(["Event,Time,Swimmer\n50 Free,24.56,John Smith"], "SCM-Male.csv", { type: "text/csv" });
    await userEvent.upload(fileInput(), file);

    expect(await screen.findByText("1 records")).toBeInTheDocument();
  });

  it("inserts the list + records on 'Create All Lists'", async () => {
    const sb = makeSupabase({
      record_lists: { data: { id: "new-list" }, error: null },
      records: { error: null },
    });
    vi.mocked(createClient).mockReturnValue(sb as unknown as ReturnType<typeof createClient>);
    render(<BulkUploadPage />);

    const file = new File(["Event,Time,Swimmer\n50 Free,24.56,John Smith"], "SCM-Male.csv", { type: "text/csv" });
    await userEvent.upload(fileInput(), file);
    await screen.findByText("1 records");

    await userEvent.click(screen.getByRole("button", { name: "Create All Lists" }));

    await waitFor(() => expect(sb.from).toHaveBeenCalledWith("record_lists"));
    expect(sb.from).toHaveBeenCalledWith("records");
  });

  it("disables upload when a file has no valid records", async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>);
    render(<BulkUploadPage />);

    const file = new File(["Event,Time,Swimmer\n,24.56,A"], "SCM-Male.csv", { type: "text/csv" });
    await userEvent.upload(fileInput(), file);

    expect(await screen.findByText("0 records")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create All Lists" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run "app/(dashboard)/dashboard/records/bulk-upload/page.test.tsx"`
Expected: 3 passed. If `userEvent.upload` errors on the hidden input, replace it with `fireEvent.change(fileInput(), { target: { files: [file] } })` (import `fireEvent` from `@testing-library/react`). If the preview text differs (e.g. spacing around "records"), read the component and match the exact rendered string.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/records/bulk-upload/page.test.tsx"
git commit -m "test(records): cover bulk-upload parse/preview/upload paths"
```

---

## Task 4: Verify + update TECH_DEBT

**Files:**
- Modify: `TECH_DEBT.md`

- [ ] **Step 1: Full gate**

Run: `npx vitest run`
Expected: all green. Count = 90 (existing) + 10 (RecordTable) + 4 (list editor) + 3 (bulk-upload) = **107 passed**.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run lint`
Expected: exit 0 (`--max-warnings 0`; the new test files add no lint problems).

Run: `npm run build`
Expected: clean.

- [ ] **Step 2: Update `TECH_DEBT.md`**

In the `## High` "Component/page/auth test coverage — partial" item, update the **Still uncovered** clause: `RecordTable`, the `[listId]` list editor, and the bulk-upload UI now have representative coverage. What remains uncovered is the deferred set — RecordTable's flag-menu/history-edit/`moveRow`/`breakRecord`/standard-events paths and the other dashboard mutation handlers — plus a future safety-netted RecordTable refactor. Keep the item under High (coverage is still partial) but note the editors are now covered.

- [ ] **Step 3: Commit**

```bash
git add TECH_DEBT.md
git commit -m "docs: record editor + bulk-upload test coverage in TECH_DEBT"
```

---

## Self-Review Notes (for the executor)

- **Tests characterize existing behavior — they should pass on first run.** A failure = wrong selector/assertion; read the component and fix the test, never the production code.
- **`makeSupabase` from-spy:** `sb.from` is a `vi.fn`; asserting `toHaveBeenCalledWith("record_lists")` proves the mutation wired through. Capture the `sb` object in a `const` so you can assert on it after the action.
- **`.maybeSingle()` not-found path:** the "Record list not found" test depends on the C2-era `.maybeSingle()` change (a `null` row is NOT an error). If it instead renders LoadError, that's a real regression — report it, don't paper over it.
- **Hidden file input:** prefer `userEvent.upload`; fall back to `fireEvent.change` if jsdom complains about visibility.
- **Lint gate is strict** (`--max-warnings 0`): no unused imports in the test files (e.g. only import `fireEvent`/`waitFor` if actually used).
```
