// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/contexts/ClubContext", () => ({ useClub: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn(), useParams: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import { useRouter, useParams } from "next/navigation";
import { makeSupabase, pgError } from "@/lib/test/supabase-mock";
import ListDetailPage from "./page";

const club = { id: "club-1", slug: "uac", short_name: "UAC", full_name: "Uptown Aquatic Club", logo_url: null };

const listRow = {
  id: "list-1",
  club_id: "club-1",
  title: "SCM Male Records",
  slug: "scm-male",
  course_type: "SCM",
  gender: "male",
  record_type: "individual",
  scope: "club",
  updated_at: "2026-01-01T00:00:00Z",
};

const recordRow = {
  id: "r1",
  record_list_id: "list-1",
  event_name: "50 Free",
  time_ms: 24560,
  swimmer_name: "John Smith",
  swimmer_name_2: null, swimmer_name_3: null, swimmer_name_4: null,
  age_group: null, record_club: null, province: null,
  record_date: null, location: null, sort_order: 0,
  is_national: false, is_current_national: false, is_provincial: false,
  is_current_provincial: false, is_split: false, is_relay_split: false,
  is_new: false, is_world_record: false, superseded_by: null, is_current: true,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

const push = vi.fn();

function mockClient(sb: ReturnType<typeof makeSupabase>) {
  vi.mocked(createClient).mockReturnValue(sb as unknown as ReturnType<typeof createClient>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  push.mockClear();
  vi.mocked(useRouter).mockReturnValue({ push, refresh: vi.fn() } as unknown as ReturnType<typeof useRouter>);
  vi.mocked(useParams).mockReturnValue({ listId: "list-1" } as unknown as ReturnType<typeof useParams>);
  vi.mocked(useClub).mockReturnValue({
    selectedClub: club, setSelectedClub: vi.fn(), isLoading: false,
    isOwner: true, isEditor: false, canEdit: true,
  } as unknown as ReturnType<typeof useClub>);
});

describe("ListDetailPage", () => {
  it("renders the list and its records on a successful load", async () => {
    mockClient(makeSupabase({
      record_lists: { data: listRow, error: null },
      records: { data: [recordRow], error: null },
      standard_age_groups: { data: [], error: null },
      standard_events: { data: [], error: null },
    }));

    render(<ListDetailPage />);

    expect(await screen.findByText("SCM Male Records")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("John Smith")).toBeInTheDocument();
  });

  it("shows LoadError when the list read errors", async () => {
    mockClient(makeSupabase({
      record_lists: { data: null, error: pgError },
      records: { data: [], error: null },
    }));

    render(<ListDetailPage />);

    expect(await screen.findByText("We couldn't load this right now. Please try again.")).toBeInTheDocument();
  });

  it("shows 'Record list not found' when the list genuinely does not exist", async () => {
    mockClient(makeSupabase({
      record_lists: { data: null, error: null },
      records: { data: [], error: null },
      standard_age_groups: { data: [], error: null },
      standard_events: { data: [], error: null },
    }));

    render(<ListDetailPage />);

    expect(await screen.findByText("Record list not found")).toBeInTheDocument();
  });

  it("deletes the list and navigates away on confirm", async () => {
    const sb = makeSupabase({
      record_lists: { data: listRow, error: null },
      records: { data: [recordRow], error: null },
      standard_age_groups: { data: [], error: null },
      standard_events: { data: [], error: null },
    });
    mockClient(sb);

    render(<ListDetailPage />);
    await screen.findByText("SCM Male Records");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/Are you sure you want to delete/)).toBeInTheDocument();

    const deletes = screen.getAllByRole("button", { name: "Delete" });
    await userEvent.click(deletes[deletes.length - 1]);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/records"));
    expect(sb.from).toHaveBeenCalledWith("record_lists");
  });
});
