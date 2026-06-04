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
