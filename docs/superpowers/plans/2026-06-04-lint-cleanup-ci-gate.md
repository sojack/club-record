# Lint Cleanup + CI Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive ESLint to 0 problems and make `npm run lint` (with `--max-warnings 0`) a blocking CI gate.

**Architecture:** Remove 2 unused vars; fix 4 `exhaustive-deps` warnings by wrapping loader functions in `useCallback` and adding them to their effect deps; silence the 2 `set-state-in-effect` errors (legitimate localStorage hydration) with line-scoped `eslint-disable` + rationale; then add `--max-warnings 0` to the `lint` script and remove `continue-on-error` from CI.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, ESLint 9 (`eslint-config-next`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-04-lint-cleanup-ci-gate-design.md`

**Conventions for every task:**
- Run commands from `/Users/jackso/code/ClubRecordProject/club-record`.
- **Commits are LOCAL ONLY. Never `git push`.** No `Co-Authored-By` trailer.
- After each task, the named `eslint`/`tsc` checks pass. Final gate (Task 4): `eslint . --max-warnings 0` exit 0, `tsc` clean, `vitest` 90, `build` clean.

---

## File Structure

| File | Change |
|------|--------|
| `components/RecordTable.tsx` | Remove unused `onBreakRecord` prop |
| `app/(dashboard)/dashboard/records/bulk-upload/page.tsx` | Remove unused `router` |
| `app/(dashboard)/dashboard/page.tsx` | `useCallback` loader |
| `app/(dashboard)/dashboard/records/page.tsx` | `useCallback` loader |
| `app/(dashboard)/dashboard/members/page.tsx` | `useCallback` loader |
| `app/admin/[clubId]/upload/page.tsx` | `useCallback` loader |
| `contexts/ClubContext.tsx` | Scoped disable + rationale |
| `components/DashboardShell.tsx` | Scoped disable + rationale |
| `package.json` | `lint` → `--max-warnings 0` |
| `.github/workflows/ci.yml` | Blocking lint step |
| `TECH_DEBT.md` / `TODO.md` | Mark done |

---

## Task 1: Remove the 2 unused vars

**Files:**
- Modify: `components/RecordTable.tsx`
- Modify: `app/(dashboard)/dashboard/records/bulk-upload/page.tsx`

Context: `onBreakRecord` is an optional prop on `RecordTableProps` that is never used inside `RecordTable`, and the only `<RecordTable>` caller (`app/(dashboard)/dashboard/records/[listId]/page.tsx`) does NOT pass it — so it can be removed from both the interface and the destructure.

- [ ] **Step 1: `RecordTable.tsx` — remove the interface field (line 25)**

Delete this line from the `RecordTableProps` interface:

```tsx
  onBreakRecord?: (oldRecordId: string, newRecordId: string) => Promise<void>;
```

- [ ] **Step 2: `RecordTable.tsx` — remove from the destructure (line 48)**

Change the component signature from:

```tsx
export default function RecordTable({ records, onSave, onDelete, onBreakRecord, readOnly = false, courseType, recordType = "individual", scope = "club", ageGroups = [], relayEvents = [] }: RecordTableProps) {
```

to (drop `onBreakRecord, `):

```tsx
export default function RecordTable({ records, onSave, onDelete, readOnly = false, courseType, recordType = "individual", scope = "club", ageGroups = [], relayEvents = [] }: RecordTableProps) {
```

- [ ] **Step 3: `bulk-upload/page.tsx` — remove the dead `router`**

Delete line 58:

```tsx
  const router = useRouter();
```

Then check whether `useRouter` is still referenced anywhere in the file. Run:
`grep -n "useRouter" "app/(dashboard)/dashboard/records/bulk-upload/page.tsx"`
If the only remaining hit is the `import { useRouter } from "next/navigation";` line, remove `useRouter` from that import (delete the whole import line if `useRouter` was its only named import; otherwise drop just the `useRouter` identifier).

- [ ] **Step 4: Verify those 2 warnings are gone + types clean**

Run: `npx eslint . 2>&1 | tail -3`
Expected: `6 problems (2 errors, 4 warnings)` (down from 8 — the 2 unused-var warnings are gone).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/RecordTable.tsx "app/(dashboard)/dashboard/records/bulk-upload/page.tsx"
git commit -m "refactor: remove unused onBreakRecord prop and dead router"
```

---

## Task 2: Fix the 4 `exhaustive-deps` warnings with `useCallback`

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Modify: `app/(dashboard)/dashboard/records/page.tsx`
- Modify: `app/(dashboard)/dashboard/members/page.tsx`
- Modify: `app/admin/[clubId]/upload/page.tsx`

For each file the transform is the same shape: (a) add `useCallback` to the React import; (b) wrap the loader: change `const loadX = async () => {` to `const loadX = useCallback(async () => {` and its closing `};` to `}, [<deps>]);`; (c) MOVE the loader so it is declared ABOVE the `useEffect` that calls it; (d) add `loadX` to that effect's dependency array. The body of each loader is UNCHANGED. This is behavior-preserving — the loader's identity changes only when its deps (already the effect's deps) change.

- [ ] **Step 1: `app/(dashboard)/dashboard/page.tsx`**

- Ensure the React import includes `useCallback`: `import { useState, useEffect, useCallback } from "react";`.
- Relocate `loadRecordLists` to sit immediately ABOVE its `useEffect`, wrapped:
  ```tsx
  const loadRecordLists = useCallback(async () => {
    // …existing body, unchanged…
  }, [selectedClub]);
  ```
- Update the effect's deps from `}, [selectedClub, clubLoading]);` to `}, [selectedClub, clubLoading, loadRecordLists]);`.

- [ ] **Step 2: `app/(dashboard)/dashboard/records/page.tsx`**

Same transform: import `useCallback`; wrap `loadRecordLists` as `useCallback(async () => { …unchanged… }, [selectedClub])`, moved above its effect; change the effect deps `}, [selectedClub, clubLoading]);` → `}, [selectedClub, clubLoading, loadRecordLists]);`.

- [ ] **Step 3: `app/(dashboard)/dashboard/members/page.tsx`**

Same transform for `loadMembers`: import `useCallback`; wrap as `useCallback(async () => { …unchanged… }, [selectedClub])`, moved above its effect; change the effect deps `}, [selectedClub, clubLoading, isOwner, router]);` → `}, [selectedClub, clubLoading, isOwner, router, loadMembers]);`.

- [ ] **Step 4: `app/admin/[clubId]/upload/page.tsx`**

- Ensure the React import includes `useCallback`: `import { useState, useEffect, useCallback } from "react";`.
- Wrap `loadClub` and move it ABOVE the effect at the current lines 76–80 (the `if (clubId) { loadClub(); }` effect):
  ```tsx
  const loadClub = useCallback(async () => {
    if (!clubId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("clubs")
      .select("*")
      .eq("id", clubId)
      .single();

    setClub(data as Club | null);
    setLoading(false);
  }, [clubId]);
  ```
- Update that effect's deps from `}, [clubId]);` to `}, [clubId, loadClub]);`.
- Leave the other two effects (the `params.then(...)` effect with deps `[params]`, and the `if (club) {...}` effect with deps `[club]`) UNCHANGED — neither calls `loadClub`. `handleSaveLevel` also calls `loadClub()`, which is fine (it's a handler, not an effect).

- [ ] **Step 5: Verify the 4 warnings are gone, types clean, tests green**

Run: `npx eslint . 2>&1 | tail -3`
Expected: `2 problems (2 errors, 0 warnings)` (only the 2 `set-state-in-effect` errors remain).

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx vitest run`
Expected: 90 passed (the `dashboard/page` and `members` tests exercise these loaders via their effects — confirms the `useCallback` reorder didn't change behavior).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx" "app/(dashboard)/dashboard/records/page.tsx" "app/(dashboard)/dashboard/members/page.tsx" "app/admin/[clubId]/upload/page.tsx"
git commit -m "refactor: useCallback loaders to satisfy exhaustive-deps"
```

---

## Task 3: Silence the 2 `set-state-in-effect` errors (localStorage hydration)

**Files:**
- Modify: `contexts/ClubContext.tsx`
- Modify: `components/DashboardShell.tsx`

These are legitimate client-only localStorage reads on mount; silence them with line-scoped disables + a rationale (per the spec — no refactor).

- [ ] **Step 1: `contexts/ClubContext.tsx`**

The mount effect (currently lines ~32–50) has three `setSelectedClubState(...)` calls flagged. Add a rationale comment at the top of the effect body and a line-scoped disable immediately above EACH `setSelectedClubState(...)` call. The effect becomes:

```tsx
  useEffect(() => {
    // Client-only hydration: restore the selected club from localStorage on
    // mount (and when the clubs prop changes). Intentional setState-in-effect —
    // there is no SSR-safe lazy-init alternative for a localStorage read.
    const savedClubId = localStorage.getItem(SELECTED_CLUB_KEY);

    if (savedClubId) {
      const savedClub = clubs.find((c) => c.id === savedClubId);
      if (savedClub) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedClubState(savedClub);
      } else {
        // Saved club no longer exists, select first club
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedClubState(clubs[0] || null);
      }
    } else {
      // No saved selection, select first club
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedClubState(clubs[0] || null);
    }

    setIsLoading(false);
  }, [clubs]);
```

(Note: `setIsLoading(false)` was not flagged — leave it without a disable. If, after this edit, ESLint reports `set-state-in-effect` on the `setIsLoading(false)` line, add a disable there too — but only if flagged.)

- [ ] **Step 2: `components/DashboardShell.tsx`**

Change the mount effect (lines ~18–23) to:

```tsx
  // Client-only hydration: restore the collapsed state from localStorage on
  // mount. Intentional setState-in-effect — no SSR-safe lazy-init alternative.
  useEffect(() => {
    const stored = localStorage.getItem("sidebarCollapsed");
    if (stored !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarCollapsed(stored === "true");
    }
  }, []);
```

- [ ] **Step 3: Verify 0 problems**

Run: `npx eslint .`
Expected: no output and exit 0 — **0 problems**.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add contexts/ClubContext.tsx components/DashboardShell.tsx
git commit -m "lint: scope-disable set-state-in-effect for localStorage hydration"
```

---

## Task 4: Promote lint to a hard CI gate + verify + docs

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `TECH_DEBT.md`
- Modify: `TODO.md` (project root — `/Users/jackso/code/ClubRecordProject/TODO.md`; note this file is OUTSIDE the git repo, so it is edited but NOT committed)

- [ ] **Step 1: `package.json` — strict lint script**

Change:
```json
    "lint": "eslint .",
```
to:
```json
    "lint": "eslint . --max-warnings 0",
```
Leave `"lint:fix": "eslint . --fix"` unchanged.

- [ ] **Step 2: `.github/workflows/ci.yml` — make lint blocking**

Replace the current lint step:
```yaml
      # Lint is non-blocking: the codebase has pre-existing react-hooks
      # errors tracked in TECH_DEBT.md. Visible in the logs but does not
      # fail CI. Promote to a hard gate once the lint debt is paid.
      - name: Lint (non-blocking)
        run: npm run lint
        continue-on-error: true
```
with:
```yaml
      - name: Lint
        run: npm run lint
```

- [ ] **Step 3: Full verification**

Run: `npm run lint`
Expected: exit 0 (proves `eslint . --max-warnings 0` passes with 0 problems).

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx vitest run`
Expected: 90 passed.

Run: `npm run build`
Expected: completes with no errors (confirms the `useCallback` reorders didn't break any page render).

- [ ] **Step 4: Update `TECH_DEBT.md`**

In the `## Medium` section, mark the "Pre-existing lint failures" item **done** and move it to `## Done` with a one-line note: lint backlog cleared (unused vars removed, `exhaustive-deps` fixed via `useCallback`, the 2 localStorage-hydration `set-state-in-effect` errors scope-disabled with rationale) and `npm run lint --max-warnings 0` is now a blocking CI gate.

- [ ] **Step 5: Update `TODO.md` (not committed — outside the repo)**

In `/Users/jackso/code/ClubRecordProject/TODO.md`, mark the "Lint backlog — triage & fix the 14 ESLint violations" section resolved (all items now fixed; lint is a hard CI gate). Do NOT `git add` this file — it lives outside the `club-record/` git repo.

- [ ] **Step 6: Commit (repo files only)**

```bash
git add package.json .github/workflows/ci.yml TECH_DEBT.md
git commit -m "ci: make lint a blocking gate (--max-warnings 0); clear lint backlog"
```

---

## Self-Review Notes (for the executor)

- **`useCallback` reorders:** the function must be declared before the `useEffect` that references it, or you'll get a "used before declaration" TS error. Move the whole function up; don't duplicate it.
- **Behavior preservation:** the loader's `useCallback` deps must equal what it reads (`[selectedClub]` for the dashboard loaders, `[clubId]` for admin upload). Since those are already in each effect's dep array, the effect fires on the same transitions — no new loops. The `vitest` run in Task 2 Step 5 is the safety net.
- **Line-scoped disables only:** never a file-level `/* eslint-disable */` — a line-scoped disable can't mask a future violation elsewhere in the file.
- **`--max-warnings 0` is strict:** after this lands, ANY new warning fails `npm run lint` locally and in CI. That is the intended outcome.
- **`TODO.md` is unversioned** (outside `club-record/`); edit it but never `git add` it.
```
