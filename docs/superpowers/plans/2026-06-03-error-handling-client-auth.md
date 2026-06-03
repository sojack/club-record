# Error Handling — Dashboard Client (C2) + Auth Flows (C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop dashboard client read paths from silently rendering empty states on DB failure, and stop dashboard/auth mutation handlers from freezing their buttons on thrown (network/transport) errors.

**Architecture:** One new shared presentational component (`LoadError`) renders an inline message + retry for `useEffect`-driven reads. Every loader is wrapped so the returned `error` and a thrown error both set a `loadError` flag → `<LoadError>`. Every mutation/auth handler is wrapped in `try/catch/finally` so its loading flag is always reset and a generic message is shown on a thrown error. Existing returned-`{error}` UX is preserved.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript (strict), Supabase JS client, Tailwind CSS 4. No test changes this round (jsdom/RTL deferred — manual verification).

**Spec:** `docs/superpowers/specs/2026-06-03-error-handling-client-auth-design.md`

**Conventions for every task:**
- **Generic thrown-error message** (use this exact string): `"Something went wrong. Please try again."`
- **Log prefix:** reads → `console.error("[data-access] dashboard: <context>", e)`; mutations → `console.error("[mutation] <area>: <context>", e)`.
- **Per-task gate:** `npx tsc --noEmit` exits 0 (run from `club-record/`).
- **Commits are LOCAL ONLY. Never `git push`.** No `Co-Authored-By` trailer.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `components/LoadError.tsx` | Presentational read-error + retry block | **Create** |
| `app/(dashboard)/dashboard/page.tsx` | Record-list overview | Read path |
| `app/(dashboard)/dashboard/records/page.tsx` | Record-lists index | Read path + 2 mutations |
| `app/(dashboard)/dashboard/records/[listId]/page.tsx` | Single-list editor | Read path + 5 mutations |
| `app/(dashboard)/dashboard/members/page.tsx` | Member management | Read path + 4 mutations |
| `app/(dashboard)/dashboard/settings/page.tsx` | Club settings | 1 mutation |
| `app/(dashboard)/dashboard/records/new/page.tsx` | New list form | 1 mutation |
| `app/(dashboard)/dashboard/clubs/new/page.tsx` | New club form | 1 mutation |
| `app/(dashboard)/dashboard/records/bulk-upload/page.tsx` | Multi-file CSV upload | 2 mutations |
| `app/(auth)/signup/page.tsx` | Signup (+ club) | 2 mutations + orphan fix |
| `app/(auth)/reset-password/page.tsx` | Set new password | 1 mutation + session `.catch` |
| `app/(auth)/login/page.tsx` | Login | 1 mutation |
| `app/(auth)/forgot-password/page.tsx` | Request reset email | 1 mutation |
| `TECH_DEBT.md` | Debt tracker | Mark C2/C3 done |

---

## Task 1: Shared `LoadError` component

**Files:**
- Create: `components/LoadError.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

export default function LoadError({
  onRetry,
  message = "We couldn't load this right now. Please try again.",
}: {
  onRetry: () => void;
  message?: string;
}) {
  return (
    <div className="py-12 text-center">
      <p className="mb-4 text-gray-500 dark:text-gray-400">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/LoadError.tsx
git commit -m "feat(ui): add LoadError component for client read-path failures"
```

---

## Task 2: `dashboard/page.tsx` — read path

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Import `LoadError` and add `loadError` state**

Add to imports (after the `RecordList` type import):

```tsx
import LoadError from "@/components/LoadError";
```

Add state next to the existing `loading` state:

```tsx
const [loadError, setLoadError] = useState(false);
```

- [ ] **Step 2: Wrap `loadRecordLists`**

Replace the existing `loadRecordLists` body with:

```tsx
const loadRecordLists = async () => {
  if (!selectedClub) return;

  setLoading(true);
  setLoadError(false);
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("record_lists")
      .select("*, records(count)")
      .eq("club_id", selectedClub.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    setRecordLists(
      (data as (RecordList & { records: { count: number }[] })[]) || []
    );
  } catch (e) {
    console.error("[data-access] dashboard: record lists", e);
    setLoadError(true);
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 3: Render `<LoadError>` on failure**

Immediately after the existing `if (loading || clubLoading) { … }` block and before `if (!selectedClub) { … }`, insert:

```tsx
if (loadError) {
  return <LoadError onRetry={loadRecordLists} />;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "fix(dashboard): surface record-list read failures with retry"
```

---

## Task 3: `records/page.tsx` — read path + 2 mutations

**Files:**
- Modify: `app/(dashboard)/dashboard/records/page.tsx`

- [ ] **Step 1: Import `LoadError` and add `loadError` state**

Add import (after the `LastUpdated` import):

```tsx
import LoadError from "@/components/LoadError";
```

Add state next to `loading`:

```tsx
const [loadError, setLoadError] = useState(false);
```

- [ ] **Step 2: Wrap the primary read in `loadRecordLists`**

In `loadRecordLists`, change the start from `setLoading(true);` through the primary `record_lists` fetch so it reads:

```tsx
setLoading(true);
setLoadError(false);
try {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("record_lists")
    .select("*, records(count)")
    .eq("club_id", selectedClub.id)
    .order("title", { ascending: true });
  if (error) throw error;

  const lists = (data as (RecordList & { records: { count: number }[] })[]) || [];
```

Keep the existing freshness block (the secondary `records`/`recRows` query) **unchanged and inside the `try`** — it stays intentionally degradable (its swallowed error is fine). After the existing `setRecordLists(rows); setLoading(false); setSelectedIds([]);` lines, restructure the tail of the function to:

```tsx
  const rows: RecordListRow[] = lists.map((l) => ({
    ...l,
    lastUpdated: maxIso([l.updated_at, recordMax.get(l.id)]),
  }));

  setRecordLists(rows);
  setSelectedIds([]);
} catch (e) {
  console.error("[data-access] dashboard: record lists index", e);
  setLoadError(true);
} finally {
  setLoading(false);
}
```

(The `setLoading(false)` moves into `finally`; `setRecordLists`/`setSelectedIds` stay in the success path.)

- [ ] **Step 3: Render `<LoadError>` on failure**

Find the early return for the loading state (the `if (loading || clubLoading)` block). Immediately after it, insert:

```tsx
if (loadError) {
  return <LoadError onRetry={loadRecordLists} />;
}
```

- [ ] **Step 4: Wrap `handleBulkDelete`**

Wrap the existing body in `try/catch/finally`. The function becomes:

```tsx
const handleBulkDelete = async () => {
  setIsDeleting(true);
  setDeleteProgress({ current: 0, total: selectedIds.length });
  setDeleteResults(null);

  const supabase = createClient();
  const success: string[] = [];
  const failed: string[] = [];

  try {
    for (let i = 0; i < selectedIds.length; i++) {
      const id = selectedIds[i];
      const list = recordLists.find((l) => l.id === id);
      setDeleteProgress({ current: i + 1, total: selectedIds.length });

      const { error } = await supabase.from("record_lists").delete().eq("id", id);

      if (error) {
        failed.push(`${list?.title || id}: ${error.message}`);
      } else {
        success.push(list?.title || id);
      }
    }

    setDeleteResults({ success, failed });

    if (failed.length === 0) {
      setShowDeleteModal(false);
      setSelectedIds([]);
      loadRecordLists();
    }
  } catch (e) {
    console.error("[mutation] dashboard: bulk delete", e);
    setDeleteResults({
      success,
      failed: [...failed, "Something went wrong. Please try again."],
    });
  } finally {
    setIsDeleting(false);
  }
};
```

- [ ] **Step 5: Wrap `handleExportCSV`**

Wrap its body in `try/finally` and add a `catch`. Keep the existing early-returns for empty `lists`/`records` but drop their inline `setIsExporting(false)` (the `finally` handles it). The shape:

```tsx
const handleExportCSV = async () => {
  if (!selectedClub) return;

  setIsExporting(true);
  try {
    const supabase = createClient();

    const { data: lists } = await supabase
      .from("record_lists")
      .select("id, title")
      .eq("club_id", selectedClub.id)
      .order("title");

    if (!lists || lists.length === 0) {
      return;
    }
    // …existing records fetch + CSV build + download, unchanged,
    //   except: remove the two inline `setIsExporting(false);` calls in the
    //   `if (!records)` / empty guards (finally now handles it).
  } catch (e) {
    console.error("[mutation] dashboard: export CSV", e);
    alert("Something went wrong. Please try again.");
  } finally {
    setIsExporting(false);
  }
};
```

Note: replace the `if (!records) { setIsExporting(false); return; }` guard with `if (!records) { return; }`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/dashboard/records/page.tsx"
git commit -m "fix(dashboard): harden record-lists index reads + bulk/export handlers"
```

---

## Task 4: `records/[listId]/page.tsx` — read path + 5 mutations

**Files:**
- Modify: `app/(dashboard)/dashboard/records/[listId]/page.tsx`

- [ ] **Step 1: Import `LoadError` and add `loadError` state**

Add import (after the `EmbedCodeSnippet` import):

```tsx
import LoadError from "@/components/LoadError";
```

Add state next to `loading`:

```tsx
const [loadError, setLoadError] = useState(false);
```

- [ ] **Step 2: Wrap `loadData`**

Replace the `loadData` `useCallback` body with the wrapped version. The list and records reads become fatal (throw on error); the age-group and relay-event helper reads stay degradable:

```tsx
const loadData = useCallback(async () => {
  setLoadError(false);
  try {
    const supabase = createClient();

    const { data: listData, error: listError } = await supabase
      .from("record_lists")
      .select("*")
      .eq("id", listId)
      .single();
    if (listError) throw listError;

    if (listData) {
      setRecordList(listData as RecordList);
      setEditTitle(listData.title);
      setEditCourseType(listData.course_type as "LCM" | "SCM" | "SCY");
      setEditGender((listData.gender as "male" | "female" | "mixed") || "male");
    }

    const { data: recordsData, error: recordsError } = await supabase
      .from("records")
      .select("*")
      .eq("record_list_id", listId)
      .order("sort_order", { ascending: true });
    if (recordsError) throw recordsError;

    if (recordsData) {
      setRecords(recordsData as SwimRecord[]);
    }

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
  } catch (e) {
    console.error("[data-access] dashboard: list detail", e);
    setLoadError(true);
  } finally {
    setLoading(false);
  }
}, [listId]);
```

- [ ] **Step 3: Render `<LoadError>` on failure**

Immediately after the `if (loading) { … }` early-return block and **before** the `if (!recordList) { … }` "Record list not found" block, insert:

```tsx
if (loadError) {
  return <LoadError onRetry={loadData} />;
}
```

(This stops a DB outage from masquerading as "Record list not found".)

- [ ] **Step 4: Wrap the 5 mutation handlers**

These handlers display errors via `setMessage({ type: "error", text: … })` and have no loading flag, so each gets a `try/catch` (no `finally` needed). For each, wrap the existing body in `try {` … `}` and append:

```tsx
} catch (e) {
  console.error("[mutation] dashboard: <name>", e);
  setMessage({ type: "error", text: "Something went wrong. Please try again." });
}
```

Apply to, using these `<name>` values:
- `handleSaveRecords` → `"save records"` (wrap from `const supabase = createClient();` through `loadData();`; the existing inner `if (error) { setMessage(...); return; }` guards stay inside the `try`).
- `handleDeleteRecord` → `"delete record"`.
- `handleCSVUpload` → `"csv upload"`.
- `handleUpdateList` → `"update list"` (keep the leading `if (!recordList) return;` **before** the `try`).
- `handleDeleteList` → `"delete list"`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/records/[listId]/page.tsx"
git commit -m "fix(dashboard): harden list-detail read + mutation handlers"
```

---

## Task 5: `members/page.tsx` — read path + 4 mutations

**Files:**
- Modify: `app/(dashboard)/dashboard/members/page.tsx`

This page already has an `error` string state that is set **only** by the load path. Convert that load-error display to `LoadError`, and wrap the four action handlers.

- [ ] **Step 1: Import `LoadError`, replace `error` with `loadError` boolean**

Add import (after the `database` types import):

```tsx
import LoadError from "@/components/LoadError";
```

Change the load-error state declaration from:

```tsx
const [error, setError] = useState<string | null>(null);
```

to:

```tsx
const [loadError, setLoadError] = useState(false);
```

- [ ] **Step 2: Wrap `loadMembers`**

```tsx
const loadMembers = async () => {
  if (!selectedClub) return;

  setLoading(true);
  setLoadError(false);
  try {
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .rpc("get_club_members_with_email", { p_club_id: selectedClub.id });
    if (fetchError) throw fetchError;
    setMembers((data as ClubMemberWithEmail[]) || []);
  } catch (e) {
    console.error("[data-access] dashboard: members", e);
    setLoadError(true);
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 3: Render `<LoadError>` and remove the old `error` banner**

After the `if (clubLoading || loading) { … }` early-return block, insert:

```tsx
if (loadError) {
  return <LoadError onRetry={loadMembers} />;
}
```

Then find and **delete** the old inline `error` banner in the JSX (the `{error && ( <div className="…bg-red-50…">{error}</div> )}` block that rendered the load error). Search the file for any remaining reference to the now-removed `error`/`setError` identifiers and confirm none remain (`addError`/`setAddError` are different variables and stay; `tsc` in Step 8 will catch a stray reference).

- [ ] **Step 4: Wrap `handleAddMember`**

```tsx
const handleAddMember = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!selectedClub) return;

  setAddingMember(true);
  setAddError(null);
  try {
    const supabase = createClient();
    const { error: addMemberError } = await supabase
      .rpc("add_club_member_by_email", {
        p_club_id: selectedClub.id,
        p_email: newEmail,
        p_role: newRole,
      });
    if (addMemberError) {
      setAddError(addMemberError.message);
      return;
    }
    setNewEmail("");
    setNewRole("viewer");
    setShowAddForm(false);
    loadMembers();
  } catch (err) {
    console.error("[mutation] dashboard: add member", err);
    setAddError("Something went wrong. Please try again.");
  } finally {
    setAddingMember(false);
  }
};
```

- [ ] **Step 5: Wrap `handleRoleChange`** (no loading flag; uses `alert`)

```tsx
const handleRoleChange = async (memberId: string, newMemberRole: ClubMemberRole) => {
  try {
    const supabase = createClient();
    const { error: updateError } = await supabase
      .rpc("update_club_member_role", {
        p_member_id: memberId,
        p_new_role: newMemberRole,
      });
    if (updateError) {
      alert(updateError.message);
      return;
    }
    loadMembers();
  } catch (e) {
    console.error("[mutation] dashboard: role change", e);
    alert("Something went wrong. Please try again.");
  }
};
```

- [ ] **Step 6: Wrap `handleRemoveMember`**

```tsx
const handleRemoveMember = async () => {
  if (!removeTarget) return;

  setRemoving(true);
  try {
    const supabase = createClient();
    const { error: removeError } = await supabase
      .rpc("remove_club_member", { p_member_id: removeTarget.id });
    if (removeError) {
      alert(removeError.message);
      return;
    }
    setShowRemoveModal(false);
    setRemoveTarget(null);
    loadMembers();
  } catch (e) {
    console.error("[mutation] dashboard: remove member", e);
    alert("Something went wrong. Please try again.");
  } finally {
    setRemoving(false);
  }
};
```

- [ ] **Step 7: Wrap `handleTransferOwnership`**

```tsx
const handleTransferOwnership = async () => {
  if (!transferTarget || !selectedClub) return;

  setTransferring(true);
  try {
    const supabase = createClient();
    const { error: transferError } = await supabase
      .rpc("transfer_club_ownership", {
        p_club_id: selectedClub.id,
        p_new_owner_id: transferTarget.user_id,
      });
    if (transferError) {
      alert(transferError.message);
      setTransferring(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  } catch (e) {
    console.error("[mutation] dashboard: transfer ownership", e);
    alert("Something went wrong. Please try again.");
    setTransferring(false);
  }
};
```

(Left intentionally without `finally` so the success path keeps `transferring` true while it navigates away — matching the original.)

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. If it reports an unused/old `error` reference, remove that leftover line.

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/dashboard/members/page.tsx"
git commit -m "fix(dashboard): harden members read + member-action handlers"
```

---

## Task 6: Mutation-only forms — `settings`, `records/new`, `clubs/new`

**Files:**
- Modify: `app/(dashboard)/dashboard/settings/page.tsx`
- Modify: `app/(dashboard)/dashboard/records/new/page.tsx`
- Modify: `app/(dashboard)/dashboard/clubs/new/page.tsx`

- [ ] **Step 1: Wrap `settings` `handleSubmit`**

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!selectedClub || !isOwner) return;

  setSaving(true);
  setMessage(null);
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("clubs")
      .update({
        short_name: shortName,
        full_name: fullName,
        logo_url: logoUrl || null,
      })
      .eq("id", selectedClub.id);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Settings saved successfully!" });
      router.refresh();
    }
  } catch (err) {
    console.error("[mutation] dashboard: save settings", err);
    setMessage({ type: "error", text: "Something went wrong. Please try again." });
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 2: Wrap `records/new` `handleSubmit`**

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!selectedClub) return;

  setError(null);
  setLoading(true);
  try {
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("record_lists")
      .insert({
        club_id: selectedClub.id,
        title,
        slug,
        course_type: courseType,
        gender,
        record_type: recordType,
        scope: scopeForClubLevel(selectedClub?.level),
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        setError("A record list with this slug already exists. Please choose a different URL.");
      } else {
        setError(insertError.message);
      }
      return;
    }

    router.push(`/dashboard/records/${data.id}`);
  } catch (err) {
    console.error("[mutation] dashboard: create record list", err);
    setError("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 3: Wrap `clubs/new` `handleSubmit`**

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  setLoading(true);
  try {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to create a club");
      return;
    }

    const { error: insertError } = await supabase.from("clubs").insert({
      user_id: user.id,
      short_name: shortName,
      full_name: fullName,
      slug: slug || generateSlug(shortName),
    });

    if (insertError) {
      if (insertError.code === "23505") {
        setError("A club with this URL slug already exists. Please choose a different one.");
      } else {
        setError(insertError.message);
      }
      return;
    }

    router.push("/dashboard");
    router.refresh();
  } catch (err) {
    console.error("[mutation] dashboard: create club", err);
    setError("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/settings/page.tsx" "app/(dashboard)/dashboard/records/new/page.tsx" "app/(dashboard)/dashboard/clubs/new/page.tsx"
git commit -m "fix(dashboard): wrap settings/new-list/new-club submit handlers"
```

---

## Task 7: `bulk-upload/page.tsx` — 2 mutations

**Files:**
- Modify: `app/(dashboard)/dashboard/records/bulk-upload/page.tsx`

- [ ] **Step 1: Wrap `handleFileSelect`** (reads file contents — `file.text()` can throw)

```tsx
const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  try {
    const parsed: ParsedFile[] = [];

    for (const file of Array.from(files)) {
      const content = await file.text();
      const { title, slug, courseType, gender, recordType } = parseFilename(file.name);
      const listScope = scopeForClubLevel(selectedClub?.level);
      const { records, errors } = parseRecordsCSV(content, {
        relay: recordType === "relay",
        scope: listScope,
      });

      parsed.push({
        file,
        title,
        slug,
        courseType,
        gender,
        recordType,
        listScope,
        records,
        errors,
      });
    }

    setParsedFiles(parsed);
    setResults(null);
  } catch (err) {
    console.error("[mutation] dashboard: parse upload files", err);
    setResults({ success: [], failed: ["Couldn't read the selected file(s). Please try again."] });
  }
};
```

- [ ] **Step 2: Wrap `handleUpload`**

Wrap the existing body (from `setUploading(true);` onward) in `try`, move the loop and the existing tail (the `setResults({ success, failed })` etc.) inside it, and add:

```tsx
const handleUpload = async () => {
  if (!selectedClub || parsedFiles.length === 0) return;

  setUploading(true);
  setProgress({ current: 0, total: parsedFiles.length });

  const supabase = createClient();
  const success: string[] = [];
  const failed: string[] = [];

  try {
    // …existing for-loop over parsedFiles (unchanged)…
    // …existing post-loop result handling (unchanged) EXCEPT remove any
    //   inline `setUploading(false);` — finally handles it…
  } catch (e) {
    console.error("[mutation] dashboard: bulk upload", e);
    setResults({
      success,
      failed: [...failed, "Something went wrong. Please try again."],
    });
  } finally {
    setUploading(false);
  }
};
```

Note: `success`/`failed` are declared before the `try` so the `catch` can reference them. Remove the existing `setUploading(false);` line that ran after the loop (the `finally` replaces it). Leave `setProgress`/`setResults` success-path lines as they are inside the `try`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/dashboard/records/bulk-upload/page.tsx"
git commit -m "fix(dashboard): wrap bulk-upload file-select and upload handlers"
```

---

## Task 8: `signup/page.tsx` — 2 mutations + orphaned-account fix

**Files:**
- Modify: `app/(auth)/signup/page.tsx`

- [ ] **Step 1: Wrap `handleSkip`**

```tsx
const handleSkip = async () => {
  setError(null);
  setLoading(true);
  try {
    const supabase = createClient();

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  } catch (e) {
    console.error("[mutation] auth: signup (skip club)", e);
    setError("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 2: Wrap `handleClubSubmit` and fix the orphaned-account message**

```tsx
const handleClubSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  setLoading(true);
  try {
    const supabase = createClient();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      return;
    }

    if (!authData.user) {
      setError("Failed to create account");
      return;
    }

    const { error: clubError } = await supabase.from("clubs").insert({
      user_id: authData.user.id,
      short_name: shortName,
      full_name: fullName,
      slug: slug || generateSlug(shortName),
    });

    if (clubError) {
      // Account was created but the club insert failed — don't leave the user
      // stuck on this form or show a raw DB error. Send them to the dashboard,
      // where they can set up the club from the "Create Club" flow.
      console.error("[mutation] auth: signup club insert", clubError);
      router.push("/dashboard");
      router.refresh();
      return;
    }

    router.push("/dashboard");
    router.refresh();
  } catch (e) {
    console.error("[mutation] auth: signup (with club)", e);
    setError("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/signup/page.tsx"
git commit -m "fix(auth): wrap signup handlers; recover from orphaned-account club insert"
```

---

## Task 9: `reset-password/page.tsx` — 1 mutation + session `.catch`

**Files:**
- Modify: `app/(auth)/reset-password/page.tsx`

- [ ] **Step 1: Add `.catch` to the session probe**

In the `useEffect`, change the `getSession().then(...)` to also handle rejection:

```tsx
supabase.auth.getSession().then(({ data }) => {
  if (data.session) {
    setReady(true);
  }
}).catch((e) => {
  console.error("[auth] reset-password: getSession", e);
  // The 3s timeout below still reveals the form, so just log.
});
```

- [ ] **Step 2: Wrap `handleSubmit`**

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);

  if (password !== confirmPassword) {
    setError("Passwords do not match");
    return;
  }

  if (password.length < 6) {
    setError("Password must be at least 6 characters");
    return;
  }

  setLoading(true);
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 2000);
  } catch (err) {
    console.error("[mutation] auth: reset password", err);
    setError("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
};
```

(Note: `setSuccess(true)` then `setLoading(false)` via `finally` is fine — the success view renders off `success`, not `loading`.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/reset-password/page.tsx"
git commit -m "fix(auth): wrap reset-password submit + guard session probe"
```

---

## Task 10: `login` + `forgot-password` — 1 mutation each

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/(auth)/forgot-password/page.tsx`

- [ ] **Step 1: Wrap `login` `handleSubmit`**

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  setLoading(true);
  try {
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  } catch (err) {
    console.error("[mutation] auth: login", err);
    setError("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 2: Wrap `forgot-password` `handleSubmit`**

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  setLoading(true);
  try {
    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
  } catch (err) {
    console.error("[mutation] auth: forgot password", err);
    setError("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/login/page.tsx" "app/(auth)/forgot-password/page.tsx"
git commit -m "fix(auth): wrap login and forgot-password submit handlers"
```

---

## Task 11: Verify, update TECH_DEBT, manual smoke

**Files:**
- Modify: `TECH_DEBT.md`

- [ ] **Step 1: Full type-check + existing tests stay green**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx vitest run`
Expected: `Test Files  10 passed (10)`, `Tests  73 passed (73)` (unchanged — no test files added this round).

- [ ] **Step 2: Lint did not regress**

Run: `npx eslint . 2>&1 | tail -3`
Expected: still `✖ 13 problems (7 errors, 6 warnings)` — the pre-existing backlog. If the count went **up**, the new code introduced a violation (e.g. an unused `error` var in `members/page.tsx`); fix it before continuing.

- [ ] **Step 3: Production build sanity (catches RSC/client boundary issues tsc misses)**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 4: Manual smoke (per spec §Verification)**

With `npm run dev` running and signed in:
- Normal: every dashboard page and auth form behaves exactly as before (no visible change).
- Read failure: temporarily break a read (e.g. point `NEXT_PUBLIC_SUPABASE_ANON_KEY` at an invalid value or rename a queried table in a scratch DB) → the affected dashboard page shows the `LoadError` "Try again" block instead of a false-empty / false-"not found" state; clicking retry recovers after the read is restored.
- Mutation throw: with the network blocked (DevTools → offline), submit a form (e.g. login, new club) → an inline message appears and the button re-enables (not frozen on "Logging in…").

- [ ] **Step 5: Update `TECH_DEBT.md`**

In the `## High` section, update the "Near-absent error handling — dashboard client + auth (remaining)" item: mark **C2** (dashboard client components) and **C3** (auth flows) done, leaving only any items genuinely still open. If both sub-projects are now complete, move the consolidated entry to `## Done` with a one-line summary referencing this plan and the `LoadError` component. Also reconcile the broader "near-absent error handling" item (only the component/page **test** coverage remains, tracked separately under High #1).

- [ ] **Step 6: Commit**

```bash
git add TECH_DEBT.md
git commit -m "docs: mark error-handling C2/C3 done in TECH_DEBT"
```

---

## Self-Review Notes (for the executor)

- **No new tests** this round by design (jsdom/RTL deferred) — the gates are `tsc`, the existing `vitest` suite staying green, `eslint` not regressing, and `npm run build`.
- **`finally` semantics:** a `return` inside `try` still runs `finally`, so loading flags reset on every exit path. The two deliberate exceptions (`handleTransferOwnership`, and the success navigations) keep their flag set while unmounting — matching original behavior.
- **`members/page.tsx`** is the only file that removes a state variable (`error` → `loadError`); after editing, confirm no dangling `error`/`setError` references remain (tsc will catch them).
- **Generic message** string is identical everywhere: `"Something went wrong. Please try again."` (`LoadError`'s default copy differs intentionally — it's the read-path message).
</content>
