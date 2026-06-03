# Design: Error handling — dashboard client components (C2) + auth flows (C3)

**Date:** 2026-06-03
**Status:** Approved
**Topic:** Close the remaining "near-absent error handling" tech-debt (High #2/#3)
for the client-rendered dashboard pages and the auth flows. Read paths stop
silently rendering empty states on DB failure; mutation/auth handlers stop
freezing their buttons on a thrown (network/transport) error.

## Context

Sub-project A hardened the public path; B added admin API input validation; C1
hardened the dashboard/admin **server** reads. The decomposition left two
slices of the "near-absent error handling" debt open:

- **C2** — the ~5 dashboard **client** page components. Their `useEffect`
  loaders discard the returned Supabase `error` (e.g.
  `app/(dashboard)/dashboard/page.tsx:28-34`,
  `app/(dashboard)/dashboard/records/page.tsx:42-46`), so a DB outage renders
  as a legitimate-looking empty state ("No record lists yet."). None of the
  awaits are wrapped, so a *thrown* error is an unhandled rejection.
- **C3** — the auth flows. Returned `{error}` values are mostly handled, but no
  await is wrapped in `try/catch`, so a thrown/network error leaves the submit
  button frozen on "Creating…" / "Updating…" with no feedback.

Both slices share the same root cause (unwrapped awaits) and the same fix
shape, so they are designed together here as one cohesive change.

## Goals

1. A DB read failure in a dashboard client page shows an inline error + retry,
   never a false-empty state.
2. A thrown error in any dashboard or auth mutation handler shows an inline
   message and re-enables the control (no frozen buttons).
3. The returned-`{error}` UX that already works (e.g. "Invalid login
   credentials") is preserved unchanged.
4. `tsc --noEmit` and the existing `vitest run` stay green.

## Non-goals (out of scope — logged in `TECH_DEBT.md`, not done here)

- jsdom / React Testing Library and any component/page/auth **tests** (deferred
  Theme B — this round is verified manually).
- Server reads (C1, done), the public path (A, done), admin APIs (B, done).
- The ESLint backlog (`TODO.md`) and the large-file hotspots — not refactored
  beyond the edits these changes require.
- Observability / structured logging beyond the existing `console.error`
  convention.

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Read-path error UX | A shared presentational `components/LoadError.tsx` (message + "Try again"), reused across the dashboard loaders — not per-component inline JSX |
| D2 | Depth | Reads **and** thrown-error wrapping: read paths get `<LoadError>` + retry; every mutation/auth await gets `try/catch/finally` so buttons never freeze |
| D3 | Tests | Deferred (Theme B infra not pulled forward). Manual verification this round |
| D4 | Thrown-error message | Generic user-facing string ("Something went wrong. Please try again.") — no raw `error.message` leaked from thrown/transport errors. Existing returned-`{error}.message` strings are kept |

## Design

### §1. Shared component — `components/LoadError.tsx`

New `"use client"` presentational component, styled to match the existing
`app/error.tsx` boundary (dark-mode aware, same button styling). The read-path
analogue of a route error boundary for components that fetch in `useEffect`.

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

### §2. Read-path pattern (loaders)

Each loader gains a `loadError` boolean state. The body is wrapped so both the
returned `error` and a thrown error land in one place:

```ts
const [loadError, setLoadError] = useState(false);

const loadX = async () => {
  if (!selectedClub) return;
  setLoading(true);
  setLoadError(false);
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("…").select("…")…;
    if (error) throw error;
    // …existing state-setting from `data`…
  } catch (e) {
    console.error("[data-access] dashboard: <context>", e);
    setLoadError(true);
  } finally {
    setLoading(false);
  }
};
```

Render: when `loadError && !loading`, return `<LoadError onRetry={loadX} />`
**instead of** the empty-state block. Genuine empty (`data === []`) still shows
the existing "No … yet" copy. Secondary, intentionally-degradable reads (the
`recRows` freshness query in `records/page.tsx`) keep their current
swallow-and-fallback behavior — they are not promoted to `loadError`.

### §3. Mutation-path pattern (handlers)

Wrap each handler body in `try/catch/finally`:

```ts
const handleX = async (…) => {
  setError(null);        // where the component has an error slot
  setLoading(true);
  try {
    const { error } = await supabase…;
    if (error) {         // existing returned-error handling, unchanged
      setError(error.message);
      return;
    }
    // …success path…
  } catch (e) {
    console.error("[mutation] dashboard: <context>", e);
    setError("Something went wrong. Please try again.");
  } finally {
    setLoading(false);   // + any isDeleting / progress flags
  }
};
```

The `finally` guarantees the control is re-enabled even on a thrown error
(the current bug: the `setLoading(false)` lines only run on the handled
branches). The early `return` inside `try` still runs `finally`.

### §4. C2 inventory — dashboard client components

| File | Read path → `<LoadError>` | Mutation handlers → try/catch/finally |
|------|---------------------------|----------------------------------------|
| `app/(dashboard)/dashboard/page.tsx` | `loadRecordLists` | — |
| `app/(dashboard)/dashboard/records/page.tsx` | `loadRecordLists` (primary; `recRows` stays degradable) | `handleBulkDelete`, `handleExportCSV` |
| `app/(dashboard)/dashboard/records/[listId]/page.tsx` | `loadData` | `handleSaveRecords`, `handleDeleteRecord`, `handleCSVUpload`, `handleUpdateList`, `handleDeleteList` |
| `app/(dashboard)/dashboard/members/page.tsx` | `loadMembers` | `handleAddMember`, `handleRoleChange`, `handleRemoveMember`, `handleTransferOwnership` |
| `app/(dashboard)/dashboard/settings/page.tsx` | — (reads `selectedClub` from context) | `handleSubmit` |
| `app/(dashboard)/dashboard/records/new/page.tsx` | — | `handleSubmit` |
| `app/(dashboard)/dashboard/records/bulk-upload/page.tsx` | — | `handleFileSelect`, `handleUpload` |
| `app/(dashboard)/dashboard/clubs/new/page.tsx` | — | `handleSubmit` |

`contexts/ClubContext.tsx` and `components/DashboardShell.tsx` do **no** client
Supabase reads (clubs arrive as props from the server layout) — out of scope.

For handlers that today have no `error` display slot (e.g. a destructive action
that only `console`s), reuse the component's existing error UI if present;
where none exists, add a minimal inline message using the same red-box styling
already used across these pages. No handler is left able to throw past the
`finally`.

### §5. C3 inventory — auth flows

| File | Change |
|------|--------|
| `app/(auth)/signup/page.tsx` | try/catch/finally on `handleSkip` + `handleClubSubmit`. **Orphaned-account fix:** when `signUp` succeeds but `clubs.insert` fails, the message tells the user the account was created and the club can be set up later from the dashboard — not a raw `clubError.message`. `handleCredentialsSubmit` has no await (validation only) — unchanged |
| `app/(auth)/reset-password/page.tsx` | try/catch/finally on `handleSubmit`; add `.catch` to the `getSession().then()` probe (currently an unhandled-rejection risk — the existing 3s timeout already reveals the form, so the catch just logs) |
| `app/(auth)/login/page.tsx` | try/catch/finally on `handleSubmit` (thrown/network → generic message instead of frozen button) |
| `app/(auth)/forgot-password/page.tsx` | try/catch/finally on `handleSubmit` (same) |

Returned auth `{error}.message` strings (e.g. "Invalid login credentials") are
user-meaningful and kept. Only thrown/transport errors get the generic D4
message.

### §6. Error messages

- **Reads:** the generic `<LoadError>` default copy (§1). No per-call message.
- **Mutations/auth, thrown:** `"Something went wrong. Please try again."`
  (D4). Defined inline at each catch — a one-line constant repeated ~20×; not
  worth a shared helper (YAGNI), and keeping it inline avoids a new import in
  every page. If a third distinct message need appears later, revisit.
- **Mutations/auth, returned `{error}`:** unchanged.

## Verification (manual)

1. `npx tsc --noEmit` — clean.
2. `npx vitest run` — existing suites stay green (no test changes this round).
3. Smoke, per the established pattern:
   - DB reachable → every page behaves exactly as before (no visible change).
   - Force a read failure (e.g. temporarily point at a bad table/key) → the
     page shows `<LoadError>` + "Try again"; retry recovers once the read
     succeeds.
   - Force a mutation throw (offline / network blocked) → the handler shows the
     inline generic message and the button is re-enabled (not frozen).

## Follow-ups (logged, not done here)

- Component/page/auth tests once Theme B (jsdom + RTL) lands — these hardened
  paths are the natural first targets.
- The TECH_DEBT "Public error UI polish" item notes near-identical boundaries;
  `LoadError` is a separate (read-path, client) concern and is not merged with
  the route boundaries here.
</content>
</invoke>
