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
