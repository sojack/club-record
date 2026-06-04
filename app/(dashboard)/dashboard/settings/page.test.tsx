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
