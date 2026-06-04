# Component/Auth Test Foundation + C2/C3 Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a jsdom + React Testing Library foundation beside the existing node-only Vitest suites, extract the duplicated Supabase mock into one shared helper (retrofitting the 4 API-route tests), and add representative tests covering the C2/C3 error-handling paths.

**Architecture:** Keep `environment: "node"` as the Vitest default; component test files opt into jsdom via a per-file `// @vitest-environment jsdom` pragma. A shared `lib/test/supabase-mock.ts` provides a chainable, thenable Supabase mock (an `Error` value makes a query reject, to simulate network throws). Component tests mock `@/lib/supabase/client`, `@/contexts/ClubContext`, and `next/navigation`, render the page with RTL, and assert on rendered text.

**Tech Stack:** Vitest 4, React Testing Library, `@testing-library/jest-dom`, `@testing-library/user-event`, jsdom.

**Spec:** `docs/superpowers/specs/2026-06-04-component-test-foundation-design.md`

**Conventions for every task:**
- Run commands from `/Users/jackso/code/ClubRecordProject/club-record`.
- **Per-task gate:** the command(s) shown pass. Final gate (Task 10): `vitest run` + `tsc --noEmit` + `eslint`.
- **Commits are LOCAL ONLY. Never `git push`.** No `Co-Authored-By` trailer.
- These tests characterize ALREADY-IMPLEMENTED behavior, so a freshly written test is expected to **PASS** immediately (the code exists). That is correct here — the test is the deliverable. Where a step says "expected PASS", a FAIL means the test or mock is wrong, not the app.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `package.json` | Dev deps | Add jsdom + RTL deps |
| `vitest.config.ts` | Test config | Extend `include`, add `setupFiles` |
| `vitest.setup.ts` | Global test setup | **Create** (jest-dom matchers + RTL cleanup) |
| `lib/test/supabase-mock.ts` | Shared Supabase mock | **Create** |
| `components/LoadError.test.tsx` | LoadError unit test | **Create** |
| `app/(dashboard)/dashboard/page.test.tsx` | Read-pattern coverage | **Create** |
| `app/(dashboard)/dashboard/members/page.test.tsx` | error→loadError coverage | **Create** |
| `app/(auth)/login/page.test.tsx` | Mutation-pattern coverage | **Create** |
| `app/(dashboard)/dashboard/settings/page.test.tsx` | Dashboard-mutation coverage | **Create** |
| `app/(auth)/signup/page.test.tsx` | Orphaned-account coverage | **Create** |
| `app/(auth)/reset-password/page.test.tsx` | Session-guard coverage | **Create** |
| `app/api/clubs/[slug]/route.test.ts` | Retrofit to shared mock | Modify |
| `app/api/clubs/[slug]/records/route.test.ts` | Retrofit to shared mock | Modify |
| `app/api/admin/club-level/route.test.ts` | Retrofit to shared mock | Modify |
| `app/api/admin/upload/route.test.ts` | Retrofit to shared mock | Modify |
| `TECH_DEBT.md` | Debt tracker | Mark mock dedup + first test slice done |

---

## Task 1: Infrastructure + LoadError test

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `components/LoadError.test.tsx`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D jsdom@^27 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```
Expected: installs succeed; `package.json` devDependencies now include all four. (If a major version is unavailable, install the latest of that package and continue.)

- [ ] **Step 2: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 3: Update `vitest.config.ts`**

Replace the `test` block so it keeps node as default, widens the include globs, and registers the setup file:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

- [ ] **Step 4: Create `components/LoadError.test.tsx`**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoadError from "./LoadError";

describe("LoadError", () => {
  it("renders the default message and a retry button", () => {
    render(<LoadError onRetry={() => {}} />);
    expect(
      screen.getByText("We couldn't load this right now. Please try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders a custom message when provided", () => {
    render(<LoadError onRetry={() => {}} message="Custom failure text" />);
    expect(screen.getByText("Custom failure text")).toBeInTheDocument();
  });

  it("calls onRetry when the button is clicked", async () => {
    const onRetry = vi.fn();
    render(<LoadError onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5: Run the new test**

Run: `npx vitest run components/LoadError.test.tsx`
Expected: 3 passed. (Proves jsdom + RTL + the pragma + setup file all work.)

- [ ] **Step 6: Confirm the node suites still pass**

Run: `npx vitest run`
Expected: all prior 73 tests + 3 new = 76 passed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts components/LoadError.test.tsx
git commit -m "test: add jsdom + RTL foundation with LoadError tests"
```

---

## Task 2: Shared Supabase mock helper

**Files:**
- Create: `lib/test/supabase-mock.ts`

- [ ] **Step 1: Create `lib/test/supabase-mock.ts`**

```ts
import { vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";

/** A query outcome. An `Error` value makes the query REJECT (simulates a
 *  network/transport throw); any other value RESOLVES (a normal
 *  `{ data, error }` Supabase result). */
export type QueryResult = { data?: unknown; error: unknown };
export type Outcome = QueryResult | Error;

const CHAIN_METHODS = [
  "select",
  "eq",
  "order",
  "limit",
  "in",
  "insert",
  "update",
  "delete",
  "upsert",
] as const;

function settle(outcome: Outcome): Promise<QueryResult> {
  return outcome instanceof Error
    ? Promise.reject(outcome)
    : Promise.resolve(outcome);
}

/** A chainable, thenable Supabase query-builder mock. Builder methods return
 *  the same chain; `single`/`maybeSingle`/awaiting the chain settle `outcome`. */
export function makeChain(outcome: Outcome) {
  const chain: Record<string, unknown> = {};
  for (const m of CHAIN_METHODS) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn(() => settle(outcome));
  chain.maybeSingle = vi.fn(() => settle(outcome));
  chain.then = (
    onF: (v: QueryResult) => unknown,
    onR?: (e: unknown) => unknown
  ) => settle(outcome).then(onF, onR);
  return chain;
}

/** A Supabase-client-shaped mock. `from(table)` resolves the table's configured
 *  outcome; `rpc(fn)` resolves the rpc's; `auth` is passed through as-is. */
export function makeSupabase(
  byTable: Record<string, Outcome> = {},
  opts: {
    rpc?: Record<string, Outcome>;
    auth?: Record<string, unknown>;
  } = {}
) {
  return {
    from: vi.fn((t: string) => makeChain(byTable[t] ?? { data: null, error: null })),
    rpc: vi.fn((fn: string) => settle(opts.rpc?.[fn] ?? { data: null, error: null })),
    auth: opts.auth ?? {},
  };
}

/** A canned PostgrestError for "returned error" cases. */
export const pgError = { message: "boom", code: "XX000" } as unknown as PostgrestError;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/test/supabase-mock.ts
git commit -m "test: extract shared Supabase mock helper"
```

---

## Task 3: Retrofit the 4 API-route tests

**Files:**
- Modify: `app/api/clubs/[slug]/route.test.ts`
- Modify: `app/api/clubs/[slug]/records/route.test.ts`
- Modify: `app/api/admin/club-level/route.test.ts`
- Modify: `app/api/admin/upload/route.test.ts`

Goal: each file imports `makeChain`/`makeSupabase`/`pgError` from `@/lib/test/supabase-mock` instead of defining its own. **Read each file first.** Behavior and assertions stay identical — only the mock-construction source moves.

- [ ] **Step 1: `app/api/clubs/[slug]/route.test.ts`**

Delete the local `type QueryResult`, `function makeChain`, `function makeSupabase`, and `const pgError` definitions. Add, after the existing imports:

```ts
import { makeSupabase, pgError } from "@/lib/test/supabase-mock";
```

Leave everything else (the `vi.mock("@/lib/supabase/server", ...)`, `mockDb`, the canned `club`/`list` objects, and all `it(...)` blocks) unchanged. `mockDb` keeps calling `makeSupabase(byTable)`.

- [ ] **Step 2: `app/api/clubs/[slug]/records/route.test.ts`**

Same change: delete the local `QueryResult`/`makeChain`/`makeSupabase`/`pgError`, add `import { makeSupabase, pgError } from "@/lib/test/supabase-mock";`. Everything else unchanged.

- [ ] **Step 3: `app/api/admin/club-level/route.test.ts`**

This file builds its server (`auth.getUser`) + admin clients inline. Delete only the local `function makeChain` and (if present) local `pgError`, and add:

```ts
import { makeChain, pgError } from "@/lib/test/supabase-mock";
```

Keep the inline mock-wiring that uses `makeChain(...)` for the admin `from`. (The shared `makeChain` supports `select/eq/insert/update/order/limit` and more, so it is a superset of the local one.) If the file did not define `pgError`, omit it from the import.

- [ ] **Step 4: `app/api/admin/upload/route.test.ts`**

Same as Step 3: delete the local `function makeChain` (and local `pgError` if present), add `import { makeChain, pgError } from "@/lib/test/supabase-mock";` (drop `pgError` from the import if the file doesn't use it). Keep the inline server/admin wiring.

- [ ] **Step 5: Run the API-route suites**

Run: `npx vitest run app/api`
Expected: the same number of API-route tests as before, all passing (no behavior change).

- [ ] **Step 6: Full suite**

Run: `npx vitest run`
Expected: 76 passed (73 original + 3 LoadError), green.

- [ ] **Step 7: Commit**

```bash
git add "app/api/clubs/[slug]/route.test.ts" "app/api/clubs/[slug]/records/route.test.ts" "app/api/admin/club-level/route.test.ts" "app/api/admin/upload/route.test.ts"
git commit -m "test: use shared Supabase mock in API-route tests (dedup)"
```

---

## Task 4: `dashboard/page.test.tsx` — read pattern

**Files:**
- Create: `app/(dashboard)/dashboard/page.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/contexts/ClubContext", () => ({ useClub: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import { makeSupabase, pgError } from "@/lib/test/supabase-mock";
import DashboardPage from "./page";

const club = {
  id: "club-1",
  slug: "uac",
  short_name: "UAC",
  full_name: "Uptown Aquatic Club",
  logo_url: null,
};

const list = {
  id: "list-1",
  title: "SCM Male Records",
  course_type: "SCM",
  slug: "scm-male",
  records: [{ count: 5 }],
};

function mockClub() {
  vi.mocked(useClub).mockReturnValue({
    selectedClub: club,
    setSelectedClub: vi.fn(),
    isLoading: false,
    isOwner: true,
    isEditor: false,
    canEdit: true,
  } as unknown as ReturnType<typeof useClub>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockClub();
});

describe("DashboardPage", () => {
  it("renders record lists on a successful load", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ record_lists: { data: [list], error: null } }) as unknown as ReturnType<typeof createClient>
    );

    render(<DashboardPage />);

    expect(await screen.findByText("Welcome, Uptown Aquatic Club")).toBeInTheDocument();
    expect(screen.getByText("SCM Male Records")).toBeInTheDocument();
  });

  it("shows LoadError (not the empty state) when the read returns an error", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ record_lists: { data: null, error: pgError } }) as unknown as ReturnType<typeof createClient>
    );

    render(<DashboardPage />);

    expect(
      await screen.findByText("We couldn't load this right now. Please try again.")
    ).toBeInTheDocument();
    expect(screen.queryByText("No record lists yet.")).not.toBeInTheDocument();
  });

  it("retries the load when 'Try again' is clicked", async () => {
    vi.mocked(createClient)
      .mockReturnValueOnce(
        makeSupabase({ record_lists: { data: null, error: pgError } }) as unknown as ReturnType<typeof createClient>
      )
      .mockReturnValue(
        makeSupabase({ record_lists: { data: [list], error: null } }) as unknown as ReturnType<typeof createClient>
      );

    render(<DashboardPage />);

    const retry = await screen.findByRole("button", { name: "Try again" });
    await userEvent.click(retry);

    await waitFor(() =>
      expect(screen.getByText("SCM Male Records")).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run "app/(dashboard)/dashboard/page.test.tsx"`
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/page.test.tsx"
git commit -m "test(dashboard): cover record-list read pattern + retry"
```

---

## Task 5: `members/page.test.tsx` — error→loadError

**Files:**
- Create: `app/(dashboard)/dashboard/members/page.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/contexts/ClubContext", () => ({ useClub: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import { useRouter } from "next/navigation";
import { makeSupabase, pgError } from "@/lib/test/supabase-mock";
import MembersPage from "./page";

const club = {
  id: "club-1",
  slug: "uac",
  short_name: "UAC",
  full_name: "Uptown Aquatic Club",
  logo_url: null,
};

const member = {
  id: "m-1",
  user_id: "u-1",
  email: "owner@example.com",
  role: "owner",
  created_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(useRouter).mockReturnValue({
    push: vi.fn(),
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  vi.mocked(useClub).mockReturnValue({
    selectedClub: club,
    setSelectedClub: vi.fn(),
    isLoading: false,
    isOwner: true,
    isEditor: false,
    canEdit: true,
  } as unknown as ReturnType<typeof useClub>);
});

describe("MembersPage", () => {
  it("renders members on a successful load", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({}, { rpc: { get_club_members_with_email: { data: [member], error: null } } }) as unknown as ReturnType<typeof createClient>
    );

    render(<MembersPage />);

    expect(await screen.findByText("owner@example.com")).toBeInTheDocument();
  });

  it("shows LoadError when the members RPC returns an error", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({}, { rpc: { get_club_members_with_email: { data: null, error: pgError } } }) as unknown as ReturnType<typeof createClient>
    );

    render(<MembersPage />);

    expect(
      await screen.findByText("We couldn't load this right now. Please try again.")
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run "app/(dashboard)/dashboard/members/page.test.tsx"`
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/members/page.test.tsx"
git commit -m "test(dashboard): cover members error->loadError conversion"
```

---

## Task 6: `login/page.test.tsx` — mutation pattern

**Files:**
- Create: `app/(auth)/login/page.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { makeSupabase } from "@/lib/test/supabase-mock";
import LoginPage from "./page";

const push = vi.fn();
const refresh = vi.fn();

function mockClient(signInWithPassword: ReturnType<typeof vi.fn>) {
  vi.mocked(createClient).mockReturnValue(
    makeSupabase({}, { auth: { signInWithPassword } }) as unknown as ReturnType<typeof createClient>
  );
}

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
  await userEvent.type(screen.getByLabelText("Password"), "secret1");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  push.mockClear();
  refresh.mockClear();
  vi.mocked(useRouter).mockReturnValue({ push, refresh } as unknown as ReturnType<typeof useRouter>);
});

describe("LoginPage", () => {
  it("navigates to the dashboard on success", async () => {
    mockClient(vi.fn().mockResolvedValue({ error: null }));
    render(<LoginPage />);
    await fillAndSubmit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows the returned error message and re-enables the button", async () => {
    mockClient(vi.fn().mockResolvedValue({ error: { message: "Invalid login credentials" } }));
    render(<LoginPage />);
    await fillAndSubmit();
    expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a generic message and re-enables the button when the call throws", async () => {
    mockClient(vi.fn().mockRejectedValue(new Error("network down")));
    render(<LoginPage />);
    await fillAndSubmit();
    expect(
      await screen.findByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run "app/(auth)/login/page.test.tsx"`
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/login/page.test.tsx"
git commit -m "test(auth): cover login mutation pattern (success/error/throw)"
```

---

## Task 7: `settings/page.test.tsx` — dashboard mutation

**Files:**
- Create: `app/(dashboard)/dashboard/settings/page.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/contexts/ClubContext", () => ({ useClub: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import { useRouter } from "next/navigation";
import { makeSupabase } from "@/lib/test/supabase-mock";
import SettingsPage from "./page";

const club = {
  id: "club-1",
  slug: "uac",
  short_name: "UAC",
  full_name: "Uptown Aquatic Club",
  logo_url: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(useRouter).mockReturnValue({
    push: vi.fn(),
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  vi.mocked(useClub).mockReturnValue({
    selectedClub: club,
    setSelectedClub: vi.fn(),
    isLoading: false,
    isOwner: true,
    isEditor: false,
    canEdit: true,
  } as unknown as ReturnType<typeof useClub>);
});

describe("SettingsPage", () => {
  it("shows a generic message and re-enables Save when the update throws", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ clubs: new Error("network down") }) as unknown as ReturnType<typeof createClient>
    );

    render(<SettingsPage />);

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(
      await screen.findByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled()
    );
  });

  it("shows a success message when the update succeeds", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ clubs: { error: null } }) as unknown as ReturnType<typeof createClient>
    );

    render(<SettingsPage />);

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(
      await screen.findByText("Settings saved successfully!")
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run "app/(dashboard)/dashboard/settings/page.test.tsx"`
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/settings/page.test.tsx"
git commit -m "test(dashboard): cover settings mutation throw + success"
```

---

## Task 8: `signup/page.test.tsx` — orphaned-account recovery

**Files:**
- Create: `app/(auth)/signup/page.test.tsx`

The signup form has two steps. The credentials step requires a password ≥ 6 chars, then "Continue" advances to the club step where "Create Club" calls `handleClubSubmit`.

- [ ] **Step 1: Write the test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { makeSupabase } from "@/lib/test/supabase-mock";
import SignupPage from "./page";

const push = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  push.mockClear();
  vi.mocked(useRouter).mockReturnValue({
    push,
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
});

describe("SignupPage — orphaned-account recovery", () => {
  it("redirects to the dashboard (no raw DB error) when the club insert fails", async () => {
    // signUp succeeds (user present); clubs.insert returns an error.
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(
        { clubs: { data: null, error: { message: "duplicate key value", code: "23505" } } },
        { auth: { signUp: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } }, error: null }) } }
      ) as unknown as ReturnType<typeof createClient>
    );

    render(<SignupPage />);

    // Credentials step.
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Club step.
    await userEvent.type(screen.getByLabelText(/Short Name/), "UAC");
    await userEvent.type(screen.getByLabelText(/Full Name/), "Uptown Aquatic Club");
    await userEvent.click(screen.getByRole("button", { name: "Create Club" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText(/duplicate key value/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run "app/(auth)/signup/page.test.tsx"`
Expected: 1 passed. If the slug field's label match is ambiguous, the `Short Name`/`Full Name` regex matches are sufficient (the slug auto-fills from short name); do not add a slug interaction unless the form rejects submission without it (it auto-fills, so it should not).

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/signup/page.test.tsx"
git commit -m "test(auth): cover signup orphaned-account recovery"
```

---

## Task 9: `reset-password/page.test.tsx` — session guard

**Files:**
- Create: `app/(auth)/reset-password/page.test.tsx`

The page becomes "ready" (shows the form) when `getSession()` resolves a session, when `PASSWORD_RECOVERY`/`SIGNED_IN` fires, or after a 3s fallback timeout. For the submit cases, mock `getSession` to resolve a session so the form renders immediately. For the rejection case, use fake timers to advance past the 3s fallback.

- [ ] **Step 1: Write the test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { makeSupabase } from "@/lib/test/supabase-mock";
import ResetPasswordPage from "./page";

function authStub(extra: Record<string, unknown>) {
  return {
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    ...extra,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(useRouter).mockReturnValue({
    push: vi.fn(),
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
});

describe("ResetPasswordPage", () => {
  it("still renders the form (via the 3s fallback) when getSession rejects", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(createClient).mockReturnValue(
        makeSupabase({}, {
          auth: authStub({ getSession: vi.fn().mockRejectedValue(new Error("no session")) }),
        }) as unknown as ReturnType<typeof createClient>
      );

      render(<ResetPasswordPage />);
      await vi.advanceTimersByTimeAsync(3000);

      expect(screen.getByRole("button", { name: "Update password" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the success view when the password update succeeds", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({}, {
        auth: authStub({
          getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u-1" } } } }),
          updateUser: vi.fn().mockResolvedValue({ error: null }),
        }),
      }) as unknown as ReturnType<typeof createClient>
    );

    render(<ResetPasswordPage />);

    const pw = await screen.findByLabelText("New Password");
    await userEvent.type(pw, "secret1");
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("shows a generic message when updateUser throws", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({}, {
        auth: authStub({
          getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u-1" } } } }),
          updateUser: vi.fn().mockRejectedValue(new Error("network down")),
        }),
      }) as unknown as ReturnType<typeof createClient>
    );

    render(<ResetPasswordPage />);

    const pw = await screen.findByLabelText("New Password");
    await userEvent.type(pw, "secret1");
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(
      await screen.findByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run "app/(auth)/reset-password/page.test.tsx"`
Expected: 3 passed. Note: the success/throw tests use real timers; only the first test uses fake timers (scoped + restored in `finally`).

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/reset-password/page.test.tsx"
git commit -m "test(auth): cover reset-password session guard + submit paths"
```

---

## Task 10: Verify + update TECH_DEBT

**Files:**
- Modify: `TECH_DEBT.md`

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all green. Count = 73 original + 3 (LoadError) + 3 (dashboard) + 2 (members) + 3 (login) + 2 (settings) + 1 (signup) + 3 (reset-password) = **90 passed**.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Lint did not regress**

Run: `npx eslint . 2>&1 | tail -3`
Expected: still `8 problems (2 errors, 6 warnings)` (the pre-existing backlog). If it went up, a test file introduced a violation (e.g. an unused import) — fix it.

- [ ] **Step 4: Update `TECH_DEBT.md`**

Two edits:
1. In `## High`, update the "No automated tests beyond `time-utils` / `csv-parser`" item: note that a jsdom + RTL foundation now exists and the C2/C3 error-handling paths have representative coverage (`LoadError`, the read pattern, the mutation pattern, members' `error→loadError`, signup orphan recovery, reset-password session guard); the large editors (`records/[listId]`, `RecordTable`) and the remaining mutation handlers stay uncovered.
2. In `## Low`, mark the "Duplicated `makeChain` supabase test mock" item **done** — extracted to `lib/test/supabase-mock.ts` and the 4 route tests retrofitted. Move it to `## Done` (or strike it) with a one-line note.

- [ ] **Step 5: Commit**

```bash
git add TECH_DEBT.md
git commit -m "docs: record test foundation + mock dedup in TECH_DEBT"
```

---

## Self-Review Notes (for the executor)

- **These tests characterize existing behavior** — a new test should pass on first run. A failure means the test/mock is wrong (e.g. a label string mismatch), not the app. Fix the test.
- **`getByLabelText` depends on `<label htmlFor>`/`id` pairing** — all the target inputs in these pages have matching `id`s (`email`, `password`, `shortName`, `fullName`, etc.). If a label match fails, read the component's exact label text and adjust the query string only.
- **Fake timers are scoped** to the single reset-password test that needs them and restored in a `finally`; the other tests use real timers. Do not enable fake timers globally — `user-event` interactions in the other tests would hang.
- **`makeSupabase` rejects on an `Error` value** (network-throw simulation) and resolves on a `{ data, error }` value (normal Supabase result). Use the right one per case.
- **Lint gate is "no regression"** (still 8 problems), not zero — the 2 pre-existing `set-state-in-effect` errors are out of scope.
```
