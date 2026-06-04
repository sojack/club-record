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
- [x] **No input validation at trust boundaries (admin APIs)** — added
  `lib/validation/parse.ts` (`parseJsonBody`) + co-located zod schemas;
  `api/admin/upload` (incl. the nested `records[]` array) and
  `api/admin/club-level` now reject malformed JSON / bad shapes with a
  structured **400** (was an uncaught 500 or a corrupt service-role insert).
  Auth (401/403) still precedes validation. The 3 hand-rolled `interface`s
  were replaced by `z.infer` types.
- [x] **Near-absent error handling — dashboard client (C2) + auth (C3)** —
  spec/plan `docs/superpowers/{specs,plans}/2026-06-03-error-handling-client-auth.*`.
  Added a shared `components/LoadError.tsx` (inline message + retry, the
  read-path analogue of the route boundaries). Every dashboard client loader
  (`dashboard`, `records` index, `records/[listId]`, `members`) now wraps its
  read in `try/catch/finally`, throws on the returned Supabase `error`, and
  renders `<LoadError>` instead of a false-empty / false-"not found" state.
  Every dashboard + auth mutation/auth handler (~20: bulk delete/export, list
  save/delete/CSV, member add/role/remove/transfer, settings, new list, new
  club, bulk upload, login, signup, forgot/reset password) is wrapped so a
  thrown error shows a generic message and the control re-enables (no frozen
  buttons). Signup now recovers from an orphaned-account club-insert failure
  (redirects to the dashboard instead of showing a raw DB error);
  reset-password guards its `getSession()` probe. Verified: `tsc` clean,
  `vitest` 73/73, `eslint` improved (13→8 problems, the immutability errors in
  the touched files cleared), `next build` clean. Component/page **tests** for
  these paths remain deferred — tracked under High #1.

## High

- [ ] **Component/page/auth test coverage — partial** — a jsdom + React
  Testing Library foundation now exists (`vitest.setup.ts`, per-file
  `// @vitest-environment jsdom` pragma; shared client mock in
  `lib/test/supabase-mock.ts`). The C2/C3 error-handling paths have
  representative coverage: `LoadError`, the read pattern + retry
  (`dashboard/page`), `members`' `error→loadError`, the mutation pattern
  (`login`, `settings`), signup orphaned-account recovery, and the
  reset-password session guard (spec/plan
  `docs/superpowers/{specs,plans}/2026-06-04-component-test-foundation.*`).
  **Still uncovered:** the large editors (`records/[listId]/page.tsx`,
  `components/RecordTable.tsx`), the CSV/bulk-upload UI, and the ~15 remaining
  identical mutation handlers — add coverage when those areas next change.

## Medium

- [ ] **Pre-existing lint failures (2 errors + 6 warnings)** — the 2 remaining
  errors are `react-hooks/set-state-in-effect` (synchronous `setState` in
  effects causing cascading renders) in `contexts/ClubContext.tsx:39` and
  `components/DashboardShell.tsx:21`. (The `react-hooks/immutability` errors in
  the dashboard pages were incidentally cleared by the C2 try/catch
  restructuring.) The 6 warnings are `exhaustive-deps` (loaders omitted from
  effect deps) + unused vars in `components/RecordTable.tsx` and
  `bulk-upload/page.tsx`. Lint is currently non-blocking in CI because of
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
- [x] **Duplicated `makeChain` supabase test mock** — extracted to
  `lib/test/supabase-mock.ts` (`makeChain`/`makeSupabase`/`pgError`, extended
  for `rpc`/`auth`/`insert`/`update`/`delete` and an `Error`-rejects path for
  simulating network throws); the 4 route test files now import it (−68 lines
  of duplication), and it backs the new component/auth tests too.
