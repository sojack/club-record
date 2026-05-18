# Technical Debt

Prioritized backlog of known software-development gaps. Each item: severity,
why it matters, and a checkbox. Spec for the first batch of work:
`docs/superpowers/specs/2026-05-18-test-foundation-and-gap-tracking-design.md`.

## Done

- [x] **No CI** — added `.github/workflows/ci.yml`. `tsc --noEmit` + `npm test`
  are hard gates; `npm run lint` runs non-blocking (`continue-on-error`) until
  the pre-existing lint debt below is cleared.
- [x] **No tests for `lib/time-utils.ts` / `lib/csv-parser.ts`** — Vitest
  foundation added; bugs B1, B2, B3, B3b fixed via TDD.
- [x] **Swallowed Supabase errors (public path)** — added `lib/supabase/guard.ts`
  (`unwrap` / `DataAccessError` / `dbErrorToResponse`). Public API routes
  (`api/clubs/[slug]`, `api/clubs/[slug]/records`) now return 500 on a real DB
  error and 404 only when genuinely missing; public pages/layout/embed throw
  to new `app/error.tsx` / `app/[clubSlug]/error.tsx` boundaries;
  `ClubRecordBrowser` shows an inline retry instead of a false-empty table.
  Reusable guard pattern for the remaining dashboard/admin work.

## High

- [ ] **No automated tests beyond `time-utils` / `csv-parser`** — the rest of
  the app (components, pages, API routes, auth) has zero coverage; regressions
  ship silently.
- [ ] **Near-absent error handling — dashboard/admin/auth (remaining)** — the
  public read path is now hardened via `lib/supabase/guard.ts` (see Done).
  The remaining ~30 unchecked Supabase calls in dashboard/admin/layout/auth
  still swallow errors; apply the same `unwrap` guard pattern there
  (tech-debt sub-project C).
- [ ] **Near-absent error handling** — only ~2 files use `try/catch`; most
  Supabase calls outside admin routes don't check `error`.
- [ ] **No input validation at trust boundaries** — CSV import and API routes
  accept untrusted input with hand-rolled checks; no schema validation
  (e.g. `zod`).

## Medium

- [ ] **Pre-existing lint failures (7 errors + 6 warnings)** — mostly
  `react-hooks/set-state-in-effect` (synchronous `setState` in effects causing
  cascading renders) in `contexts/ClubContext.tsx`,
  `components/DashboardShell.tsx`, `app/(dashboard)/dashboard/page.tsx`,
  `app/(dashboard)/dashboard/settings/page.tsx`,
  `app/(dashboard)/dashboard/members/page.tsx`; unused-var warnings in
  `components/RecordTable.tsx`. Lint is currently non-blocking in CI because of
  these. Fix them, then **promote `npm run lint` to a hard CI gate** (remove
  `continue-on-error` in `.github/workflows/ci.yml`).

- [ ] **No error tracking / observability** — no Sentry-equivalent, no
  structured logging (`console.*` count is 0); production failures are
  invisible.
- [ ] **Manual SQL migrations + hand-mirrored `types/database.ts`** — nothing
  guarantees prod schema == migrations == types; drift risk. Consider
  generated DB types.
- [ ] **Untested complexity hotspots** — `components/RecordTable.tsx` (~892
  LOC) and `app/(dashboard)/dashboard/records/[listId]/page.tsx` (~556 LOC)
  carry validation/mutation logic with no safety net for refactoring.
- [ ] **B4 — `normalizeDate` timezone-dependent fallback** — in
  `lib/csv-parser.ts`, the `new Date(trimmed)` fallback for free-form dates
  (e.g. `"Mar 15, 2024"`) can shift the day depending on the runtime
  timezone. Needs a deterministic date parser; not fixed in the first batch
  because a date-parsing rewrite is its own task.

## Low

- [ ] **Public records API: CORS `*` with no rate limiting**
  (`app/api/clubs/[slug]/records/route.ts`).
- [ ] **No env-var validation at startup** — missing/typo'd Supabase env vars
  fail late and opaquely.
- [ ] **No dependency/security scanning** — no Dependabot / `npm audit` in CI.
- [ ] **CI pinned to Node 25 (non-LTS)** — `.github/workflows/ci.yml` uses
  `node-version: 25` to match local. Node 25 is a current (odd) release, not
  LTS; if GitHub-hosted runners drop the distribution before migration, CI
  breaks with no code change. Migrate to an LTS line (e.g. 26 LTS) when
  convenient.
- [ ] **`docs/` is gitignored; `README.md` is near-empty** — onboarding /
  bus-factor gap.
- [ ] **`time-utils` residual edge limitations** (pre-existing, surfaced by
  the Task 4 review; B3/B3b already fixed): no minutes/seconds range check
  (`parseTimeToMs("1:60.00")` → 120000 instead of rejecting); zero-time
  round-trip is lossy (`parseTimeToMs("00:00.00")` → 0, `formatMsToTime(0)`
  → `""`); the malformed-form normalization regex is broad and can collapse a
  4-part garbage input ending in 2 digits (`"1:02:03:04"` → parsed). Low
  real-world risk for swim times; revisit if stricter validation is needed.
- [ ] **Public error UI polish** — `app/error.tsx` and
  `app/[clubSlug]/error.tsx` are near-identical; if a third boundary or a
  shared change appears, extract a small `ErrorBoundaryUI` component. Also
  consider a "Go Home" escape link and `useEffect` client-side logging once
  observability is addressed.
- [ ] **`ClubRecordBrowser.handleListChange` unguarded async** — rapid list
  switching can race (last-resolved fetch wins, not last-selected).
  Pre-existing; add an `AbortController`/request-id guard when revisiting.
