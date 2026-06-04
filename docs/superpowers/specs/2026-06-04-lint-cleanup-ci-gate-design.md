# Design: Clear the lint backlog + promote lint to a hard CI gate

**Date:** 2026-06-04
**Status:** Approved
**Topic:** Resolve all 8 remaining ESLint problems and make `npm run lint` a
blocking CI gate (with `--max-warnings 0`), so lint debt cannot silently
regrow. (TECH_DEBT Medium.)

## Context

ESLint currently reports **8 problems (2 errors, 6 warnings)** — the residual
backlog tracked in `TODO.md`/`TECH_DEBT.md`. CI runs `npm run lint` but with
`continue-on-error: true` (non-blocking) because of the 2 pre-existing
`react-hooks/set-state-in-effect` errors. The 4 `immutability` errors that used
to be in this backlog were incidentally cleared by the C2 try/catch
restructuring; what remains is a small, well-understood set.

## Goals

1. `npx eslint .` reports **0 problems**.
2. `npm run lint` enforces `--max-warnings 0` (errors and warnings both fail).
3. CI's lint step is **blocking** (no `continue-on-error`).
4. No behavior change: `tsc` clean, `vitest` 90 green, `next build` clean.

## Non-goals

- No `useSyncExternalStore` rewrite — the 2 `set-state-in-effect` errors are
  silenced with a rationale (decided with the user), not refactored.
- No new ESLint rules or config changes beyond adding `--max-warnings 0` to the
  `lint` script.
- No touching `records/[listId]/page.tsx`'s `loadData` (already a `useCallback`,
  not flagged).

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | `set-state-in-effect` (localStorage hydration) | Scoped `eslint-disable-next-line` + one-line rationale; no refactor |
| D2 | `exhaustive-deps` (loader effects) | Proper fix: wrap each loader in `useCallback`, add to effect deps |
| D3 | Unused vars | Remove |
| D4 | Gate strictness | `--max-warnings 0` in the `package.json` `lint` script (enforced locally + CI) |

## The 8 problems and their fixes

### A. Unused vars (2) — remove

- **`components/RecordTable.tsx:48`** — `onBreakRecord` is destructured from
  props but never used. Remove it from the destructure. If no caller passes
  `onBreakRecord` and it appears in the `RecordTableProps` interface, remove it
  there too; if a caller does pass it, leave the interface field and only drop
  the unused binding. (Implementation must grep callers first.)
- **`app/(dashboard)/dashboard/records/bulk-upload/page.tsx:58`** —
  `const router = useRouter();` is assigned but never used. Remove the line and
  the `useRouter` import if it becomes unused.

### B. `exhaustive-deps` (4) — `useCallback`

For each of `app/(dashboard)/dashboard/page.tsx` (`loadRecordLists`),
`app/(dashboard)/dashboard/records/page.tsx` (`loadRecordLists`),
`app/(dashboard)/dashboard/members/page.tsx` (`loadMembers`), and
`app/admin/[clubId]/upload/page.tsx` (`loadClub`):

1. Import `useCallback`.
2. Wrap the loader: `const loadX = useCallback(async () => { …existing body… }, [<closed-over deps>])`. The deps are whatever the body reads from
   props/state (e.g. `selectedClub`; `admin/upload` reads its `clubId`/params).
3. Move the loader **above** the `useEffect` that calls it (a `useCallback`
   must be declared before its use in the effect).
4. Add the loader to that effect's dependency array.

This is behavior-preserving: the loader's identity changes only when its
existing deps change — the same deps already in the effect array — so the
effect fires on exactly the same transitions as today, with no new loops.

### C. `set-state-in-effect` (2) — scoped disable + rationale

- **`contexts/ClubContext.tsx`** — the mount effect (lines ~32–50) reads
  `localStorage` and the `clubs` prop to pick the initial `selectedClub`. It
  has 3 `setSelectedClubState(...)` calls (lines ~39, ~42, ~46) plus
  `setIsLoading(false)`. Add a rationale comment above the effect and a
  `// eslint-disable-next-line react-hooks/set-state-in-effect` on each flagged
  `setState` line. Rationale text:
  ```
  // Client-only hydration: restore the selected club from localStorage on
  // mount (and when the clubs prop changes). Intentional setState-in-effect —
  // there is no SSR-safe lazy-init alternative for a localStorage read.
  ```
- **`components/DashboardShell.tsx:21`** — the mount effect reads
  `localStorage.getItem("sidebarCollapsed")` and calls `setSidebarCollapsed`.
  Same treatment: rationale comment + one
  `// eslint-disable-next-line react-hooks/set-state-in-effect`.

Only the specifically-flagged lines get a disable; the disables are
line-scoped (not file- or rule-wide), so they cannot mask a future
`set-state-in-effect` introduced elsewhere in these files.

## CI gate

- **`package.json`** — change `"lint": "eslint ."` to
  `"lint": "eslint . --max-warnings 0"`. `"lint:fix"` unchanged.
- **`.github/workflows/ci.yml`** — remove `continue-on-error: true` from the
  lint step and replace the "Lint is non-blocking…" comment + step name with a
  blocking version (e.g. name `Lint`). The step keeps running `npm run lint`,
  which now fails on any error or warning.

## Verification

1. `npx eslint .` → 0 problems.
2. `npm run lint` → exit 0 (proves `--max-warnings 0` passes).
3. `npx tsc --noEmit` → clean.
4. `npx vitest run` → 90 passing (no behavior change).
5. `npm run build` → clean (confirms the `useCallback` reorders didn't break
   any page).

## Follow-ups (not here)

- Migrating CI off Node 25 (non-LTS) — separate Low item, unaffected.
</content>
